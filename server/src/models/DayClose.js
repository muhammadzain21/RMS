import mongoose from 'mongoose'

const DayCloseSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true }, // YYYY-MM-DD
  openingCash: { type: Number, required: true },
  cashSales: { type: Number, required: true },
  cardSales: { type: Number, required: true },
  partySales: { type: Number, default: 0 },
  returns: { type: Number, default: 0 },
  handovers: { type: Number, required: true },
  payIns: { type: Number, required: true },
  payOuts: { type: Number, required: true },
  expectedCash: { type: Number, required: true },
  countedCash: { type: Number, required: true },
  variance: { type: Number, required: true },
  note: { type: String, default: '' },
  userId: { type: String, default: '' },
  userName: { type: String, default: '' },
}, { timestamps: true })

export default mongoose.model('DayClose', DayCloseSchema)
