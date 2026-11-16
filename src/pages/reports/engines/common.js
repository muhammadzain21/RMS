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
