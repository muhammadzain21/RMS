import { Router } from 'express'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Role from '../models/Role.js'
import { authRequired, signToken } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'

const router = Router()

// Helper to get user permissions based on role
async function getUserWithPermissions(user) {
  const userData = {
    id: user._id,
    username: user.username,
    role: user.role
  }
  
  // If user has a custom role (not Admin), fetch permissions from Role collection
  if (user.role && user.role !== 'Admin' && user.role !== 'SuperAdmin') {
    const role = await Role.findOne({ name: user.role })
    if (role) {
      userData.permissions = role.permissions
    }
  }
  
  return userData
}

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) return res.status(400).json({ error: 'username and password are required' })
    const user = await User.findOne({ username })
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    const token = signToken(user)
    await logAudit(req, 'auth', 'Login success', { username }, { id: user._id?.toString?.() || '', username: user.username || 'user' })
    const userWithPerms = await getUserWithPermissions(user)
    res.json({ token, user: userWithPerms })
  } catch (e) { next(e) }
})

// POST /api/auth/register
// Allows first user bootstrap if no users exist; otherwise require Admin token
router.post('/register', async (req, res, next) => {
  try {
    const count = await User.countDocuments()
    const { username, password, role = 'Admin' } = req.body || {}
    if (!username || !password) return res.status(400).json({ error: 'username and password are required' })

    if (count > 0) {
      // If users exist, block open registration
      return res.status(403).json({ error: 'Registration closed. Use admin to create users.' })
    }

    const exists = await User.findOne({ username })
    if (exists) return res.status(409).json({ error: 'Username exists' })
    const passwordHash = await bcrypt.hash(password, 10)
    const created = await User.create({ username, passwordHash, role })
    const token = signToken(created)
    res.status(201).json({ token, user: { id: created._id, username: created.username, role: created.role } })
  } catch (e) { next(e) }
})

export default router
// GET /api/auth/me - return current user from token with permissions
router.get('/me', authRequired, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const userWithPerms = await getUserWithPermissions(user)
    res.json({ user: userWithPerms })
  } catch (e) { next(e) }
})
