import mongoose from 'mongoose'

/** Line items for a call-center order (NOT a KOT until cashier accepts at branch). */
const CcItemSchema = new mongoose.Schema({
  itemId: { type: String, default: '' },
  name: { type: String, required: true },
  qty: { type: Number, default: 1 },
  price: { type: Number, default: 0 },
  category: { type: String, default: '' },
  notes: { type: String, default: '' },
  mods: { type: Map, of: mongoose.Schema.Types.Mixed },
}, { _id: false })

/**
 * Call center submits here. Branch cashier one-click → cart → KOT.
 * Never creates kitchen KOT directly.
 */
const CallCenterOrderSchema = new mongoose.Schema({
  branchId: { type: String, required: true, index: true },
  // Snapshot at submit so queue/inbox always show a clear branch name
  branchName: { type: String, default: '' },
  status: {
    type: String,
    // pending → accepted (in cart) → kot_created → preparing → ready → completed | cancelled
    enum: ['pending', 'accepted', 'kot_created', 'preparing', 'ready', 'completed', 'cancelled', 'expired'],
    default: 'pending',
    index: true,
  },
  orderType: { type: String, default: 'Delivery', index: true }, // Delivery | Takeaway | Dine-in
  customer: {
    id: { type: String, default: '' },
    name: { type: String, default: '' },
    phone: { type: String, default: '', index: true },
    address: { type: String, default: '' },
  },
  items: { type: [CcItemSchema], default: [] },
  remarks: { type: String, default: '' },
  // Pricing snapshot (menu rates are shared; amounts frozen at submit time)
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  // Who created on cloud
  createdBy: { type: String, default: '' },
  createdByName: { type: String, default: '' },
  // After cashier accepts locally
  acceptedAt: { type: Date, default: null },
  acceptedBy: { type: String, default: '' },
  recallId: { type: String, default: '' },
  kotId: { type: String, default: '' },
  // Sync helpers
  localId: { type: String, default: null, index: true },
  syncedAt: { type: Date, default: null },
  idempotencyKey: { type: String, default: null, index: { unique: true, sparse: true } },
}, { timestamps: true })

CallCenterOrderSchema.index({ branchId: 1, status: 1, createdAt: -1 })

export default mongoose.model('CallCenterOrder', CallCenterOrderSchema)
