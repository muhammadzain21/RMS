import { Router } from 'express'
import Sale from '../models/Sale.js'
import PayInOut from '../models/PayInOut.js'
import Expense from '../models/Expense.js'
import CashOpening from '../models/CashOpening.js'
import DayClose from '../models/DayClose.js'
import CashCount from '../models/CashCount.js'
import Void from '../models/Void.js'
import Kot from '../models/Kot.js'
import WarehousePayment from '../models/WarehousePayment.js'
import Supply from '../models/Supply.js'
import Audit from '../models/Audit.js'
import { authRequired } from '../middleware/auth.js'
import { branchFilter, resolveBranchId } from '../utils/branchScope.js'

const router = Router()
router.use(authRequired)

function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function money(n) {
  return Number(n || 0)
}

function userNames(req) {
  const u = req.user || {}
  return [...new Set([
    String(u.username || '').trim(),
    String(u.name || '').trim(),
  ].filter(Boolean))]
}

function userMatch(req) {
  const id = String(req.user?.id || req.user?._id || '').trim()
  const names = userNames(req)
  const or = []
  if (id) {
    or.push({ userId: id }, { paidByUserId: id }, { createdBy: id })
  }
  for (const n of names) {
    or.push(
      { userName: n },
      { paidBy: n },
      { createdByName: n },
      { 'detail.userName': n },
    )
  }
  return or.length ? { $or: or } : { userId: '__none__' }
}

function line({ at, type, title, amount = 0, meta = {}, direction = 'neutral' }) {
  return {
    at: at ? new Date(at).toISOString() : null,
    type,
    title,
    amount: money(amount),
    direction, // in | out | neutral
    meta,
  }
}

/**
 * GET /api/my-shift?date=YYYY-MM-DD
 * Full-day activity for the logged-in user from opening through close.
 */
