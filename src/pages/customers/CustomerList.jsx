import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../../state/DataContext.jsx'
import CustomerModal from '../../components/CustomerModal.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import Pagination from '../../components/Pagination.jsx'
import { format } from 'date-fns'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '../../utils/reportDoc.js'
import { btnPrint, btnPdf, btnCsv, downloadCsvFile, exportDateStamp } from '../../utils/listReportExport.js'

export default function CustomerList() {
 const { state, dispatch } = useData()
 const { token } = useAuth()
 const { confirm, ConfirmDialog } = useConfirm()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const [search, setSearch] = useState('')
 const [modalOpen, setModalOpen] = useState(false)
 const [editing, setEditing] = useState(null)
 const fileRef = useRef(null)
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
 const [rows, setRows] = useState([])
 const [total, setTotal] = useState(0)
 const [pages, setPages] = useState(1)
 const [loading, setLoading] = useState(false)
 const [jump, setJump] = useState(1)
 const [refreshKey, setRefreshKey] = useState(0)

 // Fetch paginated list from server
 useEffect(() => {
 let cancelled = false
 ;(async () => {
 try {
 setLoading(true)
 const params = new URLSearchParams({ page: String(page), limit: String(limit) })
 if (search.trim()) params.set('q', search.trim())
 const res = await fetch(`${API}/api/customers?${params.toString()}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
 if (!res.ok) throw new Error(`Failed to load customers (${res.status})`)
 const body = await res.json()
 if (!cancelled) {
 if (Array.isArray(body?.rows)) {
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 setRows(body.rows.map(mapId))
 setTotal(Number(body.total||0))
 const pg = Number(body.pages||1)
 setPages(pg)
 if (page > pg) setPage(pg)
 } else {
 // Backward compat: older server returned array
 const arr = Array.isArray(body) ? body : []
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 setRows(arr.slice(0, limit).map(mapId))
 setTotal(Array.isArray(body) ? body.length : 0)
 setPages(Math.max(1, Math.ceil((Array.isArray(body) ? body.length : 0)/limit)))
 }
 }
 } catch (e) {
 if (!cancelled) { setRows([]); setTotal(0); setPages(1) }
 } finally {
 if (!cancelled) setLoading(false)
 }
 })()
 return () => { cancelled = true }
 }, [API, token, page, limit, search, refreshKey])

 // Reset to page 1 when search changes
 useEffect(() => { setPage(1); setJump(1) }, [search])

 // Aggregate visits and spent from actual sales so list matches profile
 const salesAgg = useMemo(() => {
 const map = {}
 for (const s of (state.sales || [])) {
 const cid = s?.customer?.id
 if (!cid) continue
 if (!map[cid]) map[cid] = { visits: 0, spent: 0 }
 map[cid].visits += 1
 map[cid].spent += Number(s.total || 0) - Number(s.discount || 0)
 }
 return map
 }, [state.sales])

 const onImportClick = () => fileRef.current?.click()

 const parseCsv = (text) => {
 // Robust CSV parser supporting headers like: Id, Customer Name, Mobile No, Address
 // and also plain rows without header. We map to name, phone, address.
 const lines = String(text||'').split(/\r?\n/).filter(l=>l.trim().length)
 if (!lines.length) return []

 const parseLine = (l) => {
 const cells = []
 let cur = ''; let q = false
 for (let i=0;i<l.length;i++) {
 const ch = l[i]
 if (ch === '"') { q = !q; continue }
 if (ch === ',' && !q) { cells.push(cur); cur=''; continue }
 cur += ch
 }
 cells.push(cur)
 return cells.map(c => (c==null? '' : c.trim()))
 }

 const norm = (s) => String(s||'').toLowerCase().replace(/[^a-z]/g,'')
 const headerCells = parseLine(lines[0])
 const headerNorm = headerCells.map(norm)

 // Try to detect header indices
 const idx = { name: -1, phone: -1, address: -1, id: -1 }
 headerNorm.forEach((h, i) => {
 if (['id','sr','srno','serial','sno'].includes(h)) idx.id = i
 if (['name','customername','fullname'].includes(h)) idx.name = i
 if (['phone','phoneno','mobileno','mobilenumber','mobile','contact','contactno','contactnumber'].includes(h)) idx.phone = i
 if (['address','addr','location'].includes(h)) idx.address = i
 })

 let dataLines = lines
 if (idx.name !== -1 || idx.phone !== -1 || idx.address !== -1) {
 // Detected a header row — skip it in data
 dataLines = lines.slice(1)
 }

 const out = []
 for (const l of dataLines) {
 const cells = parseLine(l)
 let name = '', phone = '', address = ''

 if (idx.name !== -1 || idx.phone !== -1 || idx.address !== -1) {
 // Map using detected header indices
 name = cells[idx.name >= 0 ? idx.name : 0] || ''
 phone = cells[idx.phone >= 0 ? idx.phone : (idx.name >= 0 ? idx.name + 1 : 1)] || ''
 address = cells[idx.address >= 0 ? idx.address : (idx.phone >= 0 ? idx.phone + 1 : 2)] || ''
 } else {
 // No header detected. Handle common patterns:
 // Pattern A: Id, Name, Phone, Address
 if (cells.length >= 4 && /^\d+$/.test(cells[0])) {
 name = cells[1] || ''
 phone = cells[2] || ''
 address = cells[3] || ''
 } else {
 // Pattern B: Name, Phone, Address
 name = cells[0] || ''
 phone = cells[1] || ''
 address = cells[2] || ''
 }
 }

 // Normalize phone to keep digits (but keep original if digits empty)
 const digits = String(phone).replace(/\D+/g,'')
 phone = digits.length ? digits : (phone||'')

 if (name || phone) out.push({ name, phone, address })
 }
 return out
 }

 const importCSV = async (e) => {
 const file = e.target.files?.[0]
 if (!file) return
 try {
 const text = await file.text()
 const rows = parseCsv(text)
 if (!rows.length) { toast.error('No rows found. Expect columns: name,phone,address'); return }
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 let ok = 0, fail = 0
 for (const r of rows) {
 // normalize
 const payload = { name: r.name || '', phone: (r.phone||'').trim(), address: r.address || '', isRegular: false }
 try {
 const res = await fetch(`${API}/api/customers`, { method: 'POST', headers, body: JSON.stringify(payload) })
 if (res.ok) {
 const created = await res.json()
 const c = { id: created.id || created._id, name: created.name || payload.name, phone: created.phone || payload.phone, address: created.address || payload.address, isRegular: !!created.isRegular }
 dispatch({ type: 'ADD_CUSTOMER', payload: c })
 ok++
 } else {
 fail++
 }
 } catch { fail++ }
 }
 toast.success(`Import complete. Success: ${ok}, Failed: ${fail}`)
 } catch {
 toast.error('Failed to read CSV file')
 } finally {
 if (fileRef.current) fileRef.current.value = ''
 }
 }

 const onAdd = () => { setEditing(null); setModalOpen(true) }
 const onEdit = (c) => { setEditing(c); setModalOpen(true) }
 const onDelete = async (id) => {
 const confirmed = await confirm({ title: 'Delete Customer', message: 'Delete this customer?' })
 if (!confirmed) return
 // Optimistic updates: update local page list and global state
 const prevRows = rows
 setRows(prev => prev.filter(r => r.id !== id))
 setTotal(t => Math.max(0, t - 1))
 dispatch({ type:'DELETE_CUSTOMER', payload:{ id } })
 try {
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const res = await fetch(`${API}/api/customers/${id}`, { method: 'DELETE', headers })
 if (!res.ok) {
 // revert UI if server rejected
 setRows(prevRows)
 setTotal(t => t + 1)
 dispatch({ type:'ADD_CUSTOMER', payload: { id } }) // lightweight revert; full refetch next
 if (res.status === 401 || res.status === 403) {
 toast.error('You do not have permission to delete customers. Only Admin/Manager can delete.')
 } else {
 const msg = await res.text().catch(()=>`${res.status}`)
 toast.error(`Failed to delete customer: ${msg}`)
 }
 return
 }
 toast.success('Customer deleted')
 // After successful delete, refetch current page to sync server pagination
 setTimeout(() => { setPage(1); setJump(1) }, 0)
 } catch {
 // no-op; item already removed locally. Optionally refetch later.
 }
 }

 const mapCustomerRow = (c) => ({
   ...c,
   id: c.id || c._id,
   visits: salesAgg[c.id]?.visits ?? c.totalVisits ?? 0,
   spent: salesAgg[c.id]?.spent ?? c.totalSpent ?? 0,
 })

 const fetchFilteredCustomers = async () => {
 const params = new URLSearchParams({ page: '1', limit: '50000' })
 if (search.trim()) params.set('q', search.trim())
 const res = await fetch(`${API}/api/customers?${params.toString()}`, {
   headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
 })
 if (!res.ok) throw new Error('Failed to load customers')
 const body = await res.json()
 const list = Array.isArray(body?.rows) ? body.rows : (Array.isArray(body) ? body : [])
 return list.map(mapCustomerRow)
 }

 const customerReportRows = (list) => list.map(c => [
   c.name || '',
   c.phone || '',
   c.address || '',
   c.isRegular ? 'Yes' : 'No',
   String(c.visits ?? 0),
   Number(c.spent ?? 0).toLocaleString(),
 ])

 const buildCustomersReport = async () => {
 const list = await fetchFilteredCustomers()
 const totalSpent = list.reduce((a, c) => a + Number(c.spent || 0), 0)
 const fileName = `Customers-${exportDateStamp()}.pdf`
 const body =
 reportSummary([
 { label: 'Customers', amount: String(list.length) },
 { label: 'Total spent (PKR)', amount: totalSpent.toLocaleString() },
 ]) +
 reportSec(`Customers (${list.length})`) +
 reportTable({
 headers: ['Name', 'Phone', 'Address', 'Regular', { t: 'Visits', align: 'r' }, { t: 'Spent (PKR)', align: 'r' }],
 numbered: true,
 rows: list.map(c => [
 c.name || '-',
 c.phone || '-',
 c.address || '-',
 c.isRegular ? 'Yes' : 'No',
 { v: c.visits ?? 0, align: 'r' },
 { v: Number(c.spent ?? 0).toLocaleString(), align: 'r' },
 ]),
 emptyText: 'No customers match filters',
 })
 const html = wrapReportDoc({
 settings: state?.settings || {},
 title: 'Customers',
 reportLabel: 'Customer List',
 reportNo: `Rpt #: CUS-${exportDateStamp()}`,
 metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Search', search.trim() || 'All']],
 metaRight: [['Records', String(list.length)]],
 body,
 })
 return { html, fileName }
 }

 const openPrintPreview = async () => {
 try {
 const { html, fileName } = await buildCustomersReport()
 await previewHtmlReport(html, fileName)
 toast.success('Print preview opened')
 } catch (e) {
 console.error(e)
 toast.error('Print preview failed')
 }
 }

 const exportPDF = async () => {
 try {
 const { html, fileName } = await buildCustomersReport()
 await downloadHtmlReport(html, fileName)
 toast.success('PDF downloaded')
 } catch (e) {
 console.error(e)
 toast.error('Failed to export PDF')
 }
 }

 const exportCSV = async () => {
 try {
 const list = await fetchFilteredCustomers()
 downloadCsvFile(
 `customers_${format(new Date(), 'yyyy-MM-dd')}.csv`,
 ['Name', 'Phone', 'Address', 'Regular', 'Visits', 'Spent (PKR)'],
 customerReportRows(list)
 )
 toast.success('CSV exported successfully')
 } catch (e) {
 console.error(e)
 toast.error('Failed to export CSV')
 }
 }

 return (
 <div className="space-y-4"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2"><span className="text-3xl"></span> Customers
 </h1><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button><button type="button" onClick={exportPDF} className={btnPdf}>PDF</button><button type="button" onClick={exportCSV} className={btnCsv}>CSV</button><input value={search} onChange={e=>setSearch(e.target.value)} placeholder=" Search by name/phone..." className="px-4 py-2.5 border-2 border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 transition-all w-full sm:w-auto" /><button onClick={onAdd} className="ui-btn ui-btn-primary"> Add Customer</button><button onClick={onImportClick} className="ui-btn ui-btn-secondary"> Import CSV</button><input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importCSV} /></div></div><div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto shadow-sm"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"><tr><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">SR No</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Name</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Phone</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Address</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Regular</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Visits</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Spent</th><th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th></tr></thead><tbody>
 {rows.map((r, idx) => (
 <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="p-3 text-gray-500 dark:text-gray-400">{idx + 1}</td><td className="p-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center text-sm font-bold">
 {(r.name?.[0] || '').toUpperCase()}
 </div><span className="font-medium">{r.name || '-'}</span></div></td><td className="p-3 text-gray-600 dark:text-gray-400">{r.phone || '-'}</td><td className="p-3 text-gray-600 dark:text-gray-400 truncate max-w-xs">{r.address || '-'}</td><td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${r.isRegular ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
 {r.isRegular ? 'Yes' : 'No'}
 </span></td><td className="p-3 text-gray-700 dark:text-gray-300">{salesAgg[r.id]?.visits || r.totalVisits || 0}</td><td className="p-3 font-medium text-gray-800 dark:text-gray-200">PKR {(salesAgg[r.id]?.spent || r.totalSpent || 0).toLocaleString()}</td><td className="p-3 text-center"><div className="flex items-center justify-center gap-2"><button onClick={()=>onEdit(r)} className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-semibold shadow-sm hover:bg-blue-600 transition-all hover:scale-105 active:scale-95">Edit</button><button onClick={()=>onDelete(r.id)} className="px-3 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-semibold shadow-sm hover:bg-rose-600 transition-all hover:scale-105 active:scale-95">Delete</button></div></td></tr>
 ))}
 {!rows.length && (
 <tr><td colSpan={8} className="p-8 text-center text-gray-500 dark:text-gray-400"><div className="text-4xl mb-2"></div><div>No customers found</div></td></tr>
 )}
 </tbody></table></div>

 {/* Pagination controls */}
 <Pagination page={page} pages={pages} total={total} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} loading={loading} /><CustomerModal
 open={modalOpen}
 initial={editing}
 onClose={(changed)=>{
 setModalOpen(false)
 setEditing(null)
 if (changed) {
 // refetch current page to reflect latest edits/creates
 setRefreshKey(k=>k+1)
 }
 }}
 />
 {ConfirmDialog}
 </div>
 )
}
