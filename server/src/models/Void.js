import mongoose from 'mongoose'

const VoidItemSchema = new mongoose.Schema({
  itemId: { type: String },
  qty: { type: Number, default: 1 },
  custom: {
    name: { type: String },
    price: { type: Number },
    category: { type: String },
  },
  mods: { type: Map, of: mongoose.Schema.Types.Mixed },
}, { _id: false })

const VoidSchema = new mongoose.Schema({
  createdAt: { type: Date, default: Date.now, index: true },
  date: { type: String, default: '', index: true }, // yyyy-MM-dd business date
  orderType: { type: String, default: 'Dine-in', index: true },
  tokenNo: { type: String, index: true },
  waiterId: { type: String, index: true },
  tableNo: { type: String, index: true },
  reason: { type: String },
  remarks: { type: String },
  items: { type: [VoidItemSchema], default: [] },
  userId: { type: String },
  branchId: { type: String, default: '', index: true },
  idempotencyKey: { type: String, default: null, index: { unique: true, sparse: true } },
}, { timestamps: true })

export default mongoose.model('Void', VoidSchema)
