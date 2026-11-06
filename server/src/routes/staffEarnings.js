import { Router } from 'express'
import StaffEarning, { STAFF_EARNING_CATEGORIES } from '../models/StaffEarning.js'
import Staff from '../models/Staff.js'
import PayrollRun from '../models/PayrollRun.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { refreshUnpaidPayrollForStaff } from './payroll.js'

const router = Router()

router.use(authRequired)

const actor = (req) => String(req.user?.username || 'system')

function computedAmount(data) {
  if (data.category === 'RevenueShare' && data.rate != null && data.base != null) {
    return Math.round(Number(data.base) * (Number(data.rate) / 100))
  }
  return Number(data.amount)
}

function validateBody(body, partial = false) {
  const data = {}
  if (!partial || body.staffId !== undefined) {
    if (!body.staffId) throw Object.assign(new Error('staffId is required'), { status: 400 })
    data.staffId = String(body.staffId)
  }
  if (!partial || body.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ''))) throw Object.assign(new Error('Valid date YYYY-MM-DD is required'), { status: 400 })
    data.date = String(body.date)
  }
  if (!partial || body.category !== undefined) {
    if (!STAFF_EARNING_CATEGORIES.includes(body.category)) throw Object.assign(new Error('Invalid category'), { status: 400 })
    data.category = body.category
  }
  if (body.amount !== undefined) data.amount = Number(body.amount)
  if (body.rate !== undefined) data.rate = Number(body.rate)
  if (body.base !== undefined) data.base = Number(body.base)
  if (body.notes !== undefined) data.notes = String(body.notes)
  return data
}

// Earnings for a month can't change once that month's payroll is paid
async function assertMonthEditable(staffId, date) {
  const period = String(date || '').slice(0, 7)
  if (!period) return
  const run = await PayrollRun.findOne({ staffId, period }).lean()
  if (run && run.status === 'paid') {
    throw Object.assign(new Error('This month is already paid. Earnings cannot be changed.'), { status: 400 })
  }
}

// GET /api/staff-earnings?staffId=&from=&to=&page=&limit=
router.get('/', async (req, res, next) => {
  try {
    const filter = {}
    if (req.query.staffId) filter.staffId = String(req.query.staffId)
    const from = String(req.query.from || ''), to = String(req.query.to || '')
    if (from || to) {
      filter.date = {}
      if (from) filter.date.$gte = from
      if (to) filter.date.$lte = to
    }
    const limit = Math.max(1, Math.min(2000, Number(req.query.limit || 100)))
    const page = Math.max(1, Number(req.query.page || 1))
    const skip = (page - 1) * limit
    const [total, items] = await Promise.all([
      StaffEarning.countDocuments(filter),
      StaffEarning.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    ])
    res.json({ items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) })
  } catch (e) { next(e) }
})

// POST /api/staff-earnings
router.post('/', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const data = validateBody(req.body)
    const amount = computedAmount(data)
    if (!(amount > 0)) return res.status(400).json({ error: 'Amount (or rate and base) must be greater than 0' })
    try {
      await assertMonthEditable(data.staffId, data.date)
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message })
    }
    const staff = await Staff.findById(data.staffId).lean()
    if (!staff) return res.status(404).json({ error: 'Staff not found' })
    const row = await StaffEarning.create({
      ...data,
      amount,
      staffName: staff.name || '',
      userId: String(req.user?.id || ''),
      userName: actor(req),
    })
    await refreshUnpaidPayrollForStaff(data.staffId, data.date.slice(0, 7))
    try { await Audit.create({ type: 'staff-earning', userId: String(req.user?.id || ''), userName: actor(req), action: `Added ${data.category} ${amount} — ${staff.name}`, meta: { id: row._id } }) } catch {}
    res.status(201).json(row)
  } catch (e) { next(e) }
})

// PUT /api/staff-earnings/:id
router.put('/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const patch = validateBody(req.body, true)
    const existing = await StaffEarning.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Earning not found' })
    const prevStaff = String(existing.staffId)
    const prevPeriod = String(existing.date).slice(0, 7)
    const nextDate = patch.date || existing.date
    const nextStaff = patch.staffId || existing.staffId
    try {
      await assertMonthEditable(prevStaff, existing.date)
      await assertMonthEditable(nextStaff, nextDate)
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message })
    }
    const merged = { ...existing.toObject(), ...patch }
    const amount = computedAmount(merged)
    if (!(amount > 0)) return res.status(400).json({ error: 'Amount (or rate and base) must be greater than 0' })
    if (patch.staffId && patch.staffId !== existing.staffId) {
      const staff = await Staff.findById(patch.staffId).lean()
      if (staff) existing.staffName = staff.name
    }
    Object.assign(existing, patch, { amount })
    await existing.save()
    await refreshUnpaidPayrollForStaff(prevStaff, prevPeriod)
    await refreshUnpaidPayrollForStaff(nextStaff, String(nextDate).slice(0, 7))
    try { await Audit.create({ type: 'staff-earning', userId: String(req.user?.id || ''), userName: actor(req), action: `Edited ${existing.category} ${amount} — ${existing.staffName}`, meta: { id: existing._id } }) } catch {}
    res.json(existing)
  } catch (e) { next(e) }
})

// DELETE /api/staff-earnings/:id
router.delete('/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const before = await StaffEarning.findById(req.params.id)
    if (!before) return res.status(404).json({ error: 'Earning not found' })
    try {
      await assertMonthEditable(String(before.staffId), before.date)
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message })
    }
    await before.deleteOne()
    await refreshUnpaidPayrollForStaff(String(before.staffId), String(before.date).slice(0, 7))
    try { await Audit.create({ type: 'staff-earning', userId: String(req.user?.id || ''), userName: actor(req), action: `Deleted ${before.category} ${before.amount} — ${before.staffName}`, meta: { id: before._id } }) } catch {}
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
