import { Router } from 'express'
import Table from '../models/Table.js'
import Sale from '../models/Sale.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(authRequired)

// GET /api/tables/summary?date=YYYY-MM-DD&from=&to=
router.get('/summary', async (req, res, next) => {
  try {
    const { date, from, to } = req.query
    const q = { orderType: 'Dine-in' }
    if (date) q.date = date
    if (from || to) q.date = { ...(q.date || {}), ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) }
    const rows = await Sale.find(q).sort({ createdAt: -1 }).select('tableNo date waiter total createdAt')
    const map = new Map()
    for (const s of rows) {
      const name = (s.tableNo || '').trim()
      if (!name) continue
      if (!map.has(name)) map.set(name, { table: name, orders: 0, totalAmount: 0, lastDate: '-', lastWaiter: '-' })
      const e = map.get(name)
      e.orders += 1
      e.totalAmount += Number(s.total || 0)
      if (e.lastDate === '-') { e.lastDate = s.date || '-'; e.lastWaiter = s.waiter || '-' }
    }
    res.json({ date, from, to, tables: Array.from(map.values()) })
  } catch (e) { next(e) }
})

// GET /api/tables
router.get('/', async (_req, res, next) => {
  try {
    const rows = await Table.find().sort({ name: 1 })
    res.json(rows)
  } catch (e) { next(e) }
})

// POST /api/tables { name }
router.post('/', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const { name, floor } = req.body
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name required' })
    const row = await Table.create({ name: String(name).trim(), floor: floor ? String(floor).trim() : '' })
    try { await Audit.create({ type: 'table', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Added table ${row.name}`, meta: { id: row._id } }) } catch {}
    res.status(201).json(row)
  } catch (e) { next(e) }
})

// PATCH /api/tables/:id
router.patch('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const { id } = req.params
    const { name, notes, active, floor } = req.body
    const update = {}
    if (name) update.name = String(name).trim()
    if (typeof notes === 'string') update.notes = notes
    if (typeof active === 'boolean') update.active = active
    if (typeof floor === 'string') update.floor = floor.trim()
    const row = await Table.findByIdAndUpdate(id, update, { new: true })
    if (!row) return res.status(404).json({ message: 'Not found' })
    try { await Audit.create({ type: 'table', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Updated table ${id}`, meta: { id, patch: req.body } }) } catch {}
    res.json(row)
  } catch (e) { next(e) }
})

// DELETE /api/tables/:id
router.delete('/:id', requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    await Table.findByIdAndDelete(req.params.id)
    try { await Audit.create({ type: 'table', userId: req.user?.id||'', userName: req.user?.username || 'system', action: `Deleted table ${req.params.id}`, meta: { id: req.params.id } }) } catch {}
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// GET /api/tables/:id/history?from=&to=&limit=
router.get('/:id/history', async (req, res, next) => {
  try {
    const t = await Table.findById(req.params.id)
    if (!t) return res.status(404).json({ error: 'Not found' })
    const { from, to } = req.query
    const q = { orderType: 'Dine-in', tableNo: t.name }
    if (from || to) q.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) }
    const rows = await Sale.find(q).sort({ createdAt: -1 })
    res.json(rows)
  } catch (e) { next(e) }
})

// GET /api/tables/by-name/:name/history (convenience)
router.get('/by-name/:name/history', async (req, res, next) => {
  try {
    const name = String(req.params.name || '').trim()
    const { from, to } = req.query
    const q = { orderType: 'Dine-in', tableNo: name }
    if (from || to) q.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) }
    const rows = await Sale.find(q).sort({ createdAt: -1 })
    res.json(rows)
  } catch (e) { next(e) }
})

export default router
