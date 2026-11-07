import mongoose from 'mongoose'

const PayInOutSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true }, // YYYY-MM-DD
  type: { type: String, enum: ['IN','OUT'], required: true },
  amount: { type: Number, required: true },
  category: { type: String, default: '' },
  note: { type: String, default: '' },
  userId: { type: String, default: '' },
  userName: { type: String, default: '' },
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

export default mongoose.model('PayInOut', PayInOutSchema)
