import { Router } from 'express'
import Expense from '../models/Expense.js'
import ExpenseHead from '../models/ExpenseHead.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { blockIfClosedFromBody, blockIfClosedFromModel } from '../middleware/dayClosed.js'
import { logAudit } from '../middleware/auditLog.js'
import { mergeBranchFilter, resolveBranchId, stampBranchId, assertDocumentBranch } from '../utils/branchScope.js'
import { getSettingsLean } from '../utils/settingsScope.js'

const router = Router()
router.use(authRequired)

const DEFAULT_HEADS = ['Rent', 'Utilities', 'Wages', 'Salaries', 'Supplies', 'Transport', 'Marketing', 'Maintenance', 'Misc']

function who(req) {
  return req.user?.name || req.user?.username || req.user?.email || 'User'
}

function headToJson(h) {
  return {
    id: String(h._id),
    _id: String(h._id),
    name: h.name,
    active: h.active !== false,
  }
}

async function ensureHeadsSeeded(branchId) {
  if (!branchId) return []
  const existing = await ExpenseHead.find({ branchId, active: { $ne: false } }).sort({ name: 1 }).lean()
  if (existing.length) return existing

  let names = []
  const s = await getSettingsLean(branchId)
  if (Array.isArray(s?.expenseHeads) && s.expenseHeads.length) {
    names = s.expenseHeads
  } else {
    names = DEFAULT_HEADS
  }
  const unique = [...new Set(names.map(n => String(n || '').trim()).filter(Boolean))]
  const toInsert = unique.length ? unique : DEFAULT_HEADS
  const created = []
  for (const name of toInsert) {
    try {
      const doc = await ExpenseHead.create({
        branchId: String(branchId),
        name,
        nameKey: name.trim().toLowerCase(),
        active: true,
      })
      created.push(doc.toObject())
    } catch (e) {
      if (e?.code === 11000) {
        const found = await ExpenseHead.findOne({ branchId, nameKey: name.trim().toLowerCase() }).lean()
        if (found) created.push(found)
      } else throw e
    }
  }
  return created.length
    ? await ExpenseHead.find({ branchId, active: { $ne: false } }).sort({ name: 1 }).lean()
    : []
}

function buildFilter(query, req) {
  const {
    from = '0000-00-00',
    to = '9999-12-31',
    category = '',
    expenseHead = '',
    accountHead = '',
    paymentMethod = '',
    paidBy = '',
    status = '',
    q = '',
    min = 0,
  } = query
  const head = expenseHead || category
  const $and = [
    { date: { $gte: String(from), $lte: String(to) } },
    ...(head ? [{
      $or: [
        { category: head },
        { expenseHead: head },
        { 'lines.expenseHead': head },
      ],
    }] : []),
    ...(accountHead ? [{ accountHead }] : []),
    ...(paymentMethod ? [{ paymentMethod }] : []),
    ...(paidBy ? [{ paidBy: { $regex: String(paidBy), $options: 'i' } }] : []),
    ...(status === 'approved' ? [{ status: 'approved' }] : []),
    ...(status === 'pending' ? [{ $or: [{ status: 'pending' }, { status: { $exists: false } }, { status: null }, { status: '' }] }] : []),
    ...(q ? [{
      $or: [
        { description: { $regex: String(q), $options: 'i' } },
        { note: { $regex: String(q), $options: 'i' } },
        { category: { $regex: String(q), $options: 'i' } },
        { expenseHead: { $regex: String(q), $options: 'i' } },
        { 'lines.description': { $regex: String(q), $options: 'i' } },
        { 'lines.expenseHead': { $regex: String(q), $options: 'i' } },
        { userName: { $regex: String(q), $options: 'i' } },
        { paidBy: { $regex: String(q), $options: 'i' } },
      ],
    }] : []),
    ...(min ? [{ amount: { $gte: Number(min) } }] : []),
  ]
  const base = $and.length ? { $and } : {}
  return req ? mergeBranchFilter(req, base) : base
}

function parseLines(body) {
  if (Array.isArray(body.lines) && body.lines.length) {
    return body.lines
      .map(l => ({
        expenseHead: String(l.expenseHead || 'Misc').trim() || 'Misc',
        description: String(l.description || '').trim(),
        amount: Number(l.amount || 0),
      }))
      .filter(l => l.amount > 0)
  }
  const amount = Number(body.amount || 0)
  if (amount > 0) {
    const expenseHead = String(body.expenseHead || body.category || 'Misc').trim() || 'Misc'
    return [{
      expenseHead,
      description: String(body.description || '').trim(),
      amount,
    }]
  }
  return []
}

