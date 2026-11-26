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
      // Branch-wide day totals (same scope as expenses / opening) so widgets match the daybook
      Sale.find({ date, ...bf }).sort({ createdAt: 1 }).lean(),
      PayInOut.find({ date, ...bf }).sort({ createdAt: 1 }).lean(),
      Expense.find({ date, ...bf }).sort({ createdAt: 1 }).lean(),
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
    const tenderAmt = (sale, methods) => {
      const want = new Set((Array.isArray(methods) ? methods : [methods]).map(m => String(m).toLowerCase()))
      const pays = Array.isArray(sale?.payments) ? sale.payments : null
      if (pays?.length) {
        return pays
          .filter(p => want.has(String(p.method || '').toLowerCase()))
          .reduce((a, p) => a + Number(p.amount || 0), 0)
      }
      return want.has(pm(sale)) ? saleAmt(sale) : 0
    }
    const hasTender = (sale, methods) => tenderAmt(sale, methods) > 0

    const cashSalesRows = (sales || []).filter(x => hasTender(x, 'cash') && !isFoodpanda(x))
    const cardSalesRows = (sales || []).filter(x => hasTender(x, 'card'))
    const bankSalesRows = (sales || []).filter(x => hasTender(x, ['bank', 'online']))
    const foodpandaSalesRows = (sales || []).filter(isFoodpanda)
    const staffSalesRows = (sales || []).filter(x => hasTender(x, ['staff', 'complimentary', 'personal']))

    const sumRows = (rows) => rows.reduce((s, x) => s + saleAmt(x), 0)
    const salesTotal = (sales || []).reduce((s, x) => s + saleAmt(x), 0)
    // For split bills, sum only the matching tender amount (not full sale total)
    const salesCash = (sales || []).filter(x => !isFoodpanda(x)).reduce((s, x) => s + tenderAmt(x, 'cash'), 0)
    const salesCard = (sales || []).reduce((s, x) => s + tenderAmt(x, 'card'), 0)
    const salesBank = (sales || []).reduce((s, x) => s + tenderAmt(x, ['bank', 'online']), 0)
    const salesFoodpanda = sumRows(foodpandaSalesRows)
    const salesStaff = (sales || []).reduce((s, x) => s + tenderAmt(x, ['staff', 'complimentary', 'personal']), 0)

    const payInRows = (payMoves || []).filter(p => String(p.type).toUpperCase() === 'IN')
    const payOutRows = (payMoves || []).filter(p => String(p.type).toUpperCase() === 'OUT')
    const payIn = payInRows.reduce((s, p) => s + money(p.amount), 0)
    const isTipPayOut = (p) => /waiter\s*tip/i.test(String(p.category || '')) || /^tips?$/i.test(String(p.category || '').trim())
    const isDeliveryPayOut = (p) => /delivery\s*charges?/i.test(String(p.category || '')) || /^delivery$/i.test(String(p.category || '').trim())
    // Legacy auto tip/delivery Pay Outs — keep for history, but don't double-count vs sale fields
    const tipPayOutTotal = payOutRows.filter(isTipPayOut).reduce((s, p) => s + money(p.amount), 0)
    const deliveryPayOutTotal = payOutRows.filter(isDeliveryPayOut).reduce((s, p) => s + money(p.amount), 0)
    const manualPayOutRows = payOutRows.filter(p => !isTipPayOut(p) && !isDeliveryPayOut(p))
    const payOut = manualPayOutRows.reduce((s, p) => s + money(p.amount), 0)
    const expenseModuleRows = expenses || []
    const isCashExpense = (e) => String(e.accountHead || 'cash').toLowerCase() !== 'bank'
    const expenseModuleTotal = expenseModuleRows.reduce((s, e) => s + money(e.amount), 0)
    const expenseModulePending = expenseModuleRows.filter(e => e.status !== 'approved').length
    const expenseModuleApproved = expenseModuleRows.filter(e => e.status === 'approved').length
    // Cash expenses (approved or pending) that hit the drawer — bank expenses listed but not expected
    const expenseCashRows = expenseModuleRows.filter(isCashExpense)
    const expenseBankRows = expenseModuleRows.filter(e => !isCashExpense(e))
    const expenseCashTotal = expenseCashRows.reduce((s, e) => s + money(e.amount), 0)
    const expenseBankTotal = expenseBankRows.reduce((s, e) => s + money(e.amount), 0)
    // Prefer tip/delivery on sales; fall back to legacy Pay Out categories for older days
    const tipsFromSales = (sales || []).reduce((s, x) => s + Math.max(0, Number(x.tipAmount || 0)), 0)
    const deliveryFromSales = (sales || []).reduce(
      (s, x) => s + Math.max(0, Number(x.deliveryAmt || x.deliveryCharges || 0)),
      0,
    )
    const tipsTotal = tipsFromSales > 0 ? tipsFromSales : tipPayOutTotal
    const deliveryTotal = deliveryFromSales > 0 ? deliveryFromSales : deliveryPayOutTotal
    const supplierPayTotal = (warehousePayments || []).reduce((s, p) => s + money(p.amount), 0)
    const openingCash = money(myOpening?.openingCash)
    // Cash sales tenders may include tip; tip + delivery are utilized out of the drawer
    const expectedDrawer =
      openingCash + salesCash + payIn - payOut - expenseCashTotal - tipsTotal - deliveryTotal
    const cashCollected = openingCash + salesCash + payIn
    const cashUtilized = tipsTotal + deliveryTotal + expenseCashTotal + payOut
    const cashRemaining = expectedDrawer

    const customerText = (c) => {
      if (!c) return ''
      if (typeof c === 'string') return c
      return c.name || c.phone || ''
    }
    const paymentLabel = (s) => {
      const pays = Array.isArray(s.payments) ? s.payments.filter(p => Number(p?.amount || 0) > 0) : []
      if (pays.length > 1) {
        return pays.map(p => {
          const m = String(p.method || '').toUpperCase()
          const amt = Number(p.amount || 0)
          if (m === 'BANK') return `BANK ${amt}`
          if (m === 'CARD') return `CARD ${amt}`
          if (m === 'STAFF') return `STAFF ${amt}`
          if (m === 'FOODPANDA') return `FOODPANDA ${amt}`
          return `${m || 'PAY'} ${amt}`
        }).join(' + ')
      }
      const method = String(s.paymentMethod || 'cash').toUpperCase()
      if (method === 'BANK') {
        const ch = {
          bank_account: 'BANK ACCOUNT', jazzcash: 'JAZZCASH', easypaisa: 'EASYPAISA',
          sadapay: 'SADAPAY', nayapay: 'NAYAPAY', raast: 'RAAST', upaisa: 'UPAISA', zindigi: 'ZINDIGI',
        }[String(s.bankChannel || '').toLowerCase()] || 'TRANSFER'
        return `BANK (${ch}${s.bankLast4 ? ` ····${s.bankLast4}` : ''})`
      }
      if (method === 'CARD') return `CARD${s.bankLast4 ? ` ····${s.bankLast4}` : ''}`
      if (method === 'STAFF') return `STAFF (${s.staffName || 'Member'})`
      if (method === 'COMPLIMENTARY' || method === 'PERSONAL') return 'PERSONAL'
      if (method === 'SPLIT') return 'SPLIT'
      return method
    }
    const mapSale = (s) => {
      const orderType = s.orderType || ''
      const net = saleAmt(s)
      const saleTotal = (() => {
        const sub = Number(s.subtotal || 0)
        if (sub > 0) return sub
        return net
      })()
      return {
        id: String(s._id || ''),
        at: s.createdAt,
        date: s.date || date,
        tokenNo: s.tokenNo || '',
        billNo: s.billNo || '',
        customer: customerText(s.customer),
        orderType,
        tableNo: orderType === 'Dine-in' ? (s.tableNo || '') : '',
        waiterId: s.waiterId || '',
        waiterName: s.waiterName || s.waiter || '',
        riderId: s.riderId || '',
        riderName: s.riderName || s.rider || '',
        saleTotal,
        netAmount: net,
        total: net,
        deliveryAmt: Math.max(0, Number(s.deliveryAmt || s.deliveryCharges || 0)),
        tipAmount: Math.max(0, Number(s.tipAmount || 0)),
        paymentMethod: paymentLabel(s),
        paymentMethodRaw: s.paymentMethod || 'cash',
        payments: Array.isArray(s.payments) ? s.payments : [],
        status: 'Paid',
        deliveryDate: s.deliveryDate || s.date || date,
        items: Array.isArray(s.items) ? s.items.length : 0,
        staffName: s.staffName || s.waiter || '',
        staffId: s.staffId || s.waiterId || '',
      }
    }

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
        expenses: expenseCashTotal,
        expensesCash: expenseCashTotal,
        expensesBank: expenseBankTotal,
        expensesPending: expenseModulePending,
        expensesApproved: expenseModuleApproved,
        expensesAll: expenseModuleTotal,
        tips: tipsTotal,
        deliveryCharges: deliveryTotal,
        cashCollected,
        cashUtilized,
        cashRemaining,
        supplierPayments: supplierPayTotal,
        voids: voidsDay.length,
        kots: kotsDay.length,
        expectedDrawer,
        utilization: {
          cashCollected,
          tips: tipsTotal,
          deliveryCharges: deliveryTotal,
          cashExpenses: expenseCashTotal,
          payOut,
          remainingInDrawer: expectedDrawer,
        },
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
        // Manual pay outs only — tip/delivery shown as utilization, not Pay Out rows
        payOut: manualPayOutRows.map(mapPay),
        expenses: expenseModuleRows.map(e => {
          const lines = Array.isArray(e.lines) ? e.lines : []
          const headFromLines = [...new Set(lines.map(l => l.expenseHead).filter(Boolean))]
          const descFromLines = lines.map(l => String(l.description || '').trim()).filter(Boolean)
          const imageFromLines = lines.find(l => l?.imageUrl)?.imageUrl || ''
          const expenseHead = headFromLines.length
            ? (headFromLines.length === 1 ? headFromLines[0] : headFromLines.join(', '))
            : (e.expenseHead || e.category || '')
          const description = descFromLines.length
            ? descFromLines.join(' · ')
            : (e.description || e.note || '')
          return {
            id: String(e._id || ''),
            at: e.createdAt,
            date: e.date || date,
            amount: money(e.amount),
            category: expenseHead,
            expenseHead,
            description,
            accountHead: e.accountHead || 'cash',
            status: e.status === 'approved' ? 'approved' : 'pending',
            userName: e.userName || e.paidBy || '',
            imageUrl: e.imageUrl || imageFromLines || '',
            lines: lines.map(l => ({
              expenseHead: l.expenseHead || '',
              description: l.description || '',
              amount: money(l.amount),
              imageUrl: l.imageUrl || '',
            })),
          }
        }),
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
        expenses: expenseModuleRows.length,
        supplierPayments: (warehousePayments || []).length,
        voids: voidsDay.length,
        kots: kotsDay.length,
        closings: (closes || []).length,
      },
    })
  } catch (e) { next(e) }
})

export default router
