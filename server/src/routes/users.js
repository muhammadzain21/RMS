import { Router } from 'express'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()

// All routes require authentication only (permissions handled at sidebar level)
router.use(authRequired)

// GET /api/users
router.get('/', async (_req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 })
    res.json(users.map(u => ({ id: u._id, username: u.username, role: u.role })))
  } catch (e) { next(e) }
})

// POST /api/users
router.post('/', async (req, res, next) => {
  try {
    const { username, password, role = 'Admin' } = req.body || {}
    if (!username || !password) return res.status(400).json({ error: 'username and password are required' })
    const exists = await User.findOne({ username })
    if (exists) return res.status(409).json({ error: 'Username exists' })
    const passwordHash = await bcrypt.hash(password, 10)
    const created = await User.create({ username, passwordHash, role })
    try { await Audit.create({ type: 'user', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Created user ${created.username}`, meta: { id: created._id, role: created.role } }) } catch {}
    res.status(201).json({ id: created._id, username: created.username, role: created.role })
  } catch (e) { next(e) }
})

// PATCH /api/users/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { username, password, role } = req.body || {}
    const updates = {}
    if (username !== undefined) updates.username = username
    if (role !== undefined) updates.role = role
    if (password) updates.passwordHash = await bcrypt.hash(password, 10)
    const updated = await User.findByIdAndUpdate(req.params.id, updates, { new: true })
    if (!updated) return res.status(404).json({ error: 'Not found' })
    try { await Audit.create({ type: 'user', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Updated user ${updated.username}`, meta: { id: updated._id, patch: Object.keys(req.body||{}) } }) } catch {}
    res.json({ id: updated._id, username: updated.username, role: updated.role })
  } catch (e) { next(e) }
})

// DELETE /api/users/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await User.findByIdAndDelete(req.params.id)
    try { await Audit.create({ type: 'user', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Deleted user ${req.params.id}`, meta: { id: req.params.id } }) } catch {}
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
