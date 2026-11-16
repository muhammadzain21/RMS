import React, { useMemo } from 'react'
import { findCategoryById, findCategoryByName, getCategoryPackagePrice } from '../utils.js'

function buildCartRows(items = []) {
  const rows = []
  const seenDeals = new Set()
  ;(items || []).forEach((it, idx) => {
    const dealId = it?.mods?.dealGroupId ? String(it.mods.dealGroupId) : ''
    if (dealId) {
      if (seenDeals.has(dealId)) return
      seenDeals.add(dealId)
      const members = []
      ;(items || []).forEach((line, lineIdx) => {
        if (String(line?.mods?.dealGroupId || '') === dealId) members.push({ line, idx: lineIdx })
      })
      rows.push({ kind: 'deal', dealId, members, firstIdx: members[0]?.idx ?? idx })
      return
    }
    rows.push({ kind: 'item', idx, line: it })
  })
  return rows
}

export default function CartTable({
  items = [],
  menu = [],
  categories = [],
  decQty,
  incQty,
  updateItem,
  removeItem,
  lineTotal,
  onEditItem,
  incDealQty,
  decDealQty,
  removeDeal,
}) {
  const rows = useMemo(() => buildCartRows(items), [items])

  return (
    <div className="border-2 border-indigo-200 rounded-lg overflow-x-auto max-w-full bg-gradient-to-br from-indigo-50/80 to-white dark:from-indigo-950/30 dark:to-gray-900 dark:border-indigo-800 shadow-sm lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
      <div className="hidden md:grid grid-cols-12 bg-gradient-to-r from-indigo-100 to-indigo-50 dark:from-indigo-900/60 dark:to-indigo-950/40 dark:text-indigo-100 text-xs font-bold min-w-0 border-b-2 border-indigo-200 dark:border-indigo-800">
        <div className="col-span-6 px-2 py-2 border-r border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-100">NAME</div>
        <div className="col-span-2 px-2 py-2 border-r border-indigo-200 dark:border-indigo-800 text-center text-indigo-900 dark:text-indigo-100">QTY</div>
        <div className="col-span-3 px-2 py-2 border-r border-indigo-200 dark:border-indigo-800 text-right text-indigo-900 dark:text-indigo-100">PRICE</div>
        <div className="col-span-1 px-1 py-2 text-center text-indigo-900 dark:text-indigo-100">DEL</div>
      </div>
      <div className="h-[42vh] min-h-[220px] lg:h-auto lg:flex-1 lg:min-h-0 overflow-y-auto overflow-x-hidden">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-xs text-gray-500 dark:text-gray-400">
            <p>No items in cart</p>
          </div>
        ) : (
          <div className="divide-y min-w-0">
            {rows.map((row) => {
              if (row.kind === 'deal') {
                const first = row.members[0]?.line
                const dealName = first?.mods?.dealCategoryName || first?.custom?.category || 'Deal'
                const dealQty = Math.max(1, Number(first?.mods?.dealQty || 1))
                const dealCat = findCategoryById(categories, first?.mods?.dealCategoryId)
                  || findCategoryByName(categories, dealName)
                const pkg = getCategoryPackagePrice(dealCat, first)
                const price = pkg > 0 ? pkg * dealQty : 0
                const subNames = row.members.map(({ line }) => {
                  const m = menu.find(x => String(x.id) === String(line.itemId))
                  return m?.name || line.custom?.name || line.name || 'Item'
                })
                return (
                  <div key={`deal-${row.dealId}`} className="grid grid-cols-12 items-start text-sm md:text-base min-w-0 bg-white/70 dark:bg-gray-900/40">
                    <div className="col-span-12 md:col-span-6 px-2 py-2 min-w-0">
                      <div className="font-bold text-sm leading-tight text-gray-900 dark:text-gray-100">{dealName}</div>
                      <div className="mt-1 space-y-0.5">
                        {subNames.map((name, i) => (
                          <div key={`${row.dealId}-sub-${i}`} className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                            {name}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="col-span-6 md:col-span-2 px-2 py-2 flex items-center justify-between md:justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => (typeof decDealQty === 'function' ? decDealQty(row.dealId) : decQty(row.firstIdx))}
                        className="w-7 h-7 text-sm border-2 border-rose-300 text-rose-700 rounded dark:border-rose-700 dark:text-rose-300"
                      >−</button>
                      <span className="w-8 text-center font-bold">{dealQty}</span>
                      <button
                        type="button"
                        onClick={() => (typeof incDealQty === 'function' ? incDealQty(row.dealId) : incQty(row.firstIdx))}
                        className="w-7 h-7 text-sm border-2 border-emerald-300 text-emerald-700 rounded dark:border-emerald-700 dark:text-emerald-300"
                      >+</button>
                    </div>
                    <div className="col-span-6 md:col-span-3 px-2 py-2 text-right font-bold text-sm">
                      {price > 0 ? price.toFixed(0) : '—'}
                    </div>
                    <div className="col-span-12 md:col-span-1 px-2 py-2 text-right md:text-center">
                      <button
                        type="button"
                        aria-label="Remove deal"
                        title="Remove deal"
                        onClick={() => (typeof removeDeal === 'function' ? removeDeal(row.dealId) : removeItem(row.firstIdx))}
                        className="inline-flex items-center justify-center w-7 h-7 text-sm rounded-full text-rose-600 border border-rose-300 hover:bg-rose-600 hover:text-white"
                      >×</button>
                    </div>
                  </div>
                )
              }

              const it = row.line
              const idx = row.idx
              const m = menu.find(x => x.id === it.itemId)
              const baseName = m ? m.name : (it.custom?.name || it.name || `Item ${it.itemId || idx + 1}`)
              const size = (it?.mods?.size || it?.size || '').toString().toUpperCase()
              const cat = m?.category ? findCategoryByName(categories, m.category) : null
              const pkgPrice = getCategoryPackagePrice(cat, it)
              const usesCategoryPrice = pkgPrice > 0
              const itemDisc = m ? Number(m.discount || 0) : 0
              let discPct = 0
              if (!usesCategoryPrice) {
                if (itemDisc > 0) discPct = itemDisc
                else if (cat && Number(cat.discount || 0) > 0) discPct = Number(cat.discount)
              }
              const lineAmt = usesCategoryPrice ? 0 : Number(lineTotal(m, it) || 0)
              const discAmt = discPct > 0 ? Math.round(lineAmt * (discPct / 100)) : 0
              const flavourTitle = (() => {
                const ids = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
                if (!ids.length) return ''
                const names = ids.map(fid => (menu.find(x => x.id === fid)?.name || '')).filter(Boolean)
                return names.join(' + ')
              })()
              const title = flavourTitle || baseName
              const displayName = size ? `${title} (${size})` : title
              const unitPrice = usesCategoryPrice ? 0 : Number(lineTotal(m, { ...it, qty: 1 }))
              const limitsHint = cat && (Number(cat.minItems || 0) > 0 || Number(cat.maxItems || 0) > 0)
                ? ` · pick ${Number(cat.minItems || 0) || 0}${Number(cat.maxItems || 0) > 0 ? `–${Number(cat.maxItems)}` : '+'} items`
                : ''

              return (
                <div key={idx} className="grid grid-cols-12 md:grid-cols-12 items-center text-sm md:text-base min-w-0">
                  <div className="col-span-12 md:col-span-6 px-2 py-1.5 min-w-0">
                    <div className="font-semibold text-sm whitespace-normal break-words leading-tight">{displayName}</div>
                    {m?.category && (
                      <div className="text-[10px] text-indigo-600 dark:text-indigo-300 font-medium">
                        {m.category}{usesCategoryPrice ? ` · package ${pkgPrice}` : ''}{limitsHint}
                      </div>
                    )}
                    <div className="text-[10px] text-gray-600 dark:text-gray-400">
                      {usesCategoryPrice ? 'Included in category price' : `Unit PKRs ${unitPrice.toFixed(2)}`}
                    </div>
                    {discPct > 0 && (
                      <div className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                        {discPct}% off (-PKRs {discAmt})
                      </div>
                    )}
                  </div>
                  <div className="col-span-6 md:col-span-2 px-2 py-1.5 flex items-center justify-between md:justify-center gap-1">
                    <button type="button" onClick={() => decQty(idx)} className="px-1.5 py-0.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">-</button>
                    <input
                      type="number"
                      value={it.qty}
                      onChange={e => updateItem(idx, { qty: Math.max(1, Number(e.target.value) || 1) })}
                      className="w-12 px-1 py-0.5 text-sm border rounded text-center bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600"
                    />
                    <button type="button" onClick={() => incQty(idx)} className="px-1.5 py-0.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">+</button>
                  </div>
                  <div className="col-span-6 md:col-span-3 px-2 py-1.5 text-right font-semibold text-sm">
                    {usesCategoryPrice ? '—' : lineAmt.toFixed(2)}
                    {discAmt > 0 && <div className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">-{discAmt.toFixed(2)}</div>}
                  </div>
                  <div className="col-span-12 md:col-span-1 px-2 py-1.5 text-right md:text-center">
                    <button
                      type="button"
                      aria-label="Remove item"
                      title="Remove"
                      onClick={() => removeItem(idx)}
                      className="inline-flex items-center justify-center w-5 h-5 text-sm rounded text-gray-600 dark:text-gray-400 hover:text-white hover:bg-red-600 border border-transparent"
                    >×</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
