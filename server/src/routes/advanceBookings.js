import { Router } from 'express'
import AdvanceBooking from '../models/AdvanceBooking.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'

const router = Router()
router.use(authRequired)

// GET /api/advance-bookings?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', async (req, res, next) => {
  try {
    const { from, to, status } = req.query
    let query = {}
    if (from || to) query.date = { ...(from ? { $gte: String(from) } : {}), ...(to ? { $lte: String(to) } : {}) }
    if (status) query.status = String(status)
    const { mergeBranchFilter } = await import('../utils/branchScope.js')
    query = mergeBranchFilter(req, query)
    const rows = await AdvanceBooking.find(query).sort({ date: -1, createdAt: -1 })
    res.json(rows)
  } catch (e) { next(e) }
})

router.post('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const { stampBranchId } = await import('../utils/branchScope.js')
    const b = await AdvanceBooking.create(stampBranchId(req, {
      date: String(req.body?.date),
      time: req.body?.time || '',
      customer: req.body?.customer || '',
      phone: req.body?.phone || '',
      deposit: Number(req.body?.deposit || 0),
      status: req.body?.status || 'Booked',
      note: req.body?.note || '',
      settledSaleId: req.body?.settledSaleId || '',
      userId: req.user?.id || '',
      userName: req.user?.username || '',
    }))
    await logAudit(req, 'booking', `Advance booking ${b.customer || b.phone || b._id} on ${b.date}`, { id: b._id })
    res.status(201).json(b)
  } catch (e) { next(e) }
})

router.patch('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const b = await AdvanceBooking.findByIdAndUpdate(req.params.id, req.body, { new: true })
    await logAudit(req, 'booking', `Updated advance booking ${req.params.id}`, { id: req.params.id, patch: req.body })
    res.json(b)
  } catch (e) { next(e) }
})

router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    await AdvanceBooking.findByIdAndDelete(req.params.id)
    await logAudit(req, 'booking', `Deleted advance booking ${req.params.id}`, { id: req.params.id })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