function normalizeBody(body, req, { isCreate = false } = {}) {
  const accountHead = body.accountHead === 'bank' ? 'bank' : 'cash'
  const lines = parseLines(body)
  if (!lines.length) {
    const err = new Error('Add at least one line with a positive amount')
    err.status = 400
    throw err
  }
  const amount = lines.reduce((a, l) => a + l.amount, 0)
  const firstHead = lines[0].expenseHead
  const lineDescriptions = lines.map(l => l.description).filter(Boolean)
  const description = String(body.description || '').trim()
    || (lineDescriptions.length ? lineDescriptions.join('; ') : lines[0].description || '')

  const out = {
    date: body.date,
    category: firstHead,
    expenseHead: firstHead,
    lines,
    amount,
    description,
    accountHead,
  }
  if (isCreate) {
    out.userId = String(req.user?.id || req.user?._id || '')
    out.userName = who(req)
    out.status = 'pending'
    out.approvedBy = ''
    out.approvedByUserId = ''
    out.approvedAt = undefined
  }
  if (body.branchId) out.branchId = String(body.branchId)
  return out
}

function headsLabel(exp) {
  if (Array.isArray(exp.lines) && exp.lines.length) {
    const names = [...new Set(exp.lines.map(l => l.expenseHead).filter(Boolean))]
    if (names.length === 1) return names[0]
    if (names.length > 1) return names.join(', ')
  }
  return exp.expenseHead || exp.category || '—'
}

// ——— Expense heads (branch-scoped model) ———

router.get('/heads', async (req, res, next) => {
  try {
    let branchId = ''
    try { branchId = resolveBranchId(req) || '' } catch { branchId = '' }
    if (!branchId) {
      return res.json({ heads: DEFAULT_HEADS.map(name => ({ id: name, name, active: true })) })
    }
    const list = await ensureHeadsSeeded(branchId)
    res.json({ heads: list.map(headToJson) })
  } catch (e) { next(e) }
})

router.post('/heads', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req, { required: true })
    const name = String(req.body?.name || '').trim()
    if (!name) return res.status(400).json({ error: 'Name is required' })
    const exists = await ExpenseHead.findOne({ branchId, nameKey: name.toLowerCase() }).lean()
    if (exists) {
      if (exists.active === false) {
        const doc = await ExpenseHead.findByIdAndUpdate(exists._id, { active: true, name }, { new: true })
        return res.status(201).json(headToJson(doc))
      }
      return res.status(409).json({ error: 'Head already exists' })
    }
    const doc = await ExpenseHead.create({ branchId, name, nameKey: name.toLowerCase(), active: true })
    await logAudit(req, 'expense', `Created expense head: ${name}`, { id: doc._id })
    res.status(201).json(headToJson(doc))
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.patch('/heads/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req, { required: true })
    const doc = await ExpenseHead.findById(req.params.id)
    if (!doc) return res.status(404).json({ error: 'Not found' })
    if (String(doc.branchId) !== String(branchId)) {
      return res.status(403).json({ error: 'This head belongs to another branch' })
    }
    const patch = {}
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim()
      if (!name) return res.status(400).json({ error: 'Name is required' })
      const dup = await ExpenseHead.findOne({
        branchId,
        nameKey: name.toLowerCase(),
        _id: { $ne: doc._id },
      }).lean()
      if (dup) return res.status(409).json({ error: 'Head already exists' })
      patch.name = name
      patch.nameKey = name.toLowerCase()
    }
    if (req.body?.active !== undefined) patch.active = !!req.body.active
    const updated = await ExpenseHead.findByIdAndUpdate(req.params.id, patch, { new: true })
    res.json(headToJson(updated))
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.delete('/heads/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const branchId = resolveBranchId(req, { required: true })
    const doc = await ExpenseHead.findById(req.params.id)
    if (!doc) return res.status(404).json({ error: 'Not found' })
    if (String(doc.branchId) !== String(branchId)) {
      return res.status(403).json({ error: 'This head belongs to another branch' })
    }
    const headName = doc.name
    const used = await Expense.findOne({
      branchId,
      $or: [
        { expenseHead: headName },
        { category: headName },
        { 'lines.expenseHead': headName },
      ],
    }).lean()
    if (used) {
      await ExpenseHead.findByIdAndUpdate(doc._id, { active: false })
      return res.json({ ok: true, softDeleted: true })
    }
    await ExpenseHead.findByIdAndDelete(doc._id)
    await logAudit(req, 'expense', `Deleted expense head: ${headName}`, { id: doc._id })
    res.json({ ok: true })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// ——— Analytics & list ———

router.get('/summary', async (req, res, next) => {
  try {
    const filter = buildFilter(req.query, req)
    const rows = await Expense.find(filter).lean()
    const sumBy = (keyFn) => {
      const map = new Map()
      for (const r of rows) {
        const k = keyFn(r) || '—'
        map.set(k, (map.get(k) || 0) + Number(r.amount || 0))
      }
      return Array.from(map.entries()).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
    }
    const accountLabel = (v) => (v === 'bank' ? 'Bank' : 'Cash in Hand')
    const pending = rows.filter(r => r.status !== 'approved')
    const approved = rows.filter(r => r.status === 'approved')

    res.json({
      total: rows.reduce((a, r) => a + Number(r.amount || 0), 0),
      count: rows.length,
      pendingCount: pending.length,
      pendingTotal: pending.reduce((a, r) => a + Number(r.amount || 0), 0),
      approvedCount: approved.length,
      approvedTotal: approved.reduce((a, r) => a + Number(r.amount || 0), 0),
      byCategory: sumBy(r => headsLabel(r)),
      byAccountHead: sumBy(r => accountLabel(r.accountHead)),
      byStatus: sumBy(r => (r.status === 'approved' ? 'Approved' : 'Pending')),
    })
  } catch (e) { next(e) }
})

router.get('/', async (req, res, next) => {
  try {
    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limitNum = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50))
    const filter = buildFilter(req.query, req)
    const total = await Expense.countDocuments(filter)
    const rows = await Expense.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
    res.json({ rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) })
  } catch (e) { next(e) }
})

