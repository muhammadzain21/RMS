import { Router } from 'express'
import Sale from '../models/Sale.js'
import Branch from '../models/Branch.js'
import Expense from '../models/Expense.js'
import CallCenterOrder from '../models/CallCenterOrder.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { isHqUser } from '../utils/branchScope.js'

const router = Router()

function num(v) { return Number(v) || 0 }

/** Compare branches for a date range — HQ only */
router.get('/compare', authRequired, requireRole('Admin', 'SuperAdmin', 'Manager'), async (req, res, next) => {
  try {
    if (!isHqUser(req.user) && req.user?.role !== 'Manager') {
      return res.status(403).json({ error: 'HQ access required' })
    }
    const from = String(req.query.from || '').trim()
    const to = String(req.query.to || '').trim()
    const branches = await Branch.find({ active: { $ne: false } }).lean()

    const saleDateFilter = {}
    if (from || to) {
      saleDateFilter.date = {}
      if (from) saleDateFilter.date.$gte = from
      if (to) saleDateFilter.date.$lte = to
    }

    const rows = []
    for (const br of branches) {
      const bid = br._id.toString()
      const sales = await Sale.find({ ...saleDateFilter, branchId: bid }).lean()
      // Also include legacy sales with no branchId when only one branch exists
      const gross = sales.reduce((s, x) => s + num(x.total), 0)
      const bills = sales.length
      const expenses = await Expense.find({
        ...(from || to ? { date: saleDateFilter.date } : {}),
        branchId: bid,
      }).lean().catch(() => [])
      const expenseTotal = (expenses || []).reduce((s, x) => s + num(x.amount ?? x.total), 0)
      const ccPending = await CallCenterOrder.countDocuments({ branchId: bid, status: 'pending' })
      const ccDone = await CallCenterOrder.countDocuments({
        branchId: bid,
        status: 'kot_created',
        ...(from || to ? { createdAt: {
          ...(from ? { $gte: new Date(from) } : {}),
          ...(to ? { $lte: new Date(to + 'T23:59:59') } : {}),
        } } : {}),
      })

      rows.push({
        branchId: bid,
        code: br.code,
        name: br.name,
        mode: br.mode,
        bills,
        salesTotal: gross,
        avgTicket: bills ? gross / bills : 0,
        expenses: expenseTotal,
        netApprox: gross - expenseTotal,
        callCenterPending: ccPending,
        callCenterFulfilled: ccDone,
      })
    }

    const totals = rows.reduce((acc, r) => {
      acc.bills += r.bills
      acc.salesTotal += r.salesTotal
      acc.expenses += r.expenses
      acc.netApprox += r.netApprox
      acc.callCenterPending += r.callCenterPending
      acc.callCenterFulfilled += r.callCenterFulfilled
      return acc
    }, { bills: 0, salesTotal: 0, expenses: 0, netApprox: 0, callCenterPending: 0, callCenterFulfilled: 0 })

    res.json({ from, to, branches: rows, totals })
  } catch (e) { next(e) }
})

export default router
