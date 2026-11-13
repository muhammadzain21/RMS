import React, { useEffect, useMemo, useRef, useState } from 'react'
import Pagination from '../../../components/Pagination.jsx'

const ORDER_STATUS_CHIP = {
  ordered: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  preparing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  ready: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}
const ORDER_STATUS_LABEL = {
  ordered: 'Ordered', new: 'KOT Sent', preparing: 'Preparing', ready: 'Ready', completed: 'Complete',
}

export default function RecallDialog({
 open,
 onClose,
 recalls = [],
 API,
 authHeaders,
 staff = [],
 tables = [],
 onRecall = ()=>{},
 onPay = ()=>{},
 onCustomerBill = ()=>{},
}) {
 const canonicalType = (v) => {
 const t = String(v||'').trim().toLowerCase()
 if (t === 'dine-in' || t === 'dine in') return 'Dine-in'
 if (t === 'take-away' || t === 'takeaway' || t === 'take away') return 'Take-away'
 if (t === 'delivery') return 'Delivery'
 if (t === 'drive-thru' || t === 'drivethru' || t === 'drive thru' || t === 'drive-through' || t === 'foodpanda') return 'Foodpanda'
 return String(v||'')
 }
 const [waiterFilter, setWaiterFilter] = useState('')
 const [search, setSearch] = useState('')
 const [typeFilter, setTypeFilter] = useState('') // '', 'Dine-in','Take-away','Delivery','Foodpanda'

 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
 const [pages, setPages] = useState(1)
 const [total, setTotal] = useState(0)
 const [jump, setJump] = useState(1)
 const [loading, setLoading] = useState(false)
 const [serverRows, setServerRows] = useState([])
 const [hasLoaded, setHasLoaded] = useState(false)

 const canFetch = Boolean(API)
 const effectiveRows = canFetch ? serverRows : (Array.isArray(recalls) ? recalls : [])
 
 // Start with loading=true when using server fetch to prevent empty table flash
 const showLoading = loading || (canFetch && !hasLoaded)

 useEffect(() => {
 if (!open) return
 if (page !== 1) setPage(1)
 }, [open, waiterFilter, typeFilter, limit])

 useEffect(() => {
 if (!open) return
 if (!canFetch) return

 const waiterId = String(waiterFilter || '').trim()
 const orderType = String(typeFilter || '').trim()
 const q = String(search || '').trim()

 const ctrl = new AbortController()
 ;(async () => {
 try {
 setLoading(true)
 const params = new URLSearchParams()
 params.set('page', String(page))
 params.set('limit', String(limit))
 if (waiterId) params.set('waiterId', waiterId)
 if (orderType) params.set('orderType', orderType)
 if (q) params.set('search', q)
 const res = await fetch(`${API}/api/recalls?${params.toString()}`, { headers: authHeaders, signal: ctrl.signal, cache: 'no-store' })
 if (!res.ok) return
 const data = await res.json()
 const rows = Array.isArray(data?.data) ? data.data : []
 setServerRows(rows)
 setTotal(Number(data?.total || rows.length || 0))
 setPages(Number(data?.pages || 1))
 setHasLoaded(true)
 } catch {}
 finally { setLoading(false) }
 })()
 return () => ctrl.abort()
 }, [open, canFetch, API, authHeaders, page, limit, waiterFilter, typeFilter, search])

 const filtered = useMemo(() => {
 if (canFetch) return effectiveRows
 let list = Array.isArray(effectiveRows) ? effectiveRows : []
 if (waiterFilter) list = list.filter(r => (r.waiterId||'') === waiterFilter)
 if (typeFilter) list = list.filter(r => canonicalType(r.orderType) === typeFilter)
 if (search) {
 const q = search.toLowerCase()
 list = list.filter(r =>
 String(r.customer?.name||'').toLowerCase().includes(q) ||
 String(r.customer?.address||'').toLowerCase().includes(q) ||
 String(r.tableNo||'').toLowerCase().includes(q) ||
 String(r.orderType||'').toLowerCase().includes(q) ||
 String(r.remarks||'').toLowerCase().includes(q)
 )
 }
 return list
 }, [canFetch, effectiveRows, waiterFilter, typeFilter, search])

 const counts = useMemo(() => {
 const c = { 'Dine-in': 0, 'Take-away': 0, 'Delivery': 0, 'Foodpanda': 0 }
 for (const r of (effectiveRows||[])) {
 const ct = canonicalType(r.orderType)
 if (Object.prototype.hasOwnProperty.call(c, ct)) c[ct]++
 }
 return c
 }, [effectiveRows])

 if (!open) return null
 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="w-full max-w-7xl max-h-[85vh] bg-white dark:bg-gray-900 border rounded-xl p-4 flex flex-col"><div className="flex items-start justify-between gap-3"><div><div className="text-xl font-semibold dark:text-gray-100">Select Order</div><div className="text-xs text-gray-500 dark:text-gray-400">Recall, pay, or print customer bill</div></div><button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"></button></div><div className="mt-3 grid grid-cols-12 gap-3 items-end"><div className="col-span-12 sm:col-span-4"><div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Choose Waiters:</div><select value={waiterFilter} onChange={e=>setWaiterFilter(e.target.value)} className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 dark:border-gray-600"><option value="">All Waiters</option>
 {(staff||[]).map(w => (
 <option key={w.id} value={w.id}>{w.name}</option>
 ))}
 </select></div><div className="col-span-12 sm:col-span-6 flex gap-2 flex-wrap">
 {['Dine-in','Take-away','Delivery','Foodpanda'].map(t => (
 <button
 key={t}
 type="button"
 onClick={()=> setTypeFilter(typeFilter===t ? '' : t)}
 className={`px-3 py-2 rounded border text-sm ${typeFilter===t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100'}`}
 >{t} {counts[t] || 0}</button>
 ))}
 </div><div className="col-span-12 sm:col-span-2"><div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Search:</div><input value={search} onChange={e=>setSearch(e.target.value)} className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 dark:border-gray-600" /></div></div><div className="mt-3 overflow-x-auto overflow-y-auto flex-1 min-h-[200px] rounded border dark:border-gray-700 relative">
 {showLoading && (
 <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 z-10 flex items-center justify-center"><span className="text-gray-500">Loading...</span></div>
 )}
 <table className="min-w-full text-sm"><thead><tr className="text-left bg-gray-50 dark:bg-gray-800 sticky top-0"><th className="px-3 py-2 dark:text-gray-300">ORDER TIME</th><th className="px-3 py-2 dark:text-gray-300">TOKEN NO</th><th className="px-3 py-2 dark:text-gray-300">CUSTOMER NAME</th><th className="px-3 py-2 dark:text-gray-300">CUSTOMER ADDRESS</th><th className="px-3 py-2 dark:text-gray-300">WAITER</th><th className="px-3 py-2 dark:text-gray-300">TABLE / FLOOR</th><th className="px-3 py-2 dark:text-gray-300">ORDER TYPE</th><th className="px-3 py-2 dark:text-gray-300">REMARKS</th><th className="px-3 py-2 dark:text-gray-300">STATUS</th><th className="px-3 py-2 dark:text-gray-300">RECALL</th><th className="px-3 py-2 dark:text-gray-300">PAY</th><th className="px-3 py-2 dark:text-gray-300">TOTAL AMOUNT</th><th className="px-3 py-2 dark:text-gray-300">CUSTOMER BILL</th></tr></thead><tbody>
 {filtered.map((r) => (
 <tr key={r.id} className="border-t dark:border-gray-700"><td className="px-3 py-2 dark:text-gray-300">{r.createdAt ? new Date(r.createdAt).toLocaleString() : '-'}</td><td className="px-3 py-2 font-medium text-blue-600 dark:text-blue-400">{r.tokenNo || '-'}</td><td className="px-3 py-2 dark:text-gray-300">{r.customer?.name || '-'}</td><td className="px-3 py-2 dark:text-gray-300">{r.customer?.address || '-'}</td><td className="px-3 py-2 dark:text-gray-300">{r.waiterName || '-'}</td><td className="px-3 py-2 dark:text-gray-300 whitespace-nowrap">{(() => {
 const tableNo = r.tableNo || ''
 if (!tableNo) return '-'
 const tableObj = tables.find(t => (t.name || t.label || t.code || String(t)) === tableNo)
 const floor = tableObj?.floor
 return floor ? `${tableNo} · ${floor}` : tableNo
 })()}</td><td className="px-3 py-2 dark:text-gray-300">{r.orderType || '-'}</td><td className="px-3 py-2 dark:text-gray-300 max-w-[180px]"><span className="line-clamp-2" title={r.remarks || ''}>{r.remarks || '—'}</span></td><td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ORDER_STATUS_CHIP[r.orderStatus] || ORDER_STATUS_CHIP.ordered}`}>{ORDER_STATUS_LABEL[r.orderStatus] || 'Ordered'}</span></td><td className="px-3 py-2"><button className="px-2 py-1 rounded bg-blue-600 text-white" onClick={()=>onRecall(r)} title="Recall">⟲</button></td><td className="px-3 py-2"><button className="px-3 py-1 rounded bg-green-600 text-white text-xs font-medium" onClick={()=>onPay(r)} title="Pay">Pay</button></td><td className="px-3 py-2 dark:text-gray-300">{Number(r.totalAmount||0).toLocaleString()}</td><td className="px-3 py-2"><button className="px-3 py-1 rounded bg-sky-600 text-white text-xs font-medium" onClick={()=>onCustomerBill(r)} title="Customer Bill">Bill</button></td></tr>
 ))}
 {!showLoading && hasLoaded && filtered.length === 0 && (
 <tr><td className="px-3 py-8 text-center text-gray-500 dark:text-gray-400" colSpan={13}>No recalled orders</td></tr>
 )}
 </tbody></table></div><div className="flex items-center justify-between mt-4"><Pagination page={page} pages={pages} total={canFetch ? total : (recalls||[]).length} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1); }} onPageChange={setPage} loading={loading} /><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium transition-all dark:text-gray-100 ml-2">Close</button></div></div></div>
 )
}
