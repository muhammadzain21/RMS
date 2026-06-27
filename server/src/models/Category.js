import mongoose from 'mongoose'

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  showOnPos: { type: Boolean, default: true },
  active: { type: Boolean, default: true },
}, { timestamps: true })

export default mongoose.model('Category', CategorySchema)
