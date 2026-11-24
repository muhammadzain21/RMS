import { emptyResult, fetchJson, fmtMoney, money, inDateRange } from '@features/reports/utils/reportCommon.js'

function mapToRows(map, columns) {
  return [...map.entries()].map(([key, v]) => columns(key, v))
}

function stockRows(ingredients) {
  return (ingredients || []).map(i => [
    i.name || '',
    i.category || '',
    i.unit || '',
    Number(i.qty ?? i.stock ?? 0),
    fmtMoney(i.costPrice ?? i.price ?? i.purchasePrice ?? 0),
    fmtMoney(Number(i.qty ?? i.stock ?? 0) * Number(i.costPrice ?? i.price ?? i.purchasePrice ?? 0)),
  ])
}

export async function runInventoryReport({ type, from, to, API, token, state, supplierId }) {
  const ingredients = state.ingredients || []
  const suppliers = state.suppliers || []
  const supplierById = new Map(suppliers.map(s => [String(s.id || s._id), s]))

  let supplies = []
  try {
    const data = await fetchJson(API, `/api/supplies?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, token)
    supplies = Array.isArray(data) ? data : (data?.rows || [])
  } catch {
    supplies = (state.supplies || []).filter(s => inDateRange(s.date, from, to))
  }

  switch (type) {
    case 'stock': {
      const rows = stockRows(ingredients).map(r => [r[0], r[1], r[2], r[3], r[4]])
      const qty = rows.reduce((a, r) => a + Number(r[3] || 0), 0)
      return {
        headers: ['Item', 'Category', 'Unit', 'Qty', 'Unit Cost'],
        rows,
        summary: [
          { label: 'Items', amount: String(rows.length) },
          { label: 'Total Qty', amount: String(qty) },
        ],
      }
    }
    case 'stock_valuation': {
      const rows = stockRows(ingredients)
      const total = rows.reduce((a, r) => a + money(String(r[5]).replace(/,/g, '')), 0)
      return {
        headers: ['Item', 'Category', 'Unit', 'Qty', 'Unit Cost', 'Value (PKR)'],
        rows,
        summary: [{ label: 'Stock value', amount: fmtMoney(total) }],
      }
    }
    case 'closing_stock': {
      let snap = null
      try {
        snap = await fetchJson(API, `/api/inventory-snapshots?date=${encodeURIComponent(to)}`, token)
      } catch {}
      const items = snap?.items || ingredients.map(i => ({
        name: i.name,
        qty: Number(i.qty ?? i.stock ?? 0),
        unit: i.unit || '',
        cost: Number(i.costPrice ?? i.price ?? 0),
      }))
      const rows = items.map(it => [
        it.name || '',
        it.unit || '',
        Number(it.qty || 0),
        fmtMoney(it.cost ?? it.unitCost ?? 0),
        fmtMoney(Number(it.qty || 0) * Number(it.cost ?? it.unitCost ?? 0)),
      ])
      {
        const value = rows.reduce((a, r) => a + money(String(r[4]).replace(/,/g, '')), 0)
        const qty = rows.reduce((a, r) => a + Number(r[2] || 0), 0)
        return {
          headers: ['Item', 'Unit', 'Closing Qty', 'Unit Cost', 'Value'],
          rows,
          summary: [
            { label: 'As of', amount: to },
            { label: 'Items', amount: String(rows.length) },
            { label: 'Total Qty', amount: String(qty) },
            { label: 'Total Value', amount: fmtMoney(value) },
          ],
        }
      }
    }
    case 'stock_variance':
    case 'consumption_vs_physical': {
      let opening = null
      let closing = null
      let physical = {}
      try {
        const [o, c, p] = await Promise.all([
          fetchJson(API, `/api/inventory-snapshots/opening?date=${encodeURIComponent(from)}`, token).catch(() => null),
          fetchJson(API, `/api/inventory-snapshots?date=${encodeURIComponent(to)}`, token).catch(() => null),
          fetchJson(API, `/api/inventory-snapshots/physical?date=${encodeURIComponent(to)}`, token).catch(() => null),
        ])
        opening = o
        closing = c
        physical = p?.counts || {}
      } catch {}
      const openMap = new Map((opening?.items || []).map(it => [it.name, Number(it.qty || 0)]))
      const closeMap = new Map((closing?.items || []).map(it => [it.name, Number(it.qty || 0)]))
      const names = new Set([
        ...openMap.keys(),
        ...closeMap.keys(),
        ...Object.keys(physical || {}),
        ...ingredients.map(i => i.name),
      ])
      const rows = [...names].filter(Boolean).sort().map(name => {
        const open = openMap.get(name) ?? Number(ingredients.find(i => i.name === name)?.qty ?? 0)
        const close = closeMap.get(name) ?? Number(ingredients.find(i => i.name === name)?.qty ?? 0)
        const phys = physical[name] != null ? Number(physical[name]) : null
        const variance = phys != null ? phys - close : ''
        return [name, open, close, phys ?? '—', variance === '' ? '—' : variance]
      })
      return {
        headers: ['Item', 'Opening', 'System Closing', 'Physical', 'Variance'],
        rows,
        summary: [{ label: 'Items', amount: String(rows.length) }],
      }
    }
    case 'item_purchase': {
      const map = new Map()
      for (const s of supplies) {
        for (const line of (s.items || s.lines || [])) {
          const name = line.name || line.itemName || '—'
          const qty = Number(line.qty || 0)
          const amt = Number(line.total ?? (Number(line.unitCost || line.price || 0) * qty))
          const row = map.get(name) || { qty: 0, amount: 0 }
          row.qty += qty
          row.amount += amt
          map.set(name, row)
        }
      }
      return {
        headers: ['Item', 'Qty', 'Amount (PKR)'],
        rows: mapToRows(map, (k, v) => [k, v.qty, fmtMoney(v.amount)]),
        summary: [{ label: 'Items', amount: String(map.size) }],
      }
    }
    case 'supplier_purchase': {
      const map = new Map()
      for (const s of supplies) {
        const sid = String(s.supplierId || '')
        const name = s.supplier || supplierById.get(sid)?.name || sid || '—'
        const amt = Number(s.total ?? (s.items || []).reduce((a, l) => a + Number(l.total ?? Number(l.unitCost || 0) * Number(l.qty || 0)), 0))
        const row = map.get(name) || { bills: 0, amount: 0 }
        row.bills += 1
        row.amount += amt
        map.set(name, row)
      }
      return {
        headers: ['Supplier', 'Purchases', 'Amount (PKR)'],
        rows: mapToRows(map, (k, v) => [k, v.bills, fmtMoney(v.amount)]),
        summary: [{ label: 'Suppliers', amount: String(map.size) }],
      }
    }
    case 'supplier_ledger': {
      const sid = String(supplierId || '')
      if (!sid) {
        return emptyResult(['Date', 'Bill', 'Item', 'Qty', 'Amount']).rows.length === 0
          ? { headers: ['Date', 'Bill', 'Item', 'Qty', 'Amount'], rows: [], summary: [{ label: 'Note', amount: 'Select a supplier' }] }
          : emptyResult()
      }
      const rows = []
      for (const s of supplies.filter(x => String(x.supplierId || '') === sid)) {
        for (const line of (s.items || s.lines || [])) {
          rows.push([
            s.date || '',
            s.billNo || s.id || '',
            line.name || '',
            Number(line.qty || 0),
            fmtMoney(line.total ?? Number(line.unitCost || 0) * Number(line.qty || 0)),
          ])
        }
      }
      const name = supplierById.get(sid)?.name || sid
      return {
        headers: ['Date', 'Bill', 'Item', 'Qty', 'Amount'],
        rows,
        summary: [{ label: 'Supplier', amount: name }, { label: 'Lines', amount: String(rows.length) }],
      }
    }
    case 'item_transfer':
    case 'location_transfer': {
      let transfers = []
      try {
        const data = await fetchJson(API, `/api/warehouse/transfers`, token)
        transfers = Array.isArray(data) ? data : (data?.rows || [])
      } catch {}
      transfers = transfers.filter(t => {
        const d = String(t.date || (t.createdAt ? String(t.createdAt).slice(0, 10) : '')).slice(0, 10)
        return inDateRange(d, from, to)
      })
      if (type === 'item_transfer') {
        const map = new Map()
        for (const t of transfers) {
          for (const line of (t.items || [])) {
            const name = line.name || '—'
            const row = map.get(name) || { qty: 0, transfers: 0 }
            row.qty += Number(line.qty || 0)
            row.transfers += 1
            map.set(name, row)
          }
        }
        return {
          headers: ['Item', 'Transfer lines', 'Qty'],
          rows: mapToRows(map, (k, v) => [k, v.transfers, v.qty]),
          summary: [{ label: 'Items', amount: String(map.size) }],
        }
      }
      const map = new Map()
      for (const t of transfers) {
        const loc = t.toBranchName || t.toBranchId || t.fromLocation || '—'
        const row = map.get(loc) || { transfers: 0, lines: 0, qty: 0 }
        row.transfers += 1
        row.lines += (t.items || []).length
        row.qty += (t.items || []).reduce((a, l) => a + Number(l.qty || 0), 0)
        map.set(loc, row)
      }
      return {
        headers: ['Location / Branch', 'Transfers', 'Lines', 'Qty'],
        rows: mapToRows(map, (k, v) => [k, v.transfers, v.lines, v.qty]),
        summary: [{ label: 'Locations', amount: String(map.size) }],
      }
    }
    default:
      return emptyResult(['Info'])
  }
}
