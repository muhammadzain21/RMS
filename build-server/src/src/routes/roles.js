import { Router } from 'express'
import Role from '../models/Role.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()

// All routes require authentication only (permissions handled at sidebar level)
router.use(authRequired)

// Default sidebar items configuration - all hidden by default, user selects which to enable
// Must match client src/layout/navConfig.js sidebarItems exactly
const defaultSidebarItems = [
  { path: '/', label: 'Dashboard', visible: false, order: 1, section: 'Dashboard' },
  // Sales submenu items (must match Layout.jsx salesSubItems exactly)
  { path: '/sales/new', label: 'Sell', visible: false, order: 2, section: 'Sales' },
  { path: '/sales/return', label: 'Return', visible: false, order: 3, section: 'Sales' },
  { path: '/sales/history', label: 'Sale history', visible: false, order: 4, section: 'Sales' },
  { path: '/sales/deleted', label: 'Deleted Sales', visible: false, order: 5, section: 'Sales' },
  { path: '/sales/return-history', label: 'Return history', visible: false, order: 6, section: 'Sales' },
  { path: '/sales/kot-history', label: 'KOT History', visible: false, order: 7, section: 'Sales' },
  { path: '/sales/void-history', label: 'Void History', visible: false, order: 8, section: 'Sales' },
  { path: '/sales/cash-opening', label: 'Cash Opening', visible: false, order: 9, section: 'Sales' },
  { path: '/sales/cash-handover', label: 'Cash Handover', visible: false, order: 10, section: 'Sales' },
  { path: '/sales/cash-count', label: 'Manager Cash Count', visible: false, order: 11, section: 'Sales' },
  { path: '/sales/advance-booking', label: 'Advance Booking', visible: false, order: 12, section: 'Sales' },
  { path: '/sales/day-close', label: 'Day Close', visible: false, order: 13, section: 'Sales' },
  { path: '/sales/pay-in-out', label: 'Pay In/Out', visible: false, order: 14, section: 'Sales' },
  // Other pages (must match Layout.jsx allNavItems exactly)
  { path: '/inventory', label: 'Inventory', visible: false, order: 15, section: 'Operations' },
  { path: '/supply/history', label: 'Supply', visible: false, order: 16, section: 'Operations' },
  { path: '/demands', label: 'Demands', visible: false, order: 17, section: 'Operations' },
  { path: '/suppliers', label: 'Suppliers', visible: false, order: 18, section: 'Operations' },
  { path: '/customers', label: 'Customers', visible: false, order: 19, section: 'Operations' },
  { path: '/tables', label: 'Tables', visible: false, order: 20, section: 'Operations' },
  { path: '/menu', label: 'Menu', visible: false, order: 21, section: 'Operations' },
  { path: '/menu/categories', label: 'Categories', visible: false, order: 22, section: 'Operations' },
  { path: '/menu/recipes', label: 'Recipes', visible: false, order: 23, section: 'Operations' },
  { path: '/sales/consumption', label: 'Consumption', visible: false, order: 24, section: 'Operations' },
  { path: '/riders', label: 'Riders', visible: false, order: 25, section: 'Operations' },
  // Staff Management - 5 individual pages
  { path: '/staff/mark-attendance', label: 'Mark Attendance', visible: false, order: 26, section: 'Staff Management' },
  { path: '/staff/add', label: 'Add Staff', visible: false, order: 27, section: 'Staff Management' },
  { path: '/staff/daily', label: 'Daily View', visible: false, order: 28, section: 'Staff Management' },
  { path: '/staff/monthly', label: 'Monthly View', visible: false, order: 29, section: 'Staff Management' },
  { path: '/staff/settings', label: 'Staff Settings', visible: false, order: 30, section: 'Staff Management' },
  { path: '/expenses/new', label: 'Expenses', visible: false, order: 31, section: 'Finance' },
  { path: '/profit-loss', label: 'P&L', visible: false, order: 32, section: 'Finance' },
  { path: '/finance/cashbook', label: 'Cashbook', visible: false, order: 33, section: 'Finance' },
  { path: '/users', label: 'Users', visible: false, order: 34, section: 'Admin' },
  { path: '/sidebar-permissions', label: 'Permissions', visible: false, order: 35, section: 'Admin' },
  { path: '/audit', label: 'Audit', visible: false, order: 36, section: 'Admin' },
  { path: '/settings', label: 'Settings', visible: false, order: 37, section: 'Admin' },
  { path: '/biometric-settings', label: 'Biometric', visible: false, order: 38, section: 'Admin' }
]

// GET /api/roles - Get all roles
router.get('/', async (_req, res, next) => {
  try {
    const roles = await Role.find().sort({ createdAt: -1 })
    res.json(roles.map(r => ({
      id: r._id,
      name: r.name,
      description: r.description,
      isDefault: r.isDefault,
      permissions: r.permissions,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    })))
  } catch (e) { next(e) }
})

// GET /api/roles/:id - Get single role
router.get('/:id', async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id)
    if (!role) return res.status(404).json({ error: 'Role not found' })
    res.json({
      id: role._id,
      name: role.name,
      description: role.description,
      isDefault: role.isDefault,
      permissions: role.permissions,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt
    })
  } catch (e) { next(e) }
})

// POST /api/roles - Create new role
router.post('/', async (req, res, next) => {
  try {
    const { name, description, permissions } = req.body || {}
    if (!name) return res.status(400).json({ error: 'Role name is required' })
    
    const exists = await Role.findOne({ name: name.trim() })
    if (exists) return res.status(409).json({ error: 'Role already exists' })

    // Use provided permissions or default ones
    const rolePermissions = permissions || defaultSidebarItems
    
    const created = await Role.create({
      name: name.trim(),
      description: description || '',
      permissions: rolePermissions,
      isDefault: false
    })
    
    res.status(201).json({
      id: created._id,
      name: created.name,
      description: created.description,
      isDefault: created.isDefault,
      permissions: created.permissions,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt
    })
  } catch (e) { next(e) }
})

// PATCH /api/roles/:id - Update role (name, description, permissions)
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, description, permissions } = req.body || {}
    const updates = {}
    
    if (name !== undefined) updates.name = name.trim()
    if (description !== undefined) updates.description = description
    if (permissions !== undefined) updates.permissions = permissions
    
    const updated = await Role.findByIdAndUpdate(req.params.id, updates, { new: true })
    if (!updated) return res.status(404).json({ error: 'Role not found' })
    
    res.json({
      id: updated._id,
      name: updated.name,
      description: updated.description,
      isDefault: updated.isDefault,
      permissions: updated.permissions,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    })
  } catch (e) { next(e) }
})

// DELETE /api/roles/:id - Delete role (cannot delete default roles)
router.delete('/:id', async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id)
    if (!role) return res.status(404).json({ error: 'Role not found' })
    if (role.isDefault) return res.status(400).json({ error: 'Cannot delete default role' })
    
    await Role.findByIdAndDelete(req.params.id)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// POST /api/roles/:id/reset - Reset role permissions to defaults
router.post('/:id/reset', async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id)
    if (!role) return res.status(404).json({ error: 'Role not found' })
    
    role.permissions = defaultSidebarItems
    role.updatedAt = new Date()
    await role.save()
    
    res.json({
      id: role._id,
      name: role.name,
      description: role.description,
      isDefault: role.isDefault,
      permissions: role.permissions,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt
    })
  } catch (e) { next(e) }
})

// GET /api/roles/defaults/items - Get default sidebar items
router.get('/defaults/items', async (_req, res, next) => {
  try {
    res.json(defaultSidebarItems)
  } catch (e) { next(e) }
})

export default router
