import mongoose from 'mongoose'

/** Chart of accounts for HQ warehouse cash book (not used on branch POS). */
const WarehouseAccountHeadSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: {
    type: String,
    // income = money in (e.g. Branch remittance); expense = money out; transfer = cash↔bank
    enum: ['income', 'expense', 'transfer', 'asset'],
    default: 'expense',
    index: true,
  },
  active: { type: Boolean, default: true },
  notes: { type: String, default: '' },
}, { timestamps: true })

WarehouseAccountHeadSchema.index({ name: 1 }, { unique: true })

export default mongoose.model('WarehouseAccountHead', WarehouseAccountHeadSchema)
