import mongoose from 'mongoose'

const TableSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  floor: { type: String, default: '' },
  lastOrderAt: { type: Date },
  lastOrderDate: { type: String }, // YYYY-MM-DD from sale.date
  lastWaiter: { type: String, default: '' },
  totalOrders: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  active: { type: Boolean, default: true }
}, { timestamps: true })

TableSchema.index({ name: 1 }, { unique: true })

export default mongoose.model('Table', TableSchema)
