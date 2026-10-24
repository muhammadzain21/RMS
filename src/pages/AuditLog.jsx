import { useAuth } from '../state/AuthContext.jsx'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import DatePicker from '../components/DatePicker.jsx'
import Pagination from '../components/Pagination.jsx'

export default function AuditLog() {
 const { token, users: authUsers, user: currentUser } = useAuth()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

 const [rows, setRows] = useState([])
 const [loading, setLoading] = useState(false)
 const today = useMemo(() => new Date().toLocaleDateString('en-CA'), [])
 const [from, setFrom] = useState('')
 const [to, setTo] = useState('')
 const [type, setType] = useState('')
 const [q, setQ] = useState('')
 const [userId, setUserId] = useState('')
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
 const [jump, setJump] = useState(1)

 const types = ['','recall','kot','void','return','sale','deleted_sale','inventory','expense','booking','cash','day','auth','menu','category','user','staff','supplier','customer','rider','table','settings']

 const typeColors = {
 'sale': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
 'deleted_sale': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
 'return': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
 'void': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
 'kot': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
 'inventory': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
 'expense': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200',
 'booking': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
 'cash': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
 'auth': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
 'user': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-200',
 'settings': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
 }

 const getTypeIcon = (t) => {
 const icons = {
 'sale': '',
 'deleted_sale': '',
 'return': '',
 'void': '',
 'kot': '',
 'inventory': '',
 'expense': '',
 'booking': '',
 'cash': '',
 'day': '',
 'auth': '',
 'user': '',
 'staff': '',
 'menu': '',
 'category': '',
 'settings': '',
 'supplier': '',
 'customer': '',
 'rider': '',
 'table': '',
 'recall': '',
 }
 return icons[t] || ''
 }

 const load = async () => {
 if (!token) return
 setLoading(true)
 try {
 const params = new URLSearchParams()
 if (from) params.set('from', from)
 if (to) params.set('to', to)
 if (type) params.set('type', type)
 if (userId) params.set('userId', userId)
 if (q) params.set('q', q)
 params.set('limit', '500')
 const res = await fetch(`${API}/api/audit?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
 if (res.ok) setRows(await res.json())
 } catch {}
 setLoading(false)
 }

 const pages = Math.ceil(rows.length / limit) || 1
 const paginatedRows = rows.slice((page - 1) * limit, page * limit)

 useEffect(() => { load() }, [token])

 // Build user options: prefer backend users for Admin; else derive from current rows
 const userOptions = useMemo(() => {
 const list = Array.isArray(authUsers) && authUsers.length ? authUsers.map(u => ({ id: u.id, name: u.name || u.username || u.id })) :
 Array.from(new Map(rows.map(r => [r.userId || r.userName || '-', { id: r.userId || '', name: r.userName || '-' }])).values())
 return [{ id: '', name: 'All Users' }, ...list]
 }, [authUsers, rows])

 const exportCSV = () => {
 const headers = ['Time','Type','User','Action']
 const lines = rows.map(r => [
 r.at ? format(new Date(r.at), 'yyyy-MM-dd HH:mm:ss') : '-',
 r.type || '',
 r.userName || r.user || '',
 r.action || r.message || ''
 ].map(v => '"' + String(v ?? '').replaceAll('"','""') + '"').join(',')).join('\n')
 const csv = headers.join(',') + '\n' + lines
 const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = `audit_log_${format(new Date(), 'yyyy-MM-dd')}.csv`
 a.click()
 URL.revokeObjectURL(url)
 toast.success('CSV exported successfully')
 }

 const exportPDF = () => {
 try {
 const doc = new jsPDF()
 doc.setFontSize(16)
 doc.text('Audit Log Report', 14, 16)
 doc.setFontSize(10)
 doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 24)
 if (from || to) {
 doc.text(`Period: ${from || 'All'} to ${to || 'All'}`, 14, 30)
 }
 const body = rows.map(r => [
 r.at ? format(new Date(r.at), 'yyyy-MM-dd HH:mm:ss') : '-',
 r.type || '',
 r.userName || r.user || '-',
 (r.action || r.message || '-').substring(0, 60)
 ])
 autoTable(doc, {
 head: [['Time','Type','User','Action']],
 body,
 startY: from || to ? 34 : 28,
 styles: { fontSize: 9 },
 headStyles: { fillColor: [59, 130, 246], textColor: 255 }
 })
 doc.save(`audit_log_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
 toast.success('PDF exported successfully')
 } catch (err) {
 console.error('PDF export error:', err)
 toast.error('Failed to export PDF: ' + (err?.message || 'unknown error'))
 }
 }

 return (
 <div className="space-y-4"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Audit Log
 </h1></div>

 {/* Summary Cards */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div className="p-4 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-gray-900 border-2 border-blue-300 dark:border-blue-800"><div className="text-xs font-semibold uppercase text-blue-700 dark:text-blue-300 mb-1">Total Entries</div><div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{rows.length.toLocaleString()}</div></div><div className="p-4 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-gray-900 border-2 border-emerald-300 dark:border-emerald-800"><div className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300 mb-1">Date Range</div><div className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
 {from && to ? `${from} to ${to}` : from ? `From ${from}` : to ? `Until ${to}` : 'All Time'}
 </div></div><div className="p-4 rounded-xl bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/40 dark:to-gray-900 border-2 border-purple-300 dark:border-purple-800"><div className="text-xs font-semibold uppercase text-purple-700 dark:text-purple-300 mb-1">Active Filter</div><div className="text-lg font-bold text-purple-900 dark:text-purple-100">
 {type ? type : userId ? 'By User' : q ? 'Search' : 'None'}
 </div></div></div>

 {/* Filters */}
 <div className="p-5 rounded-xl border-2 border-indigo-300 dark:border-indigo-800 bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-950/40 dark:to-gray-900 shadow-sm"><div className="text-sm font-bold text-indigo-900 dark:text-indigo-100 mb-4">Filters
 </div><div className="flex flex-wrap items-center gap-4"><div className="flex-shrink-0"><DatePicker label="From" value={from} onChange={v=>setFrom(v)} max={to || today} /></div><div className="flex-shrink-0"><DatePicker label="To" value={to} onChange={v=>setTo(v)} min={from || ''} max={today} /></div><div className="flex flex-col gap-1 flex-shrink-0"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Type</label><select 
 value={type} 
 onChange={e=>setType(e.target.value)} 
 className="px-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all min-w-[8rem]"
 >
 {types.map(t =><option key={t||'all'} value={t}>{t ? t : 'All Types'}</option>)}
 </select></div><div className="flex flex-col gap-1 flex-shrink-0"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">User</label><select 
 value={userId} 
 onChange={e=>setUserId(e.target.value)} 
 className="px-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all min-w-[10rem]"
 >
 {userOptions.map(u =><option key={u.id || 'all'} value={u.id}>{u.name || u.id || 'Unknown'}</option>)}
 </select></div><div className="flex flex-col gap-1 flex-1 min-w-0 basis-full sm:basis-auto"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Search</label><input 
 value={q} 
 onChange={e=>setQ(e.target.value)} 
 placeholder="Find action..." 
 className="w-full px-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all" 
 /></div><div className="flex gap-3 flex-shrink-0"><button 
 onClick={load} 
 disabled={loading}
 className="px-4 py-2 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 whitespace-nowrap"
 >
 {loading ? 'Loading...' : 'Apply'}
 </button><button 
 onClick={()=>{ setFrom(''); setTo(''); setType(''); setQ(''); setUserId(''); setTimeout(load,0) }} 
 className="px-4 py-2 rounded-lg bg-gradient-to-br from-gray-500 to-gray-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
 >
 Reset
 </button></div></div></div>

 {/* Export Buttons */}
 <div className="flex justify-end gap-3"><button 
 onClick={exportCSV} 
 disabled={rows.length === 0}
 className="px-4 py-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 whitespace-nowrap"
 >
 CSV
 </button><button 
 onClick={exportPDF} 
 disabled={rows.length === 0}
 className="px-4 py-2 rounded-lg bg-gradient-to-br from-red-500 to-red-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 whitespace-nowrap"
 >
 PDF
 </button></div>

 {/* Data Table */}
 <div className="border-2 border-indigo-200 dark:border-indigo-800 rounded-xl overflow-x-auto shadow-sm"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"><tr><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Time</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Type</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">User</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Action</th></tr></thead><tbody>
 {paginatedRows.map(r => (
 <tr key={r.id || r.at} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="p-3 text-gray-700 dark:text-gray-300">{r.at ? format(new Date(r.at), 'yyyy-MM-dd HH:mm:ss') : '-'}</td><td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${typeColors[r.type] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'}`}>
 {getTypeIcon(r.type)} {r.type || 'other'}
 </span></td><td className="p-3 font-medium text-gray-900 dark:text-gray-100">{r.userName || r.user || '-'}</td><td className="p-3 text-sm text-gray-700 dark:text-gray-300">{r.action || r.message || '-'}</td></tr>
 ))}
 {!rows.length && (
 <tr><td colSpan={4} className="p-8 text-center text-gray-500 dark:text-gray-400"><div className="text-4xl mb-2"></div><div>No audit entries found</div></td></tr>
 )}
 </tbody></table></div>

 {/* Pagination controls */}
 <Pagination page={page} pages={pages} total={rows.length} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} loading={loading} />

 {rows.length === 0 && !loading && (
 <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700"><div className="text-4xl mb-2"></div><p>No audit entries found. Adjust your filters to see results.</p></div>
 )}
 </div>
 )
}
