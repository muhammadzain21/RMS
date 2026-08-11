import mongoose from 'mongoose'

const DeletedSaleSchema = new mongoose.Schema({
  originalSaleId: { type: mongoose.Schema.Types.ObjectId, required: true },
  deletedAt: { type: Date, default: Date.now },
  deletedDate: { type: String, default: '' },
  deletedBy: { type: String, default: '' },
}, { strict: false, timestamps: true })

export default mongoose.models.DeletedSale || mongoose.model('DeletedSale', DeletedSaleSchema)
