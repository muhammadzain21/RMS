import mongoose from 'mongoose'

const TransferLineSchema = new mongoose.Schema({
  warehouseItemId: { type: String, default: '' },
  name: { type: String, required: true },
  qty: { type: Number, required: true },
  unit: { type: String, default: '' },
  unitCost: { type: Number, default: 0 },
  transferPrice: { type: Number, default: 0 },
}, { _id: false })

/**
 * HQ → branch stock transfer.
 * status: pending (on cloud) → received (cashier one-click adds into branch Ingredient inventory)
 */
const WarehouseTransferSchema = new mongoose.Schema({
  toBranchId: { type: String, required: true, index: true },
  toBranchName: { type: String, default: '' },
  status: {
    type: String,
    enum: ['draft', 'sent', 'received', 'cancelled'],
    default: 'sent',
    index: true,
  },
  date: { type: String, default: '', index: true },
  items: { type: [TransferLineSchema], default: [] },
  notes: { type: String, default: '' },
  createdBy: { type: String, default: '' },
  sentAt: { type: Date, default: Date.now },
  receivedAt: { type: Date, default: null },
  receivedBy: { type: String, default: '' },
  // After one-click receive at branch
  appliedToInventory: { type: Boolean, default: false },
  // Linked branch demand (optional)
  demandId: { type: String, default: '', index: true },
}, { timestamps: true })

WarehouseTransferSchema.index({ toBranchId: 1, status: 1, createdAt: -1 })

export default mongoose.model('WarehouseTransfer', WarehouseTransferSchema)
