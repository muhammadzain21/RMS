import { Router } from 'express'
import Supply from '../models/Supply.js'
import Ingredient from '../models/Ingredient.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { mergeBranchFilter, stampBranchId } from '../utils/branchScope.js'

const router = Router()
router.use(authRequired)

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

// Create a supply and update ingredient stocks
router.post('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const { date, supplierId = '', supplier = '', items = [], cost = 0, skipInventoryUpdate = false } = req.body
    if (!date) return res.status(400).json({ error: 'date required' })
    // persist supply
    const created = await Supply.create(stampBranchId(req, { date, supplierId, supplier, items, cost }))
    // update ingredient quantities by item name (skip if already updated elsewhere)
    if (!skipInventoryUpdate) {
      for (const it of items) {
        if (!it?.name) continue
        const name = String(it.name)
        const qty = Number(it.qty || 0)
        const unit = String(it.unit || '')
        const price = Number(it.price || 0)
        const found = await Ingredient.findOne({ name })
        if (found) {
          found.qty = Number(found.qty || 0) + qty
          if (unit) found.unit = unit
          if (!Number.isNaN(price)) found.price = price
          await found.save()
        } else {
          await Ingredient.create({ name, category: 'Supply', qty, unit, price })
        }
      }
    }
    try { await Audit.create({ type: 'inventory', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Added supply on ${created.date} (items: ${items.length})`, meta: { id: created._id, cost: created.cost } }) } catch {}
    res.status(201).json(created)
  } catch (e) { next(e) }
})

export default router
