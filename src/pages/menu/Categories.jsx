import { useState, useEffect } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import Pagination from '../../components/Pagination.jsx'
import { Plus, X } from 'lucide-react'

export default function Categories() {
 const { state, dispatch } = useData()
 const { token } = useAuth()
 const { confirm, ConfirmDialog } = useConfirm()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const [form, setForm] = useState({ name: '', showOnPos: true, active: true, imageUrl: '', sortOrder: 0, discount: 0 })
 const [editingId, setEditingId] = useState(null)
 const [loading, setLoading] = useState(false)
 const [showDialog, setShowDialog] = useState(false)
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(20)
 const [jump, setJump] = useState(1)
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
 const pages = Math.ceil(items.length / limit) || 1
 const paginatedItems = items.slice((page - 1) * limit, page * limit)

 const reset = () => {
 setEditingId(null)
 setForm({ name: '', showOnPos: true, active: true, imageUrl: '', sortOrder: 0, discount: 0 })
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
 setForm({ name: '', showOnPos: true, active: true, imageUrl: '', sortOrder: 0, discount: 0 })
 setShowDialog(true)
 }

 const onSubmit = async (e) => {
 e.preventDefault()
 const payload = { ...form }
 if (!payload.name?.trim()) { toast.error('Name is required'); return }
 try {
 setLoading(true)
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 if (editingId) {
 dispatch({ type: 'UPDATE_CATEGORY', payload: { id: editingId, data: payload } })
 try {
 const res = await fetch(`${API}/api/categories/${editingId}`, { method: 'PATCH', headers, body: JSON.stringify(payload) })
 if (!res.ok) throw new Error('Failed to update')
 toast.success('Category updated')
 } catch {
 toast.error('Updated locally. Backend update failed.')
 }
 } else {
 const res = await fetch(`${API}/api/categories`, { method: 'POST', headers, body: JSON.stringify(payload) })
 if (res.ok) {
 const created = await res.json()
 dispatch({ type: 'ADD_CATEGORY', payload: { ...payload, id: created._id || created.id } })
 toast.success('Category added')
 } else {
 let detail = ''
 try {
 const data = await res.json()
 detail = data?.error || data?.message || ''
 } catch {}
 const prefix = `Backend create failed${detail ? `: ${detail}` : ''}`
 dispatch({ type: 'ADD_CATEGORY', payload })
 if (res.status === 401) {
 toast.error(`${prefix}. Missing or invalid token. Please sign in again.`)
 } else if (res.status === 403) {
 toast.error(`${prefix}. Requires Admin or Manager role.`)
 } else {
 toast.error(`Added locally. ${prefix}.`)
 }
 }
 }
 } catch {
 if (!editingId) dispatch({ type: 'ADD_CATEGORY', payload })
 toast.error('Network error. Change applied locally.')
 } finally {
 setLoading(false)
 reset()
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
 </h1><div className="flex items-center gap-2"><button onClick={onAdd} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95"><Plus size={18} /> Add Category</button><label className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">POS Tiles/row:</label><input
 type="number"
 min={1}
 max={12}
 value={categoryTilesPerRow}
 onChange={e => saveTilesPerRow(e.target.value)}
 className="w-16 px-2 py-1.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 dark:text-white text-sm text-center focus:ring-2 focus:ring-purple-500"
 /></div></div>

 {showDialog && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowDialog(false) }}><div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6"><div className="flex items-center justify-between mb-5"><h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{editingId ? 'Edit Category' : 'Add Category'}</h3><button onClick={() => setShowDialog(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={20} /></button></div>
 <form onSubmit={onSubmit} className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1.5">Name</label><input placeholder="Category Name" className="w-full px-4 py-2.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 transition-all" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} /></div><div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1.5">Sort Order</label><input type="number" placeholder="0" className="w-full px-4 py-2.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 transition-all" value={form.sortOrder} onChange={e=>setForm(v=>({...v,sortOrder:e.target.value}))} /></div><div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1.5">Discount (%)</label><input type="number" min="0" max="100" placeholder="0" className="w-full px-4 py-2.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 transition-all" value={form.discount} onChange={e=>setForm(v=>({...v,discount:e.target.value}))} /></div><div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1.5">Display on POS</label><label className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all w-full"><input type="checkbox" checked={!!form.showOnPos} onChange={e=>setForm(v=>({...v,showOnPos:e.target.checked}))} className="w-5 h-5 text-purple-500 rounded focus:ring-purple-500" /><span className="font-medium">Show on POS</span></label></div><div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1.5">Status</label><label className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all w-full"><input type="checkbox" checked={!!form.active} onChange={e=>setForm(v=>({...v,active:e.target.checked}))} className="w-5 h-5 text-purple-500 rounded focus:ring-purple-500" /><span className="font-medium">Active</span></label></div></div>
 <div><label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1.5">Image</label><div className="flex items-center gap-2"><div className="relative flex-1"><input type="file" accept="image/*" className="hidden" id="cat-image-upload" onChange={e => {
 const file = e.target.files?.[0]
 if (!file) return
 const reader = new FileReader()
 reader.onload = () => setForm(v => ({ ...v, imageUrl: String(reader.result) }))
 reader.readAsDataURL(file)
 }} /><label htmlFor="cat-image-upload" className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border-2 border-purple-200 dark:border-purple-700 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all cursor-pointer w-full justify-center">{form.imageUrl ? 'Change' : 'Add'}</label></div>
 {form.imageUrl && <button type="button" onClick={() => setForm(v => ({ ...v, imageUrl: '' }))} className="px-3 py-2.5 border-2 border-red-200 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">Remove</button>}
 </div></div>
 {form.imageUrl && (
 <div className="mt-2"><img src={form.imageUrl} alt="Category preview" className="h-20 w-auto rounded-lg border-2 border-purple-200 dark:border-purple-700 shadow-sm" /></div>
 )}
 <div className="flex gap-3 justify-end pt-2"><button type="button" onClick={() => setShowDialog(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button><button type="submit" disabled={loading} className="px-5 py-2.5 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">{editingId ? 'Update' : 'Add'}</button></div>
 </form></div></div>
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
 {!items.length && (
 <tr><td colSpan={7} className="p-8 text-center text-gray-500 dark:text-gray-400"><div className="text-4xl mb-2"></div><div>No categories found</div></td></tr>
 )}
 </tbody></table></div>

 {/* Pagination controls */}
 <Pagination page={page} pages={pages} total={items.length} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} loading={loading} />
 {items.length===0 && (
 <div className="p-8 text-center text-gray-500 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-900/50"><span className="text-5xl mb-2 block"></span><p>No categories found.</p></div>
 )}
 {ConfirmDialog}
 </div>
 )
}
