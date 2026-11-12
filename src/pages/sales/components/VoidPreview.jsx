import React from 'react'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import {
  findCategoryByName,
  resolveItemCategoryName,
  getCategoryPackagePrice,
  categoryKeyOf,
} from '../utils.js'

function packageMetaForItem(it, state) {
  const menu = state?.menu || []
  const categories = state?.categories || []
  const m = menu.find(x => String(x.id) === String(it.itemId))
  const catName = resolveItemCategoryName(m, it)
  if (!catName) return null
  const cat = findCategoryByName(categories, catName)
  const pkg = getCategoryPackagePrice(cat, it)
  // Same rule as KOT/bill: category package price OR min/max = deal grouping
  const isDeal = pkg > 0
    || Number(cat?.minItems || 0) > 0
    || Number(cat?.maxItems || 0) > 0
  if (!isDeal) return null
  return {
    key: categoryKeyOf(cat, catName) || `name:${catName.toLowerCase()}`,
    name: cat?.name || catName,
    packagePrice: pkg,
    menuItem: m,
  }
}

export default function VoidPreview({
  open,
  onClose,
  order, // recalled order snapshot
  reason,
  state,
  openVoidPrint, // function({ items })
}) {
  // Read props safely so hooks can be called unconditionally
  const orderType = order?.orderType || 'Dine-in'
  const tokenNo = order?.tokenNo || ''
  const items = Array.isArray(order?.items) ? order.items : []
  const waiterId = order?.waiterId || ''
  const riderId = order?.riderId || ''
  const riderName = order?.riderName || ''
  const tableNo = order?.tableNo || ''

  // Local selection state: quantity to void per line index (default 0)
  const [qtyToVoid, setQtyToVoid] = React.useState(() => items.map(() => 0))
  React.useEffect(() => { setQtyToVoid(items.map(() => 0)) }, [order])

  // Only render when dialog should be visible and an order is present
  if (!open || !order) return null

  const rows = items.map((it, i) => ({ it, i, pkg: packageMetaForItem(it, state) }))
  const regularRows = rows.filter(r => !r.pkg)
  const dealGroups = []
  const dealIndex = new Map()
  rows.forEach((r) => {
    if (!r.pkg) return
    if (!dealIndex.has(r.pkg.key)) {
      dealIndex.set(r.pkg.key, dealGroups.length)
      dealGroups.push({
        key: r.pkg.key,
        name: r.pkg.name,
        packagePrice: r.pkg.packagePrice,
        indices: [],
        items: [],
      })
    }
    const g = dealGroups[dealIndex.get(r.pkg.key)]
    g.indices.push(r.i)
    g.items.push(r.it)
  })

  const isDealFullySelected = (g) => g.indices.every(i => Number(qtyToVoid[i] || 0) === Number(items[i]?.qty || 0))
  const isDealCleared = (g) => g.indices.every(i => Number(qtyToVoid[i] || 0) === 0)

  const setDealVoid = (g, on) => {
    setQtyToVoid(prev => prev.map((q, idx) => {
      if (!g.indices.includes(idx)) return q
      return on ? Number(items[idx]?.qty || 0) : 0
    }))
  }

  const toggleDeal = (g) => setDealVoid(g, !isDealFullySelected(g))

  const inc = (i) => {
    if (packageMetaForItem(items[i], state)) {
      toast.error('Deal items must be voided together — use the deal toggle')
      return
    }
    setQtyToVoid(prev => prev.map((q, idx) => idx === i ? Math.min((items[i]?.qty || 0), q + 1) : q))
  }
  const dec = (i) => {
    if (packageMetaForItem(items[i], state)) {
      toast.error('Deal items must be voided together — use the deal toggle')
      return
    }
    setQtyToVoid(prev => prev.map((q, idx) => idx === i ? Math.max(0, q - 1) : q))
  }
  const onInput = (i, v) => {
    if (packageMetaForItem(items[i], state)) {
      toast.error('Deal items must be voided together — use the deal toggle')
      return
    }
    const n = Math.floor(Number(v) || 0)
    const max = Math.max(0, Number(items[i]?.qty || 0))
    setQtyToVoid(prev => prev.map((q, idx) => idx === i ? Math.max(0, Math.min(max, n)) : q))
  }

  const selectedItems = items
    .map((it, i) => ({ ...it, qty: qtyToVoid[i] }))
    .filter(it => Number(it.qty || 0) > 0)

  const confirmVoid = () => {
    // Safety: no partial voids inside a category-priced deal
    for (const g of dealGroups) {
      const fully = isDealFullySelected(g)
      const cleared = isDealCleared(g)
      if (!fully && !cleared) {
        toast.error(`Void all of "${g.name}" together, or leave it — single deal items cannot be voided`)
        return
      }
    }
    openVoidPrint({ items: selectedItems })
    onClose()
  }

  const itemName = (it) => {
    const m = (state?.menu || []).find(x => String(x.id) === String(it.itemId))
    const size = String(it?.mods?.size || it?.size || '').trim().toUpperCase()
    const flvs = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
    if (flvs.length) {
      const names = flvs.map(fid => (state?.menu || []).find(x => String(x.id) === String(fid))?.name).filter(Boolean)
      const title = names.join(' + ') || (it.custom?.name || m?.name || it.name || '')
      return size ? `${title} (${size})` : title
    }
    const base = m ? m.name : (it.custom?.name || it.name || '')
    return size ? `${base} (${size})` : base
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 border rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-2xl font-semibold">Order Void – {orderType}</div>
          <button type="button" onClick={onClose} className="text-gray-500" />
        </div>
        <div className="space-y-2">
          <div className="border p-2 text-center font-semibold">Void Receipt</div>
          {tokenNo ? <div className="border p-2 text-center">Token No: {tokenNo}</div> : null}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Date & Time : {format(new Date(), 'd-M-yyyy h:mm a')}</div>
            {(orderType === 'Dine-in' || orderType === 'Foodpanda' || orderType === 'Drive-thru') && (
              <div>Waiter : {(state?.staff || []).find(s => s.id === waiterId)?.name || '-'}</div>
            )}
            <div>User : {(state?.user?.name) || 'ADMIN'}</div>
            {orderType === 'Dine-in' && (
              <div className="col-span-2">Table : {tableNo || '-'}</div>
            )}
            {orderType === 'Delivery' && (
              <div className="col-span-2">Rider : {riderName || (state?.riders || []).find(r => r.id === riderId)?.name || '-'}</div>
            )}
          </div>
          {reason ? (
            <div className="text-sm">Reason : {reason}</div>
          ) : null}
          <div className="border-t pt-2">
            <div className="grid grid-cols-12 font-semibold text-sm">
              <div className="col-span-6">DESCRIPTION</div>
              <div className="text-right col-span-2">In Order</div>
              <div className="text-center col-span-4">Void Qty</div>
            </div>
            <div className="text-sm divide-y">
              {dealGroups.map((g) => {
                const on = isDealFullySelected(g)
                const totalQty = g.items.reduce((s, it) => s + Number(it.qty || 0), 0)
                return (
                  <div key={g.key} className="py-2 space-y-1 bg-amber-50/60 dark:bg-amber-950/20 -mx-1 px-1 rounded">
                    <div className="grid grid-cols-12 items-center gap-1">
                      <div className="col-span-6 min-w-0">
                        <div className="font-semibold truncate">{g.name}:</div>
                        <div className="text-[10px] text-amber-700 dark:text-amber-300">
                          Void all items together{g.packagePrice > 0 ? ` · deal ${g.packagePrice}` : ''}
                        </div>
                      </div>
                      <div className="text-right col-span-2">{totalQty}</div>
                      <div className="col-span-4 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => toggleDeal(g)}
                          className={`px-3 py-1.5 rounded text-xs font-bold ${on ? 'bg-red-600 text-white' : 'border bg-white dark:bg-gray-800'}`}
                        >
                          {on ? 'Deal selected' : 'Void deal'}
                        </button>
                      </div>
                    </div>
                    {g.items.map((it, idx) => {
                      const name = itemName(it)
                      if (!name) return null
                      return (
                        <div key={`${g.key}-${idx}`} className="grid grid-cols-12 text-[11px] text-gray-600 dark:text-gray-300 pl-2">
                          <div className="col-span-8 truncate">· {name}</div>
                          <div className="col-span-4 text-right">×{Number(it.qty || 0)}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {regularRows.map(({ it, i }) => {
                const name = itemName(it)
                if (!name) return null
                const max = Number(it.qty || 0)
                return (
                  <div key={i} className="grid grid-cols-12 py-1 items-center">
                    <div className="col-span-6 truncate">{name}</div>
                    <div className="text-right col-span-2">{max}</div>
                    <div className="col-span-4 flex items-center justify-end gap-2">
                      <button type="button" className="px-2 py-1 border rounded" onClick={() => dec(i)}>-</button>
                      <input
                        className="w-16 border rounded text-center px-2 py-1"
                        value={Number(qtyToVoid[i] ?? 0)}
                        onChange={e => onInput(i, e.target.value)}
                      />
                      <button type="button" className="px-2 py-1 border rounded" onClick={() => inc(i)}>+</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 text-sm">
            <div>Print Date: {format(new Date(), 'd-M-yyyy')}</div>
            <div className="text-right">Print Time: {format(new Date(), 'h:mm a')}</div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="px-4 py-2 border rounded" onClick={onClose}>Close</button>
          <button
            type="button"
            className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
            disabled={!selectedItems.length}
            onClick={confirmVoid}
          >
            Void
          </button>
        </div>
      </div>
    </div>
  )
}
