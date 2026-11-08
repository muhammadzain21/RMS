import { useData } from '../../state/DataContext.jsx'
import { exportDateStamp } from '../../utils/listReportExport.js'
import { useAuth } from '../../state/AuthContext.jsx'
import { useLiveRefresh } from '../../hooks/useLiveRefresh.js'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { printSaleReceiptUtil } from './printUtils.js'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'
import OrderViewDialog from './components/OrderViewDialog.jsx'

export default function SalesHistory() {
 const { state, dispatch, businessDate } = useData()
 const { token } = useAuth()
 const [fromDate, setFromDate] = useState(businessDate || '')
 const [toDate, setToDate] = useState(businessDate || '')
 const [search, setSearch] = useState('')
 const [paymentFilter, setPaymentFilter] = useState('')
 const [waiterFilter, setWaiterFilter] = useState('')
 const [riderFilter, setRiderFilter] = useState('')
 const [drawerOpen, setDrawerOpen] = useState(false)
 const [selected, setSelected] = useState(null)
 const [deleteOpen, setDeleteOpen] = useState(false)
 const [deleteKey, setDeleteKey] = useState('')
 const [deleteTarget, setDeleteTarget] = useState(null) // { id, date, billNo }
 const [deleteBusy, setDeleteBusy] = useState(false)
 const [deleteErr, setDeleteErr] = useState('')
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
 const [jump, setJump] = useState(1)
 const [viewSale, setViewSale] = useState(null) // row passed to OrderViewDialog

 // Tables can come either from state.tables or settings.tables
 const tables = Array.isArray(state.tables) && state.tables.length
 ? state.tables
 : (Array.isArray(state.settings?.tables) ? state.settings.tables.map(t => (typeof t === 'string' ? { name: t } : t)) : [])

 // Confirm delete via API using the provided key
 const handleConfirmDelete = async () => {
 if (!deleteTarget) { setDeleteErr('Nothing selected'); return }
 if (!deleteKey) { setDeleteErr('Enter the delete key'); return }
 try {
 setDeleteBusy(true)
 setDeleteErr('')
 const API = ((typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000')
 const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Delete-Key': deleteKey }
 const res = await fetch(`${API}/api/sales/${deleteTarget.id}`, { method: 'DELETE', headers })
 if (!res.ok) {
 let msg = 'Failed to delete sale (invalid key or server error)'
 try { const j = await res.json(); if (j?.error) msg = j.error } catch {}
 setDeleteErr(msg)
 setDeleteBusy(false)
 return
 }
 // Update UI and restore inventory locally
 dispatch({ type: 'DELETE_SALE', payload: { id: deleteTarget.id } })
 // Refresh ingredients from server so inventory reflects the restoration
 try {
   const ingRes = await fetch(`${API}/api/ingredients`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' })
   if (ingRes.ok) {
     const ingRows = await ingRes.json()
     const mapId = (x) => ({ ...x, id: x.id || x._id })
     dispatch({ type: 'HYDRATE', payload: { ingredients: (ingRows||[]).map(mapId) } })
   }
 } catch {}
 setDeleteBusy(false)
 setDeleteOpen(false)
 setDeleteTarget(null)
 setDeleteKey('')
 } catch {
 setDeleteErr('Network error')
 setDeleteBusy(false)
 }
 }

 // Ensure sales are hydrated from backend on mount and when date filter changes
 useEffect(() => {
 const API = ((typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000')
 const headers = token ? { Authorization: `Bearer ${token}` } : {}
 let cancelled = false
 ;(async () => {
 try {
 const params = []
 if (fromDate) params.push(`from=${encodeURIComponent(fromDate)}`)
 if (toDate) params.push(`to=${encodeURIComponent(toDate)}`)
 const qs = params.length ? `?${params.join('&')}` : `?from=0000-00-00&to=9999-12-31`
 const res = await fetch(`${API}/api/sales${qs}`, { headers, cache: 'no-store' })
 if (!res.ok) return
 const rows = await res.json()
 if (cancelled) return
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 dispatch({ type: 'HYDRATE', payload: { sales: (rows||[]).map(mapId) } })
 } catch {}
 })()
 return () => { cancelled = true }
 }, [token, fromDate, toDate, dispatch])

 // Multi-branch live refresh (poll + branch/sync events; pauses when offline/hidden)
 useLiveRefresh(async () => {
  try {
   const API = ((typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000')
   const headers = token ? { Authorization: `Bearer ${token}` } : {}
   const params = []
   if (fromDate) params.push(`from=${encodeURIComponent(fromDate)}`)
   if (toDate) params.push(`to=${encodeURIComponent(toDate)}`)
   const qs = params.length ? `?${params.join('&')}` : `?from=0000-00-00&to=9999-12-31`
   const res = await fetch(`${API}/api/sales${qs}`, { headers, cache: 'no-store' })
   if (!res.ok) return
   const rows = await res.json()
   const mapId = (x) => ({ ...x, id: x.id || x._id })
   dispatch({ type: 'HYDRATE', payload: { sales: (rows || []).map(mapId) } })
  } catch {}
 }, { intervalMs: 8000 })

 // lock edits for closed dates
 const closedDates = useMemo(() => new Set((state.dayCloses||[]).map(d => d.date)), [state.dayCloses])
 const isFilterDateClosed = !!fromDate && closedDates.has(fromDate)
 const isTodayClosed = closedDates.has(businessDate)

 const itemsToText = (s) => s.items.map(it => `${state.menu.find(m => m.id===it.itemId)?.name || 'Item'} x${it.qty}`).join(', ')
 const customerText = (c) => {
 if (!c) return '-'
 if (typeof c === 'string') return c
 return c.name || c.phone || '-'
 }

 const rows = useMemo(() => {
 let list = state.sales
 if (fromDate) list = list.filter(s => s.date >= fromDate)
 if (toDate) list = list.filter(s => s.date <= toDate)
 if (paymentFilter) list = list.filter(s => (s.paymentMethod || 'cash').toLowerCase() === paymentFilter.toLowerCase())
 if (waiterFilter) list = list.filter(s => String(s.waiterId || '') === String(waiterFilter))
 if (riderFilter) list = list.filter(s => String(s.riderId || '') === String(riderFilter))
 let mapped = list.map((s, idx) => {
 // Recompute subtotal from items to align with receipt 'Sale Total'
 const modsConfig = state.settings?.modifiers || {}
 const subtotal = (s.items || []).reduce((sum, it) => {
 const m = (state.menu || []).find(mm => mm.id === it.itemId)
 // Base price from menu or custom fallback
 const base = m ? Number(m.price || 0) : Number(it?.custom?.price || 0)
 // Addons from enabled modifiers on the line
 const enabled = it?.mods || {}
 const addons = Object.keys(enabled).reduce((a, key) => {
 if (!enabled[key]) return a
 const cfg = modsConfig[key]
 return a + Number(cfg?.price || 0)
 }, 0)
 const qty = Number(it.qty || 0)
 return sum + ((base + addons) * qty)
 }, 0)
 // Robust net amount (final) fallback
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
 // Check if this sale has a return recorded
 const hasReturn = (state.returns || []).some(r => r.saleId === s.id)
 return ({
 id: s.id,
 date: s.date, // no time captured; keep date for now
 // Show token in the Bill Number column as: <businessDate>_<tokenNo>
 billNo: (s?.tokenNo || s?.detail?.tokenNo)
 ? `${s.date || businessDate}_${s.tokenNo || s?.detail?.tokenNo}`
 : (s.billNo ? `BILL-${s.billNo}` : `BILL-${String(state.sales.length - idx).padStart(5,'0')}`),
 soldBy: s.soldBy ?? '-',
 customer: customerText(s.customer),
 // Sale Total (receipt 'Sale Total'): recomputed subtotal from items
 saleTotal: Number(subtotal),
 // Net Amount (final after discount)
 netAmount,
 paymentMethod: (() => {
 const pm = (s.paymentMethod || 'cash').toString().toUpperCase()
 if (pm === 'BANK') {
 const ch = { bank_account: 'BANK ACCOUNT', jazzcash: 'JAZZCASH', easypaisa: 'EASYPAISA', sadapay: 'SADAPAY', nayapay: 'NAYAPAY', raast: 'RAAST', upaisa: 'UPAISA', zindigi: 'ZINDIGI' }[String(s.bankChannel||'').toLowerCase()] || 'TRANSFER'
 return `BANK (${ch}${s.bankLast4 ? ` ····${s.bankLast4}` : ''})`
 }
 if (pm === 'CARD') {
 return `CARD${s.bankLast4 ? ` ····${s.bankLast4}` : ''}`
 }
 if (pm === 'STAFF') {
 return `STAFF (${s.staffName || 'Member'})`
 }
 return pm
 })(),
 deliveryDate: s.date,
 orderType: s.orderType || '-',
 tableNo: s.orderType === 'Dine-in' ? (s.tableNo || '-') : '-',
 waiterName: s.orderType === 'Dine-in' ? (s.waiterId ? (state.staff||[]).find(st=>st.id===s.waiterId)?.name || s.waiter || '-' : (s.waiter || '-')) : '-',
 riderName: s.orderType === 'Delivery' ? (s.riderId ? (state.riders||[]).find(r=>r.id===s.riderId)?.name || s.riderName || s.rider || '-' : (s.riderName || s.rider || '-')) : '-',
 status: hasReturn ? 'Returned' : 'Paid',
 detail: s, // keep full sale for drawer
 offlineBillNo: s.offlineBillNo ?? '-',
 })})
 if (search) {
 const t = search.toLowerCase()
 mapped = mapped.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(t)))
 }
 return mapped
 }, [state.sales, state.menu, state.returns, fromDate, toDate, search, paymentFilter, waiterFilter, riderFilter])

 // Summary stats from filtered rows
 const stats = useMemo(() => {
 const list = rows
 const totalSales = list.length
 const totalRevenue = list.reduce((s, r) => s + Number(r.netAmount || 0), 0)
 const totalSaleAmount = list.reduce((s, r) => s + Number(r.saleTotal || 0), 0)
 const totalDiscount = Math.max(0, totalSaleAmount - totalRevenue + list.reduce((s, r) => {
 const d = r.detail
 return s + Number(d?.taxAmt || 0) + Number(d?.serviceAmt || 0)
 }, 0))
 // By payment method — use the raw sale value (r.paymentMethod is a display string)
 const cashSales = list.filter(r => (r.detail?.paymentMethod || 'CASH').toUpperCase() === 'CASH')
 const cardSales = list.filter(r => {
 const p = (r.detail?.paymentMethod || '').toUpperCase()
 return p === 'CARD' || p === 'ONLINE' || p === 'BANK'
 })
 const personalSales = list.filter(r => {
 const p = (r.detail?.paymentMethod || '').toUpperCase()
 return p === 'COMPLIMENTARY' || p === 'PERSONAL'
 })
 const staffSales = list.filter(r => (r.detail?.paymentMethod || '').toUpperCase() === 'STAFF')
 // By order type
 const dineInCount = list.filter(r => (r.orderType || '').toLowerCase() === 'dine-in').length
 const takeAwayCount = list.filter(r => (r.orderType || '').toLowerCase() === 'take-away' || (r.orderType || '').toLowerCase() === 'takeaway').length
 const deliveryCount = list.filter(r => (r.orderType || '').toLowerCase() === 'delivery').length
 return {
 totalSales,
 totalRevenue,
 totalDiscount: Math.max(0, totalSaleAmount - list.reduce((s, r) => s + Number(r.netAmount || 0) - Number(r.detail?.taxAmt || 0) - Number(r.detail?.serviceAmt || 0), 0)),
 cashCount: cashSales.length,
 cashAmount: cashSales.reduce((s, r) => s + Number(r.netAmount || 0), 0),
 cardCount: cardSales.length,
 cardAmount: cardSales.reduce((s, r) => s + Number(r.netAmount || 0), 0),
 personalCount: personalSales.length,
 personalAmount: personalSales.reduce((s, r) => s + Number(r.netAmount || 0), 0),
 staffCount: staffSales.length,
 staffAmount: staffSales.reduce((s, r) => s + Number(r.netAmount || 0), 0),
 dineInCount,
 takeAwayCount,
 deliveryCount,
 }
 }, [rows])

 const pages = Math.ceil(rows.length / limit) || 1
 const paginatedRows = rows.slice((page - 1) * limit, page * limit)

 // Helper function to calculate line total for reprinting
 const lineTotal = (menuItem, saleItem) => {
 if (!menuItem && saleItem.custom) {
 return Number(saleItem.custom.price || 0) * Number(saleItem.qty || 0)
 }
 if (!menuItem) return 0
 const basePrice = Number(menuItem.price || 0)
 const qty = Number(saleItem.qty || 0)
 return basePrice * qty
 }

 // Function to reprint a sale receipt
 const reprintSale = async (sale) => {
 try {
 // Look up floor information from tables array for Dine-in orders
 const tableObj = sale.detail.orderType === 'Dine-in' && sale.detail.tableNo
 ? tables.find(t => (t.name || t.label || t.code || String(t)) === sale.detail.tableNo)
 : null
 const floor = tableObj?.floor || ''
 // Reconstruct the sale data for printing
 const saleData = {
 state,
 items: sale.detail.items || [],
 orderType: sale.detail.orderType || 'Take-away',
 waiterId: sale.detail.waiterId || '',
 tableNo: sale.detail.tableNo || '',
 floor,
 paymentMethod: sale.detail.paymentMethod || 'Cash',
 bankChannel: sale.detail.bankChannel || '',
 bankLast4: sale.detail.bankLast4 || '',
 bankRef: sale.detail.bankRef || '',
 staffId: sale.detail.staffId || '',
 staffName: sale.detail.staffName || '',
 staffSettlement: sale.detail.staffSettlement || '',
 cashReceived: sale.detail.cashReceived || sale.detail.total || 0,
 changeDue: sale.detail.changeDue || 0,
 payRemarks: sale.detail.payRemarks || '',
 lineTotal,
 tokenNo: sale.detail.tokenNo || '',
 billNoOverride: sale.billNo || '',
 customer: sale.detail.customer || { name: '', address: '', phone: '' },
 itemsDiscount: sale.detail.itemsDiscount || 0,
 billDiscount: sale.detail.billDiscount || sale.detail.discount || 0,
 taxAmt: sale.detail.taxAmt || 0,
 serviceAmt: sale.detail.serviceAmt || 0,
 createdAt: sale.detail.createdAt || sale.detail.date || null,
 }
 
 console.log(' Reprinting sale:', sale.billNo, saleData)
 // Try to embed logo as data URL to avoid file:// or data: origin issues inside iframe
 const pickLogoPath = () => {
 const s = state?.settings || {}
 // Prefer settings-provided logos; avoid referencing a non-existent public file in packaged apps.
 if (s.receiptLogo && /^(data:|https?:|file:)/i.test(s.receiptLogo)) return s.receiptLogo
 if (s.logoUrl && /^(data:|https?:|file:)/i.test(s.logoUrl)) return s.logoUrl
 if (s.logo && /^(data:|https?:|file:)/i.test(s.logo)) return s.logo
 return ''
 }
 const toAbsolute = (u)=>{
 try{
 if (!u) return ''
 if (/^(data:|https?:|file:)/i.test(u)) return u
 const isFileProto = String(window.location.protocol).startsWith('file')
 if (u.startsWith('/')) {
 if (isFileProto) return new URL('.' + u, window.location.href).href
 return window.location.origin + u
 }
 return new URL(u, window.location.href).href
 }catch{ return u }
 }
 const loadAsDataURL = (src) => new Promise((resolve) => {
 // Try fetch->blob->FileReader first (works for http/https same-origin)
 try{
 if (/^https?:/i.test(src)) {
 fetch(src, { mode: 'cors' }).then(r => r.ok ? r.blob() : Promise.reject()).then(blob => {
 const fr = new FileReader()
 fr.onload = () => resolve(String(fr.result||''))
 fr.onerror = () => resolve('')
 fr.readAsDataURL(blob)
 }).catch(()=>{
 // Fallback to canvas path
 tryCanvas()
 })
 return
 }
 }catch{}
 tryCanvas()
 function tryCanvas(){
 try{
 const img = new Image()
 img.crossOrigin = 'anonymous'
 img.onload = () => {
 try{
 const canvas = document.createElement('canvas')
 canvas.width = img.naturalWidth
 canvas.height = img.naturalHeight
 const ctx = canvas.getContext('2d')
 ctx.drawImage(img, 0, 0)
 const data = canvas.toDataURL('image/png')
 resolve(data)
 }catch{ resolve('') }
 }
 img.onerror = () => resolve('')
 img.src = src
 }catch{ resolve('') }
 }
 })
 const logoCandidate = pickLogoPath()
 const logoAbs = toAbsolute(logoCandidate)
 const logoDataUrl = logoAbs ? await loadAsDataURL(logoAbs) : ''
 const effectiveLogo = logoDataUrl || logoCandidate
 // Show in-app preview with toolbar (Print and OK buttons)
 printSaleReceiptUtil({ ...saleData, autoPrint: false, previewInApp: true, logoUrl: effectiveLogo })
 } catch (error) {
 console.error(' Error reprinting sale:', error)
 toast.error('Error reprinting receipt. Please try again.')
 }
 }

 const cols = [
 { label: 'Date', key: 'date' },
 { label: 'Bill Number', key: 'billNo' },
 { label: 'Customer', key: 'customer', hideBelow: 'md' },
 { label: 'Order Type', key: 'orderType', hideBelow: 'lg' },
 { label: 'Table', key: 'tableNo', hideBelow: 'lg' },
 { label: 'Waiter', key: 'waiterName', hideBelow: 'lg' },
 { label: 'Rider', key: 'riderName', hideBelow: 'lg' },
 { label: 'Sale Total', key: 'saleTotal', hideBelow: 'md', render: r => `PKR ${Number(r.saleTotal).toLocaleString()}` },
 { label: 'Net Amount', key: 'netAmount', render: r => `PKR ${Number(r.netAmount).toLocaleString()}` },
 { label: 'Payment Mode', key: 'paymentMethod' },
 { label: 'Status', key: 'status', render: r => (
 <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.status === 'Returned' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>{r.status}</span>
 ) },
 { label: 'Delivery Date', key: 'deliveryDate', hideBelow: 'lg' },
 { label: 'View', key: 'view', render: r => (
 <button
 onClick={() => setViewSale(r)}
 className="px-2 py-1 text-xs rounded bg-indigo-500 text-white hover:bg-indigo-600"
 title="View Order Details"
 >
 View
 </button>
 ) },
 { label: 'Print', key: 'print', render: r => (
 <button
 onClick={() => reprintSale(r)}
 className="px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600"
 title="Reprint Receipt"
 >
 Print
 </button>
 ) },
 { label: 'Delete', key: 'actions', render: r => (
 <button
 onClick={() => {
 if (closedDates.has(r.date)) return
 setDeleteTarget({ id: r.id, date: r.date, billNo: r.billNo })
 setDeleteKey('')
 setDeleteErr('')
 setDeleteOpen(true)
 }}
 disabled={closedDates.has(r.date)}
 className="px-2 py-1 text-xs rounded bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50"
 >Delete</button>
 ) },
 ]

 const exportPDF = () => {
 try {
 const doc = new jsPDF('l', 'pt', 'a4')
 doc.setFontSize(16)
 doc.text('Sales History', 40, 32)
 doc.setFontSize(10)
 doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 40, 48)
 if (fromDate || toDate) {
 doc.text(`Period: ${fromDate || '...'} to ${toDate || '...'}`, 40, 60)
 }
 const body = rows.map(r => [
 r.date,
 r.billNo,
 r.customer,
 r.orderType,
 r.tableNo,
 r.waiterName,
 r.riderName,
 `PKR ${Number(r.saleTotal).toLocaleString()}`,
 `PKR ${Number(r.netAmount).toLocaleString()}`,
 r.paymentMethod,
 r.status,
 r.deliveryDate
 ])
 doc.autoTable({
 head: [['Date','Bill#','Customer','Order Type','Table','Waiter','Rider','Sale Total','Net Amount','Payment','Status','Delivery']],
 body,
 startY: fromDate || toDate ? 72 : 60,
 styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', halign: 'left' },
 headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 9, fontStyle: 'bold' },
 margin: { left: 40, right: 40 },
 tableWidth: 'auto'
 })
 doc.save(`sales_${exportDateStamp(fromDate, toDate, businessDate)}.pdf`)
 toast.success('PDF exported successfully')
 } catch (err) {
 console.error('PDF export error:', err)
 toast.error('Failed to export PDF: ' + (err?.message || 'unknown error'))
 }
 }

 const exportCSV = () => {
 const headers = ['Date','Bill Number','Customer','Order Type','Table','Waiter','Rider','Sale Total (PKR)','Net Amount (PKR)','Payment Mode','Status','Delivery Date']
 const lines = rows.map(r => [r.date,r.billNo,r.customer,r.orderType,r.tableNo,r.waiterName,r.riderName,r.saleTotal,r.netAmount,r.paymentMethod,r.status,r.deliveryDate]
 .map(v => '"' + String(v ?? '').replaceAll('"','""') + '"').join(',')).join('\n')
 const csv = headers.join(',') + '\n' + lines
 const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = `sales_${exportDateStamp(fromDate, toDate, businessDate)}.csv`
 a.click()
 URL.revokeObjectURL(url)
 toast.success('CSV exported successfully')
 }

 const openPrintPreview = async () => {
 try {
 const money = (n) => 'PKR ' + Math.round(Number(n || 0)).toLocaleString()
 const body =
 reportSummary([
 { label: 'Total Sales', amount: String(stats.totalSales) },
 { label: 'Total Revenue', amount: money(stats.totalRevenue) },
 { label: 'Total Discount', amount: money(stats.totalDiscount) },
 { label: 'Cash Sales', amount: `${stats.cashCount} / ${money(stats.cashAmount)}` },
 { label: 'Bank / Card', amount: `${stats.cardCount} / ${money(stats.cardAmount)}` },
 { label: 'Personal', amount: `${stats.personalCount} / ${money(stats.personalAmount)}` },
 { label: 'Staff', amount: `${stats.staffCount} / ${money(stats.staffAmount)}` },
 { label: 'Dine-in', amount: String(stats.dineInCount) },
 { label: 'Take-away', amount: String(stats.takeAwayCount) },
 { label: 'Delivery', amount: String(stats.deliveryCount) },
 ]) +
 reportSec(`Sales (${rows.length})`) +
 reportTable({
 headers: ['Date', 'Bill#', 'Customer', 'Order Type', 'Table', 'Waiter', 'Rider', { t: 'Sale Total', align: 'r' }, { t: 'Net Amount', align: 'r' }, 'Payment', 'Status'],
 numbered: true,
 rows: rows.map(r => [
 r.date,
 r.billNo,
 r.customer,
 r.orderType,
 r.tableNo,
 r.waiterName,
 r.riderName,
 { v: money(r.saleTotal), align: 'r' },
 { v: money(r.netAmount), align: 'r' },
 r.paymentMethod,
 r.status,
 ]),
 emptyText: 'No sales found',
 })
 const html = wrapReportDoc({
 settings: state?.settings || {},
 title: 'Sales History',
 reportLabel: 'Sales History Report',
 reportNo: `Rpt #: SH-${fromDate || 'all'}-${toDate || 'all'}`,
 metaLeft: [
 ['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')],
 ['Period', `${fromDate || '...'} to ${toDate || '...'}`],
 ],
 metaRight: [
 ['Records', String(rows.length)],
 ['Revenue', money(stats.totalRevenue)],
 ],
 body,
 })
 await previewHtmlReport(html, `Sales-History-${fromDate || 'all'}-${toDate || 'all'}.pdf`)
 } catch (err) {
 console.error('Print preview failed:', err)
 toast.error('Print preview failed')
 }
 }

 return (
 <div className="space-y-4"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">Sales History
 </h1></div>
 {isTodayClosed && (
 <div className="px-4 py-3 rounded-xl bg-amber-50 border-2 border-amber-200 text-amber-900 text-sm flex items-center gap-2">Today is closed. Edits for today are locked.
 </div>
 )}
 {isFilterDateClosed && (
 <div className="px-4 py-3 rounded-xl bg-yellow-50 border-2 border-yellow-200 text-yellow-900 text-sm flex items-center gap-2">Selected date is closed. Deleting sales for this date is disabled.
 </div>
 )}
 <div className="filter-toolbar p-3 sm:p-4 rounded-xl bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-950/40 dark:to-purple-950/40 border-2 border-indigo-300 dark:border-indigo-800">
  <div className="filter-actions flex flex-wrap gap-2">
    <button type="button" onClick={openPrintPreview} className="ui-btn ui-btn-print">Print</button>
    <button type="button" onClick={exportPDF} className="ui-btn ui-btn-pdf">PDF</button>
    <button type="button" onClick={exportCSV} className="ui-btn ui-btn-csv">CSV</button>
  </div>
  <div className="filter-field min-w-0">
    <DatePicker label="From" value={fromDate} onChange={v => { setFromDate(v); setPage(1); }} className="w-full" />
  </div>
  <div className="filter-field min-w-0">
    <DatePicker label="To" value={toDate} onChange={v => { setToDate(v); setPage(1); }} className="w-full" />
  </div>
  <div className="filter-select min-w-0">
    <label className="mb-1 block text-xs font-semibold text-indigo-700 dark:text-indigo-300">Mode</label>
    <select value={paymentFilter} onChange={e => { setPaymentFilter(e.target.value); setPage(1); }} className="w-full px-3 py-2.5 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500">
      <option value="">All Modes</option>
      <option value="cash">Cash</option>
      <option value="bank">Bank</option>
      <option value="online">Online (old)</option>
      <option value="complimentary">Personal</option>
      <option value="staff">Staff</option>
    </select>
  </div>
  <div className="filter-select min-w-0">
    <label className="mb-1 block text-xs font-semibold text-indigo-700 dark:text-indigo-300">Waiter</label>
    <select value={waiterFilter} onChange={e => { setWaiterFilter(e.target.value); setPage(1); }} className="w-full px-3 py-2.5 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500">
      <option value="">All Waiters</option>
      {(state.staff||[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  </div>
  <div className="filter-select min-w-0">
    <label className="mb-1 block text-xs font-semibold text-indigo-700 dark:text-indigo-300">Rider</label>
    <select value={riderFilter} onChange={e => { setRiderFilter(e.target.value); setPage(1); }} className="w-full px-3 py-2.5 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500">
      <option value="">All Riders</option>
      {(state.riders||[]).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  </div>
  <div className="filter-search min-w-0 flex-1 basis-full sm:basis-auto">
    <label className="mb-1 block text-xs font-semibold text-indigo-700 dark:text-indigo-300 sm:sr-only">Search</label>
    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="w-full px-4 py-2.5 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500" />
  </div>
 </div><div className="border-2 border-indigo-300 dark:border-indigo-800 rounded-xl overflow-x-auto shadow-sm"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900"><tr><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Date</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Bill Number</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Customer</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Order Type</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Table</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Waiter</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Rider</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Sale Total</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Net Amount</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Payment Mode</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Status</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Delivery Date</th><th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th></tr></thead><tbody>
 {paginatedRows.map(r => (
 <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="p-3 text-gray-700 dark:text-gray-300">{r.date}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.billNo}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.customer}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.orderType}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.tableNo}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.waiterName}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.riderName}</td><td className="p-3 text-gray-700 dark:text-gray-300">PKR {Number(r.saleTotal).toLocaleString()}</td><td className="p-3 text-gray-700 dark:text-gray-300">PKR {Number(r.netAmount).toLocaleString()}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.paymentMethod}</td><td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${r.status === 'Returned' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>{r.status}</span></td><td className="p-3 text-gray-600 dark:text-gray-400">{r.deliveryDate}</td><td className="p-3 text-center"><div className="flex items-center justify-center gap-2"><button onClick={() => setViewSale(r)} className="px-2 py-1 text-xs rounded bg-indigo-500 text-white hover:bg-indigo-600" title="View Order Details">View</button><button onClick={() => reprintSale(r)} className="px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600" title="Reprint Receipt">Print</button><button onClick={() => {
 if (closedDates.has(r.date)) return
 setDeleteTarget({ id: r.id, date: r.date, billNo: r.billNo })
 setDeleteKey('')
 setDeleteErr('')
 setDeleteOpen(true)
 }} disabled={closedDates.has(r.date)} className="px-2 py-1 text-xs rounded bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50">Delete</button></div></td></tr>
 ))}
 {!rows.length && (
 <tr><td colSpan={14} className="p-8 text-center text-gray-500 dark:text-gray-400"><div className="text-4xl mb-2"></div><div>No sales found</div></td></tr>
 )}
 </tbody></table></div>

 {/* Pagination controls */}
 <Pagination page={page} pages={pages} total={rows.length} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} />

 {drawerOpen && selected && (
 <><div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setDrawerOpen(false)} /><div className="fixed right-0 top-0 h-full w-full max-w-md z-50 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950 shadow-2xl flex flex-col border-l-4 border-indigo-500"><div className="p-4 border-b border-indigo-200 dark:border-indigo-800 flex items-center justify-between bg-gradient-to-r from-indigo-100 to-indigo-50 dark:from-indigo-950/30 dark:to-gray-900"><div className="font-bold text-lg text-indigo-900 dark:text-indigo-100 flex items-center gap-2"><span></span> Bill {selected.billNo ? `BILL-${selected.billNo}` : ''}
 </div><button onClick={() => setDrawerOpen(false)} className="px-3 py-1.5 text-sm rounded-lg border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">Close</button></div><div className="p-4 space-y-4 overflow-auto"><div className="p-3 rounded-xl bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border border-blue-200 dark:border-blue-800"><div className="text-sm text-gray-600 dark:text-gray-400 mb-1"> Date</div><div className="font-semibold text-gray-900 dark:text-gray-100">{selected.date}</div></div><div className="grid grid-cols-2 gap-3"><div className="p-3 rounded-xl bg-gradient-to-r from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 border border-purple-200 dark:border-purple-800"><div className="text-sm text-gray-600 dark:text-gray-400 mb-1"> Sold By</div><div className="font-semibold text-gray-900 dark:text-gray-100">{selected.soldBy || '-'}</div></div><div className="p-3 rounded-xl bg-gradient-to-r from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 border border-emerald-200 dark:border-emerald-800"><div className="text-sm text-gray-600 dark:text-gray-400 mb-1"> Customer</div><div className="font-semibold text-gray-900 dark:text-gray-100">{selected.customer || '-'}</div></div></div><div className="p-3 rounded-xl bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 border border-amber-200 dark:border-amber-800"><div className="text-sm text-gray-600 dark:text-gray-400 mb-1"> Order Type</div><div className="grid grid-cols-2 gap-2 text-sm"><div>Date & Time : {format(new Date(), 'd-M-yyyy h:mm a')}</div></div></div>
 {selected.orderType === 'Dine-in' && (
 <div className="text-sm text-gray-600">Table / Waiter: <span className="text-gray-900 dark:text-gray-100 font-medium">{`${selected.tableNo || '-'} • ${selected.waiter || '-'}`}</span></div>
 )}
 {selected.orderType === 'Delivery' && (
 <div className="text-sm text-gray-600">Rider: <span className="text-gray-900 dark:text-gray-100 font-medium">{(state.riders||[]).find(r=>r.id===selected.riderId)?.name || '-'}</span></div>
 )}
 {selected.orderType === 'Take-away' && (
 <div className="text-sm text-gray-600">Take-away Customer: <span className="text-gray-900 dark:text-gray-100 font-medium">{selected.customer || '-'}</span></div>
 )}
 <div><div className="font-medium mb-2">Items</div><table className="w-full text-sm border"><thead className="bg-gray-50 dark:bg-gray-800"><tr><th className="p-2 text-left">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Amount</th></tr></thead><tbody>
 {selected.items.map((it, i) => {
 const m = state.menu.find(mm => mm.id === it.itemId)
 const rate = m?.price || 0
 const amount = rate * it.qty
 return (
 <tr key={i} className="border-t"><td className="p-2">{m?.name || 'Item'}</td><td className="p-2 text-right">{it.qty}</td><td className="p-2 text-right">{rate.toLocaleString()}</td><td className="p-2 text-right">{amount.toLocaleString()}</td></tr>
 )
 })}
 </tbody></table></div><div className="flex justify-end gap-6 text-sm"><div>Discount: <span className="font-medium">{Number(selected.discount||0).toLocaleString()}</span></div><div>Total: <span className="font-medium">{Number(selected.total||0).toLocaleString()}</span></div><div>Net: <span className="font-semibold">{Math.max(0, Number(selected.total||0) - Number(selected.discount||0)).toLocaleString()}</span></div></div></div></div></>
 )}
 {/* Order view dialog */}
 <OrderViewDialog
 open={!!viewSale}
 sale={viewSale}
 API={(typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'}
 token={token}
 menu={state.menu || []}
 onClose={() => setViewSale(null)}
 />

 {/* Delete Sale Modal */}
 {deleteOpen && (
 <><div className="fixed inset-0 bg-black/40 z-50" onClick={() => { if (!deleteBusy) setDeleteOpen(false) }} /><div className="fixed inset-0 z-50 flex items-center justify-center"><div className="w-full max-w-md bg-white dark:bg-gray-900 border rounded shadow-xl p-4"><div className="text-lg font-semibold mb-1">Delete Sale</div><div className="text-sm text-gray-600 mb-3">This will restore inventory. Bill: <span className="font-medium">{deleteTarget?.billNo || '-'}</span></div><label className="block text-sm"><span>Sale Delete Key</span><input
 type="password"
 value={deleteKey}
 onChange={e=>setDeleteKey(e.target.value)}
 onKeyDown={e=>{ if(e.key==='Enter' && deleteKey && !deleteBusy) handleConfirmDelete() }}
 className="mt-1 w-full px-3 py-2 border rounded bg-white text-gray-900"
 placeholder="Enter key"
 autoFocus
 /></label>
 {deleteErr && <div className="mt-2 text-sm text-red-600">{deleteErr}</div>}
 <div className="mt-4 flex justify-end gap-2"><button disabled={deleteBusy} onClick={()=>setDeleteOpen(false)} className="px-3 py-2 border rounded">Cancel</button><button disabled={!deleteKey || deleteBusy} onClick={handleConfirmDelete} className="px-3 py-2 rounded bg-rose-600 text-white disabled:opacity-50">{deleteBusy ? 'Deleting…' : 'Delete'}</button></div></div></div></>
 )}
 </div>
 )
}
