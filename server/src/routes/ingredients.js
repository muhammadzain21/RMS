import { Router } from 'express'
import Ingredient from '../models/Ingredient.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'
import { mergeBranchFilter, stampBranchId } from '../utils/branchScope.js'

const router = Router()
router.use(authRequired)

// List all ingredients
router.get('/', async (req, res, next) => {
  try {
    const { q = '' } = req.query
    let filter = {}
    if (q) {
      const regex = { $regex: String(q), $options: 'i' }
      filter = { $or: [ { name: regex }, { category: regex } ] }
    }
    filter = mergeBranchFilter(req, filter)
    const rows = await Ingredient.find(filter).sort({ name: 1 })
    res.json(rows)
  } catch (e) { next(e) }
})

// Get single ingredient by ID
router.get('/:id', async (req, res, next) => {
  try {
    const row = await Ingredient.findById(req.params.id)
    if (!row) return res.status(404).json({ error: 'Ingredient not found' })
    res.json(row)
  } catch (e) { next(e) }
})

// Create ingredient
router.post('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const row = await Ingredient.create(stampBranchId(req, req.body || {}))
    await logAudit(req, 'inventory', `Added ingredient ${row.name}`, { id: row._id })
    res.status(201).json(row)
  } catch (e) { next(e) }
})

// Update ingredient
router.patch('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const row = await Ingredient.findByIdAndUpdate(req.params.id, req.body, { new: true })
    await logAudit(req, 'inventory', `Updated ingredient ${req.params.id}`, { id: req.params.id, patch: req.body })
    res.json(row)
  } catch (e) { next(e) }
})

// Delete ingredient
router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    await Ingredient.findByIdAndDelete(req.params.id)
    await logAudit(req, 'inventory', `Deleted ingredient ${req.params.id}`, { id: req.params.id })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
