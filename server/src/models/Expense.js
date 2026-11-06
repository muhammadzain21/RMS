import mongoose from 'mongoose'

const ExpenseSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD for easy filtering
  // Expense head / category (e.g. Rent, Utilities, Salaries)
  category: { type: String, required: true },
  expenseHead: { type: String, default: '' }, // mirrors category; kept for clarity in reports
  amount: { type: Number, required: true, min: 0 },
  description: { type: String, default: '' },
  note: { type: String, default: '' },
  // Which account funded this expense
  accountHead: { type: String, enum: ['cash', 'bank'], default: 'cash' }, // cash in hand | bank
  // How it was paid
  paymentMethod: { type: String, enum: ['cash', 'card', 'bank_transfer', 'cheque', 'other'], default: 'cash' },
  // Who paid / authorized the expense
  paidBy: { type: String, default: '' },
  paidByUserId: { type: String, default: '' },
  userId: { type: String },
  userName: { type: String },
}, { timestamps: true })

ExpenseSchema.pre('validate', function (next) {
  if (!this.expenseHead) this.expenseHead = this.category
  if (!this.category && this.expenseHead) this.category = this.expenseHead
  next()
})

export default mongoose.model('Expense', ExpenseSchema)
