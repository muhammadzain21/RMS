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
  advanceLimit: { type: Number, default: 0 }, // 0 or empty => falls back to salary as the cap
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  joinDate: { type: Date },
  shiftId: { type: String, default: '' }, // Reference to shift id in StaffSettings.shifts
  myWorkAccess: { type: Boolean, default: true }, // false => hide the 'My Work' page for this staff's login
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

export default mongoose.model('Staff', StaffSchema)
