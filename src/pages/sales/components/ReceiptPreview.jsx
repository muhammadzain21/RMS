import React from 'react'
import { format } from 'date-fns'

export default function ReceiptPreview({
 open,
 onClose,
 items = [],
 orderType,
 waiterId,
 tableNo,
 riderId,
 riderName,
 state,
 payRemarks,
 openKotPrint,
}) {
 if (!open) return null
 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="w-full max-w-md bg-white dark:bg-gray-900 border rounded p-4 space-y-3"><div className="flex items-center justify-between"><div className="text-2xl font-semibold">Order Taken – {orderType}</div><button type="button" onClick={onClose} className="text-gray-500"></button></div><div className="space-y-2"><div className="border p-2 text-center font-semibold">Order Receipt</div>
 {state?.currentTokenNo && <div className="border p-2 text-center">Token No: {state.currentTokenNo}</div>}
 <div className="border p-2 text-center">{orderType}</div><div className="grid grid-cols-2 gap-2 text-sm"><div>Date & Time : {format(new Date(), 'd-M-yyyy h:mm a')}</div>
 {(orderType==='Dine-in' || orderType==='Drive-thru') && (
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
 {payRemarks ? (
 <div className="text-sm">Remarks : {payRemarks}</div>
 ) : null}
 <div className="border-t pt-2"><div className="grid grid-cols-6 font-semibold text-sm"><div className="col-span-5">DESCRIPTION</div><div className="text-right">QTY</div></div><div className="text-sm divide-y">
 {items.map((it, i)=>{
 const m = (state?.menu||[]).find(x=>x.id===it.itemId)
 const name = m ? m.name : it.custom?.name || ''
 if (!name) return null
 return (
 <div key={i} className="grid grid-cols-6 py-1"><div className="col-span-5 truncate">{name}</div><div className="text-right">{it.qty}</div></div>
 )
 })}
 </div></div><div className="grid grid-cols-2 text-sm"><div>Print Date: {format(new Date(), 'd-M-yyyy')}</div><div className="text-right">Print Time: {format(new Date(), 'h:mm a')}</div></div></div><div className="flex justify-end gap-2"><button type="button" className="px-4 py-2 border rounded" onClick={onClose}>OK</button><button type="button" className="px-4 py-2 bg-green-600 text-white rounded" onClick={()=>{ onClose(); openKotPrint(); }}>Print</button></div></div></div>
 )
}
