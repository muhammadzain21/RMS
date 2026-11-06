import { Router } from 'express'
import PayrollRun from '../models/PayrollRun.js'
import Staff from '../models/Staff.js'
import StaffSettings from '../models/StaffSettings.js'
import StaffAdvance from '../models/StaffAdvance.js'
import StaffPurchase from '../models/StaffPurchase.js'
import StaffEarning from '../models/StaffEarning.js'
import Attendance from '../models/Attendance.js'
import Expense from '../models/Expense.js'
import Counter from '../models/Counter.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()

router.use(authRequired)

const isPaid = (s) => s === 'paid'
const actor = (req) => String(req.user?.username || 'system')

function lastDayOfMonth(period) {
  const [y, m] = String(period).split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

function monthRange(period) {
  const last = lastDayOfMonth(period)
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` }
}

// Bucket a staff-earning ledger row into the payroll breakdown
function earningBucket(category) {
  if (category === 'Overtime') return 'otPay'
  if (category === 'DoubleShift') return 'doubleShift'
  if (category === 'Deduction') return 'manualDeduction'
  return 'allowance'
}

function sumEarnings(rows, staffId) {
  const out = { allowance: 0, otPay: 0, doubleShift: 0, manualDeduction: 0, extrasNote: '' }
  const notes = []
  for (const r of rows) {
    if (String(r.staffId) !== String(staffId)) continue
    const amt = Number(r.amount || 0)
    out[earningBucket(r.category)] += amt
    if (r.category) notes.push(`${r.category}${r.notes ? `: ${r.notes}` : ''}`)
  }
  out.extrasNote = notes.slice(0, 8).join(' · ')
  return out
}

// Signed advance-ledger balance (issues − repayments − payroll deductions)
function outstandingAdvance(rows, staffId) {
  return rows
    .filter(a => String(a.staffId) === String(staffId))
    .reduce((s, a) => s + ((a.type || 'issue') === 'issue' ? 1 : -1) * Number(a.amount || 0), 0)
}

// Mirrors the client-side salaryCalc.js so server-computed payroll matches the UI
async function computeForStaff(staff, period, settings, attendanceRows, advanceRows, earningRows, businessDate, purchaseRows = []) {
  const [y, m] = String(period).split('-').map(Number)
  const join = staff.joinDate ? String(staff.joinDate).slice(0, 10) : '0000-00-00'
  const monthEnd = `${period}-${String(lastDayOfMonth(period)).padStart(2, '0')}`
  const cutoff = businessDate && businessDate < monthEnd ? businessDate : monthEnd

  const byDate = new Map()
  for (const r of attendanceRows) {
    if (String(r.staffId) === String(staff._id)) byDate.set(r.date, r)
  }

  const counts = { present: 0, absent: 0, late: 0, leave: 0, earlyOutDays: 0, totalLateMinutes: 0, totalEarlyOutMinutes: 0 }
  for (let day = 1; day <= lastDayOfMonth(period); day++) {
    const ds = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (ds < join || ds > cutoff) continue
    const r = byDate.get(ds) || { status: 'Absent' }
    if (r.status === 'Present') counts.present++
    else if (r.status === 'Absent') counts.absent++
    else if (r.status === 'Late') { counts.late++; counts.totalLateMinutes += Number(r.lateMinutes || 0) }
    else if (r.status === 'Leave') counts.leave++
    if (Number(r.earlyOutMinutes || 0) > 0) { counts.earlyOutDays++; counts.totalEarlyOutMinutes += Number(r.earlyOutMinutes || 0) }
  }

  const basicSalary = Number(staff.salary || 0)
  const perDay = basicSalary / 30
  const presentEquivalent = counts.present + counts.late
  const bonus = presentEquivalent * Number(settings?.bonusPerDay || 0)
  const lateDeduction = (counts.late * Number(settings?.deductionPerLate || 0)) + (counts.totalLateMinutes * Number(settings?.deductionPerMinute || 0))
  const earlyOutDeduction = counts.totalEarlyOutMinutes * Number(settings?.deductionPerMinuteEarlyOut || 0)
  const absentDeduction = settings?.absentChargesEnabled
    ? counts.absent * perDay
    : counts.absent * Number(settings?.deductionPerAbsent || 0)

  const extras = sumEarnings(earningRows, staff._id)
  const grossPay = Math.max(0, basicSalary + bonus + extras.allowance + extras.otPay + extras.doubleShift)
  const totalDeductions = absentDeduction + lateDeduction + earlyOutDeduction + extras.manualDeduction
  const afterDeductions = Math.max(0, grossPay - totalDeductions)

  const monthAdvances = advanceRows
    .filter(a => String(a.staffId) === String(staff._id) && a.month === period && (a.type || 'issue') === 'issue')
    .reduce((s, a) => s + Number(a.amount || 0), 0)
  const openAdvance = Math.max(0, outstandingAdvance(advanceRows, staff._id))
  const advanceDeducted = Math.min(openAdvance, afterDeductions)
  // Unpaid staff purchases for the period are recovered after advances
  const pendingPurchases = purchaseRows
    .filter(p => String(p.staffId) === String(staff._id) && p.month === period && p.status === 'pending')
    .reduce((s, p) => s + Number(p.amount || 0), 0)
  const purchaseDeducted = Math.min(pendingPurchases, Math.max(0, afterDeductions - advanceDeducted))
  const netPay = Math.max(0, afterDeductions - advanceDeducted - purchaseDeducted)

  return {
    staffId: staff._id,
    staffName: staff.name,
    position: staff.position || '',
    period,
    presentDays: counts.present,
    lateDays: counts.late,
    leaveDays: counts.leave,
    absentDays: counts.absent,
    earlyOutDays: counts.earlyOutDays,
    totalLateMinutes: counts.totalLateMinutes,
    totalEarlyOutMinutes: counts.totalEarlyOutMinutes,
    basicSalary,
    bonus,
    allowance: extras.allowance,
    otPay: extras.otPay,
    doubleShift: extras.doubleShift,
    manualDeduction: extras.manualDeduction,
    extrasNote: extras.extrasNote,
    absentDeduction,
    lateDeduction,
    earlyOutDeduction,
    totalDeductions,
    grossPay,
    openAdvance,
    monthAdvances,
    advanceDeducted,
    pendingPurchases,
    purchaseDeducted,
    netPay,
  }
}

// Recompute a staff member's draft/approved run for a period — used by the
// staff-earnings routes so salary rows stay in sync with extra payments.
export async function refreshUnpaidPayrollForStaff(staffId, period) {
  if (!staffId || !/^\d{4}-\d{2}$/.test(String(period || ''))) return
  const run = await PayrollRun.findOne({ staffId, period })
  if (!run || isPaid(run.status) || run.status === 'cancelled') return
  const staff = await Staff.findById(staffId).lean()
  if (!staff) return
  const { from, to } = monthRange(period)
  const [settings, attendance, advances, earnings, purchases] = await Promise.all([
    StaffSettings.findOne({}).lean(),
    Attendance.find({ date: { $gte: from, $lte: to } }).lean(),
    StaffAdvance.find({ staffId: String(staffId) }).lean(),
    StaffEarning.find({ date: { $gte: from, $lte: to } }).lean(),
    StaffPurchase.find({ staffId: String(staffId), status: 'pending' }).lean(),
  ])
  const calc = await computeForStaff(staff, period, settings, attendance, advances, earnings, new Date().toISOString().slice(0, 10), purchases)
  Object.assign(run, calc)
  await run.save()
}

async function nextSlipNo(period) {
  const doc = await Counter.findOneAndUpdate(
    { name: `payroll-slip-${period}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  )
  return `PAY-${period}-${String(doc.seq).padStart(4, '0')}`
}

