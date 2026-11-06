import { Router } from 'express'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { defaultSidebarItems } from '../utils/sidebarDefaults.js'

function toPublicUser(u) {
  const custom = !!u.useCustomPermissions
  return {
    id: u._id,
    username: u.username,
    role: u.role,
    useCustomPermissions: custom,
    pageAccess: custom
      ? (u.permissions || []).filter(p => p.visible && p.path !== '/my').map(p => p.path)
      : null,
  }
}

function pageAccessUpdates(body) {
  if (!body || !('pageAccess' in body)) return {}
  if (body.pageAccess === null) {
    return { useCustomPermissions: false, permissions: [] }
  }
  if (Array.isArray(body.pageAccess)) {
    const allowed = new Set(body.pageAccess)
    return {
      useCustomPermissions: true,
      permissions: defaultSidebarItems
        .filter(i => i.path !== '/my')
        .map(i => ({
          path: i.path,
          label: i.label,
          visible: allowed.has(i.path),
          order: i.order,
          section: i.section,
        })),
    }
  }
  return {}
}

const router = Router()

// All routes require authentication only (permissions handled at sidebar level)
router.use(authRequired)

// GET /api/users
router.get('/', async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 })
    // SuperAdmin accounts are invisible to regular admins
    const filtered = req.user?.role === 'SuperAdmin' ? users : users.filter(u => u.role !== 'SuperAdmin')
    res.json(filtered.map(toPublicUser))
  } catch (e) { next(e) }
})

// POST /api/users
router.post('/', async (req, res, next) => {
  try {
    const { username, password, role = 'Admin', staffId = '' } = req.body || {}
    if (!username || !password) return res.status(400).json({ error: 'username and password are required' })
    if (role === 'SuperAdmin' && req.user?.role !== 'SuperAdmin') {
      return res.status(403).json({ error: 'Only superadmin can create superadmin users' })
    }
    const exists = await User.findOne({ username })
    if (exists) return res.status(409).json({ error: 'Username exists' })
    const passwordHash = await bcrypt.hash(password, 10)
    const created = await User.create({ username, passwordHash, role, staffId, ...pageAccessUpdates(req.body) })
    try { await Audit.create({ type: 'user', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Created user ${created.username}`, meta: { id: created._id, role: created.role } }) } catch {}
    res.status(201).json(toPublicUser(created))
  } catch (e) { next(e) }
})

// PATCH /api/users/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { username, password, role, staffId } = req.body || {}
    const target = await User.findById(req.params.id)
    if (!target) return res.status(404).json({ error: 'Not found' })
    if (req.user?.role !== 'SuperAdmin' && (target.role === 'SuperAdmin' || role === 'SuperAdmin')) {
      return res.status(403).json({ error: 'Cannot modify superadmin account' })
    }
    const updates = { ...pageAccessUpdates(req.body) }
    if (username !== undefined) updates.username = username
    if (role !== undefined) updates.role = role
    if (staffId !== undefined) updates.staffId = staffId
    if (password) updates.passwordHash = await bcrypt.hash(password, 10)
    const updated = await User.findByIdAndUpdate(req.params.id, updates, { new: true })
    if (!updated) return res.status(404).json({ error: 'Not found' })
    try { await Audit.create({ type: 'user', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Updated user ${updated.username}`, meta: { id: updated._id, patch: Object.keys(req.body||{}) } }) } catch {}
    res.json(toPublicUser(updated))
  } catch (e) { next(e) }
})

// DELETE /api/users/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id)
    if (target?.role === 'SuperAdmin' && req.user?.role !== 'SuperAdmin') {
      return res.status(403).json({ error: 'Cannot delete superadmin account' })
    }
    await User.findByIdAndDelete(req.params.id)
    try { await Audit.create({ type: 'user', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Deleted user ${req.params.id}`, meta: { id: req.params.id } }) } catch {}
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
