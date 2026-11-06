import { useState, useEffect, useMemo } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import Pagination from '../../components/Pagination.jsx'
import { Plus, X } from 'lucide-react'
import { format } from 'date-fns'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'
import { btnPrint, btnPdf, btnCsv, downloadCsvFile } from '../../utils/listReportExport.js'

export default function Categories() {
 const { state, dispatch } = useData()
 const { token } = useAuth()
 const { confirm, ConfirmDialog } = useConfirm()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const [form, setForm] = useState({ name: '', showOnPos: true, active: true, imageUrl: '', sortOrder: 0, discount: 0 })
 const [editingId, setEditingId] = useState(null)
 const [loading, setLoading] = useState(false)
 const [showDialog, setShowDialog] = useState(false)
 const [multiRows, setMultiRows] = useState([])
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
 const [jump, setJump] = useState(1)
 const [search, setSearch] = useState('')
 const [categoryTilesPerRow, setCategoryTilesPerRow] = useState(4)

 // Ensure fresh categories list on mount
 useEffect(() => {
 const refresh = async () => {
 try {
 const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const res = await fetch(`${API}/api/categories`, { headers })
 if (res.ok) {
 const rows = await res.json()
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 dispatch({ type: 'HYDRATE', payload: { categories: (rows||[]).map(mapId) } })
 }
 // Load tiles per row setting
 const sres = await fetch(`${API}/api/settings`, { headers })
 if (sres.ok) {
 const s = await sres.json()
 setCategoryTilesPerRow(Number(s.posCategoryTilesPerRow || 4))
 }
 } catch {}
 }
 refresh()
 }, [])
 const items = state.categories || []
 const filteredItems = useMemo(() => {
 const q = search.trim().toLowerCase()
 if (!q) return items
 return items.filter(r =>
 String(r.name||'').toLowerCase().includes(q)
 )
 }, [items, search])
 const pages = Math.ceil(filteredItems.length / limit) || 1
 const paginatedItems = filteredItems.slice((page - 1) * limit, page * limit)

 const blankRow = () => ({ name: '', showOnPos: true, active: true, imageUrl: '', sortOrder: 0, discount: 0 })
 const reset = () => {
 setEditingId(null)
 setForm({ name: '', showOnPos: true, active: true, imageUrl: '', sortOrder: 0, discount: 0 })
 setMultiRows([])
 setShowDialog(false)
 }
 const onEdit = (row) => {
 setEditingId(row.id)
 setForm({
 name: row.name || '',
 showOnPos: !!row.showOnPos,
 active: row.active !== false,
 imageUrl: row.imageUrl || '',
 sortOrder: Number(row.sortOrder || 0),
 discount: Number(row.discount || 0),
 })
 setShowDialog(true)
 }
 const onAdd = () => {
 setEditingId(null)
 setMultiRows([blankRow()])
 setShowDialog(true)
 }

 const onSubmit = async (e) => {
 e.preventDefault()
 if (editingId) {
 const payload = { ...form }
 if (!payload.name?.trim()) { toast.error('Name is required'); return }
 try {
 setLoading(true)
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 dispatch({ type: 'UPDATE_CATEGORY', payload: { id: editingId, data: payload } })
 try {
 const res = await fetch(`${API}/api/categories/${editingId}`, { method: 'PATCH', headers, body: JSON.stringify(payload) })
 if (!res.ok) throw new Error('Failed to update')
 toast.success('Category updated')
 } catch {
 toast.error('Updated locally. Backend update failed.')
 }
 } catch {
 toast.error('Network error. Change applied locally.')
 } finally {
 setLoading(false)
 reset()
 }
 } else {
 const validRows = multiRows.filter(r => r.name?.trim())
 if (!validRows.length) { toast.error('At least one category name is required'); return }
 try {
 setLoading(true)
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 let ok = 0, fail = 0
 for (const row of validRows) {
 const payload = { ...row }
 try {
 const res = await fetch(`${API}/api/categories`, { method: 'POST', headers, body: JSON.stringify(payload) })
 if (res.ok) {
 const created = await res.json()
 dispatch({ type: 'ADD_CATEGORY', payload: { ...payload, id: created._id || created.id } })
 ok++
 } else { fail++ }
 } catch { fail++ }
 }
 if (ok && !fail) toast.success(`${ok} categor${ok>1?'ies':'y'} added`)
 else if (ok && fail) toast.success(`${ok} added, ${fail} failed`)
 else toast.error('Failed to add categories')
 } catch {
 toast.error('Network error.')
 } finally {
 setLoading(false)
 reset()
 }
 }
 }

 const saveTilesPerRow = async (val) => {
 const n = Math.max(1, Math.min(12, Number(val) || 4))
 setCategoryTilesPerRow(n)
 try {
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const res = await fetch(`${API}/api/settings`, { method: 'PATCH', headers, body: JSON.stringify({ posCategoryTilesPerRow: n }) })
 if (res.ok) {
 const saved = await res.json()
 dispatch({ type: 'HYDRATE', payload: { settings: saved } })
 toast.success('Tiles per row updated')
 }
 } catch {
 toast.error('Failed to save tiles per row')
 }
 }

 const categoryReportRows = () => filteredItems.map(r => [
   Number(r.sortOrder || 0),
   r.name || '',
   r.showOnPos ? 'Yes' : 'No',
   r.active !== false ? 'Yes' : 'No',
   Number(r.discount || 0),
 ])

 const openPrintPreview = async () => {
 try {
 const body =
 reportSummary([{ label: 'Categories', amount: String(filteredItems.length) }]) +
 reportSec(`Categories (${filteredItems.length})`) +
 reportTable({
 headers: [{ t: 'Order', align: 'r' }, 'Name', 'Show on POS', 'Active', { t: 'Discount %', align: 'r' }],
 numbered: true,
 rows: filteredItems.map(r => [
 { v: Number(r.sortOrder || 0), align: 'r' },
 r.name,
 r.showOnPos ? 'Yes' : 'No',
 r.active !== false ? 'Yes' : 'No',
 { v: Number(r.discount || 0), align: 'r' },
 ]),
 emptyText: 'No categories match filters',
 })
 const html = wrapReportDoc({
 settings: state?.settings || {},
 title: 'Categories',
 reportLabel: 'Category Report',
 reportNo: `Rpt #: CAT-${format(new Date(), 'yyyy-MM-dd')}`,
 metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Search', search.trim() || 'All']],
 metaRight: [['Records', String(filteredItems.length)]],
 body,
 })
 await previewHtmlReport(html, `Categories-${format(new Date(), 'yyyy-MM-dd')}.pdf`)
 toast.success('Print preview opened')
 } catch (e) {
 console.error(e)
 toast.error('Print preview failed')
 }
 }

 const exportPDF = () => {
 try {
 const doc = new jsPDF('p', 'pt', 'a4')
 doc.setFontSize(14)
 doc.text(state?.settings?.companyName || 'Categories', 40, 32)
 doc.setFontSize(10)
 doc.text(`${filteredItems.length} categories`, 40, 46)
 doc.autoTable({
 head: [['Order', 'Name', 'Show on POS', 'Active', 'Discount %']],
 body: categoryReportRows(),
 startY: 54,
 styles: { fontSize: 8, cellPadding: 4 },
 headStyles: { fillColor: [147, 51, 234], textColor: 255, fontStyle: 'bold' },
 margin: { left: 40, right: 40 },
 })
 doc.save(`categories_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
 toast.success('PDF exported successfully')
 } catch (e) {
 console.error(e)
 toast.error('Failed to export PDF')
 }
 }

 const exportCSV = () => {
 try {
 downloadCsvFile(
 `categories_${format(new Date(), 'yyyy-MM-dd')}.csv`,
 ['Order', 'Name', 'Show on POS', 'Active', 'Discount %'],
 categoryReportRows()
 )
 toast.success('CSV exported successfully')
 } catch {
 toast.error('Failed to export CSV')
 }
 }

 const onDelete = async (id) => {
 const confirmed = await confirm({ title: 'Delete Category', message: 'Delete this category?' })
 if (!confirmed) return
 dispatch({ type: 'DELETE_CATEGORY', payload: { id } })
 try {
 setLoading(true)
 const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const res = await fetch(`${API}/api/categories/${id}`, { method: 'DELETE', headers })
 if (!res.ok) throw new Error('Failed')
 toast.success('Category deleted')
 } catch {
 toast.error('Deleted locally. Backend delete failed.')
 } finally {
 setLoading(false)
 }
 }

 return (
 <div className="space-y-4 w-full"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2"><span className="text-3xl"></span> Categories
 </h1><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button><button type="button" onClick={exportPDF} className={btnPdf}>PDF</button><button type="button" onClick={exportCSV} className={btnCsv}>CSV</button><button onClick={onAdd} className="ui-btn ui-btn-primary flex items-center gap-2"><Plus size={18} /> Add Category</button><label className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">POS Tiles/row:</label><input
 type="number"
 min={1}
 max={12}
 value={categoryTilesPerRow}
 onChange={e => saveTilesPerRow(e.target.value)}
 className="w-16 px-2 py-1.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 dark:text-white text-sm text-center focus:ring-2 focus:ring-purple-500"
 /></div></div>

 <div className="flex items-center gap-3">
 <input value={search} onChange={e=>{ setSearch(e.target.value); setPage(1) }} placeholder="Search by category name..." className="w-full px-4 py-2.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 transition-all" />
 </div>

 {showDialog && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowDialog(false) }}><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto p-6"><div className="flex items-center justify-between mb-5"><h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{editingId ? 'Edit Category' : 'Add Categories'}</h3><button onClick={() => setShowDialog(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={20} /></button></div>
 {editingId ? (
 <form onSubmit={onSubmit} className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1.5">Name</label><input placeholder="Category Name" className="w-full px-4 py-2.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 transition-all" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} /></div><div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1.5">Sort Order</label><input type="number" placeholder="0" className="w-full px-4 py-2.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 transition-all" value={form.sortOrder} onChange={e=>setForm(v=>({...v,sortOrder:e.target.value}))} /></div><div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1.5">Discount (%)</label><input type="number" min="0" max="100" placeholder="0" className="w-full px-4 py-2.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 transition-all" value={form.discount} onChange={e=>setForm(v=>({...v,discount:e.target.value}))} /></div><div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1.5">Display on POS</label><label className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all w-full"><input type="checkbox" checked={!!form.showOnPos} onChange={e=>setForm(v=>({...v,showOnPos:e.target.checked}))} className="w-5 h-5 text-purple-500 rounded focus:ring-purple-500" /><span className="font-medium">Show on POS</span></label></div><div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1.5">Active</label><label className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all w-full"><input type="checkbox" checked={!!form.active} onChange={e=>setForm(v=>({...v,active:e.target.checked}))} className="w-5 h-5 text-purple-500 rounded focus:ring-purple-500" /><span className="font-medium">Active</span></label></div>
 <div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1.5">Image</label><div className="flex items-center gap-2"><div className="relative flex-1"><input type="file" accept="image/*" className="hidden" id="cat-image-upload" onChange={e => {
 const file = e.target.files?.[0]
 if (!file) return
 const reader = new FileReader()
 reader.onload = () => setForm(v => ({ ...v, imageUrl: String(reader.result) }))
 reader.readAsDataURL(file)
 }} /><label htmlFor="cat-image-upload" className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border-2 border-purple-200 dark:border-purple-700 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all cursor-pointer w-full justify-center">{form.imageUrl ? 'Change' : 'Add'}</label></div>
 {form.imageUrl && <button type="button" onClick={() => setForm(v => ({ ...v, imageUrl: '' }))} className="px-3 py-2.5 border-2 border-red-200 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">Remove</button>}
 </div></div>
 </div>
 {form.imageUrl && (
 <div className="mt-2"><img src={form.imageUrl} alt="Category preview" className="h-20 w-auto rounded-lg border-2 border-purple-200 dark:border-purple-700 shadow-sm" /></div>
 )}
 <div className="flex gap-3 justify-end pt-2"><button type="button" onClick={() => setShowDialog(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button><button type="submit" disabled={loading} className="ui-btn ui-btn-primary disabled:opacity-50">Update</button></div>
 </form>
 ) : (
 <form onSubmit={onSubmit} className="space-y-4">
 <div className="space-y-3">
 {multiRows.map((row, idx) => (
 <div key={idx} className="p-4 rounded-xl border-2 border-purple-200 dark:border-purple-700 bg-purple-50/30 dark:bg-purple-900/10 space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">Category {idx + 1}</span>
 {multiRows.length > 1 && (
 <button type="button" onClick={() => setMultiRows(multiRows.filter((_, i) => i !== idx))} className="p-1 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"><X size={16} /></button>
 )}
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Name</label><input placeholder="Category Name" className="w-full px-3 py-2 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-purple-500 transition-all" value={row.name} onChange={e=>setMultiRows(multiRows.map((r,i)=> i===idx?{...r,name:e.target.value}:r))} /></div>
 <div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Sort Order</label><input type="number" placeholder="0" className="w-full px-3 py-2 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-purple-500 transition-all" value={row.sortOrder} onChange={e=>setMultiRows(multiRows.map((r,i)=> i===idx?{...r,sortOrder:e.target.value}:r))} /></div>
 <div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Discount (%)</label><input type="number" min="0" max="100" placeholder="0" className="w-full px-3 py-2 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-purple-500 transition-all" value={row.discount} onChange={e=>setMultiRows(multiRows.map((r,i)=> i===idx?{...r,discount:e.target.value}:r))} /></div>
 <div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Display on POS</label><label className="inline-flex items-center gap-2 px-3 py-2 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all w-full"><input type="checkbox" checked={!!row.showOnPos} onChange={e=>setMultiRows(multiRows.map((r,i)=> i===idx?{...r,showOnPos:e.target.checked}:r))} className="w-4 h-4 text-purple-500 rounded focus:ring-purple-500" /><span className="text-sm font-medium">Show on POS</span></label></div>
 <div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Active</label><label className="inline-flex items-center gap-2 px-3 py-2 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all w-full"><input type="checkbox" checked={!!row.active} onChange={e=>setMultiRows(multiRows.map((r,i)=> i===idx?{...r,active:e.target.checked}:r))} className="w-4 h-4 text-purple-500 rounded focus:ring-purple-500" /><span className="text-sm font-medium">Active</span></label></div>
 </div>
 <div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Image</label><div className="flex items-center gap-2"><div className="relative flex-1"><input type="file" accept="image/*" className="hidden" id={`cat-image-${idx}`} onChange={e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setMultiRows(multiRows.map((r,i)=> i===idx?{...r,imageUrl:String(reader.result)}:r)); reader.readAsDataURL(file) }} /><label htmlFor={`cat-image-${idx}`} className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 border-2 border-purple-200 dark:border-purple-700 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all cursor-pointer text-sm">{row.imageUrl ? 'Change' : 'Add'}</label></div>{row.imageUrl && <button type="button" onClick={() => setMultiRows(multiRows.map((r,i)=> i===idx?{...r,imageUrl:''}:r))} className="px-2 py-2 border-2 border-red-200 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">Remove</button>}</div>{row.imageUrl && <div className="mt-1"><img src={row.imageUrl} alt="preview" className="h-16 w-auto rounded-lg border-2 border-purple-200 dark:border-purple-700" /></div>}</div>
 </div>
 ))}
 </div>
 <button type="button" onClick={() => setMultiRows([...multiRows, blankRow()])} className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 font-medium hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all w-full justify-center"><Plus size={18} /> Add Another Category</button>
 <div className="flex gap-3 justify-end pt-2"><button type="button" onClick={() => setShowDialog(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button><button type="submit" disabled={loading} className="ui-btn ui-btn-primary disabled:opacity-50">Add All Categories</button></div>
 </form>
 )}
 </div></div>
)}

 <div className="border-2 border-purple-200 dark:border-purple-800 rounded-xl overflow-x-auto shadow-sm"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"><tr><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Order</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Name</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Image</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Display on POS</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Active</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Discount</th><th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th></tr></thead><tbody>
 {paginatedItems.map(r => (
 <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="p-3 text-gray-600 dark:text-gray-400">{Number(r.sortOrder||0)}</td><td className="p-3 font-medium text-gray-900 dark:text-gray-100">{r.name}</td><td className="p-3">
 {r.imageUrl ? (
 <img src={r.imageUrl} alt={r.name} className="h-10 w-auto rounded border border-gray-200 dark:border-gray-600" />
 ) : (
 <span className="text-gray-400 text-xs">—</span>
 )}
 </td><td className="p-3">{r.showOnPos ? <span className="text-green-600 dark:text-green-400"> Yes</span> : <span className="text-gray-400"> No</span>}</td><td className="p-3">{r.active ? <span className="text-green-600 dark:text-green-400">Yes</span> : <span className="text-gray-400">No</span>}</td><td className="p-3">{Number(r.discount||0) > 0 ? <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200">{Number(r.discount)}%</span> : <span className="text-gray-400 text-xs">—</span>}</td><td className="p-3 text-center"><div className="flex items-center justify-center gap-2"><button disabled={loading} onClick={()=>onEdit(r)} className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-sky-400 to-sky-500 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">Edit</button><button disabled={loading} onClick={()=>onDelete(r.id)} className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-rose-400 to-rose-500 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">Delete</button></div></td></tr>
 ))}
 {!filteredItems.length && (
 <tr><td colSpan={7} className="p-8 text-center text-gray-500 dark:text-gray-400"><div className="text-4xl mb-2"></div><div>No categories found</div></td></tr>
 )}
 </tbody></table></div>

 {/* Pagination controls */}
 <Pagination page={page} pages={pages} total={filteredItems.length} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} loading={loading} />
 {filteredItems.length===0 && (
 <div className="p-8 text-center text-gray-500 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-900/50"><span className="text-5xl mb-2 block"></span><p>No categories found.</p></div>
 )}
 {ConfirmDialog}
 </div>
 )
}
