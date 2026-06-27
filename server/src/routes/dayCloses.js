import { Router } from 'express'
import DayClose from '../models/DayClose.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'
 

const router = Router()
router.use(authRequired)

// GET /api/day-closes?from=YYYY-MM-DD&to=YYYY-MM-DD
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
        DayClose.find(query).sort({ date: -1, createdAt: -1 }).skip((p - 1) * lim).limit(lim),
        DayClose.countDocuments(query),
      ])
      res.json({ rows, total, page: p, limit: lim })
      return
    }
    const rows = await DayClose.find(query).sort({ date: -1, createdAt: -1 })
    res.json(rows)
  } catch (e) { next(e) }
})

// Create a day close record (one per date)
router.post('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const body = req.body || {}
    const date = String(body.date)
    const existing = await DayClose.findOne({ date })
    if (existing) return res.status(409).json({ error: 'Day already closed for this date' })
    const rec = await DayClose.create({
      date,
      openingCash: Number(body.openingCash||0),
      cashSales: Number(body.cashSales||0),
      cardSales: Number(body.cardSales||0),
      partySales: 0,
      returns: Number(body.returns||0),
      handovers: Number(body.handovers||0),
      payIns: Number(body.payIns||0),
      payOuts: Number(body.payOuts||0),
      expectedCash: Number(body.expectedCash||0),
      countedCash: Number(body.countedCash||0),
      variance: Number(body.variance||0),
      note: body.note || '',
      userId: req.user?.id || '',
      userName: req.user?.username || '',
    })

    await logAudit(req, 'day', `Day closed ${rec.date} variance ${rec.variance}`, { id: rec._id })
    res.status(201).json(rec)
  } catch (e) { next(e) }
})

// Re-open a closed day by date (Admin/Manager)
router.post('/reopen', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const date = String(req.body?.date || '')
    if (!date) return res.status(400).json({ error: 'date is required' })
    const existing = await DayClose.findOne({ date })
    if (!existing) return res.status(404).json({ error: 'No day close found for date' })
    await DayClose.deleteOne({ _id: existing._id })
    await logAudit(req, 'day', `Re-opened day ${date}`, { date, id: existing._id })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// Delete a day close (admin only)
router.delete('/:id', requireRole('Admin'), async (req, res, next) => {
  try {
    const rec = await DayClose.findByIdAndDelete(req.params.id)
    await logAudit(req, 'day', `Deleted day close ${req.params.id}`, { id: req.params.id, date: rec?.date })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
