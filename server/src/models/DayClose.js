import mongoose from 'mongoose'

const DayCloseSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true }, // YYYY-MM-DD
  openingCash: { type: Number, required: true },
  cashSales: { type: Number, required: true },
  cardSales: { type: Number, required: true },
  onlineSales: { type: Number, default: 0 },
  complimentarySales: { type: Number, default: 0 },
  staffSales: { type: Number, default: 0 },
  partySales: { type: Number, default: 0 },
  returns: { type: Number, default: 0 },
  handovers: { type: Number, required: true },
  handoverTo: { type: String, default: '' }, // who the handover cash was given to
  leftAtCounter: { type: Number, default: 0 }, // cash left in drawer → next day's opening
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
