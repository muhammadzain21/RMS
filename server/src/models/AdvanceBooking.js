import mongoose from 'mongoose'

const AdvanceBookingSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true }, // YYYY-MM-DD
  time: { type: String, default: '' }, // HH:mm or free text
  customer: { type: String, default: '' },
  phone: { type: String, default: '' },
  deposit: { type: Number, default: 0 },
  status: { type: String, default: 'Booked' }, // 'Booked' | 'Completed' | 'Cancelled'
  note: { type: String, default: '' },
  settledSaleId: { type: String, default: '' },
  userId: { type: String, default: '' },
  userName: { type: String, default: '' },
}, { timestamps: true })

export default mongoose.model('AdvanceBooking', AdvanceBookingSchema)
