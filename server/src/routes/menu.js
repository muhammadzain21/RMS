import { Router } from 'express'
import MenuItem from '../models/MenuItem.js'
import Ingredient from '../models/Ingredient.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'

const router = Router()

router.use(authRequired)

router.get('/', async (req, res, next) => {
  try {
    const q = {}
    if (req.query.active) q.active = req.query.active === 'true'
    const items = await MenuItem.find(q).sort({ name: 1 })
    res.json(items)
  } catch (e) { next(e) }
})

// Export all menu items
router.get('/export', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const items = await MenuItem.find({}).sort({ category: 1, name: 1 }).lean()
    const fmt = (req.query.format || 'json').toLowerCase()
    if (fmt === 'csv') {
      // Flatten a subset of fields for easier CSV export
      const rows = items.map(i => ({
        name: i.name,
        category: i.category || '',
        sku: i.sku || '',
        price: i.price ?? 0,
        active: i.active ? 'Yes' : 'No',
      }))
      const headers = Object.keys(rows[0] || { name:'', category:'', sku:'', price:'', active:'' })
      const csv = [headers.join(','), ...rows.map(r => headers.map(h => String(r[h] ?? '').replaceAll('"','""')).map(v=>/[,\n\r]/.test(v)?`"${v}"`:v).join(','))].join('\n')
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', 'attachment; filename="menu_export.csv"')
      return res.send(csv)
    }
    // default JSON
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', 'attachment; filename="menu_export.json"')
    res.send(JSON.stringify(items, null, 2))
  } catch (e) { next(e) }
})

router.post('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    // Normalize any provided recipe keys to canonical ingredient names
    const payload = { ...(req.body || {}) }
    if (payload.recipe && typeof payload.recipe === 'object') {
      const norm = s => String(s||'').trim().toLowerCase().replace(/\s+/g,' ')
      const ings = await Ingredient.find({}, { name: 1 }).lean()
      const byNorm = new Map(ings.map(i => [norm(i.name), i.name]))
      const merged = {}
      for (const [k, v] of Object.entries(payload.recipe || {})) {
        const amt = Number(v || 0)
        if (!(amt > 0)) continue
        const canon = byNorm.get(norm(k)) || String(k).trim()
        merged[canon] = Number((merged[canon] || 0) + amt)
      }
      payload.recipe = merged
    }
    const item = await MenuItem.create(payload)
    await logAudit(req, 'menu', `Added menu ${item?.name || item?._id}`, { id: item._id })
    res.status(201).json(item)
  } catch (e) { next(e) }
})

// Seed (or re-seed) a basic menu based on the provided presets.
// This will upsert by name + category to avoid duplicates.
router.post('/seed', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const presets = req.body?.items || getDefaultSeed()
    const results = []
    for (const p of presets) {
      const filter = { name: p.name, category: p.category }
      const update = { ...p, active: p.active ?? true }
      const item = await MenuItem.findOneAndUpdate(filter, update, { new: true, upsert: true })
      results.push(item)
    }
    res.json({ ok: true, count: results.length, items: results })
  } catch (e) { next(e) }
})

router.patch('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const payload = { ...(req.body || {}) }
    if (payload.recipe && typeof payload.recipe === 'object') {
      const norm = s => String(s||'').trim().toLowerCase().replace(/\s+/g,' ')
      const ings = await Ingredient.find({}, { name: 1 }).lean()
      const byNorm = new Map(ings.map(i => [norm(i.name), i.name]))
      const merged = {}
      for (const [k, v] of Object.entries(payload.recipe || {})) {
        const amt = Number(v || 0)
        if (!(amt > 0)) continue
        const canon = byNorm.get(norm(k)) || String(k).trim()
        merged[canon] = Number((merged[canon] || 0) + amt)
      }
      payload.recipe = merged
    }
    const item = await MenuItem.findByIdAndUpdate(req.params.id, payload, { new: true })
    await logAudit(req, 'menu', `Updated menu ${req.params.id}`, { id: req.params.id, patch: req.body })
    res.json(item)
  } catch (e) { next(e) }
})

router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    await MenuItem.findByIdAndDelete(req.params.id)
    await logAudit(req, 'menu', `Deleted menu ${req.params.id}`, { id: req.params.id })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router

// Default seed derived from the shared menu images (simplified)
function getDefaultSeed() {
  const starters = [
    { name: 'Chicken Strips (5 Pcs)', category: 'Starters', price: 520 },
    { name: 'Chicken Strips (10 Pcs)', category: 'Starters', price: 950 },
    { name: 'Cheese Sticks (Small)', category: 'Starters', price: 499 },
    { name: 'Cheese Sticks (Medium)', category: 'Starters', price: 1090 },
    { name: 'Cheese Sticks (Large)', category: 'Starters', price: 1549 },
    { name: 'Chicken Spin Roll (3 Pcs)', category: 'Starters', price: 249 },
    { name: 'Chicken Spin Roll (6 Pcs)', category: 'Starters', price: 449 },
    { name: 'Oven Baked Wings (6 Pcs)', category: 'Starters', price: 299 },
    { name: 'Oven Baked Wings (12 Pcs)', category: 'Starters', price: 549 },
    { name: 'Loaded Fries (Medium)', category: 'Starters', price: 549 },
    { name: 'Loaded Fries (Large)', category: 'Starters', price: 749 },
    { name: 'Trio Platter', category: 'Starters', price: 620 },
    { name: 'Pasta', category: 'Starters', price: 599 },
  ]

  const sideOrders = [
    { name: 'French Fries (Regular)', category: 'Side Orders', price: 239 },
    { name: 'French Fries (Large)', category: 'Side Orders', price: 399 },
    { name: 'Nuggets (5 Pcs)', category: 'Side Orders', price: 250 },
    { name: 'Nuggets (10 Pcs)', category: 'Side Orders', price: 450 },
    { name: 'Curly Fries with Dip', category: 'Side Orders', price: 400 },
  ]

  const burgers = [
    { name: 'Patty Burger', category: 'Burger', price: 240 },
    { name: 'Zinger Burger', category: 'Burger', price: 380 },
    { name: 'Mighty Thunder Burger', category: 'Burger', price: 580 },
    { name: "O'resto Special Wrap", category: 'Burger', price: 580 },
    { name: "O'resto Grill Wrap", category: 'Burger', price: 580 },
    { name: 'Grill Burger, Single fillet', category: 'Grill Burger', price: 580 },
    { name: 'Grill Burger, Double fillet', category: 'Grill Burger', price: 690 },
    { name: 'Grill Burger, Triple fillet', category: 'Grill Burger', price: 750 },
  ]

  const deals = [
    { name: 'Regular Deal', category: 'Value Deals', price: 630, description: '1 Zinger Burger + Regular Fries + Regular Drink' },
    { name: 'Double Deal', category: 'Value Deals', price: 750, description: '2 Zinger Burger + 1 Regular Drink' },
    { name: 'Hunger Deal', category: 'Value Deals', price: 780, description: '1 Mighty Thunder Burger + Regular Fries + Regular Drink' },
  ]

  return [...starters, ...sideOrders, ...burgers, ...deals]
}
