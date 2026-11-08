// POS utility helpers

/** Normalize POS order type labels (legacy Drive-thru → Foodpanda). */
export function normalizeOrderType(orderType) {
  const t = String(orderType || '').trim()
  if (!t) return ''
  if (/^drive[-\s]?thru$/i.test(t)) return 'Foodpanda'
  return t
}

/**
 * Unit base price for a menu item given the current order type.
 * Foodpanda uses `priceFoodpanda` when set (> 0), otherwise falls back to `price`.
 */
export function resolveMenuUnitPrice(menuItem, orderType, lineItem) {
  // Snapshotted custom/line prices win (helds, recalls, call-center loads)
  if (lineItem?.custom?.price != null && Number.isFinite(Number(lineItem.custom.price))) {
    return Number(lineItem.custom.price)
  }
  if (!menuItem && lineItem?.price != null && Number.isFinite(Number(lineItem.price))) {
    return Number(lineItem.price)
  }
  const base = Number(menuItem?.price || 0)
  const type = normalizeOrderType(orderType)
  if (type === 'Foodpanda') {
    const fp = Number(menuItem?.priceFoodpanda || 0)
    if (fp > 0) return fp
  }
  return base
}

// Create a lineTotal function bound to modifiers + optional order-type getter
export function createLineTotal(modsConfig = {}, getOrderType) {
  return function lineTotal(m, it) {
    if (!it) return 0
    // Flavour-only helper lines should not contribute to price (under deals or regular flow)
    if (it?.mods && (it.mods.underDeal || it.mods.pizzaFlavour)) return 0
    const enabled = it.mods || {}
    const addons = Object.keys(enabled).reduce((sum, key) => {
      if (!enabled[key]) return sum
      const cfg = modsConfig[key]
      return sum + Number(cfg?.price || 0)
    }, 0)
    const orderType = typeof getOrderType === 'function' ? getOrderType() : getOrderType
    const base = resolveMenuUnitPrice(m, orderType, it)
    const qty = Number(it.qty || 0)
    return (base + addons) * qty
  }
}
