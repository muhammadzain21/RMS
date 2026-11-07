import mongoose from 'mongoose'

const SupplyItemSchema = new mongoose.Schema({
  name: String,
  qty: Number,
  unit: String,
  price: Number,
}, { _id: false })

const SupplySchema = new mongoose.Schema({
  date: { type: String, required: true }, // yyyy-MM-dd
  supplierId: { type: String, default: '' },
  supplier: { type: String, default: '' },
  items: { type: [SupplyItemSchema], default: [] },
  cost: { type: Number, default: 0 },
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

export default mongoose.model('Supply', SupplySchema)
