import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import SlipDialog from '../../components/SlipDialog.jsx'
import { Plus, X } from 'lucide-react'

export default function CashCount() {
 const { state, businessDate } = useData()
 const { user, token } = useAuth()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const authHeaders = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
 const today = businessDate || format(new Date(), 'yyyy-MM-dd')
 const [date, setDate] = useState(today)
 const [amount, setAmount] = useState('')
 const [fromUser, setFromUser] = useState('')
 const [receiver, setReceiver] = useState('')
 const [note, setNote] = useState('')
 const [slipHtml, setSlipHtml] = useState(null)
 const [slipAutoPrint, setSlipAutoPrint] = useState(false)
 const [showAddDialog, setShowAddDialog] = useState(false)

 const [from, setFrom] = useState('')
 const [to, setTo] = useState('')
 const [search, setSearch] = useState('')
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(20)
 const [total, setTotal] = useState(0)
 const [totalPages, setTotalPages] = useState(1)
 const [jump, setJump] = useState(1)
 const [rows, setRows] = useState([])

 const totalAmount = useMemo(() => rows.reduce((a,b) => a + Number(b.amount||0), 0), [rows])

 const refreshCashCounts = useCallback(async (resetPage = false) => {
 try {
 const params = new URLSearchParams()
 if (from) params.set('from', from)
 if (to) params.set('to', to)
 if (search.trim()) params.set('search', search.trim())
 const currentPage = resetPage ? 1 : page
 params.set('page', currentPage)
 params.set('limit', limit)
 const res = await fetch(`${API}/api/cash-counts?${params.toString()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
 if (!res.ok) return
 const data = await res.json()
 setRows((data.rows || []).map(x => ({ ...x, id: x.id || x._id })))
 setTotal(data.total || 0)
 setTotalPages(data.totalPages || 1)
 if (resetPage) setPage(1)
 } catch {}
 }, [from, to, search, page, limit, API, token])

 // Fetch on mount / when deps change
 useEffect(() => {
 refreshCashCounts()
 }, [refreshCashCounts])

 // Reset page when filters change
 useEffect(() => {
 setPage(1)
 }, [from, to, search])

 const printSlip = ({ date, amount, fromUser, receiver, note, userName, entryId, createdAt }) => {
 const dt = new Date()
 const nowDate = format(dt, 'd-M-yyyy')
 const nowTime = format(dt, 'h:mm a')
 const settings = state.settings || {}
 const companyName = settings.companyName || "O'RESTO"
 const phone = settings.phone || ''
 const address = settings.address || ''
 const logo = settings.logo || ''
 const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
 const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })

 const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cash Count Slip</title><style>
 body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial; padding:12px;}
 .center{text-align:center}
 .bold{font-weight:700}
 table{width:100%; border-collapse:collapse}
 td{font-size:12px; padding:4px 0}
 .line{border-top:1px dashed #333; margin:8px 0}
 .kv{display:flex; justify-content:space-between; align-items:flex-start}
 .kv span:first-child{flex-shrink:0; margin-right:8px}
 .kv span:last-child{white-space:nowrap; text-align:right}
 </style></head><body>
 ${logo ? `<div class="center"><img src="${escapeHtml(logo)}" style="max-height:60px;max-width:100%;display:block;margin:0 auto 4px" /></div>` : ''}
 <div class="center bold" style="font-size:16px">${escapeHtml(companyName)}</div>
 ${phone ? `<div class="center">${escapeHtml(phone)}</div>` : ''}
 ${address ? `<div class="center">${escapeHtml(address)}</div>` : ''}
 <div class="line"></div><div class="center bold">Manager Cash Count</div><div class="kv"><span>Entry Date:</span><span>${createdAt ? format(new Date(createdAt), 'd-M-yyyy') : escapeHtml(date || '')}</span></div><div class="kv"><span>Entry Time:</span><span>${createdAt ? format(new Date(createdAt), 'h:mm a') : '-'}</span></div><div class="kv"><span>Printed Date:</span><span>${nowDate}</span></div><div class="kv"><span>Printed Time:</span><span>${nowTime}</span></div><div class="kv"><span>User (From):</span><span>${escapeHtml(fromUser || userName || '-')}</span></div><div class="kv"><span>Receiver (To):</span><span>${escapeHtml(receiver || '-')}</span></div><div class="line"></div><table><tr><td>Amount Counted</td><td style="text-align:right">PKR ${fmt(amount)}</td></tr><tr><td>Note</td><td style="text-align:right">${escapeHtml(note || '-')}</td></tr></table><div class="line"></div></body></html>`

 setSlipHtml(html)
 }

 const onAdd = async (e) => {
 e.preventDefault()
 const amt = Number(amount)
 if (!date || Number.isNaN(amt) || amt <= 0) {
 toast.error('Please enter a valid positive amount')
 return
 }
 try {
 const res = await fetch(`${API}/api/cash-counts`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ date, amount: amt, fromUser, receiver, note }) })
 if (!res.ok) throw new Error('Failed to add')
 const created = await res.json()
 // optimistic update
 setRows(prev => [{ ...created, id: created.id || created._id }, ...prev])
 setAmount(''); setFromUser(''); setReceiver(''); setNote('')
 toast.success(`Cash count recorded: PKR ${amt.toLocaleString()}`)
 setShowAddDialog(false)
 await refreshCashCounts()
 } catch {
 toast.error('Failed to add cash count')
 }
 }

 const exportCSV = () => {
 const headers = ['Date','Time','Amount (PKR)','From','Receiver','Note','User']
 const lines = rows.map(r => [r.date, (r.createdAt ? format(new Date(r.createdAt), 'h:mm a') : ''), r.amount, r.fromUser || '', r.receiver, r.note, r.userName || '']
 .map(v => '"' + String(v ?? '').replaceAll('"','""') + '"').join(',')).join('\n')
 const csv = headers.join(',') + '\n' + lines
 const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = `cash_count_history_${format(new Date(), 'yyyy-MM-dd')}.csv`
 a.click()
 URL.revokeObjectURL(url)
 toast.success('CSV exported successfully')
 }

 const exportPDF = () => {
 const doc = new jsPDF()
 doc.setFontSize(16)
 doc.text('Manager Cash Count History', 14, 16)
 doc.setFontSize(10)
 doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 24)
 const body = rows.map(r => [
 r.date,
 (r.createdAt ? format(new Date(r.createdAt), 'h:mm a') : ''),
 `PKR ${Number(r.amount).toLocaleString()}`,
 r.fromUser || '-',
 r.receiver || '-',
 r.note || '-',
 r.userName || '-',
 ])
 autoTable(doc, {
 head: [['Date','Time','Amount','From','Receiver','Note','User']],
 body,
 startY: 30,
 styles: { fontSize: 9 },
 headStyles: { fillColor: [59, 130, 246], textColor: 255 },
 foot: [['Totals', '', `PKR ${totalAmount.toLocaleString()}`, '', '', '', '']],
 footStyles: { fillColor: [245,245,245] },
 })
 doc.save(`cash_count_history_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
 toast.success('PDF exported successfully')
 }

 return (
 <div className="space-y-4"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Manager Cash Count</h1><button onClick={() => setShowAddDialog(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95"><Plus size={18} /> Record Cash Count</button></div>

 {showAddDialog && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowAddDialog(false) }}><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-6"><div className="flex items-center justify-between mb-5"><div className="flex items-center gap-3"><h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Record Cash Count</h3><span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">No Impact on Day Close</span></div><button onClick={() => setShowAddDialog(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={20} /></button></div>
 <form onSubmit={onAdd} className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1.5">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2.5 border-2 border-emerald-200 dark:border-emerald-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full focus:ring-2 focus:ring-emerald-500 transition-all" /></div><div><label className="block text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1.5">Amount</label><div className="relative"><span className="absolute left-3 top-3 text-gray-500 dark:text-gray-400 font-medium">PKR</span><input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="w-full pl-12 pr-3 py-2.5 border-2 border-emerald-200 dark:border-emerald-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 transition-all" /></div></div><div><label className="block text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1.5">From</label><input value={fromUser} onChange={e => setFromUser(e.target.value)} placeholder="Cash counted by" className="px-3 py-2.5 border-2 border-emerald-200 dark:border-emerald-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full focus:ring-2 focus:ring-emerald-500 transition-all" /></div><div><label className="block text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1.5">Receiver</label><input value={receiver} onChange={e => setReceiver(e.target.value)} placeholder="Manager name" className="px-3 py-2.5 border-2 border-emerald-200 dark:border-emerald-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full focus:ring-2 focus:ring-emerald-500 transition-all" /></div><div><label className="block text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1.5">Note (Optional)</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note..." className="px-3 py-2.5 border-2 border-emerald-200 dark:border-emerald-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full focus:ring-2 focus:ring-emerald-500 transition-all" /></div></div><div className="flex items-center justify-end pt-2 gap-3"><button type="button" onClick={() => setShowAddDialog(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button><button type="submit" className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Add</button></div></form></div></div>
 )}

 {slipHtml && <SlipDialog html={slipHtml} title="Cash Count Slip" onClose={() => { setSlipHtml(null); setSlipAutoPrint(false) }} autoPrint={slipAutoPrint} />}

 <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"><div className="flex flex-wrap items-center gap-3 mb-4"><h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Cash Count History</h2><div className="sm:ml-auto flex gap-3"><button onClick={exportCSV} className="px-4 py-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">CSV</button><button onClick={exportPDF} className="px-4 py-2 rounded-lg bg-gradient-to-br from-red-500 to-red-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">PDF</button></div></div><div className="flex flex-row flex-nowrap items-center gap-4 mb-4"><div className="flex-shrink-0"><DatePicker label="From" value={from} onChange={v => setFrom(v)} /></div><div className="flex-shrink-0"><DatePicker label="To" value={to} onChange={v => setTo(v)} /></div><div className="flex-1 min-w-0"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Search</label><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Date, amount, receiver..." className="mt-1 w-full px-3 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all" /></div></div><div className="overflow-x-auto border-2 border-gray-200 dark:border-gray-700 rounded-xl"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"><tr><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Date</th><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Time</th><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Amount</th><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">From</th><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Receiver</th><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Note</th><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">User</th><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Actions</th></tr></thead><tbody>
 {rows.map(r => (
 <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-medium">{r.date}</td><td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.createdAt ? format(new Date(r.createdAt), 'h:mm a') : ''}</td><td className="px-4 py-3"><span className="font-semibold text-emerald-600 dark:text-emerald-400">PKR {Number(r.amount).toLocaleString()}</span></td><td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.fromUser || '-'}</td><td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.receiver || '-'}</td><td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">{r.note || '-'}</td><td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.userName || '-'}</td><td className="px-4 py-3"><button onClick={() => { setSlipAutoPrint(false); printSlip({ date: r.date, amount: r.amount, fromUser: r.fromUser, receiver: r.receiver, note: r.note, userName: r.userName, entryId: r.id, createdAt: r.createdAt }) }} className="px-3 py-1.5 text-xs rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors font-medium border border-blue-200 dark:border-blue-700"> Print</button></td></tr>
 ))}
 {rows.length === 0 && (
 <tr><td className="px-4 py-8 text-center text-gray-500 dark:text-gray-400" colSpan={8}><div className="text-4xl mb-2"></div><div>No records yet.</div></td></tr>
 )}
 </tbody><tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold"><tr className="border-t"><td className="px-4 py-3 text-gray-700 dark:text-gray-300">Total Counted</td><td className="px-4 py-3"></td><td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">PKR {totalAmount.toLocaleString()}</td><td className="px-4 py-3" colSpan={5}></td></tr></tfoot></table></div>

 {/* Pagination */}
 {total > 0 && (
 <Pagination page={page} pages={totalPages} total={total} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} />
 )}
 </div></div>
 )
}
