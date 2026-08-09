import mongoose from 'mongoose'

const MenuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  sku: String,
  category: String, // e.g., Pizza, Starters, Side Orders, Burger, Deals
  description: String,
  imageUrl: String,

  // Simple fixed price for the item
  price: { type: Number, required: true, default: 0 },

  // Recipe: map of ingredient name -> amount consumed per 1 qty of this menu item
  // Amount should be in the same base unit as inventory `ingredients.qty` (e.g., grams or pcs)
  recipe: { type: Map, of: Number, default: {} },

  // Display order for arranging items (lower = first)
  sortOrder: { type: Number, default: 0 },

  active: { type: Boolean, default: true },
  discount: { type: Number, default: 0 },
}, { timestamps: true })

export default mongoose.model('MenuItem', MenuItemSchema)
