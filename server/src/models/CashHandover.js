import mongoose from 'mongoose'

const CashHandoverSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true }, // YYYY-MM-DD
  amount: { type: Number, required: true },
  receiver: { type: String, default: '' },
  note: { type: String, default: '' },
  userId: { type: String, default: '' },
  userName: { type: String, default: '' },
}, { timestamps: true })

export default mongoose.model('CashHandover', CashHandoverSchema)
