import mongoose from 'mongoose'

/** Supplier payment against a specific purchase invoice */
const WarehousePaymentSchema = new mongoose.Schema({
  supplierId: { type: String, required: true, index: true },
  supplierName: { type: String, default: '' },
  date: { type: String, default: '', index: true },
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, enum: ['cash', 'bank', 'cheque', 'other'], default: 'cash' },
  reference: { type: String, default: '' },
  // Required for new payments — links to WarehousePurchase (legacy rows may be empty)
  purchaseId: { type: String, default: '', index: true },
  invoiceNo: { type: String, default: '' },
  notes: { type: String, default: '' },
  createdBy: { type: String, default: '' },
}, { timestamps: true })

WarehousePaymentSchema.index({ purchaseId: 1, createdAt: -1 })

export default mongoose.model('WarehousePayment', WarehousePaymentSchema)
