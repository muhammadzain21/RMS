import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'
import { useLiveRefresh } from '../../hooks/useLiveRefresh.js'
import SupplierModal from '../../components/SupplierModal.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import { format } from 'date-fns'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '../../utils/reportDoc.js'
import { btnPrint, btnPdf, btnCsv, downloadCsvFile, exportDateStamp } from '../../utils/listReportExport.js'

export default function SupplierList() {
 const { state } = useData()
 const navigate = useNavigate()
 const { token } = useAuth()
 const { activeBranchId } = useBranch()
 const { confirm, ConfirmDialog } = useConfirm()
 const [search, setSearch] = useState('')
 const [modalOpen, setModalOpen] = useState(false)
 const [editing, setEditing] = useState(null)
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
 const [total, setTotal] = useState(0)
 const [jump, setJump] = useState(1)
 const [loading, setLoading] = useState(false)
 const [rows, setRows] = useState([]) // Local state for paginated display
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

 const totalPages = Math.ceil(total / limit) || 1

 const goToPage = (p) => {
 if (p < 1 || p > totalPages) return
 setPage(p)
 reloadSuppliers(p, search)
 }

 const onSearchChange = (e) => {
 const val = e.target.value
 setSearch(val)
 setPage(1)
 reloadSuppliers(1, val)
 }

 const reloadSuppliers = useCallback(async (pageNum = page, searchQuery = search) => {
 setLoading(true)
 try {
 const headers = token ? { Authorization: `Bearer ${token}` } : {}
 const params = new URLSearchParams({ page: String(pageNum), limit: String(limit) })
 if (searchQuery) params.set('q', searchQuery)
 const res = await fetch(`${API}/api/suppliers?${params.toString()}`, { headers, cache: 'no-store' })
 const data = await res.json().catch(() => ({}))
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 setRows((data.rows || []).map(mapId))
 setTotal(data.total || 0)
 } catch {
 setRows([])
 setTotal(0)
 }
 setLoading(false)
 }, [API, token, page, limit, search])

 useEffect(() => {
 setPage(1)
 reloadSuppliers(1, search)
 }, [activeBranchId]) // eslint-disable-line react-hooks/exhaustive-deps

 useLiveRefresh(() => reloadSuppliers(page, search))
 const onDelete = async (id) => {
 const confirmed = await confirm({ title: 'Delete Supplier', message: 'Delete this supplier?' })
 if (!confirmed) return
 try {
 const headers = token ? { Authorization: `Bearer ${token}` } : {}
 const res = await fetch(`${API}/api/suppliers/${id}`, { method: 'DELETE', headers })
 if (!res.ok) throw new Error('Failed')
 await reloadSuppliers()
 toast.success('Supplier deleted')
 } catch {
 toast.error('Failed to delete supplier.')
 }
 }

 const onAdd = () => { setEditing(null); setModalOpen(true) }
 const onEdit = (s) => { setEditing(s); setModalOpen(true) }

 const fetchFilteredSuppliers = async () => {
 const headers = token ? { Authorization: `Bearer ${token}` } : {}
 const params = new URLSearchParams({ page: '1', limit: '50000' })
 if (search) params.set('q', search)
 const res = await fetch(`${API}/api/suppliers?${params.toString()}`, { headers })
 const data = await res.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 return (data.rows || []).map(mapId)
 }

 const supplierReportRows = (list) => list.map(r => [
   r.name || r.company || '',
   r.company || '',
   r.phone || '',
   r.address || '',
   r.status || 'Active',
 ])

 const buildReportHtml = async () => {
 const list = await fetchFilteredSuppliers()
 const fileName = `Suppliers-${exportDateStamp()}.pdf`
 const body =
 reportSummary([{ label: 'Suppliers', amount: String(list.length) }]) +
 reportSec(`Suppliers (${list.length})`) +
 reportTable({
 headers: ['Name', 'Company', 'Phone', 'Address', 'Status'],
 numbered: true,
 rows: list.map(r => [
 r.name || r.company || '-',
 r.company || '-',
 r.phone || '-',
 r.address || '-',
 r.status || 'Active',
 ]),
 emptyText: 'No suppliers match filters',
 })
 const html = wrapReportDoc({
 settings: state?.settings || {},
 title: 'Suppliers',
 reportLabel: 'Supplier List',
 reportNo: `Rpt #: SUP-${exportDateStamp()}`,
 metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Search', search.trim() || 'All']],
 metaRight: [['Records', String(list.length)]],
 body,
 })
 return { html, fileName }
 }

 const openPrintPreview = async () => {
 try {
 const { html, fileName } = await buildReportHtml()
 await previewHtmlReport(html, fileName)
 toast.success('Print preview opened')
 } catch (e) {
 console.error(e)
 toast.error('Print preview failed')
 }
 }

 const exportPDF = async () => {
 try {
 const { html, fileName } = await buildReportHtml()
 await downloadHtmlReport(html, fileName)
 toast.success('PDF downloaded')
 } catch (e) {
 console.error(e)
 toast.error('Failed to export PDF')
 }
 }

 const exportCSV = async () => {
 try {
 const list = await fetchFilteredSuppliers()
 downloadCsvFile(
 `suppliers_${format(new Date(), 'yyyy-MM-dd')}.csv`,
 ['Name', 'Company', 'Phone', 'Address', 'Status'],
 supplierReportRows(list)
 )
 toast.success('CSV exported successfully')
 } catch (e) {
 console.error(e)
 toast.error('Failed to export CSV')
 }
 }

 return (
 <div className="space-y-4"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2"><span className="text-3xl"></span> Branch Suppliers
 </h1><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button><button type="button" onClick={exportPDF} className={btnPdf}>PDF</button><button type="button" onClick={exportCSV} className={btnCsv}>CSV</button><input value={search} onChange={onSearchChange} placeholder="Search by name/company..." className="px-4 py-2.5 border-2 border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 transition-all" /><button onClick={onAdd} className="ui-btn ui-btn-primary">Add Supplier</button></div></div><DataTable
 columns={[
 { label: 'SR No', key: 'srNo', render: (_, idx) =><span className="text-gray-500 dark:text-gray-400">{(page - 1) * limit + idx + 1}</span> },
 { label: 'Name', key: 'name', render: r => (
 <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center text-sm font-bold">
 {(r.name?.[0] || r.company?.[0] || '').toUpperCase()}
 </div><span className="font-medium">{r.name || r.company || '-'}</span></div>
 )},
 { label: 'Company', key: 'company', render: r =><span className="text-gray-600 dark:text-gray-400">{r.company || '-'}</span> },
 { label: 'Phone', key: 'phone', render: r =><span className="text-gray-600 dark:text-gray-400">{r.phone || '-'}</span> },
 { label: 'Address', key: 'address', render: r =><span className="text-gray-600 dark:text-gray-400 truncate max-w-xs">{r.address || '-'}</span> },
 { label: 'Status', key: 'status', render: r => (
 <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.status==='Active' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
 {r.status || 'Active'}
 </span>
 )},
 { label: 'Actions', key: 'actions', render: r => (
 <div className="flex items-center gap-2">
 <button onClick={()=>navigate(`/suppliers/${r.id}`)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors">View</button>
 <button onClick={()=>onEdit(r)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors">Edit</button>
 <button onClick={()=>onDelete(r.id)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition-colors">Delete</button>
 </div>
 )}
 ]}
 data={rows}
 searchable={false}
 exportable={false}
 pageSize={9999}
 showLimit={false}
 hidePagination
 maxHeight={520}
 />

 {/* Server-side Pagination controls */}
 <Pagination page={page} pages={totalPages} total={total} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1); reloadSuppliers(1, search) }} onPageChange={p=>goToPage(p)} loading={loading} /><SupplierModal open={modalOpen} initial={editing} onClose={(ok)=>{ setModalOpen(false); setEditing(null); if (ok) reloadSuppliers() }} />
 {ConfirmDialog}
 </div>
 )
}
