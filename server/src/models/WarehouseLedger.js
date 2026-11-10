import mongoose from 'mongoose'

/**
 * HQ warehouse cash book — double-entry style lines for cash vs bank.
 * Branches never write here; HQ records remittances and spends.
 */
const WarehouseLedgerSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true },
  // cash | bank — which pot moved
  account: {
    type: String,
    enum: ['cash', 'bank'],
    required: true,
    index: true,
  },
  // +in / -out from HQ perspective
  direction: {
    type: String,
    enum: ['in', 'out'],
    required: true,
  },
  amount: { type: Number, required: true, min: 0 },
  accountHeadId: { type: String, default: '', index: true },
  accountHeadName: { type: String, default: '' },
  // Optional link when cash received from a branch
  fromBranchId: { type: String, default: '', index: true },
  fromBranchName: { type: String, default: '' },
  // For cash↔bank internal moves, pair id
  transferPairId: { type: String, default: '', index: true },
  reference: { type: String, default: '' },
  notes: { type: String, default: '' },
  createdBy: { type: String, default: '' },
  createdByName: { type: String, default: '' },
  // Idempotent remittance / entry key
  idempotencyKey: {
    type: String,
    default: null,
    index: { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
  },
}, { timestamps: true })

WarehouseLedgerSchema.index({ date: 1, account: 1, createdAt: -1 })

export default mongoose.model('WarehouseLedger', WarehouseLedgerSchema)
