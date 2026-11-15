import React, { useEffect, useMemo, useState } from 'react'
import { findCategoryById } from '../utils.js'

/**
 * Configure a deal/subcategory: included items + picks from linked categories (min/max).
 * Package price comes from the deal category `price`.
 */
export default function DealBuilderDialog({
  open,
  category = null,
  menu = [],
  categories = [],
  onCancel = () => {},
  onConfirm = () => {},
}) {
  const bundleItems = Array.isArray(category?.bundleItems) ? category.bundleItems : []
  const bundleSlots = Array.isArray(category?.bundleSlots) ? category.bundleSlots : []
  const packagePrice = Number(category?.price || 0)

  const [includedQty, setIncludedQty] = useState({})
  // slotIndex -> [{ itemId, name, qty }]
  const [slotPicks, setSlotPicks] = useState({})
  const [activeSlot, setActiveSlot] = useState(0)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open || !category) return
    const qtyMap = {}
    for (const row of bundleItems) {
      const id = String(row.itemId)
      qtyMap[id] = Math.max(1, Number(row.qty || 1))
    }
    setIncludedQty(qtyMap)
    setSlotPicks({})
    setActiveSlot(0)
    setErr('')
  }, [open, category?.id, category?._id])

  const slotMenuItems = useMemo(() => {
    const slot = bundleSlots[activeSlot]
    if (!slot) return []
    const linked = findCategoryById(categories, slot.categoryId)
    const catName = String(linked?.name || slot.categoryName || '').trim().toLowerCase()
    if (!catName) return []
    return (menu || [])
      .filter(m => m && m.active !== false && String(m.category || '').trim().toLowerCase() === catName)
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.name || '').localeCompare(String(b.name || '')))
  }, [bundleSlots, activeSlot, categories, menu])

  if (!open || !category) return null

  const slotCount = (idx) => {
    const picks = slotPicks[idx] || []
    return picks.reduce((s, p) => s + Number(p.qty || 0), 0)
  }

  const toggleSlotItem = (idx, item) => {
    const slot = bundleSlots[idx]
    const max = Math.max(0, Number(slot?.maxItems || 0))
    setSlotPicks((prev) => {
      const list = [...(prev[idx] || [])]
      const found = list.findIndex(p => String(p.itemId) === String(item.id))
      if (found >= 0) {
        list.splice(found, 1)
        return { ...prev, [idx]: list }
      }
      const current = list.reduce((s, p) => s + Number(p.qty || 0), 0)
      if (max > 0 && current >= max) return prev
      list.push({ itemId: item.id, name: item.name, qty: 1 })
      return { ...prev, [idx]: list }
    })
    setErr('')
  }

  const bumpSlotQty = (idx, itemId, delta) => {
    const slot = bundleSlots[idx]
    const max = Math.max(0, Number(slot?.maxItems || 0))
    setSlotPicks((prev) => {
      const list = (prev[idx] || []).map((p) => ({ ...p }))
      const row = list.find(p => String(p.itemId) === String(itemId))
      if (!row) return prev
      const others = list.reduce((s, p) => s + (String(p.itemId) === String(itemId) ? 0 : Number(p.qty || 0)), 0)
      const nextQty = Number(row.qty || 0) + delta
      if (nextQty <= 0) {
        return { ...prev, [idx]: list.filter(p => String(p.itemId) !== String(itemId)) }
      }
      if (max > 0 && others + nextQty > max) return prev
      row.qty = nextQty
      return { ...prev, [idx]: list }
    })
  }

  const confirm = () => {
    for (let i = 0; i < bundleSlots.length; i++) {
      const slot = bundleSlots[i]
      const min = Math.max(0, Number(slot.minItems || 0))
      const max = Math.max(0, Number(slot.maxItems || 0))
      const n = slotCount(i)
      const label = slot.label || slot.categoryName || findCategoryById(categories, slot.categoryId)?.name || 'Selection'
      if (min > 0 && n < min) {
        setErr(`${label}: select at least ${min}`)
        setActiveSlot(i)
        return
      }
      if (max > 0 && n > max) {
        setErr(`${label}: max ${max} allowed`)
        setActiveSlot(i)
        return
      }
    }

    const dealGroupId = `deal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const dealCategoryId = String(category.id || category._id)
    const dealCategoryName = category.name || ''
    const lines = []

    for (const row of bundleItems) {
      const id = String(row.itemId)
      const qty = Math.max(1, Number(includedQty[id] || row.qty || 1))
      const menuItem = (menu || []).find(m => String(m.id) === id)
      lines.push({
        itemId: id,
        qty,
        mods: {
          underDeal: true,
          dealGroupId,
          dealCategoryId,
          dealCategoryName,
          isBundleDefault: true,
        },
        custom: {
          category: dealCategoryName,
          categoryPrice: packagePrice,
          name: menuItem?.name || row.name || '',
        },
      })
    }

    for (let i = 0; i < bundleSlots.length; i++) {
      const slot = bundleSlots[i]
      for (const pick of (slotPicks[i] || [])) {
        lines.push({
          itemId: pick.itemId,
          qty: Math.max(1, Number(pick.qty || 1)),
          mods: {
            underDeal: true,
            dealGroupId,
            dealCategoryId,
            dealCategoryName,
            dealSlotCategoryId: String(slot.categoryId || ''),
            dealSlotLabel: slot.label || slot.categoryName || '',
          },
          custom: {
            category: dealCategoryName,
            categoryPrice: packagePrice,
            name: pick.name || '',
          },
        })
      }
    }

    if (!lines.length) {
      setErr('Deal has no items configured')
      return
    }
    onConfirm(lines)
  }

  const activeSlotMeta = bundleSlots[activeSlot]
  const activeMin = Number(activeSlotMeta?.minItems || 0)
  const activeMax = Number(activeSlotMeta?.maxItems || 0)

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4" onClick={onCancel}>
      <div
        className="w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border-2 border-emerald-200 dark:border-emerald-800 shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-emerald-100 dark:border-emerald-900 bg-gradient-to-r from-emerald-50 to-white dark:from-emerald-950/40 dark:to-gray-950">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">Build deal</div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{category.name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {packagePrice > 0
                ? <>Package price: <span className="font-bold text-emerald-700 dark:text-emerald-300">PKR {packagePrice.toLocaleString()}</span> <span className="text-gray-400">(item prices ignored)</span></>
                : 'No package price set — configure Category Price on this deal'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-9 h-9 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 text-xl leading-none shrink-0"
            aria-label="Close"
          >×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {bundleItems.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-2.5">Included items</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {bundleItems.map((row) => {
                  const id = String(row.itemId)
                  const menuItem = (menu || []).find(m => String(m.id) === id)
                  const name = menuItem?.name || row.name || id
                  const baseQty = Math.max(1, Number(row.qty || 1))
                  const maxQty = Math.max(0, Number(row.maxQty || 0))
                  const qty = Number(includedQty[id] || baseQty)
                  return (
                    <div key={id} className="flex items-center justify-between gap-3 rounded-xl border-2 border-emerald-100 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/25 px-4 py-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate text-gray-900 dark:text-gray-100">{name}</div>
                        <div className="text-[11px] text-emerald-700/70 dark:text-emerald-300/70">Included in deal</div>
                      </div>
                      {maxQty > baseQty ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button type="button" className="w-8 h-8 rounded-lg border-2 border-emerald-200 dark:border-emerald-700 font-bold hover:bg-white dark:hover:bg-gray-800" onClick={() => setIncludedQty(v => ({ ...v, [id]: Math.max(baseQty, qty - 1) }))}>−</button>
                          <span className="w-8 text-center text-sm font-bold">{qty}</span>
                          <button type="button" className="w-8 h-8 rounded-lg border-2 border-emerald-200 dark:border-emerald-700 font-bold hover:bg-white dark:hover:bg-gray-800" onClick={() => setIncludedQty(v => ({ ...v, [id]: Math.min(maxQty, qty + 1) }))}>+</button>
                        </div>
                      ) : (
                        <span className="text-sm font-bold text-emerald-800 dark:text-emerald-200 shrink-0">×{qty}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {bundleSlots.length > 0 && (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300 mb-2.5">Choose options</div>
                <div className="flex flex-wrap gap-2">
                  {bundleSlots.map((slot, idx) => {
                    const linked = findCategoryById(categories, slot.categoryId)
                    const label = slot.label || linked?.name || slot.categoryName || `Slot ${idx + 1}`
                    const n = slotCount(idx)
                    const min = Number(slot.minItems || 0)
                    const max = Number(slot.maxItems || 0)
                    const ok = (min <= 0 || n >= min) && (max <= 0 || n <= max)
                    return (
                      <button
                        key={`${slot.categoryId}-${idx}`}
                        type="button"
                        onClick={() => setActiveSlot(idx)}
                        className={`px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                          activeSlot === idx
                            ? 'bg-sky-600 text-white border-sky-500 shadow-md'
                            : ok
                              ? 'bg-white dark:bg-gray-800 border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200 hover:border-sky-400'
                              : 'bg-amber-50 border-amber-300 text-amber-800'
                        }`}
                      >
                        {label}
                        <span className="ml-1.5 opacity-80 font-bold">
                          ({n}{max > 0 ? `/${max}` : ''}{min > 0 ? ` · min ${min}` : ''})
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {activeSlotMeta && (
                <div className="rounded-xl border-2 border-sky-100 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/15 p-4">
                  <div className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                    Pick flavours / items
                    {(activeMin > 0 || activeMax > 0)
                      ? <span className="font-semibold text-sky-700 dark:text-sky-300"> · {activeMin || 0}–{activeMax || '∞'}</span>
                      : ''}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[340px] overflow-y-auto pr-1">
                    {slotMenuItems.map((item) => {
                      const picks = slotPicks[activeSlot] || []
                      const selected = picks.find(p => String(p.itemId) === String(item.id))
                      const max = Math.max(0, Number(activeSlotMeta.maxItems || 0))
                      const total = slotCount(activeSlot)
                      const disabled = !selected && max > 0 && total >= max
                      return (
                        <div key={item.id} className="relative pb-3">
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => toggleSlotItem(activeSlot, item)}
                            className={`w-full h-20 rounded-xl border-2 text-sm font-semibold px-2 transition-all ${
                              selected
                                ? 'bg-amber-500 text-white border-amber-600 shadow-md scale-[1.02]'
                                : disabled
                                  ? 'opacity-40 cursor-not-allowed bg-gray-100 dark:bg-gray-800'
                                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 hover:border-amber-400 hover:shadow-sm'
                            }`}
                          >
                            <span className="line-clamp-2 uppercase leading-tight">{item.name}</span>
                          </button>
                          {selected && (
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white dark:bg-gray-900 rounded-full border-2 border-amber-300 shadow px-1.5 py-0.5">
                              <button type="button" className="w-6 h-6 text-sm font-bold rounded-full hover:bg-amber-50" onClick={() => bumpSlotQty(activeSlot, item.id, -1)}>−</button>
                              <span className="text-xs font-bold w-5 text-center">{selected.qty}</span>
                              <button type="button" className="w-6 h-6 text-sm font-bold rounded-full hover:bg-amber-50" onClick={() => bumpSlotQty(activeSlot, item.id, 1)}>+</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {!slotMenuItems.length && (
                      <div className="col-span-full text-sm text-gray-500 py-10 text-center">No menu items in this linked category.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {!bundleItems.length && !bundleSlots.length && (
            <div className="text-sm text-gray-500 text-center py-12">This category has no deal composition configured.</div>
          )}
        </div>

        {err && <div className="px-6 pb-2 text-sm font-medium text-rose-600 dark:text-rose-400">{err}</div>}

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-950/50">
          <button type="button" onClick={onCancel} className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 font-semibold text-sm hover:bg-white dark:hover:bg-gray-800">Cancel</button>
          <button type="button" onClick={confirm} className="flex-[1.4] px-4 py-3 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-bold text-sm shadow-md hover:shadow-lg">Add Deal</button>
        </div>
      </div>
    </div>
  )
}
