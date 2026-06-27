import mongoose from 'mongoose'

const { Schema, model, models } = mongoose

const BiometricMappingSchema = new Schema({
  deviceId: { type: String, required: true, index: true },
  enrollId: { type: String, required: true, index: true },
  staffId: { type: String, required: true, index: true },
  active: { type: Boolean, default: true },
}, { timestamps: true })

BiometricMappingSchema.index({ deviceId: 1, enrollId: 1 }, { unique: true })

export const BiometricMapping = models?.Biometric_Mapping || model('Biometric_Mapping', BiometricMappingSchema)
