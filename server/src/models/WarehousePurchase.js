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
  paidAmount: { type: Number, default: 0 },
  paymentMethod: { type: String, default: '' },
  notes: { type: String, default: '' },
  createdBy: { type: String, default: '' },
}, { timestamps: true })

export default mongoose.model('WarehousePurchase', WarehousePurchaseSchema)
