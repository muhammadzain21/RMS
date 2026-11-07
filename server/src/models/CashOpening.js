import mongoose from 'mongoose'

const CashOpeningSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true }, // YYYY-MM-DD
  openingCash: { type: Number, required: true },
  note: { type: String, default: '' },
  userId: { type: String, default: '' },
  userName: { type: String, default: '' },
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

CashOpeningSchema.index({ date: 1, branchId: 1 }, { unique: true })

export default mongoose.model('CashOpening', CashOpeningSchema)
