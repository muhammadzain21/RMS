import { Router } from 'express'
import CashOpening from '../models/CashOpening.js'
import Settings from '../models/Settings.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'

const router = Router()
router.use(authRequired)

// GET /api/cash-openings?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&limit=20&search=xyz
router.get('/', async (req, res, next) => {
  try {
    const { from, to, page, limit, search, q } = req.query
    const query = {}
    if (from || to) query.date = { ...(from ? { $gte: String(from) } : {}), ...(to ? { $lte: String(to) } : {}) }
    const s = String(search || q || '').trim()
    if (s) {
      const rx = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      query.$or = [{ date: rx }, { note: rx }, { userName: rx }]
    }
    if (page) {
      const p = Math.max(1, parseInt(page, 10) || 1)
      const lim = Math.max(1, Math.min(500, parseInt(limit, 10) || 50))
      const [rows, total] = await Promise.all([
        CashOpening.find(query).sort({ date: -1, createdAt: -1 }).skip((p - 1) * lim).limit(lim),
        CashOpening.countDocuments(query),
      ])
      res.json({ rows, total, page: p, limit: lim })
      return
    }
    const rows = await CashOpening.find(query).sort({ date: -1, createdAt: -1 })
    res.json(rows)
  } catch (e) { next(e) }
})

router.post('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const body = req.body || {}
    const date = String(body.date || '')
    if (!date) return res.status(400).json({ error: 'date is required' })
    const openingCash = Number(body.openingCash || 0)
    const rec = await CashOpening.findOneAndUpdate(
      { date },
      {
        $set: {
          date,
          openingCash,
          note: body.note || '',
          userId: req.user?.id || '',
          userName: req.user?.username || '',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    await logAudit(req, 'day', `Day opened ${rec.date} with ${rec.openingCash}`, { id: rec._id })
    res.status(201).json(rec)
  } catch (e) { next(e) }
})

router.patch('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const rec = await CashOpening.findByIdAndUpdate(req.params.id, req.body, { new: true })
    await logAudit(req, 'day', `Updated cash opening ${req.params.id}`, { id: req.params.id, patch: req.body })
    res.json(rec)
  } catch (e) { next(e) }
})

router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    // Same secret-key guard as sale deletion
    const provided = req.headers['x-delete-key'] || req.query.key || (req.body && req.body.key) || ''
    const s = await Settings.findOne({}, {}, { sort: { updatedAt: -1, createdAt: -1 } }).lean()
    const expected = String(s?.salesDeleteKey || '')
    if (!expected) return res.status(403).json({ error: 'Delete key not set. Set it in Settings.' })
    if (String(provided || '') !== expected) return res.status(403).json({ error: 'Invalid delete key' })
    await CashOpening.findByIdAndDelete(req.params.id)
    await logAudit(req, 'day', `Deleted cash opening ${req.params.id}`, { id: req.params.id })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
