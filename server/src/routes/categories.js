import { Router } from 'express'
import Category from '../models/Category.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'

const router = Router()

router.use(authRequired)

function parseBool(v, defaultTrue = true) {
  if (v === undefined || v === null || v === '') return defaultTrue
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const s = String(v).trim().toLowerCase()
  if (['no', 'n', 'false', '0', 'inactive', 'off'].includes(s)) return false
  if (['yes', 'y', 'true', '1', 'active', 'on'].includes(s)) return true
  return defaultTrue
}

// List categories
router.get('/', async (req, res, next) => {
  try {
    const q = {}
    if (req.query.active) q.active = req.query.active === 'true'
    const items = await Category.find(q).sort({ sortOrder: 1, name: 1 })
    res.json(items)
  } catch (e) { next(e) }
})

/** Bulk upsert categories from CSV/Excel-parsed rows */
router.post('/import', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const body = req.body || {}
    const rows = Array.isArray(body) ? body : (Array.isArray(body.categories) ? body.categories : (Array.isArray(body.rows) ? body.rows : []))
    if (!rows.length) return res.status(400).json({ error: 'Provide categories to import' })
    let upserted = 0
    for (const raw of rows) {
      const name = String(raw?.name || '').trim()
      if (!name) continue
      const patch = {
        name,
        showOnPos: parseBool(raw.showOnPos, true),
        active: parseBool(raw.active, true),
        imageUrl: String(raw.imageUrl || ''),
        sortOrder: Number(raw.sortOrder ?? 0) || 0,
        discount: Number(raw.discount ?? 0) || 0,
      }
      await Category.findOneAndUpdate({ name }, patch, { upsert: true, new: true })
      upserted += 1
    }
    await logAudit(req, 'category', `Imported categories (${upserted})`, { count: upserted })
    res.json({ ok: true, categories: upserted })
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
      imageUrl: String(body.imageUrl || ''),
      sortOrder: Number(body.sortOrder ?? 0),
      discount: Number(body.discount ?? 0),
    })
    await logAudit(req, 'category', `Added category ${item.name}`, { id: item._id })
    res.status(201).json(item)
  } catch (e) { next(e) }
})

// Update category
router.patch('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const update = req.body || {}
    if (update.name !== undefined) update.name = String(update.name).trim()
    if (update.imageUrl !== undefined) update.imageUrl = String(update.imageUrl || '')
    if (update.sortOrder !== undefined) update.sortOrder = Number(update.sortOrder ?? 0)
    if (update.discount !== undefined) update.discount = Number(update.discount ?? 0)
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
