import { Router } from 'express'
import Recall from '../models/Recall.js'
import { authRequired } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'
import Counter from '../models/Counter.js'

const router = Router()

router.use(authRequired)

// Remove rider-related fields from API responses
function sanitizeRecall(r) {
  if (!r) return r
  const obj = typeof r.toObject === 'function' ? r.toObject() : r
  const { riderId, riderName, ...rest } = obj || {}
  return { ...rest, id: obj.id || obj._id }
}

// Helper: honor X-Idempotency-Key for create/update to avoid duplicates
async function honorIdempotency(req, res) {
  const key = req.headers['x-idempotency-key']
  if (!key) return null
  const existing = await Recall.findOne({ idempotencyKey: key }).lean()
  if (existing) {
    res.status(200).json(sanitizeRecall(existing))
    return existing
  }
  return null
}

// GET /api/recalls
router.get('/', async (req, res, next) => {
  try {
    const hasPagination = req.query.page !== undefined || req.query.limit !== undefined
    const q = {}
    const waiterId = String(req.query.waiterId || '').trim()
    if (waiterId) q.waiterId = waiterId
    const orderType = String(req.query.orderType || '').trim()
    if (orderType) q.orderType = orderType
    const search = String(req.query.search || '').trim()
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      q.$or = [
        { orderNo: rx },
        { tokenNo: rx },
        { tableNo: rx },
        { orderType: rx },
        { 'customer.name': rx },
        { 'customer.phone': rx },
        { 'customer.address': rx },
      ]
    }

    if (!hasPagination) {
      const rows = await Recall.find(q).sort({ createdAt: 1 }).lean()
      res.json(rows.map(r => sanitizeRecall(r)))
      return
    }

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20))
    const skip = (page - 1) * limit

    const [total, rows] = await Promise.all([
      Recall.countDocuments(q),
      Recall.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ])

    res.json({
      data: rows.map(r => sanitizeRecall(r)),
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    })
  } catch (e) { next(e) }
})

// POST /api/recalls
router.post('/', async (req, res, next) => {
  try {
    const hit = await honorIdempotency(req, res)
    if (hit) return
    const body = req.body || {}
    // Derive business date and token if not provided (server-side, atomic)
    // Use local timezone getters instead of toISOString() for Pakistan time
    const toYyyyMmDd = (dLike) => {
      try {
        const d = dLike ? new Date(dLike) : new Date()
        if (isNaN(d.getTime())) {
          const now = new Date()
          return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        }
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      } catch {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      }
    }
    const businessDate = String(body.date || toYyyyMmDd(body.createdAt))
    let tokenNo = String(body.tokenNo || '').trim()
    if (!tokenNo) {
      const key = `token-${businessDate}`
      const counter = await Counter.findOneAndUpdate(
        { name: key },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      )
      tokenNo = String(counter?.seq || '1')
    }
    const doc = await Recall.create({ ...body, date: businessDate, tokenNo, idempotencyKey: req.headers['x-idempotency-key'] || null })
    try { await logAudit(req, 'recall', `Created recall ${doc.id || doc._id || ''}`, { id: doc.id || doc._id, orderNo: doc.orderNo, tokenNo: doc.tokenNo, orderType: doc.orderType, totalAmount: doc.totalAmount }) } catch {}
    res.status(201).json(sanitizeRecall(doc))
  } catch (e) { next(e) }
})

// PUT /api/recalls/:id (replace)
// PUT /api/recalls/upsert (atomic upsert by _id or by orderNo+tokenNo)
router.put('/upsert', async (req, res, next) => {
  try {
    const key = req.headers['x-idempotency-key']
    if (key) {
      const hit = await honorIdempotency(req, res)
      if (hit) return
    }
    const body = req.body || {}
    const byId = body._id || body.id
    const query = byId ? { _id: byId } : ((body.orderNo || body.tokenNo) ? { orderNo: body.orderNo || '', tokenNo: body.tokenNo || '' } : null)
    if (!query) {
      // fallback to plain create
      const created = await Recall.create({ ...body, idempotencyKey: key || null })
      try { await logAudit(req, 'recall', `Created recall ${created.id || created._id || ''} (upsert)`, { id: created.id || created._id, orderNo: created.orderNo, tokenNo: created.tokenNo, orderType: created.orderType, totalAmount: created.totalAmount }) } catch {}
      return res.status(201).json(sanitizeRecall(created))
    }
    const updated = await Recall.findOneAndUpdate(query, { $set: body, $setOnInsert: { idempotencyKey: key || null } }, { new: true, upsert: true, runValidators: false })
    try { await logAudit(req, 'recall', `Upserted recall ${updated?.id || updated?._id || ''}`, { id: updated?.id || updated?._id, orderNo: updated?.orderNo, tokenNo: updated?.tokenNo, orderType: updated?.orderType, totalAmount: updated?.totalAmount }) } catch {}
    return res.status(byId ? 200 : 201).json(sanitizeRecall(updated))
  } catch (e) { next(e) }
})

// PUT /api/recalls/:id (replace)
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const hit = await honorIdempotency(req, res)
    if (hit) return
    const updated = await Recall.findByIdAndUpdate(id, { ...req.body, $setOnInsert: { idempotencyKey: req.headers['x-idempotency-key'] || null } }, { new: true, runValidators: false, upsert: false })
    try { await logAudit(req, 'recall', `Replaced recall ${updated?.id || id}`, { id: updated?.id || id, patch: req.body }) } catch {}
    res.json(sanitizeRecall(updated))
  } catch (e) { next(e) }
})

// PATCH /api/recalls/:id (partial)
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const hit = await honorIdempotency(req, res)
    if (hit) return
    const updated = await Recall.findByIdAndUpdate(id, { $set: req.body }, { new: true, runValidators: false })
    try { await logAudit(req, 'recall', `Updated recall ${updated?.id || id}`, { id: updated?.id || id, patch: req.body }) } catch {}
    res.json(sanitizeRecall(updated))
  } catch (e) { next(e) }
})

// DELETE /api/recalls/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    try {
      const prev = await Recall.findById(id).lean()
      await logAudit(req, 'recall', `Deleted recall ${id}`, { id, orderNo: prev?.orderNo, tokenNo: prev?.tokenNo, orderType: prev?.orderType, totalAmount: prev?.totalAmount })
    } catch {}
    await Recall.findByIdAndDelete(id)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
