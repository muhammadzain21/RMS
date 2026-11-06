import React from 'react'
import { format } from 'date-fns'

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

 // Local selection state: quantity to void per line index (default to FULL qty)
 const [qtyToVoid, setQtyToVoid] = React.useState(() => items.map(() => 0))
 React.useEffect(() => { setQtyToVoid(items.map(() => 0)) }, [order])

 // Only render when dialog should be visible and an order is present
 if (!open || !order) return null

 const inc = (i) => setQtyToVoid(prev => prev.map((q,idx)=> idx===i ? Math.min((items[i]?.qty||0), q+1) : q))
 const dec = (i) => setQtyToVoid(prev => prev.map((q,idx)=> idx===i ? Math.max(0, q-1) : q))
 const onInput = (i, v) => {
 const n = Math.floor(Number(v)||0)
 const max = Math.max(0, Number(items[i]?.qty||0))
 setQtyToVoid(prev => prev.map((q,idx)=> idx===i ? Math.max(0, Math.min(max, n)) : q))
 }

 const selectedItems = items
 .map((it, i) => ({ ...it, qty: qtyToVoid[i] }))
 .filter(it => Number(it.qty||0) > 0)

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="w-full max-w-md bg-white dark:bg-gray-900 border rounded p-4 space-y-3"><div className="flex items-center justify-between"><div className="text-2xl font-semibold">Order Void – {orderType}</div><button type="button" onClick={onClose} className="text-gray-500"></button></div><div className="space-y-2"><div className="border p-2 text-center font-semibold">Void Receipt</div>
 {tokenNo ? <div className="border p-2 text-center">Token No: {tokenNo}</div> : null}
 <div className="grid grid-cols-2 gap-2 text-sm"><div>Date & Time : {format(new Date(), 'd-M-yyyy h:mm a')}</div>
 {(orderType==='Dine-in' || orderType==='Foodpanda' || orderType==='Drive-thru') && (
 <div>Waiter : {(state?.staff||[]).find(s=>s.id===waiterId)?.name || '-'}</div>
 )}
 <div>User : {(state?.user?.name)||'ADMIN'}</div>
 {orderType==='Dine-in' && (
 <div className="col-span-2">Table : {tableNo || '-'}</div>
 )}
 {orderType==='Delivery' && (
 <div className="col-span-2">Rider : {riderName || (state?.riders||[]).find(r=>r.id===riderId)?.name || '-'}</div>
 )}
 </div>
 {reason ? (
 <div className="text-sm">Reason : {reason}</div>
 ) : null}
 <div className="border-t pt-2"><div className="grid grid-cols-12 font-semibold text-sm"><div className="col-span-6">DESCRIPTION</div><div className="text-right col-span-2">In Order</div><div className="text-center col-span-4">Void Qty</div></div><div className="text-sm divide-y">
 {items.map((it, i)=>{
 const m = (state?.menu||[]).find(x=>x.id===it.itemId)
 const name = m ? m.name : it.custom?.name || ''
 if (!name) return null
 const max = Number(it.qty||0)
 return (
 <div key={i} className="grid grid-cols-12 py-1 items-center"><div className="col-span-6 truncate">{name}</div><div className="text-right col-span-2">{max}</div><div className="col-span-4 flex items-center justify-end gap-2"><button type="button" className="px-2 py-1 border rounded" onClick={()=>dec(i)}>-</button><input className="w-16 border rounded text-center px-2 py-1" value={Number(qtyToVoid[i] ?? 0)}
 onChange={e=>onInput(i, e.target.value)} /><button type="button" className="px-2 py-1 border rounded" onClick={()=>inc(i)}>+</button></div></div>
 )
 })}
 </div></div><div className="grid grid-cols-2 text-sm"><div>Print Date: {format(new Date(), 'd-M-yyyy')}</div><div className="text-right">Print Time: {format(new Date(), 'h:mm a')}</div></div></div><div className="flex justify-end gap-2"><button type="button" className="px-4 py-2 border rounded" onClick={onClose}>Close</button><button
 type="button"
 className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
 disabled={!selectedItems.length}
 onClick={()=>{ openVoidPrint({ items: selectedItems }); onClose(); }}
 >
 Void
 </button></div></div></div>
 )
}
