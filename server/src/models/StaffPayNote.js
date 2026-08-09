import mongoose from 'mongoose'

const StaffPayNoteSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  month: { type: String, required: true }, // YYYY-MM
  date: { type: String, default: '' }, // yyyy-MM-dd business date
  notes: { type: String, default: '' },
  amount: { type: Number, required: true },
  userId: { type: String, default: '' },
  userName: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true })

export default mongoose.model('StaffPayNote', StaffPayNoteSchema)
