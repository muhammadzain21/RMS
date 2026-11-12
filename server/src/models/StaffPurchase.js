import mongoose from 'mongoose'

// Tracks "pay later" staff purchases — staff takes the order now and submits
// the amount later. 'deduct' staff purchases instead create a StaffAdvance
// issue row which payroll deducts automatically.
const StaffPurchaseSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
  staffName: { type: String, default: '' },
  // Sale / finance branch (where items were purchased) — may differ from staff.home branch
  branchId: { type: String, default: '', index: true },
  saleId: { type: String, default: '', index: true },
  billNo: { type: String, default: '' },
  date: { type: String, required: true, index: true }, // yyyy-MM-dd business date
  month: { type: String, required: true, index: true }, // YYYY-MM
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'settled'], default: 'pending', index: true },
  settledVia: { type: String, enum: ['', 'cash', 'salary'], default: '' }, // how it was settled
  settledAt: { type: Date, default: null },
  settledBy: { type: String, default: '' },
  userId: { type: String, default: '' },
  userName: { type: String, default: '' },
}, { timestamps: true })

export default mongoose.models.StaffPurchase || mongoose.model('StaffPurchase', StaffPurchaseSchema)
