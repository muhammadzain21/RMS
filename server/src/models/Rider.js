import mongoose from 'mongoose'

const RiderSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  phone: { type: String, default: '', index: true },
  vehicle: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  note: { type: String, default: '' },
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

export default mongoose.model('Rider', RiderSchema)
