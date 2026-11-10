import mongoose from 'mongoose'

const PurchaseLineSchema = new mongoose.Schema({
  warehouseItemId: { type: String, default: '' },
  name: { type: String, required: true },
  qty: { type: Number, required: true },
  unit: { type: String, default: '' },
  unitCost: { type: Number, default: 0 },
  lineTotal: { type: Number, default: 0 },
}, { _id: false })

/** HQ warehouse purchases — increases WarehouseItem qty. */
const WarehousePurchaseSchema = new mongoose.Schema({
  date: { type: String, default: '', index: true }, // yyyy-MM-dd
  supplierId: { type: String, default: '' },
  supplierName: { type: String, default: '' },
  invoiceNo: { type: String, default: '' },
  items: { type: [PurchaseLineSchema], default: [] },
  total: { type: Number, default: 0 },
  // Kept in sync with sum of WarehousePayment for this purchase
  paidAmount: { type: Number, default: 0 },
  paymentMethod: { type: String, default: '' },
  notes: { type: String, default: '' },
  createdBy: { type: String, default: '' },
}, { timestamps: true })

WarehousePurchaseSchema.virtual('balanceDue').get(function balanceDue() {
  return Math.max(0, (Number(this.total) || 0) - (Number(this.paidAmount) || 0))
})

WarehousePurchaseSchema.set('toJSON', { virtuals: true })
WarehousePurchaseSchema.set('toObject', { virtuals: true })

export default mongoose.model('WarehousePurchase', WarehousePurchaseSchema)