// GET /api/payroll?period=YYYY-MM&status=draft|approved|paid
router.get('/', async (req, res, next) => {
  try {
    const filter = {}
    if (req.query.period) filter.period = req.query.period
    if (req.query.status) filter.status = req.query.status
    const items = await PayrollRun.find(filter).sort({ staffName: 1 }).lean()
    res.json(items)
  } catch (e) { next(e) }
})

// POST /api/payroll/run { period, businessDate? } — generate draft runs for staff without one
router.post('/run', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const period = String(req.body?.period || '').trim()
    if (!/^\d{4}-\d{2}$/.test(period)) return res.status(400).json({ error: 'Valid period YYYY-MM is required' })
    const businessDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.businessDate || '')) ? String(req.body.businessDate) : new Date().toISOString().slice(0, 10)

    const { from, to } = monthRange(period)
    const [staffList, settings, attendance, advances, earnings, purchases, existing] = await Promise.all([
      Staff.find({ status: { $ne: 'Inactive' } }).sort({ name: 1 }).lean(),
      StaffSettings.findOne({}).lean(),
      Attendance.find({ date: { $gte: from, $lte: to } }).lean(),
      StaffAdvance.find({}).lean(),
      StaffEarning.find({ date: { $gte: from, $lte: to } }).lean(),
      StaffPurchase.find({ month: period, status: 'pending' }).lean(),
      PayrollRun.find({ period }).lean(),
    ])
    const haveRun = new Set(existing.map(r => String(r.staffId)))

    const items = []
    let created = 0
    for (const s of staffList) {
      if (haveRun.has(String(s._id))) continue
      const calc = await computeForStaff(s, period, settings, attendance, advances, earnings, businessDate, purchases)
      const row = await PayrollRun.findOneAndUpdate(
        { staffId: s._id, period },
        { $set: { ...calc, status: 'draft' } },
        { new: true, upsert: true }
      ).catch((e) => {
        if (e?.code !== 11000) throw e
        return PayrollRun.findOne({ staffId: s._id, period })
      })
      created++
      items.push(row)
    }
    const all = await PayrollRun.find({ period }).sort({ staffName: 1 }).lean()
    try { await Audit.create({ type: 'payroll', userId: req.user?.id || '', userName: actor(req), action: `Generated payroll ${period}`, meta: { period, created } }) } catch {}
    res.json({ items: all, period, created, existing: all.length - created })
  } catch (e) { next(e) }
})

