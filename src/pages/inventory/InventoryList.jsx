import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { addDays, format } from 'date-fns'
import { useMemo, useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import UpdateStockDialog from '../../components/UpdateStockDialog.jsx'
import IngredientModal from '../../components/IngredientModal.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import Pagination from '../../components/Pagination.jsx'

export default function InventoryList() {
 const { state, dispatch, businessDate } = useData()
 const { token } = useAuth()
 const { confirm, ConfirmDialog } = useConfirm()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const [updateOpen, setUpdateOpen] = useState(false)
 const [ingModalOpen, setIngModalOpen] = useState(false)
 const [editingItem, setEditingItem] = useState(null)
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(20)
 const [jump, setJump] = useState(1)

 const refreshIngredients = async () => {
 try {
 const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const res = await fetch(`${API}/api/ingredients`, { headers, cache: 'no-store' })
 if (res.ok) {
 const rows = await res.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 dispatch({ type: 'HYDRATE', payload: { ingredients: (rows || []).map(mapId) } })
 }
 } catch {}
 }

 const refreshSuppliers = async () => {
 try {
 const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const res = await fetch(`${API}/api/suppliers?limit=1000`, { headers, cache: 'no-store' })
 if (res.ok) {
 const data = await res.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 // Handle both paginated {rows: [...]} and flat array responses
 const list = Array.isArray(data) ? data : (data.rows || [])
 dispatch({ type: 'HYDRATE', payload: { suppliers: list.map(mapId) } })
 }
 } catch {}
 }

 useEffect(() => { refreshIngredients(); refreshSuppliers() }, [])

 const columns = [
 { label: 'Sr No', render: (row, idx) =><span className="text-gray-500">{idx + 1}</span> },
 { label: 'Name', key: 'name', render: (row) =><span className="font-medium text-gray-900 dark:text-gray-100">{row.name}</span> },
 { label: 'Category', key: 'category', render: (row) =><span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">{row.category}</span> },
 { label: 'Qty', key: 'qty', render: (row) => {
 const qty = Number(row.qty)
 const isLow = qty <= 5 && qty > 0
 const isOut = qty === 0
 return (
 <span className={`font-semibold ${isOut ? 'text-red-600 dark:text-red-400' : isLow ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
 {qty}
 </span>
 )
 }},
 { label: 'Stock Status', render: (row) => {
 const qty = Number(row.qty)
 const threshold = Number(row.lowStock || 5)
 const isLow = qty <= threshold && qty > 0
 const isOut = qty === 0
 if (isOut) return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">Out of Stock</span>
 if (isLow) return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">Low Stock</span>
 return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">In Stock</span>
 }},
 { label: 'Threshold', key: 'lowStock', render: (row) =><span className="font-medium text-amber-700 dark:text-amber-400">{row.lowStock || 5}</span> },
 { label: 'Unit', key: 'unit', render: (row) =><span className="text-gray-600 dark:text-gray-400">{row.unit}</span> },
 { label: 'Expiry', render: (row) => {
 if (!row.expiry) return <span className="text-gray-400">-</span>
 const expiryDate = new Date(row.expiry)
 const isExpiringSoon = expiryDate <= addDays(new Date(), 7)
 const isExpired = expiryDate < new Date()
 return (
 <span className={`text-sm ${isExpired ? 'text-red-600 font-semibold' : isExpiringSoon ? 'text-orange-600 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>
 {format(expiryDate, 'yyyy-MM-dd')}
 {isExpired && ' (Expired)'}
 {!isExpired && isExpiringSoon && ' (Soon)'}
 </span>
 )
 }},
 { label: 'Price/Unit', key: 'price', render: (row) =><span className="font-medium text-gray-900 dark:text-gray-100">PKR {Number(row.price || 0).toLocaleString()}</span> },
 { label: 'Value', render: (row) =><span className="font-semibold text-emerald-600 dark:text-emerald-400">PKR {(Number(row.qty || 0) * Number(row.price || 0)).toLocaleString()}</span> },
 { label: 'Supplier', render: (row) => {
 const s = (state.suppliers||[]).find(x => x.id === row.supplierId)
 return <span className="text-gray-600 dark:text-gray-400">{s?.name || s?.company || '-'}</span>
 } },
 { label: 'Actions', render: (row) => (
 <div className="flex gap-2"><button
 onClick={() => { setEditingItem(row); setIngModalOpen(true) }}
 className="px-3 py-1.5 text-sm rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors font-medium"
 >Edit</button><button
 onClick={async () => {
 const confirmed = await confirm({ title: 'Delete Ingredient', message: 'Delete this ingredient?' })
 if (!confirmed) return
 try {
 const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 await fetch(`${API}/api/ingredients/${row.id}`, { method: 'DELETE', headers })
 dispatch({ type:'DELETE_INGREDIENT', payload: { id: row.id } })
 toast.success('Ingredient deleted')
 } catch {
 toast.error('Failed to delete on server')
 }
 }}
 className="px-3 py-1.5 text-sm rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium"
 >Delete</button></div>
 )},
 ]

 // Summary metrics
 const items = state.ingredients || []
 const totalItems = items.length
 const lowStockCount = items.filter(i => Number(i.qty) <= Number(i.lowStock || 5) && Number(i.qty) > 0).length
 const outOfStockCount = items.filter(i => Number(i.qty) === 0).length
 const expirySoonCount = items.filter(i => i.expiry && new Date(i.expiry) <= addDays(new Date(), 7) && new Date(i.expiry) >= new Date()).length
 const totalInventoryValue = items.reduce((sum, i) => sum + (Number(i.qty || 0) * Number(i.price || 0)), 0)

 // Tabs: all | low | expiring | out
 const [tab, setTab] = useState('all')
 const filteredItems = useMemo(() => {
 if (tab === 'low') return items.filter(i => Number(i.qty) <= Number(i.lowStock || 5) && Number(i.qty) > 0)
 if (tab === 'expiring') return items.filter(i => i.expiry && new Date(i.expiry) <= addDays(new Date(), 7) && Number(i.qty) > 0)
 if (tab === 'out') return items.filter(i => Number(i.qty) === 0)
 return items
 }, [tab, items])

 const pages = Math.ceil(filteredItems.length / limit) || 1
 const paginatedItems = filteredItems.slice((page - 1) * limit, page * limit)

 const exportCSV = () => {
 try {
 const rows = filteredItems.map(i => ({
 Name: i.name,
 Category: i.category,
 Quantity: i.qty,
 Unit: i.unit,
 'Price Per Unit (PKR)': i.price || 0,
 'Total Value (PKR)': (Number(i.qty || 0) * Number(i.price || 0)),
 Expiry: i.expiry || '',
 Supplier: (state.suppliers||[]).find(x => x.id === i.supplierId)?.name || ''
 }))
 const ws = XLSX.utils.json_to_sheet(rows)
 const wb = XLSX.utils.book_new()
 XLSX.utils.book_append_sheet(wb, ws, 'Inventory')
 XLSX.writeFile(wb, `inventory-${format(new Date(), 'yyyy-MM-dd')}.csv`, { bookType: 'csv' })
 toast.success('Inventory exported successfully')
 } catch (e) {
 console.error('Export failed', e)
 toast.error('Export failed')
 }
 }

 return (
 <div className="space-y-4"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2"><span className="text-3xl"></span> Inventory
 </h1><div className="flex flex-wrap gap-2"><button onClick={refreshIngredients} className="px-4 py-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 font-semibold">Refresh</button><button onClick={() => { setUpdateOpen(true) }} className="px-4 py-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 font-semibold">Update Stock</button><button onClick={exportCSV} className="px-4 py-2 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 font-semibold">Export CSV</button><button onClick={() => setIngModalOpen(true)} className="px-4 py-2 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 font-semibold">Add Ingredient</button></div></div><div className="grid grid-cols-2 md:grid-cols-5 gap-4"><StatCard title="Total Items" value={totalItems} variant="blue" icon="" /><StatCard title="Low Stock" value={lowStockCount} variant="amber" icon="" /><StatCard title="Expiry Soon" value={expirySoonCount} variant="orange" icon="" /><StatCard title="Out of Stock" value={outOfStockCount} variant="red" icon="" /><StatCard title="Total Value" value={`PKR ${totalInventoryValue.toLocaleString()}`} variant="emerald" icon="" /></div>
 {/* Tabs */}
 <div className="flex flex-wrap gap-2 p-2 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700"><button onClick={()=>setTab('all')} className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${tab==='all' ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg scale-105' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-gray-600'}`}> All Items ({totalItems})</button><button onClick={()=>setTab('low')} className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${tab==='low' ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg scale-105' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 border border-gray-200 dark:border-gray-600'}`}> Low Stock ({lowStockCount})</button><button onClick={()=>setTab('expiring')} className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${tab==='expiring' ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg scale-105' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-orange-50 dark:hover:bg-orange-900/20 border border-gray-200 dark:border-gray-600'}`}> Expiring Soon ({expirySoonCount})</button><button onClick={()=>setTab('out')} className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${tab==='out' ? 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg scale-105' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 border border-gray-200 dark:border-gray-600'}`}> Out of Stock ({outOfStockCount})</button></div><div className="border-2 border-blue-200 dark:border-blue-800 rounded-xl overflow-x-auto shadow-sm"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"><tr><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Sr No</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Name</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Category</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Qty</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Stock Status</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Threshold</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Unit</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Expiry</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Price/Unit</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Value</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Supplier</th><th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th></tr></thead><tbody>
 {paginatedItems.map((row, idx) => (
 <tr key={row.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="p-3 text-gray-500">{idx + 1}</td><td className="p-3 font-medium text-gray-900 dark:text-gray-100">{row.name}</td><td className="p-3"><span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">{row.category}</span></td><td className="p-3">
 {(() => {
 const qty = Number(row.qty)
 const isLow = qty <= 5 && qty > 0
 const isOut = qty === 0
 return <span className={`font-semibold ${isOut ? 'text-red-600 dark:text-red-400' : isLow ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{qty}</span>
 })()}
 </td><td className="p-3">
 {(() => {
 const qty = Number(row.qty)
 const threshold = Number(row.lowStock || 5)
 const isLow = qty <= threshold && qty > 0
 const isOut = qty === 0
 if (isOut) return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">Out of Stock</span>
 if (isLow) return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">Low Stock</span>
 return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">In Stock</span>
 })()}
 </td><td className="p-3 font-medium text-amber-700 dark:text-amber-400">{row.lowStock || 5}</td><td className="p-3 text-gray-600 dark:text-gray-400">{row.unit}</td><td className="p-3">
 {!row.expiry ? <span className="text-gray-400">-</span> : (() => {
 const expiryDate = new Date(row.expiry)
 const isExpiringSoon = expiryDate <= addDays(new Date(), 7)
 const isExpired = expiryDate < new Date()
 return <span className={`text-sm ${isExpired ? 'text-red-600 font-semibold' : isExpiringSoon ? 'text-orange-600 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>{format(expiryDate, 'yyyy-MM-dd')}{isExpired && ' (Expired)'}{!isExpired && isExpiringSoon && ' (Soon)'}</span>
 })()}
 </td><td className="p-3 font-medium text-gray-900 dark:text-gray-100">PKR {Number(row.price || 0).toLocaleString()}</td><td className="p-3 font-semibold text-emerald-600 dark:text-emerald-400">PKR {(Number(row.qty || 0) * Number(row.price || 0)).toLocaleString()}</td><td className="p-3 text-gray-600 dark:text-gray-400">{(state.suppliers||[]).find(x => x.id === row.supplierId)?.name || ''}</td><td className="p-3 text-center"><div className="flex items-center justify-center gap-2"><button onClick={() => { setEditingItem(row); setIngModalOpen(true) }} className="px-3 py-1.5 text-sm rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors font-medium">Edit</button><button onClick={async () => {
 const confirmed = await confirm({ title: 'Delete Ingredient', message: 'Delete this ingredient?' })
 if (!confirmed) return
 try {
 const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 await fetch(`${API}/api/ingredients/${row.id}`, { method: 'DELETE', headers })
 dispatch({ type:'DELETE_INGREDIENT', payload: { id: row.id } })
 toast.success('Ingredient deleted')
 } catch {
 toast.error('Failed to delete on server')
 }
 }} className="px-3 py-1.5 text-sm rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium">Delete</button></div></td></tr>
 ))}
 {!filteredItems.length && (
 <tr><td colSpan={12} className="p-8 text-center text-gray-500 dark:text-gray-400"><div className="text-4xl mb-2"></div><div>No items found</div></td></tr>
 )}
 </tbody></table></div>

 {/* Pagination controls */}
 <Pagination page={page} pages={pages} total={filteredItems.length} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} /><IngredientModal open={ingModalOpen} initial={editingItem} onClose={(ok)=>{ setIngModalOpen(false); setEditingItem(null); if (ok) refreshIngredients() }} /><UpdateStockDialog
 open={updateOpen}
 items={state.ingredients || []}
 suppliers={state.suppliers || []}
 API={API}
 token={token}
 businessDate={businessDate}
 onClose={() => setUpdateOpen(false)}
 onUpdated={refreshIngredients}
 />
 {state.ingredients.filter(i => Number(i.qty) <= 5 && Number(i.qty) > 0).length > 0 && (
 <div className="p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800"><div className="flex items-center gap-2 text-amber-800 dark:text-amber-200"><span className="text-xl"></span><span className="font-semibold">Low Stock Alert:</span><span className="text-amber-700 dark:text-amber-300">{state.ingredients.filter(i => Number(i.qty) <= 5 && Number(i.qty) > 0).map(i => i.name).join(', ')}</span></div></div>
 )}
 {ConfirmDialog}
 </div>
 )
}

function StatCard({ title, value, variant = 'slate', icon = '' }) {
 const variants = {
 blue: { bg: 'bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/30 dark:to-gray-900 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100', iconBg: 'bg-blue-500/20 text-blue-600 dark:text-blue-300' },
 amber: { bg: 'bg-gradient-to-br from-amber-50 to-white dark:from-amber-900/30 dark:to-gray-900 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100', iconBg: 'bg-amber-500/20 text-amber-600 dark:text-amber-300' },
 orange: { bg: 'bg-gradient-to-br from-orange-50 to-white dark:from-orange-900/30 dark:to-gray-900 border-orange-200 dark:border-orange-800 text-orange-900 dark:text-orange-100', iconBg: 'bg-orange-500/20 text-orange-600 dark:text-orange-300' },
 red: { bg: 'bg-gradient-to-br from-red-50 to-white dark:from-red-900/30 dark:to-gray-900 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100', iconBg: 'bg-red-500/20 text-red-600 dark:text-red-300' },
 emerald: { bg: 'bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/30 dark:to-gray-900 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100', iconBg: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300' },
 slate: { bg: 'bg-gradient-to-br from-gray-50 to-white dark:from-gray-900/50 dark:to-gray-950 border-gray-200 dark:border-gray-700', iconBg: 'bg-gray-500/20 text-gray-600 dark:text-gray-300' },
 }
 const v = variants[variant] || variants.slate
 return (
 <div className={`p-4 rounded-xl border-2 shadow-sm ${v.bg}`}><div className="flex items-center justify-between"><div><div className="text-xs font-semibold uppercase tracking-wide opacity-70">{title}</div><div className="text-2xl font-bold mt-1">{value}</div></div><div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${v.iconBg}`}>
 {icon}
 </div></div></div>
 )
}

