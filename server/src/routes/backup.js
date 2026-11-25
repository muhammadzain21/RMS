import { Router } from 'express'
import { authRequired, requireRole } from '../middleware/auth.js'
import { assertBranchAccess, resolveBranchId } from '../utils/branchScope.js'
import { logAudit } from '../middleware/auditLog.js'
import Settings from '../models/Settings.js'
import StaffSettings from '../models/StaffSettings.js'
import MenuItem from '../models/MenuItem.js'
import Customer from '../models/Customer.js'
import Staff from '../models/Staff.js'
import Rider from '../models/Rider.js'
import RiderCash from '../models/RiderCash.js'
import RiderLiveLocation from '../models/RiderLiveLocation.js'
import Supplier from '../models/Supplier.js'
import Category from '../models/Category.js'
import Ingredient from '../models/Ingredient.js'
import Supply from '../models/Supply.js'
import Expense from '../models/Expense.js'
import ExpenseHead from '../models/ExpenseHead.js'
import Sale from '../models/Sale.js'
import Attendance from '../models/Attendance.js'
import Audit from '../models/Audit.js'
import CashOpening from '../models/CashOpening.js'
import AdvanceBooking from '../models/AdvanceBooking.js'
import Return from '../models/Return.js'
import PayInOut from '../models/PayInOut.js'
import DayClose from '../models/DayClose.js'
import Table from '../models/Table.js'
import CashCount from '../models/CashCount.js'
import Held from '../models/Held.js'
import Kot from '../models/Kot.js'
import Recall from '../models/Recall.js'
import Void from '../models/Void.js'
import StaffAdvance from '../models/StaffAdvance.js'
import StaffEarning from '../models/StaffEarning.js'
import StaffPurchase from '../models/StaffPurchase.js'
import PayrollRun from '../models/PayrollRun.js'
import Counter from '../models/Counter.js'
import User from '../models/User.js'
import DeletedSale from '../models/DeletedSale.js'
import Role from '../models/Role.js'
import Demand from '../models/Demand.js'
import CallCenterOrder from '../models/CallCenterOrder.js'
import Branch from '../models/Branch.js'
import BranchMenuOverride from '../models/BranchMenuOverride.js'
import BranchCategoryOverride from '../models/BranchCategoryOverride.js'
import SyncCursor from '../models/SyncCursor.js'
import InventorySnapshot from '../models/InventorySnapshot.js'
import PhysicalCount from '../models/PhysicalCount.js'
import WarehouseItem from '../models/WarehouseItem.js'
import WarehousePurchase from '../models/WarehousePurchase.js'
import WarehouseTransfer from '../models/WarehouseTransfer.js'
import WarehousePayment from '../models/WarehousePayment.js'
import WarehouseLedger from '../models/WarehouseLedger.js'
import WarehouseAccountHead from '../models/WarehouseAccountHead.js'
import { BiometricEvent } from '../biometric/models/BiometricEvent.js'
import { BiometricMapping } from '../biometric/models/BiometricMapping.js'
import { BiometricSyncState } from '../biometric/models/BiometricSyncState.js'
import BiometricConfig from '../models/BiometricConfig.js'

const router = Router()

/**
 * Full backup registry — every collection we dump / restore globally.
 * `mongo` = MongoDB collection name used by drop/purge.
 * `branchScoped` = can be filtered / purged by branchId.
 */
