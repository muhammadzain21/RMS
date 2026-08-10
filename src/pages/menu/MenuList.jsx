import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useState, useEffect, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import Pagination from '../../components/Pagination.jsx'
import { Plus, X } from 'lucide-react'

export default function MenuList() {
 const { state, dispatch } = useData()
 const { token } = useAuth()
 const { confirm, ConfirmDialog } = useConfirm()
 const [form, setForm] = useState({
    name: '',
    category: '',
    price: 0,
    sortOrder: 0,
    active: true,
    imageUrl: '',
    discount: 0,
  })
 const [editingId, setEditingId] = useState(null)
 const [loading, setLoading] = useState(false)
 const [showDialog, setShowDialog] = useState(false)
 const [multiRows, setMultiRows] = useState([])
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(20)
 const [jump, setJump] = useState(1)
 const [search, setSearch] = useState('')
 const [itemTilesPerRow, setItemTilesPerRow] = useState(4)
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

 const items = state.menu || []
 const cats = (state.categories || [])
 .filter(c => c.active !== false)
 .sort((a,b)=> String(a.name||'').localeCompare(String(b.name||'')))

 const filteredItems = useMemo(() => {
 const q = search.trim().toLowerCase()
 if (!q) return items
 return items.filter(r =>
 String(r.name||'').toLowerCase().includes(q) ||
 String(r.category||'').toLowerCase().includes(q)
 )
 }, [items, search])

 const pages = Math.ceil(filteredItems.length / limit) || 1
 const paginatedItems = filteredItems.slice((page - 1) * limit, page * limit)

 const blankRow = () => ({ name:'', category:'', price:0, sortOrder:0, active:true, imageUrl:'', discount:0 })
 const reset = () => {
 setEditingId(null);
 setForm({ name:'', category:'', price:0, sortOrder:0, active:true, imageUrl:'', discount:0 })
 setMultiRows([])
 setShowDialog(false)
 }
 const onEdit = (row) => {
 setEditingId(row.id)
 setForm({
      name: row.name||'',
      category: row.category||'',
      price: Number(row.price||0),
      sortOrder: Number(row.sortOrder||0),
      active: row.active ?? true,
      imageUrl: row.imageUrl || '',
      discount: Number(row.discount||0),
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
 const payload = { ...form, price: Number(form.price||0), sortOrder: Number(form.sortOrder||0), imageUrl: form.imageUrl || '', discount: Number(form.discount||0) }
 if (!payload.name?.trim()) { toast.error('Name is required'); return }
 try {
 setLoading(true)
 dispatch({ type:'UPDATE_MENU', payload:{ id: editingId, data: payload } })
 try {
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const res = await fetch(`${API}/api/menu/${editingId}`, { method:'PATCH', headers, body: JSON.stringify(payload) })
 if (!res.ok) throw new Error('Failed to update')
 toast.success('Menu item updated')
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
 if (!validRows.length) { toast.error('At least one item name is required'); return }
 try {
 setLoading(true)
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 let ok = 0, fail = 0
 for (const row of validRows) {
 const payload = { ...row, price: Number(row.price||0), sortOrder: Number(row.sortOrder||0), imageUrl: row.imageUrl || '', discount: Number(row.discount||0) }
 try {
 const res = await fetch(`${API}/api/menu`, { method:'POST', headers, body: JSON.stringify(payload) })
 if (res.ok) {
 const created = await res.json()
 dispatch({ type:'ADD_MENU', payload: { ...payload, id: created._id || created.id } })
 ok++
 } else { fail++ }
 } catch { fail++ }
 }
 if (ok && !fail) toast.success(`${ok} menu item${ok>1?'s':''} added`)
 else if (ok && fail) toast.success(`${ok} added, ${fail} failed`)
 else toast.error('Failed to add items')
 } catch {
 toast.error('Network error.')
 } finally {
 setLoading(false)
 reset()
 }
 }
 }

 // Fetch menu + categories list on mount to ensure latest data
 useEffect(() => {
 const refresh = async () => {
 try {
 const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const [menuRes, catRes] = await Promise.all([
 fetch(`${API}/api/menu`, { headers }),
 fetch(`${API}/api/categories`, { headers }),
 ])
 const mapId = (x) => ({ ...x, id: x.id || x._id })
 if (menuRes.ok) {
 const menuRows = await menuRes.json()
 dispatch({ type: 'HYDRATE', payload: { menu: (menuRows||[]).map(mapId) } })
 }
 if (catRes.ok) {
 const catRows = await catRes.json()
 dispatch({ type: 'HYDRATE', payload: { categories: (catRows||[]).map(mapId) } })
 }
 // Load tiles per row setting
 const sres = await fetch(`${API}/api/settings`, { headers })
 if (sres.ok) {
 const s = await sres.json()
 setItemTilesPerRow(Number(s.posItemTilesPerRow || 4))
 }
 } catch {}
 }
 refresh()
 }, [])

 // Seed function removed per request

 const downloadBlob = (blob, filename) => {
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = filename
 document.body.appendChild(a)
 a.click()
 a.remove()
 URL.revokeObjectURL(url)
 }

 const onExport = async (format) => {
 try {
 setLoading(true)
 const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const res = await fetch(`${API}/api/menu/export?format=${format}`, { headers })
 if (!res.ok) throw new Error('Failed')
 const blob = await res.blob()
 downloadBlob(blob, `menu_export.${format === 'csv' ? 'csv' : 'json'}`)
 toast.success(`Exported ${format.toUpperCase()}`)
 } catch (e) {
 toast.error('Export failed')
 } finally {
 setLoading(false)
 }
 }

 const saveTilesPerRow = async (val) => {
 const n = Math.max(1, Math.min(12, Number(val) || 4))
 setItemTilesPerRow(n)
 try {
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const res = await fetch(`${API}/api/settings`, { method: 'PATCH', headers, body: JSON.stringify({ posItemTilesPerRow: n }) })
 if (res.ok) {
 const saved = await res.json()
 dispatch({ type: 'HYDRATE', payload: { settings: saved } })
 toast.success('Tiles per row updated')
 }
 } catch {
 toast.error('Failed to save tiles per row')
 }
 }

 const onDelete = async (id) => {
 const confirmed = await confirm({ title: 'Delete Menu Item', message: 'Delete this menu item?' })
 if (!confirmed) return
 dispatch({ type:'DELETE_MENU', payload:{ id } })
 try {
 setLoading(true)
 const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const res = await fetch(`${API}/api/menu/${id}`, { method:'DELETE', headers })
 if (!res.ok) throw new Error('Failed')
 toast.success('Menu item deleted')
 } catch {
 toast.error('Deleted locally. Backend delete failed.')
 } finally {
 setLoading(false)
 }
 }

 return (
 <div className="space-y-4 w-full"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2"><span className="text-3xl"></span> Menu
 </h1><div className="flex items-center gap-2"><button onClick={onAdd} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95"><Plus size={18} /> Add Menu Item</button><button type="button" disabled={loading} onClick={()=>onExport('csv')} className="px-4 py-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 text-sm disabled:opacity-50">Export CSV</button><label className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">POS Tiles/row:</label><input
 type="number"
 min={1}
 max={12}
 value={itemTilesPerRow}
 onChange={e => saveTilesPerRow(e.target.value)}
 className="w-16 px-2 py-1.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 dark:text-white text-sm text-center focus:ring-2 focus:ring-orange-500"
 /></div></div>

 <div className="flex items-center gap-3">
 <input value={search} onChange={e=>{ setSearch(e.target.value); setPage(1) }} placeholder="Search by item name or category..." className="w-full px-4 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 transition-all" />
 </div>

 {showDialog && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowDialog(false) }}><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto p-6"><div className="flex items-center justify-between mb-5"><h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{editingId ? 'Edit Menu Item' : 'Add Menu Items'}</h3><button onClick={() => setShowDialog(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={20} /></button></div>
 {editingId ? (
 <form onSubmit={onSubmit} className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1.5">Item Name</label><input placeholder="e.g. Zinger Burger" className="w-full px-4 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-orange-500 transition-all" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} /></div><div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1.5">Category</label><select className="w-full px-4 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-orange-500 transition-all" value={form.category} onChange={e=>setForm(v=>({...v,category:e.target.value}))}><option value="">Select category...</option>
 {cats.map(c => (
 <option key={c.id} value={c.name}>{c.name}</option>
 ))}
 </select></div><div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1.5">Price (PKR)</label><input type="number" placeholder="0" className="w-full px-4 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-orange-500 transition-all" value={form.price} onChange={e=>setForm(v=>({...v,price:e.target.value}))} /></div><div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1.5">Discount (%)</label><input type="number" min="0" max="100" placeholder="0" className="w-full px-4 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-orange-500 transition-all" value={form.discount} onChange={e=>setForm(v=>({...v,discount:e.target.value}))} /></div><div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1.5">Sort Order</label><input type="number" placeholder="0" className="w-full px-4 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-orange-500 transition-all" value={form.sortOrder} onChange={e=>setForm(v=>({...v,sortOrder:e.target.value}))} /></div><div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1.5">Status</label><label className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all w-full"><input type="checkbox" checked={!!form.active} onChange={e=>setForm(v=>({...v,active:e.target.checked}))} className="w-5 h-5 text-orange-500 rounded focus:ring-orange-500" /><span className="font-medium">Active</span></label></div><div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1.5">Image</label><div className="flex items-center gap-2"><div className="relative flex-1"><input type="file" accept="image/*" className="hidden" id="menu-image-upload" onChange={e => {
 const file = e.target.files?.[0]
 if (!file) return
 const reader = new FileReader()
 reader.onload = () => setForm(v => ({ ...v, imageUrl: String(reader.result) }))
 reader.readAsDataURL(file)
 }} /><label htmlFor="menu-image-upload" className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border-2 border-orange-200 dark:border-orange-700 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all cursor-pointer w-full justify-center">{form.imageUrl ? 'Change' : 'Add'}</label></div>
 {form.imageUrl && <button type="button" onClick={() => setForm(v => ({ ...v, imageUrl: '' }))} className="px-3 py-2.5 border-2 border-red-200 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">Remove</button>}
 </div></div></div>
 {form.imageUrl && (
 <div className="mt-2"><img src={form.imageUrl} alt="Menu item preview" className="h-20 w-auto rounded-lg border-2 border-orange-200 dark:border-orange-700 shadow-sm" /></div>
 )}
 <div className="flex gap-3 justify-end pt-2"><button type="button" onClick={() => setShowDialog(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button><button type="submit" disabled={loading} className="px-5 py-2.5 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">Update</button></div>
 </form>
 ) : (
 <form onSubmit={onSubmit} className="space-y-4">
 <div className="space-y-3">
 {multiRows.map((row, idx) => (
 <div key={idx} className="p-4 rounded-xl border-2 border-orange-200 dark:border-orange-700 bg-orange-50/30 dark:bg-orange-900/10 space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">Item {idx + 1}</span>
 {multiRows.length > 1 && (
 <button type="button" onClick={() => setMultiRows(multiRows.filter((_, i) => i !== idx))} className="p-1 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"><X size={16} /></button>
 )}
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Item Name</label><input placeholder="e.g. Zinger Burger" className="w-full px-3 py-2 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-orange-500 transition-all" value={row.name} onChange={e=>setMultiRows(multiRows.map((r,i)=> i===idx?{...r,name:e.target.value}:r))} /></div>
 <div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Category</label><select className="w-full px-3 py-2 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-orange-500 transition-all" value={row.category} onChange={e=>setMultiRows(multiRows.map((r,i)=> i===idx?{...r,category:e.target.value}:r))}><option value="">Select...</option>{cats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
 <div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Price (PKR)</label><input type="number" placeholder="0" className="w-full px-3 py-2 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-orange-500 transition-all" value={row.price} onChange={e=>setMultiRows(multiRows.map((r,i)=> i===idx?{...r,price:e.target.value}:r))} /></div>
 <div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Discount (%)</label><input type="number" min="0" max="100" placeholder="0" className="w-full px-3 py-2 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-orange-500 transition-all" value={row.discount} onChange={e=>setMultiRows(multiRows.map((r,i)=> i===idx?{...r,discount:e.target.value}:r))} /></div>
 <div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Sort Order</label><input type="number" placeholder="0" className="w-full px-3 py-2 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-orange-500 transition-all" value={row.sortOrder} onChange={e=>setMultiRows(multiRows.map((r,i)=> i===idx?{...r,sortOrder:e.target.value}:r))} /></div>
 <div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Active</label><label className="inline-flex items-center gap-2 px-3 py-2 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all w-full"><input type="checkbox" checked={!!row.active} onChange={e=>setMultiRows(multiRows.map((r,i)=> i===idx?{...r,active:e.target.checked}:r))} className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500" /><span className="text-sm font-medium">Active</span></label></div>
 </div>
 <div><label className="block text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Image</label><div className="flex items-center gap-2"><div className="relative flex-1"><input type="file" accept="image/*" className="hidden" id={`menu-image-${idx}`} onChange={e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setMultiRows(multiRows.map((r,i)=> i===idx?{...r,imageUrl:String(reader.result)}:r)); reader.readAsDataURL(file) }} /><label htmlFor={`menu-image-${idx}`} className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 border-2 border-orange-200 dark:border-orange-700 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all cursor-pointer text-sm">{row.imageUrl ? 'Change' : 'Add'}</label></div>{row.imageUrl && <button type="button" onClick={() => setMultiRows(multiRows.map((r,i)=> i===idx?{...r,imageUrl:''}:r))} className="px-2 py-2 border-2 border-red-200 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">Remove</button>}</div>{row.imageUrl && <div className="mt-1"><img src={row.imageUrl} alt="preview" className="h-16 w-auto rounded-lg border-2 border-orange-200 dark:border-orange-700" /></div>}</div>
 </div>
 ))}
 </div>
 <button type="button" onClick={() => setMultiRows([...multiRows, blankRow()])} className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 font-medium hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all w-full justify-center"><Plus size={18} /> Add Another Item</button>
 <div className="flex gap-3 justify-end pt-2"><button type="button" onClick={() => setShowDialog(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button><button type="submit" disabled={loading} className="px-5 py-2.5 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">Add All Items</button></div>
 </form>
 )}
 </div></div>
)}

 <div className="border-2 border-orange-200 dark:border-orange-800 rounded-xl overflow-x-auto shadow-sm"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"><tr><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Order</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Name</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Image</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Category</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Price</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Discount</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Active</th><th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th></tr></thead><tbody>
 {paginatedItems.map((r, idx) => (
 <tr key={r.id || idx} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="p-3 text-gray-600 dark:text-gray-400">{Number(r.sortOrder||0)}</td><td className="p-3 font-medium text-gray-900 dark:text-gray-100">{r.name}</td><td className="p-3">
 {r.imageUrl ? (
 <img src={r.imageUrl} alt={r.name} className="h-10 w-auto rounded border border-gray-200 dark:border-gray-600" />
 ) : (
 <span className="text-gray-400 text-xs">—</span>
 )}
 </td><td className="p-3 text-gray-600 dark:text-gray-400">{r.category}</td><td className="p-3 text-gray-700 dark:text-gray-300">PKR {Number(r.price||0).toLocaleString()}</td><td className="p-3">{Number(r.discount||0) > 0 ? <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200">{Number(r.discount)}%</span> : <span className="text-gray-400 text-xs">—</span>}</td><td className="p-3">{r.active ? <span className="text-green-600 dark:text-green-400">Yes</span> : <span className="text-gray-400">No</span>}</td><td className="p-3 text-center"><div className="flex items-center justify-center gap-2"><button disabled={loading} onClick={()=>onEdit(r)} className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-sky-400 to-sky-500 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">Edit</button><button disabled={loading} onClick={()=>onDelete(r.id)} className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-rose-400 to-rose-500 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">Delete</button></div></td></tr>
 ))}
 {!filteredItems.length && (
 <tr><td colSpan={8} className="p-8 text-center text-gray-500 dark:text-gray-400"><div className="text-4xl mb-2"></div><div>No menu items found</div></td></tr>
 )}
 </tbody></table></div>

 {/* Pagination controls */}
 <Pagination page={page} pages={pages} total={filteredItems.length} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} loading={loading} />
 {filteredItems.length===0 && (
 <div className="text-sm text-gray-600">No menu items found.</div>
 )}
 {ConfirmDialog}
 </div>
 )
}
