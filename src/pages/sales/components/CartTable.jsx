import React from 'react'

export default function CartTable({ items = [], menu = [], categories = [], decQty, incQty, updateItem, removeItem, lineTotal, onEditItem }) {
 return (
 <div className="border-2 border-indigo-200 rounded-lg overflow-x-auto max-w-full bg-gradient-to-br from-indigo-50/80 to-white dark:from-indigo-950/30 dark:to-gray-900 dark:border-indigo-800 shadow-sm lg:flex-1 lg:min-h-0 lg:flex lg:flex-col"><div className="hidden md:grid grid-cols-12 bg-gradient-to-r from-indigo-100 to-indigo-50 dark:from-indigo-900/60 dark:to-indigo-950/40 dark:text-indigo-100 text-xs font-bold min-w-0 border-b-2 border-indigo-200 dark:border-indigo-800"><div className="col-span-6 px-2 py-2 border-r border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-100">NAME</div><div className="col-span-2 px-2 py-2 border-r border-indigo-200 dark:border-indigo-800 text-center text-indigo-900 dark:text-indigo-100">QTY</div><div className="col-span-3 px-2 py-2 border-r border-indigo-200 dark:border-indigo-800 text-right text-indigo-900 dark:text-indigo-100">PRICE</div><div className="col-span-1 px-1 py-2 text-center text-indigo-900 dark:text-indigo-100">DEL</div></div><div className="h-[24vh] min-h-[130px] lg:h-auto lg:flex-1 lg:min-h-0 overflow-y-auto overflow-x-hidden">
 {items.length === 0 ? (
 <div className="h-full flex flex-col items-center justify-center text-xs text-gray-500 dark:text-gray-400"><span className="text-4xl mb-2"></span><p>No items in cart</p></div>
 ) : (
 <div className="divide-y min-w-0">
 {items.map((it, idx) => {
 const m = menu.find(m => m.id === it.itemId)
 const baseName = m ? m.name : (it.custom?.name || it.name || `Item ${it.itemId || idx+1}`)
 const size = (it?.mods?.size || it?.size || '').toString().toUpperCase()
 // Determine applicable discount (item > category, one at a time)
 const itemDisc = m ? Number(m.discount || 0) : 0
 let discPct = 0
 let discSource = ''
 if (itemDisc > 0) {
 discPct = itemDisc
 discSource = 'item'
 } else if (m && m.category) {
 const cat = categories.find(c => c.name === m.category)
 if (cat && Number(cat.discount || 0) > 0) {
 discPct = Number(cat.discount)
 discSource = 'category'
 }
 }
 const lineAmt = Number(lineTotal(m, it) || 0)
 const discAmt = discPct > 0 ? Math.round(lineAmt * (discPct / 100)) : 0
 // Prefer flavour title when present
 const flavourTitle = (()=>{
 const ids = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
 if (!ids.length) return ''
 const names = ids.map(fid => (menu.find(x=>x.id===fid)?.name || '')).filter(Boolean)
 return names.join(' + ')
 })()
 const title = flavourTitle || baseName
 const displayName = size ? `${title} (${size})` : title
 // Show unit price computed by pricing engine for clarity (size-aware)
 const unitPrice = Number(lineTotal(m, { ...it, qty: 1 }))
 return (
 <div key={idx} className="grid grid-cols-12 md:grid-cols-12 items-center text-sm md:text-base min-w-0"><div className="col-span-12 md:col-span-6 px-2 py-1.5 min-w-0"><div className="font-semibold text-sm whitespace-normal break-words leading-tight">{displayName}</div><div className="text-[10px] text-gray-600 dark:text-gray-400">Unit PKRs {unitPrice.toFixed(2)}</div>{discPct > 0 && <div className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">{discPct}% off (-PKRs {discAmt})</div>}</div><div className="col-span-6 md:col-span-2 px-2 py-1.5 flex items-center justify-between md:justify-center gap-1"><button type="button" onClick={()=>decQty(idx)} className="px-1.5 py-0.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">-</button><input type="number" value={it.qty} onChange={e=>updateItem(idx, { qty: Math.max(1, Number(e.target.value)||1) })} className="w-12 px-1 py-0.5 text-sm border rounded text-center bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600" /><button type="button" onClick={()=>incQty(idx)} className="px-1.5 py-0.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">+</button></div><div className="col-span-6 md:col-span-3 px-2 py-1.5 text-right font-semibold text-sm">{lineAmt.toFixed(2)}{discAmt > 0 && <div className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">-{discAmt.toFixed(2)}</div>}</div><div className="col-span-12 md:col-span-1 px-2 py-1.5 text-right md:text-center"><button
 type="button"
 aria-label="Remove item"
 title="Remove"
 onClick={()=>removeItem(idx)}
 className="inline-flex items-center justify-center w-5 h-5 text-sm rounded text-gray-600 dark:text-gray-400 hover:text-white hover:bg-red-600 border border-transparent"
 >
 ×
 </button></div></div>
 )
 })}
 </div>
 )}
 </div></div>
 )
}
