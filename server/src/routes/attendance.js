import { Router } from 'express'
import Attendance from '../models/Attendance.js'
import Audit from '../models/Audit.js'
import { authRequired } from '../middleware/auth.js'

const router = Router()

// Upsert attendance record for a specific staff+date
router.post('/', authRequired, async (req, res, next) => {
  try {
    const { staffId, staffName, date, checkIn, checkOut, status, notes, lateMinutes, earlyOutMinutes } = req.body || {}
    if (!staffId || !date || !staffName) return res.status(400).json({ error: 'staffId, staffName and date are required' })
    const update = {}
    if (checkIn !== undefined) update.checkIn = checkIn
    if (checkOut !== undefined) update.checkOut = checkOut
    if (status !== undefined) update.status = status
    if (notes !== undefined) update.notes = notes
    if (lateMinutes !== undefined) update.lateMinutes = Number(lateMinutes || 0)
    if (earlyOutMinutes !== undefined) update.earlyOutMinutes = Number(earlyOutMinutes || 0)
    const doc = await Attendance.findOneAndUpdate(
      { staffId, date },
      { $set: { staffId, staffName, date, ...update } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    try { await Audit.create({ type: 'attendance', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Attendance ${staffName} ${status || ''} on ${date}`, meta: { staffId, date, update } }) } catch {}
    res.json(doc)
  } catch (e) { next(e) }
})

// Get attendance by filters: by month range or exact date, optionally by staffId
router.get('/', authRequired, async (req, res, next) => {
  try {
    const { staffId, date, month } = req.query
    const q = {}
    if (staffId) q.staffId = String(staffId)
    if (date) {
      q.date = String(date)
    } else if (month) {
      // month format YYYY-MM
      const start = String(month)
      const prefix = new RegExp(`^${start}-`) // matches that month
      q.date = { $regex: prefix }
    }
    const docs = await Attendance.find(q).sort({ date: -1, createdAt: -1 })
    res.json(docs)
  } catch (e) { next(e) }
})

export default router
