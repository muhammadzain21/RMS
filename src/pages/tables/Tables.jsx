import { useEffect, useMemo, useState } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import Pagination from '../../components/Pagination.jsx'
import DatePicker from '../../components/DatePicker.jsx'
import { Plus, X } from 'lucide-react'

export default function Tables() {
 const { state, dispatch } = useData()
 const { token } = useAuth()
 const { confirm, ConfirmDialog } = useConfirm()
 const [newTable, setNewTable] = useState('')
 const [newFloor, setNewFloor] = useState('')
 const [newImage, setNewImage] = useState('')
 const [addOpen, setAddOpen] = useState(false)
 const [editTable, setEditTable] = useState(null)
 const [editOpen, setEditOpen] = useState(false)
 const [editName, setEditName] = useState('')
 const [editFloor, setEditFloor] = useState('')
 const [editImage, setEditImage] = useState('')
 const [search, setSearch] = useState('')
 const [drawerOpen, setDrawerOpen] = useState(false)
 const [selectedTable, setSelectedTable] = useState('')
 const [tables, setTables] = useState([])
 const [history, setHistory] = useState([])
 const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
 const [fromDate, setFromDate] = useState('')
 const [toDate, setToDate] = useState('')
 const [summary, setSummary] = useState([])
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
 const [jump, setJump] = useState(1)
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

 // Keep public settings.tables in sync so POS can read tables without auth
 const syncSettingsTables = async (names) => {
 try {
 const headers = { 'Content-Type': 'application/json' }
 await fetch(`${API}/api/settings`, { method: 'PATCH', headers, body: JSON.stringify({ tables: names }) })
 } catch {}
 }

 // Load tables from backend
 useEffect(() => {
 const load = async () => {
 try {
 const headers = token ? { Authorization: `Bearer ${token}` } : {}
 const res = await fetch(`${API}/api/tables`, { headers })
 if (!res.ok) return
 const rows = await res.json()
 setTables(rows || [])
 } catch {}
 }
 load()
 }, [API, token])

 // Load per-day or range summary
 useEffect(() => {
 const loadSummary = async () => {
 try {
 const headers = token ? { Authorization: `Bearer ${token}` } : {}
 const params = new URLSearchParams()
 if (selectedDate && !fromDate && !toDate) params.set('date', selectedDate)
 if (fromDate) params.set('from', fromDate)
 if (toDate) params.set('to', toDate)
 const url = `${API}/api/tables/summary?${params.toString()}`
 const res = await fetch(url, { headers })
 if (!res.ok) { setSummary([]); return }
 const data = await res.json()
 setSummary(data?.tables || [])
 } catch { setSummary([]) }
 }
 loadSummary()
 }, [API, token, selectedDate, fromDate, toDate])

 const rows = useMemo(() => {
 const dineInSales = (state.sales||[]).filter(s => s.orderType === 'Dine-in')
 const mapped = tables.map((t) => {
 const name = t.name || t
 const salesForTable = dineInSales.filter(s => (s.tableNo||'').trim() === name)
 const sumRow = summary.find(s => s.table === name)
 const lastDate = sumRow?.lastDate || t.lastOrderDate || (salesForTable.length ? salesForTable[0].date : '-')
 const lastWaiterRaw = sumRow?.lastWaiter || (t.lastWaiter && t.lastWaiter.trim()) || (salesForTable.length ? (salesForTable[0].waiterId || salesForTable[0].waiter || '') : '')
 const resolveWaiterName = (id) => {
 if (!id || id === '-') return '-'
 const st = (state.staff||[]).find(s => s.id === id)
 return st?.name || id
 }
 const lastWaiter = resolveWaiterName(lastWaiterRaw)
 const totalAmount = typeof sumRow?.totalAmount === 'number' ? sumRow.totalAmount : (typeof t.totalAmount === 'number' ? t.totalAmount : salesForTable.reduce((a,b)=>a+Number(b.total||0),0))
 return {
 table: name,
 orders: typeof sumRow?.orders === 'number' ? sumRow.orders : (typeof t.totalOrders === 'number' ? t.totalOrders : salesForTable.length),
 lastDate,
 lastWaiter,
 totalAmount,
 _id: t._id,
 }
 })
 if (search) {
 const q = search.toLowerCase()
 return mapped.filter(r => r.table.toLowerCase().includes(q))
 }
 return mapped
 }, [tables, state.sales, search])

 const pages = Math.ceil(rows.length / limit) || 1
 const paginatedRows = rows.slice((page - 1) * limit, page * limit)

 const cols = [
 { label: 'Table', key: 'table' },
 { label: 'Floor', key: 'floor', render: r => (tables.find(t => (t.name||t)===r.table)?.floor || '-') },
 { label: 'Orders', key: 'orders' },
 { label: 'Last Order Date', key: 'lastDate' },
 { label: 'Last Waiter', key: 'lastWaiter' },
 { label: 'Total Bill', key: 'totalAmount', render: r => `PKR ${Number(r.totalAmount||0).toLocaleString()}` },
 { label: 'Actions', key: 'actions', render: r => (
 <div className="flex gap-2"><button onClick={()=>{ setSelectedTable(r.table); setDrawerOpen(true) }} className="px-2 py-1 text-xs rounded bg-blue-600 text-white">View Sales</button><button onClick={async ()=>{
 const confirmed = await confirm({ title: 'Delete Table', message: `Delete table "${r.table}"? This will not delete sales history.` })
 if (!confirmed) return
 try {
 const headers = token ? { Authorization: `Bearer ${token}` } : {}
 const t = tables.find(x => (x.name||x) === r.table)
 const id = t?._id
 if (!id) throw new Error('Not found')
 const res = await fetch(`${API}/api/tables/${id}`, { method: 'DELETE', headers })
 if (!res.ok) throw new Error('Failed')
 setTables(prev => {
 const next = prev.filter(x => (x._id||x.name) !== id)
 // update settings.tables
 const names = next.map(x => x.name || x).filter(Boolean)
 syncSettingsTables(names)
 // Update DataContext so Sales page and KOT see the change immediately
 dispatch({ type: 'HYDRATE', payload: { settings: { ...state.settings, tables: next.map(x => ({ name: x.name || x, floor: x.floor || '', imageUrl: x.imageUrl || '' })) } } })
 return next
 })
 toast.success('Table deleted')
 } catch (e) {
 toast.error('Failed to delete table. Please retry.')
 }
 }} className="px-2 py-1 text-xs rounded bg-rose-500 text-white">Delete</button></div>
 )}
 ]

 const addTable = async () => {
 const name = newTable.trim()
 if (!name) return
 if (tables.some(t => (t.name||t) === name)) { toast.error('Table already exists'); return }
 try {
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const res = await fetch(`${API}/api/tables`, { method: 'POST', headers, body: JSON.stringify({ name, imageUrl: newImage }) })
 if (!res.ok) throw new Error('Failed')
 const created = await res.json()
 setTables(prev => {
 const next = [...prev, created]
 const names = next.map(x => x.name || x).filter(Boolean)
 syncSettingsTables(names)
 // Update DataContext so Sales page and KOT see the new table immediately
 dispatch({ type: 'HYDRATE', payload: { settings: { ...state.settings, tables: next.map(x => ({ name: x.name || x, floor: x.floor || '', imageUrl: x.imageUrl || '' })) } } })
 return next
 })
 toast.success('Table added')
 } catch (e) {
 toast.error('Failed to add table. Please retry.')
 }
 setNewTable('')
 setNewImage('')
 }

 const onEditTable = (r) => {
 const t = tables.find(x => (x.name||x) === r.table)
 if (!t) return
 setEditTable(t)
 setEditName(t.name || '')
 setEditFloor(t.floor || '')
 setEditImage(t.imageUrl || '')
 setEditOpen(true)
 }

 const saveEditTable = async () => {
 if (!editTable?._id) return
 const name = editName.trim()
 if (!name) return
 try {
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const res = await fetch(`${API}/api/tables/${editTable._id}`, { method: 'PATCH', headers, body: JSON.stringify({ name, floor: (editFloor||'').trim(), imageUrl: editImage }) })
 if (!res.ok) throw new Error('Failed')
 const updated = await res.json()
 setTables(prev => {
 const next = prev.map(x => (x._id === editTable._id) ? updated : x)
 const names = next.map(x => x.name || x).filter(Boolean)
 syncSettingsTables(names)
 dispatch({ type: 'HYDRATE', payload: { settings: { ...state.settings, tables: next.map(x => ({ name: x.name || x, floor: x.floor || '', imageUrl: x.imageUrl || '' })) } } })
 return next
 })
 toast.success('Table updated')
 setEditOpen(false)
 setEditTable(null)
 } catch (e) {
 toast.error('Failed to update table. Please retry.')
 }
 }

 useEffect(() => {
 const loadHistory = async () => {
 if (!drawerOpen || !selectedTable) return
 try {
 const headers = token ? { Authorization: `Bearer ${token}` } : {}
 const res = await fetch(`${API}/api/tables/by-name/${encodeURIComponent(selectedTable)}/history`, { headers })
 if (!res.ok) { setHistory([]); return }
 const rows = await res.json()
 const mapped = (rows||[]).map(s => ({
 date: s.date,
 billNo: s.billNo ? `BILL-${s.billNo}` : '-',
 waiter: s.waiter || '-',
 total: Number(s.total||0),
 }))
 setHistory(mapped)
 } catch { setHistory([]) }
 }
 loadHistory()
 }, [drawerOpen, selectedTable, API, token])

 return (
 <div className="space-y-4 w-full"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Tables</h1><button onClick={()=>setAddOpen(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95"><Plus size={18} /> Add Table</button></div><div className="p-4 rounded-xl bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/30 dark:to-blue-950/30 border-2 border-cyan-200 dark:border-cyan-800"><div className="flex flex-wrap items-center gap-4"><div className="flex-shrink-0"><DatePicker label="From" value={fromDate} onChange={v=>{ setFromDate(v); setSelectedDate('') }} /></div><div className="flex-shrink-0"><DatePicker label="To" value={toDate} onChange={v=>{ setToDate(v); setSelectedDate('') }} /></div><div className="flex items-end gap-3 flex-shrink-0"><button onClick={()=>{ setSelectedDate(format(new Date(), 'yyyy-MM-dd')); setFromDate(''); setToDate('') }} className="px-4 py-2 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">Today</button><button onClick={()=>{
 const headers = ['Table','Orders','Last Order Date','Last Waiter','Total Bill']
 const lines = [headers.join(',')]
 for (const r of summary) {
 const row = [
 `"${(r.table||'').replaceAll('"','\"')}"`,
 Number(r.orders||0),
 `"${(r.lastDate||'').replaceAll('"','\"')}"`,
 `"${(r.lastWaiter||'').replaceAll('"','\"')}"`,
 Number(r.totalAmount||0)
 ]
 lines.push(row.join(','))
 }
 const csv = lines.join('\n')
 const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 const label = selectedDate ? `tables_${selectedDate}` : `tables_${fromDate||'from'}_${toDate||'to'}`
 a.href = url
 a.download = `${label}.csv`
 a.click()
 URL.revokeObjectURL(url)
 }} className="px-4 py-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">Export CSV</button></div><div className="flex-1 min-w-0 sm:ml-auto"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tables..." className="w-full px-3 py-2 border-2 border-cyan-200 dark:border-cyan-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-cyan-500 transition-all" /></div></div></div><div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto shadow-sm"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"><tr><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Table</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Image</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Floor</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Orders</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Last Order Date</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Last Waiter</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Total Bill</th><th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th></tr></thead><tbody>
 {paginatedRows.map(r => (
 <tr key={r.table} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="p-3 text-gray-700 dark:text-gray-300">{r.table}</td><td className="p-3">{(() => { const t = tables.find(x => (x.name||x)===r.table); const img = t?.imageUrl; return img ? <img src={img} alt={r.table} className="h-10 w-10 rounded-lg border border-gray-200 dark:border-gray-600 object-cover" /> : <span className="text-gray-400 text-xs">—</span> })()}</td><td className="p-3 text-gray-600 dark:text-gray-400">{tables.find(t => (t.name||t)===r.table)?.floor || '-'}</td><td className="p-3 text-gray-700 dark:text-gray-300">{r.orders}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.lastDate}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.lastWaiter}</td><td className="p-3 font-medium text-gray-800 dark:text-gray-200">PKR {Number(r.totalAmount||0).toLocaleString()}</td><td className="p-3 text-center"><div className="flex items-center justify-center gap-2"><button onClick={()=>{ setSelectedTable(r.table); setDrawerOpen(true) }} className="px-2 py-1 text-xs rounded bg-blue-600 text-white">View Sales</button><button onClick={()=>onEditTable(r)} className="px-2 py-1 text-xs rounded bg-amber-500 text-white">Edit</button><button onClick={async ()=>{
 const confirmed = await confirm({ title: 'Delete Table', message: `Delete table "${r.table}"? This will not delete sales history.` })
 if (!confirmed) return
 try {
 const headers = token ? { Authorization: `Bearer ${token}` } : {}
 const t = tables.find(x => (x.name||x) === r.table)
 const id = t?._id
 if (!id) throw new Error('Not found')
 const res = await fetch(`${API}/api/tables/${id}`, { method: 'DELETE', headers })
 if (!res.ok) throw new Error('Failed')
 setTables(prev => {
 const next = prev.filter(x => (x._id||x.name) !== id)
 const names = next.map(x => x.name || x).filter(Boolean)
 syncSettingsTables(names)
 dispatch({ type: 'HYDRATE', payload: { settings: { ...state.settings, tables: next.map(x => ({ name: x.name || x, floor: x.floor || '', imageUrl: x.imageUrl || '' })) } } })
 return next
 })
 toast.success('Table deleted')
 } catch (e) {
 toast.error('Failed to delete table. Please retry.')
 }
 }} className="px-2 py-1 text-xs rounded bg-rose-500 text-white">Delete</button></div></td></tr>
 ))}
 {!rows.length && (
 <tr><td colSpan={8} className="p-8 text-center text-gray-500 dark:text-gray-400"><div className="text-4xl mb-2"></div><div>No tables found</div></td></tr>
 )}
 </tbody></table></div>

 {/* Pagination controls */}
 <Pagination page={page} pages={pages} total={rows.length} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} />

 {addOpen && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setAddOpen(false) }}><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6"><div className="flex items-center justify-between mb-5"><h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Add Table</h3><button onClick={() => setAddOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={20} /></button></div> <div className="space-y-4"><div><label className="block text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1.5">Table No</label><input type="text" className="px-3 py-2.5 border-2 border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full focus:ring-2 focus:ring-blue-500 transition-all" value={newTable} onChange={e=>setNewTable(e.target.value)} placeholder="e.g., Table 4" /></div><div><label className="block text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1.5">Floor</label><input type="text" className="px-3 py-2.5 border-2 border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full focus:ring-2 focus:ring-blue-500 transition-all" value={newFloor} onChange={e=>setNewFloor(e.target.value)} placeholder="e.g., Ground / 1st" /></div><div><label className="block text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1.5">Table Image</label><div className="flex items-center gap-2"><div className="relative flex-1"><input type="file" accept="image/*" className="hidden" id="table-image-upload" onChange={e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setNewImage(String(reader.result)); reader.readAsDataURL(file) }} /><label htmlFor="table-image-upload" className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border-2 border-blue-200 dark:border-blue-700 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all cursor-pointer w-full justify-center">{newImage ? 'Change' : 'Add'}</label></div>{newImage && <button type="button" onClick={() => setNewImage('')} className="px-3 py-2.5 border-2 border-red-200 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">Remove</button>}</div>{newImage && <div className="mt-2"><img src={newImage} alt="Table preview" className="h-20 w-auto rounded-lg border-2 border-blue-200 dark:border-blue-700 shadow-sm" /></div>}</div><div className="flex gap-3 justify-end pt-2"><button onClick={()=>setAddOpen(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button><button onClick={async ()=>{
 const name = newTable.trim()
 if (!name) return
 try {
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const res = await fetch(`${API}/api/tables`, { method: 'POST', headers, body: JSON.stringify({ name, floor: (newFloor||'').trim(), imageUrl: newImage }) })
 if (res.ok) {
 const row = await res.json()
 setTables(prev => [...prev, row])
 setNewTable(''); setNewFloor(''); setNewImage(''); setAddOpen(false)
 }
 } catch {}
 }} className="px-5 py-2.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50" disabled={!newTable.trim()}>Save</button></div></div></div></div>
 )}

 {editOpen && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditOpen(false) }}><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6"><div className="flex items-center justify-between mb-5"><h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Edit Table</h3><button onClick={() => setEditOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={20} /></button></div><div className="space-y-4"><div><label className="block text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1.5">Table No</label><input type="text" className="px-3 py-2.5 border-2 border-amber-200 dark:border-amber-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full focus:ring-2 focus:ring-amber-500 transition-all" value={editName} onChange={e=>setEditName(e.target.value)} placeholder="e.g., Table 4" /></div><div><label className="block text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1.5">Floor</label><input type="text" className="px-3 py-2.5 border-2 border-amber-200 dark:border-amber-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full focus:ring-2 focus:ring-amber-500 transition-all" value={editFloor} onChange={e=>setEditFloor(e.target.value)} placeholder="e.g., Ground / 1st" /></div><div><label className="block text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1.5">Table Image</label><div className="flex items-center gap-2"><div className="relative flex-1"><input type="file" accept="image/*" className="hidden" id="edit-table-image-upload" onChange={e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setEditImage(String(reader.result)); reader.readAsDataURL(file) }} /><label htmlFor="edit-table-image-upload" className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border-2 border-amber-200 dark:border-amber-700 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all cursor-pointer w-full justify-center">{editImage ? 'Change' : 'Add'}</label></div>{editImage && <button type="button" onClick={() => setEditImage('')} className="px-3 py-2.5 border-2 border-red-200 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">Remove</button>}</div>{editImage && <div className="mt-2"><img src={editImage} alt="Table preview" className="h-20 w-auto rounded-lg border-2 border-amber-200 dark:border-amber-700 shadow-sm" /></div>}</div><div className="flex gap-3 justify-end pt-2"><button onClick={()=>setEditOpen(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button><button onClick={saveEditTable} className="px-5 py-2.5 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50" disabled={!editName.trim()}>Update</button></div></div></div></div>
 )}

 {ConfirmDialog}
 {drawerOpen && (
 <><div className="fixed inset-0 bg-black/40 z-40" onClick={()=>setDrawerOpen(false)} /><div className="fixed right-0 top-0 h-full w-full max-w-md z-50 bg-white dark:bg-gray-900 shadow-xl flex flex-col"><div className="p-4 border-b flex items-center justify-between dark:border-gray-700"><div className="font-semibold dark:text-white">Sales - {selectedTable}</div><button onClick={()=>setDrawerOpen(false)} className="px-2 py-1 text-sm rounded border dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600">Close</button></div><div className="p-4 space-y-2 overflow-auto">
 {(history||[]).length === 0 && <div className="text-sm text-gray-500 dark:text-gray-400">No sales found for this table.</div>}
 {(history||[]).map((r, i) => (
 <div key={i} className="flex items-center justify-between border rounded p-2 text-sm dark:border-gray-700"><div><div className="font-medium dark:text-white">{r.billNo}</div><div className="text-gray-600 dark:text-gray-400">{r.date}</div></div><div className="text-right"><div className="dark:text-gray-300">Waiter: <span className="font-medium dark:text-white">{r.waiter}</span></div><div className="dark:text-gray-300">Total: <span className="font-semibold dark:text-white">PKR {r.total.toLocaleString()}</span></div></div></div>
 ))}
 </div></div></>
 )}
 </div>
 )
}
