import { Router } from 'express'
import Rider from '../models/Rider.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()

router.use(authRequired)

router.get('/', async (_req, res, next) => {
  try {
    const rows = await Rider.find().sort({ name: 1 })
    res.json(rows)
  } catch (e) { next(e) }
})

router.post('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const r = await Rider.create(req.body)
    try { await Audit.create({ type: 'rider', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Added rider ${r?.name || r?._id}`, meta: { id: r._id } }) } catch {}
    res.status(201).json(r)
  } catch (e) { next(e) }
})

router.patch('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const r = await Rider.findByIdAndUpdate(req.params.id, req.body, { new: true })
    try { await Audit.create({ type: 'rider', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Updated rider ${req.params.id}`, meta: { id: req.params.id, patch: req.body } }) } catch {}
    res.json(r)
  } catch (e) { next(e) }
})

router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    await Rider.findByIdAndDelete(req.params.id)
    try { await Audit.create({ type: 'rider', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Deleted rider ${req.params.id}`, meta: { id: req.params.id } }) } catch {}
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
