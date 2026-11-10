import { Router } from 'express'
import Demand from '../models/Demand.js'
import Branch from '../models/Branch.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'
import { isHqUser, mergeBranchFilter, stampBranchId } from '../utils/branchScope.js'

const router = Router()
router.use(authRequired)

const STATUSES = ['pending', 'sent', 'accepted', 'issued', 'completed', 'rejected']

function mapItems(items = []) {
  return items.map(it => ({
    name: it.name,
    quantity: Number(it.quantity) || 0,
    unit: it.unit || '',
    currentStock: Number(it.currentStock) || 0,
    isFromInventory: Boolean(it.isFromInventory),
    ingredientId: it.ingredientId || '',
    warehouseItemId: it.warehouseItemId || '',
    issuedQty: Number(it.issuedQty) || 0,
  }))
}

// List demands (branch-scoped; HQ can pass ?hq=1&target=warehouse for all branches)
router.get('/', async (req, res, next) => {
  try {
    const { from, to, status, page = 1, limit = 20, target, hq, search } = req.query
    const pageNum = Math.max(1, parseInt(page) || 1)
    const limitNum = Math.max(1, Math.min(200, parseInt(limit) || 20))
    let filter = {}
    if (from && to) filter.date = { $gte: String(from), $lte: String(to) }
    if (status && STATUSES.includes(String(status))) filter.status = String(status)
    if (target && ['warehouse', 'branch'].includes(String(target))) filter.target = String(target)
    if (search && String(search).trim()) {
      const rx = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ note: rx }, { branchName: rx }, { 'items.name': rx }]
    }

    // HQ inbox of warehouse demands across branches
    if (String(hq) === '1' && isHqUser(req.user)) {
      // no branch filter
    } else {
      filter = mergeBranchFilter(req, filter)
    }

    const total = await Demand.countDocuments(filter)
    const rows = await Demand.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
    res.json({ data: rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) || 1 })
  } catch (e) { next(e) }
})

router.get('/:id', async (req, res, next) => {
  try {
    const row = await Demand.findById(req.params.id)
    if (!row) return res.status(404).json({ error: 'Demand not found' })
    res.json(row)
  } catch (e) { next(e) }
})

// Create demand (default target = warehouse / head office)
router.post('/', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const { date, items, note, target, status } = req.body || {}
    if (!date) return res.status(400).json({ error: 'date required' })
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items required' })
    }
    const payload = stampBranchId(req, {
      date,
      items: mapItems(items),
      status: status === 'sent' ? 'sent' : 'pending',
      target: target === 'branch' ? 'branch' : 'warehouse',
      note: note || '',
      createdBy: req.user?.id || '',
      createdByName: req.user?.username || req.user?.name || '',
    })
    try {
      const br = await Branch.findById(payload.branchId).lean()
      if (br) payload.branchName = br.name || br.code || ''
    } catch {}
    const created = await Demand.create(payload)
    await logAudit(req, 'demand', `Created demand for ${date}`, {
      id: created._id,
      items: items.length,
      target: created.target,
    })
    res.status(201).json(created)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.patch('/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const { items, status, note, target } = req.body || {}
    const update = {}
    if (items && Array.isArray(items)) update.items = mapItems(items)
    if (status && STATUSES.includes(status)) update.status = status
    if (note !== undefined) update.note = note
    if (target && ['warehouse', 'branch'].includes(target)) update.target = target
    const row = await Demand.findByIdAndUpdate(req.params.id, update, { new: true })
    if (!row) return res.status(404).json({ error: 'Demand not found' })
    await logAudit(req, 'demand', `Updated demand ${req.params.id}`, { id: req.params.id, update })
    res.json(row)
  } catch (e) { next(e) }
})

router.patch('/:id/status', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const { status, reason } = req.body || {}
    if (!status || !STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    const patch = { status }
    if (status === 'accepted') {
      patch.acceptedAt = new Date()
      patch.acceptedBy = req.user?.id || ''
    }
    if (status === 'rejected') patch.rejectedReason = String(reason || '')
    const row = await Demand.findByIdAndUpdate(req.params.id, patch, { new: true })
    if (!row) return res.status(404).json({ error: 'Demand not found' })
    await logAudit(req, 'demand', `Changed demand status to ${status}`, { id: req.params.id })
    res.json(row)
  } catch (e) { next(e) }
})

router.delete('/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const row = await Demand.findByIdAndDelete(req.params.id)
    if (!row) return res.status(404).json({ error: 'Demand not found' })
    await logAudit(req, 'demand', `Deleted demand ${req.params.id}`, { id: req.params.id })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
