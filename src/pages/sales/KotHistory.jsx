import { useEffect, useMemo, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useLiveRefresh } from '../../hooks/useLiveRefresh.js'
import { openKotPrintUtil } from './printUtils.js'
import { createLineTotal } from './utils.js'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'
import { exportDateStamp } from '../../utils/listReportExport.js'

const btnPrint = 'ui-btn ui-btn-print'
const btnPdf = 'ui-btn ui-btn-pdf'
const btnCsv = 'ui-btn ui-btn-csv'

export default function KotHistory() {
 const { state, businessDate } = useData()
 const { token } = useAuth()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const [rows, setRows] = useState([])
 const [search, setSearch] = useState('')
 const [typeFilter, setTypeFilter] = useState('')
 const [loading, setLoading] = useState(false)
 const [expanded, setExpanded] = useState(new Set())
 // Pagination
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
 const [total, setTotal] = useState(0)
 const [jump, setJump] = useState(1)
 // Date filter
 const [fromDate, setFromDate] = useState(businessDate || '')
 const [toDate, setToDate] = useState(businessDate || '')

 const loadServer = useCallback(async ({ quiet = false } = {}) => {
 try {
 if (!quiet) setLoading(true)
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const params = new URLSearchParams()
 params.set('limit', String(limit))
 params.set('skip', String((page - 1) * limit))
 if (typeFilter) params.set('type', typeFilter)
 if (fromDate) params.set('from', fromDate)
 if (toDate) params.set('to', toDate)
 const res = await fetch(`${API}/api/kots?${params.toString()}`, { headers, cache: 'no-store' })
 if (res.ok) {
 const data = await res.json()
 const list = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data) ? data : [])
 setRows(list)
 setTotal(data?.total || list.length)
 return
 }
 if (!quiet) {
 setRows([])
 setTotal(0)
 }
 } catch {
 if (!quiet) {
 setRows([])
 setTotal(0)
 }
 } finally {
 if (!quiet) setLoading(false)
 }
 }, [API, token, limit, page, typeFilter, fromDate, toDate])

 const totalPages = Math.max(1, Math.ceil(total / limit)) || 1

 useEffect(() => { loadServer() }, [loadServer])
 useLiveRefresh(() => loadServer({ quiet: true }), { intervalMs: 8000 })

 const staffWaiterName = (id) => (state.staff || []).find(s => s.id === id)?.name || '-'

 const filtered = useMemo(() => {
 let list = Array.isArray(rows) ? rows.slice() : []
 if (typeFilter) list = list.filter(r => (r.orderType || '') === typeFilter)
 if (search.trim()) {
 const q = search.trim().toLowerCase()
 list = list.filter(r => (
 String(r.customer?.name||'').toLowerCase().includes(q) ||
 String(r.customer?.address||'').toLowerCase().includes(q) ||
 String(r.tableNo||'').toLowerCase().includes(q) ||
 staffWaiterName(r.waiterId).toLowerCase().includes(q)
 ))
 }
 // Newest first
 return list.sort((a,b) => (b.createdAt||0) - (a.createdAt||0))
 }, [rows, typeFilter, search, state.staff])

 const reprint = (r) => {
 try {
 const updatedState = { ...state, currentTokenNo: r.tokenNo }
 const lineTotal = createLineTotal(state.settings?.modifiers || {})
 openKotPrintUtil({
 state: updatedState,
 items: r.items || [],
 waiterId: r.waiterId || '',
 tableNo: r.tableNo || '',
 orderType: r.orderType || 'Dine-in',
 paymentMethod: 'Cash',
 cashReceived: 0,
 changeDue: 0,
 payRemarks: r.remarks || '',
 lineTotal,
 createdAt: r.createdAt || null,
 isReprint: true,
 autoPrint: false,
 previewInApp: true,
 })
 } catch {}
 }

 const counts = useMemo(() => {
 return filtered.reduce((acc, r) => { acc[r.orderType || 'Other'] = (acc[r.orderType || 'Other']||0) + 1; return acc }, {})
 }, [filtered])

 const itemSummary = useCallback((r) => {
 const menu = Array.isArray(state.menu) ? state.menu : []
 return (r.items || []).map(it => {
 try {
 const size = String(it?.mods?.size || it?.size || '').trim().toUpperCase()
 const ids = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
 if (ids.length) {
 const flvNames = ids.map(fid => (menu.find(x=>x.id===fid)?.name || '')).filter(Boolean)
 const title = flvNames.join(' + ') || (it?.custom?.name || (menu.find(x=>x.id===it.itemId)?.name || ''))
 return size ? `${title} (${size})` : title
 }
 const base = it?.custom?.name || (menu.find(x=>x.id===it.itemId)?.name || '')
 return size ? `${base} (${size})` : base
 } catch { return it?.custom?.name || '' }
 }).filter(Boolean).join('; ')
 }, [state.menu])

 const openPrintPreview = async () => {
 try {
 const body =
 reportSummary([
 { label: 'Total KOTs', amount: String(filtered.length) },
 { label: 'Dine-in', amount: String(counts['Dine-in'] || 0) },
 { label: 'Take-away', amount: String(counts['Take-away'] || 0) },
 { label: 'Delivery', amount: String(counts['Delivery'] || 0) },
 { label: 'Foodpanda', amount: String(counts['Foodpanda'] || 0) },
 ]) +
 reportSec(`KOT History (${filtered.length})`) +
 reportTable({
 headers: ['Time', 'Token', 'Type', 'Table', 'Waiter', 'Items', 'Remarks'],
 numbered: true,
 rows: filtered.map(r => [
 r.createdAt ? format(new Date(r.createdAt), 'yyyy-MM-dd HH:mm') : '-',
 r.tokenNo || '-',
 r.orderType || '-',
 r.tableNo || '-',
 staffWaiterName(r.waiterId),
 itemSummary(r) || '-',
 r.remarks || '',
 ]),
 emptyText: 'No KOTs found',
 })
 const html = wrapReportDoc({
 settings: state?.settings || {},
 title: 'KOT History',
 reportLabel: 'KOT History Report',
 reportNo: `Rpt #: KOT-${fromDate || 'all'}-${toDate || 'all'}`,
 metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['From', fromDate || '...'], ['To', toDate || '...']],
 metaRight: [['Records', String(filtered.length)], ['Type filter', typeFilter || 'All']],
 body,
 })
 await previewHtmlReport(html, `KOT-History-${fromDate || 'all'}.pdf`)
 toast.success('Print preview opened')
 } catch (err) {
 console.error(err)
 toast.error('Print preview failed')
 }
 }

 const exportPDF = () => {
 try {
 const doc = new jsPDF('l', 'pt', 'a4')
 doc.setFontSize(14)
 doc.text(state?.settings?.companyName || 'KOT History', 40, 32)
 doc.setFontSize(10)
 doc.text(`${fromDate || '...'} to ${toDate || '...'} · ${filtered.length} records`, 40, 46)
 doc.autoTable({
 head: [['Time', 'Token', 'Type', 'Table', 'Waiter', 'Items', 'Remarks']],
 body: filtered.map(r => [
 r.createdAt ? format(new Date(r.createdAt), 'yyyy-MM-dd HH:mm') : '-',
 r.tokenNo || '-',
 r.orderType || '-',
 r.tableNo || '-',
 staffWaiterName(r.waiterId),
 itemSummary(r),
 r.remarks || '',
 ]),
 startY: 54,
 styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
 headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
 margin: { left: 40, right: 40 },
 })
 doc.save(`kot_history_${exportDateStamp()}.pdf`)
 toast.success('PDF exported successfully')
 } catch (err) {
 console.error(err)
 toast.error('Failed to export PDF')
 }
 }

 const exportCSV = () => {
 try {
 const header = ['Time', 'Token', 'Type', 'Table', 'Waiter', 'Items', 'Remarks']
 const lines = filtered.map(r =>
 [r.createdAt ? format(new Date(r.createdAt), 'yyyy-MM-dd HH:mm') : '', r.tokenNo, r.orderType, r.tableNo, staffWaiterName(r.waiterId), itemSummary(r), r.remarks || '']
 .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
 )
 const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' })
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = `kot_history_${exportDateStamp()}.csv`
 a.click()
 URL.revokeObjectURL(url)
 toast.success('CSV exported successfully')
 } catch {
 toast.error('Failed to export CSV')
 }
 }

 return (
 <div className="space-y-4"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="page-title">KOT History
 </h1></div><div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"><div className="flex gap-3 flex-shrink-0"><button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button><button type="button" onClick={exportPDF} className={btnPdf}>PDF</button><button type="button" onClick={exportCSV} className={btnCsv}>CSV</button></div><div className="flex flex-col gap-1 flex-shrink-0"><label className="text-xs font-semibold text-[var(--color-text-muted)] tracking-wide">Order Type</label><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className="px-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all"><option value="">All Types</option><option value="Dine-in">Dine-in</option><option value="Take-away">Take-away</option><option value="Delivery">Delivery</option><option value="Foodpanda">Foodpanda</option></select></div><div className="flex-shrink-0"><DatePicker label="From" value={fromDate} onChange={v=>setFromDate(v)} /></div><div className="flex-shrink-0"><DatePicker label="To" value={toDate} onChange={v=>setToDate(v)} /></div><div className="flex-1 min-w-0"><label className="text-xs font-semibold text-[var(--color-text-muted)] tracking-wide">Search</label><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Token / table / waiter" className="mt-1 w-full px-3 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all" /></div><div className="flex items-end gap-3 flex-shrink-0"><button onClick={loadServer} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary">Refresh</button></div></div><div className="mt-4 flex flex-wrap gap-2 sm:gap-4 text-sm"><div className="px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"><span className="text-blue-800 dark:text-blue-200 font-medium">Dine-in: {counts['Dine-in']||0}</span></div><div className="px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"><span className="text-green-800 dark:text-green-200 font-medium">Take-away: {counts['Take-away']||0}</span></div><div className="px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800"><span className="text-purple-800 dark:text-purple-200 font-medium">Delivery: {counts['Delivery']||0}</span></div><div className="px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800"><span className="text-orange-800 dark:text-orange-200 font-medium">Foodpanda: {counts['Foodpanda']||0}</span></div></div><div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto shadow-sm"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"><tr><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Time</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Token</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Type</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Table</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Waiter</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Items</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Remarks</th><th className="p-3 text-center font-semibold text-gray-700 dark:text-gray-300">Reprint</th></tr></thead><tbody>
 {filtered.map(r => (
 <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="p-3 text-gray-600 dark:text-gray-400">{r.createdAt ? format(new Date(r.createdAt), 'yyyy-MM-dd HH:mm:ss') : '-'}</td><td className="p-3 font-medium text-blue-600 dark:text-blue-400">{r.tokenNo || '-'}</td><td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${
 r.orderType === 'Dine-in' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' :
 r.orderType === 'Take-away' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' :
 r.orderType === 'Delivery' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200' :
 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200'
 }`}>
 {r.orderType || '-'}
 </span></td><td className="p-3 text-gray-700 dark:text-gray-300">{r.tableNo || '-'}</td><td className="p-3 text-gray-700 dark:text-gray-300">{staffWaiterName(r.waiterId)}</td><td className="p-3">
 {(() => {
 const menu = Array.isArray(state.menu) ? state.menu : []
 const displayFor = (it) => {
 try {
 const size = String(it?.mods?.size || it?.size || '').trim().toUpperCase()
 const ids = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
 if (ids.length) {
 const flvNames = ids.map(fid => (menu.find(x=>x.id===fid)?.name || '')).filter(Boolean)
 const title = flvNames.join(' + ') || (it?.custom?.name || (menu.find(x=>x.id===it.itemId)?.name || ''))
 return size ? `${title} (${size})` : title
 }
 const base = it?.custom?.name || (menu.find(x=>x.id===it.itemId)?.name || '')
 return size ? `${base} (${size})` : base
 } catch { return it?.custom?.name || '' }
 }
 const names = (r.items||[]).map(displayFor).filter(Boolean)
 const isExpanded = expanded.has(r.id)
 const show = isExpanded ? names : names.slice(0, 3)
 const extra = Math.max(0, names.length - show.length)
 return (
 <span className="text-sm text-gray-700 dark:text-gray-300">
 {show.join(', ')}
 {!isExpanded && extra > 0 && (
 <button
 type="button"
 className="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline font-medium"
 onClick={() => setExpanded(prev => { const n = new Set(prev); n.add(r.id); return n })}
 >
 +{extra} more
 </button>
 )}
 {isExpanded && names.length > 3 && (
 <button
 type="button"
 className="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline font-medium"
 onClick={() => setExpanded(prev => { const n = new Set(prev); n.delete(r.id); return n })}
 >
 Show less
 </button>
 )}
 </span>
 )
 })()}
 </td><td className="p-3 text-gray-600 dark:text-gray-400 text-sm">{r.remarks || ''}</td><td className="p-3 text-center"><button className="px-3 py-1.5 rounded-lg ui-btn ui-btn-primary text-sm font-medium transition-colors" onClick={()=>reprint(r)}> Print</button></td></tr>
 ))}
 {!filtered.length && (
 <tr><td colSpan={8} className="p-8 text-center text-gray-500 dark:text-gray-400"><div className="text-4xl mb-2"></div><div>No KOTs found</div></td></tr>
 )}
 </tbody></table></div>

 {/* Pagination controls */}
 <Pagination page={page} pages={totalPages} total={total} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} loading={loading} />
 </div>
 )
}
