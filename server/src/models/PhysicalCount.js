import mongoose from 'mongoose'

// Physical stock counts entered on the Consumption page, keyed by business date.
const PhysicalCountSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true }, // yyyy-MM-dd
  counts: { type: Map, of: Number, default: {} }, // ingredient name -> counted qty
}, { timestamps: true })

export default mongoose.model('PhysicalCount', PhysicalCountSchema)
