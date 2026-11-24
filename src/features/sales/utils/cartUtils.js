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

export function findCategoryByName(categories = [], name) {
  const n = String(name || '').trim().toLowerCase()
  if (!n) return null
  return (categories || []).find(c => String(c.name || '').trim().toLowerCase() === n) || null
}

export function resolveItemCategoryName(menuItem, lineItem) {
  return String(
    menuItem?.category
    || lineItem?.custom?.category
    || lineItem?.category
    || ''
  ).trim()
}

/** Package price for a category (>0 means item prices are ignored for billing). */
export function getCategoryPackagePrice(cat, lineItem) {
  const fromLine = Number(lineItem?.categoryPrice ?? lineItem?.custom?.categoryPrice ?? 0)
  if (fromLine > 0) return fromLine
  return Number(cat?.price || 0)
}

export function categoryKeyOf(cat, categoryName) {
  if (cat?.id) return `id:${cat.id}`
  if (cat?._id) return `id:${cat._id}`
  const n = String(categoryName || cat?.name || '').trim().toLowerCase()
  return n ? `name:${n}` : ''
}

export function isBundleCategory(cat) {
  if (!cat) return false
  return (Array.isArray(cat.bundleItems) && cat.bundleItems.length > 0)
    || (Array.isArray(cat.bundleSlots) && cat.bundleSlots.length > 0)
}

export function findCategoryById(categories = [], id) {
  const sid = String(id || '').trim()
  if (!sid) return null
  return (categories || []).find(c => String(c.id || c._id) === sid) || null
}

/** Lines that belong to a configured deal instance (bundle). */
export function isDealLine(it) {
  return !!(it?.mods?.dealGroupId || it?.mods?.underDeal)
}

/**
 * Cart subtotal: categories with price > 0 contribute that price once;
 * their item line prices are ignored. Other items use lineTotalFn.
 * Configured deals (dealGroupId) charge package price once per deal instance.
 */
export function computeCategoryAwareSubtotal(items, menu = [], categories = [], lineTotalFn) {
  const pricedSeen = new Set()
  let total = 0
  for (const it of (items || [])) {
    if (it?.mods && (it.mods.pizzaFlavour && !it.mods.dealGroupId)) continue
    const m = (menu || []).find(x => String(x.id) === String(it.itemId))
    const dealGroupId = it?.mods?.dealGroupId ? String(it.mods.dealGroupId) : ''
    if (dealGroupId) {
      const key = `deal:${dealGroupId}`
      if (pricedSeen.has(key)) continue
      pricedSeen.add(key)
      const dealCat = findCategoryById(categories, it.mods.dealCategoryId)
        || findCategoryByName(categories, it.custom?.category || it.mods.dealCategoryName)
      const pkg = getCategoryPackagePrice(dealCat, it)
      const dealQty = Math.max(1, Number(it.mods?.dealQty || 1))
      if (pkg > 0) total += pkg * dealQty
      continue
    }
    if (it?.mods?.underDeal) continue
    const catName = resolveItemCategoryName(m, it)
    const cat = findCategoryByName(categories, catName)
    const pkg = getCategoryPackagePrice(cat, it)
    if (pkg > 0) {
      const key = categoryKeyOf(cat, catName)
      if (key && !pricedSeen.has(key)) {
        pricedSeen.add(key)
        total += pkg
      }
      continue
    }
    total += typeof lineTotalFn === 'function' ? (lineTotalFn(m, it) || 0) : 0
  }
  return total
}

/** Fingerprint of a deal's composition (for merging same-flavour deals). */
export function dealCompositionKey(lines = []) {
  const list = (lines || []).filter(it => it?.mods?.dealGroupId || it?.mods?.underDeal)
  if (!list.length) return ''
  const dealQty = Math.max(1, Number(list[0]?.mods?.dealQty || 1))
  const catId = String(list[0]?.mods?.dealCategoryId || list[0]?.mods?.dealCategoryName || '')
  const parts = list
    .map(it => {
      const unitQty = Math.max(1, Math.round(Number(it.qty || 1) / dealQty))
      return `${String(it.itemId)}:${unitQty}`
    })
    .sort()
  return `${catId}|${parts.join(',')}`
}

