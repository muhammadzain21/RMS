import mongoose from 'mongoose'

const SupplierSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  company: { type: String, default: '' },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  taxId: { type: String, default: '' },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
}, { timestamps: true })

export default mongoose.model('Supplier', SupplierSchema)
