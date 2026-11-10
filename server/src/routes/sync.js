import { Router } from 'express'
import { authRequired } from '../middleware/auth.js'
import { assertBranchAccess, resolveBranchId } from '../utils/branchScope.js'
import SyncCursor from '../models/SyncCursor.js'
import Sale from '../models/Sale.js'
import Kot from '../models/Kot.js'
import Recall from '../models/Recall.js'
import Expense from '../models/Expense.js'
import Staff from '../models/Staff.js'
import Attendance from '../models/Attendance.js'
import CallCenterOrder from '../models/CallCenterOrder.js'
import WarehouseTransfer from '../models/WarehouseTransfer.js'
import Ingredient from '../models/Ingredient.js'
import Demand from '../models/Demand.js'
import Customer from '../models/Customer.js'
import MenuItem from '../models/MenuItem.js'
import Category from '../models/Category.js'
import BranchMenuOverride from '../models/BranchMenuOverride.js'
import BranchCategoryOverride from '../models/BranchCategoryOverride.js'
import { mergeCallCenterOrder } from '../utils/syncMerge.js'

const router = Router()
router.use(authRequired)

/**
 * Collections that sync with branch scope.
 * Shared: customers, menu, categories (pull-only to branch; HQ writes on cloud).
 */
const BRANCH_MODELS = {
  sales: Sale,
  kots: Kot,
  recalls: Recall,
  expenses: Expense,
  staff: Staff,
  attendance: Attendance,
  callCenterOrders: CallCenterOrder,
  warehouseTransfers: WarehouseTransfer,
  ingredients: Ingredient,
  demands: Demand,
  menuOverrides: BranchMenuOverride,
  categoryOverrides: BranchCategoryOverride,
}

const SHARED_MODELS = {
  customers: Customer,
  // menu handled specially — shared items only (no branchId)
  categories: Category,
}

function sinceDate(since) {
  if (!since) return new Date(0)
  const d = new Date(since)
  return Number.isFinite(d.getTime()) ? d : new Date(0)
}

/** Pull changes for a branch (+ shared catalogs) since timestamp */
router.get('/pull', async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req, { required: true })
    assertBranchAccess(req, branchId)
    const since = sinceDate(req.query.since)
    const deviceId = String(req.query.deviceId || 'default')

    const data = {}
    for (const [name, Model] of Object.entries(BRANCH_MODELS)) {
      const q = {
        branchId: String(branchId),
        updatedAt: { $gt: since },
      }
      // Call-center + transfers: also pull by toBranchId / branchId
      if (name === 'warehouseTransfers') {
        q.$or = [{ toBranchId: String(branchId) }]
        delete q.branchId
        q.updatedAt = { $gt: since }
      }
      data[name] = await Model.find(q).sort({ updatedAt: 1 }).limit(500).lean()
    }
    for (const [name, Model] of Object.entries(SHARED_MODELS)) {
      // Shared catalogs can be large — pull full delta, not a 500 cap
      data[name] = await Model.find({ updatedAt: { $gt: since } }).sort({ updatedAt: 1 }).limit(5000).lean()
    }

    // Shared menu items (branchId empty) + this branch's own items
    data.menu = await MenuItem.find({
      updatedAt: { $gt: since },
      $or: [
        { branchId: '' },
        { branchId: null },
        { branchId: { $exists: false } },
        { branchId: String(branchId) },
      ],
    }).sort({ updatedAt: 1 }).limit(5000).lean()

    const now = new Date()
    for (const name of [...Object.keys(BRANCH_MODELS), ...Object.keys(SHARED_MODELS), 'menu']) {
      await SyncCursor.findOneAndUpdate(
        { branchId: String(branchId), collectionName: name, deviceId },
        { $set: { lastPulledAt: now } },
        { upsert: true }
      )
    }

    res.json({ ok: true, branchId, since: since.toISOString(), serverTime: now.toISOString(), data })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/**
 * Push local branch docs up to cloud.
 * Body: { branchId, deviceId, docs: { sales: [...], kots: [...], ... } }
 * Upserts by _id when present; otherwise creates.
 */
router.post('/push', async (req, res, next) => {
  try {
    const branchId = String(req.body?.branchId || resolveBranchId(req) || '').trim()
    if (!branchId) return res.status(400).json({ error: 'branchId required' })
    assertBranchAccess(req, branchId)
    const deviceId = String(req.body?.deviceId || 'default')
    const docs = req.body?.docs || {}
    const results = {}

    for (const [name, Model] of Object.entries(BRANCH_MODELS)) {
      const rows = Array.isArray(docs[name]) ? docs[name] : []
      let upserted = 0
      for (const row of rows) {
        const id = row._id || row.id
        const clean = { ...row }
        delete clean.__v
        delete clean.id
        // Force branch ownership (except transfers use toBranchId)
        if (name === 'warehouseTransfers') {
          clean.toBranchId = clean.toBranchId || branchId
        } else if (name === 'callCenterOrders') {
          // Keep original branch; never overwrite with sync device branch if already set
          if (!clean.branchId) clean.branchId = branchId
        } else {
          clean.branchId = clean.branchId || branchId
        }

        if (id && name === 'callCenterOrders') {
          const existing = await Model.findById(id).lean()
          const merged = mergeCallCenterOrder(existing, clean)
          delete merged._id
          delete merged.__v
          await Model.findByIdAndUpdate(id, { $set: merged }, { upsert: true, setDefaultsOnInsert: true })
        } else if (id) {
          await Model.findByIdAndUpdate(id, { $set: clean }, { upsert: true, setDefaultsOnInsert: true })
        } else {
          await Model.create(clean)
        }
        upserted += 1
      }
      results[name] = upserted
      if (upserted) {
        await SyncCursor.findOneAndUpdate(
          { branchId, collectionName: name, deviceId },
          { $set: { lastPushedAt: new Date() } },
          { upsert: true }
        )
      }
    }

    res.json({ ok: true, branchId, results, serverTime: new Date().toISOString() })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/** Status for UI indicator */
router.get('/status', async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req)
    if (!branchId) return res.json({ ok: true, cursors: [] })
    const cursors = await SyncCursor.find({ branchId: String(branchId) }).lean()
    res.json({ ok: true, branchId, cursors })
  } catch (e) { next(e) }
})

export default router
