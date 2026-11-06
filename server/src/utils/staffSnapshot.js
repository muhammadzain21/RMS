import Staff from '../models/Staff.js'
import Attendance from '../models/Attendance.js'
import StaffPurchase from '../models/StaffPurchase.js'
import StaffAdvance from '../models/StaffAdvance.js'
import StaffEarning from '../models/StaffEarning.js'
import PayrollRun from '../models/PayrollRun.js'

function buildDateFilter({ month, from, to } = {}) {
  const fromStr = from ? String(from).slice(0, 10) : ''
  const toStr = to ? String(to).slice(0, 10) : ''
  if (fromStr || toStr) {
    const date = {}
    if (fromStr) date.$gte = fromStr
    if (toStr) date.$lte = toStr
    return { date }
  }
  const m = month ? String(month).slice(0, 7) : ''
  if (m) return { date: { $regex: `^${m}-` } }
  return {}
}

// Shared "own data" snapshot for staff self-service — used by both the
// mobile staff portal (scoped token) and the in-app /api/my routes (normal auth).
export async function getStaffSnapshot(staffId, month, range = {}) {
  const staff = await Staff.findById(staffId).lean()
  if (!staff) return null

  const dateFilter = buildDateFilter({ month, from: range.from, to: range.to })

  const [attendance, purchases, advances, earnings, slips] = await Promise.all([
    Attendance.find({ staffId, ...dateFilter }).sort({ date: -1 }).lean(),
    StaffPurchase.find({ staffId, ...dateFilter }).sort({ date: -1, createdAt: -1 }).limit(500).lean(),
    StaffAdvance.find({ staffId, ...dateFilter }).sort({ date: -1, createdAt: -1 }).limit(500).lean(),
    StaffEarning.find({ staffId, ...dateFilter }).sort({ date: -1, createdAt: -1 }).limit(500).lean(),
    PayrollRun.find({ staffId }).sort({ period: -1 }).limit(24).lean(),
  ])

  return {
    staff: {
      id: String(staff._id),
      name: staff.name,
      position: staff.position || '',
      phone: staff.phone || '',
      joinDate: staff.joinDate || null,
    },
    attendance: attendance.map(a => ({
      date: a.date, status: a.status, checkIn: a.checkIn, checkOut: a.checkOut,
      lateMinutes: a.lateMinutes || 0, earlyOutMinutes: a.earlyOutMinutes || 0, notes: a.notes || '',
    })),
    purchases: purchases.map(p => ({
      date: p.date || '', amount: Number(p.amount || 0), status: p.status || 'pending',
      settledVia: p.settledVia || '', billNo: p.billNo || '',
    })),
    advances: advances.map(a => ({
      date: a.date || '', type: a.type || 'issue', amount: Number(a.amount || 0), notes: a.notes || '',
    })),
    earnings: earnings.map(e => ({
      date: e.date || '', category: e.category || '', amount: Number(e.amount || 0), notes: e.notes || '',
    })),
    slips: slips.map(s => ({
      period: s.period || '', status: s.status || 'draft',
      grossPay: Number(s.grossPay || 0), netPay: Number(s.netPay || 0),
      advanceDeducted: Number(s.advanceDeducted || 0),
      purchaseDeducted: Number(s.purchaseDeducted || 0),
      paidAt: s.paidAt || null,
    })),
  }
}
