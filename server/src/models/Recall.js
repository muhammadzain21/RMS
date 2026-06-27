import mongoose from 'mongoose'

const LineSchema = new mongoose.Schema({
  itemId: { type: String, default: '' },
  name: String,
  price: Number,
  qty: Number,
  mods: { type: Object, default: {} },
  custom: { type: Object, default: null },
}, { _id: false, strict: false })

const CustomerSchema = new mongoose.Schema({
  name: String,
  phone: String,
  address: String,
}, { _id: false })

const RecallSchema = new mongoose.Schema({
  createdAt: { type: Number, required: true },
  // Business date (YYYY-MM-DD) to scope tokens per day; optional for backward compatibility
  date: { type: String, default: '' },
  orderType: { type: String, enum: ['Dine-in','Take-away','Delivery','Drive Through','Drive-thru'], required: true },
  items: { type: [LineSchema], default: [] },
  orderNo: { type: String, default: '' },
  tokenNo: { type: String, default: '' },
  waiterId: { type: String, default: '' },
  tableNo: { type: String, default: '' },
  riderId: { type: String, default: '' },
  riderName: { type: String, default: '' },
  customer: { type: CustomerSchema, default: null },
  totalQty: { type: Number, default: 0 },
  subtotal: { type: Number, default: 0 },
  itemsDiscount: { type: Number, default: 0 },
  billDiscount: { type: Number, default: 0 },
  taxAmt: { type: Number, default: 0 },
  serviceAmt: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  remarks: { type: String, default: '' },
  paymentMethod: { type: String, default: 'cash' },
  idempotencyKey: { type: String, default: null, index: { unique: true, sparse: true } },
}, { timestamps: true })

export default mongoose.model('Recall', RecallSchema)
