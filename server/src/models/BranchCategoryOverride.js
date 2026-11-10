import mongoose from 'mongoose'

/**
 * Per-branch overrides on top of the shared Category catalog.
 * Missing fields mean "use the shared category value".
 */
const BranchCategoryOverrideSchema = new mongoose.Schema({
  branchId: { type: String, required: true, index: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
  name: { type: String },
  showOnPos: { type: Boolean },
  active: { type: Boolean },
  imageUrl: { type: String },
  sortOrder: { type: Number },
  discount: { type: Number },
}, { timestamps: true })

BranchCategoryOverrideSchema.index({ branchId: 1, categoryId: 1 }, { unique: true })

export default mongoose.model('BranchCategoryOverride', BranchCategoryOverrideSchema)
