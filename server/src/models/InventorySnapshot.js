import mongoose from 'mongoose'

const InventorySnapshotSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true }, // yyyy-MM-dd
  type: { type: String, default: 'closing' }, // 'closing' | 'sale' | 'day-close'
  items: [{
    ingredientId: { type: String, default: '' },
    name: { type: String, default: '' },
    qty: { type: Number, default: 0 },
    unit: { type: String, default: '' },
  }],
}, { timestamps: true })

// Compound index to allow multiple snapshots per day but prefer latest
InventorySnapshotSchema.index({ date: 1, createdAt: -1 })

export default mongoose.model('InventorySnapshot', InventorySnapshotSchema)
