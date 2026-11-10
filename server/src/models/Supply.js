import mongoose from 'mongoose'

const SupplyItemSchema = new mongoose.Schema({
  ingredientId: { type: String, default: '' },
  name: String,
  qty: Number,
  unit: String,
  price: Number,
  category: { type: String, default: '' },
  lowStock: { type: Number, default: 0 },
  expiry: { type: String, default: '' },
}, { _id: false })

/** Branch purchase invoice — one document per invoice with multiple lines. */
const SupplySchema = new mongoose.Schema({
  date: { type: String, required: true }, // yyyy-MM-dd
  supplierId: { type: String, default: '' },
  supplier: { type: String, default: '' },
  invoiceNo: { type: String, default: '' },
  notes: { type: String, default: '' },
  items: { type: [SupplyItemSchema], default: [] },
  cost: { type: Number, default: 0 },
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

export default mongoose.model('Supply', SupplySchema)
