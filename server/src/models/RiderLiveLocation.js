import mongoose from 'mongoose'

/** Latest GPS ping per rider (staff who deliver). One doc per riderId. */
const RiderLiveLocationSchema = new mongoose.Schema({
  riderId: { type: String, required: true, unique: true, index: true },
  riderName: { type: String, default: '' },
  staffId: { type: String, default: '', index: true },
  branchId: { type: String, default: '', index: true },
  status: {
    type: String,
    enum: ['offline', 'available', 'on_delivery'],
    default: 'offline',
    index: true,
  },
  lat: { type: Number },
  lng: { type: Number },
  accuracy: { type: Number, default: null },
  heading: { type: Number, default: null },
  speed: { type: Number, default: null },
  // Active delivery context (optional)
  saleId: { type: String, default: '' },
  orderLabel: { type: String, default: '' },
  customerName: { type: String, default: '' },
  customerAddress: { type: String, default: '' },
  startedAt: { type: Date, default: null },
  lastPingAt: { type: Date, default: null, index: true },
}, { timestamps: true })

export default mongoose.model('RiderLiveLocation', RiderLiveLocationSchema)
