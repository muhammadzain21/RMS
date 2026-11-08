import mongoose from 'mongoose'

const MenuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  sku: String,
  category: String, // e.g., Pizza, Starters, Side Orders, Burger, Deals
  description: String,
  imageUrl: String,

  // Simple fixed price for the item (Dine-in / Take-away / Delivery)
  price: { type: Number, required: true, default: 0 },
  // Optional Foodpanda / aggregator price (falls back to `price` when 0/empty)
  priceFoodpanda: { type: Number, default: 0 },

  // Recipe: map of ingredient name -> amount consumed per 1 qty of this menu item
  // Amount should be in the same base unit as inventory `ingredients.qty` (e.g., grams or pcs)
  // Using Mixed type instead of Map to allow keys with special characters (e.g., "7UP 1.5Liter")
  recipe: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Display order for arranging items (lower = first)
  sortOrder: { type: Number, default: 0 },

  active: { type: Boolean, default: true },
  discount: { type: Number, default: 0 },

  // Empty/null = shared across all branches. Set = only visible for that branch.
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

MenuItemSchema.index({ name: 1, category: 1, branchId: 1 })

export default mongoose.model('MenuItem', MenuItemSchema)