/** Discount amount with category package pricing (discount % applied to package once). */
export function computeCategoryAwareDiscount(items, menu = [], categories = [], lineTotalFn) {
  const pricedSeen = new Set()
  let disc = 0
  for (const it of (items || [])) {
    if (it?.mods && (it.mods.pizzaFlavour && !it.mods.dealGroupId)) continue
    const m = (menu || []).find(x => String(x.id) === String(it.itemId))
    if (!m && !it) continue
    const dealGroupId = it?.mods?.dealGroupId ? String(it.mods.dealGroupId) : ''
    if (dealGroupId) {
      const key = `deal:${dealGroupId}`
      if (pricedSeen.has(key)) continue
      pricedSeen.add(key)
      const dealCat = findCategoryById(categories, it.mods.dealCategoryId)
        || findCategoryByName(categories, it.custom?.category || it.mods.dealCategoryName)
      const pkg = getCategoryPackagePrice(dealCat, it)
      const dealQty = Math.max(1, Number(it.mods?.dealQty || 1))
      const catDisc = Number(dealCat?.discount || 0)
      if (pkg > 0 && catDisc > 0) disc += Math.round(pkg * dealQty * (catDisc / 100))
      continue
    }
    if (it?.mods?.underDeal) continue
    const catName = resolveItemCategoryName(m, it)
    const cat = findCategoryByName(categories, catName)
    const pkg = getCategoryPackagePrice(cat, it)
    if (pkg > 0) {
      const key = categoryKeyOf(cat, catName)
      if (!key || pricedSeen.has(key)) continue
      pricedSeen.add(key)
      const catDisc = Number(cat?.discount || 0)
      if (catDisc > 0) disc += Math.round(pkg * (catDisc / 100))
      continue
    }
    if (!m) continue
    const itemDisc = Number(m.discount || 0)
    let discPct = 0
    if (itemDisc > 0) discPct = itemDisc
    else if (cat && Number(cat.discount || 0) > 0) discPct = Number(cat.discount)
    if (discPct > 0) {
      const lt = typeof lineTotalFn === 'function' ? (lineTotalFn(m, it) || 0) : 0
      disc += Math.round(lt * (discPct / 100))
    }
  }
  return disc
}

/** Current qty in cart for a category (excludes deal / flavour helper lines). */
export function countCategoryQtyInCart(items, menu = [], categories = [], categoryName) {
  const target = String(categoryName || '').trim().toLowerCase()
  if (!target) return 0
  let qty = 0
  for (const it of (items || [])) {
    if (isDealLine(it) || it?.mods?.pizzaFlavour) continue
    const m = (menu || []).find(x => String(x.id) === String(it.itemId))
    const catName = resolveItemCategoryName(m, it)
    if (String(catName || '').trim().toLowerCase() !== target) continue
    qty += Number(it.qty || 0)
  }
  return qty
}

/**
 * Block adding to cart when category maxItems would be exceeded.
 * addQty = how many units are about to be added (default 1).
 */
export function canAddItemToCart(items, menu = [], categories = [], itemId, addQty = 1) {
  const m = (menu || []).find(x => String(x.id) === String(itemId))
  if (!m) return { ok: true }
  const catName = resolveItemCategoryName(m)
  const cat = findCategoryByName(categories, catName)
  const max = Number(cat?.maxItems || 0)
  if (max <= 0) return { ok: true }
  const current = countCategoryQtyInCart(items, menu, categories, catName)
  const next = current + Number(addQty || 0)
  if (next > max) {
    return {
      ok: false,
      message: `${cat.name || catName}: max ${max} item${max === 1 ? '' : 's'} allowed (already ${current})`,
    }
  }
  return { ok: true }
}

