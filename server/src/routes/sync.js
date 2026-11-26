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
import { mergeCallCenterOrder, mergeDemand, mergeWarehouseTransfer } from '../utils/syncMerge.js'
import DeletedSale from '../models/DeletedSale.js'
import Return from '../models/Return.js'
import Void from '../models/Void.js'
import Held from '../models/Held.js'
import CashOpening from '../models/CashOpening.js'
import PayInOut from '../models/PayInOut.js'
import DayClose from '../models/DayClose.js'
import CashCount from '../models/CashCount.js'
import AdvanceBooking from '../models/AdvanceBooking.js'
import Supply from '../models/Supply.js'
import Rider from '../models/Rider.js'
import RiderCash from '../models/RiderCash.js'
import StaffAdvance from '../models/StaffAdvance.js'
import StaffEarning from '../models/StaffEarning.js'
import StaffPurchase from '../models/StaffPurchase.js'
import PayrollRun from '../models/PayrollRun.js'
import ExpenseHead from '../models/ExpenseHead.js'
import PhysicalCount from '../models/PhysicalCount.js'
import User from '../models/User.js'

const router = Router()
router.use(authRequired)

/**
 * Branch PC is the source of truth. These collections are pushed local → cloud
 * and upserted by _id (no second copy). Warehouse HQ catalogs are not in this list.
 * Cloud → branch is limited to call-center orders, warehouse issues, and demand status.
 */
const BRANCH_MODELS = {
  sales: Sale,
  deletedSales: DeletedSale,
  returns: Return,
  kots: Kot,
  recalls: Recall,
  voids: Void,
  helds: Held,
  expenses: Expense,
  expenseHeads: ExpenseHead,
  staff: Staff,
  attendance: Attendance,
  staffAdvances: StaffAdvance,
  staffEarnings: StaffEarning,
  staffPurchases: StaffPurchase,
  payrollRuns: PayrollRun,
  callCenterOrders: CallCenterOrder,
  warehouseTransfers: WarehouseTransfer,
  ingredients: Ingredient,
  supplies: Supply,
  demands: Demand,
  tables: Table,
  suppliers: Supplier,
  riders: Rider,
  riderCash: RiderCash,
  cashOpenings: CashOpening,
  payInOuts: PayInOut,
  cashCounts: CashCount,
  dayCloses: DayClose,
  advanceBookings: AdvanceBooking,
  physicalCounts: PhysicalCount,
  menuOverrides: BranchMenuOverride,
  categoryOverrides: BranchCategoryOverride,
}

