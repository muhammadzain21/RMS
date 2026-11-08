import { Router } from 'express'
import Ingredient from '../models/Ingredient.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'
import { assertDocumentBranch, mergeBranchFilter, stampBranchId } from '../utils/branchScope.js'

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

// Bulk import (same columns as CSV export). Must be registered before /:id
router.post('/import', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const body = req.body || {}
    const items = Array.isArray(body) ? body : (Array.isArray(body.items) ? body.items : [])
    if (!items.length) return res.status(400).json({ error: 'Provide items to import' })

    const Supplier = (await import('../models/Supplier.js')).default
    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const branchStamp = stampBranchId(req, {})
    const branchId = String(branchStamp.branchId || '')

    const supplierCache = new Map()
    const resolveSupplierId = async (rawName) => {
      const name = String(rawName || '').trim()
      if (!name) return ''
      const key = name.toLowerCase()
      if (supplierCache.has(key)) return supplierCache.get(key)
      let filter = {
        $or: [
          { name: new RegExp(`^${escapeRegex(name)}$`, 'i') },
          { company: new RegExp(`^${escapeRegex(name)}$`, 'i') },
        ],
      }
      filter = mergeBranchFilter(req, filter)
      const hit = await Supplier.findOne(filter).lean()
      const id = hit ? String(hit._id || hit.id || '') : ''
      supplierCache.set(key, id)
      return id
    }

    let created = 0
    let updated = 0
    for (const raw of items) {
      const name = String(raw?.name || '').trim()
      if (!name) continue
      const supplierId = raw.supplierId
        ? String(raw.supplierId)
        : await resolveSupplierId(raw.supplierName || raw.supplier || '')
      const doc = {
        name,
        category: String(raw.category || '').trim(),
        qty: Number(raw.qty || 0) || 0,
        unit: String(raw.unit || '').trim(),
        lowStock: Number(raw.lowStock ?? raw.threshold ?? 5) || 0,
        price: Number(raw.price || 0) || 0,
        expiry: String(raw.expiry || '').trim().slice(0, 10),
        supplierId,
        ...(branchId ? { branchId } : {}),
      }

      let existingFilter = { name: new RegExp(`^${escapeRegex(name)}$`, 'i') }
      existingFilter = mergeBranchFilter(req, existingFilter)
      const existing = await Ingredient.findOne(existingFilter)
      if (existing) {
        Object.assign(existing, doc)
        await existing.save()
        updated += 1
      } else {
        await Ingredient.create(stampBranchId(req, doc))
        created += 1
      }
    }

    try {
      await logAudit(req, 'inventory', `Imported ingredients (+${created} / ~${updated})`, { created, updated })
    } catch {}
    res.json({ ok: true, items: created + updated, created, updated })
  } catch (e) { next(e) }
})

// Get single ingredient by ID
router.get('/:id', async (req, res, next) => {
  try {
    const row = await Ingredient.findById(req.params.id)
    if (!row) return res.status(404).json({ error: 'Ingredient not found' })
    try { assertDocumentBranch(req, row) } catch (e) {
      return res.status(e.status || 403).json({ error: e.message })
    }
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
    const existing = await Ingredient.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Ingredient not found' })
    assertDocumentBranch(req, existing)
    const patch = stampBranchId(req, { ...(req.body || {}), branchId: existing.branchId || undefined })
    // Keep existing branch when already set — never move stock to another branch silently
    if (existing.branchId) patch.branchId = String(existing.branchId)
    const row = await Ingredient.findByIdAndUpdate(req.params.id, patch, { new: true })
    await logAudit(req, 'inventory', `Updated ingredient ${req.params.id}`, { id: req.params.id, patch, branchId: row?.branchId })
    res.json(row)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// Delete ingredient
router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const existing = await Ingredient.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Ingredient not found' })
    assertDocumentBranch(req, existing)
    await Ingredient.findByIdAndDelete(req.params.id)
    await logAudit(req, 'inventory', `Deleted ingredient ${req.params.id}`, { id: req.params.id, branchId: existing.branchId })
    res.json({ ok: true })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

export default router
