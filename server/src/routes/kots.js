import { Router } from 'express'
import Kot from '../models/Kot.js'
import { authRequired } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'

const router = Router()

router.use(authRequired)

async function honorIdempotency(req, res) {
  const key = req.headers['x-idempotency-key']
  if (!key) return null
  const existing = await Kot.findOne({ idempotencyKey: key }).lean()
  if (existing) {
    res.status(200).json({ ...existing, id: existing._id })
    return existing
  }
  return null
}

router.get('/', async (req, res, next) => {
  try {
    const { from, to, type, status, limit = 200, skip = 0 } = req.query
    const q = {}
    if (type) q.orderType = type
    if (status) q.status = String(status)
    if (from || to) {
      q.date = {
        ...(from ? { $gte: String(from) } : {}),
        ...(to ? { $lte: String(to) } : {})
      }
    }
    const total = await Kot.countDocuments(q)
    const rows = await Kot.find(q).sort({ createdAt: -1 }).skip(Number(skip||0)).limit(Number(limit||200))
    res.json({
      rows: rows.map(r => {
        const obj = r.toObject({ flattenMaps: true })
        return { ...obj, id: r.id }
      }),
      total
    })
  } catch (e) { next(e) }
})

// POST /api/kots
router.post('/', async (req, res, next) => {
  try {
    const hit = await honorIdempotency(req, res)
    if (hit) return
    const body = req.body || {}
    const doc = {
      createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
      date: body.date || '',
      orderType: body.orderType,
      tokenNo: body.tokenNo,
      waiterId: body.waiterId,
      tableNo: body.tableNo,
      remarks: body.remarks,
      items: Array.isArray(body.items) ? body.items : [],
      userId: body.userId || (req.user ? req.user.id : undefined),
      idempotencyKey: req.headers['x-idempotency-key'] || null,
    }
    const saved = await Kot.create(doc)
    try { await logAudit(req, 'kot', `Created KOT ${saved.id || saved._id || ''}`, { id: saved.id || saved._id, tokenNo: saved.tokenNo, orderType: saved.orderType, tableNo: saved.tableNo, itemsCount: (saved.items||[]).length }) } catch {}
    res.status(201).json({ ...saved.toObject(), id: saved.id })
  } catch (e) { next(e) }
})

// PATCH /api/kots/:id — update KOT status
router.patch('/:id', async (req, res, next) => {
  try {
    const { status } = req.body || {}
    const valid = ['new', 'preparing', 'ready', 'completed']
    if (!valid.includes(String(status))) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    const now = new Date()
    const patch = { status: String(status), statusUpdatedAt: now }
    if (String(status) === 'completed') patch.completedAt = now
    else patch.completedAt = null
    const updated = await Kot.findByIdAndUpdate(
      req.params.id,
      patch,
      { new: true }
    )
    if (!updated) return res.status(404).json({ error: 'KOT not found' })
    try { await logAudit(req, 'kot', `KOT ${updated.id} status → ${status}`, { id: updated.id, status }) } catch {}
    res.json({ ...updated.toObject({ flattenMaps: true }), id: updated.id })
  } catch (e) { next(e) }
})

export default router
