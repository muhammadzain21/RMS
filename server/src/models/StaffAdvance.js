import mongoose from 'mongoose'

const StaffAdvanceSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  month: { type: String, required: true }, // YYYY-MM — deducted from that month's salary
  date: { type: String, default: '' }, // yyyy-MM-dd business date the advance was given
  notes: { type: String, default: '' },
  amount: { type: Number, required: true },
  userId: { type: String, default: '' },
  userName: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true })

export default mongoose.model('StaffAdvance', StaffAdvanceSchema)
