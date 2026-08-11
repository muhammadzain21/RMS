import { Router } from 'express'
import CashHandover from '../models/CashHandover.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { blockIfClosedFromBody, blockIfClosedFromModel } from '../middleware/dayClosed.js'
import { logAudit } from '../middleware/auditLog.js'

const router = Router()
router.use(authRequired)

// GET /api/cash-handovers?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&limit=20&search=
router.get('/', async (req, res, next) => {
  try {
    const { from, to, page = 1, limit = 20, search = '' } = req.query
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20))

    const query = {}
    if (from || to) query.date = { ...(from ? { $gte: String(from) } : {}), ...(to ? { $lte: String(to) } : {}) }
    if (search.trim()) {
      const regex = { $regex: String(search), $options: 'i' }
      query.$or = [
        { date: regex },
        { receiver: regex },
        { note: regex },
        { userName: regex },
      ]
    }

    const total = await CashHandover.countDocuments(query)
    const rows = await CashHandover.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)

    res.json({ rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) })
  } catch (e) { next(e) }
})

router.post('/', requireRole('Admin','Manager'), blockIfClosedFromBody('date'), async (req, res, next) => {
  try {
    const body = req.body || {}
    const rec = await CashHandover.create({
      date: String(body.date),
      amount: Number(body.amount || 0),
      receiver: body.receiver || '',
      note: body.note || '',
      userId: req.user?.id || '',
      userName: req.user?.username || '',
    })
    await logAudit(req, 'cash', `Cash handover ${rec.amount} on ${rec.date} to ${rec.receiver || '-'}`, { id: rec._id })
    res.status(201).json(rec)
  } catch (e) { next(e) }
})

router.patch('/:id', requireRole('Admin','Manager'), blockIfClosedFromModel(CashHandover), async (req, res, next) => {
  try {
    const rec = await CashHandover.findByIdAndUpdate(req.params.id, req.body, { new: true })
    await logAudit(req, 'cash', `Updated cash handover ${req.params.id}`, { id: req.params.id, patch: req.body })
    res.json(rec)
  } catch (e) { next(e) }
})

router.delete('/:id', requireRole('Admin','Manager'), blockIfClosedFromModel(CashHandover), async (req, res, next) => {
  try {
    await CashHandover.findByIdAndDelete(req.params.id)
    await logAudit(req, 'cash', `Deleted cash handover ${req.params.id}`, { id: req.params.id })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
