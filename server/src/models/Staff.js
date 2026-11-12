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
  // Legacy blanket flag; prefer myWorkPages. Kept so older clients still work.
  myWorkAccess: { type: Boolean, default: true },
  // Per-page My Work access (e.g. /my/attendance, /rider). Empty = no My Work portal.
  myWorkPages: { type: [String], default: undefined },
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

export default mongoose.model('Staff', StaffSchema)