/** HQ creates these; status only moves forward, same _id. */
const MERGE_FNS = {
  callCenterOrders: mergeCallCenterOrder,
  demands: mergeDemand,
  warehouseTransfers: mergeWarehouseTransfer,
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

/** Prefer header branch; if staff still has a stale All/other-branch header, fall back to home. */
function resolveSyncBranch(req, { required = true } = {}) {
  let branchId = String(resolveBranchId(req, { required: false }) || '').trim()
  const home = String(req.user?.homeBranchId || '').trim()
  const allowed = [
    ...(Array.isArray(req.user?.branchIds) ? req.user.branchIds : []),
    home,
  ].filter(Boolean).map(String)
  if (!branchId) {
    branchId = home || allowed[0] || ''
  } else {
    try {
      assertBranchAccess(req, branchId)
    } catch (e) {
      if (e?.status !== 403) throw e
      branchId = home || allowed[0] || ''
    }
  }
  if (!branchId && required) {
    const err = new Error('branchId is required — select a branch in the header')
    err.status = 400
    throw err
  }
  if (branchId) assertBranchAccess(req, branchId)
  return branchId
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

/**
 * Branch row wins by _id. If cloud already has the same idempotencyKey under a
 * different _id, remove that duplicate and upsert the branch _id — otherwise
 * sales (and other keyed docs) fail with E11000 and never land on cloud.
 */
async function upsertByIdPreferBranch(Model, id, clean) {
  const payload = stripImmutable(clean)
  try {
    await Model.findByIdAndUpdate(
      id,
      { $set: payload },
      { upsert: true, setDefaultsOnInsert: true, timestamps: false }
    )
    return
  } catch (err) {
    const key = payload.idempotencyKey
    if (err?.code !== 11000 || !key) throw err
    const existing = await Model.findOne({ idempotencyKey: key }).lean()
    if (existing?._id && String(existing._id) !== String(id)) {
      await Model.deleteOne({ _id: existing._id })
      await Model.findByIdAndUpdate(
        id,
        { $set: payload },
        { upsert: true, setDefaultsOnInsert: true, timestamps: false }
      )
      return
    }
    if (existing?._id) {
      await Model.findByIdAndUpdate(existing._id, { $set: payload }, { timestamps: false })
      return
    }
    throw err
  }
}

/**
 * One cash opening / day close per (date, branchId).
 * If cloud already has that day under a different _id, update that row
 * instead of failing on the unique index (which used to skip the day forever).
 */
async function upsertByDateBranch(Model, id, clean, branchId) {
  const payload = stripImmutable(clean)
  const date = String(payload.date || '').slice(0, 10)
  const bid = String(payload.branchId || branchId || '').trim()
  payload.branchId = bid || payload.branchId

  if (id) {
    const byId = await Model.findById(id).lean()
    if (byId) {
      await Model.findByIdAndUpdate(id, { $set: payload }, { timestamps: false })
      return
    }
  }

  if (date && bid) {
    const byKey = await Model.findOne({ date, branchId: bid }).lean()
    if (byKey?._id) {
      await Model.findByIdAndUpdate(byKey._id, { $set: payload }, { timestamps: false })
      return
    }
  }

  const doc = { ...payload }
  if (id && /^[a-fA-F0-9]{24}$/.test(String(id))) doc._id = id
  try {
    await Model.create(doc)
  } catch (e) {
    // Race / unique index: fall back to date+branch update
    if (date && bid && /E11000|duplicate/i.test(String(e?.message || e))) {
      const again = await Model.findOne({ date, branchId: bid }).lean()
      if (again?._id) {
        await Model.findByIdAndUpdate(again._id, { $set: payload }, { timestamps: false })
        return
      }
    }
    throw e
  }
}

function isHqAccount(user) {
  if (!user) return false
  if (user.isHq) return true
  const role = String(user.role || '')
  return role === 'Admin' || role === 'SuperAdmin'
}

/** Branch users upsert by _id, else username. Head-office accounts are never overwritten. */
async function upsertBranchUser(row, branchId) {
  const id = row._id || row.id
  const username = String(row.username || '').trim()
  if (!username) return
  const clean = stripImmutable(row)
  delete clean.password
  clean.homeBranchId = clean.homeBranchId || branchId
  const idOk = id && /^[a-fA-F0-9]{24}$/.test(String(id))
  let existing = idOk ? await User.findById(id).lean() : null
  if (!existing) existing = await User.findOne({ username }).lean()
  if (isHqAccount(existing) || isHqAccount(clean)) return
  if (existing) {
    await User.findByIdAndUpdate(existing._id, { $set: clean }, { timestamps: false })
    return
  }
  const doc = { ...clean, username }
  if (idOk) doc._id = id
  await User.create(doc)
}

function pullQuery(name, branchId, since, outbound) {
  const updatedAt = { $gt: since }
  if (name === 'warehouseTransfers') {
    return {
      updatedAt,
      $or: [{ toBranchId: String(branchId) }, { branchId: String(branchId) }],
    }
  }
  if (name === 'users') {
    const q = {
      updatedAt,
      isHq: { $ne: true },
      role: { $nin: ['Admin', 'SuperAdmin'] },
    }
    if (outbound) {
      q.$or = [
        { homeBranchId: String(branchId) },
        { branchIds: String(branchId) },
        { homeBranchId: '' },
        { homeBranchId: { $exists: false } },
      ]
    } else {
      q.homeBranchId = String(branchId)
    }
    return q
  }
  if (name === 'customers') {
    return outbound ? { updatedAt } : { _id: null }
  }
  if (outbound) {
    return {
      updatedAt,
      $or: [
        { branchId: String(branchId) },
        { branchId: '' },
        { branchId: null },
        { branchId: { $exists: false } },
      ],
    }
  }
  return { branchId: String(branchId), updatedAt }
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

/**
 * Pull changes since timestamp.
 * scope=outbound (branch PC gathering its own rows to upload): every branch collection.
 * collections=a,b (cloud → branch): only those names, strictly scoped. Default cloud set is
 * call-center orders, warehouse issues, and demands.
 */
router.get('/pull', async (req, res, next) => {
  try {
    const branchId = resolveSyncBranch(req, { required: true })
    const since = sinceDate(req.query.since)
    const deviceId = String(req.query.deviceId || 'default')
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 50), 2000)
    const outbound = String(req.query.scope || '') === 'outbound'
    const requested = String(req.query.collections || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    const names = requested.length
      ? Object.keys(BRANCH_MODELS).filter(n => requested.includes(n))
      : Object.keys(BRANCH_MODELS)

    const data = {}
    for (const name of names) {
      const Model = BRANCH_MODELS[name]
      const q = pullQuery(name, branchId, since, outbound)
      // Day open/close must upload even when the cursor sits exactly on their updatedAt
      // (the query is $gt, so an equal timestamp is skipped forever).
      if (outbound && (name === 'dayCloses' || name === 'cashOpenings')) {
        const back = new Date(Date.now() - 21 * 864e5)
        const y = back.getFullYear()
        const m = String(back.getMonth() + 1).padStart(2, '0')
        const d = String(back.getDate()).padStart(2, '0')
        const fromYmd = `${y}-${m}-${d}`
        const branchOr = q.$or
        delete q.updatedAt
        delete q.$or
        q.$and = [
          ...(branchOr ? [{ $or: branchOr }] : []),
          { $or: [{ updatedAt: { $gt: since } }, { date: { $gte: fromYmd } }] },
        ]
      }
      if (name === 'suppliers') q.scope = { $ne: 'warehouse' }
      data[name] = await Model.find(q).sort({ updatedAt: 1 }).limit(limit).lean()
    }
    if (outbound && requested.includes('customers')) {
      data.customers = await Customer.find({ updatedAt: { $gt: since } }).sort({ updatedAt: 1 }).limit(limit).lean()
    }
    if (outbound && requested.includes('users')) {
      data.users = await User.find(pullQuery('users', branchId, since, true)).sort({ updatedAt: 1 }).limit(limit).lean()
    }

    const now = new Date()
    for (const name of Object.keys(data)) {
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
    // Body branchId wins when allowed; otherwise fall back (staff after Admin "All")
    let branchId = String(req.body?.branchId || '').trim()
    if (branchId) {
      try {
        assertBranchAccess(req, branchId)
      } catch (e) {
        if (e?.status !== 403) throw e
        branchId = ''
      }
    }
    if (!branchId) branchId = resolveSyncBranch(req, { required: true })
    const deviceId = String(req.body?.deviceId || 'default')
    const docs = req.body?.docs || {}
    const results = {}
    const errors = []

    // Day open/close first so a fat sales payload cannot starve them if the
    // request times out mid-loop on the cloud.
    const pushOrder = [
      'cashOpenings',
      'dayCloses',
      ...Object.keys(BRANCH_MODELS).filter((n) => n !== 'cashOpenings' && n !== 'dayCloses'),
    ]
    for (const name of pushOrder) {
      const Model = BRANCH_MODELS[name]
      if (!Model) continue
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

          const mergeFn = MERGE_FNS[name]
          if (name === 'cashOpenings' || name === 'dayCloses') {
            await upsertByDateBranch(Model, id, clean, branchId)
          } else if (id && mergeFn) {
            await upsertById(Model, id, clean, { mergeFn })
          } else if (id) {
            // Branch row replaces the cloud row. Same _id, no duplicate.
            // Sales/returns/etc. may collide on idempotencyKey — resolve that.
            await upsertByIdPreferBranch(Model, id, clean)
          } else if (clean.idempotencyKey) {
            const existing = await Model.findOne({ idempotencyKey: clean.idempotencyKey }).lean()
            if (existing?._id) {
              await Model.findByIdAndUpdate(existing._id, { $set: clean }, { timestamps: false })
            } else {
              await Model.create(clean)
            }
          } else {
            await Model.create(clean)
          }

          // Deleted sale on branch ⇒ remove the live sale on cloud too
          if (name === 'deletedSales') {
            const orig = clean.originalSaleId || row.originalSaleId
            if (orig) {
              try { await Sale.findByIdAndDelete(orig) } catch {}
            }
            // Also drop by billNo+branch when id was remapped
            if (clean.billNo && clean.branchId) {
              try {
                const q = {
                  billNo: String(clean.billNo),
                  branchId: String(clean.branchId),
                }
                if (clean.date) q.date = String(clean.date).slice(0, 10)
                await Sale.deleteMany(q)
              } catch {}
            }
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

    if (Array.isArray(docs.users)) {
      let upserted = 0
      for (const row of docs.users) {
        try {
          await upsertBranchUser(row, branchId)
          upserted += 1
        } catch (rowErr) {
          errors.push({ collection: 'users', id: String(row?._id || row?.id || row?.username || ''), error: String(rowErr?.message || rowErr) })
        }
      }
      results.users = upserted
    }

    // Customers created at the branch. Upsert by _id so a repeat sync does not duplicate.
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

/**
 * Upsert day open/close without day-close business checks (recalls/expenses).
 * Used when an older cloud /api/sync/push silently drops dayCloses/cashOpenings.
 * Body: { branchId, docs: { dayCloses?: [], cashOpenings?: [] } }
 */
router.post('/daybook-upsert', async (req, res, next) => {
  try {
    let branchId = String(req.body?.branchId || '').trim()
    if (branchId) {
      try {
        assertBranchAccess(req, branchId)
      } catch (e) {
        if (e?.status !== 403) throw e
        branchId = ''
      }
    }
    if (!branchId) branchId = resolveSyncBranch(req, { required: true })
    const docs = req.body?.docs || {}
    const results = { dayCloses: 0, cashOpenings: 0 }
    const errors = []
    for (const [name, Model] of [
      ['cashOpenings', CashOpening],
      ['dayCloses', DayClose],
    ]) {
      const rows = Array.isArray(docs[name]) ? docs[name] : []
      for (const row of rows) {
        try {
          const id = row?._id || row?.id
          const clean = stripImmutable(row)
          clean.branchId = clean.branchId || branchId
          await upsertByDateBranch(Model, id, clean, branchId)
          results[name] += 1
        } catch (rowErr) {
          errors.push({
            collection: name,
            id: String(row?._id || row?.id || ''),
            error: String(rowErr?.message || rowErr),
          })
        }
      }
    }
    res.json({ ok: true, branchId, results, errors: errors.slice(0, 20), serverTime: new Date().toISOString() })
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

/**
 * Branch PC browser → local Node → VPS (avoids CORS).
 * Body: { cloudBase, path, method, cloudToken, branchId, body }
 * path must start with /api/sync/
 */
router.post('/proxy', async (req, res, next) => {
  try {
    const cloudBase = String(req.body?.cloudBase || '').trim().replace(/\/+$/, '')
    const syncPath = String(req.body?.path || '').trim()
    const method = String(req.body?.method || 'GET').toUpperCase()
    const cloudToken = String(
      req.body?.cloudToken ||
      String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
      ''
    ).trim()
    const branchId = String(req.body?.branchId || req.headers['x-branch-id'] || '').trim()
    const payload = req.body?.body

    if (!cloudBase || !/^https?:\/\//i.test(cloudBase)) {
      return res.status(400).json({ error: 'cloudBase must be an http(s) URL' })
    }
    try {
      const host = new URL(cloudBase).hostname
      const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(host)
      if (!isLocal && !/^https:/i.test(cloudBase)) {
        return res.status(400).json({ error: 'cloudBase must use https' })
      }
    } catch {
      return res.status(400).json({ error: 'Invalid cloudBase URL' })
    }
    // Sync APIs + daybook/recall REST fallback (older cloud builds omit dayCloses from /push)
    const pathOk =
      syncPath.startsWith('/api/sync/') ||
      syncPath === '/api/day-closes' ||
      syncPath.startsWith('/api/day-closes?') ||
      syncPath === '/api/cash-openings' ||
      syncPath.startsWith('/api/cash-openings?') ||
      syncPath === '/api/recalls' ||
      syncPath.startsWith('/api/recalls?') ||
      /^\/api\/recalls\/[a-fA-F0-9]{24}$/.test(syncPath)
    if (!pathOk) {
      return res.status(400).json({ error: 'path not allowed for sync proxy' })
    }
    if (!['GET', 'POST', 'DELETE'].includes(method)) {
      return res.status(400).json({ error: 'method must be GET, POST, or DELETE' })
    }
    if (!cloudToken) {
      return res.status(401).json({ error: 'Cloud auth token missing' })
    }

    const url = `${cloudBase}${syncPath}`
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${cloudToken}`,
    }
    if (branchId) headers['X-Branch-Id'] = branchId
    // Branch is SOT for daybook — allow cloud day-close even if stale recalls remain
    if (syncPath === '/api/day-closes' && method === 'POST') {
      headers['X-Sync-Force'] = '1'
    }

    const callCloud = async (path, callMethod, callBody, callHeaders = headers) => {
      const r = await fetch(`${cloudBase}${path}`, {
        method: callMethod,
        headers: callHeaders,
        body: (callMethod === 'GET' || callMethod === 'DELETE') ? undefined : JSON.stringify(callBody ?? {}),
      })
      const t = await r.text()
      return { status: r.status, text: t, ct: String(r.headers.get('content-type') || '') }
    }

    let upstream = await callCloud(syncPath, method, payload)
    let text = upstream.text
    let ct = upstream.ct

    // Day close blocked by stale cloud recalls: clear them (branch is SOT) and retry once.
    if (
      method === 'POST' &&
      syncPath === '/api/day-closes' &&
      upstream.status === 400 &&
      /OPEN_RECALLS|open recall/i.test(text || '')
    ) {
      try {
        const hdrBranch = { ...headers }
        const hdrAll = { ...headers }
        delete hdrAll['X-Branch-Id']
        let errBody = {}
        try { errBody = JSON.parse(text || '{}') } catch {}
        const tokenHints = (Array.isArray(errBody?.recalls) ? errBody.recalls : [])
          .map((r) => String(r?.tokenNo || '').trim())
          .filter(Boolean)
        const lists = []
        const cleared = new Set()
        const tryClearRows = async (rows, hdr) => {
          for (const row of rows) {
            const id = String(row?._id || row?.id || '')
            if (!/^[a-fA-F0-9]{24}$/.test(id) || cleared.has(id)) continue
            await callCloud(`/api/recalls/${id}`, 'DELETE', undefined, hdr)
            cleared.add(id)
          }
        }
        for (const hdr of [hdrBranch, hdrAll]) {
          const queries = [
            '/api/recalls?limit=500',
            '/api/recalls?page=1&limit=500',
            '/api/recalls?includeCleared=1&limit=500',
            '/api/recalls',
            ...tokenHints.slice(0, 10).map((t) => `/api/recalls?search=${encodeURIComponent(t)}&includeCleared=1&limit=50`),
          ]
          for (const q of queries) {
            const got = await callCloud(q, 'GET', undefined, hdr)
            let rows = []
            try {
              const j = JSON.parse(got.text || '[]')
              rows = Array.isArray(j) ? j : (Array.isArray(j?.rows) ? j.rows : [])
            } catch {}
            lists.push({ q, status: got.status, n: rows.length, sample: rows[0] && { id: rows[0]._id || rows[0].id, tokenNo: rows[0].tokenNo, clearedAt: rows[0].clearedAt, branchId: rows[0].branchId } })
            await tryClearRows(rows, hdrAll)
          }
        }
        // Also push clearedAt via sync for any id we found
        if (cleared.size) {
          const now = new Date().toISOString()
          await callCloud('/api/sync/push', 'POST', {
            branchId: branchId || undefined,
            deviceId: 'daybook-force',
            docs: {
              recalls: [...cleared].map((id) => ({
                _id: id,
                id,
                clearedAt: now,
                updatedAt: now,
                branchId: branchId || undefined,
              })),
            },
          })
        }
        console.log('[sync-proxy] cleared cloud recalls before day-close retry', { cleared: cleared.size, lists: lists.filter((x) => x.n > 0).concat(lists.slice(0, 3)) })
        upstream = await callCloud(syncPath, method, { ...payload }, { ...headers, 'X-Sync-Force': '1' })
        text = upstream.text
        ct = upstream.ct

        // If REST day-close is still blocked, upsert via sync daybook endpoint (bypasses recall checks)
        if (upstream.status === 400 && /OPEN_RECALLS|PENDING_EXPENSE/i.test(text || '')) {
          const upsert = await callCloud('/api/sync/daybook-upsert', 'POST', {
            branchId: branchId || undefined,
            deviceId: 'daybook-force',
            docs: { dayCloses: [{ ...payload, branchId: branchId || payload?.branchId }] },
          })
          console.log('[sync-proxy] daybook-upsert fallback', { status: upsert.status, body: String(upsert.text || '').slice(0, 300) })
          if (upsert.status >= 200 && upsert.status < 300) {
            upstream = upsert
            text = upsert.text
            ct = upsert.ct || 'application/json'
          }
        }
      } catch (e) {
        console.log('[sync-proxy] recall clear failed', String(e?.message || e))
      }
    }

    if (ct.includes('text/html') || /^\s*<!doctype/i.test(text) || /^\s*<html/i.test(text)) {
      return res.status(502).json({
        error:
          'Cloud URL returned HTML instead of the API. On the VPS, nginx must proxy /api to Node (port 5000).',
      })
    }
    // Quiet diagnostics for day open/close uploads (branch → cloud)
    if (
      (syncPath.includes('/push') || syncPath.includes('daybook-upsert') ||
        syncPath.includes('/day-closes') || syncPath.includes('/cash-openings')) &&
      (payload?.docs || syncPath.includes('/day-closes') || syncPath.includes('/cash-openings'))
    ) {
      const dc = Array.isArray(payload?.docs?.dayCloses) ? payload.docs.dayCloses.length : (syncPath.includes('/day-closes') ? 1 : 0)
      const co = Array.isArray(payload?.docs?.cashOpenings) ? payload.docs.cashOpenings.length : (syncPath.includes('/cash-openings') ? 1 : 0)
      if (dc || co || syncPath.includes('daybook')) {
        let results = {}
        let errors = []
        try {
          const j = JSON.parse(text || '{}')
          results = j?.results || {}
          errors = Array.isArray(j?.errors) ? j.errors : []
        } catch {}
        console.log('[sync-proxy] daybook', {
          path: syncPath,
          status: upstream.status,
          sent: { dayCloses: dc, cashOpenings: co, date: payload?.date || payload?.docs?.dayCloses?.[0]?.date || '' },
          results: { dayCloses: results.dayCloses, cashOpenings: results.cashOpenings },
          body: String(text || '').slice(0, 240),
        })
      }
    }
    res.status(upstream.status)
    if (ct) res.set('Content-Type', ct)
    else res.type('json')
    return res.send(text || '{}')
  } catch (e) {
    const msg = String(e?.message || e)
    return res.status(502).json({ error: `Cloud proxy failed: ${msg}` })
  }
})

export default router
