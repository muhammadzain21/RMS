import { Router } from 'express'
import StaffAdvance from '../models/StaffAdvance.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()

// All endpoints require auth
router.use(authRequired)

// GET /api/staff-advances?staffId=...&month=YYYY-MM
router.get('/', async (req, res, next) => {
  try {
    const { staffId, month } = req.query
    const filter = {}
    if (staffId) filter.staffId = staffId
    if (month) filter.month = month
    const rows = await StaffAdvance.find(filter).sort({ createdAt: -1 })
    res.json(rows)
  } catch (e) { next(e) }
})

// POST create
router.post('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const amount = Number(req.body.amount || 0)
    if (!req.body.staffId) return res.status(400).json({ error: 'staffId is required' })
    if (!req.body.month) return res.status(400).json({ error: 'month is required' })
    if (!(amount > 0)) return res.status(400).json({ error: 'amount must be greater than 0' })
    const payload = {
      staffId: req.body.staffId,
      month: req.body.month,
      date: req.body.date || '',
      notes: req.body.notes || '',
      amount,
      userId: req.user?.id || '',
      userName: req.user?.username || 'system',
    }
    const adv = await StaffAdvance.create(payload)
    try { await Audit.create({ type: 'staffAdvance', userId: payload.userId, userName: payload.userName, action: `Created advance ${adv._id}`, meta: { id: adv._id, staffId: payload.staffId, month: payload.month, amount: payload.amount } }) } catch {}
    res.status(201).json(adv)
  } catch (e) { next(e) }
})

// PUT update by id
router.put('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const id = req.params.id
    const amount = Number(req.body.amount || 0)
    if (!(amount > 0)) return res.status(400).json({ error: 'amount must be greater than 0' })
    const patch = { amount }
    if (req.body.staffId) patch.staffId = req.body.staffId
    if (req.body.month) patch.month = req.body.month
    if (req.body.date !== undefined) patch.date = req.body.date || ''
    if (req.body.notes !== undefined) patch.notes = req.body.notes || ''
    const adv = await StaffAdvance.findByIdAndUpdate(id, patch, { new: true })
    if (!adv) return res.status(404).json({ error: 'Advance not found' })
    try { await Audit.create({ type: 'staffAdvance', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Updated advance ${id}`, meta: { id, staffId: patch.staffId, month: patch.month, amount } }) } catch {}
    res.json(adv)
  } catch (e) { next(e) }
})

// DELETE by id
router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const id = req.params.id
    await StaffAdvance.findByIdAndDelete(id)
    try { await Audit.create({ type: 'staffAdvance', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Deleted advance ${id}`, meta: { id } }) } catch {}
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
