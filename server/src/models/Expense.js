import mongoose from 'mongoose'

const ExpenseLineSchema = new mongoose.Schema({
  expenseHead: { type: String, default: '' },
  description: { type: String, default: '' },
  amount: { type: Number, default: 0, min: 0 },
}, { _id: false })

const ExpenseSchema = new mongoose.Schema({
  date: { type: String, required: true },
  category: { type: String, required: true },
  expenseHead: { type: String, default: '' },
  lines: { type: [ExpenseLineSchema], default: [] },
  amount: { type: Number, required: true, min: 0 },
  description: { type: String, default: '' },
  note: { type: String, default: '' },
  accountHead: { type: String, enum: ['cash', 'bank'], default: 'cash' },
  paymentMethod: { type: String, enum: ['cash', 'card', 'bank_transfer', 'cheque', 'other'], default: 'cash' },
  paidBy: { type: String, default: '' },
  paidByUserId: { type: String, default: '' },
  userId: { type: String },
  userName: { type: String },
  status: { type: String, enum: ['pending', 'approved'], default: 'pending', index: true },
  approvedBy: { type: String, default: '' },
  approvedByUserId: { type: String, default: '' },
  approvedAt: { type: Date },
  branchId: { type: String, default: '', index: true },
}, { timestamps: true })

ExpenseSchema.pre('validate', function (next) {
  if (Array.isArray(this.lines) && this.lines.length) {
    const sum = this.lines.reduce((a, l) => a + Number(l.amount || 0), 0)
    if (!this.amount && sum) this.amount = sum
    const first = this.lines[0]
    if (first?.expenseHead) {
      if (!this.expenseHead) this.expenseHead = first.expenseHead
      if (!this.category) this.category = first.expenseHead
    }
  }
  if (!this.expenseHead) this.expenseHead = this.category
  if (!this.category && this.expenseHead) this.category = this.expenseHead
  next()
})

export default mongoose.model('Expense', ExpenseSchema)
