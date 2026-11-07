import { Router } from 'express'
import Role from '../models/Role.js'
import User from '../models/User.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { defaultSidebarItems, mergePermissions } from '../utils/sidebarDefaults.js'
import { isHqUser } from '../utils/branchScope.js'

const router = Router()

// All routes require authentication only (permissions handled at sidebar level)
router.use(authRequired)

function isAdminActor(user) {
  return user?.role === 'Admin' || user?.role === 'SuperAdmin' || isHqUser(user)
}

/** Paths a non-admin may turn on for a role (subset of their own access). */
async function resolveActorGrantablePaths(actor) {
  if (isAdminActor(actor)) return null
  const dbUser = await User.findById(actor.id || actor._id)
  if (!dbUser) return new Set()
  let perms = []
  if (dbUser.useCustomPermissions && Array.isArray(dbUser.permissions)) {
    perms = dbUser.permissions
  } else if (dbUser.role) {
    const role = await Role.findOne({ name: dbUser.role })
    perms = Array.isArray(role?.permissions) ? role.permissions : []
  }
  return new Set(
    perms.filter(p => p?.visible && p.path && p.path !== '/my').map(p => String(p.path))
  )
}

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

function assertAdmin(req, res) {
  if (!isAdminActor(req.user)) {
    res.status(403).json({ error: 'Only admin can manage roles' })
    return false
  }
  return true
}

// POST /api/roles - Create new role (Admin only)
router.post('/', async (req, res, next) => {
  try {
    if (!assertAdmin(req, res)) return
    const { name, description, permissions } = req.body || {}
    if (!name) return res.status(400).json({ error: 'Role name is required' })
    if (['Admin', 'SuperAdmin'].includes(String(name).trim())) {
      return res.status(400).json({ error: 'Cannot create a reserved role name' })
    }

    const exists = await Role.findOne({ name: name.trim() })
    if (exists) return res.status(409).json({ error: 'Role already exists' })

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

// PATCH /api/roles/:id — Admin: full update; Manager: permissions only (limited to their pages)
router.patch('/:id', async (req, res, next) => {
  try {
    const hq = isAdminActor(req.user)
    const { name, description, permissions } = req.body || {}
    const role = await Role.findById(req.params.id)
    if (!role) return res.status(404).json({ error: 'Role not found' })

    const updates = {}
    if (hq) {
      if (name !== undefined) updates.name = name.trim()
      if (description !== undefined) updates.description = description
      if (permissions !== undefined) updates.permissions = permissions
    } else {
      if (name !== undefined || description !== undefined) {
        return res.status(403).json({ error: 'Only admin can rename roles' })
      }
      if (permissions === undefined) {
        return res.status(400).json({ error: 'permissions required' })
      }
      const grantable = await resolveActorGrantablePaths(req.user)
      const incoming = Array.isArray(permissions) ? permissions : []
      const byPath = new Map(incoming.map(p => [String(p.path), p]))
      const next = mergePermissions(role.permissions).map(p => {
        const path = String(p.path)
        if (!grantable.has(path)) return p // keep pages outside manager's grant set
        const patched = byPath.get(path)
        if (!patched) return { ...p, visible: false }
        return { ...p, visible: !!patched.visible }
      })
      updates.permissions = next
    }

    const updated = await Role.findByIdAndUpdate(req.params.id, updates, { new: true })
    if (!updated) return res.status(404).json({ error: 'Not found' })

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

// DELETE /api/roles/:id - Delete role (Admin only)
router.delete('/:id', async (req, res, next) => {
  try {
    if (!assertAdmin(req, res)) return
    const role = await Role.findById(req.params.id)
    if (!role) return res.status(404).json({ error: 'Role not found' })
    if (role.isDefault) return res.status(400).json({ error: 'Cannot delete default role' })

    await Role.findByIdAndDelete(req.params.id)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// POST /api/roles/:id/reset - Reset role permissions to defaults (Admin only)
router.post('/:id/reset', async (req, res, next) => {
  try {
    if (!assertAdmin(req, res)) return
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