router.get('/', async (req, res, next) => {
  try {
    const date = String(req.query.date || '').slice(0, 10) || todayStr()
    const bf = branchFilter(req)
    const um = userMatch(req)
    const uid = String(req.user?.id || '').trim()
    const names = userNames(req)

    const [
      openings,
      closes,
      sales,
      payMoves,
      expenses,
      cashCounts,
      voids,
      kots,
      warehousePayments,
      supplies,
      audits,
    ] = await Promise.all([
      CashOpening.find({ date, ...bf }).sort({ createdAt: 1 }).lean(),
      DayClose.find({ date, ...bf }).sort({ createdAt: 1 }).lean(),
      Sale.find({ date, ...bf, ...um }).sort({ createdAt: 1 }).lean(),
      PayInOut.find({ date, ...bf, ...um }).sort({ createdAt: 1 }).lean(),
      Expense.find({ date, ...bf, ...um }).sort({ createdAt: 1 }).lean(),
      CashCount.find({ date, ...bf, ...um }).sort({ createdAt: 1 }).lean(),
      Void.find({
        ...bf,
        ...um,
        createdAt: {
          $gte: new Date(`${date}T00:00:00.000Z`),
          $lte: new Date(`${date}T23:59:59.999Z`),
        },
      }).sort({ createdAt: 1 }).lean().catch(() => []),
      Kot.find({
        ...bf,
        $and: [
          um,
          {
            $or: [
              { date },
              {
                createdAt: {
                  $gte: new Date(`${date}T00:00:00.000Z`),
                  $lte: new Date(`${date}T23:59:59.999Z`),
                },
              },
            ],
          },
        ],
      }).sort({ createdAt: 1 }).lean().catch(() => []),
      WarehousePayment.find({ date, ...um }).sort({ createdAt: 1 }).lean().catch(() => []),
      Supply.find({ date, ...bf }).sort({ createdAt: 1 }).lean().catch(() => []),
      Audit.find({
        ...(uid ? { userId: uid } : { userName: { $in: names.length ? names : ['__none__'] } }),
        createdAt: {
          $gte: new Date(`${date}T00:00:00.000Z`),
          $lte: new Date(`${date}T23:59:59.999Z`),
        },
      }).sort({ createdAt: 1 }).limit(300).lean().catch(() => []),
    ])

    const voidsDay = voids || []
    const kotsDay = kots || []

    const myOpening = (openings || []).find(o =>
      (uid && String(o.userId) === uid) || names.includes(String(o.userName || ''))
    ) || openings?.[0] || null
    const myClose = (closes || []).find(c =>
      (uid && String(c.userId) === uid) || names.includes(String(c.userName || ''))
    ) || closes?.[0] || null

    const activity = []

    for (const o of openings || []) {
      const mine = (uid && String(o.userId) === uid) || names.includes(String(o.userName || ''))
      activity.push(line({
        at: o.createdAt || `${date}T00:00:00`,
        type: 'opening',
        title: mine ? 'Shift opening (you)' : `Day opening (${o.userName || 'branch'})`,
        amount: o.openingCash,
        direction: 'in',
        meta: { id: o._id, mine, note: o.note || '' },
      }))
    }

    for (const s of sales || []) {
      const pm = String(s.paymentMethod || 'cash')
      activity.push(line({
        at: s.createdAt,
        type: 'sale',
        title: `Sale #${s.tokenNo || s.billNo || String(s._id).slice(-6)} · ${pm}`,
        amount: s.total ?? s.totalAmount,
        direction: 'in',
        meta: {
          id: s._id,
          tokenNo: s.tokenNo,
          billNo: s.billNo,
          orderType: s.orderType,
          paymentMethod: pm,
          items: Array.isArray(s.items) ? s.items.length : 0,
        },
      }))
    }

    for (const p of payMoves || []) {
      const isIn = String(p.type || '').toUpperCase() === 'IN'
      activity.push(line({
        at: p.createdAt,
        type: isIn ? 'pay_in' : 'pay_out',
        title: `${isIn ? 'Pay In' : 'Pay Out'}${p.category ? ` · ${p.category}` : ''}${p.note ? ` — ${p.note}` : ''}`,
        amount: p.amount,
        direction: isIn ? 'in' : 'out',
        meta: { id: p._id, category: p.category, note: p.note },
      }))
    }

    for (const e of expenses || []) {
      activity.push(line({
        at: e.createdAt,
        type: 'expense',
        title: `Expense · ${e.expenseHead || e.category || 'General'}${e.description ? ` — ${e.description}` : ''}`,
        amount: e.amount,
        direction: 'out',
        meta: {
          id: e._id,
          paymentMethod: e.paymentMethod,
          accountHead: e.accountHead,
          paidBy: e.paidBy || e.userName,
        },
      }))
    }

    for (const wp of warehousePayments || []) {
      activity.push(line({
        at: wp.createdAt,
        type: 'supplier_payment',
        title: `Supplier payment · ${wp.supplierName || wp.supplierId || 'Supplier'}`,
        amount: wp.amount,
        direction: 'out',
        meta: { id: wp._id, method: wp.method, reference: wp.reference, notes: wp.notes },
      }))
    }

    // Supplies recorded today on this branch (no per-user field — show when current user appears in audit)
    const supplyIdsFromAudit = new Set(
      (audits || [])
        .filter(a => /supply|purchase/i.test(String(a.action || a.type || '')))
        .map(a => String(a.meta?.id || ''))
        .filter(Boolean)
    )
    for (const s of supplies || []) {
      const id = String(s._id)
      if (supplyIdsFromAudit.size && !supplyIdsFromAudit.has(id)) continue
      if (!supplyIdsFromAudit.size) continue // only show if we can attribute via audit
      activity.push(line({
        at: s.createdAt,
        type: 'supply',
        title: `Purchase · ${s.supplier || 'Supplier'}`,
        amount: s.cost,
        direction: 'out',
        meta: { id: s._id, items: Array.isArray(s.items) ? s.items.length : 0 },
      }))
    }

    for (const v of voidsDay) {
      activity.push(line({
        at: v.createdAt,
        type: 'void',
        title: `Void${v.reason ? ` — ${v.reason}` : ''}`,
        amount: v.total || v.amount || 0,
        direction: 'neutral',
        meta: { id: v._id },
      }))
    }

    for (const k of kotsDay) {
      activity.push(line({
        at: k.createdAt,
        type: 'kot',
        title: `KOT${k.tokenNo ? ` #${k.tokenNo}` : ''}${k.tableNo ? ` · Table ${k.tableNo}` : ''}`,
        amount: 0,
        direction: 'neutral',
        meta: { id: k._id, status: k.status, orderType: k.orderType },
      }))
    }

    for (const c of cashCounts || []) {
      activity.push(line({
        at: c.createdAt,
        type: 'cash_count',
        title: 'Manager cash count',
        amount: c.counted || c.total || c.amount || 0,
        direction: 'neutral',
        meta: { id: c._id },
      }))
    }

    for (const c of closes || []) {
      const mine = (uid && String(c.userId) === uid) || names.includes(String(c.userName || ''))
      activity.push(line({
        at: c.createdAt || `${date}T23:59:59`,
        type: 'closing',
        title: mine ? 'Shift closing (you)' : `Day close (${c.userName || 'branch'})`,
        amount: c.closingCash ?? c.expectedCash ?? c.leftAtCounter ?? 0,
        direction: 'neutral',
        meta: {
          id: c._id,
          mine,
          expectedCash: c.expectedCash,
          countedCash: c.countedCash ?? c.closingCash,
          leftAtCounter: c.leftAtCounter,
        },
      }))
    }

    activity.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')))

    const saleAmt = (x) => money(x.total ?? x.totalAmount)
    const isFoodpanda = (x) => {
      const t = String(x.orderType || '').trim().toLowerCase()
      return t === 'foodpanda' || t === 'food panda' || t === 'drive-thru' || t === 'drivethru'
    }
    const pm = (x) => String(x.paymentMethod || 'cash').toLowerCase()

    const cashSalesRows = (sales || []).filter(x => pm(x) === 'cash' && !isFoodpanda(x))
    const cardSalesRows = (sales || []).filter(x => pm(x) === 'card')
    const bankSalesRows = (sales || []).filter(x => pm(x) === 'bank' || pm(x) === 'online')
    const foodpandaSalesRows = (sales || []).filter(isFoodpanda)
    const staffSalesRows = (sales || []).filter(x => pm(x) === 'staff' || pm(x) === 'complimentary' || pm(x) === 'personal')

    const sumRows = (rows) => rows.reduce((s, x) => s + saleAmt(x), 0)
    const salesTotal = (sales || []).reduce((s, x) => s + saleAmt(x), 0)
    const salesCash = sumRows(cashSalesRows)
    const salesCard = sumRows(cardSalesRows)
    const salesBank = sumRows(bankSalesRows)
    const salesFoodpanda = sumRows(foodpandaSalesRows)
    const salesStaff = sumRows(staffSalesRows)

    const payInRows = (payMoves || []).filter(p => String(p.type).toUpperCase() === 'IN')
    const payOutRows = (payMoves || []).filter(p => String(p.type).toUpperCase() === 'OUT')
    const payIn = payInRows.reduce((s, p) => s + money(p.amount), 0)
    const payOut = payOutRows.reduce((s, p) => s + money(p.amount), 0)
    // My Day "Expenses" = Pay Out from Pay In/Out page (not Expenses module)
    const expensesFromPayOut = payOut
    const supplierPayTotal = (warehousePayments || []).reduce((s, p) => s + money(p.amount), 0)
    const openingCash = money(myOpening?.openingCash)
    const expectedDrawer = openingCash + salesCash + payIn - payOut

    const mapSale = (s) => ({
      id: String(s._id || ''),
      at: s.createdAt,
      tokenNo: s.tokenNo || '',
      billNo: s.billNo || '',
      orderType: s.orderType || '',
      paymentMethod: s.paymentMethod || 'cash',
      total: saleAmt(s),
      items: Array.isArray(s.items) ? s.items.length : 0,
      staffName: s.staffName || s.waiter || '',
      staffId: s.staffId || s.waiterId || '',
    })

    const mapPay = (p) => ({
      id: String(p._id || ''),
      at: p.createdAt,
      type: String(p.type || '').toUpperCase(),
      amount: money(p.amount),
      category: p.category || '',
      note: p.note || '',
      userName: p.userName || '',
    })

    res.json({
      date,
      branchId: resolveBranchId(req) || '',
      user: {
        id: uid,
        username: req.user?.username || '',
        name: req.user?.name || req.user?.username || '',
      },
      opening: myOpening,
      closing: myClose,
      dayOpen: Boolean(openings?.length),
      dayClosed: Boolean(closes?.length),
      summary: {
        openingCash,
        salesCount: (sales || []).length,
        salesTotal,
        salesCash,
        salesCard,
        salesBank,
        salesFoodpanda,
        salesStaff,
        payIn,
        payOut,
        expenses: expensesFromPayOut,
        expensesAll: expensesFromPayOut,
        supplierPayments: supplierPayTotal,
        voids: voidsDay.length,
        kots: kotsDay.length,
        expectedDrawer,
      },
      // Structured tables for UI / print (omit empty on client)
      tables: {
        openings: (openings || []).map(o => ({
          id: String(o._id || ''),
          at: o.createdAt,
          openingCash: money(o.openingCash),
          userName: o.userName || '',
          note: o.note || '',
        })),
        sales: (sales || []).map(mapSale),
        cashSales: cashSalesRows.map(mapSale),
        cardSales: cardSalesRows.map(mapSale),
        bankSales: bankSalesRows.map(mapSale),
        foodpandaSales: foodpandaSalesRows.map(mapSale),
        staffSales: staffSalesRows.map(mapSale),
        payIn: payInRows.map(mapPay),
        payOut: payOutRows.map(mapPay),
        // Alias: expenses on My Day = pay-out entries
        expenses: payOutRows.map(mapPay),
        payInOut: (payMoves || []).map(mapPay),
        supplierPayments: (warehousePayments || []).map(p => ({
          id: String(p._id || ''),
          at: p.createdAt,
          amount: money(p.amount),
          supplierName: p.supplierName || p.supplierId || '',
          method: p.method || '',
          reference: p.reference || '',
          notes: p.notes || '',
        })),
      },
      activity,
      counts: {
        openings: (openings || []).length,
        sales: (sales || []).length,
        payInOut: (payMoves || []).length,
        expenses: (expenses || []).length,
        supplierPayments: (warehousePayments || []).length,
        voids: voidsDay.length,
        kots: kotsDay.length,
        closings: (closes || []).length,
      },
    })
  } catch (e) { next(e) }
})

export default router
