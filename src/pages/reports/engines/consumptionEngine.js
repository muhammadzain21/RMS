import {
  emptyResult, filterSales, fetchSalesRange, fetchJson, fmtMoney, money, saleTotal,
} from './common.js'

function lineQty(it) {
  return Math.max(0, Number(it.qty || 0))
}

function menuName(menuById, it) {
  return menuById.get(String(it.itemId))?.name || it.name || it.custom?.name || it.itemId || 'Item'
}

function ts(v) {
  if (!v) return 0
  if (typeof v === 'number') return v
  const n = Date.parse(v)
  return Number.isFinite(n) ? n : 0
}

function minsBetween(a, b) {
  const start = ts(a)
  const end = ts(b)
  if (!start || !end || end < start) return null
  return Math.round((end - start) / 60000)
}

function fmtMins(m) {
  if (m == null) return '—'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

function fmtClock(v) {
  const n = ts(v)
  if (!n) return '—'
  try {
    return new Date(n).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
  } catch {
    return '—'
  }
}

async function fetchAllKots(API, token, from, to) {
  const rows = []
  let skip = 0
  const limit = 500
  for (;;) {
    const data = await fetchJson(
      API,
      `/api/kots?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=${limit}&skip=${skip}`,
      token,
    )
    const batch = Array.isArray(data) ? data : (data?.rows || [])
    rows.push(...batch)
    if (batch.length < limit) break
    skip += limit
    if (skip > 20000) break
  }
  return rows
}

function buildConsumptionMaps(sales, menuById) {
  const itemCounts = new Map()
  const recipeCons = new Map() // ingredient -> amount
  const itemRecipe = new Map() // itemName -> Map(ing -> amt)

  for (const s of sales) {
    for (const it of (s.items || [])) {
      const qty = lineQty(it)
      const m = menuById.get(String(it.itemId))
      const name = menuName(menuById, it)
      itemCounts.set(name, (itemCounts.get(name) || 0) + qty)
      if (!m?.recipe || typeof m.recipe !== 'object') continue
      const perItem = itemRecipe.get(name) || new Map()
      for (const [ing, amt] of Object.entries(m.recipe)) {
        const use = Number(amt || 0) * qty
        recipeCons.set(ing, (recipeCons.get(ing) || 0) + use)
        perItem.set(ing, (perItem.get(ing) || 0) + use)
      }
      itemRecipe.set(name, perItem)
    }
  }
  return { itemCounts, recipeCons, itemRecipe }
}

export async function runConsumptionReport({ type, from, to, API, token, state }) {
  const menu = state.menu || []
  const menuById = new Map(menu.map(m => [String(m.id), m]))
  const ingredientsByName = new Map((state.ingredients || []).map(i => [String(i.name || '').trim().toLowerCase(), i]))

  let sales = []
  try {
    sales = await fetchSalesRange(API, token, from, to)
  } catch {
    sales = filterSales(state.sales || [], from, to)
  }

  switch (type) {
    case 'item_recipe': {
      const { itemRecipe } = buildConsumptionMaps(sales, menuById)
      const rows = []
      for (const [item, ings] of itemRecipe.entries()) {
        for (const [ing, amt] of ings.entries()) {
          const unit = ingredientsByName.get(String(ing).trim().toLowerCase())?.unit || ''
          rows.push([item, ing, Number(amt.toFixed?.(3) ?? amt), unit])
        }
      }
      return {
        headers: ['Menu Item', 'Ingredient', 'Consumed', 'Unit'],
        rows,
        summary: [{ label: 'Lines', amount: String(rows.length) }],
      }
    }
    case 'recipe_item': {
      const { recipeCons } = buildConsumptionMaps(sales, menuById)
      const rows = [...recipeCons.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ing, amt]) => {
          const unit = ingredientsByName.get(String(ing).trim().toLowerCase())?.unit || ''
          const cost = Number(ingredientsByName.get(String(ing).trim().toLowerCase())?.costPrice ?? 0)
          return [ing, Number(amt.toFixed?.(3) ?? amt), unit, fmtMoney(cost * amt)]
        })
      {
        const cost = rows.reduce((a, r) => a + money(String(r[3]).replace(/,/g, '')), 0)
        const consumed = rows.reduce((a, r) => a + Number(r[1] || 0), 0)
        return {
          headers: ['Ingredient', 'Consumed', 'Unit', 'Est. Cost'],
          rows,
          summary: [
            { label: 'Ingredients', amount: String(rows.length) },
            { label: 'Total Consumed', amount: String(Number(consumed.toFixed(3))) },
            { label: 'Est. Cost', amount: fmtMoney(cost) },
          ],
        }
      }
    }
    case 'date_production': {
      const map = new Map()
      for (const s of sales) {
        const d = s.date || ''
        const row = map.get(d) || { bills: 0, qty: 0, amount: 0 }
        row.bills += 1
        row.qty += (s.items || []).reduce((a, it) => a + lineQty(it), 0)
        row.amount += saleTotal(s)
        map.set(d, row)
      }
      const rows = [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([d, v]) => [d, v.bills, v.qty, fmtMoney(v.amount)])
      {
        const bills = rows.reduce((a, r) => a + Number(r[1] || 0), 0)
        const qty = rows.reduce((a, r) => a + Number(r[2] || 0), 0)
        const amount = [...map.values()].reduce((a, v) => a + Number(v.amount || 0), 0)
        return {
          headers: ['Date', 'Bills', 'Items Qty', 'Sales (PKR)'],
          rows,
          summary: [
            { label: 'Days', amount: String(rows.length) },
            { label: 'Bills', amount: String(bills) },
            { label: 'Items Qty', amount: String(qty) },
            { label: 'Total Sales', amount: fmtMoney(amount) },
          ],
        }
      }
    }
    case 'kitchen_sale': {
      // Group by kitchen / category of menu items
      const map = new Map()
      for (const s of sales) {
        for (const it of (s.items || [])) {
          const m = menuById.get(String(it.itemId))
          const kitchen = m?.kitchen || m?.station || m?.category || it.custom?.category || 'General'
          const row = map.get(kitchen) || { qty: 0, amount: 0 }
          row.qty += lineQty(it)
          const unit = Number(it.price ?? it.custom?.price ?? m?.price ?? 0)
          if (!it?.mods?.underDeal && !it?.mods?.dealGroupId) row.amount += unit * lineQty(it)
          map.set(kitchen, row)
        }
      }
      {
        const amount = [...map.values()].reduce((a, v) => a + Number(v.amount || 0), 0)
        const qty = [...map.values()].reduce((a, v) => a + Number(v.qty || 0), 0)
        return {
          headers: ['Kitchen / Category', 'Qty', 'Amount (PKR)'],
          rows: [...map.entries()].map(([k, v]) => [k, v.qty, fmtMoney(v.amount)]),
          summary: [
            { label: 'Kitchens', amount: String(map.size) },
            { label: 'Total Qty', amount: String(qty) },
            { label: 'Total Amount', amount: fmtMoney(amount) },
          ],
        }
      }
    }
    case 'kitchen_closing': {
      let snap = null
      try {
        snap = await fetchJson(API, `/api/inventory-snapshots?date=${encodeURIComponent(to)}`, token)
      } catch {}
      const items = snap?.items || (state.ingredients || []).map(i => ({
        name: i.name, qty: Number(i.qty ?? i.stock ?? 0), unit: i.unit || '',
      }))
      return {
        headers: ['Item', 'Unit', 'Closing Qty'],
        rows: items.map(it => [it.name || '', it.unit || '', Number(it.qty || 0)]),
        summary: [{ label: 'As of', amount: to }, { label: 'Items', amount: String(items.length) }],
      }
    }
    case 'kitchen_ready_time': {
      let kots = []
      try {
        kots = await fetchAllKots(API, token, from, to)
      } catch {
        return {
          headers: ['Date', 'Token', 'Status', 'KOT Time', 'Ready', 'Completed', 'Sale Time', 'Ready (min)', 'Complete (min)', 'Sale (PKR)'],
          rows: [],
          summary: [{ label: 'Error', amount: 'Could not load KOTs' }],
        }
      }

      // Index sales by date|token for match
      const saleByKey = new Map()
      for (const s of sales) {
        const key = `${String(s.date || '').slice(0, 10)}|${String(s.tokenNo || '').trim()}`
        if (!String(s.tokenNo || '').trim()) continue
        const prev = saleByKey.get(key)
        if (!prev || saleTotal(s) > saleTotal(prev)) saleByKey.set(key, s)
      }

      const rows = []
      let readySum = 0
      let readyN = 0
      let doneSum = 0
      let doneN = 0

      for (const k of kots) {
        const date = String(k.date || '').slice(0, 10)
        const tokenNo = String(k.tokenNo || '').trim()
        const key = `${date}|${tokenNo}`
        const sale = saleByKey.get(key)
        const created = k.createdAt
        // readyAt is not stored separately; when status is still `ready`, statusUpdatedAt
        // is the ready moment. Once completed, completedAt is the kitchen finish time.
        const completedAt = k.completedAt || (k.status === 'completed' ? k.statusUpdatedAt : null)
        const readyAt =
          k.readyAt
          || (k.status === 'ready' ? k.statusUpdatedAt : null)
          || completedAt
          || (['preparing', 'ready', 'completed'].includes(String(k.status)) ? k.statusUpdatedAt : null)
        const saleAt = sale?.createdAt || null

        const readyMins = minsBetween(created, readyAt)
        const completeMins = minsBetween(created, completedAt)
        if (readyMins != null) { readySum += readyMins; readyN += 1 }
        if (completeMins != null) { doneSum += completeMins; doneN += 1 }

        rows.push([
          date,
          tokenNo,
          k.status || '',
          fmtClock(created),
          fmtClock(readyAt),
          fmtClock(completedAt),
          fmtClock(saleAt),
          fmtMins(readyMins),
          fmtMins(completeMins),
          sale ? fmtMoney(saleTotal(sale)) : '—',
        ])
      }

      // Sort by date then token
      rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])))

      return {
        headers: [
          'Date', 'Token', 'Status', 'KOT Time', 'Ready', 'Completed',
          'Sale Time', 'Ready (min)', 'Complete (min)', 'Sale (PKR)',
        ],
        rows,
        summary: [
          { label: 'KOTs', amount: String(rows.length) },
          { label: 'Matched sales', amount: String(rows.filter(r => r[9] !== '—').length) },
          { label: 'Avg ready', amount: readyN ? fmtMins(Math.round(readySum / readyN)) : '—' },
          { label: 'Avg complete', amount: doneN ? fmtMins(Math.round(doneSum / doneN)) : '—' },
        ],
      }
    }
    default:
      return emptyResult(['Info'])
  }
}
