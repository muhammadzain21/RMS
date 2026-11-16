import React, { useEffect, useMemo, useState } from 'react'
import { findCategoryById } from '../utils.js'

/**
 * Deal builder — Image1 layout:
 * left = selected products table, center = slot categories, right = item grid.
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
  // activePane: { type: 'slot', index } | { type: 'included', index }
  const [activePane, setActivePane] = useState({ type: 'slot', index: 0 })
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
    setActivePane(bundleSlots.length ? { type: 'slot', index: 0 } : { type: 'included', index: 0 })
    setErr('')
  }, [open, category?.id, category?._id])

  const activeSlot = activePane.type === 'slot' ? activePane.index : -1

  const slotMenuItems = useMemo(() => {
    if (activePane.type !== 'slot') return []
    const slot = bundleSlots[activePane.index]
    if (!slot) return []
    const linked = findCategoryById(categories, slot.categoryId)
    const catName = String(linked?.name || slot.categoryName || '').trim().toLowerCase()
    if (!catName) return []
    return (menu || [])
      .filter(m => m && m.active !== false && String(m.category || '').trim().toLowerCase() === catName)
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.name || '').localeCompare(String(b.name || '')))
  }, [bundleSlots, activePane, categories, menu])

  const summaryRows = useMemo(() => {
    const rows = []
    for (const row of bundleItems) {
      const id = String(row.itemId)
      const menuItem = (menu || []).find(m => String(m.id) === id)
      const qty = Math.max(1, Number(includedQty[id] || row.qty || 1))
      rows.push({
        key: `inc-${id}`,
        kind: 'included',
        itemId: id,
        name: menuItem?.name || row.name || id,
        qty,
        maxQty: Math.max(0, Number(row.maxQty || 0)),
        baseQty: Math.max(1, Number(row.qty || 1)),
        extraPrice: 0,
      })
    }
    for (let i = 0; i < bundleSlots.length; i++) {
      for (const pick of (slotPicks[i] || [])) {
        rows.push({
          key: `slot-${i}-${pick.itemId}`,
          kind: 'slot',
          slotIndex: i,
          itemId: pick.itemId,
          name: pick.name || '',
          qty: Math.max(1, Number(pick.qty || 1)),
          extraPrice: 0,
        })
      }
    }
    return rows
  }, [bundleItems, bundleSlots, includedQty, slotPicks, menu])

  if (!open || !category) return null

  const slotCount = (idx) => {
    const picks = slotPicks[idx] || []
    return picks.reduce((s, p) => s + Number(p.qty || 0), 0)
  }

  const toggleSlotItem = (idx, item) => {
    const slot = bundleSlots[idx]
    const max = Math.max(0, Number(slot?.maxItems || 0))
    setSlotPicks((prev) => {
      const list = (prev[idx] || []).map(p => ({ ...p }))
      const found = list.findIndex(p => String(p.itemId) === String(item.id))
      const current = list.reduce((s, p) => s + Number(p.qty || 0), 0)

      // Already selected → add another (same item twice+) while under max
      if (found >= 0) {
        if (max > 0 && current >= max) {
          // At max with single slot: replace with this item at qty 1
          if (max === 1) return { ...prev, [idx]: [{ itemId: item.id, name: item.name, qty: 1 }] }
          return prev
        }
        list[found].qty = Number(list[found].qty || 0) + 1
        return { ...prev, [idx]: list }
      }

      if (max > 0 && current >= max) {
        // Replace when single-pick max
        if (max === 1) return { ...prev, [idx]: [{ itemId: item.id, name: item.name, qty: 1 }] }
        return prev
      }
      list.push({ itemId: item.id, name: item.name, qty: 1 })
      return { ...prev, [idx]: list }
    })
    setErr('')
  }

  const bumpSummaryQty = (row, delta) => {
    if (row.kind === 'included') {
      const baseQty = row.baseQty
      const maxQty = row.maxQty
      if (maxQty <= baseQty) return
      setIncludedQty(v => {
        const cur = Math.max(baseQty, Number(v[row.itemId] || baseQty))
        const next = Math.min(maxQty, Math.max(baseQty, cur + delta))
        return { ...v, [row.itemId]: next }
      })
      return
    }
    const idx = row.slotIndex
    const slot = bundleSlots[idx]
    const max = Math.max(0, Number(slot?.maxItems || 0))
    setSlotPicks((prev) => {
      const list = (prev[idx] || []).map((p) => ({ ...p }))
      const found = list.find(p => String(p.itemId) === String(row.itemId))
      if (!found) return prev
      const others = list.reduce((s, p) => s + (String(p.itemId) === String(row.itemId) ? 0 : Number(p.qty || 0)), 0)
      const nextQty = Number(found.qty || 0) + delta
      if (nextQty <= 0) {
        return { ...prev, [idx]: list.filter(p => String(p.itemId) !== String(row.itemId)) }
      }
      if (max > 0 && others + nextQty > max) return prev
      found.qty = nextQty
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
        setActivePane({ type: 'slot', index: i })
        return
      }
      if (max > 0 && n > max) {
        setErr(`${label}: max ${max} allowed`)
        setActivePane({ type: 'slot', index: i })
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
          dealQty: 1,
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
            dealQty: 1,
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
  const slotLabel = (slot, idx) => {
    const linked = findCategoryById(categories, slot.categoryId)
    return slot.label || linked?.name || slot.categoryName || `Slot ${idx + 1}`
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 sm:p-4" onClick={onCancel}>
      <div
        className="w-full max-w-6xl max-h-[94vh] overflow-hidden rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{category.name || 'Deal'}</h3>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 text-xl leading-none"
            aria-label="Close"
          >×</button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 overflow-hidden">
          {/* Left: selected products */}
          <div className="lg:col-span-4 min-h-0 flex flex-col border border-gray-200 dark:border-gray-700 rounded overflow-hidden bg-white dark:bg-gray-950">
            <div className="grid grid-cols-12 bg-gray-100 dark:bg-gray-800 text-[11px] font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 border-b dark:border-gray-700">
              <div className="col-span-2 px-2 py-2">Sr #</div>
              <div className="col-span-5 px-2 py-2">Product</div>
              <div className="col-span-3 px-2 py-2 text-right">Extra Price</div>
              <div className="col-span-2 px-2 py-2 text-center">Qty</div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-[160px]">
              {summaryRows.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-gray-400">Select items from the right</div>
              ) : summaryRows.map((row, i) => (
                <div key={row.key} className="grid grid-cols-12 items-center border-b border-gray-100 dark:border-gray-800 text-sm">
                  <div className="col-span-2 px-2 py-2 text-gray-500">{i + 1}</div>
                  <div className="col-span-5 px-2 py-2 font-medium truncate" title={row.name}>{row.name}</div>
                  <div className="col-span-3 px-2 py-2 text-right text-gray-600">{row.extraPrice}</div>
                  <div className="col-span-2 px-1 py-2 flex items-center justify-center gap-0.5">
                    <button type="button" className="w-5 h-5 text-xs border rounded text-gray-600" onClick={() => bumpSummaryQty(row, -1)}>−</button>
                    <span className="min-w-[1.25rem] text-center font-bold text-blue-600">{row.qty}</span>
                    <button type="button" className="w-5 h-5 text-xs border rounded text-gray-600" onClick={() => bumpSummaryQty(row, 1)}>+</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 border-t dark:border-gray-700 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20">
              Package: PKR {packagePrice.toLocaleString()}
            </div>
          </div>

          {/* Center: category / slot buttons */}
          <div className="lg:col-span-2 min-h-0 overflow-y-auto flex flex-col gap-2 py-1">
            {bundleSlots.map((slot, idx) => {
              const n = slotCount(idx)
              const min = Number(slot.minItems || 0)
              const max = Number(slot.maxItems || 0)
              const ok = (min <= 0 || n >= min) && (max <= 0 || n <= max)
              const active = activePane.type === 'slot' && activePane.index === idx
              return (
                <button
                  key={`${slot.categoryId}-${idx}`}
                  type="button"
                  onClick={() => setActivePane({ type: 'slot', index: idx })}
                  className={`w-full min-h-[72px] px-2 py-3 rounded-lg border-2 text-sm font-bold uppercase leading-tight transition-all ${
                    active
                      ? 'bg-emerald-500 text-white border-emerald-600 shadow'
                      : ok
                        ? 'bg-gray-200 text-gray-800 border-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600'
                        : 'bg-amber-100 text-amber-900 border-amber-300'
                  }`}
                >
                  {slotLabel(slot, idx)}
                  {(min > 0 || max > 0) && (
                    <div className={`mt-1 text-[10px] font-semibold normal-case ${active ? 'text-emerald-50' : 'text-gray-500'}`}>
                      {n}{max > 0 ? `/${max}` : ''}{min > 0 ? ` min ${min}` : ''}
                    </div>
                  )}
                </button>
              )
            })}
            {bundleItems.map((row, idx) => {
              const menuItem = (menu || []).find(m => String(m.id) === String(row.itemId))
              const name = menuItem?.name || row.name || 'Included'
              const active = activePane.type === 'included' && activePane.index === idx
              return (
                <button
                  key={`inc-btn-${row.itemId}-${idx}`}
                  type="button"
                  onClick={() => setActivePane({ type: 'included', index: idx })}
                  className={`w-full min-h-[72px] px-2 py-3 rounded-lg border-2 text-sm font-bold uppercase leading-tight transition-all ${
                    active
                      ? 'bg-emerald-500 text-white border-emerald-600 shadow'
                      : 'bg-gray-200 text-gray-800 border-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600'
                  }`}
                >
                  {name}
                </button>
              )
            })}
            {!bundleSlots.length && !bundleItems.length && (
              <div className="text-xs text-gray-400 text-center py-6">No slots</div>
            )}
          </div>

          {/* Right: item grid */}
          <div className="lg:col-span-6 min-h-0 flex flex-col border border-gray-200 dark:border-gray-700 rounded overflow-hidden bg-white dark:bg-gray-950">
            <div className="px-3 py-2 border-b dark:border-gray-700 text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
              {activePane.type === 'slot' && activeSlotMeta
                ? slotLabel(activeSlotMeta, activeSlot)
                : activePane.type === 'included'
                  ? ((menu || []).find(m => String(m.id) === String(bundleItems[activePane.index]?.itemId))?.name
                    || bundleItems[activePane.index]?.name
                    || 'Included')
                  : 'Items'}
            </div>
            <div className="flex-1 overflow-y-auto p-2 min-h-[220px]">
              {activePane.type === 'slot' && activeSlotMeta ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {slotMenuItems.map((item) => {
                    const picks = slotPicks[activeSlot] || []
                    const selected = picks.find(p => String(p.itemId) === String(item.id))
                    const max = Math.max(0, Number(activeSlotMeta.maxItems || 0))
                    const total = slotCount(activeSlot)
                    const disabled = !selected && max > 0 && total >= max && max !== 1
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleSlotItem(activeSlot, item)}
                        className={`min-h-[70px] rounded-lg border-2 px-2 py-2 text-xs sm:text-sm font-bold uppercase leading-tight transition-all ${
                          selected
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow'
                            : disabled
                              ? 'opacity-40 cursor-not-allowed bg-gray-100 dark:bg-gray-800 border-gray-200'
                              : 'bg-emerald-500 text-white border-emerald-600 hover:bg-emerald-600'
                        }`}
                      >
                        <span className="line-clamp-3">{item.name}</span>
                        {selected && Number(selected.qty) > 1 ? (
                          <span className="mt-1 block text-[10px] font-semibold opacity-90">×{selected.qty}</span>
                        ) : null}
                      </button>
                    )
                  })}
                  {!slotMenuItems.length && (
                    <div className="col-span-full py-10 text-center text-sm text-gray-500">No menu items in this linked category.</div>
                  )}
                </div>
              ) : activePane.type === 'included' && bundleItems[activePane.index] ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(() => {
                    const row = bundleItems[activePane.index]
                    const menuItem = (menu || []).find(m => String(m.id) === String(row.itemId))
                    const name = menuItem?.name || row.name || row.itemId
                    return (
                      <button
                        type="button"
                        className="min-h-[70px] rounded-lg border-2 px-2 py-2 text-xs sm:text-sm font-bold uppercase leading-tight bg-emerald-600 text-white border-emerald-700 shadow"
                      >
                        <span className="line-clamp-3">{name}</span>
                        <span className="mt-1 block text-[10px] font-semibold opacity-90">Included</span>
                      </button>
                    )
                  })()}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-gray-500 px-4 text-center">
                  This category has no deal composition configured.
                </div>
              )}
            </div>
          </div>
        </div>

        {err && <div className="px-4 pb-1 text-sm font-medium text-rose-600">{err}</div>}

        <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <button
            type="button"
            onClick={confirm}
            className="min-w-[140px] px-6 py-2.5 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold shadow"
          >Submit</button>
          <button
            type="button"
            onClick={onCancel}
            className="min-w-[140px] px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow"
          >Cancel</button>
        </div>
      </div>
    </div>
  )
}
