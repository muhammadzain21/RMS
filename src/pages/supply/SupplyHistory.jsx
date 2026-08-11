import { useData } from '../../state/DataContext.jsx'
import { useMemo, useState, useEffect } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'

export default function SupplyHistory() {
 const { state, dispatch, businessDate } = useData()
 const { token } = useAuth()
 const { confirm, ConfirmDialog } = useConfirm()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const [from, setFrom] = useState(businessDate || '')
 const [to, setTo] = useState(businessDate || '')
 const [search, setSearch] = useState('')
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
 const [jump, setJump] = useState(1)
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 // Reload supplies on first render to ensure latest data
 useEffect(() => { reloadSupplies(true) }, [])

 const rows = useMemo(() => {
 let list = state.supplies || []
 if (from && to) list = list.filter(s => s.date >= from && s.date <= to)
 return list
 }, [state.supplies, from, to])

 const backfillCandidates = useMemo(() => {
 // Ingredients that have supplierId but no corresponding supply on record
 const haveSupplies = new Set((state.supplies||[]).map(sp => `${sp.supplierId}|${sp.date}`))
 return (state.ingredients||[])
 .filter(ing => ing.supplierId)
 .map(ing => ({ ing, key: `${ing.supplierId}|${String(businessDate||'').slice(0,10) || new Date().toLocaleDateString('en-CA')}` }))
 .filter(({ key }) => !haveSupplies.has(key))
 }, [state.ingredients, state.supplies])
 const generateFromIngredients = async () => {
 if (!backfillCandidates.length) return
 const confirmed = await confirm({ title: 'Generate Supplies', message: `Create ${backfillCandidates.length} supply record(s) from ingredients with suppliers?` })
 if (!confirmed) return
 for (const { ing } of backfillCandidates) {
 try {
 const sup = (state.suppliers||[]).find(s => s.id === ing.supplierId)
 const payload = {
 date: String(businessDate||'').slice(0,10) || new Date().toLocaleDateString('en-CA'),
 supplierId: ing.supplierId,
 supplier: sup?.name || sup?.company || '',
 items: [{ name: ing.name, qty: Number(ing.qty||0), unit: ing.unit || '', price: Number(ing.price||0) }],
 cost: Number((Number(ing.qty||0) * Number(ing.price||0)).toFixed(2))
 }
 const res = await fetch(`${API}/api/supplies`, { method: 'POST', headers, body: JSON.stringify(payload) })
 if (!res.ok) {
 const msg = await res.text().catch(()=>String(res.status))
 toast.error(`Failed to create supply for ${ing.name}: ${res.status} ${msg}`)
 }
 } catch {}
 }
 // Rehydrate supplies from backend so entries appear even if local reducer blocked additions due to day close
 try {
 const resList = await fetch(`${API}/api/supplies`, { headers })
 if (resList.ok) {
 const rows = await resList.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 dispatch({ type: 'HYDRATE', payload: { supplies: (rows||[]).map(mapId) } })
 }
 } catch {}
 toast.success('Backfill complete')
 }

 const reloadSupplies = async (silent = false) => {
 try {
 const resList = await fetch(`${API}/api/supplies`, { headers })
 if (!resList.ok) { if (!silent) toast.error(`Reload failed: ${resList.status}`); return }
 const rows = await resList.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 dispatch({ type: 'HYDRATE', payload: { supplies: (rows||[]).map(mapId) } })
 if (!silent) toast.success('Supplies reloaded')
 } catch { if (!silent) toast.error('Network error reloading supplies') }
 }
 // Expand items into individual rows for the detail table
 const expandedRows = useMemo(() => {
 const out = []
 for (const r of rows) {
 for (const it of (r.items || [])) {
 out.push({
 id: r.id + '_' + (it.name || ''),
 supplyId: r.id,
 date: r.date,
 supplier: (() => { const sup = (state.suppliers||[]).find(s => s.id === r.supplierId); return sup?.name || sup?.company || r.supplier || '-' })(),
 name: it.name || '-',
 qty: Number(it.qty || 0),
 unit: it.unit || '',
 unitPrice: Number(it.price || 0),
 totalPrice: Number((Number(it.qty||0) * Number(it.price||0)).toFixed(2)),
 })
 }
 }
 return out
 }, [rows, state.suppliers])

 const filteredExpanded = useMemo(() => {
 if (!search.trim()) return expandedRows
 const q = search.trim().toLowerCase()
 return expandedRows.filter(r =>
 r.name.toLowerCase().includes(q) ||
 r.supplier.toLowerCase().includes(q) ||
 r.date.includes(q) ||
 r.unit.toLowerCase().includes(q)
 )
 }, [expandedRows, search])

 const totalSupplies = rows.length
 const totalCost = useMemo(() => rows.reduce((a, r) => a + Number(r.cost || 0), 0), [rows])
 const totalItems = filteredExpanded.length
 const totalQty = useMemo(() => filteredExpanded.reduce((a, r) => a + r.qty, 0), [filteredExpanded])
 const paginatedExpanded = filteredExpanded.slice((page - 1) * limit, page * limit)
 const expandedPages = Math.ceil(filteredExpanded.length / limit) || 1

 return (
 <div className="space-y-4">
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
 <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Supply History</h1>
 </div>

 {/* Summary Widgets */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
 <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4">
 <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Supplies</div>
 <div className="text-2xl font-bold mt-1 text-slate-800 dark:text-slate-100">{totalSupplies}</div>
 <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">transactions</div>
 </div>
 <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4">
 <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Cost</div>
 <div className="text-2xl font-bold mt-1 text-emerald-600">PKR {totalCost.toLocaleString()}</div>
 <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">spent</div>
 </div>
 <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4">
 <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Items</div>
 <div className="text-2xl font-bold mt-1 text-slate-800 dark:text-slate-100">{totalItems}</div>
 <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">line items</div>
 </div>
 <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4">
 <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Quantity</div>
 <div className="text-2xl font-bold mt-1 text-amber-600">{totalQty.toLocaleString()}</div>
 <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">units purchased</div>
 </div>
 </div>

 {/* Filters */}
 <div className="flex flex-row flex-nowrap items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-2 border-indigo-200 dark:border-indigo-800">
 <div className="flex-shrink-0"><DatePicker label="From" value={from} onChange={v=>setFrom(v)} /></div>
 <div className="flex-shrink-0"><DatePicker label="To" value={to} onChange={v=>setTo(v)} /></div>
 <div className="flex-1 min-w-0"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Search</label><input value={search} onChange={e=>{ setSearch(e.target.value); setPage(1) }} placeholder="Name, supplier, date, unit..." className="mt-1 w-full px-3 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all" /></div>
 <button type="button" onClick={reloadSupplies} className="px-4 py-2 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">Reload</button>
 {backfillCandidates.length > 0 && (
 <button type="button" onClick={generateFromIngredients} className="px-4 py-2 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">Generate from Ingredients ({backfillCandidates.length})</button>
 )}
 </div>

 {/* Detail Table */}
 <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto shadow-sm">
 <table className="min-w-full text-sm">
 <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
 <tr>
 <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Date</th>
 <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Supplier</th>
 <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Name</th>
 <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Qty</th>
 <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Unit</th>
 <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Unit Price</th>
 <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Total Price</th>
 </tr>
 </thead>
 <tbody>
 {paginatedExpanded.map(r => (
 <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
 <td className="p-3 text-gray-700 dark:text-gray-300">{r.date}</td>
 <td className="p-3 text-gray-600 dark:text-gray-400">{r.supplier}</td>
 <td className="p-3 text-gray-700 dark:text-gray-300 font-medium">{r.name}</td>
 <td className="p-3 text-gray-700 dark:text-gray-300 text-right">{r.qty}</td>
 <td className="p-3 text-gray-600 dark:text-gray-400">{r.unit}</td>
 <td className="p-3 text-gray-700 dark:text-gray-300 text-right">PKR {r.unitPrice.toLocaleString()}</td>
 <td className="p-3 text-gray-700 dark:text-gray-300 text-right font-semibold">PKR {r.totalPrice.toLocaleString()}</td>
 </tr>
 ))}
 {!filteredExpanded.length && (
 <tr><td colSpan={7} className="p-8 text-center text-gray-500 dark:text-gray-400"><div className="text-4xl mb-2"></div><div>No supply records found</div></td></tr>
 )}
 </tbody>
 {filteredExpanded.length > 0 && (
 <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
 <tr className="border-t">
 <td className="p-3 text-gray-700 dark:text-gray-300" colSpan={3}>Totals</td>
 <td className="p-3 text-gray-700 dark:text-gray-300 text-right">{totalQty.toLocaleString()}</td>
 <td className="p-3"></td>
 <td className="p-3"></td>
 <td className="p-3 text-emerald-600 dark:text-emerald-400 text-right">PKR {totalCost.toLocaleString()}</td>
 </tr>
 </tfoot>
 )}
 </table>
 </div>

 {/* Pagination controls */}
 <Pagination page={page} pages={expandedPages} total={filteredExpanded.length} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} />
 {ConfirmDialog}
 </div>
 )
}