// POST /api/payroll/approve { ids: [] }
router.post('/approve', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    const who = actor(req)
    const now = new Date()
    const approved = []
    for (const id of ids) {
      const run = await PayrollRun.findById(id)
      if (!run || isPaid(run.status) || run.status === 'cancelled') continue
      run.status = 'approved'
      run.approvedAt = now
      run.approvedBy = who
      await run.save()
      approved.push(run)
    }
    res.json({ items: approved })
  } catch (e) { next(e) }
})

// POST /api/payroll/pay { ids: [], date? }
// Marks runs paid: creates the salary Expense + payroll_deduct advance + slip number
router.post('/pay', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    const who = actor(req)
    const whoId = String(req.user?.id || '')
    const today = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.date || '')) ? String(req.body.date) : new Date().toISOString().slice(0, 10)
    const paid = []

    for (const id of ids) {
      const run = await PayrollRun.findById(id)
      if (!run || isPaid(run.status) || run.status === 'cancelled' || run.status === 'draft') continue

      const netPay = Math.max(0, Number(run.netPay || 0))
      const slipNo = run.slipNo || await nextSlipNo(run.period)

      const expense = await Expense.create({
        date: today,
        category: 'Salaries',
        expenseHead: 'Salaries',
        amount: netPay,
        description: `Payroll ${run.period} — ${run.staffName} (${slipNo})`,
        note: `Payroll ${run.period} — ${run.staffName} (${slipNo})`,
        accountHead: 'cash',
        paymentMethod: 'cash',
        paidBy: who,
        paidByUserId: whoId,
        userId: whoId,
        userName: who,
      })

      if (Number(run.advanceDeducted || 0) > 0) {
        await StaffAdvance.create({
          staffId: run.staffId,
          staffName: run.staffName,
          month: run.period,
          date: today,
          amount: Number(run.advanceDeducted),
          type: 'payroll_deduct',
          notes: `Auto-deducted on payroll ${run.period} (${slipNo})`,
          payrollRunId: String(run._id),
          userId: whoId,
          userName: who,
        })
      }

      // Settle unpaid staff purchases recovered in this run
      if (Number(run.purchaseDeducted || 0) > 0) {
        try {
          await StaffPurchase.updateMany(
            { staffId: run.staffId, month: run.period, status: 'pending' },
            { $set: { status: 'settled', settledVia: 'salary', settledAt: new Date(), settledBy: who } }
          )
        } catch (e) { console.warn('[payroll] staff purchase settle failed:', e?.message) }
      }

      run.status = 'paid'
      run.slipNo = slipNo
      run.expenseId = String(expense._id)
      run.paidAt = new Date()
      run.paidBy = who
      await run.save()
      try { await Audit.create({ type: 'payroll', userId: whoId, userName: who, action: `Paid payroll ${run.period} — ${run.staffName} (${slipNo})`, meta: { id: run._id, netPay, slipNo } }) } catch {}
      paid.push(run)
    }

    res.json({ items: paid })
  } catch (e) { next(e) }
})

