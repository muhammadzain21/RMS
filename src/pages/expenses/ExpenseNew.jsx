import { useEffect, useMemo, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { format } from 'date-fns'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'
import ChartCard from '../../components/ChartCard.jsx'
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'

export default function ExpenseNew() {
 const { state, dispatch, businessDate } = useData()
 const { token } = useAuth()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

 // UI State
 const [showForm, setShowForm] = useState(false)
 const [form, setForm] = useState({ description: '', category: 'Rent', amount: 0, date: businessDate || format(new Date(), 'yyyy-MM-dd') })
 const [editingId, setEditingId] = useState('')

 const openDialog = () => { setShowForm(true) }
 const closeDialog = () => {
 setShowForm(false)
 setForm({ description: '', category: 'Rent', amount: 0, date: businessDate || format(new Date(), 'yyyy-MM-dd') })
 setEditingId('')
 }

 // Filters
 const [startDate, setStartDate] = useState('')
 const [endDate, setEndDate] = useState('')
 const [type, setType] = useState('')
 const [minAmt, setMinAmt] = useState('0')
 const [q, setQ] = useState('')

 // Pagination
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
 const [total, setTotal] = useState(0)
 const [jump, setJump] = useState(1)
 const [loading, setLoading] = useState(false)

 const totalPages = Math.ceil(total / limit) || 1

 const categories = ['Rent', 'Utilities', 'Wages', 'Misc']

 // Day close protection
 const closedDates = useMemo(() => new Set((state.dayCloses || []).map(d => d.date)), [state.dayCloses])
 const isSelectedDateClosed = closedDates.has(form.date)

 // Local helper to reload expenses from backend with pagination and filters
 const reloadExpenses = useCallback(async (pageNum = page, filters = {}) => {
 setLoading(true)
 try {
 const headers = token ? { Authorization: `Bearer ${token}` } : {}
 const params = new URLSearchParams({ page: String(pageNum), limit: String(limit) })
 if (filters.from || startDate) params.set('from', filters.from || startDate)
 if (filters.to || endDate) params.set('to', filters.to || endDate)
 if (filters.category || type) params.set('category', filters.category || type)
 if (filters.min || minAmt) params.set('min', String(filters.min || minAmt))
 if (filters.q || q) params.set('q', filters.q || q)
 const res = await fetch(`${API}/api/expenses?${params.toString()}`, { headers })
 const data = await res.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 dispatch({ type: 'HYDRATE', payload: { expenses: (data.rows || []).map(mapId) } })
 setTotal(data.total || 0)
 } catch {}
 setLoading(false)
 }, [API, token, dispatch, page, limit, startDate, endDate, type, minAmt, q])

 useEffect(() => {
 reloadExpenses()
 }, [])

 const goToPage = (p) => {
 if (p < 1 || p > totalPages) return
 setPage(p)
 reloadExpenses(p)
 }

 const onFilterChange = () => {
 setPage(1)
 reloadExpenses(1)
 }

 // Prefill for edit
 const startEdit = (exp) => {
 setForm({
 description: exp.description || '',
 category: exp.category || 'Rent',
 amount: Number(exp.amount || 0),
 date: exp.date || businessDate || format(new Date(), 'yyyy-MM-dd'),
 })
 setEditingId(exp.id)
 setShowForm(true)
 }

 // Export CSV with current filters
 const exportCsv = () => {
 const params = new URLSearchParams()
 if (startDate) params.set('from', startDate)
 if (endDate) params.set('to', endDate)
 if (type) params.set('category', type)
 if (minAmt) params.set('min', String(minAmt))
 if (q) params.set('q', q)
 const url = `${API}/api/expenses/export?${params.toString()}`
 // open in new tab to trigger download
 window.open(url, '_blank')
 }

 useEffect(() => { /* ensure latest list after mount if empty (offline first) */
 if (!state.expenses || state.expenses.length === 0) reloadExpenses()
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [])

 // Submit -> create or update on backend
 const submit = async (e) => {
 e.preventDefault()
 if (isSelectedDateClosed) { toast.error('This date is closed. You cannot add expenses on a closed date.'); return }
 if (!form.amount || Number(form.amount) <= 0) { toast.error('Enter a valid amount'); return }
 try {
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const body = JSON.stringify({ ...form, amount: Number(form.amount) })
 const url = editingId ? `${API}/api/expenses/${editingId}` : `${API}/api/expenses`
 const method = editingId ? 'PATCH' : 'POST'
 const res = await fetch(url, { method, headers, body })
 if (!res.ok) throw new Error('Failed to save')
 await reloadExpenses()
 closeDialog()
 } catch (err) {
 toast.error('Failed to save expense. Please try again.')
 }
 }

 // Derived: expenses list (from state) and total amount
 const expenses = state.expenses || []
 const totalAmount = useMemo(() => expenses.reduce((a, b) => a + Number(b.amount || 0), 0), [expenses])

 // Charts data (using all expenses for now - can be optimized later)
 const pieData = useMemo(() => {
 const map = new Map()
 expenses.forEach(e => map.set(e.category, (map.get(e.category) || 0) + Number(e.amount || 0)))
 return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
 }, [expenses])

 const barData = useMemo(() => {
 const map = new Map()
 expenses.forEach(e => {
 const key = (e.date || '').slice(0, 7)
 map.set(key, (map.get(key) || 0) + Number(e.amount || 0))
 })
 return Array.from(map.entries())
 .sort((a, b) => a[0].localeCompare(b[0]))
 .map(([month, amount]) => ({ month, amount }))
 }, [expenses])

 const COLORS = ['#4F46E5', '#22C55E', '#F59E0B', '#EF4444', '#06B6D4', '#8B5CF6']

 const categoryTotals = useMemo(() => {
 const map = {}
 expenses.forEach(e => { map[e.category] = (map[e.category] || 0) + Number(e.amount || 0) })
 return map
 }, [expenses])

 const highestExpense = useMemo(() => {
 if (!expenses.length) return 0
 return Math.max(...expenses.map(e => Number(e.amount || 0)))
 }, [expenses])

 const remove = async (id) => {
 try {
 const headers = token ? { Authorization: `Bearer ${token}` } : {}
 const res = await fetch(`${API}/api/expenses/${id}`, { method: 'DELETE', headers })
 if (!res.ok) throw new Error('Failed')
 await reloadExpenses()
 } catch {
 toast.error('Failed to delete expense.')
 }
 }

 return (
 <div className="space-y-4">
 {/* Header with Add Button */}
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Expenses
 </h1><button onClick={openDialog} className="px-5 py-2.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Add Expense</button></div>

 {showForm && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) closeDialog() }}><div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-lg p-5 m-4"><div className="flex items-center justify-between mb-3"><h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editingId ? 'Edit Expense' : 'Add New Expense'}</h3><button onClick={closeDialog} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"></button></div>
 {isSelectedDateClosed && (
 <div className="px-3 py-2 mb-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm">Selected date is closed. Adding expenses is disabled.</div>
 )}
 <form onSubmit={submit} className="space-y-3"><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div className="flex flex-col gap-1"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Date</label><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} className="px-3 py-2 border rounded bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" /></div><div className="flex flex-col gap-1"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Category</label><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="px-3 py-2 border rounded bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
 {categories.map(c=><option key={c}>{c}</option>)}
 </select></div><div className="flex flex-col gap-1"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Amount (PKR)</label><input type="number" placeholder="0" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} className="px-3 py-2 border rounded bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" /></div></div><div className="flex flex-col gap-1"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Title / Description</label><input placeholder="Enter expense title or description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="w-full px-3 py-2 border rounded bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" /></div><div className="flex gap-2 justify-end pt-2"><button type="button" onClick={closeDialog} className="px-3 py-2 border rounded border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button><button disabled={isSelectedDateClosed} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded disabled:opacity-50">{editingId ? 'Update Expense' : 'Save Expense'}</button></div></form></div></div>
 )}

 {/* Filters */}
 <div className="p-5 rounded-xl border-2 border-indigo-300 dark:border-indigo-800 bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-950/40 dark:to-gray-900 shadow-sm"><div className="text-sm font-bold text-indigo-900 dark:text-indigo-100 mb-4">Filters</div><div className="flex flex-wrap items-center gap-4"><div className="flex-shrink-0"><DatePicker label="From" value={startDate} onChange={v=>{ setStartDate(v); setPage(1); }} /></div><div className="flex-shrink-0"><DatePicker label="To" value={endDate} onChange={v=>{ setEndDate(v); setPage(1); }} /></div><div className="flex flex-col gap-1 flex-shrink-0"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Category</label><select value={type} onChange={e=>{ setType(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all"><option value="">All Types</option>
 {categories.map(c=><option key={c}>{c}</option>)}
 </select></div><div className="flex flex-col gap-1 flex-shrink-0"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Min Amount</label><input type="number" value={minAmt} onChange={e=>{ setMinAmt(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all w-28" placeholder="0" /></div><div className="flex flex-col gap-1 flex-1 min-w-0 basis-full sm:basis-auto"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Search</label><div className="flex gap-3"><input value={q} onChange={e=>{ setQ(e.target.value); setPage(1); }} className="flex-1 px-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="Search expenses..." /><button onClick={onFilterChange} className="px-4 py-2 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">Apply</button></div></div></div></div>

 {/* Summary Widgets */}
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <div className="p-4 rounded-xl border-2 border-rose-300 dark:border-rose-800 bg-gradient-to-br from-rose-100 to-rose-50 dark:from-rose-900/40 dark:to-gray-900 shadow-sm">
 <div className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">Total Expenses</div>
 <div className="text-2xl font-bold mt-1 text-rose-900 dark:text-rose-100">PKR {totalAmount.toLocaleString()}</div>
 </div>
 <div className="p-4 rounded-xl border-2 border-blue-300 dark:border-blue-800 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-gray-900 shadow-sm">
 <div className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Entries</div>
 <div className="text-2xl font-bold mt-1 text-blue-900 dark:text-blue-100">{expenses.length}</div>
 </div>
 <div className="p-4 rounded-xl border-2 border-amber-300 dark:border-amber-800 bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-gray-900 shadow-sm">
 <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Highest Single</div>
 <div className="text-2xl font-bold mt-1 text-amber-900 dark:text-amber-100">PKR {highestExpense.toLocaleString()}</div>
 </div>
 {categories.map((cat, i) => {
 const amt = categoryTotals[cat] || 0
 if (amt === 0) return null
 const colorMap = [
 { border: 'border-indigo-300 dark:border-indigo-800', bg: 'from-indigo-100 to-indigo-50 dark:from-indigo-900/40 dark:to-gray-900', text: 'text-indigo-700 dark:text-indigo-300', value: 'text-indigo-900 dark:text-indigo-100' },
 { border: 'border-purple-300 dark:border-purple-800', bg: 'from-purple-100 to-purple-50 dark:from-purple-900/40 dark:to-gray-900', text: 'text-purple-700 dark:text-purple-300', value: 'text-purple-900 dark:text-purple-100' },
 { border: 'border-cyan-300 dark:border-cyan-800', bg: 'from-cyan-100 to-cyan-50 dark:from-cyan-900/40 dark:to-gray-900', text: 'text-cyan-700 dark:text-cyan-300', value: 'text-cyan-900 dark:text-cyan-100' },
 { border: 'border-orange-300 dark:border-orange-800', bg: 'from-orange-100 to-orange-50 dark:from-orange-900/40 dark:to-gray-900', text: 'text-orange-700 dark:text-orange-300', value: 'text-orange-900 dark:text-orange-100' },
 ]
 const c = colorMap[i % colorMap.length]
 return (
 <div key={cat} className={`p-4 rounded-xl border-2 ${c.border} bg-gradient-to-br ${c.bg} shadow-sm`}>
 <div className={`text-xs font-semibold uppercase tracking-wide ${c.text}`}>{cat}</div>
 <div className={`text-2xl font-bold mt-1 ${c.value}`}>PKR {amt.toLocaleString()}</div>
 </div>
 )
 })}
 </div>

 {/* Table */}
 <div className="p-5 rounded-xl border-2 border-rose-300 dark:border-rose-800 bg-gradient-to-br from-rose-100 to-rose-50 dark:from-rose-950/30 dark:to-gray-900 shadow-sm"><div className="flex items-center justify-between mb-4"><div className="text-sm font-bold text-rose-900 dark:text-rose-100 flex items-center gap-2"> Expenses</div><div className="text-lg font-bold text-rose-600 dark:text-rose-400">PKR {totalAmount.toLocaleString()}</div></div><div className="overflow-auto rounded-xl border border-rose-200 dark:border-rose-800"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-rose-100 to-rose-50 dark:from-rose-900/60 dark:to-rose-950/40"><tr><th className="text-left p-3 font-bold text-rose-900 dark:text-rose-100">Date</th><th className="text-left p-3 font-bold text-rose-900 dark:text-rose-100">Time</th><th className="text-left p-3 font-bold text-rose-900 dark:text-rose-100">Type</th><th className="text-left p-3 font-bold text-rose-900 dark:text-rose-100">Description</th><th className="text-right p-3 font-bold text-rose-900 dark:text-rose-100">Amount</th><th className="text-center p-3 font-bold text-rose-900 dark:text-rose-100">Actions</th></tr></thead><tbody className="divide-y divide-rose-100 dark:divide-rose-800/50">
 {loading && (
 <tr><td colSpan={6} className="p-6 text-center text-gray-500"> Loading...</td></tr>
 )}
 {!loading && expenses.map(e => (
 <tr key={e.id} className="hover:bg-rose-50/50 dark:hover:bg-rose-900/20 transition-colors"><td className="p-3">{e.date || '-'}</td><td className="p-3">{e.createdAt ? new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td><td className="p-3"><span className="text-xs px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-800/40 text-amber-800 dark:text-amber-200 font-medium border border-amber-200 dark:border-amber-700">{e.category}</span></td><td className="p-3">{e.description || '-'}</td><td className="p-3 text-right font-bold text-rose-600">PKR {Number(e.amount||0).toLocaleString()}</td><td className="p-3 text-center"><button onClick={()=>startEdit(e)} className="text-blue-600 hover:text-blue-800 font-medium mr-3 transition-colors">Edit</button><button onClick={()=>remove(e.id)} className="text-red-600 hover:text-red-800 font-medium transition-colors">Delete</button></td></tr>
 ))}
 {!loading && expenses.length === 0 && (
 <tr><td colSpan={6} className="p-8 text-center text-gray-500"><span className="text-4xl mb-2 block"></span><p>No expenses match the filters.</p></td></tr>
 )}
 </tbody></table></div>

 {/* Pagination */}
 {totalPages >= 1 && (
 <Pagination page={page} pages={totalPages} total={total} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1); reloadExpenses(1); }} onPageChange={p=>goToPage(p)} loading={loading} />
 )}
 </div>

 {/* Charts */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-5"><ChartCard title=" Expense Distribution by Type" variant="amber"><PieChart><Pie dataKey="value" data={pieData} cx="50%" cy="50%" outerRadius={80} label>
 {pieData.map((entry, index) => (
 <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
 ))}
 </Pie><Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }} /><Legend /></PieChart></ChartCard><ChartCard title=" Monthly Expense Trend" variant="purple"><BarChart data={barData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" /><XAxis dataKey="month" stroke="#6b7280" /><YAxis stroke="#6b7280" /><Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }} /><Bar dataKey="amount" fill="#8B5CF6" radius={[8, 8, 0, 0]} /></BarChart></ChartCard></div></div>
 )
}
