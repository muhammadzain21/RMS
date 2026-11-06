import { Router } from 'express'
import InventorySnapshot from '../models/InventorySnapshot.js'
import PhysicalCount from '../models/PhysicalCount.js'
import Ingredient from '../models/Ingredient.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(authRequired)

// GET /api/inventory-snapshots?date=YYYY-MM-DD  (latest snapshot for that date)
// GET /api/inventory-snapshots?from=YYYY-MM-DD&to=YYYY-MM-DD (all snapshots in range)
router.get('/', async (req, res, next) => {
  try {
    const { date, from, to } = req.query
    if (date) {
      const snap = await InventorySnapshot.findOne({ date: String(date) }).sort({ createdAt: -1 })
      return res.json(snap || null)
    }
    const query = {}
    if (from || to) {
      query.date = { ...(from ? { $gte: String(from) } : {}), ...(to ? { $lte: String(to) } : {}) }
    }
    const rows = await InventorySnapshot.find(query).sort({ date: -1, createdAt: -1 })
    res.json(rows)
  } catch (e) { next(e) }
})

// GET /api/inventory-snapshots/opening?date=YYYY-MM-DD
// Returns the latest snapshot BEFORE the given date (i.e. opening stock for that date)
router.get('/opening', async (req, res, next) => {
  try {
    const { date } = req.query
    if (!date) return res.status(400).json({ error: 'date is required' })
    const snap = await InventorySnapshot.findOne({ date: { $lt: String(date) } }).sort({ date: -1, createdAt: -1 })
    res.json(snap || null)
  } catch (e) { next(e) }
})

// GET /api/inventory-snapshots/physical?date=YYYY-MM-DD — saved physical counts
router.get('/physical', async (req, res, next) => {
  try {
    const { date } = req.query
    if (!date) return res.status(400).json({ error: 'date is required' })
    const doc = await PhysicalCount.findOne({ date: String(date) }).lean()
    res.json({ date: String(date), counts: doc?.counts || {} })
  } catch (e) { next(e) }
})

// PUT /api/inventory-snapshots/physical — upsert physical counts for a date
// Body: { date: 'YYYY-MM-DD', counts: { [ingredientName]: qty } }
router.put('/physical', async (req, res, next) => {
  try {
    const date = String(req.body?.date || '')
    if (!date) return res.status(400).json({ error: 'date is required' })
    const counts = req.body?.counts && typeof req.body.counts === 'object' ? req.body.counts : {}
    const doc = await PhysicalCount.findOneAndUpdate(
      { date },
      { $set: { counts } },
      { upsert: true, new: true }
    )
    res.json({ date, counts: doc?.counts || {} })
  } catch (e) { next(e) }
})

// POST /api/inventory-snapshots  — manually create a snapshot
router.post('/', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const date = String(req.body?.date || '')
    if (!date) return res.status(400).json({ error: 'date is required' })
    const ings = await Ingredient.find({}, { name: 1, qty: 1, unit: 1 }).lean()
    const items = ings.map(i => ({
      ingredientId: String(i._id),
      name: i.name,
      qty: Number(i.qty || 0),
      unit: i.unit || '',
    }))
    const snap = await InventorySnapshot.create({
      date,
      type: req.body?.type || 'manual',
      items,
    })
    res.status(201).json(snap)
  } catch (e) { next(e) }
})

// Helper exported for internal use (not a route)
export async function takeSnapshot(date, type = 'sale') {
  try {
    const ings = await Ingredient.find({}, { name: 1, qty: 1, unit: 1 }).lean()
    const items = ings.map(i => ({
      ingredientId: String(i._id),
      name: i.name,
      qty: Number(i.qty || 0),
      unit: i.unit || '',
    }))
    return await InventorySnapshot.create({ date, type, items })
  } catch (e) {
    console.warn('[snapshot] failed:', e?.message)
    return null
  }
}

export default router
