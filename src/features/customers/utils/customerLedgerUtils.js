/** Shared helpers for customer visits / spent / ledger matching. */

export function digitsPhone(v) {
  return String(v || '').replace(/\D/g, '')
}

export function saleAmount(s) {
  const total = Number(s?.total ?? s?.totalAmount ?? 0)
  const discount = Number(s?.discount ?? s?.billDiscount ?? 0) + Number(s?.itemsDiscount || 0)
  // Prefer stored net total; if only gross+discount pattern, still use total
  return Math.max(0, total)
}

export function saleNetSpent(s) {
  // Historical UI used total - discount; many sales already store net in `total`
  const total = Number(s?.total ?? s?.totalAmount ?? 0)
  const discount = Number(s?.discount || 0)
  if (discount > 0 && total >= discount) return Math.max(0, total - discount)
  return Math.max(0, total)
}

export function saleMatchesCustomer(sale, customer) {
  if (!sale || !customer) return false
  const saleCust = sale.customer
  if (!saleCust || typeof saleCust !== 'object') return false

  const custId = String(customer.id || customer._id || '')
  const saleId = String(saleCust.id || saleCust._id || '')
  if (custId && saleId && custId === saleId) return true

  const phone = digitsPhone(customer.phone)
  const salePhone = digitsPhone(saleCust.phone)
  if (phone && salePhone && phone === salePhone) return true

  // Last-7 fallback for local format differences (03… vs 923…)
  if (phone.length >= 7 && salePhone.length >= 7) {
    if (phone.slice(-7) === salePhone.slice(-7)) return true
  }
  return false
}

export function salesForCustomer(sales = [], customer) {
  return (sales || [])
    .filter(s => saleMatchesCustomer(s, customer))
    .sort((a, b) => {
      const da = String(a.date || '')
      const db = String(b.date || '')
      if (da !== db) return db.localeCompare(da)
      return Number(b.createdAt || 0) - Number(a.createdAt || 0)
    })
}

/** Map customerId -> { visits, spent } from sales (match by id or phone). */
export function aggregateCustomerSales(sales = [], customers = []) {
  const byId = {}
  const phoneIndex = new Map()
  for (const c of customers || []) {
    const id = String(c.id || c._id || '')
    if (!id) continue
    byId[id] = { visits: 0, spent: 0 }
    const ph = digitsPhone(c.phone)
    if (ph) {
      phoneIndex.set(ph, id)
      if (ph.length >= 7) phoneIndex.set(ph.slice(-7), id)
    }
  }

  for (const s of sales || []) {
    const saleCust = s?.customer
    if (!saleCust || typeof saleCust !== 'object') continue
    let cid = String(saleCust.id || saleCust._id || '')
    if (!cid || !byId[cid]) {
      const ph = digitsPhone(saleCust.phone)
      cid = (ph && (phoneIndex.get(ph) || phoneIndex.get(ph.slice(-7)))) || ''
    }
    if (!cid || !byId[cid]) continue
    byId[cid].visits += 1
    byId[cid].spent += saleNetSpent(s)
  }
  return byId
}

/** Attach customer id from directory when sale only has name/phone. */
export function resolveCustomerSnapshot(customerLike, customers = []) {
  if (!customerLike || typeof customerLike !== 'object') return null
  const name = String(customerLike.name || '').trim()
  const phone = String(customerLike.phone || '').trim()
  const address = String(customerLike.address || '').trim()
  if (!name && !phone && !address) return null

  const digits = digitsPhone(phone)
  let match = null
  if (customerLike.id || customerLike._id) {
    const id = String(customerLike.id || customerLike._id)
    match = (customers || []).find(c => String(c.id || c._id) === id) || null
  }
  if (!match && digits) {
    match = (customers || []).find(c => {
      const p = digitsPhone(c.phone)
      return p && (p === digits || (p.length >= 7 && digits.length >= 7 && p.slice(-7) === digits.slice(-7)))
    }) || null
  }
  return {
    id: match ? String(match.id || match._id) : (customerLike.id || customerLike._id || undefined),
    name: name || match?.name || '',
    phone: digits || digitsPhone(match?.phone) || phone,
    address: address || match?.address || '',
  }
}
