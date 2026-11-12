import DataTable from '../../components/DataTable.jsx'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import DatePicker from '../../components/DatePicker.jsx'
import { Plus, X } from 'lucide-react'
import { format } from 'date-fns'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '../../utils/reportDoc.js'

const btnPrint = 'ui-btn ui-btn-print'
const btnPdf = 'ui-btn ui-btn-pdf'
const btnCsv = 'ui-btn ui-btn-csv'

export default function RiderList() {
  const { state, businessDate } = useData()
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const riders = (state.staff || []).filter(s => String(s.position||'').toLowerCase().includes('rider') && (s.status||'Active') === 'Active')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)

 const bizDate = String(businessDate||'').slice(0,10) || new Date().toLocaleDateString('en-CA')
 const [fromDate, setFromDate] = useState(bizDate)
 const [toDate, setToDate] = useState(bizDate)
 const [filterRider, setFilterRider] = useState('')
 const [settledFilter, setSettledFilter] = useState('all')
 const [search, setSearch] = useState('')
 const [form, setForm] = useState({ riderId:'', deliveries:0, amount:0, method:'COD', note:'' })
 const [showAddDialog, setShowAddDialog] = useState(false)
 const [showRollup, setShowRollup] = useState(false)

 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

 // compute filtered records (respects search on top of API-filtered records)
 const filteredRecords = useMemo(() => {
 if (!search.trim()) return records
 const q = search.trim().toLowerCase()
 return (records||[]).filter(r =>
 String(r.date||'').toLowerCase().includes(q) ||
 String(r.tokenNo||'').toLowerCase().includes(q) ||
 String(r.riderName||'').toLowerCase().includes(q) ||
 String(r.deliveries||'').toLowerCase().includes(q) ||
 String(r.amount||'').toLowerCase().includes(q) ||
 String(r.method||'').toLowerCase().includes(q) ||
 String(r.settled ? 'settled' : 'unsettled').includes(q) ||
 String(r.note||'').toLowerCase().includes(q)
 )
 }, [records, search])

 // compute totals from filtered records (respects all filters)
 const totals = useMemo(() => {
 const deliveries = (filteredRecords||[]).reduce((acc, r) => acc + Number(r.deliveries||0), 0)
 const amount = (filteredRecords||[]).reduce((acc, r) => acc + Number(r.amount||0), 0)
 return { deliveries, amount }
}, [filteredRecords])

 // compute rollup from filtered records (respects all filters)
 const rollup = useMemo(() => {
 const map = {}
 ;(filteredRecords||[]).forEach(r => {
 const key = r.riderId || r.riderName || 'Unknown'
 if (!map[key]) map[key] = { riderId: r.riderId, riderName: r.riderName || 'Unknown', deliveries: 0, amount: 0, unsettled: 0, tokens: [] }
 map[key].deliveries += Number(r.deliveries||0)
 map[key].amount += Number(r.amount||0)
 if (!r.settled) map[key].unsettled += 1
 if (r.tokenNo) map[key].tokens.push(r.tokenNo)
 })
 return Object.values(map).sort((a,b) => String(a.riderName||'').localeCompare(String(b.riderName||'')))
 }, [filteredRecords])

 useEffect(() => {
 // default rider selection
 if (!form.riderId && riders.length > 0) setForm(f => ({ ...f, riderId: riders[0].id }))
 }, [riders])

 const headers = useMemo(() => ({
 'Content-Type': 'application/json',
 ...(token ? { Authorization: `Bearer ${token}` } : {})
 }), [token])

 const load = async () => {
 try {
 setLoading(true)
 const params = new URLSearchParams()
 if (fromDate) params.set('from', fromDate)
 if (toDate) params.set('to', toDate)
 if (filterRider) params.set('riderId', filterRider)
 if (settledFilter === 'settled') params.set('settled', 'true')
 if (settledFilter === 'unsettled') params.set('settled', 'false')
 const res = await fetch(`${API}/api/rider-cash?${params.toString()}`, { headers })
 const rows = await res.json()
 setRecords(rows.map(r => ({ ...r, id: r._id || r.id })))
 } catch {
 toast.error('Failed to load records')
 } finally {
 setLoading(false)
 }
 }

 useEffect(() => { load() }, [fromDate, toDate, filterRider, settledFilter])

 const settleRider = async (riderId, settled = true) => {
 try {
 setLoading(true)
 const res = await fetch(`${API}/api/rider-cash/settle`, {
 method: 'PATCH',
 headers,
 body: JSON.stringify({ date: toDate, riderId, settled })
 })
 if (!res.ok) throw new Error('Failed')
 toast.success(settled ? 'Marked settled' : 'Marked unsettled')
 await load()
 } catch {
 toast.error(settled ? 'Failed to settle' : 'Failed to unsettle')
 } finally {
 setLoading(false)
 }
 }

 const exportCsv = () => {
 const params = new URLSearchParams()
 if (fromDate) params.set('from', fromDate)
 if (toDate) params.set('to', toDate)
 // Use token if present by opening in new window with Authorization not possible; fallback to fetch+blob
 if (!token) {
 window.open(`${API}/api/rider-cash/export?${params.toString()}`, '_blank')
 return
 }
 fetch(`${API}/api/rider-cash/export?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
 .then(r => { if (!r.ok) throw new Error(`Export failed: ${r.status}`); return r.blob() })
 .then(blob => {
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = `rider_cash_${fromDate || 'all'}_to_${toDate || 'all'}.csv`
 document.body.appendChild(a)
 a.click()
 a.remove()
 URL.revokeObjectURL(url)
 })
 .catch(() => toast.error('Export failed'))
 }

 const buildRiderCashReport = () => {
 const fileName = `Rider-Cash-${fromDate || 'all'}-${toDate || 'all'}.pdf`
 const body =
 reportSummary([
 { label: 'Total deliveries', amount: String(totals.deliveries) },
 { label: 'Total amount', amount: `PKR ${Number(totals.amount || 0).toLocaleString()}` },
 { label: 'Records', amount: String(filteredRecords.length) },
 ]) +
 reportSec('Rider cash records') +
 reportTable({
 headers: ['Date', 'Token No', 'Rider', { t: 'Deliveries', align: 'r' }, { t: 'Amount (PKR)', align: 'r' }, 'Method', 'Settled', 'Note'],
 numbered: true,
 rows: filteredRecords.map(r => [
 r.date || '-',
 r.tokenNo || '-',
 r.riderName || '-',
 { v: Number(r.deliveries || 0), align: 'r' },
 { v: Number(r.amount || 0).toLocaleString(), align: 'r' },
 r.method === 'COD' ? 'Cash on Delivery' : 'Paid to Owner',
 r.settled ? 'Settled' : 'Unsettled',
 r.note || '-',
 ]),
 emptyText: 'No records match filters',
 })
 const html = wrapReportDoc({
 settings: state?.settings || {},
 title: 'Rider Cash Records',
 reportLabel: 'Rider Cash Report',
 reportNo: `Rpt #: RC-${fromDate || 'all'}-${toDate || 'all'}`,
 metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['From', fromDate || '—'], ['To', toDate || '—']],
 metaRight: [['Rider filter', filterRider ? (riders.find(x => x.id === filterRider)?.name || filterRider) : 'All'], ['Settled', settledFilter]],
 body,
 })
 return { html, fileName }
 }

 const openPrintPreview = async () => {
 try {
 const { html, fileName } = buildRiderCashReport()
 await previewHtmlReport(html, fileName)
 toast.success('Print preview opened')
 } catch {
 toast.error('Failed to open print preview')
 }
 }

 const exportPDF = async () => {
 try {
 const { html, fileName } = buildRiderCashReport()
 await downloadHtmlReport(html, fileName)
 toast.success('PDF downloaded')
 } catch {
 toast.error('Failed to download PDF')
 }
 }

 const onAdd = async (e) => {
 e.preventDefault()
 if (!form.riderId) { toast.error('Select a rider'); return }
 try {
 setLoading(true)
 const r = riders.find(x=>x.id===form.riderId)
 const payload = { ...form, date: toDate, deliveries:Number(form.deliveries||0), amount:Number(form.amount||0), riderName: r?.name || '' }
 const res = await fetch(`${API}/api/rider-cash`, { method:'POST', headers, body: JSON.stringify(payload) })
 if (!res.ok) throw new Error('Failed')
 toast.success('Record added')
 setForm(f => ({ ...f, deliveries:0, amount:0, note:'' }))
 await load()
 } catch {
 toast.error('Failed to add record')
 } finally {
 setLoading(false)
 }
 }

 const onDelete = async (id) => {
 const confirmed = await confirm({ title: 'Delete Record', message: 'Delete this record?' })
 if (!confirmed) return
 try {
 setLoading(true)
 const res = await fetch(`${API}/api/rider-cash/${id}`, { method:'DELETE', headers })
 if (!res.ok) throw new Error('Failed')
 toast.success('Record deleted')
 await load()
 } catch {
 toast.error('Failed to delete record')
 } finally {
 setLoading(false)
 }
 }

 return (
 <div className="space-y-4 w-full"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="page-title">Rider Cash Records</h1><button onClick={() => setShowAddDialog(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-lg ui-btn ui-btn-primary"><Plus size={18} /> Add Record</button></div><div className="p-4 rounded-xl card card-pad"><div className="flex flex-wrap items-center gap-4"><div className="flex-shrink-0"><DatePicker label="From" value={fromDate} onChange={v=>setFromDate(v)} /></div><div className="flex-shrink-0"><DatePicker label="To" value={toDate} onChange={v=>setToDate(v)} /></div><div className="flex flex-col gap-1 flex-shrink-0"><label className="text-xs font-semibold text-[var(--color-text-muted)] tracking-wide">Rider</label><select value={filterRider} onChange={e=>setFilterRider(e.target.value)} className="px-3 py-2 border-2 border-cyan-200 dark:border-cyan-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-cyan-500 transition-all min-w-[10rem]"><option value="">All Riders</option>
 {riders.map(r =><option key={r.id} value={r.id}>{r.name}</option>)}
 </select></div><div className="flex flex-col gap-1 flex-shrink-0"><label className="text-xs font-semibold text-[var(--color-text-muted)] tracking-wide">Settled</label><select value={settledFilter} onChange={e=>setSettledFilter(e.target.value)} className="px-3 py-2 border-2 border-cyan-200 dark:border-cyan-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-cyan-500 transition-all min-w-[8rem]"><option value="all">All</option><option value="settled">Settled</option><option value="unsettled">Unsettled</option></select></div><div className="flex flex-col gap-1 flex-shrink-0"><label className="text-xs font-semibold text-[var(--color-text-muted)] tracking-wide">Search</label><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search records..." className="px-3 py-2 border-2 border-cyan-200 dark:border-cyan-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-cyan-500 transition-all min-w-[12rem]" /></div><div className="flex items-end gap-3 flex-shrink-0"><button onClick={load} className="px-4 py-2 rounded-lg ui-btn ui-btn-print">Refresh</button><button onClick={()=>setShowRollup(s=>!s)} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">{showRollup ? 'Hide Rollup' : 'Show Rollup'}</button><button onClick={openPrintPreview} className={btnPrint}>Print</button><button onClick={exportPDF} className={btnPdf}>PDF</button><button onClick={exportCsv} className={btnCsv}>CSV</button></div></div></div>

 {showAddDialog && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setShowAddDialog(false) }}><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 m-4"><div className="flex items-center justify-between mb-5"><h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Add Rider Record</h3><button onClick={() => setShowAddDialog(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={20} /></button></div>
 <form onSubmit={(e) => { onAdd(e); setShowAddDialog(false) }} className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1.5">Rider</label><select value={form.riderId} onChange={e=>setForm({...form, riderId:e.target.value})} className="px-3 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full focus:ring-2 focus:ring-orange-500 transition-all">
 {riders.map(r =><option key={r.id} value={r.id}>{r.name}</option>)}
 </select></div><div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1.5">Deliveries</label><input type="number" placeholder="0" value={form.deliveries} onChange={e=>setForm({...form, deliveries:Number(e.target.value)})} className="px-3 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full focus:ring-2 focus:ring-orange-500 transition-all" /></div><div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1.5">Amount</label><input type="number" placeholder="0" value={form.amount} onChange={e=>setForm({...form, amount:Number(e.target.value)})} className="px-3 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full focus:ring-2 focus:ring-orange-500 transition-all" /></div><div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1.5">Method</label><select value={form.method} onChange={e=>setForm({...form, method:e.target.value})} className="px-3 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full focus:ring-2 focus:ring-orange-500 transition-all"><option value="COD">Cash on Delivery</option><option value="PaidToOwner">Paid to Owner</option></select></div></div><div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1.5">Note (optional)</label><input placeholder="Add a note..." value={form.note} onChange={e=>setForm({...form, note:e.target.value})} className="px-3 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full focus:ring-2 focus:ring-orange-500 transition-all" /></div><div className="flex gap-3 justify-end pt-2"><button type="button" onClick={() => setShowAddDialog(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button><button type="submit" disabled={loading} className="px-5 py-2.5 ui-btn ui-btn-primary rounded-lg font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">Add Record</button></div></form></div></div>
 )}

<div className="border-2 border-cyan-200 dark:border-cyan-800 rounded-xl overflow-x-auto shadow-sm"><DataTable
 columns={[
 { label: 'Date', key: 'date' },
 { label: 'Token No', key: 'tokenNo', render: r => r.tokenNo || '—' },
 { label: 'Rider', key: 'riderName' },
 { label: 'Deliveries', key: 'deliveries' },
 { label: 'Amount', render: r => `${Number(r.amount||0).toFixed(2)}` },
 { label: 'Method', render: r => r.method === 'COD' ? 'Cash on Delivery' : 'Paid to Owner' },
 { label: 'Settled', render: r => r.settled ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">Settled</span> : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">Unsettled</span> },
 { label: 'Note', key: 'note' },
 ]}
 data={filteredRecords}
 searchable={false}
 showLimit={false}
 exportable={false}
 /></div>

 {showRollup && rollup.length > 0 && (
 <div className="space-y-3 p-5 rounded-xl border-2 border-emerald-300 dark:border-emerald-800 bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/40 dark:to-gray-900 shadow-sm"><h2 className="text-lg font-bold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">Day Close Rollup</h2><div className="border-2 border-emerald-200 dark:border-emerald-800 rounded-xl overflow-x-auto"><DataTable
 columns={[
 { label: 'Rider', key: 'riderName' },
 { label: 'Token Nos', render: r => r.tokens?.length ? r.tokens.join(', ') : '—' },
 { label: 'Deliveries', key: 'deliveries' },
 { label: 'Amount', render: r => `${Number(r.amount||0).toFixed(2)}` },
 { label: 'Unsettled', key: 'unsettled' },
 { label: 'Actions', render: r => (
 <div className="flex items-center justify-center gap-2">
 <button disabled={loading} onClick={()=>settleRider(r.riderId, true)} className="px-3 py-1.5 rounded-lg ui-btn ui-btn-primary text-xs font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">Mark Settled</button>
 <button disabled={loading} onClick={()=>settleRider(r.riderId, false)} className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 text-white text-xs font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">Unsettle</button>
 </div>
 )},
 ]}
 data={rollup}
 showLimit={false}
 searchable={false}
 exportable={false}
 /></div></div>
 )}

 {/* Totals Summary (Bottom) */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4"><div className="p-4 rounded-xl border-2 border-blue-300 dark:border-blue-800 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-950/40 dark:to-gray-900 shadow-sm"><div className="text-xs font-bold text-[var(--color-text-muted)] mb-1"> Delivery Count</div><div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{totals.deliveries}</div></div><div className="p-4 rounded-xl border-2 border-emerald-300 dark:border-emerald-800 bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/40 dark:to-gray-900 shadow-sm"><div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-1"> Total Amount</div><div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{Number(totals.amount||0).toFixed(2)}</div></div></div>
 {ConfirmDialog}
 </div>
 )
}
