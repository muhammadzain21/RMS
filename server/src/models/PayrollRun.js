import mongoose from 'mongoose'

export const PAYROLL_STATUSES = ['draft', 'approved', 'paid', 'cancelled']

const PayrollRunSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
  staffName: { type: String, required: true },
  position: { type: String, default: '' },
  period: { type: String, required: true, index: true }, // YYYY-MM
  status: { type: String, enum: PAYROLL_STATUSES, default: 'draft', index: true },

  // Attendance snapshot
  presentDays: { type: Number, default: 0 },
  lateDays: { type: Number, default: 0 },
  leaveDays: { type: Number, default: 0 },
  absentDays: { type: Number, default: 0 },
  earlyOutDays: { type: Number, default: 0 },
  totalLateMinutes: { type: Number, default: 0 },
  totalEarlyOutMinutes: { type: Number, default: 0 },

  // Money breakdown (mirrors client salaryCalc.js + staff earnings ledger)
  basicSalary: { type: Number, default: 0 },
  bonus: { type: Number, default: 0 },           // per-present-day attendance bonus
  allowance: { type: Number, default: 0 },       // earnings: Bonus/Allowance/Award/LumpSum/RevenueShare
  otPay: { type: Number, default: 0 },           // earnings: Overtime
  doubleShift: { type: Number, default: 0 },     // earnings: DoubleShift
  manualDeduction: { type: Number, default: 0 }, // earnings: Deduction
  extrasNote: { type: String, default: '' },
  absentDeduction: { type: Number, default: 0 },
  lateDeduction: { type: Number, default: 0 },
  earlyOutDeduction: { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },
  grossPay: { type: Number, default: 0 },
  openAdvance: { type: Number, default: 0 },     // outstanding advance balance at compute time
  monthAdvances: { type: Number, default: 0 },   // issue-type advances tagged to this month
  advanceDeducted: { type: Number, default: 0 }, // actually recovered on pay
  pendingPurchases: { type: Number, default: 0 },  // unpaid staff purchases for the period
  purchaseDeducted: { type: Number, default: 0 },  // unpaid staff purchases recovered on pay
  netPay: { type: Number, default: 0 },

  slipNo: { type: String, default: '' },
  expenseId: { type: String, default: '' },
  approvedAt: { type: Date },
  approvedBy: { type: String, default: '' },
  paidAt: { type: Date },
  paidBy: { type: String, default: '' },
}, { timestamps: true })

PayrollRunSchema.index({ staffId: 1, period: 1 }, { unique: true })

export default mongoose.model('PayrollRun', PayrollRunSchema)
