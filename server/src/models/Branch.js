import mongoose from 'mongoose'

const BranchSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
  name: { type: String, required: true, trim: true },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  // 'online' = cloud-first; 'hybrid' = local Mongo + sync; 'offline' = local only (rare)
  mode: { type: String, enum: ['online', 'hybrid', 'offline'], default: 'hybrid' },
  active: { type: Boolean, default: true, index: true },
  // Optional: mark one branch as the HQ / warehouse site
  isWarehouse: { type: Boolean, default: false },
  notes: { type: String, default: '' },
}, { timestamps: true })

export default mongoose.model('Branch', BranchSchema)
