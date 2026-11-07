import mongoose from 'mongoose'

const ReturnItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  qty: { type: Number, required: true, min: 0 },
}, { _id: false })

const ReturnSchema = new mongoose.Schema({
  date: { type: String, required: true }, // yyyy-MM-dd
  saleId: { type: String },
  customer: { type: String },
  items: { type: [ReturnItemSchema], default: [] },
  refund: { type: Number, default: 0 },
  reason: { type: String },
  paymentMethod: { type: String, default: 'cash' },
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

export default mongoose.model('Return', ReturnSchema)
