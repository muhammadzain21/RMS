import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useLiveRefresh } from '../../hooks/useLiveRefresh.js'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'
import { toast } from 'react-hot-toast'
import DeleteKeyModal from '../../components/DeleteKeyModal.jsx'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'
import { exportDateStamp } from '../../utils/listReportExport.js'

export default function CashOpening() {
 const { state, dispatch, businessDate } = useData()
 const { user, token } = useAuth()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const authHeaders = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
 const today = businessDate || format(new Date(), 'yyyy-MM-dd')
 const [date, setDate] = useState(today)
 const [openingCash, setOpeningCash] = useState('')
 const [search, setSearch] = useState('')

 // Prefill from existing opening (including auto from previous day close)
 useEffect(() => {
  const entry = (state.cashOpenings || []).find(e => String(e.date) === String(date))
  if (entry) {
   setOpeningCash(String(Number(entry.openingCash || 0)))
   return
  }
  // Fallback: prior day close left-at-counter
  const prev = (state.dayCloses || [])
   .filter(d => String(d.date) < String(date))
   .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]
  if (prev && prev.leftAtCounter != null) {
   setOpeningCash(String(Number(prev.leftAtCounter || 0)))
   return
  }
  setOpeningCash('')
 }, [date, state.cashOpenings, state.dayCloses])
 const [from, setFrom] = useState('')
 const [to, setTo] = useState('')
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
 const [total, setTotal] = useState(0)
 const [jump, setJump] = useState(1)
 const [loading, setLoading] = useState(false)
 const [serverRows, setServerRows] = useState([])

 // Secret-key modal state (shared pattern with sale deletion)
 const [deleteOpen, setDeleteOpen] = useState(false)
 const [deleteTarget, setDeleteTarget] = useState(null)
 const [deleteBusy, setDeleteBusy] = useState(false)
 const [deleteErr, setDeleteErr] = useState('')
 const [reopenOpen, setReopenOpen] = useState(false)
 const [reopenBusy, setReopenBusy] = useState(false)
 const [reopenErr, setReopenErr] = useState('')

 // lock if selected date is closed
 const closedDates = useMemo(() => new Set((state.dayCloses||[]).map(d => d.date)), [state.dayCloses])
 const isSelectedDateClosed = closedDates.has(date)
 const isTodayClosed = closedDates.has(today)

 const rows = useMemo(() => [...serverRows], [serverRows])

 const totalOpening = useMemo(() => rows.reduce((a,b) => a + Number(b.openingCash||0), 0), [rows])
 const pageCount = useMemo(() => Math.max(1, Math.ceil(Math.max(0, Number(total||0)) / Math.max(1, Number(limit||10)))), [total, limit])
 useEffect(() => { setPage(1) }, [search, from, to])
 useEffect(() => { if (page > pageCount) setPage(pageCount) }, [pageCount])

 // Server-side fetch for history grid
 useEffect(() => {
 let cancelled = false
 ;(async () => {
 try {
 setLoading(true)
 const params = new URLSearchParams()
 if (from) params.set('from', from)
 if (to) params.set('to', to)
 if (page) params.set('page', String(page))
 if (limit) params.set('limit', String(limit))
 if (search.trim()) params.set('search', search.trim())
 const url = `${API}/api/cash-openings${params.toString() ? `?${params.toString()}` : ''}`
 const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' })
 if (!res.ok) throw new Error(`Failed to load cash openings (${res.status})`)
 const data = await res.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 if (Array.isArray(data)) {
 if (!cancelled) { setServerRows((data||[]).map(mapId)); setTotal((data||[]).length) }
 } else {
 const list = Array.isArray(data?.rows) ? data.rows : []
 const tot = Number(data?.total || list.length || 0)
 if (!cancelled) { setServerRows(list.map(mapId)); setTotal(tot) }
 }
 } catch (e) {
 if (!cancelled) { setServerRows([]); setTotal(0) }
 } finally {
 if (!cancelled) setLoading(false)
 }
 })()
 return () => { cancelled = true }
 }, [API, token, from, to, page, limit, search])

 const refreshOpenings = useCallback(async () => {
 try {
 const params = new URLSearchParams()
 if (from) params.set('from', from)
 if (to) params.set('to', to)
 if (page) params.set('page', String(page))
 if (limit) params.set('limit', String(limit))
 if (search.trim()) params.set('search', search.trim())
 const url = `${API}/api/cash-openings${params.toString() ? `?${params.toString()}` : ''}`
 const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' })
 if (res.ok) {
 const data = await res.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 if (Array.isArray(data)) { setServerRows((data||[]).map(mapId)); setTotal((data||[]).length) }
 else { const list = Array.isArray(data?.rows) ? data.rows : []; const tot = Number(data?.total || list.length || 0); setServerRows(list.map(mapId)); setTotal(tot) }
 }
 const resAll = await fetch(`${API}/api/cash-openings`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' })
 if (resAll.ok) {
 const listAll = await resAll.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 dispatch({ type: 'HYDRATE', payload: { cashOpenings: (listAll || []).map(mapId) } })
 }
 } catch {}
 }, [API, token, from, to, page, limit, search, dispatch])

 useLiveRefresh(refreshOpenings)

 const onOpen = async (e) => {
 e.preventDefault()
 if (!date) return
 const amt = Number(openingCash)
 if (Number.isNaN(amt) || amt < 0) {
 toast.error('Please enter a valid positive amount')
 return
 }
 // Closed day must be re-opened first — that deletes the day close record,
 // so it requires the secret key just like deleting an entry
 if (isSelectedDateClosed) {
 setReopenErr('')
 setReopenOpen(true)
 return
 }
 await recordOpening()
 }

 // Re-open the closed day using the secret key, then continue to record opening
 const submitReopen = async (key) => {
 try {
 setReopenBusy(true)
 setReopenErr('')
 const re = await fetch(`${API}/api/day-closes/reopen`, {
 method: 'POST',
 headers: { ...authHeaders, 'X-Delete-Key': key },
 body: JSON.stringify({ date })
 })
 if (!re.ok) {
 const j = await re.json().catch(() => ({}))
 setReopenErr(j?.error || `Failed to re-open day (${re.status})`)
 setReopenBusy(false)
 return
 }
 await refreshDayCloses()
 setReopenBusy(false)
 setReopenOpen(false)
 await recordOpening()
 } catch {
 setReopenErr('Network error')
 setReopenBusy(false)
 }
 }

 const recordOpening = async () => {
 const amt = Number(openingCash)
 try {
 const res = await fetch(`${API}/api/cash-openings`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ date, openingCash: amt, note: '', userId: user?.id, userName: user?.name }) })
 if (!res.ok) throw new Error('Failed to open day')
 const saved = await res.json().catch(() => null)
 if (saved) {
  dispatch({
   type: 'UPSERT_CASH_OPENING',
   payload: { id: saved.id || saved._id, date: saved.date || date, openingCash: saved.openingCash ?? amt, note: saved.note || '', userName: saved.userName || user?.name || '' },
  })
 }
 await refreshOpenings()
 toast.success(`Opening cash recorded: PKR ${amt.toLocaleString()}`)
 } catch {
 toast.error('Failed to open day')
 }
 }

 const refreshDayCloses = async () => {
 try {
 const res = await fetch(`${API}/api/day-closes`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' })
 if (!res.ok) return
 const list = await res.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 dispatch({ type: 'HYDRATE', payload: { dayCloses: (list || []).map(mapId) } })
 } catch {}
 }

 const onDelete = (row) => {
 setDeleteTarget(row)
 setDeleteErr('')
 setDeleteOpen(true)
 }

 const submitDelete = async (key) => {
 if (!deleteTarget) return
 try {
 setDeleteBusy(true)
 setDeleteErr('')
 const res = await fetch(`${API}/api/cash-openings/${deleteTarget.id}`, {
 method: 'DELETE',
 headers: { ...authHeaders, 'X-Delete-Key': key }
 })
 if (!res.ok) {
 const j = await res.json().catch(() => ({}))
 setDeleteErr(j?.error || `Failed to delete (${res.status})`)
 setDeleteBusy(false)
 return
 }
 setDeleteBusy(false)
 setDeleteOpen(false)
 setDeleteTarget(null)
 toast.success('Day opening deleted')
 await refreshOpenings()
 } catch {
 setDeleteErr('Network error')
 setDeleteBusy(false)
 }
 }

 const openPrintPreview = async () => {
 try {
 const money = (n) => 'PKR ' + Number(n || 0).toLocaleString()
 const periodFrom = from || '—'
 const periodTo = to || '—'
 const body =
 reportSummary([
 { label: 'Total Opening Cash', amount: money(totalOpening) },
 { label: 'Records', amount: String(rows.length) },
 ]) +
 reportSec(`Day Opening History (${rows.length})`) +
 reportTable({
 headers: ['Date', { t: 'Opening Cash', align: 'r' }, 'User'],
 numbered: true,
 rows: rows.map(r => [r.date, { v: money(r.openingCash), align: 'r' }, r.userName || '-']),
 })
 const html = wrapReportDoc({
 settings: state?.settings || {},
 title: 'Day Opening History',
 reportLabel: 'Cash Opening Report',
 reportNo: `Rpt #: CO-${format(new Date(), 'yyyyMMdd-HHmm')}`,
 metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Period', `${periodFrom} to ${periodTo}`]],
 metaRight: [['Records', String(rows.length)]],
 body,
 })
 await previewHtmlReport(html, `Cash-Opening-${exportDateStamp()}.pdf`)
 } catch {
 toast.error('Print preview failed')
 }
 }

 const exportCSV = () => {
 const headers = ['Date','Opening Cash','User']
 const lines = rows.map(r => [r.date, r.openingCash, r.userName || '']
 .map(v => '"' + String(v ?? '').replaceAll('"','""') + '"').join(',')).join('\n')
 const csv = headers.join(',') + '\n' + lines
 const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = 'cash_opening_history.csv'
 a.click()
 URL.revokeObjectURL(url)
 }

 const exportPDF = () => {
 try {
 const doc = new jsPDF()
 doc.setFontSize(14)
 doc.text('Day Opening History', 14, 16)
 const body = rows.map(r => [r.date, `PKR ${Number(r.openingCash).toLocaleString()}`, r.userName || '-'])
 autoTable(doc, {
 head: [['Date','Opening Cash','User']],
 body,
 startY: 20,
 styles: { fontSize: 9 },
 headStyles: { fillColor: [240,240,240], textColor: 0 },
 foot: [[
 'Totals', `PKR ${totalOpening.toLocaleString()}`, ''
 ]],
 footStyles: { fillColor: [245,245,245] },
 })
 doc.save('cash_opening_history.pdf')
 toast.success('PDF exported successfully')
 } catch (err) {
 console.error('PDF export error:', err)
 toast.error('Failed to export PDF: ' + (err?.message || 'unknown error'))
 }
 }

 return (
 <div className="space-y-4"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="page-title">Day Opening
 </h1></div><div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4"><h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Record Opening Cash</h2>
 {isTodayClosed && (
 <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"> Today Closed</span>
 )}
 </div>
 
 {isSelectedDateClosed && (
 <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"><div className="flex items-center gap-2 text-amber-800 dark:text-amber-200"><span className="text-xl"></span><span className="font-medium">Selected date is closed. You can re-open it to record cash.</span></div></div>
 )}
 
 <form onSubmit={onOpen} className="grid grid-cols-1 sm:grid-cols-3 gap-4"><div><DatePicker label="Date" value={date} onChange={v => { if (v) setDate(v) }} allowClear={false} /></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Opening Cash Amount</label><div className="relative"><span className="absolute left-3 top-2 text-gray-500 dark:text-gray-400 font-medium">PKR</span><input type="number" min="0" value={openingCash} onChange={e => setOpeningCash(e.target.value)} placeholder="0" className="w-full pl-12 pr-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" /></div></div><div className="flex items-end"><button type="submit" className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]">
 {isSelectedDateClosed ? ' Re-open & Record' : ' Record Opening'}
 </button></div></form></div><div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"><div className="flex flex-wrap items-center gap-3 mb-4"><h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Day Opening History</h2><div className="sm:ml-auto flex gap-3"><button onClick={openPrintPreview} className="ui-btn ui-btn-print">Print</button><button onClick={exportCSV} className="ui-btn ui-btn-csv">CSV</button><button onClick={exportPDF} className="ui-btn ui-btn-pdf">PDF</button></div></div><div className="flex flex-wrap items-center gap-4 mb-4"><div className="flex-shrink-0"><DatePicker label="From" value={from} onChange={v => setFrom(v)} /></div><div className="flex-shrink-0"><DatePicker label="To" value={to} onChange={v => setTo(v)} /></div><div className="flex-1 min-w-0 basis-full sm:basis-auto"><label className="text-xs font-semibold text-[var(--color-text-muted)] tracking-wide">Search</label><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Date, amount, user..." className="mt-1 w-full px-3 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all" /></div></div><div className="overflow-x-auto border-2 border-gray-200 dark:border-gray-700 rounded-xl"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"><tr><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Date</th><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Opening Cash</th><th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">User</th><th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-gray-300">Actions</th></tr></thead><tbody>
 {rows.map(r => (
 <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-medium">{r.date}</td><td className="px-4 py-3"><span className="font-semibold text-emerald-600 dark:text-emerald-400">PKR {Number(r.openingCash).toLocaleString()}</span></td><td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.userName || '-'}</td><td className="px-4 py-3 text-center"><button onClick={() => onDelete(r)} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium text-sm border border-red-200 dark:border-red-700">Delete</button></td></tr>
 ))}
 {rows.length === 0 && (
 <tr><td className="px-4 py-8 text-center text-gray-500 dark:text-gray-400" colSpan={4}><div className="text-4xl mb-2"></div><div>No records yet.</div></td></tr>
 )}
 </tbody><tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold"><tr className="border-t"><td className="px-4 py-3 text-gray-700 dark:text-gray-300">Total Opening Cash</td><td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">PKR {totalOpening.toLocaleString()}</td><td className="px-4 py-3"></td><td className="px-4 py-3"></td></tr></tfoot></table></div>

 {total > 0 && (
 <Pagination page={page} pages={pageCount} total={total} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} loading={loading} />
 )}
 </div>
 <DeleteKeyModal
 open={deleteOpen}
 title="Delete Day Opening"
 description={<>Delete opening cash record for <span className="font-medium">{deleteTarget?.date || '-'}</span> (PKR {Number(deleteTarget?.openingCash || 0).toLocaleString()})?</>}
 busy={deleteBusy}
 error={deleteErr}
 onSubmit={submitDelete}
 onClose={() => setDeleteOpen(false)}
 />
 <DeleteKeyModal
 open={reopenOpen}
 title="Re-open Day"
 description={<>Date <span className="font-medium">{date}</span> is closed. Re-opening it will delete the day close record.</>}
 busy={reopenBusy}
 error={reopenErr}
 onSubmit={submitReopen}
 onClose={() => setReopenOpen(false)}
 />
 </div>
 )
}