// POST /api/payroll/regenerate/:id — recompute a non-paid run from current attendance/settings
router.post('/regenerate/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const run = await PayrollRun.findById(req.params.id)
    if (!run) return res.status(404).json({ error: 'Payroll run not found' })
    if (isPaid(run.status)) return res.status(400).json({ error: 'Paid payroll cannot be regenerated' })
    const businessDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.businessDate || '')) ? String(req.body.businessDate) : new Date().toISOString().slice(0, 10)

    const staff = await Staff.findById(run.staffId).lean()
    if (!staff) return res.status(404).json({ error: 'Staff not found' })
    const { from, to } = monthRange(run.period)
    const [settings, attendance, advances, earnings, purchases] = await Promise.all([
      StaffSettings.findOne({}).lean(),
      Attendance.find({ date: { $gte: from, $lte: to } }).lean(),
      StaffAdvance.find({ staffId: String(run.staffId) }).lean(),
      StaffEarning.find({ date: { $gte: from, $lte: to } }).lean(),
      StaffPurchase.find({ staffId: String(run.staffId), status: 'pending' }).lean(),
    ])
    const calc = await computeForStaff(staff, run.period, settings, attendance, advances, earnings, businessDate, purchases)
    Object.assign(run, calc)
    await run.save()
    res.json({ item: run })
  } catch (e) { next(e) }
})

// DELETE /api/payroll/period?period=YYYY-MM — delete all non-paid runs for a period
router.delete('/period', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const period = String(req.query.period || req.body?.period || '').trim()
    if (!/^\d{4}-\d{2}$/.test(period)) return res.status(400).json({ error: 'Valid period YYYY-MM is required' })
    const rows = await PayrollRun.find({ period }).lean()
    const deletable = rows.filter(r => !isPaid(r.status))
    if (deletable.length) {
      await PayrollRun.deleteMany({ _id: { $in: deletable.map(r => r._id) } })
    }
    res.json({ deleted: deletable.length, skippedPaid: rows.length - deletable.length, period })
  } catch (e) { next(e) }
})

// DELETE /api/payroll/:id — non-paid only
router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const run = await PayrollRun.findById(req.params.id)
    if (!run) return res.status(404).json({ error: 'Payroll run not found' })
    if (isPaid(run.status)) return res.status(400).json({ error: 'Paid payroll cannot be deleted' })
    await run.deleteOne()
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
