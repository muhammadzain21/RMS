// POS utility helpers

// Create a lineTotal function bound to a given modifiers config
export function createLineTotal(modsConfig = {}) {
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
    // Simple base price from menu or item
    const base = m ? Number(m.price || 0) : Number((it.custom?.price ?? it.price) || 0)
    const qty = Number(it.qty || 0)
    return (base + addons) * qty
  }
}
