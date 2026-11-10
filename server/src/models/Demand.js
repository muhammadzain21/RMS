import mongoose from 'mongoose'

const DemandItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, default: '' },
  currentStock: { type: Number, default: 0 },
  isFromInventory: { type: Boolean, default: false },
  ingredientId: { type: String, default: '' },
  // Optional map to HQ warehouse item (name match or explicit id)
  warehouseItemId: { type: String, default: '' },
  // Qty actually issued (may be less than requested)
  issuedQty: { type: Number, default: 0 },
}, { _id: false })

const DemandSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true },
  items: [DemandItemSchema],
  // pending → sent (to HQ) → accepted → issued (transfer created) → completed | rejected
  status: {
    type: String,
    enum: ['pending', 'sent', 'accepted', 'issued', 'completed', 'rejected'],
    default: 'pending',
    index: true,
  },
  // Where the demand is directed
  target: {
    type: String,
    enum: ['warehouse', 'branch'],
    default: 'warehouse',
    index: true,
  },
  note: { type: String, default: '' },
  createdBy: { type: String, default: '' },
  createdByName: { type: String, default: '' },
  branchId: { type: String, default: '', index: true },
  branchName: { type: String, default: '' },
  // HQ handling
  acceptedAt: { type: Date, default: null },
  acceptedBy: { type: String, default: '' },
  rejectedReason: { type: String, default: '' },
  transferId: { type: String, default: '', index: true },
}, { timestamps: true })

DemandSchema.index({ branchId: 1, status: 1, createdAt: -1 })
DemandSchema.index({ target: 1, status: 1, createdAt: -1 })

export default mongoose.model('Demand', DemandSchema)
