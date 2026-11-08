import { useCallback, useEffect, useMemo, useState } from 'react'
import { exportDateStamp } from '../../utils/listReportExport.js'
import { Link } from 'react-router-dom'
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
import SlipDialog from '../../components/SlipDialog.jsx'
import { useConfirm } from '../../components/useConfirm.jsx'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'

export default function DayClose() {
 const { state, dispatch, businessDate } = useData()
 const { user, token } = useAuth()
 const { confirm, ConfirmDialog } = useConfirm()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const addDays = (d, n) => new Date(d.getTime() + n * 24 * 60 * 60 * 1000)
 
 // Use businessDate from context as the primary date reference
 const realToday = format(new Date(), 'yyyy-MM-dd')
 const effectiveBusinessDate = businessDate || realToday
 const closedSet = useMemo(() => new Set((state.dayCloses||[]).map(d=>d.date)), [state.dayCloses])
 
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
 const nextDay = format(addDays(new Date(`${lastClosed}T00:00:00`), 1), 'yyyy-MM-dd')
 return nextDay <= realToday ? nextDay : realToday
 } catch { return realToday }
 }
 return effectiveBusinessDate
 }, [state?.daybook?.open, state?.daybook?.date, closedSet, realToday, effectiveBusinessDate])

 const [date, setDate] = useState(suggestedDate)
 const [countedCash, setCountedCash] = useState('')
 const [note, setNote] = useState('')
 const [handoverAmt, setHandoverAmt] = useState('')
 const [handoverTo, setHandoverTo] = useState('')
 const [leftAtCounter, setLeftAtCounter] = useState('')

 // lock if date closed
 const closedDates = useMemo(() => new Set((state.dayCloses||[]).map(d => d.date)), [state.dayCloses])
 const isSelectedDateClosed = closedDates.has(date)

 // derive numbers
 const openingCash = useMemo(() => {
 // prefer cashOpenings entry of the selected date, fallback to daybook if same date
 const entry = (state.cashOpenings||[]).find(e => e.date === date)
 if (entry) return Number(entry.openingCash || 0)
 if (state.daybook?.date === date) return Number(state.daybook?.openingCash || 0)
 // Fallback: previous day close's cash left at counter
 const prev = (state.dayCloses||[]).filter(d => d.date < date).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0]
 if (prev) return Number(prev.leftAtCounter || 0)
 return 0
 }, [state.cashOpenings, state.daybook, state.dayCloses, date])

 const salesForDate = useMemo(() => (state.sales||[]).filter(s => s.date === date), [state.sales, date])
 // Use final charged totals; do not subtract discounts again because sale.total is already net
 const cashSales = useMemo(() => salesForDate.filter(s => (s.paymentMethod||'cash') === 'cash').reduce((a,b)=>a+Number(b.total||0),0), [salesForDate])
 const bankSales = useMemo(() => salesForDate.filter(s => s.paymentMethod === 'bank' || s.paymentMethod === 'online').reduce((a,b)=>a+Number(b.total||0),0), [salesForDate])
 const cardSales = useMemo(() => salesForDate.filter(s => s.paymentMethod === 'card').reduce((a,b)=>a+Number(b.total||0),0), [salesForDate])

 const complimentarySales = useMemo(() => salesForDate.filter(s => s.paymentMethod === 'complimentary').reduce((a,b)=>a+Number(b.total||0),0), [salesForDate])
 const staffSales = useMemo(() => salesForDate.filter(s => s.paymentMethod === 'staff').reduce((a,b)=>a+Number(b.total||0),0), [salesForDate])
 const returns = useMemo(() => (state.returns||[]).filter(r => r.date === date).reduce((a,b)=>a+Number(b.refund||0),0), [state.returns, date])

 const payIns = useMemo(() => (state.payInOuts||[]).filter(p => p.date === date && p.type === 'IN').reduce((a,b)=>a+Number(b.amount||0),0), [state.payInOuts, date])
 const payOuts = useMemo(() => (state.payInOuts||[]).filter(p => p.date === date && p.type === 'OUT').reduce((a,b)=>a+Number(b.amount||0),0), [state.payInOuts, date])
 // Cash expenses reduce drawer expected cash
 const expenses = useMemo(() => (state.expenses || [])
  .filter(e => String(e.date) === String(date))
  .filter(e => {
   const account = String(e.accountHead || 'cash').toLowerCase()
   const method = String(e.paymentMethod || 'cash').toLowerCase()
   return account === 'cash' || method === 'cash'
  })
  .reduce((a, b) => a + Number(b.amount || 0), 0), [state.expenses, date])

 const recallDateOf = (r) => {
  if (r?.date) return String(r.date).slice(0, 10)
  const raw = r?.createdAt
  if (!raw) return ''
  try {
   const d = raw instanceof Date ? raw : new Date(typeof raw === 'number' ? raw : String(raw))
   if (Number.isNaN(d.getTime())) return ''
   return format(d, 'yyyy-MM-dd')
  } catch { return '' }
 }
 // Live recalls for the selected date (prefer API so Day Close isn't blocked by stale state)
 const [liveRecalls, setLiveRecalls] = useState([])
 const loadRecalls = useCallback(async () => {
  if (!token || !date) { setLiveRecalls([]); return }
  try {
   const res = await fetch(`${API}/api/recalls`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
   })
   if (!res.ok) return
   const rows = await res.json()
   setLiveRecalls(Array.isArray(rows) ? rows : [])
  } catch {
   setLiveRecalls(Array.isArray(state.recalls) ? state.recalls : [])
  }
 }, [token, date, API, state.recalls])
 useEffect(() => { loadRecalls() }, [loadRecalls])
 useLiveRefresh(loadRecalls, { intervalMs: 8000 })

 const pendingRecalls = useMemo(() => {
  // Any unpaid recall blocks day close — including older dates left open
  const recalls = liveRecalls.length ? liveRecalls : (Array.isArray(state.recalls) ? state.recalls : [])
  return Array.isArray(recalls) ? recalls : []
 }, [liveRecalls, state.recalls])
 const hasOpenRecalls = pendingRecalls.length > 0

 // Handover amount is entered manually at close time
 const handoverNum = Math.max(0, Number(handoverAmt || 0))
 // Left at counter defaults to counted minus handover; stays editable
 useEffect(() => { setLeftAtCounter(Math.max(0, Number(countedCash || 0) - Math.max(0, Number(handoverAmt || 0)))) }, [countedCash, handoverAmt])

 // Expected = what should be in the drawer; handover happens AFTER counting,
 // so it only reduces Left at Counter — not expected cash or variance.
 const expectedCash = useMemo(
  () => openingCash + cashSales - returns + payIns - payOuts - staffSales - expenses,
  [openingCash, cashSales, staffSales, returns, payIns, payOuts, expenses]
 )
 const variance = useMemo(() => Number(countedCash||0) - expectedCash, [countedCash, expectedCash])

 const onCloseDay = async (e) => {
 e.preventDefault()
 if (isSelectedDateClosed) { toast.error('This date is already closed.'); return }

 // Fresh server-side recall check right before confirm (don't trust stale UI alone)
 try {
  const checkRes = await fetch(`${API}/api/recalls`, {
   headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
   cache: 'no-store',
  })
  if (checkRes.ok) {
   const rows = await checkRes.json()
   const list = Array.isArray(rows) ? rows : []
   setLiveRecalls(list)
   if (list.length > 0) {
    toast.error(`Clear ${list.length} open recall${list.length === 1 ? '' : 's'} before day close (including older unpaid orders).`)
    return
   }
  } else if (hasOpenRecalls) {
   toast.error(`Clear ${pendingRecalls.length} open recall${pendingRecalls.length === 1 ? '' : 's'} before day close.`)
   return
  }
 } catch {
  if (hasOpenRecalls) {
   toast.error(`Clear ${pendingRecalls.length} open recall${pendingRecalls.length === 1 ? '' : 's'} before day close.`)
   return
  }
 }

 const counted = Number(countedCash)
 if (Number.isNaN(counted) || counted < 0) { toast.error('Enter a valid counted cash value'); return }

 const ok = await confirm({
 title: 'Close Day?',
 message: `Close the business day for ${date}? Left at counter (PKR ${Number(leftAtCounter || 0).toLocaleString()}) will become next day's opening cash.`,
 confirmText: 'Close Day',
 cancelText: 'Cancel',
 confirmStyle: 'danger',
 })
 if (!ok) return

 // Persist to backend
 const headers = {
 'Content-Type': 'application/json',
 ...(token ? { Authorization: `Bearer ${token}` } : {}),
 }
 const body = {
 date,
 openingCash,
 cashSales,
 cardSales,
 onlineSales: bankSales,
 complimentarySales,
 staffSales,
 returns,
 handovers: handoverNum,
 handoverTo,
 leftAtCounter: Number(leftAtCounter || 0),
 payIns,
 payOuts,
 expenses,
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
 if (err?.code === 'OPEN_RECALLS' || /recall/i.test(String(err?.error || ''))) {
  toast.error(err.error || 'Clear open recalls before day close.')
  return
 }
 throw new Error(err?.error || `Failed to close day (${res.status})`)
 }
 const saved = await res.json()
 const { nextOpening, ...rest } = saved || {}
 const rec = { ...rest, id: rest.id || rest._id, userName: rest.userName || user?.name || '' }
 // Add a day close record for history
 dispatch({ type: 'ADD_DAY_CLOSE', payload: rec })
 // Mark day closed for that date
 dispatch({ type: 'DAY_CLOSE', payload: { date } })
 if (nextOpening?.date) {
  dispatch({ type: 'UPSERT_CASH_OPENING', payload: nextOpening })
  toast.success(`Day closed. Next opening ${nextOpening.date}: PKR ${Number(nextOpening.openingCash || 0).toLocaleString()}`)
 } else {
  toast.success('Day closed successfully')
 }
 // Refresh history table immediately
 setServerRows(prev => [rec, ...prev])
 setTotal(prev => prev + 1)
 // Auto-open print slip
 printSlip(rec)
 setCountedCash('')
 setNote('')
 setHandoverTo('')
 setLeftAtCounter('')
 } catch (err) {
 toast.error(String(err.message || err))
 }
 }

 // History view
 // History filters: default to last 7 days
 const iso = (d) => format(d, 'yyyy-MM-dd')
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

 const loadDayCloses = useCallback(async ({ quiet = false } = {}) => {
 try {
 if (!quiet) setLoading(true)
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
 setServerRows((data || []).map(mapId))
 setTotal((data || []).length)
 } else {
 const rows = Array.isArray(data?.rows) ? data.rows : []
 setServerRows(rows.map(mapId))
 setTotal(Number(data?.total || rows.length || 0))
 }
 } catch {
 if (!quiet) { setServerRows([]); setTotal(0) }
 } finally {
 if (!quiet) setLoading(false)
 }
 }, [API, token, from, to, page, limit, search])

 useEffect(() => { loadDayCloses() }, [loadDayCloses])
 useLiveRefresh(() => loadDayCloses({ quiet: true }), { intervalMs: 8000 })

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

 const openPrintPreview = async () => {
 try {
 const money = (n) => 'PKR ' + Number(n || 0).toLocaleString()
 const periodFrom = from || '—'
 const periodTo = to || '—'
 const sum = (key) => rows.reduce((a, r) => a + Number(r[key] || 0), 0)
 const body =
 reportSummary([
 { label: 'Total Expected Cash', amount: money(sum('expectedCash')) },
 { label: 'Total Counted Cash', amount: money(sum('countedCash')) },
 { label: 'Total Variance', amount: money(sum('variance')), cls: sum('variance') < 0 ? 'neg' : sum('variance') > 0 ? 'pos' : '' },
 { label: 'Records', amount: String(rows.length) },
 ]) +
 reportSec(`Day Close History (${rows.length})`) +
 reportTable({
 headers: ['Date', { t: 'Opening', align: 'r' }, { t: 'Cash', align: 'r' }, { t: 'Bank', align: 'r' }, { t: 'Card', align: 'r' }, { t: 'Returns', align: 'r' }, { t: 'Handover', align: 'r' }, { t: 'Pay In', align: 'r' }, { t: 'Pay Out', align: 'r' }, { t: 'Expenses', align: 'r' }, { t: 'Expected', align: 'r' }, { t: 'Counted', align: 'r' }, { t: 'Variance', align: 'r' }, 'User', 'Note'],
 numbered: true,
 rows: rows.map(r => [
 r.date,
 { v: money(r.openingCash), align: 'r' },
 { v: money(r.cashSales), align: 'r' },
 { v: money(r.onlineSales ?? 0), align: 'r' },
 { v: money(r.cardSales || 0), align: 'r' },
 { v: money(r.returns || 0), align: 'r' },
 { v: money(r.handovers), align: 'r' },
 { v: money(r.payIns), align: 'r' },
 { v: money(r.payOuts), align: 'r' },
 { v: money(r.expenses || 0), align: 'r' },
 { v: money(r.expectedCash), align: 'r' },
 { v: money(r.countedCash), align: 'r' },
 { v: money(r.variance), align: 'r', cls: Number(r.variance) < 0 ? 'neg' : Number(r.variance) > 0 ? 'pos' : '' },
 r.userName || '-',
 r.note || '-',
 ]),
 })
 const html = wrapReportDoc({
 settings: state?.settings || {},
 title: 'Day Close History',
 reportLabel: 'Day Close Report',
 reportNo: `Rpt #: DC-${format(new Date(), 'yyyyMMdd-HHmm')}`,
 metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Period', `${periodFrom} to ${periodTo}`]],
 metaRight: [['Records', String(rows.length)]],
 body,
 })
 await previewHtmlReport(html, `Day-Close-History-${exportDateStamp()}.pdf`)
 } catch {
 toast.error('Print preview failed')
 }
 }

 const exportCSV = () => {
 const header = ['Date','Opening','CashSales','BankSales','CardSales','Returns','Handovers','PayIns','PayOuts','Expenses','Expected','Counted','Variance','Note','User','ID']
 const lines = [header.join(',')]
 rows.forEach(r => {
 lines.push([
 r.date, r.openingCash, r.cashSales, r.onlineSales ?? 0, r.cardSales||0, r.returns||0, r.handovers, r.payIns, r.payOuts, r.expenses||0, r.expectedCash, r.countedCash, r.variance, JSON.stringify(r.note||''), r.userName||'', r.id
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
 head: [[ 'Date','Opening','Cash','Bank','Card','Returns','Handover','Pay In','Pay Out','Expenses','Expected','Counted','Variance','User','ID' ]],
 body: rows.map(r => [
 r.date,
 `PKR ${Number(r.openingCash).toLocaleString()}`,
 `PKR ${Number(r.cashSales).toLocaleString()}`,
 `PKR ${Number(r.onlineSales ?? 0).toLocaleString()}`,
 `PKR ${Number(r.cardSales||0).toLocaleString()}`,
 `PKR ${Number(r.returns||0).toLocaleString()}`,
 `PKR ${Number(r.handovers).toLocaleString()}`,
 `PKR ${Number(r.payIns).toLocaleString()}`,
 `PKR ${Number(r.payOuts).toLocaleString()}`,
 `PKR ${Number(r.expenses||0).toLocaleString()}`,
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
 const entryStamp = r.createdAt ? format(new Date(r.createdAt), 'd-M-yyyy h:mm a') : escapeHtml(r.date || '')
 const varianceNeg = Number(r.variance) < 0 ? 'neg' : ''
 const handoverLabel = r.handoverTo ? `Handovers → ${escapeHtml(r.handoverTo)}` : 'Handovers'
 const noteRow = r.note ? `<div class="kv"><span>Note</span><span>${escapeHtml(r.note)}</span></div>` : ''

 const html = `<!doctype html><html><head><meta charset="utf-8"><title>Day Close Slip</title><style>
 *{box-sizing:border-box}
 @page{size:80mm auto;margin:0}
 html,body{width:72mm;max-width:72mm;margin:0;padding:0}
 @media print{html,body{width:72mm!important;max-width:72mm!important;padding:2mm 3mm!important;height:auto!important;min-height:0!important}}
 @media screen{html,body{max-width:100%;margin:0 auto;padding:6px 8px}}
 body{font-family:"Segoe UI",system-ui,Arial,sans-serif;font-size:11px;font-weight:500;line-height:1.35;color:#475569}
 .center{text-align:center}.bold{font-weight:700;color:#0f172a}
 .line{border-top:1px dashed #cbd5e1;margin:6px 0}
 .kv{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:2px 0;font-size:10.5px;color:#64748b;font-weight:500}
 .kv span:last-child{white-space:nowrap;text-align:right;color:#0f172a;font-weight:600}
 .meta{font-size:10px;color:#64748b;font-weight:500}.title{font-size:15px;margin:0 0 3px;font-weight:700;color:#0f172a}
 .section{font-size:12px;margin:4px 0;font-weight:700;color:#334155}.neg{color:#b91c1c}.foot{font-size:10px;color:#94a3b8;margin-top:4px;text-align:center}
 </style></head><body>
 ${logo ? `<div class="center"><img src="${escapeHtml(logo)}" style="max-height:48px;max-width:88%;display:block;margin:0 auto 6px" /></div>` : ''}
 <div class="center bold title">${escapeHtml(companyName)}</div>
 ${phone ? `<div class="center meta">${escapeHtml(phone)}</div>` : ''}
 ${address ? `<div class="center meta">${escapeHtml(address)}</div>` : ''}
 <div class="line"></div>
 <div class="center bold section">Day Close Report</div>
 <div class="kv meta"><span>Entry</span><span>${entryStamp}</span></div>
 <div class="kv meta"><span>Printed</span><span>${nowDate} ${nowTime}</span></div>
 <div class="kv meta"><span>Closed By</span><span>${escapeHtml(r.userName || '-')}</span></div>
 <div class="line"></div>
 <div class="kv"><span>Opening Cash</span><span>PKR ${fmt(r.openingCash)}</span></div>
 <div class="kv"><span>Cash Sales</span><span>PKR ${fmt(r.cashSales)}</span></div>
 <div class="kv"><span>Bank Sales</span><span>PKR ${fmt(r.onlineSales ?? 0)}</span></div>
 <div class="kv"><span>Card Sales</span><span>PKR ${fmt(r.cardSales || 0)}</span></div>
 <div class="kv"><span>Staff Sales</span><span>PKR ${fmt(r.staffSales || 0)}</span></div>
 <div class="kv"><span>Returns</span><span>PKR ${fmt(r.returns || 0)}</span></div>
 <div class="kv"><span>${handoverLabel}</span><span>PKR ${fmt(r.handovers)}</span></div>
 <div class="kv"><span>Left at Counter</span><span>PKR ${fmt(r.leftAtCounter || 0)}</span></div>
 <div class="kv"><span>Pay In</span><span>PKR ${fmt(r.payIns)}</span></div>
 <div class="kv"><span>Pay Out</span><span>PKR ${fmt(r.payOuts)}</span></div>
 <div class="kv"><span>Expenses</span><span>PKR ${fmt(r.expenses || 0)}</span></div>
 <div class="line"></div>
 <div class="kv bold"><span>Expected Cash</span><span>PKR ${fmt(r.expectedCash)}</span></div>
 <div class="kv"><span>Counted Cash</span><span>PKR ${fmt(r.countedCash)}</span></div>
 <div class="kv bold ${varianceNeg}"><span>Variance</span><span>PKR ${fmt(r.variance)}</span></div>
 ${noteRow}
 <div class="line"></div>
 <div class="center foot">--- END OF DAY CLASS ---</div>
 </body></html>`
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

 {hasOpenRecalls && !isSelectedDateClosed && (
 <div className="mb-4 p-4 rounded-lg bg-rose-50 border border-rose-200 dark:bg-rose-900/20 dark:border-rose-800">
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-rose-800 dark:text-rose-200">
   <div>
    <div className="font-semibold">Clear recalls before day close</div>
    <div className="text-sm mt-0.5">
     {pendingRecalls.length} open recall{pendingRecalls.length === 1 ? '' : 's'}
     {pendingRecalls.slice(0, 5).map(r => ` #${r.tokenNo || r.orderNo || '—'}(${recallDateOf(r) || '—'})`).join('')}
     {pendingRecalls.length > 5 ? ' …' : ''}. Older unpaid orders also block close — settle or clear them first.
    </div>
   </div>
   <Link
    to="/sales/new"
    className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors"
   >
    Open POS / Recalls
   </Link>
  </div>
 </div>
 )}

 <form onSubmit={onCloseDay} className="grid grid-cols-1 lg:grid-cols-4 gap-4"><div><DatePicker label="Date" value={date} onChange={v=>{ if (v) setDate(v) }} allowClear={false} /></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Opening Cash</label><div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 font-medium text-emerald-600 dark:text-emerald-400">
 PKR {openingCash.toLocaleString()}
 </div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cash Sales (net)</label><div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 font-medium text-emerald-600 dark:text-emerald-400">
 PKR {cashSales.toLocaleString()}
 </div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bank Sales (net)</label><div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 font-medium text-blue-600 dark:text-blue-400">
 PKR {bankSales.toLocaleString()}
 </div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Card Sales (net)</label><div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 font-medium text-indigo-600 dark:text-indigo-400">
 PKR {cardSales.toLocaleString()}
 </div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Staff (net)</label><div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 font-medium text-violet-600 dark:text-violet-400">
 PKR {staffSales.toLocaleString()}
 </div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Returns</label><div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 font-medium text-orange-600 dark:text-orange-400">
 PKR {returns.toLocaleString()}
 </div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pay In / Pay Out</label><div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-700 text-sm"><span className="text-emerald-600 dark:text-emerald-400 font-medium">IN: PKR {payIns.toLocaleString()}</span><span className="mx-2 text-gray-400">|</span><span className="text-rose-600 dark:text-rose-400 font-medium">OUT: PKR {payOuts.toLocaleString()}</span></div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expenses (cash)</label><div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 font-medium text-amber-600 dark:text-amber-400">
 PKR {expenses.toLocaleString()}
 </div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expected Cash</label><div className="px-3 py-2 border-2 border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-900/20 font-bold text-blue-700 dark:text-blue-300">
 PKR {expectedCash.toLocaleString()}
 </div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Counted Cash</label><div className="relative"><span className="absolute left-3 top-2 text-gray-500 dark:text-gray-400 font-medium">PKR</span><input type="number" min="0" value={countedCash} onChange={e=>setCountedCash(e.target.value)} className="w-full pl-12 pr-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500" placeholder="Enter counted amount" /></div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Variance</label><div className={`px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-700 font-bold ${variance !== 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
 {variance > 0 ? '+' : ''}PKR {variance.toLocaleString()}
 {variance !== 0 && <span className="ml-2 text-xs font-normal">({variance > 0 ? 'Over' : 'Short'})</span>}
 </div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cash Handover (PKR)</label><div className="relative"><span className="absolute left-3 top-2 text-gray-500 dark:text-gray-400 font-medium">PKR</span><input type="number" min="0" value={handoverAmt} onChange={e=>setHandoverAmt(e.target.value)} className="w-full pl-12 pr-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-rose-500" placeholder="0" /></div></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Handover To</label><input value={handoverTo} onChange={e=>setHandoverTo(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-rose-500" placeholder="Person name" /></div><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Left at Counter → next opening</label><div className="relative"><span className="absolute left-3 top-2 text-gray-500 dark:text-gray-400 font-medium">PKR</span><input type="number" min="0" value={leftAtCounter} onChange={e=>setLeftAtCounter(e.target.value)} className="w-full pl-12 pr-3 py-2 border-2 border-emerald-300 dark:border-emerald-700 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500" placeholder="0" /></div></div><div className="lg:col-span-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note</label><input value={note} onChange={e=>setNote(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500" placeholder="Optional note about day close..." /></div> <div className="lg:col-span-4"><button disabled={isSelectedDateClosed || hasOpenRecalls} className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-gray-900 to-gray-800 text-white font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed dark:from-white dark:to-gray-200 dark:text-gray-900">
 {isSelectedDateClosed ? 'Day Already Closed' : hasOpenRecalls ? `Clear ${pendingRecalls.length} Recall${pendingRecalls.length === 1 ? '' : 's'} First` : 'Close Day'}
 </button></div></form></div><div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"><div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4"><h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Day Close History</h2><div className="flex flex-wrap items-center gap-4 mb-4"><div className="flex-shrink-0"><DatePicker label="From" value={from} onChange={v=>setFrom(v)} /></div><div className="flex-shrink-0"><DatePicker label="To" value={to} onChange={v=>setTo(v)} /></div><div className="flex-1 min-w-0 basis-full sm:basis-auto"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Search</label><input placeholder="Date, note, user..." value={search} onChange={e=>{ setSearch(e.target.value); setPage(1) }} className="mt-1 w-full px-3 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all" /></div><div className="flex gap-3 flex-shrink-0"><button onClick={openPrintPreview} className="ui-btn ui-btn-print">Print</button><button onClick={exportCSV} className="ui-btn ui-btn-csv">CSV</button><button onClick={exportPDF} className="ui-btn ui-btn-pdf">PDF</button></div>
 {loading && <div className="text-xs text-gray-500"> Loading...</div>}
 </div></div><div className="overflow-x-auto border-2 border-gray-200 dark:border-gray-700 rounded-xl"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"><tr><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Date</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Opening</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Cash</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Bank</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Card</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Returns</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Handover</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Pay In</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Pay Out</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Expenses</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Expected</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Counted</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Variance</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Note</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">User</th><th className="px-3 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Print</th></tr></thead><tbody>
 {rows.map(r => (
 <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="px-3 py-3 text-gray-700 dark:text-gray-300 font-medium">{r.date}</td><td className="px-3 py-3 text-emerald-600 dark:text-emerald-400">PKR {Number(r.openingCash).toLocaleString()}</td><td className="px-3 py-3 text-emerald-600 dark:text-emerald-400">PKR {Number(r.cashSales).toLocaleString()}</td><td className="px-3 py-3 text-blue-600 dark:text-blue-400">PKR {Number(r.onlineSales ?? 0).toLocaleString()}</td><td className="px-3 py-3 text-indigo-600 dark:text-indigo-400">PKR {Number(r.cardSales||0).toLocaleString()}</td><td className="px-3 py-3 text-orange-600 dark:text-orange-400">PKR {Number(r.returns||0).toLocaleString()}</td><td className="px-3 py-3 text-rose-600 dark:text-rose-400">PKR {Number(r.handovers).toLocaleString()}</td><td className="px-3 py-3 text-emerald-600 dark:text-emerald-400">PKR {Number(r.payIns).toLocaleString()}</td><td className="px-3 py-3 text-rose-600 dark:text-rose-400">PKR {Number(r.payOuts).toLocaleString()}</td><td className="px-3 py-3 text-amber-600 dark:text-amber-400">PKR {Number(r.expenses||0).toLocaleString()}</td><td className="px-3 py-3 font-semibold text-blue-700 dark:text-blue-300">PKR {Number(r.expectedCash).toLocaleString()}</td><td className="px-3 py-3 text-gray-700 dark:text-gray-300">PKR {Number(r.countedCash).toLocaleString()}</td><td className={`px-3 py-3 font-semibold ${Number(r.variance)!==0?'text-red-600 dark:text-red-400':'text-emerald-600 dark:text-emerald-400'}`}>
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
 <tr><td className="px-3 py-8 text-center text-gray-500 dark:text-gray-400" colSpan={16}><div className="text-4xl mb-2"></div><div>No data.</div></td></tr>
 )}
 </tbody></table></div>

 {total > 0 && (
 <Pagination page={page} pages={totalPages} total={total} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} loading={loading} />
 )}
 </div>
 {ConfirmDialog}
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
