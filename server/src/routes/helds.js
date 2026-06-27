import { Router } from 'express'
import Held from '../models/Held.js'
import { authRequired } from '../middleware/auth.js'

const router = Router()

router.use(authRequired)

// GET /api/helds
router.get('/', async (req, res, next) => {
  try {
    const rows = await Held.find({}).sort({ createdAt: -1 }).lean()
    res.json(rows.map(r => ({ ...r, id: r._id })))
  } catch (e) { next(e) }
})

// POST /api/helds
router.post('/', async (req, res, next) => {
  try {
    const key = req.headers['x-idempotency-key']
    if (key) {
      const existing = await Held.findOne({ idempotencyKey: key }).lean()
      if (existing) return res.status(200).json({ ...existing, id: existing._id })
    }
    const body = req.body || {}
    const doc = await Held.create({ ...body, idempotencyKey: (req.headers['x-idempotency-key'] || null) })
    res.status(201).json({ ...doc.toObject(), id: doc.id })
  } catch (e) { next(e) }
})

// DELETE /api/helds/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    await Held.findByIdAndDelete(id)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
