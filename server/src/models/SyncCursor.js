import mongoose from 'mongoose'

/** Per-branch sync cursor for cloud ↔ local replication */
const SyncCursorSchema = new mongoose.Schema({
  branchId: { type: String, required: true, index: true },
  collectionName: { type: String, required: true },
  lastPulledAt: { type: Date, default: null },
  lastPushedAt: { type: Date, default: null },
  deviceId: { type: String, default: 'default' },
}, { timestamps: true })

SyncCursorSchema.index({ branchId: 1, collectionName: 1, deviceId: 1 }, { unique: true })

export default mongoose.model('SyncCursor', SyncCursorSchema)