/** Validate min/max item qty per category before KOT. */
export function validateCategorySelectionLimits(items, menu = [], categories = []) {
  const counts = new Map() // key -> { name, qty, min, max }
  for (const it of (items || [])) {
    if (isDealLine(it) || it?.mods?.pizzaFlavour) continue
    const m = (menu || []).find(x => String(x.id) === String(it.itemId))
    const catName = resolveItemCategoryName(m, it)
    if (!catName) continue
    const cat = findCategoryByName(categories, catName)
    if (!cat) continue
    // Bundle categories validate inside the deal builder, not as flat min/max
    if (isBundleCategory(cat)) continue
    const min = Number(cat.minItems || 0)
    const max = Number(cat.maxItems || 0)
    if (min <= 0 && max <= 0) continue
    const key = categoryKeyOf(cat, catName)
    const prev = counts.get(key) || { name: cat.name || catName, qty: 0, min, max }
    prev.qty += Number(it.qty || 0)
    prev.min = min
    prev.max = max
    counts.set(key, prev)
  }
  for (const row of counts.values()) {
    if (row.min > 0 && row.qty < row.min) {
      return { ok: false, message: `${row.name}: select at least ${row.min} item${row.min === 1 ? '' : 's'} (now ${row.qty})` }
    }
    if (row.max > 0 && row.qty > row.max) {
      return { ok: false, message: `${row.name}: max ${row.max} item${row.max === 1 ? '' : 's'} allowed (now ${row.qty})` }
    }
  }
  return { ok: true }
}

/** Group cart/KOT/bill lines by category (first-seen order). Uncategorized = no header. */
export function groupItemsByCategory(items, menu = [], categories = []) {
  const groups = []
  const indexByKey = new Map()
  for (const it of (items || [])) {
    const m = (menu || []).find(x => String(x.id || x._id) === String(it.itemId || ''))
      || (it?.name ? (menu || []).find(x => String(x.name || '').trim().toLowerCase() === String(it.name || '').trim().toLowerCase()) : null)
    const dealGroupId = it?.mods?.dealGroupId ? String(it.mods.dealGroupId) : ''
    if (dealGroupId) {
      const dealCat = findCategoryById(categories, it.mods.dealCategoryId)
        || findCategoryByName(categories, it.custom?.category || it.mods.dealCategoryName)
      const key = `deal:${dealGroupId}`
      const packagePrice = getCategoryPackagePrice(dealCat, it)
      if (!indexByKey.has(key)) {
        indexByKey.set(key, groups.length)
        groups.push({
          key,
          categoryName: dealCat?.name || it.mods.dealCategoryName || 'Deal',
          category: dealCat,
          packagePrice,
          items: [],
          showHeader: true,
        })
      }
      groups[indexByKey.get(key)].items.push({ it, menuItem: m })
      continue
    }
    const catName = resolveItemCategoryName(m, it)
    const cat = catName ? findCategoryByName(categories, catName) : null
    const packagePrice = getCategoryPackagePrice(cat, it)
    // Header only for deal/package categories (price or min/max). Regular items print flat.
    const showHeader = !!(
      catName && (
        packagePrice > 0
        || Number(cat?.minItems || 0) > 0
        || Number(cat?.maxItems || 0) > 0
        || isBundleCategory(cat)
      )
    )
    if (!showHeader) {
      groups.push({
        key: `__flat__${groups.length}`,
        categoryName: '',
        category: null,
        packagePrice: 0,
        items: [{ it, menuItem: m }],
        showHeader: false,
      })
      continue
    }
    const key = categoryKeyOf(cat, catName) || `name:${catName.toLowerCase()}`
    if (!indexByKey.has(key)) {
      indexByKey.set(key, groups.length)
      groups.push({
        key,
        categoryName: cat?.name || catName,
        category: cat,
        packagePrice,
        items: [],
        showHeader: true,
      })
    }
    groups[indexByKey.get(key)].items.push({ it, menuItem: m })
  }
  return groups
}

/** Unit price to persist on a sale/recall line (0 when category package pricing applies). */
export function resolvePersistUnitPrice(menuItem, lineItem, categories, lineTotalFn) {
  if (isDealLine(lineItem)) return 0
  const catName = resolveItemCategoryName(menuItem, lineItem)
  const cat = findCategoryByName(categories, catName)
  const pkg = getCategoryPackagePrice(cat, lineItem)
  if (pkg > 0) return 0
  if (typeof lineTotalFn === 'function') return Number(lineTotalFn(menuItem, { ...lineItem, qty: 1 }) || 0)
  return Number(lineItem?.custom?.price || menuItem?.price || 0)
}
