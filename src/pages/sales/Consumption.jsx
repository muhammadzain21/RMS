import { useMemo, useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'
import DatePicker from '../../components/DatePicker.jsx'
import { previewHtmlReport, wrapReportDoc, reportSummary, reportSec, reportTable } from '../../utils/reportDoc'

export default function Consumption() {
 const { state, businessDate, dispatch } = useData()
 const { token, user } = useAuth()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const [fromDate, setFromDate] = useState(businessDate || new Date().toLocaleDateString('en-CA'))
 const [toDate, setToDate] = useState(businessDate || new Date().toLocaleDateString('en-CA'))
 const [closingSnapshot, setClosingSnapshot] = useState(null)
 const [openingSnapshot, setOpeningSnapshot] = useState(null)
 const [physicalMap, setPhysicalMap] = useState({})
 const [savingPhysical, setSavingPhysical] = useState(false)
 const [tab, setTab] = useState('items')

 const authHeaders = useMemo(() => ({ ...(token ? { Authorization: `Bearer ${token}` } : {}) }), [token])

 // Fetch inventory snapshots for the selected date range
 useEffect(() => {
   let cancelled = false
   const fetchSnapshots = async () => {
     try {
       const [closingRes, openingRes, physRes] = await Promise.all([
         fetch(`${API}/api/inventory-snapshots?date=${encodeURIComponent(toDate)}`, { headers: authHeaders, cache: 'no-store' }),
         fetch(`${API}/api/inventory-snapshots/opening?date=${encodeURIComponent(fromDate)}`, { headers: authHeaders, cache: 'no-store' }),
         fetch(`${API}/api/inventory-snapshots/physical?date=${encodeURIComponent(toDate)}`, { headers: authHeaders, cache: 'no-store' }),
       ])
       if (!cancelled) {
         if (closingRes.ok) setClosingSnapshot(await closingRes.json())
         if (openingRes.ok) setOpeningSnapshot(await openingRes.json())
         if (physRes.ok) { const p = await physRes.json().catch(() => null); setPhysicalMap(p?.counts || {}) }
       }
     } catch {}
   }
   fetchSnapshots()
   return () => { cancelled = true }
 }, [fromDate, toDate, API, authHeaders])

 // Sales for selected date range
 const sales = useMemo(() => (state.sales || []).filter(s => s.date >= fromDate && s.date <= toDate), [state.sales, fromDate, toDate])
 const menu = state.menu || []
 const ingredients = state.ingredients || []
 const modsConfig = state.settings?.modifiers || {}

 // Build maps for quick lookup
 const menuById = useMemo(() => new Map(menu.map(m => [m.id, m])), [menu])
 const ingByName = useMemo(() => new Map(ingredients.map(i => [i.name, i])), [ingredients])
 const norm = (s) => String(s||'').trim().toLowerCase().replace(/\s+/g, ' ')
 const ingByNormName = useMemo(() => new Map(ingredients.map(i => [norm(i.name), i])), [ingredients])
 const ingByNoSpace = useMemo(() => new Map(ingredients.map(i => [norm(i.name).replace(/\s+/g, ''), i])), [ingredients])
 const findIng = (name) => ingByName.get(name) || ingByNormName.get(norm(name)) || ingByNoSpace.get(norm(name).replace(/\s+/g, ''))

 // Build lookup maps from snapshots
 const openingStockMap = useMemo(() => {
   const m = new Map()
   if (openingSnapshot?.items) {
     openingSnapshot.items.forEach(it => m.set(it.name, Number(it.qty || 0)))
   }
   return m
 }, [openingSnapshot])

 const closingStockMap = useMemo(() => {
   const m = new Map()
   if (closingSnapshot?.items) {
     closingSnapshot.items.forEach(it => m.set(it.name, Number(it.qty || 0)))
   }
   return m
 }, [closingSnapshot])

 // Aggregate item counts and ingredient consumption
 const { itemCounts, customCounts, consumption } = useMemo(() => {
 const counts = new Map() // menu itemId -> qty sold
 const custom = new Map() // customKey (name|category) -> { name, category, qty }
 const cons = new Map() // ingName -> amount consumed

 sales.forEach(sale => {
 (sale.items || []).forEach(line => {
 const qty = Number(line.qty || 0)
 const item = menuById.get(line.itemId)
 // Some lines can be custom deal items/pizza temp etc. Skip if no mapped menu item or recipe
 if (item) {
 // Count item sales
 counts.set(item.id, (counts.get(item.id) || 0) + qty)

 // Base recipe
 const recipe = item.recipe || {}
 Object.entries(recipe).forEach(([ingName, amt]) => {
 const useAmt = Number(amt || 0) * qty
 cons.set(ingName, Number((cons.get(ingName) || 0) + useAmt))
 })

 // Modifiers recipe impacts
 const enabled = line.mods || {}
 Object.keys(enabled).forEach(key => {
 if (!enabled[key]) return
 const cfg = modsConfig[key]
 if (!cfg || !cfg.recipe) return
 Object.entries(cfg.recipe).forEach(([ingName, amt]) => {
 const useAmt = Number(amt || 0) * qty
 cons.set(ingName, Number((cons.get(ingName) || 0) + useAmt))
 })
 })
 } else {
 // No menu match – count by custom name/category so it appears in the Items Sold list
 const cname = (line.custom?.name || '').trim()
 if (cname) {
 const cat = line.custom?.category || ''
 const key = `${cname}||${cat}`
 const prev = custom.get(key) || { name: cname, category: cat, qty: 0 }
 prev.qty += qty
 custom.set(key, prev)
 }
 }
 })
 })

 return { itemCounts: counts, customCounts: custom, consumption: cons }
 }, [sales, menuById, modsConfig])

 const itemRows = useMemo(() => {
 const rows = []
 itemCounts.forEach((qty, itemId) => {
 const m = menuById.get(itemId)
 if (!m) return
 rows.push({ id: itemId, name: m.name || itemId, category: m.category || '', qty })
 })
 // Append custom counted lines (e.g., Midnight Deal parent, Pizza flavour temp items)
 customCounts?.forEach(entry => {
 const cat = entry.category || ''
 rows.push({ id: `custom-${entry.name}||${cat}`, name: entry.name, category: cat, qty: entry.qty })
 })
 rows.sort((a,b) => String(a.name).localeCompare(String(b.name)))
 return rows
 }, [itemCounts, customCounts, menuById])

 const consumptionRows = useMemo(() => {
 const rows = []
 consumption.forEach((amt, ingName) => {
 const inv = findIng(ingName)
 const displayName = inv?.name || ingName
 const unit = inv?.unit || ''
 // Use opening snapshot for opening stock; fall back to closing+consumed if no snapshot
 const snapOpening = openingStockMap.get(displayName) || openingStockMap.get(ingName)
 const closingQty = Number(inv?.qty || 0)
 const openingQty = snapOpening != null ? Number(snapOpening) : Number((closingQty + amt).toFixed(3))
 rows.push({ name: displayName, consumed: Number(amt.toFixed(3)), openingQty, closingQty, unit, price: Number(inv?.price || 0), consumedCost: Number((Number(amt || 0) * Number(inv?.price || 0)).toFixed(2)) })
 })
 // Include ingredients that had no consumption to help reconciliation
 const consumedNames = new Set(consumption.keys())
 ingredients.forEach(inv => {
 const matched = consumedNames.has(inv.name) || consumption.has(inv.name)
 if (!matched) {
 const qty = Number(inv.qty || 0)
 const snapOpening = openingStockMap.get(inv.name)
 const openingQty = snapOpening != null ? Number(snapOpening) : qty
 rows.push({ name: inv.name, consumed: 0, openingQty, closingQty: qty, unit: inv.unit || '', price: Number(inv.price || 0), consumedCost: 0 })
 }
 })
 rows.sort((a,b) => String(a.name).localeCompare(String(b.name)))
 return rows
 }, [consumption, ingByName, findIng, ingredients, openingStockMap])

 const totalItems = itemRows.reduce((a,b)=>a + Number(b.qty||0), 0)
 // Pagination state
 const [itemsPage, setItemsPage] = useState(1)
 const [itemsPageSize, setItemsPageSize] = useState(100)
 const [itemsJump, setItemsJump] = useState(1)
 const [consPage, setConsPage] = useState(1)
 const [consPageSize, setConsPageSize] = useState(100)
 const [consJump, setConsJump] = useState(1)
 // Item-wise filter
 const [itemFilter, setItemFilter] = useState('')
 const [applyFilterToConsumption, setApplyFilterToConsumption] = useState(true)

 // Manual refresh: reload ingredients and this date's sales from server
 const refreshData = async () => {
 try {
 const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 // Ingredients
 try {
 const ingRes = await fetch(`${API}/api/ingredients`, { headers, cache: 'no-store' })
 if (ingRes.ok) {
 const rows = await ingRes.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 dispatch({ type: 'HYDRATE', payload: { ingredients: (rows || []).map(mapId) } })
 }
 } catch {}
 // Sales for selected date only
 try {
 const sRes = await fetch(`${API}/api/sales?from=${fromDate}&to=${toDate}`, { headers, cache: 'no-store' })
 if (sRes.ok) {
 const list = await sRes.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 const fresh = (Array.isArray(list) ? list : []).map(mapId)
 const others = (Array.isArray(state.sales) ? state.sales : []).filter(s => s.date < fromDate || s.date > toDate)
 dispatch({ type: 'HYDRATE', payload: { sales: [...fresh, ...others] } })
 }
 } catch {}
 // Snapshots
 try {
   const [closingRes, openingRes, physRes] = await Promise.all([
     fetch(`${API}/api/inventory-snapshots?date=${encodeURIComponent(toDate)}`, { headers, cache: 'no-store' }),
     fetch(`${API}/api/inventory-snapshots/opening?date=${encodeURIComponent(fromDate)}`, { headers, cache: 'no-store' }),
     fetch(`${API}/api/inventory-snapshots/physical?date=${encodeURIComponent(toDate)}`, { headers, cache: 'no-store' }),
   ])
   if (closingRes.ok) setClosingSnapshot(await closingRes.json())
   if (openingRes.ok) setOpeningSnapshot(await openingRes.json())
   if (physRes.ok) { const p = await physRes.json().catch(() => null); setPhysicalMap(p?.counts || {}) }
 } catch {}
 } catch {}
 }

 // Reset pages when date changes
 const resetPagesKey = `${fromDate}-${toDate}-${itemRows.length}-${consumption.size}`
 useMemo(() => { setItemsPage(1); setConsPage(1) }, [resetPagesKey])

 const filteredItemRows = useMemo(() => {
 const q = itemFilter.trim().toLowerCase()
 if (!q) return itemRows
 return itemRows.filter(r => (
 String(r.name||'').toLowerCase().includes(q) ||
 String(r.category||'').toLowerCase().includes(q)
 ))
 }, [itemRows, itemFilter])

 const itemsTotalPages = Math.max(1, Math.ceil(filteredItemRows.length / itemsPageSize))
 const itemsStart = (itemsPage - 1) * itemsPageSize
 const pagedItems = filteredItemRows.slice(itemsStart, itemsStart + itemsPageSize)

 // When applying filter to consumption, recompute consumption only for matching items
 const filteredConsumptionRows = useMemo(() => {
 const q = itemFilter.trim().toLowerCase()
 if (!applyFilterToConsumption || !q) return consumptionRows
 // Aggregate consumption for just matching sales lines (by menu name or custom name)
 const cons = new Map()
 sales.forEach(sale => {
 (sale.items||[]).forEach(line => {
 const qty = Number(line.qty||0)
 const item = menuById.get(line.itemId)
 const name = item?.name || line.custom?.name || ''
 const category = item?.category || line.custom?.category || ''
 const match = String(name).toLowerCase().includes(q) || String(category).toLowerCase().includes(q)
 if (!match) return
 if (item) {
 const recipe = item.recipe || {}
 Object.entries(recipe).forEach(([ingName, amt]) => {
 const useAmt = Number(amt||0) * qty
 cons.set(ingName, Number((cons.get(ingName)||0) + useAmt))
 })
 const enabled = line.mods || {}
 Object.keys(enabled).forEach(key => {
 if (!enabled[key]) return
 const cfg = modsConfig[key]
 if (!cfg || !cfg.recipe) return
 Object.entries(cfg.recipe).forEach(([ingName, amt]) => {
 const useAmt = Number(amt||0) * qty
 cons.set(ingName, Number((cons.get(ingName)||0) + useAmt))
 })
 })
 }
 })
 })
 // Map to rows like original
 const rows = []
 cons.forEach((amt, ingName) => {
 const inv = findIng(ingName)
 const displayName = inv?.name || ingName
 const unit = inv?.unit || ''
 const closingQty = Number(inv?.qty || 0)
 const snapOpening = openingStockMap.get(displayName) || openingStockMap.get(ingName)
 const openingQty = snapOpening != null ? Number(snapOpening) : Number((closingQty + amt).toFixed(3))
 rows.push({ name: displayName, consumed: Number(amt.toFixed(3)), openingQty, closingQty, unit, price: Number(inv?.price || 0), consumedCost: Number((Number(amt || 0) * Number(inv?.price || 0)).toFixed(2)) })
 })
 rows.sort((a,b)=> String(a.name).localeCompare(String(b.name)))
 return rows
 }, [applyFilterToConsumption, itemFilter, sales, menuById, modsConfig, ingByName, findIng, openingStockMap])

 const consTotalPages = Math.max(1, Math.ceil(filteredConsumptionRows.length / consPageSize))
 const consStart = (consPage - 1) * consPageSize
 const pagedConsumption = filteredConsumptionRows.slice(consStart, consStart + consPageSize)

 // Sales revenue (same net-amount fallback logic as Sales History) for cost comparison
 const salesRevenue = useMemo(() => sales.reduce((sum, s) => {
 const direct = Number(s.total)
 if (direct && !Number.isNaN(direct)) return sum + direct
 const alt = Number(s.totalAmount || 0)
 if (alt && !Number.isNaN(alt)) return sum + alt
 const subtotal = (s.items || []).reduce((a, it) => a + Number(it.qty || 0) * Number((menuById.get(it.itemId)?.price ?? it?.custom?.price) || 0), 0)
 return sum + Math.max(0, subtotal - Number(s.itemsDiscount || 0) - Number(s.billDiscount || s.discount || 0) + Number(s.taxAmt || 0) + Number(s.serviceAmt || 0))
 }, 0), [sales, menuById])

 const totalConsumedCost = useMemo(() => filteredConsumptionRows.reduce((a, r) => a + Number(r.consumedCost || 0), 0), [filteredConsumptionRows])

 // Variance = physical count - system closing stock (null when not entered)
 const varianceOf = (r) => {
 const p = physicalMap[r.name]
 if (p === undefined || p === '') return null
 return Number((Number(p) - Number(r.closingQty || 0)).toFixed(3))
 }

 // Only rows with an entered physical count and a non-zero variance
 const varianceRows = useMemo(() => {
 return filteredConsumptionRows
 .map(r => ({ ...r, variance: varianceOf(r) }))
 .filter(r => r.variance !== null && Number(r.variance) !== 0)
 .sort((a, b) => Math.abs(Number(b.variance)) - Math.abs(Number(a.variance)))
 }, [filteredConsumptionRows, physicalMap])

 const varianceShortageCount = useMemo(
 () => varianceRows.filter(r => Number(r.variance) < 0).length,
 [varianceRows]
 )
 const varianceOverCount = useMemo(
 () => varianceRows.filter(r => Number(r.variance) > 0).length,
 [varianceRows]
 )

 const varTotalPages = Math.max(1, Math.ceil(varianceRows.length / consPageSize))
 const varStart = (consPage - 1) * consPageSize
 const pagedVariance = (tab === 'variance' ? varianceRows : []).slice(varStart, varStart + consPageSize)

 const savePhysical = async () => {
 try {
 setSavingPhysical(true)
 const res = await fetch(`${API}/api/inventory-snapshots/physical`, {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json', ...authHeaders },
 body: JSON.stringify({ date: toDate, counts: physicalMap })
 })
 if (!res.ok) throw new Error('save failed')
 toast.success('Physical counts saved')
 } catch {
 toast.error('Failed to save physical counts')
 } finally {
 setSavingPhysical(false)
 }
 }

 // A4 print preview: branded letterhead report via the shared report-doc util
 const openPrintPreview = async () => {
 try {
 const money = (n) => 'Rs ' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
 const gross = salesRevenue - totalConsumedCost
 const body =
 reportSummary([
 { label: 'Items Sold (qty)', amount: String(filteredItemRows.reduce((a, x) => a + Number(x.qty || 0), 0)) },
 { label: 'Sales Revenue', amount: money(salesRevenue) },
 { label: 'Consumed Cost (purchase value)', amount: money(totalConsumedCost) },
 { label: 'Gross Margin (Revenue - Cost)', amount: money(gross), cls: gross < 0 ? 'neg' : 'pos' },
 ]) +
 reportSec(`Items Sold (${filteredItemRows.length})`) +
 reportTable({
 headers: ['Name', 'Category', { t: 'Qty', align: 'r' }],
 numbered: true,
 rows: filteredItemRows.map(r => [r.name, r.category || '-', { v: r.qty, align: 'r' }]),
 emptyText: 'No items sold',
 }) +
 reportSec(`Ingredient Consumption vs Inventory (${filteredConsumptionRows.length})`) +
 reportTable({
 headers: ['Ingredient', 'Unit', { t: 'Consumed', align: 'r' }, { t: 'Opening', align: 'r' }, { t: 'Closing', align: 'r' }, { t: 'Price', align: 'r' }, { t: 'Cost', align: 'r' }, { t: 'Physical', align: 'r' }, { t: 'Var', align: 'r' }],
 numbered: true,
 rows: filteredConsumptionRows.map(r => {
 const v = varianceOf(r)
 const p = physicalMap[r.name]
 return [
 r.name, r.unit || '',
 { v: r.consumed, align: 'r' },
 { v: r.openingQty, align: 'r' },
 { v: r.closingQty, align: 'r' },
 { v: Number(r.price || 0).toLocaleString(), align: 'r' },
 { v: Number(r.consumedCost || 0).toLocaleString(), align: 'r' },
 { v: p === undefined || p === '' ? '' : p, align: 'r' },
 { v: v === null ? '' : (v > 0 ? '+' : '') + v, align: 'r', cls: v === null ? '' : v < 0 ? 'neg' : 'pos' },
 ]
 }),
 emptyText: 'No consumption',
 })
 const company = state?.settings?.companyName || 'Restaurant POS'
 const html = wrapReportDoc({
 settings: state?.settings || {},
 title: 'Daily Sales & Consumption',
 reportLabel: 'Consumption Report',
 reportNo: `Rpt #: C-${fromDate}`,
 metaLeft: [
 ['Period:', `${fromDate} to ${toDate}`, true],
 ['Generated:', new Date().toLocaleString()],
 ['Prepared by:', user?.name || user?.username || 'admin'],
 ],
 metaRight: [
 ['Items:', `${filteredItemRows.length} items`, true],
 ['Ingredients:', `${filteredConsumptionRows.length}`, true],
 ['Status:', 'FINAL'],
 ],
 body,
 footNote: `Variance = Physical Stock - Closing Stock (negative = shortage). Consumed Cost = Consumed x Purchase Price per unit. ${company} - ${fromDate} to ${toDate}`,
 })
 await previewHtmlReport(html, `Consumption-Report-${fromDate}.pdf`)
 } catch {
 toast.error('Print preview failed')
 }
 }

 // Export: CSV (includes Items Sold and Ingredient Consumption sections)
 const exportCSV = () => {
 try {
 const lines = []
 lines.push(`Date Range,${fromDate} to ${toDate}`)
 // Items Sold
 lines.push('Items Sold,,,')
 lines.push('Name,Category,Qty,')
 for (const r of filteredItemRows) {
 lines.push([r.name, r.category||'', r.qty].map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(','))
 }
 lines.push('')
 // Consumption
 lines.push('Ingredient Consumption vs Inventory,,,,,,,,,')
 lines.push('Ingredient,Unit,Consumed,Opening Stock,Closing Stock,Purchase Price,Consumed Cost,Physical Stock,Variance')
 for (const r of filteredConsumptionRows) {
 const v = varianceOf(r)
 lines.push([r.name, r.unit||'', r.consumed, r.openingQty, r.closingQty, r.price||0, r.consumedCost||0, physicalMap[r.name] ?? '', v === null ? '' : v].map(vv=>`"${String(vv??'').replaceAll('"','""')}"`).join(','))
 }
 lines.push('')
 lines.push(`Total Consumed Cost,PKR ${Math.round(totalConsumedCost)}`)
 lines.push(`Sales Revenue,PKR ${Math.round(salesRevenue)}`)
 const csv = lines.join('\n')
 const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = `consumption_${fromDate}_to_${toDate}.csv`
 a.click()
 URL.revokeObjectURL(url)
 toast.success('CSV exported successfully')
 } catch {
 toast.error('Export failed')
 }
 }

 // Export: PDF using jsPDF + autotable
 const exportPDF = () => {
 try {
 const doc = new jsPDF()
 doc.setFontSize(16)
 doc.text(`Daily Sales & Consumption - ${fromDate} to ${toDate}`, 14, 14)
 doc.setFontSize(10)
 doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 20)
 // Items Sold table
 doc.autoTable({
 head: [['Name','Category','Qty']],
 body: filteredItemRows.map(r => [r.name, r.category||'', r.qty]),
 startY: 24,
 styles: { fontSize: 9 },
 headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' }
 })
 // Consumption table
 const y = doc.lastAutoTable.finalY + 8
 doc.text('Ingredient Consumption vs Inventory', 14, y)
 doc.autoTable({
 head: [['Ingredient','Unit','Consumed','Opening','Closing','Price','Cost','Physical','Var']],
 body: filteredConsumptionRows.map(r => [r.name, r.unit||'', r.consumed, r.openingQty, r.closingQty, r.price||0, r.consumedCost||0, physicalMap[r.name] ?? '', varianceOf(r) ?? '']),
 startY: y + 4,
 styles: { fontSize: 9 },
 headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' }
 })
 doc.save(`consumption_${fromDate}_to_${toDate}.pdf`)
 toast.success('PDF exported successfully')
 } catch {
 toast.error('Export failed')
 }
 }

 return (
 <div className="space-y-5">
<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
<div>
<h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 bg-clip-text text-transparent">Daily Sales & Consumption</h1>
<p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Items sold, ingredient usage and stock reconciliation for the selected period</p>
</div>
<span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">{fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`}</span>
</div>
<div className="p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
<div className="flex flex-wrap items-end gap-3">
<div className="flex-shrink-0"><DatePicker label="From" value={fromDate} onChange={v=>setFromDate(v)} /></div>
<div className="flex-shrink-0"><DatePicker label="To" value={toDate} onChange={v=>setToDate(v)} /></div>
<div className="flex-1 min-w-[200px]"><label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Filter by item (name or category)</label><input value={itemFilter} onChange={e=>{ setItemFilter(e.target.value); setItemsPage(1); setConsPage(1) }} placeholder="e.g., Pizza, Midnight Deal, Zinger" className="mt-1 w-full px-3 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all" /></div>
<div className="flex flex-wrap gap-2 ml-auto">
<button onClick={refreshData} className="px-4 py-2 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 text-white text-sm font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">Refresh</button>
<button onClick={openPrintPreview} className="px-4 py-2 rounded-lg bg-gradient-to-br from-sky-500 to-sky-600 text-white text-sm font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">Print</button>
<button onClick={exportCSV} className="px-4 py-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-sm font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">CSV</button>
<button onClick={exportPDF} className="px-4 py-2 rounded-lg bg-gradient-to-br from-red-500 to-red-600 text-white text-sm font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">PDF</button>
</div>
</div>
</div>
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3"><Stat title="Sales Count (lines)" value={sales.reduce((a,b)=>a + (b.items?.length||0), 0)} icon="" variant="blue" /><Stat title="Items Sold (qty)" value={totalItems} icon="" variant="emerald" /><Stat title="Unique Items Sold" value={itemRows.length} icon="" variant="purple" /><Stat title="Sales Revenue" value={'PKR ' + Math.round(salesRevenue).toLocaleString()} icon="" variant="emerald" /><Stat title="Consumed Cost" value={'PKR ' + Math.round(totalConsumedCost).toLocaleString()} icon="" variant="blue" /></div>
<div className="flex flex-wrap gap-2">
<button onClick={() => { setTab('items'); setItemsPage(1) }} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === 'items' ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>Items Sold <span className={`ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${tab === 'items' ? 'bg-white/25 text-white' : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'}`}>{filteredItemRows.length}</span></button>
<button onClick={() => { setTab('cons'); setConsPage(1) }} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === 'cons' ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>Ingredient Consumption vs Inventory <span className={`ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${tab === 'cons' ? 'bg-white/25 text-white' : 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'}`}>{filteredConsumptionRows.length}</span></button>
<button onClick={() => { setTab('variance'); setConsPage(1) }} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === 'variance' ? 'bg-gradient-to-br from-rose-500 to-orange-600 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>Variance <span className={`ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${tab === 'variance' ? 'bg-white/25 text-white' : varianceRows.length ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{varianceRows.length}</span></button>
</div>
{tab === 'items' && (
<section className="space-y-3">
<div className="flex items-center gap-2 px-1">
<span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500"></span>
<h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Items Sold</h2>
<span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold">{filteredItemRows.length} items · {filteredItemRows.reduce((a,r)=>a+Number(r.qty||0),0)} qty</span>
</div>
<div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm bg-white dark:bg-gray-900"><table className="min-w-full text-sm"><thead><tr className="bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-gray-800 dark:to-gray-900 border-b-2 border-indigo-100 dark:border-gray-700"><th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Name</th><th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Category</th><th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Qty</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">
 {pagedItems.map((r, idx) => (
 <tr key={r.id || `item-${idx}`} className="odd:bg-white even:bg-gray-50/60 dark:odd:bg-gray-900 dark:even:bg-gray-800/40 hover:bg-indigo-50/60 dark:hover:bg-indigo-900/20 transition-colors"><td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">{r.name}</td><td className="px-4 py-2.5"><span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
 {r.category || '-'}
 </span></td><td className="px-4 py-2.5 text-right"><span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{r.qty}</span></td></tr>
 ))}
 {pagedItems.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">No items sold in this period</td></tr>}
 </tbody></table></div></section>
)}
{tab === 'cons' && (
<section className="space-y-3">
<div className="flex flex-wrap items-center gap-2 px-1">
<span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-violet-500 to-purple-500"></span>
<h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Ingredient Consumption vs Inventory</h2>
<span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-semibold">{filteredConsumptionRows.length} ingredients</span>
<span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold">Cost PKR {Math.round(totalConsumedCost).toLocaleString()}</span>
</div>
<div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm bg-white dark:bg-gray-900"><table className="min-w-full text-sm"><thead><tr className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-gray-800 dark:to-gray-900 border-b-2 border-violet-100 dark:border-gray-700"><th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider text-violet-700 dark:text-violet-300">Ingredient</th><th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider text-violet-700 dark:text-violet-300">Unit</th><th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider text-rose-600 dark:text-rose-400">Consumed</th><th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider text-violet-700 dark:text-violet-300">Opening</th><th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider text-violet-700 dark:text-violet-300">Closing</th><th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider text-violet-700 dark:text-violet-300">Price</th><th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400">Cost</th><th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider text-sky-600 dark:text-sky-400">Physical</th><th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider text-violet-700 dark:text-violet-300">Variance</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">
 {pagedConsumption.map((r, idx) => (
 <tr key={`${r.name}-${idx}`} className="odd:bg-white even:bg-gray-50/60 dark:odd:bg-gray-900 dark:even:bg-gray-800/40 hover:bg-violet-50/60 dark:hover:bg-violet-900/20 transition-colors"><td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">{r.name}</td><td className="px-4 py-2.5">{r.unit ? <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">{r.unit}</span> : <span className="text-gray-300 dark:text-gray-600">-</span>}</td><td className="px-4 py-2.5 text-right font-semibold text-rose-600 dark:text-rose-400">{r.consumed}</td><td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">{r.openingQty}</td><td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-gray-100">{r.closingQty}</td><td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-400">{Number(r.price || 0).toLocaleString()}</td><td className="px-4 py-2.5 text-right font-semibold text-amber-600 dark:text-amber-400">{Number(r.consumedCost || 0).toLocaleString()}</td><td className="px-4 py-2.5 text-right"><input type="number" step="any" inputMode="decimal" value={physicalMap[r.name] ?? ''} onChange={e=>setPhysicalMap(prev=>({ ...prev, [r.name]: e.target.value }))} placeholder="-" className="w-24 px-2 py-1 border border-sky-300 dark:border-sky-700 rounded-lg bg-white dark:bg-gray-800 text-right text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-400 outline-none" /></td><td className="px-4 py-2.5 text-right">{varianceOf(r) === null ? <span className="text-gray-300 dark:text-gray-600">-</span> : <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${varianceOf(r) < 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>{varianceOf(r) > 0 ? '+' : ''}{varianceOf(r)}</span>}</td></tr>
 ))}
 {pagedConsumption.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">No consumption data for this period</td></tr>}
 </tbody></table></div>
<div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-xl shadow-sm">
<div className="flex flex-wrap items-center gap-3 text-sm">
<span className="px-3 py-1.5 rounded-lg bg-white/70 dark:bg-gray-900/60 border border-amber-200 dark:border-amber-800 font-medium text-gray-700 dark:text-gray-200">Total Consumed Cost: <b className="text-amber-700 dark:text-amber-300">PKR {Math.round(totalConsumedCost).toLocaleString()}</b></span>
<span className="px-3 py-1.5 rounded-lg bg-white/70 dark:bg-gray-900/60 border border-emerald-200 dark:border-emerald-800 font-medium text-gray-700 dark:text-gray-200">Sales Revenue: <b className="text-emerald-700 dark:text-emerald-300">PKR {Math.round(salesRevenue).toLocaleString()}</b></span>
</div>
<button onClick={savePhysical} disabled={savingPhysical} className="px-4 py-2 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 text-white text-sm font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-60">{savingPhysical ? 'Saving...' : 'Save Physical Counts'}</button>
</div>
<p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
 Note: Consumption is computed from menu item recipes and applied modifiers for the selected date. Closing Stock is the current live inventory. Opening Stock = Closing Stock + Consumed. Variance = Physical Stock - Closing Stock (red = shortage). Consumed Cost = Consumed x Purchase Price per unit.
 </p></section>
)}
{tab === 'variance' && (
<section className="space-y-3">
<div className="flex flex-wrap items-center gap-2 px-1">
<span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-rose-500 to-orange-500"></span>
<h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Variance (Physical ≠ Closing)</h2>
<span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 font-semibold">{varianceRows.length} with variance</span>
{varianceShortageCount > 0 && (
<span className="text-xs px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-semibold">{varianceShortageCount} short</span>
)}
{varianceOverCount > 0 && (
<span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold">{varianceOverCount} over</span>
)}
</div>
<p className="text-xs text-gray-500 dark:text-gray-400 px-1">Shows only ingredients where physical stock was entered and differs from closing stock. Sorted by largest absolute variance first.</p>
<div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm bg-white dark:bg-gray-900"><table className="min-w-full text-sm"><thead><tr className="bg-gradient-to-r from-rose-50 to-orange-50 dark:from-gray-800 dark:to-gray-900 border-b-2 border-rose-100 dark:border-gray-700"><th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider text-rose-700 dark:text-rose-300">Ingredient</th><th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider text-rose-700 dark:text-rose-300">Unit</th><th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider text-rose-600 dark:text-rose-400">Consumed</th><th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider text-rose-700 dark:text-rose-300">Opening</th><th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider text-rose-700 dark:text-rose-300">Closing</th><th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider text-sky-600 dark:text-sky-400">Physical</th><th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider text-rose-700 dark:text-rose-300">Variance</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">
 {pagedVariance.map((r, idx) => (
 <tr key={`var-${r.name}-${idx}`} className="odd:bg-white even:bg-gray-50/60 dark:odd:bg-gray-900 dark:even:bg-gray-800/40 hover:bg-rose-50/60 dark:hover:bg-rose-900/20 transition-colors">
 <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">{r.name}</td>
 <td className="px-4 py-2.5">{r.unit ? <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">{r.unit}</span> : <span className="text-gray-300 dark:text-gray-600">-</span>}</td>
 <td className="px-4 py-2.5 text-right font-semibold text-rose-600 dark:text-rose-400">{r.consumed}</td>
 <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">{r.openingQty}</td>
 <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-gray-100">{r.closingQty}</td>
 <td className="px-4 py-2.5 text-right"><input type="number" step="any" inputMode="decimal" value={physicalMap[r.name] ?? ''} onChange={e=>{ setPhysicalMap(prev=>({ ...prev, [r.name]: e.target.value })); setConsPage(1) }} placeholder="-" className="w-24 px-2 py-1 border border-sky-300 dark:border-sky-700 rounded-lg bg-white dark:bg-gray-800 text-right text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-400 outline-none" /></td>
 <td className="px-4 py-2.5 text-right"><span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${Number(r.variance) < 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>{Number(r.variance) > 0 ? '+' : ''}{r.variance}</span></td>
 </tr>
 ))}
 {pagedVariance.length === 0 && (
 <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">No variance yet — enter physical counts on the Consumption tab, then return here</td></tr>
 )}
</tbody></table></div>
{varTotalPages > 1 && (
 <div className="flex items-center justify-end gap-2 text-sm">
 <button type="button" disabled={consPage <= 1} onClick={() => setConsPage(p => Math.max(1, p - 1))} className="px-3 py-1.5 rounded-lg border disabled:opacity-40">Prev</button>
 <span className="text-gray-500">Page {Math.min(consPage, varTotalPages)} / {varTotalPages}</span>
 <button type="button" disabled={consPage >= varTotalPages} onClick={() => setConsPage(p => Math.min(varTotalPages, p + 1))} className="px-3 py-1.5 rounded-lg border disabled:opacity-40">Next</button>
 </div>
)}
<div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-rose-50 to-orange-50 dark:from-rose-900/20 dark:to-orange-900/20 border border-rose-200 dark:border-rose-800 rounded-xl shadow-sm">
<span className="text-sm text-gray-700 dark:text-gray-200">Variance = Physical − Closing (red = shortage, green = over)</span>
<button onClick={savePhysical} disabled={savingPhysical} className="px-4 py-2 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 text-white text-sm font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-60">{savingPhysical ? 'Saving...' : 'Save Physical Counts'}</button>
</div>
</section>
)}
</div>
 )
}

function Stat({ title, value, icon = '', variant = 'slate' }) {
 const variants = {
 blue: { bg: 'bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-gray-900 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-100', iconBg: 'bg-blue-600/20 text-blue-700 dark:text-blue-300' },
 emerald: { bg: 'bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-gray-900 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100', iconBg: 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-300' },
 purple: { bg: 'bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/40 dark:to-gray-900 border-purple-300 dark:border-purple-800 text-purple-900 dark:text-purple-100', iconBg: 'bg-purple-600/20 text-purple-700 dark:text-purple-300' },
 slate: { bg: 'bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-900/50 dark:to-gray-950 border-gray-300 dark:border-gray-700', iconBg: 'bg-gray-600/20 text-gray-700 dark:text-gray-300' },
 }
 const v = variants[variant] || variants.slate
 return (
 <div className={`p-4 rounded-xl border-2 shadow-sm ${v.bg}`}><div className="flex items-center justify-between"><div><div className="text-xs font-semibold uppercase tracking-wide opacity-70">{title}</div><div className="text-2xl font-bold mt-1">{value}</div></div><div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${v.iconBg}`}>
 {icon}
 </div></div></div>
 )
}
