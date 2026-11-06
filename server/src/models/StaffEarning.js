import mongoose from 'mongoose'

export const STAFF_EARNING_CATEGORIES = [
  'Bonus',
  'Allowance',
  'Award',
  'LumpSum',
  'Overtime',
  'DoubleShift',
  'RevenueShare',
  'Deduction',
]

const StaffEarningSchema = new mongoose.Schema({
  staffId: { type: String, required: true, index: true },
  staffName: { type: String, default: '' },
  date: { type: String, required: true, index: true }, // YYYY-MM-DD
  category: { type: String, enum: STAFF_EARNING_CATEGORIES, required: true, index: true },
  amount: { type: Number, required: true },
  rate: { type: Number },   // RevenueShare: percentage of base
  base: { type: Number },   // RevenueShare: base amount
  notes: { type: String, default: '' },
  userId: { type: String, default: '' },
  userName: { type: String, default: '' },
}, { timestamps: true })

StaffEarningSchema.index({ staffId: 1, date: 1 })

export default mongoose.model('StaffEarning', StaffEarningSchema)
