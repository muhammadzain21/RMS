import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { printSaleReceiptUtil } from './printUtils.js'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'

export default function SalesHistory() {
 const { state, dispatch, businessDate } = useData()
 const { token } = useAuth()
 const [fromDate, setFromDate] = useState(businessDate || '')
 const [toDate, setToDate] = useState(businessDate || '')
 const [search, setSearch] = useState('')
 const [paymentFilter, setPaymentFilter] = useState('')
 const [drawerOpen, setDrawerOpen] = useState(false)
 const [selected, setSelected] = useState(null)
 const [deleteOpen, setDeleteOpen] = useState(false)
 const [deleteKey, setDeleteKey] = useState('')
 const [deleteTarget, setDeleteTarget] = useState(null) // { id, date, billNo }
 const [deleteBusy, setDeleteBusy] = useState(false)
 const [deleteErr, setDeleteErr] = useState('')
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(20)
 const [jump, setJump] = useState(1)

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
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
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
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
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
 paymentMethod: (s.paymentMethod || 'cash').toString().toUpperCase(),
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
 }, [state.sales, state.menu, state.returns, fromDate, toDate, search])

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
 // By payment method
 const cashSales = list.filter(r => (r.paymentMethod || 'CASH').toUpperCase() === 'CASH')
 const cardSales = list.filter(r => {
 const p = (r.paymentMethod || '').toUpperCase()
 return p === 'CARD' || p === 'ONLINE'
 })
 const personalSales = list.filter(r => {
 const p = (r.paymentMethod || '').toUpperCase()
 return p === 'COMPLIMENTARY' || p === 'PERSONAL'
 })
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
 printSaleReceiptUtil({ ...saleData, autoPrint: true, previewInApp: false, logoUrl: effectiveLogo })
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
 const doc = new jsPDF('l', 'pt', 'a4') // landscape for more width
 doc.setFontSize(16)
 doc.text('Sales History', 40, 32)
 doc.setFontSize(10)
 doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 40, 48)
 if (fromDate || toDate) {
 doc.text(`Period: ${fromDate || '...'} to ${toDate || '...'}`, 40, 60)
 }
 // Summary stats as colored widget boxes
 const fmtPkr = (n) => `PKR ${Math.round(n).toLocaleString()}`
 const widgets = [
 { label: 'Total Sales', value: String(stats.totalSales), bg: [219, 234, 254], border: [59, 130, 246], text: [30, 58, 138] },
 { label: 'Total Revenue', value: fmtPkr(stats.totalRevenue), bg: [209, 250, 229], border: [16, 185, 129], text: [6, 78, 59] },
 { label: 'Total Discount', value: fmtPkr(stats.totalDiscount), bg: [254, 243, 199], border: [245, 158, 11], text: [120, 53, 15] },
 { label: 'Cash Sales', value: `${stats.cashCount} / ${fmtPkr(stats.cashAmount)}`, bg: [207, 250, 254], border: [6, 182, 212], text: [14, 116, 144] },
 { label: 'Card / Online', value: `${stats.cardCount} / ${fmtPkr(stats.cardAmount)}`, bg: [233, 213, 255], border: [147, 51, 234], text: [88, 28, 135] },
 { label: 'Personal', value: `${stats.personalCount} / ${fmtPkr(stats.personalAmount)}`, bg: [254, 226, 226], border: [244, 63, 94], text: [136, 19, 55] },
 { label: 'Dine-in', value: String(stats.dineInCount), bg: [224, 231, 255], border: [99, 102, 241], text: [49, 46, 129] },
 { label: 'Take-away', value: String(stats.takeAwayCount), bg: [204, 251, 241], border: [20, 184, 166], text: [19, 78, 74] },
 { label: 'Delivery', value: String(stats.deliveryCount), bg: [255, 237, 213], border: [249, 115, 22], text: [124, 45, 18] },
 ]
 const pageWidth = doc.internal.pageSize.getWidth()
 const margin = 40
 const gap = 8
 const boxW = (pageWidth - 2 * margin - 2 * gap) / 3
 const boxH = 52
 let statY = fromDate || toDate ? 74 : 60
 for (let i = 0; i < widgets.length; i++) {
 const col = i % 3
 const row = Math.floor(i / 3)
 const x = margin + col * (boxW + gap)
 const y = statY + row * (boxH + gap)
 const w = widgets[i]
 doc.setFillColor(w.bg[0], w.bg[1], w.bg[2])
 doc.setDrawColor(w.border[0], w.border[1], w.border[2])
 doc.setLineWidth(1.5)
 doc.roundedRect(x, y, boxW, boxH, 6, 6, 'FD')
 doc.setFontSize(7)
 doc.setTextColor(w.text[0], w.text[1], w.text[2])
 doc.setFont(undefined, 'bold')
 doc.text(w.label.toUpperCase(), x + 10, y + 16)
 doc.setFontSize(13)
 doc.text(w.value, x + 10, y + 38)
 doc.setTextColor(0, 0, 0)
 doc.setFont(undefined, 'normal')
 }
 const totalWidgetRows = Math.ceil(widgets.length / 3)
 const tableStartY = statY + totalWidgetRows * (boxH + gap) + 6
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
 startY: tableStartY,
 styles: { 
 fontSize: 8,
 cellPadding: 4,
 overflow: 'linebreak',
 halign: 'left'
 },
 headStyles: { 
 fillColor: [59, 130, 246], 
 textColor: 255,
 fontSize: 9,
 fontStyle: 'bold'
 },
 columnStyles: {
 0: { cellWidth: 70 }, // Date
 1: { cellWidth: 90 }, // Bill#
 2: { cellWidth: 80 }, // Customer
 3: { cellWidth: 70 }, // Order Type
 4: { cellWidth: 50 }, // Table
 5: { cellWidth: 60 }, // Waiter
 6: { cellWidth: 60 }, // Rider
 7: { cellWidth: 70, halign: 'right' }, // Sale Total
 8: { cellWidth: 70, halign: 'right' }, // Net Amount
 9: { cellWidth: 50 }, // Payment
 10: { cellWidth: 55 }, // Status
 11: { cellWidth: 70 }, // Delivery
 },
 margin: { left: 40, right: 40 },
 tableWidth: 'auto'
 })
 doc.save(`sales_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
 toast.success('PDF exported successfully')
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
 a.download = `sales_${format(new Date(), 'yyyy-MM-dd')}.csv`
 a.click()
 URL.revokeObjectURL(url)
 toast.success('CSV exported successfully')
 }

 const bulkPrint = () => {
 const win = window.open('', '_blank')
 if (!win) return
 const fmtPkr = (n) => `PKR ${Math.round(n).toLocaleString()}`
 const widgetData = [
 { label: 'Total Sales', value: String(stats.totalSales), bg: '#dbeafe', border: '#3b82f6', color: '#1e3a8a' },
 { label: 'Total Revenue', value: fmtPkr(stats.totalRevenue), bg: '#d1fae5', border: '#10b981', color: '#064e3b' },
 { label: 'Total Discount', value: fmtPkr(stats.totalDiscount), bg: '#fef3c7', border: '#f59e0b', color: '#78350f' },
 { label: 'Cash Sales', value: `${stats.cashCount} / ${fmtPkr(stats.cashAmount)}`, bg: '#cffafe', border: '#06b6d4', color: '#0e7490' },
 { label: 'Card / Online', value: `${stats.cardCount} / ${fmtPkr(stats.cardAmount)}`, bg: '#e9d5ff', border: '#9333ea', color: '#581c87' },
 { label: 'Personal', value: `${stats.personalCount} / ${fmtPkr(stats.personalAmount)}`, bg: '#fee2e2', border: '#f43f5e', color: '#881337' },
 { label: 'Dine-in', value: String(stats.dineInCount), bg: '#e0e7ff', border: '#6366f1', color: '#312e81' },
 { label: 'Take-away', value: String(stats.takeAwayCount), bg: '#ccfbf1', border: '#14b8a6', color: '#134e4a' },
 { label: 'Delivery', value: String(stats.deliveryCount), bg: '#ffedd5', border: '#f97316', color: '#7c2d12' },
 ]
 const widgetsHtml = widgetData.map(w => `<div style="background:${w.bg};border:2px solid ${w.border};border-radius:8px;padding:10px 14px;flex:1;min-width:180px"><div style="font-size:10px;font-weight:700;color:${w.color};text-transform:uppercase;letter-spacing:0.5px">${w.label}</div><div style="font-size:16px;font-weight:700;color:${w.color};margin-top:4px">${w.value}</div></div>`).join('')
 const rowsHtml = rows.map(r => `<tr><td>${r.date}</td><td>${r.billNo}</td><td>${r.customer}</td><td>${r.orderType}</td><td>${r.tableNo}</td><td>${r.waiterName}</td><td>${r.riderName}</td><td>PKR ${Number(r.saleTotal).toLocaleString()}</td><td>PKR ${Number(r.netAmount).toLocaleString()}</td><td>${r.paymentMethod}</td><td>${r.status}</td><td>${r.deliveryDate}</td></tr>`).join('')
 win.document.write(`<!doctype html><html><head><title>Sales History - Print</title><style>body{font-family:Arial,Helvetica,sans-serif;margin:16px} h3{margin:0 0 8px} .widgets{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 20px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ddd;padding:6px;font-size:12px} th{background:#f3f4f6} .gen{font-size:11px;color:#666;margin-bottom:4px}</style></head><body><h3>Sales History</h3><div class="gen">Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}${fromDate||toDate?` | Period: ${fromDate||'...'} to ${toDate||'...'}`:''}</div><div class="widgets">${widgetsHtml}</div><table><thead><tr><th>Date</th><th>Bill#</th><th>Customer</th><th>Order Type</th><th>Table</th><th>Waiter</th><th>Rider</th><th>Sale Total</th><th>Net Amount</th><th>Payment</th><th>Status</th><th>Delivery</th></tr></thead><tbody>${rowsHtml}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`)
 win.document.close()
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
 <div className="flex flex-row flex-nowrap items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-2 border-indigo-200 dark:border-indigo-800"><div className="flex gap-3 flex-shrink-0"><button onClick={exportPDF} className="px-4 py-2 rounded-lg bg-gradient-to-br from-red-500 to-red-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">PDF</button><button onClick={exportCSV} className="px-4 py-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">CSV</button><button onClick={bulkPrint} className="px-4 py-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">Bulk Print</button></div><div className="flex items-center gap-2 flex-shrink-0"><DatePicker label="From" value={fromDate} onChange={v => { setFromDate(v); setPage(1); }} /></div><div className="flex items-center gap-2 flex-shrink-0"><DatePicker label="To" value={toDate} onChange={v => { setToDate(v); setPage(1); }} /></div><div className="flex items-center gap-2 flex-shrink-0"><label className="text-sm font-medium text-indigo-700 dark:text-indigo-300 whitespace-nowrap">Mode</label><select value={paymentFilter} onChange={e => { setPaymentFilter(e.target.value); setPage(1); }} className="px-3 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all"><option value="">All Modes</option><option value="cash">Cash</option><option value="online">Online</option><option value="complimentary">Personal</option></select></div><div className="flex-1 min-w-0"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full px-4 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all" /></div></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"><div className="p-4 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/30 dark:to-gray-900 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Total Sales</div><div className="text-2xl font-bold mt-1 text-blue-900 dark:text-blue-100">{stats.totalSales}</div></div><div className="p-4 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/30 dark:to-gray-900 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Total Revenue</div><div className="text-2xl font-bold mt-1 text-emerald-900 dark:text-emerald-100">PKR {Math.round(stats.totalRevenue).toLocaleString()}</div></div><div className="p-4 rounded-xl border-2 border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-white dark:from-amber-900/30 dark:to-gray-900 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Total Discount</div><div className="text-2xl font-bold mt-1 text-amber-900 dark:text-amber-100">PKR {Math.round(stats.totalDiscount).toLocaleString()}</div></div><div className="p-4 rounded-xl border-2 border-cyan-200 dark:border-cyan-800 bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-900/30 dark:to-gray-900 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Cash Sales</div><div className="text-lg font-bold mt-1 text-cyan-900 dark:text-cyan-100">{stats.cashCount} <span className="text-sm font-normal">/ PKR {Math.round(stats.cashAmount).toLocaleString()}</span></div></div><div className="p-4 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/30 dark:to-gray-900 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">Card / Online</div><div className="text-lg font-bold mt-1 text-purple-900 dark:text-purple-100">{stats.cardCount} <span className="text-sm font-normal">/ PKR {Math.round(stats.cardAmount).toLocaleString()}</span></div></div><div className="p-4 rounded-xl border-2 border-rose-200 dark:border-rose-800 bg-gradient-to-br from-rose-50 to-white dark:from-rose-900/30 dark:to-gray-900 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">Personal</div><div className="text-lg font-bold mt-1 text-rose-900 dark:text-rose-100">{stats.personalCount} <span className="text-sm font-normal">/ PKR {Math.round(stats.personalAmount).toLocaleString()}</span></div></div><div className="p-4 rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-900/30 dark:to-gray-900 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Dine-in</div><div className="text-2xl font-bold mt-1 text-indigo-900 dark:text-indigo-100">{stats.dineInCount}</div></div><div className="p-4 rounded-xl border-2 border-teal-200 dark:border-teal-800 bg-gradient-to-br from-teal-50 to-white dark:from-teal-900/30 dark:to-gray-900 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Take-away</div><div className="text-2xl font-bold mt-1 text-teal-900 dark:text-teal-100">{stats.takeAwayCount}</div></div><div className="p-4 rounded-xl border-2 border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-white dark:from-orange-900/30 dark:to-gray-900 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">Delivery</div><div className="text-2xl font-bold mt-1 text-orange-900 dark:text-orange-100">{stats.deliveryCount}</div></div></div><div className="border-2 border-indigo-200 dark:border-indigo-800 rounded-xl overflow-x-auto shadow-sm"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"><tr><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Date</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Bill Number</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Customer</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Order Type</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Table</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Waiter</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Rider</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Sale Total</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Net Amount</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Payment Mode</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Status</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Delivery Date</th><th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th></tr></thead><tbody>
 {paginatedRows.map(r => (
 <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="p-3 text-gray-700 dark:text-gray-300">{r.date}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.billNo}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.customer}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.orderType}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.tableNo}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.waiterName}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.riderName}</td><td className="p-3 text-gray-700 dark:text-gray-300">PKR {Number(r.saleTotal).toLocaleString()}</td><td className="p-3 text-gray-700 dark:text-gray-300">PKR {Number(r.netAmount).toLocaleString()}</td><td className="p-3 text-gray-600 dark:text-gray-400">{r.paymentMethod}</td><td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${r.status === 'Returned' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>{r.status}</span></td><td className="p-3 text-gray-600 dark:text-gray-400">{r.deliveryDate}</td><td className="p-3 text-center"><div className="flex items-center justify-center gap-2"><button onClick={() => reprintSale(r)} className="px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600" title="Reprint Receipt">Print</button><button onClick={() => {
 if (closedDates.has(r.date)) return
 setDeleteTarget({ id: r.id, date: r.date, billNo: r.billNo })
 setDeleteKey('')
 setDeleteErr('')
 setDeleteOpen(true)
 }} disabled={closedDates.has(r.date)} className="px-2 py-1 text-xs rounded bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50">Delete</button></div></td></tr>
 ))}
 {!rows.length && (
 <tr><td colSpan={13} className="p-8 text-center text-gray-500 dark:text-gray-400"><div className="text-4xl mb-2"></div><div>No sales found</div></td></tr>
 )}
 </tbody></table></div>

 {/* Pagination controls */}
 <Pagination page={page} pages={pages} total={rows.length} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} />

 {drawerOpen && selected && (
 <><div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setDrawerOpen(false)} /><div className="fixed right-0 top-0 h-full w-full max-w-md z-50 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950 shadow-2xl flex flex-col border-l-4 border-indigo-500"><div className="p-4 border-b border-indigo-200 dark:border-indigo-800 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white dark:from-indigo-950/30 dark:to-gray-900"><div className="font-bold text-lg text-indigo-900 dark:text-indigo-100 flex items-center gap-2"><span></span> Bill {selected.billNo ? `BILL-${selected.billNo}` : ''}
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