const FULL_BACKUP = [
  { key: 'branches', label: 'Branches', Model: Branch, mongo: 'branches', branchScoped: false, hqOnly: true },
  { key: 'settings', label: 'Settings', Model: Settings, mongo: 'settings', branchScoped: true },
  { key: 'staffSettings', label: 'Staff Settings', Model: StaffSettings, mongo: 'staffsettings', branchScoped: false },
  { key: 'menu', label: 'Menu Items', Model: MenuItem, mongo: 'menuitems', branchScoped: true },
  { key: 'categories', label: 'Categories', Model: Category, mongo: 'categories', branchScoped: true },
  { key: 'menuOverrides', label: 'Menu Branch Overrides', Model: BranchMenuOverride, mongo: 'branchmenuoverrides', branchScoped: true },
  { key: 'categoryOverrides', label: 'Category Branch Overrides', Model: BranchCategoryOverride, mongo: 'branchcategoryoverrides', branchScoped: true },
  { key: 'ingredients', label: 'Branch Inventory', Model: Ingredient, mongo: 'ingredients', branchScoped: true },
  { key: 'supplies', label: 'Branch Purchases', Model: Supply, mongo: 'supplies', branchScoped: true },
  { key: 'inventorySnapshots', label: 'Inventory Snapshots', Model: InventorySnapshot, mongo: 'inventorysnapshots', branchScoped: false },
  { key: 'physicalCounts', label: 'Physical Counts', Model: PhysicalCount, mongo: 'physicalcounts', branchScoped: false },
  { key: 'customers', label: 'Customers', Model: Customer, mongo: 'customers', branchScoped: false },
  { key: 'staff', label: 'Staff', Model: Staff, mongo: 'staffs', branchScoped: true },
  { key: 'attendance', label: 'Attendance', Model: Attendance, mongo: 'attendances', branchScoped: true },
  { key: 'staffAdvances', label: 'Staff Advances', Model: StaffAdvance, mongo: 'staffadvances', branchScoped: true },
  { key: 'staffEarnings', label: 'Staff Earnings', Model: StaffEarning, mongo: 'staffearnings', branchScoped: true },
  { key: 'staffPurchases', label: 'Staff Purchases', Model: StaffPurchase, mongo: 'staffpurchases', branchScoped: true },
  { key: 'payrollRuns', label: 'Payroll Runs', Model: PayrollRun, mongo: 'payrollruns', branchScoped: true },
  { key: 'riders', label: 'Riders', Model: Rider, mongo: 'riders', branchScoped: true },
  { key: 'riderCash', label: 'Rider Cash', Model: RiderCash, mongo: 'ridercashes', branchScoped: true },
  { key: 'riderLiveLocations', label: 'Rider Live Locations', Model: RiderLiveLocation, mongo: 'riderlivelocations', branchScoped: true },
  { key: 'suppliers', label: 'Suppliers', Model: Supplier, mongo: 'suppliers', branchScoped: true },
  { key: 'expenseHeads', label: 'Expense Heads', Model: ExpenseHead, mongo: 'expenseheads', branchScoped: true },
  { key: 'expenses', label: 'Expenses', Model: Expense, mongo: 'expenses', branchScoped: true },
  { key: 'sales', label: 'Sales', Model: Sale, mongo: 'sales', branchScoped: true },
  { key: 'deletedSales', label: 'Deleted Sales', Model: DeletedSale, mongo: 'deletedsales', branchScoped: true },
  { key: 'returns', label: 'Returns', Model: Return, mongo: 'returns', branchScoped: true },
  { key: 'kots', label: 'KOTs', Model: Kot, mongo: 'kots', branchScoped: true },
  { key: 'recalls', label: 'Recalls', Model: Recall, mongo: 'recalls', branchScoped: true },
  { key: 'voids', label: 'Voids', Model: Void, mongo: 'voids', branchScoped: true },
  { key: 'helds', label: 'Held Orders', Model: Held, mongo: 'helds', branchScoped: true },
  { key: 'cashOpenings', label: 'Cash Openings', Model: CashOpening, mongo: 'cashopenings', branchScoped: true },
  { key: 'payInOuts', label: 'Pay In/Out', Model: PayInOut, mongo: 'payinouts', branchScoped: true },
  { key: 'dayCloses', label: 'Day Closes', Model: DayClose, mongo: 'daycloses', branchScoped: true },
  { key: 'cashCounts', label: 'Cash Counts', Model: CashCount, mongo: 'cashcounts', branchScoped: true },
  { key: 'advanceBookings', label: 'Advance Bookings', Model: AdvanceBooking, mongo: 'advancebookings', branchScoped: true },
  { key: 'tables', label: 'Tables', Model: Table, mongo: 'tables', branchScoped: true },
  { key: 'demands', label: 'Demands', Model: Demand, mongo: 'demands', branchScoped: true },
  { key: 'callCenterOrders', label: 'Call Center Orders', Model: CallCenterOrder, mongo: 'callcenterorders', branchScoped: true },
  { key: 'audit', label: 'Audit Log', Model: Audit, mongo: 'audits', branchScoped: true },
  { key: 'users', label: 'Users', Model: User, mongo: 'users', branchScoped: false, preserveOnPurge: true },
  { key: 'roles', label: 'Roles', Model: Role, mongo: 'roles', branchScoped: false },
  { key: 'counters', label: 'Counters', Model: Counter, mongo: 'counters', branchScoped: true },
  { key: 'biometricConfig', label: 'Biometric Config', Model: BiometricConfig, mongo: 'biometricconfigs', branchScoped: true },
  { key: 'biometricEvents', label: 'Biometric Events', Model: BiometricEvent, mongo: 'biometricevents', branchScoped: false },
  { key: 'biometricMappings', label: 'Biometric Mappings', Model: BiometricMapping, mongo: 'biometricmappings', branchScoped: false },
  { key: 'biometricSyncStates', label: 'Biometric Sync States', Model: BiometricSyncState, mongo: 'biometricsyncstates', branchScoped: false },
  { key: 'syncCursors', label: 'Sync Cursors', Model: SyncCursor, mongo: 'synccursors', branchScoped: true },
  // Warehouse (HQ / global)
  { key: 'warehouseItems', label: 'Warehouse Items', Model: WarehouseItem, mongo: 'warehouseitems', branchScoped: false, hqOnly: true },
  { key: 'warehousePurchases', label: 'Warehouse Purchases', Model: WarehousePurchase, mongo: 'warehousepurchases', branchScoped: false, hqOnly: true },
  { key: 'warehouseTransfers', label: 'Warehouse Transfers', Model: WarehouseTransfer, mongo: 'warehousetransfers', branchScoped: false, hqOnly: true },
  { key: 'warehousePayments', label: 'Warehouse Payments', Model: WarehousePayment, mongo: 'warehousepayments', branchScoped: false, hqOnly: true },
  { key: 'warehouseLedgers', label: 'Warehouse Ledgers', Model: WarehouseLedger, mongo: 'warehouseledgers', branchScoped: false, hqOnly: true },
  { key: 'warehouseAccountHeads', label: 'Warehouse Account Heads', Model: WarehouseAccountHead, mongo: 'warehouseaccountheads', branchScoped: false, hqOnly: true },
]

