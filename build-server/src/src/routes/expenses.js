import { Router } from 'express'
import Expense from '../models/Expense.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { blockIfClosedFromBody, blockIfClosedFromModel } from '../middleware/dayClosed.js'
import { logAudit } from '../middleware/auditLog.js'

const router = Router()

// All endpoints require authentication
router.use(authRequired)

// List with optional filters: from,to,category,q,min and pagination
router.get('/', async (req, res, next) => {
  try {
    const { from = '0000-00-00', to = '9999-12-31', category = '', q = '', min = 0, page = 1, limit = 10 } = req.query
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10))
    const $and = [
      { date: { $gte: String(from), $lte: String(to) } },
      ...(category ? [{ category }] : []),
      ...(q ? [{ $or: [
        { description: { $regex: String(q), $options: 'i' } },
        { note: { $regex: String(q), $options: 'i' } },
      ]}] : []),
      ...(min ? [{ amount: { $gte: Number(min) } }] : []),
    ]
    const filter = $and.length ? { $and } : {}
    const total = await Expense.countDocuments(filter)
    const rows = await Expense.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
    res.json({ rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) })
  } catch (e) { next(e) }
})

// Export CSV (must be before parameterized routes)
router.get('/export', async (req, res, next) => {
  try {
    const { from = '0000-00-00', to = '9999-12-31', category = '', q = '', min = 0 } = req.query
    const $and = [
      { date: { $gte: String(from), $lte: String(to) } },
      ...(category ? [{ category }] : []),
      ...(q ? [{ $or: [
        { description: { $regex: String(q), $options: 'i' } },
        { note: { $regex: String(q), $options: 'i' } },
      ]}] : []),
      ...(min ? [{ amount: { $gte: Number(min) } }] : []),
    ]
    const rows = await Expense.find($and.length ? { $and } : {}).sort({ date: -1, createdAt: -1 })
    const header = ['date','category','amount','description','note']
    const csv = [header.join(','), ...rows.map(r => [r.date, r.category, r.amount, r.description?.replaceAll(',', ' '), r.note?.replaceAll(',', ' ')].join(','))].join('\n')
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"')
    res.send(csv)
  } catch (e) { next(e) }
})

// Create
router.post('/', requireRole('Admin','Manager'), blockIfClosedFromBody('date'), async (req, res, next) => {
  try {
    const body = req.body || {}
    const exp = await Expense.create(body)
    await logAudit(req, 'expense', `Added expense ${exp.category}: ${exp.amount}`, { id: exp._id })
    res.status(201).json(exp)
  } catch (e) { next(e) }
})

// Update
router.patch('/:id', requireRole('Admin','Manager'), blockIfClosedFromModel(Expense), async (req, res, next) => {
  try {
    const doc = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true })
    await logAudit(req, 'expense', `Updated expense ${req.params.id}`, { id: req.params.id, patch: req.body })
    res.json(doc)
  } catch (e) { next(e) }
})

// Delete
router.delete('/:id', requireRole('Admin','Manager'), blockIfClosedFromModel(Expense), async (req, res, next) => {
  try {
    await Expense.findByIdAndDelete(req.params.id)
    await logAudit(req, 'expense', `Deleted expense ${req.params.id}`, { id: req.params.id })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
