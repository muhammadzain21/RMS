import mongoose from 'mongoose'

const StaffSchema = new mongoose.Schema({
  // Basic
  name: { type: String, required: true },
  phone: { type: String, default: '' },

  // Personal
  cnic: { type: String, default: '' },
  address: { type: String, default: '' },

  // Job
  position: { type: String, default: 'Staff' }, // e.g., Staff | Waiter | Chef | Cashier | Manager | Rider
  salary: { type: Number, default: 0 },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  joinDate: { type: Date },
  shiftId: { type: String, default: '' }, // Reference to shift id in StaffSettings.shifts
}, { timestamps: true })

export default mongoose.model('Staff', StaffSchema)
