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
import Supplier from '../models/Supplier.js'
import Category from '../models/Category.js'
import Ingredient from '../models/Ingredient.js'
import Supply from '../models/Supply.js'
import Expense from '../models/Expense.js'
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
import PayrollRun from '../models/PayrollRun.js'
import Counter from '../models/Counter.js'
import User from '../models/User.js'
import DeletedSale from '../models/DeletedSale.js'
import Role from '../models/Role.js'
import Demand from '../models/Demand.js'
import CallCenterOrder from '../models/CallCenterOrder.js'
import BranchMenuOverride from '../models/BranchMenuOverride.js'
import BranchCategoryOverride from '../models/BranchCategoryOverride.js'
import SyncCursor from '../models/SyncCursor.js'
import { BiometricEvent } from '../biometric/models/BiometricEvent.js'
import { BiometricMapping } from '../biometric/models/BiometricMapping.js'
import { BiometricSyncState } from '../biometric/models/BiometricSyncState.js'
import BiometricConfig from '../models/BiometricConfig.js'

const router = Router()

/**
 * Branch-scoped purge targets. Uses deleteMany({ branchId }) — never drops whole collections.
 * Shared catalogs (empty branchId menu/categories/users/roles/warehouse) are not wiped here.
 */
const BRANCH_PURGE_TARGETS = [
  { key: 'sales', label: 'Sales', Model: Sale },
  { key: 'deletedSales', label: 'Deleted Sales', Model: DeletedSale },
  { key: 'kots', label: 'KOTs', Model: Kot },
  { key: 'recalls', label: 'Recalls', Model: Recall },
  { key: 'voids', label: 'Voids', Model: Void },
  { key: 'helds', label: 'Held Orders', Model: Held },
  { key: 'returns', label: 'Returns', Model: Return },
  { key: 'expenses', label: 'Expenses', Model: Expense },
  { key: 'cashOpenings', label: 'Cash Openings', Model: CashOpening },
  { key: 'payInOuts', label: 'Pay In/Out', Model: PayInOut },
  { key: 'dayCloses', label: 'Day Closes', Model: DayClose },
  { key: 'advanceBookings', label: 'Advance Bookings', Model: AdvanceBooking },
  { key: 'ingredients', label: 'Branch Inventory', Model: Ingredient },
  { key: 'supplies', label: 'Branch Purchases', Model: Supply },
  { key: 'demands', label: 'Demands', Model: Demand },
  { key: 'staff', label: 'Staff', Model: Staff },
  { key: 'attendance', label: 'Attendance', Model: Attendance },
  { key: 'riders', label: 'Riders', Model: Rider },
  { key: 'callCenterOrders', label: 'Call Center Orders', Model: CallCenterOrder },
  { key: 'menuOverrides', label: 'Menu Branch Overrides', Model: BranchMenuOverride },
  { key: 'categoryOverrides', label: 'Category Branch Overrides', Model: BranchCategoryOverride },
  { key: 'menuBranchOnly', label: 'Branch-only Menu Items', Model: MenuItem },
  { key: 'categoriesBranchOnly', label: 'Branch-only Categories', Model: Category },
  { key: 'settings', label: 'Branch Settings', Model: Settings },
  { key: 'biometricConfig', label: 'Biometric Config', Model: BiometricConfig },
  { key: 'syncCursors', label: 'Sync Cursors', Model: SyncCursor },
]

function branchFilter(branchId) {
  return { branchId: String(branchId) }
}

// Utility to fetch all data
async function dumpAll() {
  const [settings, staffSettings, menu, categories, ingredients, supplies, customers, staff, riders, riderCash, suppliers, expenses, sales, deletedSales, attendance, audit, cashOpenings, advanceBookings, returns, payInOuts, dayCloses, tables, users, cashCounts, helds, kots, recalls, voids, staffAdvances, staffEarnings, payrollRuns, counters, roles, biometricEvents, biometricMappings, biometricSyncStates] = await Promise.all([
    Settings.find().lean(),
    StaffSettings.find().lean(),
    MenuItem.find().lean(),
    Category.find().lean(),
    Ingredient.find().lean(),
    Supply.find().lean(),
    Customer.find().lean(),
    Staff.find().lean(),
    Rider.find().lean(),
    RiderCash.find().lean(),
    Supplier.find().lean(),
    Expense.find().lean(),
    Sale.find().lean(),
    DeletedSale.find().lean(),
    Attendance.find().lean(),
    Audit.find().lean(),
    CashOpening.find().lean(),
    AdvanceBooking.find().lean(),
    Return.find().lean(),
    PayInOut.find().lean(),
    DayClose.find().lean(),
    Table.find().lean(),
    User.find().lean(),
    CashCount.find().lean(),
    Held.find().lean(),
    Kot.find().lean(),
    Recall.find().lean(),
    Void.find().lean(),
    StaffAdvance.find().lean(),
    StaffEarning.find().lean(),
    PayrollRun.find().lean(),
    Counter.find().lean(),
    Role.find().lean(),
    BiometricEvent.find().lean(),
    BiometricMapping.find().lean(),
    BiometricSyncState.find().lean(),
  ])
  return { settings, staffSettings, menu, categories, ingredients, supplies, customers, staff, riders, riderCash, suppliers, expenses, sales, deletedSales, attendance, audit, cashOpenings, advanceBookings, returns, payInOuts, dayCloses, tables, users, cashCounts, helds, kots, recalls, voids, staffAdvances, staffEarnings, payrollRuns, counters, roles, biometricEvents, biometricMappings, biometricSyncStates }
}

