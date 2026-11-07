import mongoose from 'mongoose'

const IngredientSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  category: { type: String, default: '' },
  qty: { type: Number, default: 0 },
  unit: { type: String, default: '' },
  kg: { type: Number, default: 0 },
  lowStock: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
  expiry: { type: String, default: '' }, // store as yyyy-MM-dd string
  supplierId: { type: String, default: '' },
  // Branch-scoped inventory (warehouse stock lives in WarehouseItem)
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

IngredientSchema.index({ branchId: 1, name: 1 })

export default mongoose.model('Ingredient', IngredientSchema)
