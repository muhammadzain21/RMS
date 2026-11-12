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
import Table from '../models/Table.js'
import Supplier from '../models/Supplier.js'
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
  tables: Table,
  suppliers: Supplier,
  menuOverrides: BranchMenuOverride,
  categoryOverrides: BranchCategoryOverride,
}

const SHARED_MODELS = {
  customers: Customer,
  categories: Category,
}

function sinceDate(since) {
  if (!since) return new Date(0)
  const d = new Date(since)
  return Number.isFinite(d.getTime()) ? d : new Date(0)
}

function stripImmutable(doc = {}) {
  const clean = { ...doc }
  delete clean._id
  delete clean.id
  delete clean.__v
  return clean
}

function newerUpdatedAt(a, b) {
  const ta = new Date(a?.updatedAt || 0).getTime()
  const tb = new Date(b?.updatedAt || 0).getTime()
  return tb >= ta
}

async function upsertById(Model, id, clean, { mergeFn } = {}) {
  const existing = await Model.findById(id).lean()
  let payload = stripImmutable(clean)
  if (mergeFn) {
    payload = stripImmutable(mergeFn(existing, { ...clean, _id: id }))
  } else if (existing && !newerUpdatedAt(existing, clean)) {
    // Incoming is older or equal — keep existing, only fill empty fields
    const filled = { ...existing }
    for (const [k, v] of Object.entries(payload)) {
      if (k === 'updatedAt' || k === 'createdAt') continue
      if (filled[k] == null || filled[k] === '') filled[k] = v
    }
    payload = stripImmutable(filled)
  }
  await Model.findByIdAndUpdate(
    id,
    { $set: payload },
    { upsert: true, setDefaultsOnInsert: true, timestamps: false }
  )
}

async function upsertShared(Model, row) {
  const id = row._id || row.id
  const clean = stripImmutable(row)
  if (id) {
    await Model.findByIdAndUpdate(id, { $set: clean }, { upsert: true, setDefaultsOnInsert: true, timestamps: false })
    return
  }
  await Model.create(clean)
}

/** Pull changes for a branch (+ shared catalogs) since timestamp */
router.get('/pull', async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req, { required: true })
    assertBranchAccess(req, branchId)
    const since = sinceDate(req.query.since)
    const deviceId = String(req.query.deviceId || 'default')
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 50), 2000)

    const data = {}
    for (const [name, Model] of Object.entries(BRANCH_MODELS)) {
      const q = {
        branchId: String(branchId),
        updatedAt: { $gt: since },
      }
      if (name === 'warehouseTransfers') {
        q.$or = [
          { toBranchId: String(branchId) },
          { branchId: String(branchId) },
        ]
        delete q.branchId
        q.updatedAt = { $gt: since }
      }
      if (name === 'suppliers') {
        q.scope = { $ne: 'warehouse' }
      }
      data[name] = await Model.find(q).sort({ updatedAt: 1 }).limit(limit).lean()
    }
    for (const [name, Model] of Object.entries(SHARED_MODELS)) {
      data[name] = await Model.find({ updatedAt: { $gt: since } }).sort({ updatedAt: 1 }).limit(Math.min(limit * 2, 5000)).lean()
    }

    data.menu = await MenuItem.find({
      updatedAt: { $gt: since },
      $or: [
        { branchId: '' },
        { branchId: null },
        { branchId: { $exists: false } },
        { branchId: String(branchId) },
      ],
    }).sort({ updatedAt: 1 }).limit(Math.min(limit * 2, 5000)).lean()

    const now = new Date()
    for (const name of [...Object.keys(BRANCH_MODELS), ...Object.keys(SHARED_MODELS), 'menu']) {
      await SyncCursor.findOneAndUpdate(
        { branchId: String(branchId), collectionName: name, deviceId },
        { $set: { lastPulledAt: now } },
        { upsert: true }
      )
    }

    const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]))
    const hasMore = Object.values(counts).some((n) => n >= limit)

    res.json({
      ok: true,
      branchId,
      since: since.toISOString(),
      serverTime: now.toISOString(),
      hasMore,
      counts,
      data,
    })
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
    const errors = []

    for (const [name, Model] of Object.entries(BRANCH_MODELS)) {
      const rows = Array.isArray(docs[name]) ? docs[name] : []
      let upserted = 0
      for (const row of rows) {
        try {
          const id = row._id || row.id
          const clean = stripImmutable(row)

          if (name === 'warehouseTransfers') {
            clean.toBranchId = clean.toBranchId || branchId
          } else if (name === 'callCenterOrders') {
            if (!clean.branchId) clean.branchId = branchId
          } else {
            clean.branchId = clean.branchId || branchId
          }
          if (name === 'suppliers') {
            if (String(clean.scope || '') === 'warehouse') continue
            clean.scope = 'branch'
          }

          if (id && name === 'callCenterOrders') {
            await upsertById(Model, id, clean, { mergeFn: mergeCallCenterOrder })
          } else if (id) {
            await upsertById(Model, id, clean)
          } else if (clean.idempotencyKey && (name === 'sales' || name === 'kots')) {
            const existing = await Model.findOne({ idempotencyKey: clean.idempotencyKey }).lean()
            if (existing?._id) {
              await upsertById(Model, existing._id, clean)
            } else {
              await Model.create(clean)
            }
          } else {
            await Model.create(clean)
          }
          upserted += 1
        } catch (rowErr) {
          errors.push({ collection: name, id: String(row?._id || row?.id || ''), error: String(rowErr?.message || rowErr) })
        }
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

    // Shared catalogs + menu (cloud → branch apply, or HQ push)
    for (const [name, Model] of Object.entries(SHARED_MODELS)) {
      const rows = Array.isArray(docs[name]) ? docs[name] : []
      let upserted = 0
      for (const row of rows) {
        try {
          await upsertShared(Model, row)
          upserted += 1
        } catch (rowErr) {
          errors.push({ collection: name, id: String(row?._id || row?.id || ''), error: String(rowErr?.message || rowErr) })
        }
      }
      results[name] = upserted
    }

    if (Array.isArray(docs.menu)) {
      let upserted = 0
      for (const row of docs.menu) {
        try {
          await upsertShared(MenuItem, row)
          upserted += 1
        } catch (rowErr) {
          errors.push({ collection: 'menu', id: String(row?._id || row?.id || ''), error: String(rowErr?.message || rowErr) })
        }
      }
      results.menu = upserted
    }

    res.json({
      ok: true,
      branchId,
      results,
      errors: errors.slice(0, 20),
      serverTime: new Date().toISOString(),
    })
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
