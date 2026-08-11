import { Router } from 'express'
import Customer from '../models/Customer.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()

router.use(authRequired)

router.get('/', async (req, res, next) => {
  try {
    const { phone, q: qtext } = req.query
    // Phone lookup path (used by POS search): quick, limited
    if (phone) {
      const digits = String(phone).replace(/\D/g, '')
      const q = {}
      if (digits.length) {
        const pattern = digits.split('').join('\\D*')
        q.phone = { $regex: pattern, $options: 'i' }
      }
      const rows = await Customer.find(q).sort({ name: 1 }).limit(5)
      return res.json(rows)
    }

    // Paginated listing path
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)))
    const page = Math.max(1, Number(req.query.page || 1))
    const skip = (page - 1) * limit

    const query = {}
    if (qtext && String(qtext).trim()) {
      const t = String(qtext).trim()
      query.$or = [
        { name: { $regex: t, $options: 'i' } },
        { phone: { $regex: t, $options: 'i' } },
      ]
    }

    const [rows, total] = await Promise.all([
      Customer.find(query).sort({ name: 1, createdAt: -1 }).skip(skip).limit(limit),
      Customer.countDocuments(query),
    ])
    const pages = Math.max(1, Math.ceil(total / limit))
    res.json({ rows, total, page, pages, limit })
  } catch (e) { next(e) }
})

router.post('/', requireRole('Admin','Manager','Staff'), async (req, res, next) => {
  try {
    const c = await Customer.create(req.body)
    try { await Audit.create({ type: 'customer', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Added customer ${c?.name || c?.phone || c?._id}`, meta: { id: c._id } }) } catch {}
    res.status(201).json(c)
  } catch (e) { next(e) }
})

router.patch('/:id', requireRole('Admin','Manager','Staff'), async (req, res, next) => {
  try {
    const c = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true })
    try { await Audit.create({ type: 'customer', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Updated customer ${req.params.id}`, meta: { id: req.params.id, patch: req.body } }) } catch {}
    res.json(c)
  } catch (e) { next(e) }
})

router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    await Customer.findByIdAndDelete(req.params.id)
    try { await Audit.create({ type: 'customer', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Deleted customer ${req.params.id}`, meta: { id: req.params.id } }) } catch {}
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
