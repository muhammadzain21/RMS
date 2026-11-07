import mongoose from 'mongoose'

/** Supplier payment ledger for warehouse purchases */
const WarehousePaymentSchema = new mongoose.Schema({
  supplierId: { type: String, required: true, index: true },
  supplierName: { type: String, default: '' },
  date: { type: String, default: '', index: true },
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, enum: ['cash', 'bank', 'cheque', 'other'], default: 'cash' },
  reference: { type: String, default: '' },
  purchaseId: { type: String, default: '' },
  notes: { type: String, default: '' },
  createdBy: { type: String, default: '' },
}, { timestamps: true })

export default mongoose.model('WarehousePayment', WarehousePaymentSchema)
