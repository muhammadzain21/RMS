import { Router } from 'express'
import { authRequired, requireRole } from '../middleware/auth.js'
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
import CashHandover from '../models/CashHandover.js'
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
import StaffPayNote from '../models/StaffPayNote.js'
import Counter from '../models/Counter.js'
import User from '../models/User.js'
import DeletedSale from '../models/DeletedSale.js'
import Role from '../models/Role.js'
import { BiometricEvent } from '../biometric/models/BiometricEvent.js'
import { BiometricMapping } from '../biometric/models/BiometricMapping.js'
import { BiometricSyncState } from '../biometric/models/BiometricSyncState.js'

const router = Router()

// Utility to fetch all data
async function dumpAll() {
  const [settings, staffSettings, menu, categories, ingredients, supplies, customers, staff, riders, riderCash, suppliers, expenses, sales, deletedSales, attendance, audit, cashOpenings, cashHandovers, advanceBookings, returns, payInOuts, dayCloses, tables, users, cashCounts, helds, kots, recalls, voids, staffPayNotes, counters, roles, biometricEvents, biometricMappings, biometricSyncStates] = await Promise.all([
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
    CashHandover.find().lean(),
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
    StaffPayNote.find().lean(),
    Counter.find().lean(),
    Role.find().lean(),
    BiometricEvent.find().lean(),
    BiometricMapping.find().lean(),
    BiometricSyncState.find().lean(),
  ])
  return { settings, staffSettings, menu, categories, ingredients, supplies, customers, staff, riders, riderCash, suppliers, expenses, sales, deletedSales, attendance, audit, cashOpenings, cashHandovers, advanceBookings, returns, payInOuts, dayCloses, tables, users, cashCounts, helds, kots, recalls, voids, staffPayNotes, counters, roles, biometricEvents, biometricMappings, biometricSyncStates }
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
    await insert(CashHandover, d.cashHandovers, 'cashHandovers')
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
    await insert(StaffPayNote, d.staffPayNotes, 'staffPayNotes')
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
      CashHandover.deleteMany({}),
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
      'helds', 'kots', 'recalls', 'voids', 'staffpaynotes', 'counters', 'roles',
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
          'helds', 'kots', 'recalls', 'voids', 'staffpaynotes', 'counters', 'roles',
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