// GET /api/backup/export - protected (any authenticated user)
router.get('/export', authRequired, async (_req, res, next) => {
  try {
    const payload = await dumpAll()
    const json = JSON.stringify(payload)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="rms-backup-${new Date().toISOString().slice(0,10)}.json"`)
    res.send(json)
  } catch (e) { next(e) }
})

// POST /api/backup/import - admin only
router.post('/import', authRequired, requireRole('Admin','admin'), async (req, res, next) => {
  try {
    const d = req.body || {}
    console.log('[Import] Starting restore, keys:', Object.keys(d).join(', '))
    
    // Drop all collections first (clean slate)
    const mongoose = (await import('mongoose')).default
    const db = mongoose.connection.db
    const collections = await db.listCollections().toArray()
    for (const c of collections) {
      try {
        await db.dropCollection(c.name)
        console.log(`[Import] Dropped collection: ${c.name}`)
      } catch (e) {
        // Collection may not exist, ignore
      }
    }
    
    // Insert all data
    const insert = async (Model, arr, name) => {
      if (Array.isArray(arr) && arr.length) {
        try {
          await Model.insertMany(arr, { ordered: false })
          console.log(`[Import] Inserted ${arr.length} ${name}`)
        } catch (e) {
          console.warn(`[Import] Partial insert for ${name}:`, e.message)
        }
      }
    }

    await insert(Settings, d.settings, 'settings')
    await insert(StaffSettings, d.staffSettings, 'staffSettings')
    await insert(MenuItem, d.menu, 'menu')
    await insert(Category, d.categories, 'categories')
    await insert(Ingredient, d.ingredients, 'ingredients')
    await insert(Supply, d.supplies, 'supplies')
    await insert(Customer, d.customers, 'customers')
    await insert(Staff, d.staff, 'staff')
    await insert(Rider, d.riders, 'riders')
    await insert(RiderCash, d.riderCash, 'riderCash')
    await insert(Supplier, d.suppliers, 'suppliers')
    await insert(Expense, d.expenses, 'expenses')
    await insert(Sale, d.sales, 'sales')
    await insert(Attendance, d.attendance, 'attendance')
    await insert(Audit, d.audit, 'audit')
    await insert(CashOpening, d.cashOpenings, 'cashOpenings')
    await insert(AdvanceBooking, d.advanceBookings, 'advanceBookings')
    await insert(Return, d.returns, 'returns')
    await insert(PayInOut, d.payInOuts, 'payInOuts')
    await insert(DayClose, d.dayCloses, 'dayCloses')
    await insert(Table, d.tables, 'tables')
    await insert(CashCount, d.cashCounts, 'cashCounts')
    await insert(Held, d.helds, 'helds')
    await insert(Kot, d.kots, 'kots')
    await insert(Recall, d.recalls, 'recalls')
    await insert(Void, d.voids, 'voids')
    await insert(StaffAdvance, d.staffAdvances, 'staffAdvances')
    await insert(StaffEarning, d.staffEarnings, 'staffEarnings')
    await insert(PayrollRun, d.payrollRuns, 'payrollRuns')
    await insert(DeletedSale, d.deletedSales, 'deletedSales')
    await insert(Role, d.roles, 'roles')
    await insert(BiometricEvent, d.biometricEvents, 'biometricEvents')
    await insert(BiometricMapping, d.biometricMappings, 'biometricMappings')
    await insert(BiometricSyncState, d.biometricSyncStates, 'biometricSyncStates')
    if (Array.isArray(d.users)) await insert(User, d.users, 'users')
    if (Array.isArray(d.counters)) await insert(Counter, d.counters, 'counters')

    console.log('[Import] Restore completed successfully')
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// POST /api/backup/reset - admin only; wipe transactional data but PRESERVE Menu, Categories, and Users
router.post('/reset', authRequired, requireRole('Admin','admin'), async (req, res, next) => {
  try {
    const keepUsers = true // Always preserve users per latest requirement
    await Promise.all([
      Settings.deleteMany({}),
      StaffSettings.deleteMany({}),
      // Preserve Menu Items
      Customer.deleteMany({}),
      Staff.deleteMany({}),
      Rider.deleteMany({}),
      RiderCash.deleteMany({}),
      Supplier.deleteMany({}),
      Expense.deleteMany({}),
      Sale.deleteMany({}),
      Attendance.deleteMany({}),
      Audit.deleteMany({}),
      CashOpening.deleteMany({}),
      AdvanceBooking.deleteMany({}),
      Return.deleteMany({}),
      PayInOut.deleteMany({}),
      DayClose.deleteMany({}),
      Table.deleteMany({}),
      CashCount.deleteMany({}),
      Held.deleteMany({}),
      Kot.deleteMany({}),
      Recall.deleteMany({}),
      Void.deleteMany({}),
      StaffPayNote.deleteMany({}),
      DeletedSale.deleteMany({}),
      Role.deleteMany({}),
      BiometricEvent.deleteMany({}),
      BiometricMapping.deleteMany({}),
      BiometricSyncState.deleteMany({}),
      // Preserve Categories and Users unconditionally
      // Category.deleteMany({}),
      Promise.resolve(),
    ])
    console.log('[Reset] Transactional data cleared, Menu/Categories/Users preserved')
    res.json({ ok: true })
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

    const byKey = new Map(BRANCH_PURGE_TARGETS.map(t => [t.key, t]))
    const filter = branchFilter(branchId)
    const results = []
    let totalDeleted = 0

    for (const key of keys) {
      const t = byKey.get(key)
      if (!t) {
        results.push({ key, error: 'Unknown collection' })
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

// POST /api/backup/purge - admin only; wipe ALL data including Menu, Categories, etc. Users preserved by default
router.post('/purge', authRequired, requireRole('Admin','admin'), async (req, res, next) => {
  try {
    const includeUsers = String(req.query.includeUsers).toLowerCase() === 'true'
    const mongoose = (await import('mongoose')).default
    const db = mongoose.connection.db
    
    // List of collections to drop (preserve users if requested)
    const collectionsToDrop = [
      'settings', 'staffsettings', 'menuitems', 'categories', 'ingredients', 'supplies',
      'customers', 'staffs', 'riders', 'ridercashes', 'suppliers', 'expenses',
      'sales', 'deletedsales', 'attendances', 'audits', 'cashopenings', 'cashhandovers',
      'advancebookings', 'returns', 'payinouts', 'daycloses', 'tables', 'cashcounts',
      'helds', 'kots', 'recalls', 'voids', 'staffpaynotes', 'staffadvances', 'staffearnings', 'payrollruns', 'counters', 'roles',
      'biometricevents', 'biometricmappings', 'biometricsyncstates'
    ]
    if (includeUsers) collectionsToDrop.push('users')
    
    for (const name of collectionsToDrop) {
      try {
        await db.dropCollection(name)
        console.log(`[Purge] Dropped collection: ${name}`)
      } catch (e) {
        // Collection may not exist, ignore
      }
    }
    console.log(`[Purge] All data deleted. Users ${includeUsers ? 'DELETED' : 'PRESERVED'}`)
    res.json({ ok: true, includeUsers })
  } catch (e) { next(e) }
})

router.get('/export-and-purge', authRequired, requireRole('Admin','admin'), async (req, res, next) => {
  try {
    const includeUsers = String(req.query.includeUsers).toLowerCase() === 'true'
    const payload = await dumpAll()
    const json = JSON.stringify(payload)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="rms-backup-${new Date().toISOString().slice(0,10)}.json"`)
    res.on('finish', async () => {
      try {
        const mongoose = (await import('mongoose')).default
        const db = mongoose.connection.db
        const collectionsToDrop = [
          'settings', 'staffsettings', 'menuitems', 'categories', 'ingredients', 'supplies',
          'customers', 'staffs', 'riders', 'ridercashes', 'suppliers', 'expenses',
          'sales', 'deletedsales', 'attendances', 'audits', 'cashopenings', 'cashhandovers',
          'advancebookings', 'returns', 'payinouts', 'daycloses', 'tables', 'cashcounts',
          'helds', 'kots', 'recalls', 'voids', 'staffpaynotes', 'staffadvances', 'staffearnings', 'payrollruns', 'counters', 'roles',
          'biometricevents', 'biometricmappings', 'biometricsyncstates'
        ]
        if (includeUsers) collectionsToDrop.push('users')
        for (const name of collectionsToDrop) {
          try {
            await db.dropCollection(name)
          } catch (e) {}
        }
        console.log('[Export-Purge] Database purged after export')
      } catch (err) {
        console.error('Failed to purge after export:', err)
      }
    })
    res.send(json)
  } catch (e) { next(e) }
})

export default router
