import { Router } from 'express'
import User from '../models/User.js'
import Staff from '../models/Staff.js'
import { authRequired } from '../middleware/auth.js'
import { getStaffSnapshot } from '../utils/staffSnapshot.js'

const router = Router()

// Staff self-service inside the main app — resolves the logged-in user's
// linked staff record, so a staff member can only ever read their own data.
router.use(authRequired)

async function linkedStaffId(req, res) {
  const user = await User.findById(req.user.id).lean()
  if (!user) {
    res.status(401).json({ error: 'User not found' })
    return null
  }
  if (!user.staffId) {
    res.status(403).json({ error: 'This account is not linked to a staff member' })
    return null
  }
  return String(user.staffId)
}

// GET /api/my/me?month=YYYY-MM&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/me', async (req, res, next) => {
  try {
    const staffId = await linkedStaffId(req, res)
    if (!staffId) return
    const month = String(req.query.month || '').slice(0, 7) // 'YYYY-MM'
    const from = String(req.query.from || '').slice(0, 10)
    const to = String(req.query.to || '').slice(0, 10)
    const snapshot = await getStaffSnapshot(staffId, month, { from, to })
    if (!snapshot) return res.status(404).json({ error: 'Staff record not found' })
    res.json(snapshot)
  } catch (e) { next(e) }
})

export default router
