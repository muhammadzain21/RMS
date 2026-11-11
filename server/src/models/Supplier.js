import mongoose from 'mongoose'

const SupplierSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  company: { type: String, default: '' },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  taxId: { type: String, default: '' },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  // 'warehouse' = HQ warehouse suppliers; 'branch' = branch-level suppliers
  scope: { type: String, default: '', index: true },
  // Branch suppliers only — warehouse suppliers stay unscoped / HQ
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

SupplierSchema.index({ branchId: 1, name: 1 })
SupplierSchema.index({ scope: 1, branchId: 1 })

export default mongoose.model('Supplier', SupplierSchema)
