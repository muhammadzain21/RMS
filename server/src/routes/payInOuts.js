import { Router } from 'express'
import PayInOut from '../models/PayInOut.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { blockIfClosedFromBody, blockIfClosedFromModel } from '../middleware/dayClosed.js'
import { logAudit } from '../middleware/auditLog.js'

const router = Router()
router.use(authRequired)

// GET /api/pay-in-outs?from=YYYY-MM-DD&to=YYYY-MM-DD&type=IN|OUT&page=1&limit=20&search=
router.get('/', async (req, res, next) => {
  try {
    const { from, to, type, page = 1, limit = 20, search = '' } = req.query
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20))

    let query = {}
    if (from || to) query.date = { ...(from ? { $gte: String(from) } : {}), ...(to ? { $lte: String(to) } : {}) }
    if (type) query.type = String(type)
    if (search.trim()) {
      const regex = { $regex: String(search), $options: 'i' }
      query.$or = [
        { date: regex },
        { type: regex },
        { category: regex },
        { note: regex },
        { userName: regex },
      ]
    }
    const { mergeBranchFilter } = await import('../utils/branchScope.js')
    query = mergeBranchFilter(req, query)

    const total = await PayInOut.countDocuments(query)
    const rows = await PayInOut.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)

    res.json({ rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) })
  } catch (e) { next(e) }
})

router.post('/', requireRole('Admin','Manager'), blockIfClosedFromBody('date'), async (req, res, next) => {
  try {
    const body = req.body || {}
    const { stampBranchId } = await import('../utils/branchScope.js')
    const rec = await PayInOut.create(stampBranchId(req, {
      date: String(body.date),
      type: String(body.type || 'IN'),
      amount: Number(body.amount || 0),
      category: body.category || '',
      note: body.note || '',
      userId: req.user?.id || '',
      userName: req.user?.username || '',
    }))
    await logAudit(req, 'cash', `Pay ${rec.type} ${rec.amount} on ${rec.date}`, { id: rec._id })
    res.status(201).json(rec)
  } catch (e) { next(e) }
})

router.patch('/:id', requireRole('Admin','Manager'), blockIfClosedFromModel(PayInOut), async (req, res, next) => {
  try {
    const rec = await PayInOut.findByIdAndUpdate(req.params.id, req.body, { new: true })
    await logAudit(req, 'cash', `Updated pay IO ${req.params.id}`, { id: req.params.id, patch: req.body })
    res.json(rec)
  } catch (e) { next(e) }
})

router.delete('/:id', requireRole('Admin','Manager'), blockIfClosedFromModel(PayInOut), async (req, res, next) => {
  try {
    await PayInOut.findByIdAndDelete(req.params.id)
    await logAudit(req, 'cash', `Deleted pay IO ${req.params.id}`, { id: req.params.id })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
