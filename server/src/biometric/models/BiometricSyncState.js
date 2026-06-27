import mongoose from 'mongoose'

const { Schema, model, models } = mongoose

const BiometricSyncStateSchema = new Schema({
  deviceId: { type: String, required: true, unique: true, index: true },
  lastTimestamp: { type: Date },
  lastSuccessAt: { type: Date },
  lastErrorAt: { type: Date },
  lastError: { type: String },
}, { timestamps: true })

export const BiometricSyncState = models?.Biometric_SyncState || model('Biometric_SyncState', BiometricSyncStateSchema)
