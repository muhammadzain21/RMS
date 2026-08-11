import mongoose from 'mongoose'

const CounterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
}, { timestamps: true })

export default mongoose.model('Counter', CounterSchema)
