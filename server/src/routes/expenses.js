import { Router } from 'express'
import Expense from '../models/Expense.js'
import Settings from '../models/Settings.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { blockIfClosedFromBody, blockIfClosedFromModel } from '../middleware/dayClosed.js'
import { logAudit } from '../middleware/auditLog.js'
import { mergeBranchFilter } from '../utils/branchScope.js'

const router = Router()
router.use(authRequired)

const DEFAULT_HEADS = ['Rent', 'Utilities', 'Wages', 'Salaries', 'Supplies', 'Transport', 'Marketing', 'Maintenance', 'Misc']

function buildFilter(query, req) {
  const {
    from = '0000-00-00',
    to = '9999-12-31',
    category = '',
    expenseHead = '',
    accountHead = '',
    paymentMethod = '',
    paidBy = '',
    q = '',
    min = 0,
  } = query
  const head = expenseHead || category
  const $and = [
    { date: { $gte: String(from), $lte: String(to) } },
    ...(head ? [{ $or: [{ category: head }, { expenseHead: head }] }] : []),
    ...(accountHead ? [{ accountHead }] : []),
    ...(paymentMethod ? [{ paymentMethod }] : []),
    ...(paidBy ? [{ paidBy: { $regex: String(paidBy), $options: 'i' } }] : []),
    ...(q ? [{ $or: [
      { description: { $regex: String(q), $options: 'i' } },
      { note: { $regex: String(q), $options: 'i' } },
      { category: { $regex: String(q), $options: 'i' } },
      { expenseHead: { $regex: String(q), $options: 'i' } },
      { paidBy: { $regex: String(q), $options: 'i' } },
    ]}] : []),
    ...(min ? [{ amount: { $gte: Number(min) } }] : []),
  ]
  const base = $and.length ? { $and } : {}
  return req ? mergeBranchFilter(req, base) : base
}

function who(req) {
  return req.user?.name || req.user?.username || req.user?.email || 'User'
}

function normalizeBody(body, req) {
  const category = String(body.expenseHead || body.category || 'Misc').trim() || 'Misc'
  const accountHead = body.accountHead === 'bank' ? 'bank' : 'cash'
  const paymentMethod = ['cash', 'card', 'bank_transfer', 'cheque', 'other'].includes(body.paymentMethod)
    ? body.paymentMethod
    : (accountHead === 'bank' ? 'bank_transfer' : 'cash')
  const paidBy = String(body.paidBy || who(req)).trim()
  const out = {
    date: body.date,
    category,
    expenseHead: category,
    amount: Number(body.amount || 0),
    description: body.description || '',
    note: body.note || '',
    accountHead,
    paymentMethod,
    paidBy,
    paidByUserId: String(body.paidByUserId || req.user?.id || req.user?._id || ''),
    userId: String(req.user?.id || req.user?._id || ''),
    userName: who(req),
  }
  if (body.branchId) out.branchId = String(body.branchId)
  return out
}

// Expense heads list (from settings)
router.get('/heads', async (_req, res, next) => {
  try {
    const s = await Settings.findOne().lean()
    const heads = Array.isArray(s?.expenseHeads) && s.expenseHeads.length ? s.expenseHeads : DEFAULT_HEADS
    res.json({ heads })
  } catch (e) { next(e) }
})

router.put('/heads', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const incoming = Array.isArray(req.body?.heads) ? req.body.heads : []
    const heads = [...new Set(incoming.map(h => String(h || '').trim()).filter(Boolean))]
    const nextHeads = heads.length ? heads : DEFAULT_HEADS
    let doc = await Settings.findOne()
    if (!doc) doc = await Settings.create({ expenseHeads: nextHeads })
    else {
      doc.expenseHeads = nextHeads
      doc.markModified('expenseHeads')
      await doc.save()
    }
    res.json({ heads: doc.expenseHeads || DEFAULT_HEADS })
  } catch (e) { next(e) }
})

// Summary breakdowns for analytics
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
    const methodLabel = (v) => ({
      cash: 'Cash',
      card: 'Card',
      bank_transfer: 'Bank Transfer',
      cheque: 'Cheque',
      other: 'Other',
    }[v] || v || 'Cash')

    res.json({
      total: rows.reduce((a, r) => a + Number(r.amount || 0), 0),
      count: rows.length,
      byCategory: sumBy(r => r.expenseHead || r.category),
      byAccountHead: sumBy(r => accountLabel(r.accountHead)),
      byPaymentMethod: sumBy(r => methodLabel(r.paymentMethod)),
      byPaidBy: sumBy(r => r.paidBy || r.userName || 'Unknown'),
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
    const header = ['date', 'expenseHead', 'accountHead', 'paymentMethod', 'paidBy', 'amount', 'description', 'note']
    const csv = [
      header.join(','),
      ...rows.map(r => [
        r.date,
        (r.expenseHead || r.category || '').replaceAll(',', ' '),
        r.accountHead || 'cash',
        r.paymentMethod || 'cash',
        (r.paidBy || '').replaceAll(',', ' '),
        r.amount,
        (r.description || '').replaceAll(',', ' '),
        (r.note || '').replaceAll(',', ' '),
      ].join(',')),
    ].join('\n')
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"')
    res.send(csv)
  } catch (e) { next(e) }
})

router.post('/', requireRole('Admin', 'Manager'), blockIfClosedFromBody('date'), async (req, res, next) => {
  try {
    const { stampBranchId } = await import('../utils/branchScope.js')
    const payload = stampBranchId(req, normalizeBody(req.body || {}, req))
    const exp = await Expense.create(payload)
    await logAudit(req, 'expense', `Added expense ${exp.category}: ${exp.amount} via ${exp.accountHead}`, { id: exp._id })
    res.status(201).json(exp)
  } catch (e) { next(e) }
})

router.patch('/:id', requireRole('Admin', 'Manager'), blockIfClosedFromModel(Expense), async (req, res, next) => {
  try {
    const { assertDocumentBranch } = await import('../utils/branchScope.js')
    const existing = await Expense.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    assertDocumentBranch(req, existing)
    const payload = normalizeBody({ ...(req.body || {}), date: req.body?.date }, req)
    // Keep date from body if provided; otherwise leave untouched by only setting defined fields
    const patch = { ...payload }
    if (!req.body?.date) delete patch.date
    if (existing.branchId) patch.branchId = String(existing.branchId)
    const doc = await Expense.findByIdAndUpdate(req.params.id, patch, { new: true })
    await logAudit(req, 'expense', `Updated expense ${req.params.id}`, { id: req.params.id, patch })
    res.json(doc)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.delete('/:id', requireRole('Admin', 'Manager'), blockIfClosedFromModel(Expense), async (req, res, next) => {
  try {
    const { assertDocumentBranch } = await import('../utils/branchScope.js')
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
