export function money(n) {
  return Number(n || 0)
}

export function fmtMoney(n) {
  return money(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export function saleTotal(s) {
  return money(s?.total ?? s?.totalAmount)
}

export function saleDiscount(s) {
  return money(s?.discount) + money(s?.billDiscount) + money(s?.itemsDiscount)
}

export function inDateRange(dateStr, from, to) {
  const d = String(dateStr || '').slice(0, 10)
  if (!d) return false
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

export function filterSales(sales, from, to) {
  return (sales || []).filter(s => inDateRange(s.date, from, to))
}

export async function fetchJson(API, path, token) {
  const res = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.json()
}

export async function fetchSalesRange(API, token, from, to) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const data = await fetchJson(API, `/api/sales?${params}`, token)
  const rows = Array.isArray(data) ? data : (data?.rows || [])
  return rows.map(x => ({ ...x, id: x.id || x._id }))
}

export function emptyResult(headers = []) {
  return { headers, rows: [], summary: [] }
}

/** Parse a report cell into a number when it looks numeric (qty / money). */
export function parseReportNumber(cell) {
  const raw = String(cell ?? '').trim()
  if (!raw || raw === '—' || raw === '-') return null
  // Keep digits, decimal, minus; drop currency text / commas
  const cleaned = raw.replace(/,/g, '').replace(/[^\d.-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function formatReportTotal(header, value) {
  if (value == null || !Number.isFinite(value)) return ''
  const h = String(header || '').toLowerCase()
  const moneyLike = /pkr|amount|total|value|spent|sales|cost|price|revenue|profit|discount|handover|opening|closing|net|gross/.test(h)
  if (moneyLike) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9) {
    return String(Math.round(value))
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/**
 * Sum numeric columns across rows. Skips columns that are mostly text (names, dates).
 * Returns array aligned with headers (null = no total for that column).
 */
export function computeColumnTotals(headers = [], rows = []) {
  const cols = (headers || []).length
  const sums = Array.from({ length: cols }, () => 0)
  const numericHits = Array.from({ length: cols }, () => 0)
  const nonEmpty = Array.from({ length: cols }, () => 0)

  for (const row of rows || []) {
    for (let j = 0; j < cols; j++) {
      const cell = row?.[j]
      if (cell == null || String(cell).trim() === '') continue
      nonEmpty[j] += 1
      const n = parseReportNumber(cell)
      if (n == null) continue
      sums[j] += n
      numericHits[j] += 1
    }
  }

  return (headers || []).map((h, j) => {
    if (nonEmpty[j] === 0) return null
    // Require majority of filled cells to be numeric
    if (numericHits[j] < Math.max(1, nonEmpty[j] * 0.5)) return null
    const label = String(h || '').toLowerCase()
    // Never total date / id-like columns even if digits slip in
    if (/date|time|bill\s*#|token|phone|status|reason|note|user|waiter|customer|item|branch|supplier|payment|type|kind|metric/.test(label)
      && !/amount|total|qty|quantity|bills|visits|value|spent|sales|cost|pkr|deliveries|transfers|lines|min/.test(label)) {
      return null
    }
    return sums[j]
  })
}