const BRANCH_PURGE_TARGETS = FULL_BACKUP.filter(t => t.branchScoped)
const byKey = new Map(FULL_BACKUP.map(t => [t.key, t]))

function branchFilter(branchId) {
  return { branchId: String(branchId) }
}

async function dumpAll() {
  const out = { meta: { version: 2, scope: 'global', exportedAt: new Date().toISOString() } }
  await Promise.all(FULL_BACKUP.map(async (t) => {
    try {
      out[t.key] = await t.Model.find().lean()
    } catch (e) {
      console.warn(`[Backup] dump ${t.key}:`, e.message)
      out[t.key] = []
    }
  }))
  return out
}

async function dumpBranch(branchId) {
  const filter = branchFilter(branchId)
  const out = {
    meta: { version: 2, scope: 'branch', branchId: String(branchId), exportedAt: new Date().toISOString() },
  }
  await Promise.all(BRANCH_PURGE_TARGETS.map(async (t) => {
    try {
      out[t.key] = await t.Model.find(filter).lean()
    } catch (e) {
      console.warn(`[Backup] branch dump ${t.key}:`, e.message)
      out[t.key] = []
    }
  }))
  return out
}

async function insertManySafe(Model, arr, name) {
  if (!Array.isArray(arr) || !arr.length) return 0
  try {
    await Model.insertMany(arr, { ordered: false })
    console.log(`[Import] Inserted ${arr.length} ${name}`)
    return arr.length
  } catch (e) {
    console.warn(`[Import] Partial insert for ${name}:`, e.message)
    return arr.length
  }
}

async function dropListedCollections(includeUsers) {
  const mongoose = (await import('mongoose')).default
  const db = mongoose.connection.db
  const names = new Set(FULL_BACKUP.map(t => t.mongo))
  if (!includeUsers) names.delete('users')
  // Legacy / renamed collections
  ;['cashhandovers', 'staffpaynotes'].forEach(n => names.add(n))
  for (const name of names) {
    try {
      await db.dropCollection(name)
      console.log(`[Purge] Dropped collection: ${name}`)
    } catch {}
  }
}

