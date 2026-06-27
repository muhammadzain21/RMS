import mongoose from 'mongoose'

const SaleSchema = new mongoose.Schema({
  idempotencyKey: { type: String, default: null, index: { unique: true, sparse: true } },
}, { strict: false, timestamps: true })

export default mongoose.models.Sale || mongoose.model('Sale', SaleSchema)
