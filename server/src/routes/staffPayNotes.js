import { Router } from 'express'
import StaffPayNote from '../models/StaffPayNote.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()

// All endpoints require auth
router.use(authRequired)

// GET /api/staff-pay-notes?staffId=...&month=YYYY-MM
router.get('/', async (req, res, next) => {
  try {
    const { staffId, month } = req.query
    const filter = {}
    if (staffId) filter.staffId = staffId
    if (month) filter.month = month
    const rows = await StaffPayNote.find(filter).sort({ createdAt: -1 })
    res.json(rows)
  } catch (e) { next(e) }
})

// POST create
router.post('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const payload = {
      staffId: req.body.staffId,
      month: req.body.month,
      notes: req.body.notes || '',
      amount: Number(req.body.amount || 0),
      userId: req.user?.id || '',
      userName: req.user?.username || 'system',
    }
    const note = await StaffPayNote.create(payload)
    try { await Audit.create({ type: 'staffPayNote', userId: payload.userId, userName: payload.userName, action: `Created pay note ${note._id}`, meta: { id: note._id, staffId: payload.staffId, month: payload.month, amount: payload.amount } }) } catch {}
    res.status(201).json(note)
  } catch (e) { next(e) }
})

// DELETE by id
router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const id = req.params.id
    await StaffPayNote.findByIdAndDelete(id)
    try { await Audit.create({ type: 'staffPayNote', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Deleted pay note ${id}`, meta: { id } }) } catch {}
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
