import mongoose from 'mongoose'

const DemandItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, default: '' },
  currentStock: { type: Number, default: 0 },
  isFromInventory: { type: Boolean, default: false },
  ingredientId: { type: String, default: '' },
})

const DemandSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true },
  items: [DemandItemSchema],
  status: { type: String, enum: ['pending', 'sent', 'completed'], default: 'pending' },
  note: { type: String, default: '' },
  createdBy: { type: String, default: '' },
  createdByName: { type: String, default: '' },
}, { timestamps: true })

export default mongoose.model('Demand', DemandSchema)
