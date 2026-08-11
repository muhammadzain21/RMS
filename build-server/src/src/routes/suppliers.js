import { Router } from 'express'
import Supplier from '../models/Supplier.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()

router.use(authRequired)

// List (basic search by q on name/company/phone with pagination)
router.get('/', async (req, res, next) => {
  try {
    const { q = '', page = 1, limit = 10 } = req.query
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10))
    let filter = {}
    if (q) {
      const regex = { $regex: String(q), $options: 'i' }
      filter = { $or: [ { name: regex }, { company: regex }, { phone: regex } ] }
    }
    const total = await Supplier.countDocuments(filter)
    const rows = await Supplier.find(filter)
      .sort({ name: 1, company: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
    res.json({ rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) })
  } catch (e) { next(e) }
})

// Create
router.post('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const s = await Supplier.create(req.body)
    try { await Audit.create({ type: 'supplier', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Added supplier ${s?.name || s?.company || s?._id}`, meta: { id: s._id } }) } catch {}
    res.status(201).json(s)
  } catch (e) { next(e) }
})

// Get single supplier by ID
router.get('/:id', async (req, res, next) => {
  try {
    const s = await Supplier.findById(req.params.id)
    if (!s) return res.status(404).json({ error: 'Supplier not found' })
    res.json(s)
  } catch (e) { next(e) }
})

// Update
router.patch('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const s = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true })
    try { await Audit.create({ type: 'supplier', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Updated supplier ${req.params.id}`, meta: { id: req.params.id, patch: req.body } }) } catch {}
    res.json(s)
  } catch (e) { next(e) }
})

// Delete
router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    await Supplier.findByIdAndDelete(req.params.id)
    try { await Audit.create({ type: 'supplier', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Deleted supplier ${req.params.id}`, meta: { id: req.params.id } }) } catch {}
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
