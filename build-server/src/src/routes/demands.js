import { Router } from 'express'
import Demand from '../models/Demand.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'

const router = Router()
router.use(authRequired)

// List demands (optional from, to date filter + pagination)
router.get('/', async (req, res, next) => {
  try {
    const { from, to, status, page = 1, limit = 20 } = req.query
    const pageNum = Math.max(1, parseInt(page) || 1)
    const limitNum = Math.max(1, Math.min(200, parseInt(limit) || 20))
    let filter = {}
    if (from && to) {
      filter.date = { $gte: String(from), $lte: String(to) }
    }
    if (status && ['pending', 'sent', 'completed'].includes(status)) {
      filter.status = status
    }
    const total = await Demand.countDocuments(filter)
    const rows = await Demand.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
    res.json({ data: rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) })
  } catch (e) { next(e) }
})

// Get single demand by ID
router.get('/:id', async (req, res, next) => {
  try {
    const row = await Demand.findById(req.params.id)
    if (!row) return res.status(404).json({ error: 'Demand not found' })
    res.json(row)
  } catch (e) { next(e) }
})

// Create demand
router.post('/', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const { date, items, note } = req.body
    if (!date) return res.status(400).json({ error: 'date required' })
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items required' })
    }
    const payload = {
      date,
      items: items.map(it => ({
        name: it.name,
        quantity: Number(it.quantity) || 0,
        unit: it.unit || '',
        currentStock: Number(it.currentStock) || 0,
        isFromInventory: Boolean(it.isFromInventory),
        ingredientId: it.ingredientId || '',
      })),
      status: 'pending',
      note: note || '',
      createdBy: req.user?.id || '',
      createdByName: req.user?.username || req.user?.name || '',
    }
    const created = await Demand.create(payload)
    await logAudit(req, 'demand', `Created demand for ${date}`, { id: created._id, items: items.length })
    res.status(201).json(created)
  } catch (e) { next(e) }
})

// Update demand
router.patch('/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const { items, status, note } = req.body
    const update = {}
    if (items && Array.isArray(items)) {
      update.items = items.map(it => ({
        name: it.name,
        quantity: Number(it.quantity) || 0,
        unit: it.unit || '',
        currentStock: Number(it.currentStock) || 0,
        isFromInventory: Boolean(it.isFromInventory),
        ingredientId: it.ingredientId || '',
      }))
    }
    if (status && ['pending', 'sent', 'completed'].includes(status)) {
      update.status = status
    }
    if (note !== undefined) {
      update.note = note
    }
    const row = await Demand.findByIdAndUpdate(req.params.id, update, { new: true })
    if (!row) return res.status(404).json({ error: 'Demand not found' })
    await logAudit(req, 'demand', `Updated demand ${req.params.id}`, { id: req.params.id, update })
    res.json(row)
  } catch (e) { next(e) }
})

// Update demand status
router.patch('/:id/status', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const { status } = req.body
    if (!status || !['pending', 'sent', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    const row = await Demand.findByIdAndUpdate(req.params.id, { status }, { new: true })
    if (!row) return res.status(404).json({ error: 'Demand not found' })
    await logAudit(req, 'demand', `Changed demand status to ${status}`, { id: req.params.id })
    res.json(row)
  } catch (e) { next(e) }
})

// Delete demand
router.delete('/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const row = await Demand.findByIdAndDelete(req.params.id)
    if (!row) return res.status(404).json({ error: 'Demand not found' })
    await logAudit(req, 'demand', `Deleted demand ${req.params.id}`, { id: req.params.id })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
