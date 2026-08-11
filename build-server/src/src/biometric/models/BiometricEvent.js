import mongoose from 'mongoose'

const { Schema, model, models } = mongoose

const BiometricEventSchema = new Schema({
  deviceId: { type: String, required: true, index: true },
  enrollId: { type: String, required: true, index: true },
  staffId: { type: String, index: true },
  timestamp: { type: Date, required: true, index: true },
  date: { type: String, required: true, index: true },
  time: { type: String, required: true },
  type: { type: String, enum: ['check_in','check_out','ignored_duplicate','unknown_enroll'], required: true },
  raw: { type: Schema.Types.Mixed },
}, { timestamps: true })

BiometricEventSchema.index({ deviceId: 1, enrollId: 1, timestamp: 1 }, { unique: true })

export const BiometricEvent = models?.Biometric_Event || model('Biometric_Event', BiometricEventSchema)
