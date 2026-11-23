import {
  aggregateCustomerSales,
  digitsPhone,
  saleMatchesCustomer,
  saleNetSpent,
} from '../../customers/customerLedgerUtils.js'
import {
  emptyResult, filterSales, fetchSalesRange, fetchAllCustomers, fetchJson, fmtMoney, money, saleTotal, saleDiscount,
} from './common.js'

function menuName(menuById, it) {
  return menuById.get(String(it.itemId))?.name || it.name || it.custom?.name || it.itemId || 'Item'
}

function lineQty(it) {
  return Math.max(0, Number(it.qty || 0))
}

function lineAmt(it, menuById) {
  if (it?.mods?.underDeal || it?.mods?.dealGroupId) return 0
  const unit = Number(it.price ?? it.custom?.price ?? menuById.get(String(it.itemId))?.price ?? 0)
  return unit * lineQty(it)
}

function recipeCost(menuItem, qty, ingredientsByName) {
  const recipe = menuItem?.recipe
  if (!recipe || typeof recipe !== 'object') return 0
  let cost = 0
  for (const [name, amt] of Object.entries(recipe)) {
    const ing = ingredientsByName.get(String(name).trim().toLowerCase())
    const unitCost = Number(ing?.costPrice ?? ing?.price ?? ing?.purchasePrice ?? 0)
    cost += unitCost * Number(amt || 0) * Number(qty || 0)
  }
  return cost
}

function mapToRows(map, columns) {
  return [...map.entries()].map(([key, v]) => columns(key, v))
}

function resolveBranchName(sale, branchById) {
  const named = String(sale?.branchName || '').trim()
  if (named) return named
  const id = String(sale?.branchId || '').trim()
  if (id && branchById.has(id)) {
    const b = branchById.get(id)
    return b?.name || b?.code || id
  }
  return id || 'Default'
}

