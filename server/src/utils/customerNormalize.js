/** Normalize / auto-correct customer name+phone for POS lookups. */

export function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '')
}

/**
 * Common POS mistake: type phone into Name and name into Phone.
 * If "name" looks like a phone and "phone" does not, swap them.
 */
export function normalizeCustomerFields(body = {}) {
  let name = String(body.name || '').trim()
  let phone = String(body.phone || '').trim()
  const address = String(body.address || '').trim()

  const nameDigits = digitsOnly(name)
  const phoneDigits = digitsOnly(phone)

  const nameLooksLikePhone = nameDigits.length >= 7 && nameDigits.length >= Math.max(1, name.length - 2)
  const phoneLooksLikeName = phoneDigits.length < 7

  if (nameLooksLikePhone && phoneLooksLikeName) {
    const swappedName = phone || name
    phone = nameDigits
    name = swappedName === name ? '' : swappedName
  } else if (phoneDigits.length) {
    phone = phoneDigits
  }

  return {
    ...body,
    name,
    phone,
    address,
    isRegular: Boolean(body.isRegular),
  }
}
