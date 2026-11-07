import mongoose from 'mongoose'

const AttendanceSchema = new mongoose.Schema({
  staffId: { type: String, required: true },
  staffName: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  checkIn: { type: String }, // HH:mm
  checkOut: { type: String }, // HH:mm
  status: { type: String, enum: ['Present','Absent','Late','Leave'], default: 'Present' },
  lateMinutes: { type: Number, default: 0 },
  earlyOutMinutes: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

AttendanceSchema.index({ staffId: 1, date: 1, branchId: 1 }, { unique: true })

export default mongoose.model('Attendance', AttendanceSchema)
