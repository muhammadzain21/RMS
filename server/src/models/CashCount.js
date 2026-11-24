import mongoose from 'mongoose'

const CashCountSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD
  amount: { type: Number, required: true, default: 0 },
  fromUser: { type: String, default: '' },
  receiver: { type: String, default: '' },
  note: { type: String, default: '' },
  userId: { type: String, default: '' },
  userName: { type: String, default: '' },
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

export default mongoose.model('CashCount', CashCountSchema)
