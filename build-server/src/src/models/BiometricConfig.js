import mongoose from 'mongoose'

const BiometricConfigSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  ip: { type: String, default: '' },
  port: { type: Number, default: 4370 },
  deviceId: { type: String, default: 'ZK-01' },
  commPassword: { type: Number, default: 0 },
  pollIntervalMs: { type: Number, default: 120000 },
  duplicateWindowSec: { type: Number, default: 60 },
}, { timestamps: true })

export default mongoose.model('BiometricConfig', BiometricConfigSchema)
