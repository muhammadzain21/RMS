import { Router } from 'express'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()

router.use(authRequired)

// GET /api/audit?from=YYYY-MM-DD&to=YYYY-MM-DD&userId=...&q=...
router.get('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const { from, to, userId, q, type } = req.query
    const query = {}
    if (from || to) query.at = { ...(from ? { $gte: String(from) } : {}), ...(to ? { $lte: String(to) } : {}) }
    if (userId) query.userId = String(userId)
    if (q) query.action = { $regex: String(q), $options: 'i' }
    if (type) query.type = String(type)
    const limit = Math.min(500, Number(req.query.limit || 200))
    const page = Math.max(0, Number(req.query.page || 0))
    const rows = await Audit.find(query).sort({ createdAt: -1 }).skip(page * limit).limit(limit)
    res.json(rows)
  } catch (e) { next(e) }
})

// POST /api/audit  { type, action, meta }
// Allow any authenticated user to log an audit entry for client-side actions (e.g., logout)
router.post('/', async (req, res, next) => {
  try {
    const { type = 'general', action = '', meta = {} } = req.body || {}
    if (!action) return res.status(400).json({ error: 'action required' })
    const created = await Audit.create({
      type: String(type || 'general'),
      action: String(action),
      meta: meta || {},
      userId: req.user?.id || '',
      userName: req.user?.username || 'system',
    })
    res.status(201).json(created)
  } catch (e) { next(e) }
})

export default router
