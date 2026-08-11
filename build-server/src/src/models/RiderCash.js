import mongoose from 'mongoose'

const RiderCashSchema = new mongoose.Schema({
  date: { type: String, required: true }, // yyyy-MM-dd
  riderId: { type: String, required: true },
  riderName: { type: String, default: '' },
  deliveries: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
  method: { type: String, enum: ['COD','PaidToOwner'], default: 'COD' },
  note: { type: String, default: '' },
  orderId: { type: String, default: '' },
  deliveryCharge: { type: Number, default: 0 },
  settled: { type: Boolean, default: false },
  userId: { type: String, default: '' },
  userName: { type: String, default: '' },
}, { timestamps: true })

export default mongoose.model('RiderCash', RiderCashSchema)
