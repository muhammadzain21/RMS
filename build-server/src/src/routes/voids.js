import { Router } from 'express'
import Void from '../models/Void.js'
import { authRequired } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'

const router = Router()

router.use(authRequired)

// GET /api/voids?from=YYYY-MM-DD&to=YYYY-MM-DD&type=...
router.get('/', async (req, res, next) => {
  try {
    const { from, to, type, limit = 200, skip = 0 } = req.query
    const q = {}
    if (type) q.orderType = type
    if (from || to) {
      q.date = {
        ...(from ? { $gte: String(from) } : {}),
        ...(to ? { $lte: String(to) } : {})
      }
    }
    const total = await Void.countDocuments(q)
    const rows = await Void.find(q).sort({ createdAt: -1 }).skip(Number(skip||0)).limit(Number(limit||200))
    res.json({
      rows: rows.map(r => {
        const obj = r.toObject({ flattenMaps: true })
        return { ...obj, id: r.id }
      }),
      total
    })
  } catch (e) { next(e) }
})

// POST /api/voids
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {}
    const idemKey = req.headers['x-idempotency-key'] || null
    if (idemKey) {
      const hit = await Void.findOne({ idempotencyKey: idemKey })
      if (hit) return res.status(200).json({ ...hit.toObject(), id: hit.id })
    }
    const doc = {
      createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
      date: body.date || '',
      orderType: body.orderType,
      tokenNo: body.tokenNo,
      waiterId: body.waiterId,
      tableNo: body.tableNo,
      reason: body.reason,
      remarks: body.remarks,
      items: Array.isArray(body.items) ? body.items : [],
      userId: body.userId || (req.user ? req.user.id : undefined),
      idempotencyKey: idemKey,
    }
    let saved
    try {
      saved = await Void.create(doc)
    } catch (e) {
      if (e && e.code === 11000 && String(e.message||'').includes('idempotencyKey')) {
        const hit = await Void.findOne({ idempotencyKey: idemKey })
        if (hit) return res.status(200).json({ ...hit.toObject(), id: hit.id })
      }
      throw e
    }
    try { await logAudit(req, 'void', `Created void entry ${saved?.id || saved?._id || ''}`, { id: saved?.id || saved?._id, orderType: saved?.orderType, tokenNo: saved?.tokenNo, waiterId: saved?.waiterId, tableNo: saved?.tableNo, reason: saved?.reason, itemsCount: (saved?.items||[]).length }) } catch {}
    res.status(201).json({ ...saved.toObject(), id: saved.id })
  } catch (e) { next(e) }
})

export default router
