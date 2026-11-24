import React, { useMemo, useState } from 'react'

export default function HeldDialog({
 open,
 onClose,
 helds = [],
 onRecall = ()=>{},
 onDelete = ()=>{},
 onPrint = ()=>{},
}) {
 const [typeFilter, setTypeFilter] = useState('')
 const [search, setSearch] = useState('')

 const filtered = useMemo(() => {
 let list = Array.isArray(helds) ? helds : []
 if (typeFilter) list = list.filter(h => (h.orderType||'') === typeFilter)
 if (search) {
 const q = search.toLowerCase()
 list = list.filter(h =>
 String(h.customer?.name||'').toLowerCase().includes(q) ||
 String(h.customer?.address||'').toLowerCase().includes(q) ||
 String(h.tableNo||'').toLowerCase().includes(q) ||
 String(h.orderType||'').toLowerCase().includes(q)
 )
 }
 return list
 }, [helds, typeFilter, search])

 if (!open) return null
 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4"><div className="w-full max-w-6xl max-h-[90vh] bg-white dark:bg-gray-900 border rounded-xl p-3 sm:p-4 flex flex-col"><div className="flex items-start justify-between"><div className="text-xl font-semibold">Held Sales</div><button onClick={onClose} className="text-gray-500 hover:text-gray-800"></button></div><div className="mt-3 flex flex-col sm:grid sm:grid-cols-12 gap-3 items-start sm:items-end"><div className="sm:col-span-7 flex flex-wrap gap-2">
 {['Dine-in','Take-away','Delivery','Foodpanda'].map(t => (
 <button
 key={t}
 type="button"
 onClick={()=> setTypeFilter(typeFilter===t ? '' : t)}
 className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded border text-xs sm:text-sm transition-colors ${typeFilter===t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
 >{t}</button>
 ))}
 </div><div className="w-full sm:col-span-5"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name/address/table/type" className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 placeholder-gray-400 dark:placeholder-gray-500 text-sm" /></div></div><div className="mt-3 overflow-auto flex-1 max-h-[50vh] sm:max-h-[55vh]"><table className="min-w-full text-sm"><thead><tr className="text-left bg-gray-50 dark:bg-gray-800"><th className="px-3 py-2">CREATED</th><th className="px-3 py-2">CUSTOMER</th><th className="px-3 py-2">ADDRESS</th><th className="px-3 py-2">TABLE</th><th className="px-3 py-2">ORDER TYPE</th><th className="px-3 py-2">ITEMS</th><th className="px-3 py-2 text-right">ACTIONS</th></tr></thead><tbody>
 {filtered.map(h => (
 <tr key={h.id} className="border-t"><td className="px-3 py-2">{h.createdAt ? new Date(h.createdAt).toLocaleString() : '-'}</td><td className="px-3 py-2">{h.customer?.name || '-'}</td><td className="px-3 py-2">{h.customer?.address || '-'}</td><td className="px-3 py-2">{h.tableNo || '-'}</td><td className="px-3 py-2">{h.orderType || '-'}</td><td className="px-3 py-2">{Array.isArray(h.items) ? h.items.length : 0}</td><td className="px-3 py-2 text-right space-x-2"><button className="px-2 py-1 rounded bg-green-600 text-white" onClick={()=>onPrint(h)}>Print</button><button className="px-2 py-1 rounded bg-blue-600 text-white" onClick={()=>onRecall(h)}>Load</button><button className="px-2 py-1 rounded bg-red-600 text-white" onClick={()=>onDelete(h)}>Delete</button></td></tr>
 ))}
 {filtered.length === 0 && (
 <tr><td className="px-3 py-8 text-center text-gray-500" colSpan={7}>No held sales</td></tr>
 )}
 </tbody></table></div><div className="mt-3 flex items-center justify-end pt-2 border-t dark:border-gray-700"><button type="button" onClick={onClose} className="px-3 py-2 rounded border text-sm">Close</button></div></div></div>
 )
}
