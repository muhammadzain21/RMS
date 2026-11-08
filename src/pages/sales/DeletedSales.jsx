import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useLiveRefresh } from '../../hooks/useLiveRefresh.js'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'
import { exportDateStamp } from '../../utils/listReportExport.js'

export default function DeletedSales() {
 const { state, dispatch, businessDate } = useData()
 const { token } = useAuth()
 const [fromDate, setFromDate] = useState(businessDate || '')
 const [toDate, setToDate] = useState(businessDate || '')
 const [search, setSearch] = useState('')
 const [selected, setSelected] = useState(null)
 const [drawerOpen, setDrawerOpen] = useState(false)
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
 const [jump, setJump] = useState(1)

 const refreshDeleted = useCallback(async () => {
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const headers = token ? { Authorization: `Bearer ${token}` } : {}
 try {
 let qs = ''
 if (fromDate || toDate) {
 const from = fromDate || '0000-00-00'
 const to = toDate || '9999-12-31'
 qs = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
 }
 const res = await fetch(`${API}/api/sales/deleted${qs}`, { headers, cache: 'no-store' })
 if (!res.ok) return
 const rows = await res.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 dispatch({ type: 'HYDRATE', payload: { deletedSales: (rows || []).map(mapId) } })
 } catch {}
 }, [token, fromDate, toDate, dispatch])

 useEffect(() => { refreshDeleted() }, [refreshDeleted])
 useLiveRefresh(refreshDeleted, { intervalMs: 8000 })

 const customerText = (c) => {
 if (!c) return '-'
 if (typeof c === 'string') return c
 return c.name || c.phone || '-'
 }

 const rows = useMemo(() => {
 let list = state.deletedSales || []
 if (fromDate || toDate) {
 list = list.filter(s => {
 const saleDate = s.date
 if (fromDate && saleDate < fromDate) return false
 if (toDate && saleDate > toDate) return false
 return true
 })
 }
 let mapped = list.map((s, idx) => {
 // Recompute subtotal from items
 const modsConfig = state.settings?.modifiers || {}
 const subtotal = (s.items || []).reduce((sum, it) => {
 const m = (state.menu || []).find(mm => mm.id === it.itemId)
 const base = m ? Number(m.price || 0) : Number(it?.custom?.price || 0)
 const enabled = it?.mods || {}
 const addons = Object.keys(enabled).reduce((a, key) => {
 if (!enabled[key]) return a
 const cfg = modsConfig[key]
 return a + Number(cfg?.price || 0)
 }, 0)
 const qty = Number(it.qty || 0)
 return sum + ((base + addons) * qty)
 }, 0)
 const netAmount = (() => {
 const direct = Number(s.total)
 if (direct && !Number.isNaN(direct)) return direct
 const alt = Number(s.totalAmount || 0)
 if (alt && !Number.isNaN(alt)) return alt
 const itemsDiscount = Number(s.itemsDiscount || 0)
 const billDiscount = Number(s.billDiscount || s.discount || 0)
 const taxAmt = Number(s.taxAmt || 0)
 const serviceAmt = Number(s.serviceAmt || 0)
 return Math.max(0, subtotal - itemsDiscount - billDiscount + taxAmt + serviceAmt)
 })()
 return ({
 id: s.id,
 date: s.date,
 billNo: s?.tokenNo ? `${s.date}_${s.tokenNo}` : (s.billNo ? `BILL-${s.billNo}` : `BILL-${String(list.length - idx).padStart(5,'0')}`),
 soldBy: s.soldBy ?? '-',
 customer: customerText(s.customer),
 saleTotal: Number(subtotal),
 netAmount,
 paymentMethod: (s.paymentMethod || 'cash').toString().toUpperCase(),
 orderType: s.orderType || '-',
 tableNo: s.orderType === 'Dine-in' ? (s.tableNo || '-') : '-',
 waiterName: s.orderType === 'Dine-in' ? (s.waiterId ? (state.staff||[]).find(st=>st.id===s.waiterId)?.name || s.waiter || '-' : (s.waiter || '-')) : '-',
 riderName: s.orderType === 'Delivery' ? (s.riderId ? (state.riders||[]).find(r=>r.id===s.riderId)?.name || s.riderName || s.rider || '-' : (s.riderName || s.rider || '-')) : '-',
 detail: s,
 deletedAt: s.deletedAt ? format(new Date(s.deletedAt), 'yyyy-MM-dd HH:mm') : '-',
 deletedDate: s.deletedDate || (s.deletedAt ? format(new Date(s.deletedAt), 'yyyy-MM-dd') : '-'),
 deletedBy: s.deletedBy || 'system',
 })
 })
 if (search) {
 const t = search.toLowerCase()
 mapped = mapped.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(t)))
 }
 return mapped
 }, [state.deletedSales, state.menu, state.settings, fromDate, toDate, search])

 const pages = Math.ceil(rows.length / limit) || 1
 const paginatedRows = rows.slice((page - 1) * limit, page * limit)

 const cols = [
 { label: 'Deleted At', key: 'deletedAt' },
 { label: 'Deleted Date', key: 'deletedDate' },
 { label: 'Deleted By', key: 'deletedBy' },
 { label: 'Sale Date', key: 'date' },
 { label: 'Bill Number', key: 'billNo' },
 { label: 'Customer', key: 'customer', hideBelow: 'md' },
 { label: 'Order Type', key: 'orderType', hideBelow: 'lg' },
 { label: 'Sale Total', key: 'saleTotal', hideBelow: 'md', render: r => `PKR ${Number(r.saleTotal).toLocaleString()}` },
 { label: 'Net Amount', key: 'netAmount', render: r => `PKR ${Number(r.netAmount).toLocaleString()}` },
 { label: 'Payment Mode', key: 'paymentMethod' },
 { label: 'View', key: 'view', render: r => (
 <button
 onClick={() => { setSelected(r.detail); setDrawerOpen(true) }}
 className="px-2 py-1 text-xs rounded bg-indigo-500 text-white hover:bg-indigo-600"
 >
 View
 </button>
 ) },
 ]

 const exportPDF = () => {
 try {
 const doc = new jsPDF('l', 'pt', 'a4')
 doc.setFontSize(16)
 doc.text('Deleted Sales History', 40, 32)
 doc.setFontSize(10)
 doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 40, 48)
 const body = rows.map(r => [
 r.deletedAt,
 r.deletedDate,
 r.deletedBy,
 r.date,
 r.billNo,
 r.customer,
 r.orderType,
 `PKR ${Number(r.saleTotal).toLocaleString()}`,
 `PKR ${Number(r.netAmount).toLocaleString()}`,
 r.paymentMethod
 ])
 doc.autoTable({ 
 head: [['Deleted At','Deleted Date','Deleted By','Sale Date','Bill#','Customer','Order Type','Sale Total','Net Amount','Payment']], 
 body,
 startY: 60,
 styles: { 
 fontSize: 8,
 cellPadding: 4,
 overflow: 'linebreak',
 halign: 'left'
 },
 headStyles: { 
 fillColor: [239, 68, 68], 
 textColor: 255,
 fontSize: 9,
 fontStyle: 'bold'
 },
 margin: { left: 40, right: 40 },
 tableWidth: 'auto'
 })
 doc.save(`deleted_sales_${exportDateStamp()}.pdf`)
 toast.success('PDF exported successfully')
 } catch (err) {
 console.error('PDF export error:', err)
 toast.error('Failed to export PDF: ' + (err?.message || 'unknown error'))
 }
 }

 const openPrintPreview = async () => {
 try {
 const money = (n) => 'PKR ' + Number(n || 0).toLocaleString()
 const totalNet = rows.reduce((a, r) => a + Number(r.netAmount || 0), 0)
 const periodFrom = fromDate || '—'
 const periodTo = toDate || '—'
 const body =
 reportSummary([
 { label: 'Total Net Amount', amount: money(totalNet) },
 { label: 'Deleted Sales Count', amount: String(rows.length) },
 ]) +
 reportSec(`Deleted Sales (${rows.length})`) +
 reportTable({
 headers: ['Deleted At', 'Deleted By', 'Sale Date', 'Bill#', 'Customer', 'Order Type', { t: 'Sale Total', align: 'r' }, { t: 'Net Amount', align: 'r' }, 'Payment'],
 numbered: true,
 rows: rows.map(r => [
 r.deletedAt, r.deletedBy, r.date, r.billNo, r.customer, r.orderType,
 { v: money(r.saleTotal), align: 'r' },
 { v: money(r.netAmount), align: 'r' },
 r.paymentMethod,
 ]),
 })
 const html = wrapReportDoc({
 settings: state?.settings || {},
 title: 'Deleted Sales History',
 reportLabel: 'Deleted Sales Report',
 reportNo: `Rpt #: DEL-${format(new Date(), 'yyyyMMdd-HHmm')}`,
 metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Period', `${periodFrom} to ${periodTo}`]],
 metaRight: [['Records', String(rows.length)]],
 body,
 })
 await previewHtmlReport(html, `Deleted-Sales-${exportDateStamp()}.pdf`)
 } catch {
 toast.error('Print preview failed')
 }
 }

 const exportCSV = () => {
 const headers = ['Deleted At','Deleted Date','Deleted By','Sale Date','Bill Number','Customer','Order Type','Sale Total (PKR)','Net Amount (PKR)','Payment Mode']
 const lines = rows.map(r => [r.deletedAt,r.deletedDate,r.deletedBy,r.date,r.billNo,r.customer,r.orderType,r.saleTotal,r.netAmount,r.paymentMethod]
 .map(v => '"' + String(v ?? '').replaceAll('"','""') + '"').join(',')).join('\n')
 const csv = headers.join(',') + '\n' + lines
 const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = `deleted_sales_${exportDateStamp()}.csv`
 a.click()
 URL.revokeObjectURL(url)
 toast.success('CSV exported successfully')
 }

 return (
 <div className="space-y-4"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="page-title">Deleted Sales
 </h1></div><div className="px-4 py-3 rounded-xl bg-rose-50 border-2 border-rose-200 text-rose-900 text-sm flex items-center gap-2">This page shows sales that have been deleted from the system. These records are kept for audit purposes.
 </div><div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/30 border-2 border-rose-200 dark:border-rose-800"><div className="flex gap-3 flex-shrink-0"><button onClick={openPrintPreview} className="ui-btn ui-btn-print">Print</button><button onClick={exportPDF} className="ui-btn ui-btn-pdf">PDF</button><button onClick={exportCSV} className="ui-btn ui-btn-csv">CSV</button></div><div className="flex-shrink-0"><DatePicker label="From" value={fromDate} onChange={v => setFromDate(v)} /></div><div className="flex-shrink-0"><DatePicker label="To" value={toDate} onChange={v => setToDate(v)} /></div><div className="flex-1 min-w-0 basis-full sm:basis-auto"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full px-4 py-2 border-2 border-rose-200 dark:border-rose-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-rose-500 transition-all" /></div></div><div className="border-2 border-rose-200 dark:border-rose-800 rounded-xl overflow-x-auto shadow-sm"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"><tr><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Deleted At</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Deleted Date</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Deleted By</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Sale Date</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Bill Number</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Customer</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Order Type</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Sale Total</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Net Amount</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Payment Mode</th><th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th></tr></thead><tbody>
 {paginatedRows.map(r => (
 <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="p-3 text-gray-700 dark:text-gray-300">{r.deletedAt}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.deletedDate}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.deletedBy}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.date}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.billNo}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.customer}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.orderType}</td><td className="p-3 text-gray-700 dark:text-gray-300">PKR {Number(r.saleTotal).toLocaleString()}</td><td className="p-3 text-gray-700 dark:text-gray-300">PKR {Number(r.netAmount).toLocaleString()}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.paymentMethod}</td><td className="p-3 text-center"><button onClick={() => { setSelected(r.detail); setDrawerOpen(true) }} className="px-2 py-1 text-xs rounded bg-indigo-500 text-white hover:bg-indigo-600">View</button></td></tr>
 ))}
 {!rows.length && (
 <tr><td colSpan={11} className="p-8 text-center text-gray-500 dark:text-gray-400"><div className="text-4xl mb-2"></div><div>No deleted sales found</div></td></tr>
 )}
 </tbody></table></div>

 {/* Pagination controls */}
 <Pagination page={page} pages={pages} total={rows.length} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} />

 {drawerOpen && selected && (
 <><div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setDrawerOpen(false)} /><div className="fixed right-0 top-0 h-full w-full max-w-md z-50 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950 shadow-2xl flex flex-col border-l-4 border-rose-500"><div className="p-4 border-b border-rose-200 dark:border-rose-800 flex items-center justify-between bg-gradient-to-r from-rose-50 to-white dark:from-rose-950/30 dark:to-gray-900"><div className="font-bold text-lg text-rose-900 dark:text-rose-100 flex items-center gap-2"><span>Deleted Sale - {selected.billNo ? `BILL-${selected.billNo}` : ''}</span></div><button onClick={() => setDrawerOpen(false)} className="px-3 py-1.5 text-sm rounded-lg border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">Close</button></div><div className="p-4 space-y-4 overflow-auto"><div className="p-3 rounded-xl bg-gradient-to-r from-rose-50 to-rose-100/50 dark:from-rose-950/30 dark:to-rose-900/20 border border-rose-200 dark:border-rose-800"><div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Deleted At</div><div className="font-semibold text-gray-900 dark:text-gray-100">{selected.deletedAt ? format(new Date(selected.deletedAt), 'yyyy-MM-dd HH:mm') : '-'}</div></div><div className="p-3 rounded-xl bg-gradient-to-r from-rose-50 to-rose-100/50 dark:from-rose-950/30 dark:to-rose-900/20 border border-rose-200 dark:border-rose-800"><div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Deleted Date</div><div className="font-semibold text-gray-900 dark:text-gray-100">{selected.deletedDate || (selected.deletedAt ? format(new Date(selected.deletedAt), 'yyyy-MM-dd') : '-')}</div></div><div className="p-3 rounded-xl bg-gradient-to-r from-pink-50 to-pink-100/50 dark:from-pink-950/30 dark:to-pink-900/20 border border-pink-200 dark:border-pink-800"><div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Deleted By</div><div className="font-semibold text-gray-900 dark:text-gray-100">{selected.deletedBy || 'system'}</div></div><div className="p-3 rounded-xl bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border border-blue-200 dark:border-blue-800"><div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Sale Date</div><div className="font-semibold text-gray-900 dark:text-gray-100">{selected.date}</div></div><div className="grid grid-cols-2 gap-3"><div className="p-3 rounded-xl bg-gradient-to-r from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 border border-purple-200 dark:border-purple-800"><div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Sold By</div><div className="font-semibold text-gray-900 dark:text-gray-100">{selected.soldBy || '-'}</div></div><div className="p-3 rounded-xl bg-gradient-to-r from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 border border-emerald-200 dark:border-emerald-800"><div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Customer</div><div className="font-semibold text-gray-900 dark:text-gray-100">{customerText(selected.customer)}</div></div></div><div className="p-3 rounded-xl bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 border border-amber-200 dark:border-amber-800"><div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Order Type</div><div className="font-semibold text-gray-900 dark:text-gray-100">{selected.orderType || '-'}</div></div>
 {selected.orderType === 'Dine-in' && (
 <div className="text-sm text-gray-600">Table / Waiter: <span className="text-gray-900 dark:text-gray-100 font-medium">{`${selected.tableNo || '-'} • ${selected.waiter || '-'}`}</span></div>
 )}
 {selected.orderType === 'Delivery' && (
 <div className="text-sm text-gray-600">Rider: <span className="text-gray-900 dark:text-gray-100 font-medium">{(state.riders||[]).find(r=>r.id===selected.riderId)?.name || selected.riderName || selected.rider || '-'}</span></div>
 )}
 <div><div className="font-medium mb-2">Items</div><table className="w-full text-sm border"><thead className="bg-gray-50 dark:bg-gray-800"><tr><th className="p-2 text-left">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Amount</th></tr></thead><tbody>
 {(selected.items || []).map((it, i) => {
 const m = state.menu.find(mm => mm.id === it.itemId)
 const rate = m?.price || 0
 const amount = rate * it.qty
 return (
 <tr key={i} className="border-t"><td className="p-2">{m?.name || 'Item'}</td><td className="p-2 text-right">{it.qty}</td><td className="p-2 text-right">{rate.toLocaleString()}</td><td className="p-2 text-right">{amount.toLocaleString()}</td></tr>
 )
 })}
 </tbody></table></div><div className="flex justify-end gap-6 text-sm"><div>Discount: <span className="font-medium">{Number(selected.discount||0).toLocaleString()}</span></div><div>Total: <span className="font-medium">{Number(selected.total||0).toLocaleString()}</span></div><div>Net: <span className="font-semibold">{Math.max(0, Number(selected.total||0) - Number(selected.discount||0)).toLocaleString()}</span></div></div></div></div></>
 )}
 </div>
 )
}