router.get('/export', async (req, res, next) => {
  try {
    const filter = buildFilter(req.query, req)
    const rows = await Expense.find(filter).sort({ date: -1, createdAt: -1 })
    const header = ['date', 'heads', 'accountHead', 'amount', 'status', 'addedBy', 'approvedBy', 'description']
    const csv = [
      header.join(','),
      ...rows.map(r => [
        r.date,
        headsLabel(r).replaceAll(',', ' '),
        r.accountHead || 'cash',
        r.amount,
        r.status || 'pending',
        (r.userName || '').replaceAll(',', ' '),
        (r.approvedBy || '').replaceAll(',', ' '),
        (r.description || '').replaceAll(',', ' '),
      ].join(',')),
    ].join('\n')
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"')
    res.send(csv)
  } catch (e) { next(e) }
})

router.post('/', requireRole('Admin', 'Manager'), blockIfClosedFromBody('date'), async (req, res, next) => {
  try {
    const payload = stampBranchId(req, normalizeBody(req.body || {}, req, { isCreate: true }))
    const exp = await Expense.create(payload)
    await logAudit(req, 'expense', `Added expense ${headsLabel(exp)}: ${exp.amount} via ${exp.accountHead}`, { id: exp._id })
    res.status(201).json(exp)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.patch('/:id', requireRole('Admin', 'Manager'), blockIfClosedFromModel(Expense), async (req, res, next) => {
  try {
    const existing = await Expense.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    assertDocumentBranch(req, existing)
    const payload = normalizeBody({ ...(req.body || {}), date: req.body?.date || existing.date }, req, { isCreate: false })
    const patch = { ...payload }
    if (!req.body?.date) patch.date = existing.date
    if (existing.branchId) patch.branchId = String(existing.branchId)
    delete patch.userName
    delete patch.userId
    delete patch.status
    const doc = await Expense.findByIdAndUpdate(req.params.id, patch, { new: true })
    await logAudit(req, 'expense', `Updated expense ${req.params.id}`, { id: req.params.id, patch })
    res.json(doc)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.post('/:id/approve', requireRole('Admin', 'Manager'), blockIfClosedFromModel(Expense), async (req, res, next) => {
  try {
    const existing = await Expense.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    assertDocumentBranch(req, existing)
    const now = new Date()
    const doc = await Expense.findByIdAndUpdate(req.params.id, {
      status: 'approved',
      approvedBy: who(req),
      approvedByUserId: String(req.user?.id || req.user?._id || ''),
      approvedAt: now,
    }, { new: true })
    await logAudit(req, 'expense', `Approved expense ${req.params.id}`, { id: req.params.id })
    res.json(doc)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.post('/:id/unapprove', requireRole('Admin', 'Manager'), blockIfClosedFromModel(Expense), async (req, res, next) => {
  try {
    const existing = await Expense.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    assertDocumentBranch(req, existing)
    const doc = await Expense.findByIdAndUpdate(req.params.id, {
      status: 'pending',
      approvedBy: '',
      approvedByUserId: '',
      $unset: { approvedAt: 1 },
    }, { new: true })
    await logAudit(req, 'expense', `Unapproved expense ${req.params.id}`, { id: req.params.id })
    res.json(doc)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.delete('/:id', requireRole('Admin', 'Manager'), blockIfClosedFromModel(Expense), async (req, res, next) => {
  try {
    const existing = await Expense.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    assertDocumentBranch(req, existing)
    await Expense.findByIdAndDelete(req.params.id)
    await logAudit(req, 'expense', `Deleted expense ${req.params.id}`, { id: req.params.id })
    res.json({ ok: true })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

export default router
