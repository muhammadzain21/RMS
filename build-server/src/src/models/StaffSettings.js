import mongoose from 'mongoose'

const StaffSettingsSchema = new mongoose.Schema({
  // Shifts array - each shift has id, name, checkIn, checkOut
  shifts: {
    type: [{
      id: { type: String, required: true },
      name: { type: String, required: true },
      checkIn: { type: String, required: true },
      checkOut: { type: String, required: true }
    }],
    default: []
  },
  lateThresholdMinutes: { type: Number, default: 15 },
  bonusPerDay: { type: Number, default: 0 },
  deductionPerAbsent: { type: Number, default: 0 },
  deductionPerLate: { type: Number, default: 0 },
  deductionPerMinute: { type: Number, default: 0 },
  deductionPerMinuteEarlyOut: { type: Number, default: 0 },
  absentChargesEnabled: { type: Boolean, default: false },
}, { timestamps: true })

export default mongoose.model('StaffSettings', StaffSettingsSchema)