export async function runSalesReport({ type, from, to, API, token, state, customerId, branches = [] }) {
  const menu = state.menu || []
  const menuById = new Map(menu.map(m => [String(m.id), m]))
  const ingredientsByName = new Map((state.ingredients || []).map(i => [String(i.name || '').trim().toLowerCase(), i]))
  const staffById = new Map((state.staff || []).map(s => [String(s.id || s._id), s]))
  let customers = state.customers || []

  let branchList = Array.isArray(branches) ? branches : []
  if (!branchList.length) {
    try {
      const data = await fetchJson(API, '/api/branches', token)
      branchList = Array.isArray(data) ? data : (data?.rows || data?.data || [])
    } catch {
      branchList = []
    }
  }
  const branchById = new Map(
    branchList.map(b => [String(b._id || b.id || ''), b]).filter(([id]) => id),
  )

  let sales = []
  try {
    sales = await fetchSalesRange(API, token, from, to)
  } catch {
    sales = filterSales(state.sales || [], from, to)
  }

  switch (type) {
    case 'item_wise': {
      const map = new Map()
      for (const s of sales) {
        for (const it of (s.items || [])) {
          if (it?.mods?.pizzaFlavour && !it?.mods?.dealGroupId) continue
          const id = String(it.itemId || it.custom?.name || 'custom')
          const name = menuName(menuById, it)
          const row = map.get(id) || { name, qty: 0, amount: 0 }
          row.qty += lineQty(it)
          row.amount += lineAmt(it, menuById) || (saleTotal(s) * 0) // deals priced at package level separately
          map.set(id, row)
        }
      }
      // Add package deals as named category lines already in deals report; item lines under deal have 0 amount
      {
        const rows = mapToRows(map, (_, v) => [v.name, v.qty, fmtMoney(v.amount)])
        const qty = [...map.values()].reduce((a, v) => a + Number(v.qty || 0), 0)
        const amount = [...map.values()].reduce((a, v) => a + Number(v.amount || 0), 0)
        return {
          headers: ['Item', 'Qty', 'Amount (PKR)'],
          rows,
          summary: [
            { label: 'Items', amount: String(map.size) },
            { label: 'Total Qty', amount: String(qty) },
            { label: 'Total Amount', amount: fmtMoney(amount) },
          ],
        }
      }
    }
    case 'item_details': {
      const rows = []
      for (const s of sales) {
        for (const it of (s.items || [])) {
          rows.push([
            s.date || '',
            s.billNo || '',
            s.tokenNo || '',
            menuName(menuById, it),
            lineQty(it),
            s.orderType || '',
            String(s.paymentMethod || ''),
            fmtMoney(lineAmt(it, menuById) || (it?.mods?.dealGroupId ? 0 : lineAmt(it, menuById))),
          ])
        }
      }
      {
        const qty = rows.reduce((a, r) => a + Number(r[4] || 0), 0)
        const amount = rows.reduce((a, r) => a + (Number(String(r[7]).replace(/,/g, '')) || 0), 0)
        return {
          headers: ['Date', 'Bill #', 'Token', 'Item', 'Qty', 'Type', 'Payment', 'Amount'],
          rows,
          summary: [
            { label: 'Lines', amount: String(rows.length) },
            { label: 'Total Qty', amount: String(qty) },
            { label: 'Total Amount', amount: fmtMoney(amount) },
          ],
        }
      }
    }
    case 'category_wise': {
      const map = new Map()
      for (const s of sales) {
        for (const it of (s.items || [])) {
          const m = menuById.get(String(it.itemId))
          const cat = m?.category || it.custom?.category || 'Uncategorized'
          const row = map.get(cat) || { qty: 0, amount: 0 }
          row.qty += lineQty(it)
          row.amount += lineAmt(it, menuById)
          map.set(cat, row)
        }
        // package deals: charge once per deal group into deal category name
        const seen = new Set()
        for (const it of (s.items || [])) {
          const gid = it?.mods?.dealGroupId
          if (!gid || seen.has(gid)) continue
          seen.add(gid)
          const cat = it.mods.dealCategoryName || it.custom?.category || 'Deals'
          const pkg = Number(it.custom?.categoryPrice || 0) * Math.max(1, Number(it.mods?.dealQty || 1))
          const row = map.get(cat) || { qty: 0, amount: 0 }
          row.qty += Math.max(1, Number(it.mods?.dealQty || 1))
          row.amount += pkg
          map.set(cat, row)
        }
      }
      {
        const amount = [...map.values()].reduce((a, v) => a + Number(v.amount || 0), 0)
        const qty = [...map.values()].reduce((a, v) => a + Number(v.qty || 0), 0)
        return {
          headers: ['Category', 'Qty', 'Amount (PKR)'],
          rows: mapToRows(map, (k, v) => [k, v.qty, fmtMoney(v.amount)]),
          summary: [
            { label: 'Categories', amount: String(map.size) },
            { label: 'Total Qty', amount: String(qty) },
            { label: 'Total Amount', amount: fmtMoney(amount) },
          ],
        }
      }
    }
    case 'branch_wise': {
      const map = new Map()
      for (const s of sales) {
        const name = resolveBranchName(s, branchById)
        const row = map.get(name) || { count: 0, amount: 0 }
        row.count += 1
        row.amount += saleTotal(s)
        map.set(name, row)
      }
      return {
        headers: ['Branch', 'Bills', 'Amount (PKR)'],
        rows: mapToRows(map, (k, v) => [k, v.count, fmtMoney(v.amount)]),
        summary: [{ label: 'Branches', amount: String(map.size) }],
      }
    }
    case 'transaction': {
      const rows = sales.map(s => [
        s.date || '',
        s.billNo || '',
        s.tokenNo || '',
        s.orderType || '',
        String(s.paymentMethod || ''),
        s.customer?.name || '',
        fmtMoney(saleTotal(s)),
      ])
      const total = sales.reduce((a, s) => a + saleTotal(s), 0)
      return {
        headers: ['Date', 'Bill #', 'Token', 'Type', 'Payment', 'Customer', 'Total'],
        rows,
        summary: [{ label: 'Bills', amount: String(rows.length) }, { label: 'Total', amount: fmtMoney(total) }],
      }
    }
    case 'customer_wise': {
      const map = new Map()
      for (const s of sales) {
        const key = s.customer?.id
          || digitsPhone(s.customer?.phone)
          || (s.customer?.name ? `nm:${String(s.customer.name).toLowerCase()}` : '')
          || 'walk-in'
        const label = s.customer?.name || s.customer?.phone || 'Walk-in'
        const row = map.get(key) || { name: label, phone: s.customer?.phone || '', visits: 0, spent: 0 }
        row.visits += 1
        row.spent += saleNetSpent(s)
        map.set(key, row)
      }
      return {
        headers: ['Customer', 'Phone', 'Visits', 'Spent (PKR)'],
        rows: mapToRows(map, (_, v) => [v.name, v.phone, v.visits, fmtMoney(v.spent)]),
        summary: [{ label: 'Customers', amount: String(map.size) }],
      }
    }
    case 'customer_ledger': {
      try {
        const full = await fetchAllCustomers(API, token)
        if (full.length) customers = full
      } catch {
        // fall back to hydrated state.customers
      }

      const selectedId = String(customerId || '').trim()
      const cust = selectedId
        ? customers.find(c => String(c.id || c._id) === selectedId)
        : null

      // No customer selected → list everyone; click a row in the UI to open ledger
      if (!cust) {
        const agg = aggregateCustomerSales(sales, customers)
        const sorted = [...customers].sort((a, b) =>
          String(a.name || a.phone || '').localeCompare(String(b.name || b.phone || ''), undefined, { sensitivity: 'base' }),
        )
        const rows = sorted.map((c) => {
          const id = String(c.id || c._id || '')
          const a = agg[id] || { visits: 0, spent: 0 }
          return [c.name || '—', c.phone || '', a.visits, fmtMoney(a.spent)]
        })
        return {
          headers: ['Customer', 'Phone', 'Visits', 'Spent (PKR)'],
          rows,
          rowMeta: sorted.map(c => ({ customerId: String(c.id || c._id || '') })),
          interactive: 'customer_pick',
          summary: [{ label: 'Customers', amount: String(rows.length) }],
        }
      }

      const rows = sales
        .filter(s => saleMatchesCustomer(s, cust))
        .map(s => [
          s.date || '',
          s.billNo || '',
          s.tokenNo || '',
          s.orderType || '',
          String(s.paymentMethod || ''),
          fmtMoney(saleNetSpent(s)),
        ])
      const spent = rows.reduce((a, r) => a + money(String(r[5]).replace(/,/g, '')), 0)
      return {
        headers: ['Date', 'Bill #', 'Token', 'Type', 'Payment', 'Amount'],
        rows,
        interactive: 'customer_ledger',
        selectedCustomerId: String(cust.id || cust._id || ''),
        selectedCustomerName: cust.name || cust.phone || 'Customer',
        summary: [
          { label: 'Customer', amount: cust.name || '' },
          { label: 'Visits', amount: String(rows.length) },
          { label: 'Spent', amount: fmtMoney(spent) },
        ],
      }
    }
    case 'discount': {
      const rows = sales
        .filter(s => saleDiscount(s) > 0)
        .map(s => [
          s.date || '',
          s.billNo || '',
          s.tokenNo || '',
          fmtMoney(saleDiscount(s)),
          fmtMoney(saleTotal(s)),
        ])
      return {
        headers: ['Date', 'Bill #', 'Token', 'Discount', 'Total'],
        rows,
        summary: [{ label: 'Discounted bills', amount: String(rows.length) }],
      }
    }
    case 'complimentary': {
      const rows = sales
        .filter(s => String(s.paymentMethod || '').toLowerCase() === 'complimentary')
        .map(s => [s.date || '', s.billNo || '', s.tokenNo || '', s.customer?.name || '', fmtMoney(saleTotal(s))])
      return {
        headers: ['Date', 'Bill #', 'Token', 'Customer', 'Amount'],
        rows,
        summary: [{ label: 'Complimentary', amount: String(rows.length) }],
      }
    }
    case 'waiter': {
      const map = new Map()
      for (const s of sales) {
        const id = String(s.waiterId || '')
        const name = s.waiterName || staffById.get(id)?.name || (id ? id : '—')
        const row = map.get(name) || { bills: 0, amount: 0 }
        row.bills += 1
        row.amount += saleTotal(s)
        map.set(name, row)
      }
      return {
        headers: ['Waiter', 'Bills', 'Amount (PKR)'],
        rows: mapToRows(map, (k, v) => [k, v.bills, fmtMoney(v.amount)]),
        summary: [{ label: 'Waiters', amount: String(map.size) }],
      }
    }
    case 'user_wise': {
      const map = new Map()
      for (const s of sales) {
        const name = s.userName || s.userId || '—'
        const row = map.get(name) || { bills: 0, amount: 0 }
        row.bills += 1
        row.amount += saleTotal(s)
        map.set(name, row)
      }
      return {
        headers: ['User', 'Bills', 'Amount (PKR)'],
        rows: mapToRows(map, (k, v) => [k, v.bills, fmtMoney(v.amount)]),
        summary: [{ label: 'Users', amount: String(map.size) }],
      }
    }
    case 'user_item': {
      const map = new Map()
      for (const s of sales) {
        const user = s.userName || s.userId || '—'
        for (const it of (s.items || [])) {
          const item = menuName(menuById, it)
          const key = `${user}||${item}`
          const row = map.get(key) || { user, item, qty: 0 }
          row.qty += lineQty(it)
          map.set(key, row)
        }
      }
      return {
        headers: ['User', 'Item', 'Qty'],
        rows: mapToRows(map, (_, v) => [v.user, v.item, v.qty]),
        summary: [{ label: 'Rows', amount: String(map.size) }],
      }
    }
    case 'payment_mode': {
      const map = new Map()
      for (const s of sales) {
        let key = String(s.paymentMethod || 'cash').toLowerCase()
        if (key === 'bank' && s.bankChannel) key = `bank:${s.bankChannel}`
        const row = map.get(key) || { bills: 0, amount: 0 }
        row.bills += 1
        row.amount += saleTotal(s)
        map.set(key, row)
      }
      return {
        headers: ['Payment', 'Bills', 'Amount (PKR)'],
        rows: mapToRows(map, (k, v) => [k.toUpperCase(), v.bills, fmtMoney(v.amount)]),
        summary: [{ label: 'Modes', amount: String(map.size) }],
      }
    }
    case 'invoice_type': {
      const map = new Map()
      for (const s of sales) {
        const t = s.orderType || '—'
        const row = map.get(t) || { bills: 0, amount: 0 }
        row.bills += 1
        row.amount += saleTotal(s)
        map.set(t, row)
      }
      return {
        headers: ['Order Type', 'Bills', 'Amount (PKR)'],
        rows: mapToRows(map, (k, v) => [k, v.bills, fmtMoney(v.amount)]),
        summary: [{ label: 'Types', amount: String(map.size) }],
      }
    }
    case 'hourly': {
      const map = new Map()
      for (const s of sales) {
        const ts = Number(s.createdAt) || Date.parse(s.createdAt) || 0
        const hour = ts ? new Date(ts).getHours() : 0
        const h12 = hour % 12 || 12
        const label = `${h12}:00 ${hour < 12 ? 'AM' : 'PM'}`
        const row = map.get(hour) || { label, bills: 0, amount: 0 }
        row.bills += 1
        row.amount += saleTotal(s)
        map.set(hour, row)
      }
      const rows = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => [v.label, v.bills, fmtMoney(v.amount)])
      return { headers: ['Hour', 'Bills', 'Amount (PKR)'], rows, summary: [{ label: 'Hours', amount: String(rows.length) }] }
    }
    case 'deals': {
      const map = new Map()
      for (const s of sales) {
        const seen = new Set()
        for (const it of (s.items || [])) {
          const gid = it?.mods?.dealGroupId
          if (!gid || seen.has(gid)) continue
          seen.add(gid)
          const name = it.mods.dealCategoryName || it.custom?.category || 'Deal'
          const qty = Math.max(1, Number(it.mods?.dealQty || 1))
          const pkg = Number(it.custom?.categoryPrice || 0) * qty
          const row = map.get(name) || { qty: 0, amount: 0 }
          row.qty += qty
          row.amount += pkg
          map.set(name, row)
        }
      }
      return {
        headers: ['Deal', 'Qty', 'Amount (PKR)'],
        rows: mapToRows(map, (k, v) => [k, v.qty, fmtMoney(v.amount)]),
        summary: [{ label: 'Deal types', amount: String(map.size) }],
      }
    }
    case 'cancellation': {
      let voids = []
      let deleted = []
      try {
        const [vRes, dRes] = await Promise.all([
          fetchJson(API, `/api/voids?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, token).catch(() => []),
          fetchJson(API, `/api/sales/deleted?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, token).catch(() => []),
        ])
        voids = Array.isArray(vRes) ? vRes : (vRes?.rows || [])
        deleted = Array.isArray(dRes) ? dRes : (dRes?.rows || [])
      } catch {}
      const rows = [
        ...voids.map(v => [v.date || '', 'VOID', v.tokenNo || '', v.reason || '', fmtMoney(v.total || 0)]),
        ...deleted.map(d => [d.date || '', 'DELETED', d.tokenNo || d.billNo || '', d.reason || '', fmtMoney(d.total || 0)]),
      ]
      return {
        headers: ['Date', 'Kind', 'Token/Bill', 'Reason', 'Amount'],
        rows,
        summary: [{ label: 'Cancelled', amount: String(rows.length) }],
      }
    }
    case 'sales_summary': {
      const total = sales.reduce((a, s) => a + saleTotal(s), 0)
      const disc = sales.reduce((a, s) => a + saleDiscount(s), 0)
      const qty = sales.reduce((a, s) => a + (s.items || []).reduce((x, it) => x + lineQty(it), 0), 0)
      return {
        headers: ['Metric', 'Value'],
        rows: [
          ['Bills', String(sales.length)],
          ['Items qty', String(qty)],
          ['Gross / Total (PKR)', fmtMoney(total)],
          ['Discount (PKR)', fmtMoney(disc)],
          ['Avg bill (PKR)', fmtMoney(sales.length ? total / sales.length : 0)],
        ],
        summary: [{ label: 'Bills', amount: String(sales.length) }, { label: 'Total', amount: fmtMoney(total) }],
      }
    }
    case 'gross_profit': {
      let revenue = 0
      let cogs = 0
      for (const s of sales) {
        revenue += saleTotal(s)
        for (const it of (s.items || [])) {
          const m = menuById.get(String(it.itemId))
          cogs += recipeCost(m, lineQty(it), ingredientsByName)
        }
      }
      return {
        headers: ['Metric', 'Amount (PKR)'],
        rows: [
          ['Revenue', fmtMoney(revenue)],
          ['Recipe COGS', fmtMoney(cogs)],
          ['Gross Profit', fmtMoney(revenue - cogs)],
        ],
        summary: [{ label: 'Gross Profit', amount: fmtMoney(revenue - cogs) }],
      }
    }
    case 'pnl': {
      let salesAmt = 0
      let expenses = 0
      try {
        const exp = await fetchJson(API, `/api/expenses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, token).catch(() => [])
        const list = Array.isArray(exp) ? exp : (exp?.rows || [])
        expenses = list.reduce((a, e) => a + money(e.amount), 0)
      } catch {
        expenses = (state.expenses || []).filter(e => e.date >= from && e.date <= to).reduce((a, e) => a + money(e.amount), 0)
      }
      salesAmt = sales.reduce((a, s) => a + saleTotal(s), 0)
      return {
        headers: ['Metric', 'Amount (PKR)'],
        rows: [
          ['Sales', fmtMoney(salesAmt)],
          ['Expenses', fmtMoney(expenses)],
          ['Net (Sales − Expenses)', fmtMoney(salesAmt - expenses)],
        ],
        summary: [{ label: 'Net', amount: fmtMoney(salesAmt - expenses) }],
      }
    }
    case 'rider': {
      const map = new Map()
      for (const s of sales) {
        if (String(s.orderType || '') !== 'Delivery' && !s.riderId && !s.riderName) continue
        const name = s.riderName || s.riderId || '—'
        const row = map.get(name) || { bills: 0, amount: 0 }
        row.bills += 1
        row.amount += saleTotal(s)
        map.set(name, row)
      }
      return {
        headers: ['Rider', 'Deliveries', 'Amount (PKR)'],
        rows: mapToRows(map, (k, v) => [k, v.bills, fmtMoney(v.amount)]),
        summary: [{ label: 'Riders', amount: String(map.size) }],
      }
    }
    case 'shift_closing': {
      let closes = []
      try {
        const data = await fetchJson(API, `/api/day-closes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, token)
        closes = Array.isArray(data) ? data : (data?.rows || data?.data || [])
      } catch {
        closes = (state.dayCloses || []).filter(d => d.date >= from && d.date <= to)
      }
      const rows = closes.map(d => [
        d.date || '',
        fmtMoney(d.openingCash || d.opening || 0),
        fmtMoney(d.closingCash || d.closing || d.cashLeft || 0),
        fmtMoney(d.handoverAmt || 0),
        d.userName || d.closedBy || '',
        d.note || '',
      ])
      return {
        headers: ['Date', 'Opening', 'Closing', 'Handover', 'User', 'Note'],
        rows,
        summary: [{ label: 'Closes', amount: String(rows.length) }],
      }
    }
    default:
      return emptyResult(['Info'])
  }
}
