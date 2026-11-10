import mongoose from 'mongoose'

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  showOnPos: { type: Boolean, default: true },
  active: { type: Boolean, default: true },
  imageUrl: { type: String, default: '' },
  sortOrder: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  // '' = shared across all branches; set = branch-only category
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

CategorySchema.index({ branchId: 1, name: 1 })

export default mongoose.model('Category', CategorySchema)
