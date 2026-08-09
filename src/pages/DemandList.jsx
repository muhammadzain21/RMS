import { useEffect, useState, useCallback } from 'react'
import { useData } from '../state/DataContext.jsx'
import { useAuth } from '../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../components/useConfirm.jsx'
import DemandModal from '../components/DemandModal.jsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import DatePicker from '../components/DatePicker.jsx'
import Pagination from '../components/Pagination.jsx'

export default function DemandList() {
 const { state, dispatch, businessDate } = useData()
 const { token } = useAuth()
 const { confirm, ConfirmDialog } = useConfirm()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

 const [modalOpen, setModalOpen] = useState(false)
 const [editingDemand, setEditingDemand] = useState(null)
 const [statusFilter, setStatusFilter] = useState('all')
 const [dateFrom, setDateFrom] = useState(businessDate || '')
 const [dateTo, setDateTo] = useState(businessDate || '')
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(20)
 const [totalPages, setTotalPages] = useState(1)
 const [total, setTotal] = useState(0)
 const [demands, setDemands] = useState([])
 const [jump, setJump] = useState(1)
 const [expandedRows, setExpandedRows] = useState(new Set())
 const [search, setSearch] = useState('')

 const refreshDemands = useCallback(async () => {
 try {
 const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const params = new URLSearchParams()
 if (dateFrom) params.append('from', dateFrom)
 if (dateTo) params.append('to', dateTo)
 if (statusFilter !== 'all') params.append('status', statusFilter)
 if (search.trim()) params.append('search', search.trim())
 params.append('page', page)
 params.append('limit', limit)
 const url = `${API}/api/demands?${params.toString()}`

 const res = await fetch(url, { headers, cache: 'no-store' })
 if (res.ok) {
 const result = await res.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 setDemands((result.data || []).map(mapId))
 setTotal(result.total || 0)
 setTotalPages(result.totalPages || 1)
 }
 } catch {}
 }, [token, API, statusFilter, dateFrom, dateTo, page, limit, search])

 useEffect(() => { refreshDemands() }, [refreshDemands])

 useEffect(() => { setPage(1); setJump(1) }, [statusFilter, dateFrom, dateTo, limit, search])

 const handleStatusChange = async (demand, newStatus) => {
 try {
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const res = await fetch(`${API}/api/demands/${demand.id}/status`, {
 method: 'PATCH',
 headers,
 body: JSON.stringify({ status: newStatus })
 })
 if (res.ok) {
 dispatch({ type: 'UPDATE_DEMAND', payload: { id: demand.id, data: { status: newStatus } } })
 toast.success(`Status changed to ${newStatus}`)
 }
 } catch {
 toast.error('Failed to update status')
 }
 }

 const handleDelete = async (demand) => {
 const confirmed = await confirm({ 
 title: 'Delete Demand', 
 message: `Delete demand for ${demand.date} with ${demand.items?.length || 0} items?` 
 })
 if (!confirmed) return
 try {
 const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const res = await fetch(`${API}/api/demands/${demand.id}`, { method: 'DELETE', headers })
 if (res.ok) {
 dispatch({ type: 'DELETE_DEMAND', payload: { id: demand.id } })
 toast.success('Demand deleted')
 }
 } catch {
 toast.error('Failed to delete demand')
 }
 }

 const buildAllPDF = () => {
 const doc = new jsPDF('p', 'mm', 'a4')
 const company = state?.settings?.companyName || 'Restaurant'
 doc.setFontSize(16)
 doc.text(`${company} - Demand Report`, 14, 16)
 doc.setFontSize(10)
 doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 24)

 const data = demands.map(d => [
 d.date,
 d.status,
 d.items?.length || 0,
 d.items?.map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ') || '',
 d.createdByName || '-',
 ])

 autoTable(doc, {
 startY: 30,
 head: [['Date', 'Status', 'Items Count', 'Items', 'Created By']],
 body: data,
 styles: { fontSize: 8 },
 headStyles: { fillColor: [59, 130, 246] },
 })

 return doc
 }

 const buildSinglePDF = (demand) => {
 const doc = new jsPDF('p', 'mm', 'a4')
 const company = state?.settings?.companyName || 'Restaurant'
 doc.setFontSize(16)
 doc.text(`${company} - Demand`, 14, 16)
 doc.setFontSize(10)
 doc.text(`Date: ${demand.date}`, 14, 24)
 doc.text(`Status: ${demand.status}`, 14, 30)
 doc.text(`Created By: ${demand.createdByName || '-'}`, 14, 36)
 if (demand.note) {
 doc.text(`Note: ${demand.note}`, 14, 42)
 }

 const data = (demand.items || []).map(i => [
 i.name,
 i.quantity,
 i.unit,
 i.currentStock,
 i.isFromInventory ? 'Yes' : 'No',
 ])

 autoTable(doc, {
 startY: demand.note ? 50 : 44,
 head: [['Item', 'Quantity', 'Unit', 'Current Stock', 'From Inventory']],
 body: data,
 styles: { fontSize: 9 },
 headStyles: { fillColor: [59, 130, 246] },
 })

 return doc
 }

 const exportAllPDF = () => {
 try {
 const doc = buildAllPDF()
 doc.save(`demands-${format(new Date(), 'yyyy-MM-dd')}.pdf`)
 toast.success('PDF downloaded successfully')
 } catch {
 toast.error('Failed to download PDF')
 }
 }

 const printAllPDF = () => {
 try {
 const doc = buildAllPDF()
 const blobUrl = doc.output('bloburl')
 const printWindow = window.open(blobUrl, '_blank')
 if (printWindow) {
 printWindow.addEventListener('load', () => {
 printWindow.focus()
 printWindow.print()
 })
 }
 toast.success('PDF opened for printing')
 } catch {
 toast.error('Failed to open print preview')
 }
 }

 const exportSinglePDF = (demand) => {
 try {
 const doc = buildSinglePDF(demand)
 doc.save(`demand-${demand.date}-${demand.id?.slice(-6) || 'single'}.pdf`)
 toast.success('PDF downloaded successfully')
 } catch {
 toast.error('Failed to download PDF')
 }
 }

 const printSinglePDF = (demand) => {
 try {
 const doc = buildSinglePDF(demand)
 const blobUrl = doc.output('bloburl')
 const printWindow = window.open(blobUrl, '_blank')
 if (printWindow) {
 printWindow.addEventListener('load', () => {
 printWindow.focus()
 printWindow.print()
 })
 }
 toast.success('PDF opened for printing')
 } catch {
 toast.error('Failed to open print preview')
 }
 }

 const exportCSV = () => {
 const headers = ['Date','Status','Items Count','Items','Created By']
 const lines = demands.map(d => [
 d.date,
 d.status,
 d.items?.length || 0,
 d.items?.map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ') || '',
 d.createdByName || '-'
 ].map(v => '"' + String(v ?? '').replaceAll('"','""') + '"').join(',')).join('\n')
 const csv = headers.join(',') + '\n' + lines
 const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = `demands-${format(new Date(), 'yyyy-MM-dd')}.csv`
 a.click()
 URL.revokeObjectURL(url)
 toast.success('CSV exported successfully')
 }

 const getStatusBadge = (status) => {
 const styles = {
 pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
 sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
 completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
 }
 return (
 <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[status] || styles.pending}`}>
 {status}
 </span>
 )
 }

 return (
 <div className="space-y-5"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Demand Management
 </h1><button
 onClick={() => { setEditingDemand(null); setModalOpen(true) }}
 className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all hover:scale-105"
 >
 + Create Demand
 </button></div><div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4"><div className="flex flex-row flex-nowrap items-center gap-4"><div className="flex flex-col gap-1 flex-shrink-0"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Status</label><select
 value={statusFilter}
 onChange={e => setStatusFilter(e.target.value)}
 className="px-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all"
 ><option value="all">All Status</option><option value="pending">Pending</option><option value="sent">Sent</option><option value="completed">Completed</option></select></div><div className="flex-shrink-0"><DatePicker label="From" value={dateFrom} onChange={v => setDateFrom(v)} /></div><div className="flex-shrink-0"><DatePicker label="To" value={dateTo} onChange={v => setDateTo(v)} /></div><div className="flex-1 min-w-0"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Filter by item (name or category)</label><input value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g., Pizza, Midnight Deal, Zinger" className="mt-1 w-full px-3 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all" /></div><div className="flex items-end gap-3 flex-shrink-0"><button
 onClick={() => refreshDemands()}
 className="px-4 py-2 bg-gradient-to-br from-cyan-500 to-cyan-600 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
 >
 Refresh
 </button><button
 onClick={exportCSV}
 className="px-4 py-2 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
 >
 CSV
 </button><button
 onClick={exportAllPDF}
 className="px-4 py-2 bg-gradient-to-br from-red-500 to-red-600 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
 >
 PDF
 </button></div></div></div><div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs sm:text-sm"><thead className="bg-gray-50 dark:bg-gray-700"><tr><th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Date</th><th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Status</th><th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-[260px] sm:w-[360px]">Items</th><th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Note</th><th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Created By</th><th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Actions</th></tr></thead><tbody className="divide-y divide-gray-200 dark:divide-gray-700">
 {demands.map(demand => (
 <tr key={demand.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50"><td className="px-3 py-2 text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
 {demand.date}
 </td><td className="px-3 py-2">
 {getStatusBadge(demand.status)}
 </td><td className="px-3 py-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 align-top"><div className="min-w-[240px] sm:min-w-[340px]">
 {(() => {
 const items = demand.items || []
 const isExpanded = expandedRows.has(demand.id)
 const visible = isExpanded ? items : items.slice(0, 3)
 return (
 <>
 {visible.map((item, idx) => (
 <div key={idx} className="text-[10px] sm:text-xs leading-relaxed">
 {item.isFromInventory && <span className="text-blue-500"></span>} {item.name}: {item.quantity} {item.unit}
 </div>
 ))}
 {items.length > 3 && (
 <button
 onClick={() => {
 setExpandedRows(prev => {
 const next = new Set(prev)
 if (next.has(demand.id)) next.delete(demand.id)
 else next.add(demand.id)
 return next
 })
 }}
 className="text-[10px] sm:text-xs text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200 font-medium mt-1 underline"
 >
 {isExpanded ? 'View Less' : `View More (${items.length - 3})`}
 </button>
 )}
 </>
 )
 })()}
 </div></td><td className="px-3 py-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 max-w-[120px] sm:max-w-xs truncate">
 {demand.note || '-'}
 </td><td className="px-3 py-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
 {demand.createdByName || '-'}
 </td><td className="px-3 py-2"><div className="flex flex-wrap gap-1"><select
 value={demand.status}
 onChange={e => handleStatusChange(demand, e.target.value)}
 className="px-1.5 py-1 text-[10px] sm:text-xs rounded border bg-white dark:bg-gray-700 text-gray-900 dark:text-white dark:border-gray-600"
 ><option value="pending">Pending</option><option value="sent">Sent</option><option value="completed">Completed</option></select><button
 onClick={() => { setEditingDemand(demand); setModalOpen(true) }}
 className="px-1.5 py-1 text-[10px] sm:text-xs rounded bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300"
 >
 Edit
 </button><button
 onClick={() => printSinglePDF(demand)}
 className="px-1.5 py-1 text-[10px] sm:text-xs rounded bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300"
 title="Print this demand"
 >
 Print
 </button><button
 onClick={() => exportSinglePDF(demand)}
 className="px-1.5 py-1 text-[10px] sm:text-xs rounded bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300"
 title="Download PDF for this demand"
 >
 PDF
 </button><button
 onClick={() => handleDelete(demand)}
 className="px-1.5 py-1 text-[10px] sm:text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300"
 >
 Delete
 </button></div></td></tr>
 ))}
 </tbody></table></div></div><Pagination page={page} pages={totalPages} total={total} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} />

 {modalOpen && (
 <DemandModal
 open={modalOpen}
 onClose={() => { setModalOpen(false); setEditingDemand(null); refreshDemands() }}
 initial={editingDemand}
 />
 )}
 {ConfirmDialog}
 </div>
 )
}