// GET /api/backup/export — full global backup
router.get('/export', authRequired, async (_req, res, next) => {
  try {
    const payload = await dumpAll()
    const json = JSON.stringify(payload)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="rms-backup-${new Date().toISOString().slice(0, 10)}.json"`)
    res.send(json)
  } catch (e) { next(e) }
})

// GET /api/backup/export-branch — active branch only
router.get('/export-branch', authRequired, requireRole('Admin', 'admin'), async (req, res, next) => {
  try {
    let branchId = ''
    try { branchId = resolveBranchId(req, { required: true }) } catch (e) {
      return res.status(e.status || 400).json({ error: e.message || 'Select a branch in the header' })
    }
    assertBranchAccess(req, branchId)
    const payload = await dumpBranch(branchId)
    const json = JSON.stringify(payload)
    const stamp = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="rms-branch-${branchId}-${stamp}.json"`)
    res.send(json)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// POST /api/backup/import — full restore (clean slate, then insert everything)
router.post('/import', authRequired, requireRole('Admin', 'admin'), async (req, res, next) => {
  try {
    const d = req.body || {}
    console.log('[Import] Starting global restore, keys:', Object.keys(d).join(', '))

    await dropListedCollections(true)

    let inserted = 0
    const results = []
    for (const t of FULL_BACKUP) {
      const n = await insertManySafe(t.Model, d[t.key], t.key)
      inserted += n
      if (Array.isArray(d[t.key])) {
        results.push({ key: t.key, label: t.label, inserted: n })
      }
    }
    // Legacy alias: staffPayNotes → ignore; older backups without new keys are OK

    console.log(`[Import] Global restore completed (${inserted} docs)`)
    await logAudit(req, 'backup', 'Global backup restored', { keys: Object.keys(d), inserted })
    res.json({ ok: true, scope: 'global', inserted, totalInserted: inserted, results })
  } catch (e) { next(e) }
})

/**
 * POST /api/backup/import-branch
 * Restores branch-scoped data into the active header branch.
 * Accepts a branch backup OR a full backup (filters rows by meta.branchId / body.branchId / row.branchId).
 * Replaces that branch’s data for each collection present in the file.
 */
router.post('/import-branch', authRequired, requireRole('Admin', 'admin'), async (req, res, next) => {
  try {
    let branchId = ''
    try { branchId = resolveBranchId(req, { required: true }) } catch (e) {
      return res.status(e.status || 400).json({ error: e.message || 'Select a branch in the header' })
    }
    assertBranchAccess(req, branchId)

    const d = req.body || {}
    const sourceBranch = String(d?.meta?.branchId || d.branchId || branchId)
    const filter = branchFilter(branchId)
    const results = []
    let totalInserted = 0

    for (const t of BRANCH_PURGE_TARGETS) {
      if (!Array.isArray(d[t.key])) continue
      let rows = d[t.key]
      // If file is a full backup, keep only rows for source/target branch
      if (d?.meta?.scope !== 'branch') {
        rows = rows.filter(r => String(r?.branchId || '') === String(sourceBranch))
      }
      // Force destination branchId on restore
      rows = rows.map(r => ({ ...r, branchId: String(branchId) }))

      try {
        await t.Model.deleteMany(filter)
        const n = await insertManySafe(t.Model, rows, `${t.key}@${branchId}`)
        totalInserted += n
        results.push({ key: t.key, label: t.label, deletedThenInserted: n })
      } catch (err) {
        results.push({ key: t.key, label: t.label, error: err.message || 'Failed' })
      }
    }

    await logAudit(req, 'backup', `Branch backup restored (${branchId})`, {
      branchId,
      sourceBranch,
      totalInserted,
    })
    res.json({ ok: true, scope: 'branch', branchId, totalInserted, results })
        } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/** Global collection counts (for HQ management UI) */
router.get('/global-targets', authRequired, requireRole('Admin', 'admin'), async (_req, res, next) => {
  try {
    const targets = []
    for (const t of FULL_BACKUP) {
      let count = 0
      try { count = await t.Model.countDocuments({}) } catch { count = 0 }
      targets.push({
        key: t.key,
        label: t.label,
        count,
        branchScoped: !!t.branchScoped,
        hqOnly: !!t.hqOnly,
        preserveOnPurge: !!t.preserveOnPurge,
      })
    }
    res.json({ scope: 'global', targets })
  } catch (e) { next(e) }
})

/** List branch-purgeable collections with counts for the active branch */
router.get('/branch-targets', authRequired, requireRole('Admin', 'admin'), async (req, res, next) => {
  try {
    let branchId = ''
    try { branchId = resolveBranchId(req, { required: true }) } catch (e) {
      return res.status(e.status || 400).json({ error: e.message || 'Select a branch in the header' })
    }
    assertBranchAccess(req, branchId)
    const filter = branchFilter(branchId)
    const targets = []
    for (const t of BRANCH_PURGE_TARGETS) {
      let count = 0
      try { count = await t.Model.countDocuments(filter) } catch { count = 0 }
      targets.push({ key: t.key, label: t.label, count })
    }
    res.json({ branchId, targets })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/**
 * Delete selected (or all) branch-scoped records for ONE branch.
 * Body: { collections?: string[], all?: boolean }
 */
router.post('/purge-branch', authRequired, requireRole('Admin', 'admin'), async (req, res, next) => {
  try {
    let branchId = ''
    try { branchId = resolveBranchId(req, { required: true }) } catch (e) {
      return res.status(e.status || 400).json({ error: e.message || 'Select a branch in the header' })
    }
    assertBranchAccess(req, branchId)

    const body = req.body || {}
    const all = !!body.all
    const requested = Array.isArray(body.collections)
      ? body.collections.map(k => String(k || '').trim()).filter(Boolean)
      : []
    const keys = all ? BRANCH_PURGE_TARGETS.map(t => t.key) : requested
    if (!keys.length) return res.status(400).json({ error: 'Select at least one collection' })

    const filter = branchFilter(branchId)
    const results = []
    let totalDeleted = 0

    for (const key of keys) {
      const t = byKey.get(key)
      if (!t || !t.branchScoped) {
        results.push({ key, error: 'Unknown or not branch-scoped' })
        continue
      }
      try {
        const r = await t.Model.deleteMany(filter)
        const deleted = Number(r?.deletedCount || 0)
        totalDeleted += deleted
        results.push({ key, label: t.label, deleted })
      } catch (err) {
        results.push({ key, label: t.label, error: err.message || 'Failed' })
      }
    }

    await logAudit(req, 'backup', `Purged branch data (${branchId})`, {
      branchId,
      totalDeleted,
      collections: keys,
    })
    res.json({ ok: true, branchId, totalDeleted, results })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/**
 * Global selective purge.
 * Body: { collections?: string[], all?: boolean, includeUsers?: boolean }
 */
router.post('/purge-global', authRequired, requireRole('Admin', 'admin'), async (req, res, next) => {
  try {
    const body = req.body || {}
    const all = !!body.all
    const includeUsers = !!body.includeUsers
    const requested = Array.isArray(body.collections)
      ? body.collections.map(k => String(k || '').trim()).filter(Boolean)
      : []
    const keys = all
      ? FULL_BACKUP.filter(t => includeUsers || !t.preserveOnPurge).map(t => t.key)
      : requested
    if (!keys.length) return res.status(400).json({ error: 'Select at least one collection' })

    const results = []
    let totalDeleted = 0
    for (const key of keys) {
      const t = byKey.get(key)
      if (!t) {
        results.push({ key, error: 'Unknown collection' })
        continue
      }
      if (t.preserveOnPurge && !includeUsers) {
        results.push({ key, label: t.label, skipped: true, reason: 'Users preserved' })
        continue
      }
      try {
        const r = await t.Model.deleteMany({})
        const deleted = Number(r?.deletedCount || 0)
        totalDeleted += deleted
        results.push({ key, label: t.label, deleted })
      } catch (err) {
        results.push({ key, label: t.label, error: err.message || 'Failed' })
      }
    }

    await logAudit(req, 'backup', 'Global selective purge', { totalDeleted, collections: keys, includeUsers })
    res.json({ ok: true, scope: 'global', totalDeleted, results })
  } catch (e) { next(e) }
})

// POST /api/backup/reset — wipe transactional data; keep menu/categories/users
router.post('/reset', authRequired, requireRole('Admin', 'admin'), async (req, res, next) => {
  try {
    const keep = new Set(['menu', 'categories', 'users', 'roles', 'branches', 'warehouseAccountHeads'])
    await Promise.all(
      FULL_BACKUP
        .filter(t => !keep.has(t.key))
        .map(t => t.Model.deleteMany({}).catch(() => null)),
    )
    console.log('[Reset] Transactional data cleared; menu/categories/users/branches preserved')
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// POST /api/backup/purge — wipe ALL collections (users optional)
router.post('/purge', authRequired, requireRole('Admin', 'admin'), async (req, res, next) => {
  try {
    const includeUsers = String(req.query.includeUsers).toLowerCase() === 'true'
    await dropListedCollections(includeUsers)
    console.log(`[Purge] All data deleted. Users ${includeUsers ? 'DELETED' : 'PRESERVED'}`)
    await logAudit(req, 'backup', 'Global purge (drop collections)', { includeUsers })
    res.json({ ok: true, includeUsers })
  } catch (e) { next(e) }
})

router.get('/export-and-purge', authRequired, requireRole('Admin', 'admin'), async (req, res, next) => {
  try {
    const includeUsers = String(req.query.includeUsers).toLowerCase() === 'true'
    const payload = await dumpAll()
    const json = JSON.stringify(payload)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="rms-backup-${new Date().toISOString().slice(0, 10)}.json"`)
    res.on('finish', async () => {
      try {
        await dropListedCollections(includeUsers)
        console.log('[Export-Purge] Database purged after export')
      } catch (err) {
        console.error('Failed to purge after export:', err)
      }
    })
    res.send(json)
  } catch (e) { next(e) }
})

export default router
