import { Router } from 'express'
import RiderCash from '../models/RiderCash.js'
import Sale from '../models/Sale.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { blockIfClosedFromBody, blockIfClosedFromModel, isDateClosed } from '../middleware/dayClosed.js'

const router = Router()

router.use(authRequired)

// List records (optionally by date or rider)
router.get('/', async (req, res, next) => {
  try {
    const { date, from, to, riderId, settled } = req.query
    const q = {}
    if (date) q.date = String(date)
    if (from || to) {
      q.date = {}
      if (from) q.date.$gte = String(from)
      if (to) q.date.$lte = String(to)
    }
    if (riderId) q.riderId = riderId
    if (settled === 'true') q.settled = true
    if (settled === 'false') q.settled = false
    const rows = await RiderCash.find(q).sort({ createdAt: -1 }).lean()
    // Attach tokenNo from Sale collection where orderId matches Sale _id
    const orderIds = rows.map(r => r.orderId).filter(Boolean)
    if (orderIds.length) {
      const sales = await Sale.find({ _id: { $in: orderIds } }).select('tokenNo billNo').lean()
      const saleMap = {}
      sales.forEach(s => { saleMap[String(s._id)] = s })
      rows.forEach(r => {
        if (r.orderId && saleMap[String(r.orderId)]) {
          r.tokenNo = saleMap[String(r.orderId)].tokenNo || ''
        }
      })
    }
    res.json(rows)
  } catch (e) { next(e) }
})

// Create a record
router.post('/', requireRole('Admin','Manager','Cashier'), blockIfClosedFromBody('date'), async (req, res, next) => {
  try {
    const payload = req.body || {}
    // If orderId provided, upsert per order
    if (payload.orderId) {
      const doc = {
        date: payload.date,
        riderId: payload.riderId,
        riderName: payload.riderName || '',
        deliveries: Number(payload.deliveries||0),
        amount: Number(payload.amount||0),
        deliveryCharge: Number(payload.deliveryCharge||0),
        method: payload.method || 'COD',
        note: payload.note || '',
        userId: req.user?.id || '',
        userName: req.user?.username || '',
      }
      const rec = await RiderCash.findOneAndUpdate({ orderId: String(payload.orderId) }, { ...doc, orderId: String(payload.orderId) }, { upsert: true, new: true, setDefaultsOnInsert: true })
      try { await Audit.create({
        type: 'cash',
        userId: req.user?.id || '',
        userName: req.user?.username || 'system',
        action: `Upsert rider-cash for order ${payload.orderId}`,
        meta: { orderId: payload.orderId, riderId: doc.riderId, riderName: doc.riderName, date: doc.date, deliveries: doc.deliveries }
      }) } catch {}
      return res.status(201).json(rec)
    }
    const rec = await RiderCash.create({
      date: payload.date,
      riderId: payload.riderId,
      riderName: payload.riderName || '',
      deliveries: Number(payload.deliveries||0),
      amount: Number(payload.amount||0),
      deliveryCharge: Number(payload.deliveryCharge||0),
      method: payload.method || 'COD',
      note: payload.note || '',
      userId: req.user?.id || '',
      userName: req.user?.username || '',
    })
    try { await Audit.create({
      type: 'cash',
      userId: req.user?.id || '',
      userName: req.user?.username || 'system',
      action: `Added rider-cash record for ${rec.riderName}`,
      meta: { id: rec._id, date: rec.date, riderId: rec.riderId, deliveries: rec.deliveries, amount: rec.amount }
    }) } catch {}
    return res.status(201).json(rec)
  } catch (e) { next(e) }
})

// Delete a record
router.delete('/:id', requireRole('Admin','Manager'), blockIfClosedFromModel(RiderCash), async (req, res, next) => {
  try {
    const prev = await RiderCash.findById(req.params.id)
    await RiderCash.findByIdAndDelete(req.params.id)
    try { await Audit.create({
      type: 'cash',
      userId: req.user?.id || '',
      userName: req.user?.username || 'system',
      action: `Deleted rider-cash record ${req.params.id}`,
      meta: { id: req.params.id, riderId: prev?.riderId, riderName: prev?.riderName, date: prev?.date }
    }) } catch {}
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// Rollup totals per rider for a date
router.get('/rollup', async (req, res, next) => {
  try {
    const { date } = req.query
    if (!date) return res.status(400).json({ error: 'date is required' })
    const rows = await RiderCash.aggregate([
      { $match: { date: String(date) } },
      { $group: {
        _id: '$riderId',
        riderId: { $first: '$riderId' },
        riderName: { $first: '$riderName' },
        deliveries: { $sum: '$deliveries' },
        amount: { $sum: '$amount' },
        deliveryCharge: { $sum: '$deliveryCharge' },
        unsettled: { $sum: { $cond: [{ $eq: ['$settled', false] }, 1, 0] } },
      } },
      { $sort: { riderName: 1 } }
    ])
    res.json(rows)
  } catch (e) { next(e) }
})

// Mark settled for a rider on a date
router.patch('/settle', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const { date, riderId, settled } = { ...req.query, ...req.body }
    if (!date || !riderId) return res.status(400).json({ error: 'date and riderId required' })
    if (await isDateClosed(String(date))) return res.status(409).json({ error: `Date ${date} is closed` })
    const result = await RiderCash.updateMany({ date: String(date), riderId: String(riderId) }, { $set: { settled: settled === false ? false : true } })
    try { await Audit.create({
      type: 'cash',
      userId: req.user?.id || '',
      userName: req.user?.username || 'system',
      action: `Marked rider-cash settled for rider ${riderId} on ${date}`,
      meta: { date, riderId, settled: settled !== false }
    }) } catch {}
    res.json({ ok: true, matched: result.matchedCount ?? result.n, modified: result.modifiedCount ?? result.nModified })
  } catch (e) { next(e) }
})

// CSV export by date
router.get('/export', async (req, res, next) => {
  try {
    const { date } = req.query
    if (!date) return res.status(400).json({ error: 'date is required' })
    const rows = await RiderCash.find({ date: String(date) }).sort({ riderName: 1 })
    // Rename 'note' column to 'address' in CSV to match UI terminology
    const headers = ['date','riderName','deliveries','amount','deliveryCharge','method','orderId','address','settled']
    const escape = (v) => '"' + String(v ?? '').replaceAll('"','""') + '"'
    const lines = rows.map(r => [
      r.date,
      r.riderName,
      r.deliveries,
      r.amount,
      r.deliveryCharge,
      r.method,
      r.orderId,
      r.note,
      r.settled ? 'Yes' : 'No',
    ].map(escape).join(',')).join('\n')
    const csv = headers.join(',') + '\n' + lines
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="rider_cash_${date}.csv"`)
    res.send(csv)
  } catch (e) { next(e) }
})

export default router
