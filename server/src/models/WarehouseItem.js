import mongoose from 'mongoose'

/** Central warehouse stock (HQ). Branch inventory stays on Ingredient with branchId. */
const WarehouseItemSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  sku: { type: String, default: '', index: true },
  category: { type: String, default: '' },
  qty: { type: Number, default: 0 },
  unit: { type: String, default: '' },
  lowStock: { type: Number, default: 0 },
  // Latest / average purchase cost
  costPrice: { type: Number, default: 0 },
  // Optional transfer / list price shown to branches
  transferPrice: { type: Number, default: 0 },
  supplierId: { type: String, default: '' },
  notes: { type: String, default: '' },
  active: { type: Boolean, default: true },
}, { timestamps: true })

WarehouseItemSchema.index({ name: 1 }, { unique: true })

export default mongoose.model('WarehouseItem', WarehouseItemSchema)
