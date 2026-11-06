import { Router } from 'express'
import Role from '../models/Role.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { defaultSidebarItems, mergePermissions } from '../utils/sidebarDefaults.js'

const router = Router()

// All routes require authentication only (permissions handled at sidebar level)
router.use(authRequired)

// GET /api/roles - Get all roles
router.get('/', async (_req, res, next) => {
  try {
    const roles = await Role.find().sort({ createdAt: -1 })
    res.json(roles.map(r => ({
      id: r._id,
      name: r.name,
      description: r.description,
      isDefault: r.isDefault,
      permissions: mergePermissions(r.permissions),
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
      permissions: mergePermissions(role.permissions),
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
