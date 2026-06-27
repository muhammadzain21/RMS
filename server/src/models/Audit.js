import mongoose from 'mongoose'

const AuditSchema = new mongoose.Schema({
  at: { type: String, default: () => new Date().toISOString(), index: true },
  userId: { type: String, default: '' },
  userName: { type: String, default: '' },
  // Category of action for filtering: e.g., 'sale','return','inventory','staff','booking','cash','day','auth','menu','category','expense','settings','supplier','customer','rider','table'
  type: { type: String, default: 'general', index: true },
  action: { type: String, required: true },
  meta: { type: Object, default: {} },
}, { timestamps: true })

export default mongoose.model('Audit', AuditSchema)
