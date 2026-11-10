import mongoose from 'mongoose'

/**
 * Per-branch overrides on top of the shared MenuItem catalog.
 * Missing fields mean "use the shared item value".
 */
const BranchMenuOverrideSchema = new mongoose.Schema({
  branchId: { type: String, required: true, index: true },
  menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true, index: true },
  price: { type: Number },
  priceFoodpanda: { type: Number },
  discount: { type: Number },
  active: { type: Boolean },
  name: { type: String },
  category: { type: String },
  sortOrder: { type: Number },
  imageUrl: { type: String },
  // Branch-specific recipe (ingredient name → amount). When set, overrides shared recipe for this branch.
  recipe: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true })

BranchMenuOverrideSchema.index({ branchId: 1, menuItemId: 1 }, { unique: true })

export default mongoose.model('BranchMenuOverride', BranchMenuOverrideSchema)
