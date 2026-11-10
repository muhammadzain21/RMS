import { Router } from 'express'
import DayClose from '../models/DayClose.js'
import CashOpening from '../models/CashOpening.js'
import Recall from '../models/Recall.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'
import { resolveBranchId } from '../utils/branchScope.js'
import { takeSnapshot } from './inventorySnapshots.js'

function ymdFromCreatedAt(createdAt) {
  if (!createdAt && createdAt !== 0) return ''
  let d
  if (createdAt instanceof Date) d = createdAt
  else if (typeof createdAt === 'number') d = new Date(createdAt)
  else if (typeof createdAt === 'string' && /^\d+$/.test(createdAt.trim())) d = new Date(Number(createdAt))
  else d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addOneDayYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  if (!y || !m || !d) return ''
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** Any unpaid recall still in DB blocks day close (including older dates). */
async function countOpenRecalls() {
  const pending = await Recall.find({})
    .select('date createdAt tokenNo orderNo')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean()
  const count = await Recall.countDocuments({})
  return {
    count,
    items: pending.slice(0, 10).map(r => ({
      date: r.date || ymdFromCreatedAt(r.createdAt) || '',
      tokenNo: r.tokenNo || '',
      orderNo: r.orderNo || '',
    })),
  }
}

const router = Router()
router.use(authRequired)

// Same secret-key guard as sale deletion (settings.salesDeleteKey)
async function requireDeleteKey(req, res) {
  const provided = req.headers['x-delete-key'] || req.query.key || (req.body && req.body.key) || ''
  let branchId = ''
  try { branchId = resolveBranchId(req) || '' } catch { branchId = '' }
  const { getSettingsLean } = await import('../utils/settingsScope.js')
  const s = await getSettingsLean(branchId)
  const expected = String(s?.salesDeleteKey || '')
  if (!expected) { res.status(403).json({ error: 'Delete key not set. Set it in Settings.' }); return false }
  if (String(provided || '') !== expected) { res.status(403).json({ error: 'Invalid delete key' }); return false }
  return true
}

// GET /api/day-closes?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', async (req, res, next) => {
  try {
    const { from, to, page, limit, search, q } = req.query
    let query = {}
    if (from || to) query.date = { ...(from ? { $gte: String(from) } : {}), ...(to ? { $lte: String(to) } : {}) }
    const s = String(search || q || '').trim()
    if (s) {
      const rx = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      query.$or = [{ date: rx }, { note: rx }, { userName: rx }]
    }
    const { mergeBranchFilter } = await import('../utils/branchScope.js')
    query = mergeBranchFilter(req, query)
    if (page) {
      const p = Math.max(1, parseInt(page, 10) || 1)
      const lim = Math.max(1, Math.min(500, parseInt(limit, 10) || 50))
      const [rows, total] = await Promise.all([
        DayClose.find(query).sort({ date: -1, createdAt: -1 }).skip((p - 1) * lim).limit(lim),
        DayClose.countDocuments(query),
      ])
      res.json({ rows, total, page: p, limit: lim })
      return
    }
    const rows = await DayClose.find(query).sort({ date: -1, createdAt: -1 })
    res.json(rows)
  } catch (e) { next(e) }
})

// Create a day close record (one per date)
router.post('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const body = req.body || {}
    const date = String(body.date)
    const { stampBranchId, resolveBranchId } = await import('../utils/branchScope.js')
    const branchIdForClose = String(resolveBranchId(req) || '')
    const existing = await DayClose.findOne({ date, branchId: branchIdForClose })
    if (existing) return res.status(409).json({ error: 'Day already closed for this date' })

    const openRecalls = await countOpenRecalls()
    if (openRecalls.count > 0) {
      return res.status(400).json({
        error: `Clear ${openRecalls.count} open recall(s) before day close (including older unpaid orders)`,
        code: 'OPEN_RECALLS',
        count: openRecalls.count,
        recalls: openRecalls.items,
      })
    }

    const rec = await DayClose.create(stampBranchId(req, {
      date,
      openingCash: Number(body.openingCash||0),
      cashSales: Number(body.cashSales||0),
      cardSales: Number(body.cardSales||0),
      onlineSales: Number(body.onlineSales || body.cardSales || 0),
      complimentarySales: Number(body.complimentarySales||0),
      staffSales: Number(body.staffSales||0),
      partySales: 0,
      returns: Number(body.returns||0),
      handovers: Number(body.handovers||0),
      handoverTo: String(body.handoverTo || ''),
      leftAtCounter: Number(body.leftAtCounter||0),
      payIns: Number(body.payIns||0),
      payOuts: Number(body.payOuts||0),
      expectedCash: Number(body.expectedCash||0),
      countedCash: Number(body.countedCash||0),
      variance: Number(body.variance||0),
      note: body.note || '',
      userId: req.user?.id || '',
      userName: req.user?.username || '',
    }))
    const branchId = resolveBranchId(req) || ''

    // Cash left at counter → next business day's opening (create or overwrite auto entry)
    const left = Math.max(0, Number(body.leftAtCounter || 0))
    let nextOpening = null
    try {
      const nextDate = addOneDayYmd(date)
      if (nextDate) {
        nextOpening = await CashOpening.findOneAndUpdate(
          { date: nextDate, branchId: String(branchId || '') },
          {
            $set: {
              date: nextDate,
              branchId: String(branchId || ''),
              openingCash: left,
              note: `Auto from day close ${date}`,
              userId: req.user?.id || '',
              userName: req.user?.username || 'system',
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
        console.log(`[dayCloses] next-day opening ${nextDate} = ${left}`)
      }
    } catch (e) {
      console.warn('[dayCloses] auto opening cash failed:', e?.message)
    }

    await logAudit(req, 'day', `Day closed ${rec.date} variance ${rec.variance}`, { id: rec._id })

    // Take inventory snapshot at day close
    takeSnapshot(date, 'day-close').catch(()=>{})

    res.status(201).json({
      ...rec.toObject?.() ? rec.toObject() : (rec.toJSON?.() ? rec.toJSON() : rec),
      nextOpening: nextOpening
        ? {
            id: nextOpening._id || nextOpening.id,
            date: nextOpening.date,
            openingCash: nextOpening.openingCash,
            note: nextOpening.note,
            userName: nextOpening.userName,
          }
        : null,
    })
  } catch (e) { next(e) }
})

// Re-open a closed day by date (Admin/Manager)
router.post('/reopen', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    if (!(await requireDeleteKey(req, res))) return
    const date = String(req.body?.date || '')
    if (!date) return res.status(400).json({ error: 'date is required' })
    const { resolveBranchId } = await import('../utils/branchScope.js')
    const branchId = String(resolveBranchId(req) || '')
    const existing = await DayClose.findOne({ date, branchId })
    if (!existing) return res.status(404).json({ error: 'No day close found for date' })
    await DayClose.deleteOne({ _id: existing._id })
    await logAudit(req, 'day', `Re-opened day ${date}`, { date, id: existing._id, branchId })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// Delete a day close (admin only)
router.delete('/:id', requireRole('Admin'), async (req, res, next) => {
  try {
    if (!(await requireDeleteKey(req, res))) return
    const rec = await DayClose.findByIdAndDelete(req.params.id)
    await logAudit(req, 'day', `Deleted day close ${req.params.id}`, { id: req.params.id, date: rec?.date })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router