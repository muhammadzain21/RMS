import { Router } from 'express'
import Table from '../models/Table.js'
import Sale from '../models/Sale.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import {
  assertDocumentBranch,
  mergeBranchFilter,
  resolveBranchId,
  stampBranchId,
} from '../utils/branchScope.js'
import { getOrCreateSettings } from '../utils/settingsScope.js'

const router = Router()
router.use(authRequired)

const legacyUnscoped = {
  $or: [
    { branchId: '' },
    { branchId: null },
    { branchId: { $exists: false } },
  ],
}

/** First visit to a branch: copy unscoped legacy tables into that branch (once). */
async function ensureBranchTables(req) {
  const branchId = resolveBranchId(req)
  if (!branchId) return
  const settings = await getOrCreateSettings(branchId)
  if (settings.tablesCatalogSeeded) return
  const owned = await Table.countDocuments({ branchId: String(branchId) })
  if (owned === 0) {
    const legacy = await Table.find(legacyUnscoped).lean()
    for (const t of legacy) {
      const name = String(t.name || '').trim()
      if (!name) continue
      const exists = await Table.findOne({ branchId: String(branchId), name })
      if (exists) continue
      await Table.create({
        name,
        floor: t.floor || '',
        imageUrl: t.imageUrl || '',
        notes: t.notes || '',
        active: t.active !== false,
        branchId: String(branchId),
      })
    }
  }
  settings.tablesCatalogSeeded = true
  await settings.save()
}

// GET /api/tables/summary?date=YYYY-MM-DD&from=&to=
router.get('/summary', async (req, res, next) => {
  try {
    const { date, from, to } = req.query
    let q = { orderType: 'Dine-in' }
    if (date) q.date = date
    if (from || to) q.date = { ...(q.date || {}), ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) }
    q = mergeBranchFilter(req, q)
    const rows = await Sale.find(q).sort({ createdAt: -1 }).select('tableNo date waiterId total createdAt branchId')
    let allTimeQ = mergeBranchFilter(req, { orderType: 'Dine-in' })
    const allTimeRows = await Sale.find(allTimeQ).sort({ createdAt: -1 }).select('tableNo date waiterId createdAt')
    const allTimeMap = new Map()
    for (const s of allTimeRows) {
      const name = (s.tableNo || '').trim()
      if (!name || allTimeMap.has(name)) continue
      allTimeMap.set(name, { lastDate: s.date || '-', lastWaiter: s.waiterId || '-' })
    }
    const map = new Map()
    for (const s of rows) {
      const name = (s.tableNo || '').trim()
      if (!name) continue
      if (!map.has(name)) map.set(name, { table: name, orders: 0, totalAmount: 0, lastDate: '-', lastWaiter: '-' })
      const e = map.get(name)
      e.orders += 1
      e.totalAmount += Number(s.total || 0)
      if (e.lastDate === '-') { e.lastDate = s.date || '-'; e.lastWaiter = s.waiterId || '-' }
    }
    for (const [name, info] of allTimeMap) {
      if (!map.has(name)) {
        map.set(name, { table: name, orders: 0, totalAmount: 0, lastDate: info.lastDate, lastWaiter: info.lastWaiter })
      } else {
        const e = map.get(name)
        if (e.lastDate === '-') { e.lastDate = info.lastDate; e.lastWaiter = info.lastWaiter }
      }
    }
    res.json({ date, from, to, tables: Array.from(map.values()) })
  } catch (e) { next(e) }
})

// GET /api/tables
router.get('/', async (req, res, next) => {
  try {
    await ensureBranchTables(req)
    const filter = mergeBranchFilter(req, {})
    const rows = await Table.find(filter).sort({ name: 1 })
    res.json(rows)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// POST /api/tables { name }
router.post('/', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const { name, floor, imageUrl } = req.body
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name required' })
    const payload = stampBranchId(req, {
      name: String(name).trim(),
      floor: floor ? String(floor).trim() : '',
      imageUrl: imageUrl ? String(imageUrl) : '',
    })
    const dup = await Table.findOne({ branchId: payload.branchId, name: payload.name })
    if (dup) return res.status(400).json({ message: 'Table name already exists for this branch' })
    const row = await Table.create(payload)
    try { await Audit.create({ type: 'table', userId: req.user?.id || '', userName: req.user?.username || 'system', action: `Added table ${row.name}`, meta: { id: row._id, branchId: row.branchId } }) } catch {}
    res.status(201).json(row)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// PATCH /api/tables/:id
router.patch('/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const { id } = req.params
    const existing = await Table.findById(id)
    if (!existing) return res.status(404).json({ message: 'Not found' })
    assertDocumentBranch(req, existing)
    const { name, notes, active, floor, imageUrl } = req.body
    const update = {}
    if (name) update.name = String(name).trim()
    if (typeof notes === 'string') update.notes = notes
    if (typeof active === 'boolean') update.active = active
    if (typeof floor === 'string') update.floor = floor.trim()
    if (typeof imageUrl === 'string') update.imageUrl = imageUrl
    if (update.name) {
      const branchId = String(existing.branchId || resolveBranchId(req) || '')
      const dup = await Table.findOne({ branchId, name: update.name, _id: { $ne: existing._id } })
      if (dup) return res.status(400).json({ message: 'Table name already exists for this branch' })
    }
    const row = await Table.findByIdAndUpdate(id, update, { new: true })
    try { await Audit.create({ type: 'table', userId: req.user?.id || '', userName: req.user?.username || 'system', action: `Updated table ${id}`, meta: { id, patch: req.body } }) } catch {}
    res.json(row)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// DELETE /api/tables/:id
router.delete('/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const existing = await Table.findById(req.params.id)
    if (!existing) return res.status(404).json({ message: 'Not found' })
    assertDocumentBranch(req, existing)
    await Table.findByIdAndDelete(req.params.id)
    try { await Audit.create({ type: 'table', userId: req.user?.id || '', userName: req.user?.username || 'system', action: `Deleted table ${req.params.id}`, meta: { id: req.params.id } }) } catch {}
    res.json({ ok: true })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// GET /api/tables/:id/history?from=&to=&limit=
router.get('/:id/history', async (req, res, next) => {
  try {
    const t = await Table.findById(req.params.id)
    if (!t) return res.status(404).json({ error: 'Not found' })
    assertDocumentBranch(req, t)
    const { from, to } = req.query
    let q = { orderType: 'Dine-in', tableNo: t.name }
    if (from || to) q.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) }
    q = mergeBranchFilter(req, q)
    const rows = await Sale.find(q).sort({ createdAt: -1 })
    res.json(rows)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// GET /api/tables/by-name/:name/history (convenience)
router.get('/by-name/:name/history', async (req, res, next) => {
  try {
    const name = String(req.params.name || '').trim()
    const { from, to } = req.query
    let q = { orderType: 'Dine-in', tableNo: name }
    if (from || to) q.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) }
    q = mergeBranchFilter(req, q)
    const rows = await Sale.find(q).sort({ createdAt: -1 })
    res.json(rows)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

export default router
