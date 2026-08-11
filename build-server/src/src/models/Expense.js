import mongoose from 'mongoose'

const ExpenseSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD for easy filtering
  category: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  description: { type: String, default: '' },
  note: { type: String, default: '' },
  userId: { type: String },
  userName: { type: String },
}, { timestamps: true })

export default mongoose.model('Expense', ExpenseSchema)
