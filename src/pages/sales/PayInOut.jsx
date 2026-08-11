import { useMemo, useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import { Plus, X } from 'lucide-react'

export default function PayInOut() {
 const { state, dispatch, businessDate } = useData()
 const { user, token } = useAuth()
 const { confirm, ConfirmDialog } = useConfirm()
 const today = businessDate || format(new Date(), 'yyyy-MM-dd')

 const [date, setDate] = useState(today)
 const [type, setType] = useState('IN')
 const [category, setCategory] = useState('')
 const [amount, setAmount] = useState('')
 const [note, setNote] = useState('')
 const [showAddDialog, setShowAddDialog] = useState(false)

 const [from, setFrom] = useState(businessDate || '')
 const [to, setTo] = useState(businessDate || '')
 const [search, setSearch] = useState('')
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
 const [total, setTotal] = useState(0)
 const [totalPages, setTotalPages] = useState(1)
 const [jump, setJump] = useState(1)
 const [serverRows, setServerRows] = useState([])

 // preset categories
 const presetCategories = ['Petty Cash','Supplies','Maintenance','Tips','Refund','Misc']

 // lock edits after day close
 const closedDates = useMemo(() => new Set((state.dayCloses||[]).map(d => d.date)), [state.dayCloses])
 const isSelectedDateClosed = closedDates.has(date)

 const rows = serverRows

 const totals = useMemo(() => {
 const IN = rows.filter(r => r.type === 'IN').reduce((a,b)=>a+Number(b.amount||0),0)
 const OUT = rows.filter(r => r.type === 'OUT').reduce((a,b)=>a+Number(b.amount||0),0)
 return { IN, OUT, NET: IN-OUT }
 }, [rows])

 const categoryTotals = useMemo(() => {
 const map = {}
 rows.forEach(r => {
 const key = r.category || 'Uncategorized'
 map[key] = (map[key] || 0) + Number(r.amount || 0) * (r.type === 'OUT' ? -1 : 1)
 })
 return Object.entries(map).sort((a,b) => a[0].localeCompare(b[0]))
 }, [rows])

 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const headers = useMemo(() => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }), [token])

 const refreshPayIO = useCallback(async (resetPage = false) => {
 try {
 const params = new URLSearchParams()
 if (from) params.set('from', from)
 if (to) params.set('to', to)
 if (search.trim()) params.set('search', search.trim())
 const currentPage = resetPage ? 1 : page
 params.set('page', currentPage)
 params.set('limit', limit)
 const res = await fetch(`${API}/api/pay-in-outs?${params.toString()}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
 if (!res.ok) return
 const data = await res.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 setServerRows((data.rows || []).map(mapId))
 setTotal(data.total || 0)
 setTotalPages(data.totalPages || 1)
 if (resetPage) setPage(1)
 } catch {}
 }, [from, to, search, page, limit, API, token])

 // Refresh data when filters change
 useEffect(() => {
 refreshPayIO()
 }, [refreshPayIO])

 // Reset page when filters change (but not page itself)
 useEffect(() => {
 setPage(1)
 }, [from, to, search])

 const onAdd = async (e) => {
 e.preventDefault()
 if (isSelectedDateClosed) { toast.error('This date is closed. You cannot add Pay In/Out.'); return }
 const amt = Number(amount)
 if (!date || !type || !category.trim() || Number.isNaN(amt) || amt <= 0) {
 toast.error('Date, Type, Category are required. Amount must be > 0.')
 return
 }
 try {
 const body = { date, type, amount: amt, category: category.trim(), note, userId: user?.id, userName: user?.name }
 const res = await fetch(`${API}/api/pay-in-outs`, { method: 'POST', headers, body: JSON.stringify(body) })
 if (!res.ok) {
 if (res.status === 409) { toast.error('Date is closed'); return }
 throw new Error('Failed to save')
 }
 const saved = await res.json()
 dispatch({ type: 'ADD_PAY_IO', payload: { ...saved, id: saved.id || saved._id, date, type, amount: amt, category: category.trim(), note, userId: user?.id, userName: user?.name } })
 await refreshPayIO()
 setCategory('')
 setAmount('')
 setNote('')
 setType('IN')
 setDate(today)
 setShowAddDialog(false)
 toast.success(`${type === 'IN' ? 'Pay In' : 'Pay Out'} recorded: PKR ${amt.toLocaleString()}`)
 } catch {
 toast.error('Failed to save entry')
 }
 }

 const remove = async (id) => {
 const confirmed = await confirm({ title: 'Delete Entry', message: 'Delete this entry?' })
 if (!confirmed) return
 try {
 const res = await fetch(`${API}/api/pay-in-outs/${id}`, { method: 'DELETE', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
 if (!res.ok) throw new Error('Failed')
 dispatch({ type: 'DELETE_PAY_IO', payload: { id } })
 await refreshPayIO()
 } catch {
 toast.error('Failed to delete entry')
 }
 }

 const exportCSV = () => {
 const header = ['Date','Type','Category','Amount','Note','User']
 const lines = [header.join(',')]
 rows.forEach(r => {
 lines.push([r.date, r.type, r.category, r.amount, JSON.stringify(r.note||''), r.userName||''].join(','))
 })
 const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url; a.download = 'pay_in_out.csv'; a.click()
 URL.revokeObjectURL(url)
 }

 const exportPDF = () => {
 const doc = new jsPDF()
 doc.text('Pay In / Pay Out', 14, 16)
 autoTable(doc, {
 startY: 20,
 head: [[ 'Date','Type','Category','Amount','Note','User' ]],
 body: rows.map(r => [ r.date, r.type, r.category, `PKR ${Number(r.amount).toLocaleString()}`, r.note||'-', r.userName||'-' ]),
 foot: [[ '', '', 'Totals', `IN: PKR ${totals.IN.toLocaleString()}`, `OUT: PKR ${totals.OUT.toLocaleString()}`, `NET: PKR ${totals.NET.toLocaleString()}` ]],
 footStyles: { fillColor: [245,245,245] },
 })
 doc.save('pay_in_out.pdf')
 }

 return (
 <div className="space-y-4 w-full px-4 sm:px-6 lg:px-8"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Pay In / Pay Out</h1><button onClick={() => setShowAddDialog(true)} disabled={isSelectedDateClosed} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"><Plus size={18} /> Record Transaction</button></div><div className="p-4 rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-white dark:bg-gray-900"><div className="flex flex-row flex-nowrap items-center gap-4"><div className="flex-shrink-0"><DatePicker label="From" value={from} onChange={v=>setFrom(v)} /></div><div className="flex-shrink-0"><DatePicker label="To" value={to} onChange={v=>setTo(v)} /></div><div className="flex-1 min-w-0"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Search</label><input placeholder="Date, type, category, note, user..." value={search} onChange={e=>setSearch(e.target.value)} className="mt-1 w-full px-3 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all" /></div><div className="flex gap-3 flex-shrink-0"><button onClick={exportCSV} className="px-4 py-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">CSV</button><button onClick={exportPDF} className="px-4 py-2 rounded-lg bg-gradient-to-br from-red-500 to-red-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">PDF</button></div></div></div>

 {showAddDialog && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowAddDialog(false) }}><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-6"><div className="flex items-center justify-between mb-5"><h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Record Transaction</h3><button onClick={() => setShowAddDialog(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={20} /></button></div>
 {isSelectedDateClosed && (
 <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 text-sm text-red-800 dark:text-red-200 font-medium">Selected date is closed. Adding new entries is disabled.</div>
 )}
 <form onSubmit={onAdd} className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1.5">Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full px-3 py-2.5 border-2 border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 transition-all" /></div><div><label className="block text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1.5">Type</label><select value={type} onChange={e=>setType(e.target.value)} className="w-full px-3 py-2.5 border-2 border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 transition-all"><option value="IN">Pay In (Cash In)</option><option value="OUT">Pay Out (Cash Out)</option></select></div><div><label className="block text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1.5">Category</label><input list="payio-categories" value={category} onChange={e=>setCategory(e.target.value)} placeholder="Petty Cash / Supplies / ..." className="w-full px-3 py-2.5 border-2 border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 transition-all" /><datalist id="payio-categories">
 {presetCategories.map(c =><option key={c} value={c} />)}
 </datalist></div><div><label className="block text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1.5">Amount</label><div className="relative"><span className="absolute left-3 top-3 text-gray-500 dark:text-gray-400 font-medium">PKR</span><input type="number" min="1" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" className="w-full pl-12 pr-3 py-2.5 border-2 border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 transition-all" /></div></div></div><div><label className="block text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1.5">Note</label><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional description..." className="w-full px-3 py-2.5 border-2 border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 transition-all" /></div><div className="flex gap-3 justify-end pt-2"><button type="button" onClick={() => setShowAddDialog(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button><button type="submit" disabled={isSelectedDateClosed} className="px-5 py-2.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">Add {type === 'IN' ? 'Pay In' : 'Pay Out'}</button></div></form></div></div>
 )}

 <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"><h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Transaction History</h2><div className="overflow-x-auto border-2 border-gray-200 dark:border-gray-700 rounded-xl"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"><tr><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Date</th><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Type</th><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Category</th><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Amount</th><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Note</th><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">User</th><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Actions</th></tr></thead><tbody>
 {rows.map(r => (
 <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-medium">{r.date}</td><td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${r.type === 'IN' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200'}`}>{r.type === 'IN' ? 'IN' : 'OUT'}</span></td><td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.category || '-'}</td><td className="px-4 py-3"><span className={`font-semibold ${r.type === 'IN' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{r.type === 'IN' ? '+' : '-'}PKR {Number(r.amount).toLocaleString()}</span></td><td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">{r.note || '-'}</td><td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.userName || '-'}</td><td className="px-4 py-3"><button onClick={()=>remove(r.id)} disabled={closedDates.has(r.date)} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium text-sm border border-red-200 dark:border-red-700 disabled:opacity-50 disabled:cursor-not-allowed">Delete</button></td></tr>
 ))}
 </tbody><tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold"><tr className="border-t"><td className="px-4 py-3 text-gray-700 dark:text-gray-300">Totals</td><td className="px-4 py-3" colSpan={2}></td><td className="px-4 py-3" colSpan={4}><div className="flex flex-wrap gap-4"><span className="text-emerald-600 dark:text-emerald-400">IN: PKR {totals.IN.toLocaleString()}</span><span className="text-rose-600 dark:text-rose-400">OUT: PKR {totals.OUT.toLocaleString()}</span><span className="text-blue-600 dark:text-blue-400 font-bold">NET: PKR {totals.NET.toLocaleString()}</span></div></td></tr></tfoot></table></div>

 {/* Pagination */}
 {total > 0 && (
 <Pagination page={page} pages={totalPages} total={total} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} />
 )}

 {/* Category summary */}
 <div className="mt-6"><h3 className="text-sm font-semibold mb-3 text-gray-800 dark:text-gray-100">Category Summary (NET)</h3><div className="overflow-x-auto border-2 border-gray-200 dark:border-gray-700 rounded-xl"><table className="min-w-[24rem] text-sm"><thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"><tr><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Category</th><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Net Amount</th></tr></thead><tbody>
 {categoryTotals.map(([cat, amt]) => (
 <tr key={cat} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="px-4 py-3 text-gray-700 dark:text-gray-300">{cat}</td><td className={`px-4 py-3 font-semibold ${Number(amt) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
 {Number(amt) >= 0 ? '+' : ''}PKR {Number(amt).toLocaleString()}
 </td></tr>
 ))}
 {categoryTotals.length === 0 && (
 <tr><td className="px-4 py-6 text-center text-gray-500 dark:text-gray-400" colSpan={2}><div className="text-2xl mb-1"></div><div>No data.</div></td></tr>
 )}
 </tbody></table></div></div></div>
 {ConfirmDialog}
 </div>
 )
}
