import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import Staff from '../models/Staff.js'
import User from '../models/User.js'
import { getStaffSnapshot } from '../utils/staffSnapshot.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me'

// Staff-portal tokens carry scope:'staff-portal' so they can never access admin APIs
function staffPortalRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing token' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    if (payload?.scope !== 'staff-portal' || !payload.id) {
      return res.status(401).json({ error: 'Invalid token' })
    }
    req.staffId = String(payload.id)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

// POST /api/staff-portal/login { username, password } -> { token, staff }
// Signs in a staff-linked user account and returns a portal-scoped token.
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' })
    const user = await User.findOne({ username: String(username).trim() })
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })
    const ok = await bcrypt.compare(String(password), user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    if (!user.staffId) return res.status(403).json({ error: 'This account is not linked to a staff member' })
    const staff = await Staff.findById(user.staffId)
    if (!staff || staff.status !== 'Active') return res.status(401).json({ error: 'Staff record not found or inactive' })
    const token = jwt.sign(
      { id: String(staff._id), username: staff.name, role: 'StaffSelf', scope: 'staff-portal' },
      JWT_SECRET,
      { expiresIn: '90d' }
    )
    res.json({
      token,
      staff: { id: String(staff._id), name: staff.name, position: staff.position || '' },
    })
  } catch (e) { next(e) }
})

// GET /api/staff-portal/me?month=YYYY-MM — profile + month data, staff can only see their own
router.get('/me', staffPortalRequired, async (req, res, next) => {
  try {
    const month = String(req.query.month || '').slice(0, 7) // 'YYYY-MM'
    const snapshot = await getStaffSnapshot(req.staffId, month)
    if (!snapshot) return res.status(404).json({ error: 'Staff not found' })
    res.json(snapshot)
  } catch (e) { next(e) }
})

export default router
