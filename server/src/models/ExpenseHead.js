import mongoose from 'mongoose'

const ExpenseHeadSchema = new mongoose.Schema({
  branchId: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  nameKey: { type: String, required: true, trim: true, lowercase: true },
  active: { type: Boolean, default: true },
}, { timestamps: true })

ExpenseHeadSchema.pre('validate', function (next) {
  if (this.name) this.nameKey = String(this.name).trim().toLowerCase()
  next()
})

ExpenseHeadSchema.index({ branchId: 1, nameKey: 1 }, { unique: true })

export default mongoose.model('ExpenseHead', ExpenseHeadSchema)
