import { Router } from 'express'
import StaffPurchase from '../models/StaffPurchase.js'
import PayInOut from '../models/PayInOut.js'
import StaffAdvance from '../models/StaffAdvance.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(authRequired)

// GET /api/staff-purchases?staffId=...&status=pending|settled&month=YYYY-MM&date=YYYY-MM-DD
router.get('/', async (req, res, next) => {
  try {
    const { staffId, status, month, date } = req.query
    const filter = {}
    if (staffId) filter.staffId = staffId
    if (status && ['pending', 'settled'].includes(status)) filter.status = status
    if (month) filter.month = month
    if (date) filter.date = date
    const rows = await StaffPurchase.find(filter).sort({ createdAt: -1 }).lean()
    res.json(rows)
  } catch (e) { next(e) }
})

// POST /api/staff-purchases/:id/settle — mark a pay-later purchase paid
// and record the cash as a Pay In for the business date
router.post('/:id/settle', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const row = await StaffPurchase.findById(req.params.id)
    if (!row) return res.status(404).json({ error: 'Purchase not found' })
    if (row.status === 'settled') return res.status(400).json({ error: 'Already settled' })

    const who = req.user?.username || 'system'
    row.status = 'settled'
    row.settledVia = 'cash'
    row.settledAt = new Date()
    row.settledBy = who
    await row.save()

    // The cash arrives today (settlement day) — NOT the purchase date.
    // Backdating would inflate that day's expected cash after it was closed.
    const settleDate = String(req.body?.date || '') || new Date().toISOString().slice(0, 10)
    try {
      await PayInOut.create({
        date: settleDate,
        type: 'IN',
        amount: Number(row.amount || 0),
        category: 'Staff Purchase',
        note: `Pay-later settled by ${row.staffName} — bill ${row.billNo}`,
        userId: req.user?.id || '',
        userName: who,
      })
    } catch (e) { console.warn('[staffPurchases] pay-in create failed:', e?.message) }

    try { await Audit.create({ type: 'staffPurchase', userId: req.user?.id || '', userName: who, action: `Settled staff purchase ${row._id}`, meta: { id: row._id, staffId: row.staffId, amount: row.amount } }) } catch {}
    res.json(row)
  } catch (e) { next(e) }
})

// POST /api/staff-purchases/:id/deduct — staff didn't pay; convert the
// pending purchase into a salary advance issue so payroll deducts it.
router.post('/:id/deduct', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const row = await StaffPurchase.findById(req.params.id)
    if (!row) return res.status(404).json({ error: 'Purchase not found' })
    if (row.status === 'settled') return res.status(400).json({ error: 'Already settled' })

    const who = req.user?.username || 'system'
    row.status = 'settled'
    row.settledVia = 'salary'
    row.settledAt = new Date()
    row.settledBy = who
    await row.save()

    try {
      await StaffAdvance.create({
        staffId: row.staffId,
        staffName: row.staffName,
        month: row.month,
        date: row.date,
        notes: `Staff purchase — bill ${row.billNo} (pay-later converted to salary deduction)`,
        amount: Number(row.amount || 0),
        type: 'issue',
        saleId: row.saleId,
        userId: req.user?.id || '',
        userName: who,
      })
    } catch (e) { console.warn('[staffPurchases] advance issue failed:', e?.message) }

    try { await Audit.create({ type: 'staffPurchase', userId: req.user?.id || '', userName: who, action: `Staff purchase ${row._id} converted to salary deduction`, meta: { id: row._id, staffId: row.staffId, amount: row.amount } }) } catch {}
    res.json(row)
  } catch (e) { next(e) }
})

// DELETE /api/staff-purchases/:id — only pending rows can be removed
router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const row = await StaffPurchase.findById(req.params.id)
    if (!row) return res.status(404).json({ error: 'Purchase not found' })
    if (row.status === 'settled') return res.status(400).json({ error: 'Settled purchases cannot be deleted' })
    await StaffPurchase.findByIdAndDelete(row._id)
    try { await Audit.create({ type: 'staffPurchase', userId: req.user?.id || '', userName: req.user?.username || 'system', action: `Deleted staff purchase ${req.params.id}`, meta: { id: req.params.id } }) } catch {}
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
