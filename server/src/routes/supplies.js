import { Router } from 'express'
import Supply from '../models/Supply.js'
import Ingredient from '../models/Ingredient.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { mergeBranchFilter, stampBranchId, resolveBranchId } from '../utils/branchScope.js'

const router = Router()
router.use(authRequired)

async function applyStockDelta(req, line, qtyDelta) {
  const name = String(line?.name || '').trim()
  if (!name || !qtyDelta) return null
  const price = Number(line.price)
  const unit = String(line.unit || '')
  const branchId = resolveBranchId(req, { required: false }) || ''
  let found = null
  if (line.ingredientId) {
    found = await Ingredient.findById(line.ingredientId)
  }
  if (!found) {
    const q = { name }
    if (branchId) q.branchId = String(branchId)
    found = await Ingredient.findOne(q)
  }
  if (found) {
    found.qty = Math.max(0, (Number(found.qty) || 0) + qtyDelta)
    if (unit) found.unit = unit
    if (!Number.isNaN(price) && price >= 0) found.price = price
    if (line.category) found.category = line.category
    if (line.lowStock != null && line.lowStock !== '') found.lowStock = Number(line.lowStock) || 0
    if (line.expiry) found.expiry = String(line.expiry).slice(0, 10)
    if (line.supplierId) found.supplierId = String(line.supplierId)
    await found.save()
    return found
  }
  if (qtyDelta > 0) {
    return Ingredient.create(stampBranchId(req, {
      name,
      category: line.category || 'Supply',
      qty: qtyDelta,
      unit,
      price: Number.isNaN(price) ? 0 : price,
      lowStock: Number(line.lowStock) || 0,
      expiry: line.expiry ? String(line.expiry).slice(0, 10) : '',
      supplierId: line.supplierId || '',
    }))
  }
  return null
}

async function normalizeLines(req, items, supplierId = '') {
  const normalized = []
  for (const it of (items || [])) {
    const name = String(it?.name || '').trim()
    const qty = Number(it?.qty || 0)
    if (!name || qty <= 0) continue
    const price = Number(it.price || 0)
    const unit = String(it.unit || '')
    const line = {
      ingredientId: String(it.ingredientId || ''),
      name,
      qty,
      unit,
      price,
      category: String(it.category || ''),
      lowStock: Number(it.lowStock) || 0,
      expiry: it.expiry ? String(it.expiry).slice(0, 10) : '',
      supplierId: supplierId || it.supplierId || '',
    }
    const saved = await applyStockDelta(req, line, qty)
    if (saved) line.ingredientId = String(saved._id || saved.id || line.ingredientId || '')
    normalized.push({
      ingredientId: line.ingredientId,
      name: line.name,
      qty: line.qty,
      unit: line.unit,
      price: line.price,
      category: line.category,
      lowStock: line.lowStock,
      expiry: line.expiry,
    })
  }
  return normalized
}

async function reverseLines(req, items) {
  for (const it of (items || [])) {
    await applyStockDelta(req, it, -(Number(it.qty) || 0))
  }
}

// List supplies (optional from,to yyyy-MM-dd)
router.get('/', async (req, res, next) => {
  try {
    const { from, to, supplierId } = req.query
    let filter = {}
    if (from && to) {
      filter.date = { $gte: String(from), $lte: String(to) }
    }
    if (supplierId) {
      filter.supplierId = String(supplierId)
    }
    filter = mergeBranchFilter(req, filter)
    const rows = await Supply.find(filter).sort({ date: -1, createdAt: -1 })
    res.json(rows)
  } catch (e) { next(e) }
})

router.get('/:id', async (req, res, next) => {
  try {
    const row = await Supply.findById(req.params.id)
    if (!row) return res.status(404).json({ error: 'Not found' })
    res.json(row)
  } catch (e) { next(e) }
})

// Create a supply invoice and update ingredient stocks
router.post('/', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const {
      date,
      supplierId = '',
      supplier = '',
      items = [],
      cost = 0,
      invoiceNo = '',
      notes = '',
      skipInventoryUpdate = false,
    } = req.body || {}
    if (!date) return res.status(400).json({ error: 'date required' })

    let normalized = Array.isArray(items) ? items : []
    if (!skipInventoryUpdate) {
      normalized = await normalizeLines(req, items, supplierId)
      if (!normalized.length) return res.status(400).json({ error: 'items required' })
    } else {
      normalized = (items || []).filter(it => String(it?.name || '').trim() && Number(it?.qty) > 0).map(it => ({
        ingredientId: String(it.ingredientId || ''),
        name: String(it.name).trim(),
        qty: Number(it.qty) || 0,
        unit: String(it.unit || ''),
        price: Number(it.price) || 0,
        category: String(it.category || ''),
        lowStock: Number(it.lowStock) || 0,
        expiry: it.expiry ? String(it.expiry).slice(0, 10) : '',
      }))
    }

    const computedCost = normalized.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0)
    const created = await Supply.create(stampBranchId(req, {
      date,
      supplierId,
      supplier,
      invoiceNo,
      notes,
      items: normalized,
      cost: Number(cost) > 0 ? Number(cost) : Number(computedCost.toFixed(2)),
    }))
    try {
      await Audit.create({
        type: 'inventory',
        userId: req.user?.id || '',
        userName: req.user?.username || 'system',
        action: `Added purchase on ${created.date} (items: ${normalized.length})`,
        meta: { id: created._id, cost: created.cost },
      })
    } catch {}
    res.status(201).json(created)
  } catch (e) { next(e) }
})

// Edit purchase invoice — reverse old stock, apply new lines
router.patch('/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const existing = await Supply.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })

    const b = req.body || {}
    await reverseLines(req, existing.items || [])

    const normalized = await normalizeLines(req, b.items || existing.items || [], b.supplierId ?? existing.supplierId)
    if (!normalized.length) {
      // restore previous if bad payload
      await normalizeLines(req, existing.items || [], existing.supplierId)
      return res.status(400).json({ error: 'items required' })
    }

    const computedCost = normalized.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0)
    existing.date = b.date || existing.date
    if (b.supplierId !== undefined) existing.supplierId = String(b.supplierId || '')
    if (b.supplier !== undefined) existing.supplier = String(b.supplier || '')
    if (b.invoiceNo !== undefined) existing.invoiceNo = String(b.invoiceNo || '')
    if (b.notes !== undefined) existing.notes = String(b.notes || '')
    existing.items = normalized
    existing.cost = Number(b.cost) > 0 ? Number(b.cost) : Number(computedCost.toFixed(2))
    await existing.save()

    try {
      await Audit.create({
        type: 'inventory',
        userId: req.user?.id || '',
        userName: req.user?.username || 'system',
        action: `Edited purchase ${existing._id}`,
        meta: { id: existing._id, cost: existing.cost },
      })
    } catch {}
    res.json(existing)
  } catch (e) { next(e) }
})

router.delete('/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const existing = await Supply.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    await reverseLines(req, existing.items || [])
    await existing.deleteOne()
    try {
      await Audit.create({
        type: 'inventory',
        userId: req.user?.id || '',
        userName: req.user?.username || 'system',
        action: `Deleted purchase ${req.params.id}`,
        meta: { id: req.params.id },
      })
    } catch {}
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
