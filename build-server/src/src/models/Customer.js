import mongoose from 'mongoose'

const CustomerSchema = new mongoose.Schema({
  name: String,
  phone: { type: String, index: true },
  address: String,
  isRegular: { type: Boolean, default: false },
}, { timestamps: true })

export default mongoose.model('Customer', CustomerSchema)
