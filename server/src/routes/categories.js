import { Router } from 'express'
import Category from '../models/Category.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'

const router = Router()

router.use(authRequired)

// List categories
router.get('/', async (req, res, next) => {
  try {
    const q = {}
    if (req.query.active) q.active = req.query.active === 'true'
    const items = await Category.find(q).sort({ name: 1 })
    res.json(items)
  } catch (e) { next(e) }
})

// Create category
router.post('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const body = req.body || {}
    if (!body.name) return res.status(400).json({ error: 'name is required' })
    const item = await Category.create({
      name: String(body.name).trim(),
      showOnPos: !!body.showOnPos,
      active: body.active !== false,
    })
    await logAudit(req, 'category', `Added category ${item.name}`, { id: item._id })
    res.status(201).json(item)
  } catch (e) { next(e) }
})

// Update category
router.patch('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const update = req.body || {}
    if (update.name) update.name = String(update.name).trim()
    const item = await Category.findByIdAndUpdate(req.params.id, update, { new: true })
    await logAudit(req, 'category', `Updated category ${req.params.id}`, { id: req.params.id, patch: req.body })
    res.json(item)
  } catch (e) { next(e) }
})

// Delete category
router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    await Category.findByIdAndDelete(req.params.id)
    await logAudit(req, 'category', `Deleted category ${req.params.id}`, { id: req.params.id })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
