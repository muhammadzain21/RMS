import { Router } from 'express'
import Return from '../models/Return.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { blockIfClosedFromBody, blockIfClosedFromModel } from '../middleware/dayClosed.js'
import { logAudit } from '../middleware/auditLog.js'
import { mergeBranchFilter, stampBranchId } from '../utils/branchScope.js'

const router = Router()

router.use(authRequired)

// GET /api/returns?date=YYYY-MM-DD&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', async (req, res, next) => {
  try {
    const { date, from, to } = req.query
    let q = {}
    if (date) q.date = date
    if (from || to) q.date = { ...(q.date || {}), ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) }
    q = mergeBranchFilter(req, q)
    const rows = await Return.find(q).sort({ createdAt: -1 })
    res.json(rows)
  } catch (e) { next(e) }
})

// POST /api/returns
router.post('/', blockIfClosedFromBody('date'), async (req, res, next) => {
  try {
    const body = req.body || {}
    const doc = stampBranchId(req, {
      date: body.date,
      saleId: body.saleId || undefined,
      customer: body.customer || undefined,
      items: Array.isArray(body.items) ? body.items : [],
      refund: Number(body.refund || 0),
      reason: body.reason || undefined,
      paymentMethod: body.paymentMethod || 'cash',
    })
    const saved = await Return.create(doc)
    await logAudit(req, 'return', `Created return ${saved.id} for sale ${saved.saleId || '-'}`, { id: saved.id, refund: saved.refund })
    res.status(201).json(saved)
  } catch (e) { next(e) }
})

// DELETE /api/returns/:id
router.delete('/:id', requireRole('Admin','Manager'), blockIfClosedFromModel(Return), async (req, res, next) => {
  try {
    const prev = await Return.findById(req.params.id)
    await Return.findByIdAndDelete(req.params.id)
    await logAudit(req, 'return', `Deleted return ${req.params.id}`, { id: req.params.id, refund: prev?.refund })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
