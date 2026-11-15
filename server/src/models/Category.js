import mongoose from 'mongoose'

/** Always-included items inside a deal/subcategory (e.g. 1L drink). */
const BundleItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  name: { type: String, default: '' },
  qty: { type: Number, default: 1 },
  // 0 = locked to qty; >0 allows cashier to raise up to maxQty
  maxQty: { type: Number, default: 0 },
}, { _id: false })

/** Linked category slot inside a deal (e.g. Small Pizzas with min/max picks). */
const BundleSlotSchema = new mongoose.Schema({
  categoryId: { type: String, required: true },
  categoryName: { type: String, default: '' },
  label: { type: String, default: '' },
  minItems: { type: Number, default: 0 },
  maxItems: { type: Number, default: 1 },
}, { _id: false })

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  showOnPos: { type: Boolean, default: true },
  active: { type: Boolean, default: true },
  imageUrl: { type: String, default: '' },
  sortOrder: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  // When > 0, bill uses this package price and ignores item prices for this category
  price: { type: Number, default: 0 },
  // Selection limits on KOT (0 = no limit) — for flat categories
  minItems: { type: Number, default: 0 },
  maxItems: { type: Number, default: 0 },
  // Hierarchy: empty = main/top-level; set = subcategory of that category id
  parentCategoryId: { type: String, default: '', index: true },
  // Deal composition (optional). Package price still comes from `price`.
  bundleItems: { type: [BundleItemSchema], default: [] },
  bundleSlots: { type: [BundleSlotSchema], default: [] },
  // '' = shared across all branches; set = branch-only category
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

CategorySchema.index({ branchId: 1, name: 1 })

export default mongoose.model('Category', CategorySchema)
