import { Router } from 'express'
import StaffAdvance from '../models/StaffAdvance.js'
import Staff from '../models/Staff.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()

// All endpoints require auth
router.use(authRequired)

const txType = (t) => t?.type || 'issue' // legacy rows have no type -> treated as issue
const signed = (t) => (txType(t) === 'issue' ? 1 : -1) * Number(t?.amount || 0)

// Outstanding advance balance for one staff: issues minus repays minus payroll deductions
export async function outstandingForStaff(staffId) {
  const rows = await StaffAdvance.find({ staffId }).lean()
  return rows.reduce((sum, r) => sum + signed(r), 0)
}

// Advance cap: explicit advanceLimit if set, otherwise salary
export function advanceCap(staff) {
  const limit = Number(staff?.advanceLimit || 0)
  if (limit > 0) return limit
  return Math.max(0, Number(staff?.salary || 0))
}

// GET /api/staff-advances?staffId=...&month=YYYY-MM&type=issue|repay|payroll_deduct
router.get('/', async (req, res, next) => {
  try {
    const { staffId, month, type } = req.query
    const filter = {}
    if (staffId) filter.staffId = staffId
    if (month) filter.month = month
    if (type && ['issue', 'repay', 'payroll_deduct'].includes(type)) filter.type = type
    const rows = await StaffAdvance.find(filter).sort({ createdAt: -1 })
    res.json(rows)
  } catch (e) { next(e) }
})

// GET /api/staff-advances/balances — per-staff limit / outstanding / available
router.get('/balances', async (_req, res, next) => {
  try {
    const [staffList, txs] = await Promise.all([
      Staff.find({}).sort({ name: 1 }).lean(),
      StaffAdvance.find({}).lean(),
    ])
    const byStaff = new Map()
    for (const t of txs) {
      const id = String(t.staffId)
      byStaff.set(id, (byStaff.get(id) || 0) + signed(t))
    }
    const items = staffList.map((s) => {
      const outstanding = Math.max(0, Number((byStaff.get(String(s._id)) || 0).toFixed(2)))
      const limit = advanceCap(s)
      return {
        staffId: String(s._id),
        name: s.name,
        position: s.position || '',
        salary: Number(s.salary || 0),
        advanceLimit: limit,
        outstanding,
        available: Math.max(0, limit - outstanding),
        active: s.status !== 'Inactive',
      }
    })
    res.json(items)
  } catch (e) { next(e) }
})

// POST create — { staffId, month, date, notes, amount, type: 'issue'|'repay' }
router.post('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const amount = Number(req.body.amount || 0)
    const type = req.body.type === 'repay' ? 'repay' : 'issue'
    if (!req.body.staffId) return res.status(400).json({ error: 'staffId is required' })
    if (!req.body.month) return res.status(400).json({ error: 'month is required' })
    if (!(amount > 0)) return res.status(400).json({ error: 'amount must be greater than 0' })

    const staff = await Staff.findById(req.body.staffId).lean()
    if (!staff) return res.status(404).json({ error: 'Staff not found' })
    if (type === 'issue' && staff.status === 'Inactive') {
      return res.status(400).json({ error: 'Staff is inactive' })
    }

    const outstanding = await outstandingForStaff(req.body.staffId)
    if (type === 'issue') {
      const cap = advanceCap(staff)
      if (outstanding + amount > cap + 0.009) {
        return res.status(400).json({
          error: `Advance limit exceeded. Limit PKR ${cap.toLocaleString()}, outstanding PKR ${outstanding.toLocaleString()}, available PKR ${Math.max(0, cap - outstanding).toLocaleString()}`,
        })
      }
    } else if (amount > outstanding + 0.009) {
      return res.status(400).json({ error: `Repay cannot exceed outstanding PKR ${outstanding.toLocaleString()}` })
    }

    const payload = {
      staffId: req.body.staffId,
      staffName: staff.name || '',
      month: req.body.month,
      date: req.body.date || '',
      notes: req.body.notes || '',
      amount,
      type,
      userId: req.user?.id || '',
      userName: req.user?.username || 'system',
    }
    const adv = await StaffAdvance.create(payload)
    try { await Audit.create({ type: 'staffAdvance', userId: payload.userId, userName: payload.userName, action: `Created ${type} ${adv._id}`, meta: { id: adv._id, staffId: payload.staffId, month: payload.month, amount: payload.amount } }) } catch {}
    const next = await outstandingForStaff(req.body.staffId)
    res.status(201).json({ ...adv.toObject(), outstanding: next })
  } catch (e) { next(e) }
})

// PUT update by id — payroll_deduct rows are locked
router.put('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const id = req.params.id
    const amount = Number(req.body.amount || 0)
    if (!(amount > 0)) return res.status(400).json({ error: 'amount must be greater than 0' })

    const row = await StaffAdvance.findById(id)
    if (!row) return res.status(404).json({ error: 'Advance not found' })
    if (txType(row) === 'payroll_deduct') {
      return res.status(400).json({ error: 'Payroll deductions cannot be edited' })
    }

    const targetStaffId = req.body.staffId || row.staffId
    const staff = await Staff.findById(targetStaffId).lean()
    if (!staff) return res.status(404).json({ error: 'Staff not found' })

    const type = req.body.type === 'repay' ? 'repay' : 'issue'
    // Recompute the balance as if this row were replaced with the new values
    const outstanding = await outstandingForStaff(String(row.staffId))
    const without = outstanding - signed(row)
    const after = without + (type === 'issue' ? amount : -amount)
    const cap = advanceCap(staff)
    if (after < -0.009) {
      return res.status(400).json({ error: `Repay cannot exceed outstanding PKR ${Math.max(0, without).toLocaleString()}` })
    }
    if (after > cap + 0.009) {
      return res.status(400).json({
        error: `Advance limit exceeded. Limit PKR ${cap.toLocaleString()}, available PKR ${Math.max(0, cap - without).toLocaleString()}`,
      })
    }

    row.staffId = targetStaffId
    row.staffName = staff.name || ''
    if (req.body.month) row.month = req.body.month
    if (req.body.date !== undefined) row.date = req.body.date || ''
    if (req.body.notes !== undefined) row.notes = req.body.notes || ''
    row.amount = amount
    row.type = type
    await row.save()
    try { await Audit.create({ type: 'staffAdvance', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Updated ${type} ${id}`, meta: { id, staffId: row.staffId, month: row.month, amount } }) } catch {}
    res.json(row)
  } catch (e) { next(e) }
})

// DELETE by id — payroll_deduct rows are locked
router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const id = req.params.id
    const row = await StaffAdvance.findById(id)
    if (!row) return res.status(404).json({ error: 'Advance not found' })
    if (txType(row) === 'payroll_deduct') {
      return res.status(400).json({ error: 'Payroll deductions cannot be deleted' })
    }
    await StaffAdvance.findByIdAndDelete(id)
    try { await Audit.create({ type: 'staffAdvance', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Deleted advance ${id}`, meta: { id } }) } catch {}
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
