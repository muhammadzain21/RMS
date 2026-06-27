import mongoose from 'mongoose'

const LineSchema = new mongoose.Schema({
  itemId: { type: String, default: '' },
  name: String,
  price: Number,
  qty: Number,
  mods: { type: Object, default: {} },
  custom: { type: Object, default: null },
}, { _id: false, strict: false })

const HeldSchema = new mongoose.Schema({
  createdAt: { type: Number, required: true },
  orderType: { type: String, enum: ['Dine-in','Take-away','Delivery','Drive Through','Drive-thru'], required: true },
  items: { type: [LineSchema], default: [] },
  waiterId: { type: String, default: '' },
  tableNo: { type: String, default: '' },
  remarks: { type: String, default: '' },
  paymentMethod: { type: String, default: 'cash' },
  customer: { type: Object, default: null },
  idempotencyKey: { type: String, default: null, index: { unique: true, sparse: true } },
}, { timestamps: true })

export default mongoose.model('Held', HeldSchema)
