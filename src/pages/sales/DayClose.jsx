import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'
import { toast } from 'react-hot-toast'
import DeleteKeyModal from '../../components/DeleteKeyModal.jsx'
import SlipDialog from '../../components/SlipDialog.jsx'

export default function DayClose() {
 const { state, dispatch, businessDate } = useData()
 const { user, token } = useAuth()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 
 // Use businessDate from context as the primary date reference
 const realToday = format(new Date(), 'yyyy-MM-dd')
 const effectiveBusinessDate = businessDate || realToday
 const closedSet = new Set((state.dayCloses||[]).map(d=>d.date))
 
 // Derive suggested date based on businessDate from context
 const suggestedDate = useMemo(() => {
 if (state?.daybook?.open && (state?.daybook?.date || '')) {
 return state.daybook.date
 }
 // If there is a recent Day Close, advance business date to the next day (but not beyond today)
 const closedDatesSorted = Array.from(closedSet).filter(Boolean).sort()
 if (closedDatesSorted.length) {
 const lastClosed = closedDatesSorted[closedDatesSorted.length - 1]
 try {
 const nextDay = format(addDays(new Date(lastClosed), 1), 'yyyy-MM-dd')
 return nextDay <= realToday ? nextDay : realToday
 } catch { return realToday }
 }
 return effectiveBusinessDate
 }, [state?.daybook?.open, state?.daybook?.date, closedSet, realToday, effectiveBusinessDate])

 const [date, setDate] = useState(suggestedDate)
 const [countedCash, setCountedCash] = useState('')
 const [note, setNote] = useState('')

 // lock if date closed
 const closedDates = useMemo(() => new Set((state.dayCloses||[]).map(d => d.date)), [state.dayCloses])
 const isSelectedDateClosed = closedDates.has(date)

 // derive numbers
 const openingCash = useMemo(() => {
 // prefer cashOpenings entry of the selected date, fallback to daybook if same date
 const entry = (state.cashOpenings||[]).find(e => e.date === date)
 if (entry) return Number(entry.openingCash || 0)
 if (state.daybook?.date === date) return Number(state.daybook?.openingCash || 0)
 return 0
 }, [state.cashOpenings, state.daybook, date])

 const salesForDate = useMemo(() => (state.sales||[]).filter(s => s.date === date), [state.sales, date])
 // Use final charged totals; do not subtract discounts again because sale.total is already net
 const cashSales = useMemo(() => salesForDate.filter(s => (s.paymentMethod||'cash') === 'cash').reduce((a,b)=>a+Number(b.total||0),0), [salesForDate])
 const cardSales = useMemo(() => salesForDate.filter(s => s.paymentMethod === 'online' || s.paymentMethod === 'card').reduce((a,b)=>a+Number(b.total||0),0), [salesForDate])

 const complimentarySales = useMemo(() => salesForDate.filter(s => s.paymentMethod === 'complimentary').reduce((a,b)=>a+Number(b.total||0),0), [salesForDate])
 const returns = useMemo(() => (state.returns||[]).filter(r => r.date === date).reduce((a,b)=>a+Number(b.refund||0),0), [state.returns, date])

 const handovers = useMemo(() => (state.cashHandovers||[]).filter(h => h.date === date).reduce((a,b)=>a+Number(b.amount||0),0), [state.cashHandovers, date])
 const payIns = useMemo(() => (state.payInOuts||[]).filter(p => p.date === date && p.type === 'IN').reduce((a,b)=>a+Number(b.amount||0),0), [state.payInOuts, date])
 const payOuts = useMemo(() => (state.payInOuts||[]).filter(p => p.date === date && p.type === 'OUT').reduce((a,b)=>a+Number(b.amount||0),0), [state.payInOuts, date])

 const expectedCash = useMemo(() => openingCash + cashSales - returns - handovers + payIns - payOuts, [openingCash, cashSales, returns, handovers, payIns, payOuts])
 const variance = useMemo(() => Number(countedCash||0) - expectedCash, [countedCash, expectedCash])

 const onCloseDay = async (e) => {
 e.preventDefault()
 if (isSelectedDateClosed) { toast.error('This date is already closed.'); return }
 const counted = Number(countedCash)
 if (Number.isNaN(counted) || counted < 0) { toast.error('Enter a valid counted cash value'); return }

 // Persist to backend
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const headers = {
 'Content-Type': 'application/json',
 ...(token ? { Authorization: `Bearer ${token}` } : {}),
 }
 const body = {
 date,
 openingCash,
 cashSales,
 cardSales,
 onlineSales: cardSales,
 complimentarySales,
 returns,
 handovers,
 payIns,
 payOuts,
 expectedCash,
 countedCash: counted,
 variance,
 note,
 userName: user?.name || '',
 }
 try {
 const res = await fetch(`${API}/api/day-closes`, { method: 'POST', headers, body: JSON.stringify(body) })
 if (res.status === 409) { toast.error('This date is already closed on server.'); return }
 if (!res.ok) {
 const err = await res.json().catch(() => ({}))
 throw new Error(err?.error || `Failed to close day (${res.status})`)
 }
 const saved = await res.json()
 const rec = { ...saved, id: saved.id || saved._id, userName: saved.userName || user?.name || '' }
 // Add a day close record for history
 dispatch({ type: 'ADD_DAY_CLOSE', payload: rec })
 // Mark day closed for that date
 dispatch({ type: 'DAY_CLOSE', payload: { date } })
 // Refresh history table immediately
 setServerRows(prev => [rec, ...prev])
 setTotal(prev => prev + 1)
 // Auto-open print slip
 printSlip(rec)
 toast.success('Day closed and saved! Downloading full backup...')
 // Auto-backup: download full export JSON after successful day close
 try {
 const bRes = await fetch(`${API}/api/backup/export`, { headers })
 if (bRes.ok) {
 const blob = await bRes.blob()
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = `rms-backup-${date}.json`
 document.body.appendChild(a)
 a.click()
 a.remove()
 URL.revokeObjectURL(url)
 } else {
 // Non-blocking message if backup failed
 const t = await bRes.text().catch(()=>`${bRes.status}`)
 console.warn('Backup export failed:', t)
 toast.error('Day closed. Backup export failed; please export manually from Backup.')
 }
 } catch (err) {
 console.warn('Backup export error:', err)
 toast.error('Day closed. Backup export error; please export manually from Backup.')
 }
 setCountedCash('')
 setNote('')
 } catch (err) {
 toast.error(String(err.message || err))
 }
 }

 // History view
 // History filters: default to last 7 days
 const iso = (d) => format(d, 'yyyy-MM-dd')
 const addDays = (d, n) => new Date(d.getTime() + n*24*60*60*1000)
 const [from, setFrom] = useState(() => iso(addDays(new Date(effectiveBusinessDate), -7)))
 const [to, setTo] = useState(effectiveBusinessDate)
 const [search, setSearch] = useState('')
 const [serverRows, setServerRows] = useState([])
 const [loading, setLoading] = useState(false)
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
 const [total, setTotal] = useState(0)
 const [jump, setJump] = useState(1)
 const [slipHtml, setSlipHtml] = useState(null)

 // Secret-key modal state (shared pattern with sale deletion)
 const [deleteOpen, setDeleteOpen] = useState(false)
 const [deleteTarget, setDeleteTarget] = useState(null)
 const [deleteBusy, setDeleteBusy] = useState(false)
 const [deleteErr, setDeleteErr] = useState('')

 useEffect(() => { setPage(1) }, [from, to])

 // Fetch from server whenever date range changes or on mount
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
 const url = `${API}/api/day-closes${params.toString() ? `?${params.toString()}` : ''}`
 const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' })
 if (!res.ok) throw new Error(`Failed to load day closes (${res.status})`)
 const data = await res.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 if (Array.isArray(data)) {
 if (!cancelled) {
 setServerRows((data||[]).map(mapId))
 setTotal((data||[]).length)
 }
 } else {
 const rows = Array.isArray(data?.rows) ? data.rows : []
 const tot = Number(data?.total || rows.length || 0)
 if (!cancelled) {
 setServerRows(rows.map(mapId))
 setTotal(tot)
 }
 }
 } catch (e) {
 if (!cancelled) { setServerRows([]); setTotal(0) }
 } finally {
 if (!cancelled) setLoading(false)
 }
 })()
 return () => { cancelled = true }
 }, [API, token, from, to, page, limit, search])

 const rows = useMemo(() => {
 return [...serverRows]
 }, [serverRows])
 const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)))

 // Quick range helpers
 const setRange = (key) => {
 const now = new Date(effectiveBusinessDate)
 if (key === 'today') {
 setFrom(iso(now)); setTo(iso(now))
 } else if (key === 'yesterday') {
 const y = addDays(now, -1); setFrom(iso(y)); setTo(iso(y))
 } else if (key === '7') {
 setFrom(iso(addDays(now, -7))); setTo(iso(now))
 } else if (key === 'month') {
 const first = new Date(now.getFullYear(), now.getMonth(), 1)
 setFrom(iso(first)); setTo(iso(now))
 }
 }

 const onDelete = (row) => {
 setDeleteTarget(row)
 setDeleteErr('')
 setDeleteOpen(true)
 }

 const submitDelete = async (key) => {
 if (!deleteTarget) return
 const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Delete-Key': key }
 try {
 setDeleteBusy(true)
 setDeleteErr('')
 const res = await fetch(`${API}/api/day-closes/${deleteTarget.id}`, { method: 'DELETE', headers })
 if (!res.ok) {
 const j = await res.json().catch(() => ({}))
 setDeleteErr(j?.error || `Failed to delete (${res.status})`)
 setDeleteBusy(false)
 return
 }
 // Remove from history table
 setServerRows(prev => prev.filter(x => x.id !== deleteTarget.id))
 setTotal(prev => Math.max(0, prev - 1))
 setDeleteBusy(false)
 setDeleteOpen(false)
 setDeleteTarget(null)
 // Refresh closed dates so the day unlocks
 try {
 const listRes = await fetch(`${API}/api/day-closes`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' })
 if (listRes.ok) {
 const list = await listRes.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 const arr = Array.isArray(list) ? list : (Array.isArray(list?.rows) ? list.rows : [])
 dispatch({ type: 'HYDRATE', payload: { dayCloses: arr.map(mapId) } })
 }
 } catch {}
 toast.success('Day close deleted')
 } catch {
 setDeleteErr('Network error')
 setDeleteBusy(false)
 }
 }

 const exportCSV = () => {
 const header = ['Date','Opening','CashSales','OnlineSales','Returns','Handovers','PayIns','PayOuts','Expected','Counted','Variance','Note','User','ID']
 const lines = [header.join(',')]
 rows.forEach(r => {
 lines.push([
 r.date, r.openingCash, r.cashSales, r.onlineSales || r.cardSales, r.returns||0, r.handovers, r.payIns, r.payOuts, r.expectedCash, r.countedCash, r.variance, JSON.stringify(r.note||''), r.userName||'', r.id
 ].join(','))
 })
 const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url; a.download = 'day_close.csv'; a.click()
 URL.revokeObjectURL(url)
 }

 const exportPDF = () => {
 try {
 const doc = new jsPDF()
 doc.text('Day Close History', 14, 16)
 autoTable(doc, {
 startY: 20,
 head: [[ 'Date','Opening','Cash','Online','Returns','Handover','Pay In','Pay Out','Expected','Counted','Variance','User','ID' ]],
 body: rows.map(r => [
 r.date,
 `PKR ${Number(r.openingCash).toLocaleString()}`,
 `PKR ${Number(r.cashSales).toLocaleString()}`,
 `PKR ${Number(r.cardSales).toLocaleString()}`,
 `PKR ${Number(r.returns||0).toLocaleString()}`,
 `PKR ${Number(r.handovers).toLocaleString()}`,
 `PKR ${Number(r.payIns).toLocaleString()}`,
 `PKR ${Number(r.payOuts).toLocaleString()}`,
 `PKR ${Number(r.expectedCash).toLocaleString()}`,
 `PKR ${Number(r.countedCash).toLocaleString()}`,
 `PKR ${Number(r.variance).toLocaleString()}`,
 r.userName||'-',
 r.id.slice(0,8)+'...'
 ])
 })
 doc.save('day_close.pdf')
 toast.success('PDF exported successfully')
 } catch (err) {
 console.error('PDF export error:', err)
 toast.error('Failed to export PDF: ' + (err?.message || 'unknown error'))
 }
 }

 const printSlip = (r) => {
 const dt = new Date()
 const nowDate = format(dt, 'd-M-yyyy')
 const nowTime = format(dt, 'h:mm a')
 const settings = state.settings || {}
 const companyName = settings.companyName || 'Restaurant POS'
 const phone = settings.phone || ''
 const address = settings.address || ''
 const logo = settings.logo || ''
 const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
 const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })

 const html = `<!doctype html><html><head><meta charset="utf-8"><title>Day Close Slip</title><style>
 body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial; padding:12px; max-width:320px; margin:0 auto;}
 .center{text-align:center}
 .bold{font-weight:700}
 table{width:100%; border-collapse:collapse}
 td{font-size:12px; padding:4px 0}
 .line{border-top:1px dashed #333; margin:8px 0}
 .kv{display:flex; justify-content:space-between; align-items:flex-start}
 .kv span:first-child{flex-shrink:0; margin-right:8px}
 .kv span:last-child{white-space:nowrap; text-align:right}
 .variance{font-weight:700; color:#059669}
 .variance.negative{color:#dc2626}
 </style></head><body>
 ${logo ? `<div class="center"><img src="${escapeHtml(logo)}" style="max-height:60px;max-width:100%;display:block;margin:0 auto 4px" /></div>` : ''}
 <div class="center bold" style="font-size:16px">${escapeHtml(companyName)}</div>
 ${phone ? `<div class="center">${escapeHtml(phone)}</div>` : ''}
 ${address ? `<div class="center">${escapeHtml(address)}</div>` : ''}
 <div class="line"></div><div class="center bold">Day Close Report</div><div class="kv"><span>Entry Date:</span><span>${r.createdAt ? format(new Date(r.createdAt), 'd-M-yyyy') : escapeHtml(r.date || '')}</span></div><div class="kv"><span>Entry Time:</span><span>${r.createdAt ? format(new Date(r.createdAt), 'h:mm a') : '-'}</span></div><div class="kv"><span>Printed Date:</span><span>${nowDate}</span></div><div class="kv"><span>Printed Time:</span><span>${nowTime}</span></div><div class="kv"><span>Closed By:</span><span>${escapeHtml(r.userName || '-')}</span></div><div class="line"></div><div class="kv"><span>Opening Cash</span><span>PKR ${fmt(r.openingCash)}</span></div><div class="kv"><span>Cash Sales</span><span>PKR ${fmt(r.cashSales)}</span></div><div class="kv"><span>Online Sales</span><span>PKR ${fmt(r.onlineSales || r.cardSales)}</span></div><div class="kv"><span>Personal Sales</span><span>PKR ${fmt(r.complimentarySales || 0)}</span></div><div class="kv"><span>Returns</span><span>PKR ${fmt(r.returns || 0)}</span></div><div class="kv"><span>Cash Handovers</span><span>PKR ${fmt(r.handovers)}</span></div><div class="kv"><span>Pay In</span><span>PKR ${fmt(r.payIns)}</span></div><div class="kv"><span>Pay Out</span><span>PKR ${fmt(r.payOuts)}</span></div><div class="line"></div><div class="kv"><span><b>Expected Cash</b></span><span><b>PKR ${fmt(r.expectedCash)}</b></span></div><div class="kv"><span>Counted Cash</span><span>PKR ${fmt(r.countedCash)}</span></div><div class="kv"><span class="${Number(r.variance) < 0 ? 'negative' : ''}"><b>Variance</b></span><span class="${Number(r.variance) < 0 ? 'negative' : ''}"><b>PKR ${fmt(r.variance)}</b></span></div><div class="kv"><span>Note</span><span>${escapeHtml(r.note || '-')}</span></div><div class="line"></div><div class="center" style="font-size:11px; color:#666">--- END OF DAY CLOSE ---</div></body></html>`
 setSlipHtml(html)
 }

 return (
 <div className="space-y-4"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2"><span className="text-3xl"></span> Day Close
 </h1></div><div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4"><h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Close Day</h2>
 {isSelectedDateClosed && (
 <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"> Already Closed</span>
 )}
 </div>

 {isSelectedDateClosed && (
 <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"><div className="flex items-center gap-2 text-amber-800 dark:text-amber-200"><span className="text-xl"></span><span className="font-medium">Selected date is already closed. Closing again is disabled.</span></div></div>
 )}

 <form onSubmit={onCloseDay} className="grid grid-cols-1 lg:grid-cols-4 gap-4"><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500" /></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Opening Cash</label><div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 font-medium text-emerald-600 dark:text-emerald-400">
 PKR {openingCash.toLocaleString()}
 </div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cash Sales (net)</label><div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 font-medium text-emerald-600 dark:text-emerald-400">
 PKR {cashSales.toLocaleString()}
 </div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Online Sales (net)</label><div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-700 font-medium text-blue-600 dark:text-blue-400">
 PKR {cardSales.toLocaleString()}
 </div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Personal (net)</label><div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 font-medium text-rose-600 dark:text-rose-400">
 PKR {complimentarySales.toLocaleString()}
 </div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Returns</label><div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 font-medium text-orange-600 dark:text-orange-400">
 PKR {returns.toLocaleString()}
 </div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cash Handovers</label><div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-700 font-medium text-rose-600 dark:text-rose-400">
 PKR {handovers.toLocaleString()}
 </div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pay In / Pay Out</label><div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-700 text-sm"><span className="text-emerald-600 dark:text-emerald-400 font-medium">IN: PKR {payIns.toLocaleString()}</span><span className="mx-2 text-gray-400">|</span><span className="text-rose-600 dark:text-rose-400 font-medium">OUT: PKR {payOuts.toLocaleString()}</span></div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expected Cash</label><div className="px-3 py-2 border-2 border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-900/20 font-bold text-blue-700 dark:text-blue-300">
 PKR {expectedCash.toLocaleString()}
 </div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Counted Cash</label><div className="relative"><span className="absolute left-3 top-2 text-gray-500 dark:text-gray-400 font-medium">PKR</span><input type="number" min="0" value={countedCash} onChange={e=>setCountedCash(e.target.value)} className="w-full pl-12 pr-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500" placeholder="Enter counted amount" /></div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Variance</label><div className={`px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-700 font-bold ${variance !== 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
 {variance > 0 ? '+' : ''}PKR {variance.toLocaleString()}
 {variance !== 0 && <span className="ml-2 text-xs font-normal">({variance > 0 ? 'Over' : 'Short'})</span>}
 </div></div><div className="lg:col-span-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note</label><input value={note} onChange={e=>setNote(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500" placeholder="Optional note about day close..." /></div><div className="lg:col-span-4"><button disabled={isSelectedDateClosed} className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-gray-900 to-gray-800 text-white font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed dark:from-white dark:to-gray-200 dark:text-gray-900">
 {isSelectedDateClosed ? ' Day Already Closed' : ' Close Day & Generate Backup'}
 </button></div></form></div><div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"><div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4"><h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Day Close History</h2><div className="flex flex-wrap items-center gap-4 mb-4"><div className="flex-shrink-0"><DatePicker label="From" value={from} onChange={v=>setFrom(v)} /></div><div className="flex-shrink-0"><DatePicker label="To" value={to} onChange={v=>setTo(v)} /></div><div className="flex-1 min-w-0 basis-full sm:basis-auto"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Search</label><input placeholder="Date, note, user..." value={search} onChange={e=>{ setSearch(e.target.value); setPage(1) }} className="mt-1 w-full px-3 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all" /></div><div className="flex gap-3 flex-shrink-0"><button onClick={exportCSV} className="px-4 py-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">CSV</button><button onClick={exportPDF} className="px-4 py-2 rounded-lg bg-gradient-to-br from-red-500 to-red-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">PDF</button></div>
 {loading && <div className="text-xs text-gray-500"> Loading...</div>}
 </div></div><div className="overflow-x-auto border-2 border-gray-200 dark:border-gray-700 rounded-xl"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"><tr><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Date</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Opening</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Cash</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Online</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Personal</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Returns</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Handover</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Pay In</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Pay Out</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Expected</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Counted</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Variance</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Note</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">User</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Print</th></tr></thead><tbody>
 {rows.map(r => (
 <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="px-3 py-3 text-gray-700 dark:text-gray-300 font-medium">{r.date}</td><td className="px-3 py-3 text-emerald-600 dark:text-emerald-400">PKR {Number(r.openingCash).toLocaleString()}</td><td className="px-3 py-3 text-emerald-600 dark:text-emerald-400">PKR {Number(r.cashSales).toLocaleString()}</td><td className="px-3 py-3 text-blue-600 dark:text-blue-400">PKR {Number(r.onlineSales || r.cardSales).toLocaleString()}</td><td className="px-3 py-3 text-rose-600 dark:text-rose-400">PKR {Number(r.complimentarySales||0).toLocaleString()}</td><td className="px-3 py-3 text-orange-600 dark:text-orange-400">PKR {Number(r.returns||0).toLocaleString()}</td><td className="px-3 py-3 text-rose-600 dark:text-rose-400">PKR {Number(r.handovers).toLocaleString()}</td><td className="px-3 py-3 text-emerald-600 dark:text-emerald-400">PKR {Number(r.payIns).toLocaleString()}</td><td className="px-3 py-3 text-rose-600 dark:text-rose-400">PKR {Number(r.payOuts).toLocaleString()}</td><td className="px-3 py-3 font-semibold text-blue-700 dark:text-blue-300">PKR {Number(r.expectedCash).toLocaleString()}</td><td className="px-3 py-3 text-gray-700 dark:text-gray-300">PKR {Number(r.countedCash).toLocaleString()}</td><td className={`px-3 py-3 font-semibold ${Number(r.variance)!==0?'text-red-600 dark:text-red-400':'text-emerald-600 dark:text-emerald-400'}`}>
 {Number(r.variance) > 0 ? '+' : ''}PKR {Number(r.variance).toLocaleString()}
 </td><td className="px-3 py-3 text-gray-600 dark:text-gray-400 text-sm max-w-xs truncate" title={r.note}>{r.note || '-'}</td><td className="px-3 py-3 text-gray-600 dark:text-gray-400">{r.userName || '-'}</td><td className="px-3 py-3"><div className="flex items-center gap-2"><button
 className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors font-medium text-sm border border-blue-200 dark:border-blue-700"
 onClick={() => printSlip(r)}
 > Print</button><button
 className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium text-sm border border-red-200 dark:border-red-700"
 onClick={() => onDelete(r)}
 >Delete</button></div></td></tr>
 ))}
 {rows.length === 0 && (
 <tr><td className="px-3 py-8 text-center text-gray-500 dark:text-gray-400" colSpan={15}><div className="text-4xl mb-2"></div><div>No data.</div></td></tr>
 )}
 </tbody></table></div>

 {total > 0 && (
 <Pagination page={page} pages={totalPages} total={total} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} loading={loading} />
 )}
 </div>
 {slipHtml && <SlipDialog html={slipHtml} title="Day Close Slip" onClose={() => setSlipHtml(null)} />}
 <DeleteKeyModal
 open={deleteOpen}
 title="Delete Day Close"
 description={<>Delete the day close record for <span className="font-medium">{deleteTarget?.date || '-'}</span>? This will re-open that day.</>}
 busy={deleteBusy}
 error={deleteErr}
 onSubmit={submitDelete}
 onClose={() => setDeleteOpen(false)}
 />
 </div>
 )
}
