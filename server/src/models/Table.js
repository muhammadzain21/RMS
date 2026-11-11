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
  active: { type: Boolean, default: true },
  // Per-branch dine-in tables (same name allowed on different branches)
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

TableSchema.index({ branchId: 1, name: 1 })

export default mongoose.model('Table', TableSchema)
