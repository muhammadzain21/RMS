import { Router } from 'express'
import mongoose from 'mongoose'
import { authRequired } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'

const router = Router()
router.use(authRequired)

// Strictly Admin only - raw collection access is dangerous
router.use((req, res, next) => {
  if (req.user?.role !== 'Admin') return res.status(403).json({ error: 'Admin only' })
  next()
})

// Fields commonly used for business dates (string 'YYYY-MM-DD' or ISO)
const DATE_STRING_FIELDS = ['date', 'at', 'businessDate', 'day']
// Common string fields to search across
const SEARCH_FIELDS = [
  'name', 'title', 'username', 'userName', 'email', 'phone', 'note', 'notes',
  'status', 'category', 'type', 'date', 'invoiceNo', 'billNo', 'orderNo',
  'token', 'description', 'reason', 'customerName', 'staffName', 'supplierName',
  'role', 'method', 'paymentMethod', 'number', 'code', 'label', 'tableName',
]

function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function buildQuery({ from, to, q }) {
  const ands = []
  if (from || to) {
    const fromStr = String(from || '0000-01-01')
    const toStr = String(to || '9999-12-31') + '\uffff'
    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : new Date('1970-01-01')
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : new Date('2999-12-31')
    const fromMs = fromDate.getTime()
    const toMs = toDate.getTime()
    const ors = []
    // String date fields (YYYY-MM-DD / ISO strings sort lexicographically)
    for (const f of DATE_STRING_FIELDS) {
      ors.push({ [f]: { $gte: fromStr, $lte: toStr } })
    }
    // createdAt stored as Date
    ors.push({ createdAt: { $gte: fromDate, $lte: toDate } })
    // createdAt stored as epoch ms number
    ors.push({ createdAt: { $gte: fromMs, $lte: toMs } })
    ors.push({ updatedAt: { $gte: fromDate, $lte: toDate } })
    ands.push({ $or: ors })
  }
  if (q) {
    const rx = new RegExp(escRe(String(q).trim()), 'i')
    ands.push({ $or: SEARCH_FIELDS.map(f => ({ [f]: rx })) })
  }
  if (!ands.length) return {}
  return ands.length === 1 ? ands[0] : { $and: ands }
}

// GET /api/data-manager/collections -> [{ name, count }]
router.get('/collections', async (_req, res, next) => {
  try {
    const db = mongoose.connection.db
    const cols = await db.listCollections().toArray()
    const names = cols.map(c => c.name).filter(n => !n.startsWith('system.'))
    const withCounts = await Promise.all(names.map(async (name) => {
      try { return { name, count: await db.collection(name).countDocuments({}) } }
      catch { return { name, count: 0 } }
    }))
    withCounts.sort((a, b) => a.name.localeCompare(b.name))
    res.json(withCounts)
  } catch (e) { next(e) }
})

// GET /api/data-manager/docs?collection=X&from&to&q&page&limit
router.get('/docs', async (req, res, next) => {
  try {
    const db = mongoose.connection.db
    const colName = String(req.query.collection || '')
    if (!colName) return res.status(400).json({ error: 'collection is required' })
    // Validate collection exists
    const existing = (await db.listCollections({ name: colName }).toArray()).length
    if (!existing) return res.status(404).json({ error: 'Collection not found' })

    const query = buildQuery(req.query)
    const p = Math.max(1, parseInt(req.query.page, 10) || 1)
    const lim = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50))
    const col = db.collection(colName)
    const [rows, total] = await Promise.all([
      col.find(query).sort({ _id: -1 }).skip((p - 1) * lim).limit(lim).toArray(),
      col.countDocuments(query),
    ])
    res.json({ rows, total, page: p, limit: lim })
  } catch (e) { next(e) }
})

// DELETE /api/data-manager/docs/:collection/:id
router.delete('/docs/:collection/:id', async (req, res, next) => {
  try {
    const db = mongoose.connection.db
    const { collection, id } = req.params
    const existing = (await db.listCollections({ name: collection }).toArray()).length
    if (!existing) return res.status(404).json({ error: 'Collection not found' })
    let _id
    try { _id = new mongoose.Types.ObjectId(id) } catch { _id = id }
    const result = await db.collection(collection).deleteOne({ _id })
    await logAudit(req, 'settings', `Deleted document ${id} from ${collection}`, { collection, id })
    res.json({ ok: true, deleted: result.deletedCount })
  } catch (e) { next(e) }
})

// DELETE /api/data-manager/docs/:collection?from&to&q -> bulk delete matching filter
router.delete('/docs/:collection', async (req, res, next) => {
  try {
    const db = mongoose.connection.db
    const { collection } = req.params
    const existing = (await db.listCollections({ name: collection }).toArray()).length
    if (!existing) return res.status(404).json({ error: 'Collection not found' })
    const query = buildQuery(req.query)
    const result = await db.collection(collection).deleteMany(query)
    await logAudit(req, 'settings', `Bulk deleted ${result.deletedCount} docs from ${collection}`, { collection, deleted: result.deletedCount, filter: req.query })
    res.json({ ok: true, deleted: result.deletedCount })
  } catch (e) { next(e) }
})

export default router
