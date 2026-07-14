import { useState, useEffect } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'

export default function Categories() {
  const { state, dispatch } = useData()
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const [form, setForm] = useState({ name: '', showOnPos: true, active: true, imageUrl: '', sortOrder: 0 })
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [jump, setJump] = useState(1)

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
      } catch {}
    }
    refresh()
  }, [])
  const items = state.categories || []
  const pages = Math.ceil(items.length / limit) || 1
  const paginatedItems = items.slice((page - 1) * limit, page * limit)

  const reset = () => {
    setEditingId(null)
    setForm({ name: '', showOnPos: true, active: true, imageUrl: '', sortOrder: 0 })
  }
  const onEdit = (row) => {
    setEditingId(row.id)
    setForm({
      name: row.name || '',
      showOnPos: !!row.showOnPos,
      active: row.active !== false,
      imageUrl: row.imageUrl || '',
      sortOrder: Number(row.sortOrder || 0),
    })
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
    <div className="space-y-4 w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="text-3xl">📂</span> Categories
        </h1>
      </div>

      <form onSubmit={onSubmit} className="p-5 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50/60 to-white dark:from-purple-950/30 dark:to-gray-900 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">📛 Name</label>
            <input placeholder="Category Name" className="w-full px-4 py-2.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 transition-all" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">📱 Display on POS</label>
            <label className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all h-[46px] w-full">
              <input type="checkbox" checked={!!form.showOnPos} onChange={e=>setForm(v=>({...v,showOnPos:e.target.checked}))} className="w-5 h-5 text-purple-500 rounded focus:ring-purple-500" />
              <span className="font-medium">Show on POS</span>
            </label>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">✅ Status</label>
            <label className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all h-[46px] w-full">
              <input type="checkbox" checked={!!form.active} onChange={e=>setForm(v=>({...v,active:e.target.checked}))} className="w-5 h-5 text-purple-500 rounded focus:ring-purple-500" />
              <span className="font-medium">Active</span>
            </label>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">#️⃣ Sort Order</label>
            <input type="number" placeholder="0" className="w-full px-4 py-2.5 border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 transition-all" value={form.sortOrder} onChange={e=>setForm(v=>({...v,sortOrder:e.target.value}))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">📷 Image</label>
            <div className="flex items-center gap-2 h-[46px]">
              <div className="relative flex-1">
                <input type="file" accept="image/*" className="hidden" id="cat-image-upload" onChange={e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => setForm(v => ({ ...v, imageUrl: String(reader.result) }))
                  reader.readAsDataURL(file)
                }} />
                <label htmlFor="cat-image-upload" className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border-2 border-purple-200 dark:border-purple-700 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all cursor-pointer w-full justify-center">
                  <span>📷</span> {form.imageUrl ? 'Change' : 'Add'}
                </label>
              </div>
              {form.imageUrl && <button type="button" onClick={() => setForm(v => ({ ...v, imageUrl: '' }))} className="px-3 py-2.5 border-2 border-red-200 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">✕</button>}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">⚡ Action</label>
            <div className="flex gap-2">
              <button disabled={loading} className="flex-1 px-4 py-2.5 bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">{editingId ? '💾 Update' : '➕ Add'}</button>
              {editingId && <button type="button" disabled={loading} onClick={reset} className="px-4 py-2.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-all disabled:opacity-50">❌</button>}
            </div>
          </div>
        </div>
        {form.imageUrl && (
          <div className="mt-3">
            <img src={form.imageUrl} alt="Category preview" className="h-20 w-auto rounded-lg border-2 border-purple-200 dark:border-purple-700 shadow-sm" />
          </div>
        )}
      </form>

      <div className="border-2 border-purple-200 dark:border-purple-800 rounded-xl overflow-x-auto shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
            <tr>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">#️⃣ Order</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">📛 Name</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">� Image</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">�� Display on POS</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">✅ Active</th>
              <th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">⚙️ Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map(r => (
              <tr key={r.id} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="p-3 text-gray-600 dark:text-gray-400">{Number(r.sortOrder||0)}</td>
                <td className="p-3 font-medium text-gray-900 dark:text-gray-100">{r.name}</td>
                <td className="p-3">
                  {r.imageUrl ? (
                    <img src={r.imageUrl} alt={r.name} className="h-10 w-auto rounded border border-gray-200 dark:border-gray-600" />
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
                <td className="p-3">{r.showOnPos ? <span className="text-green-600 dark:text-green-400">✅ Yes</span> : <span className="text-gray-400">❌ No</span>}</td>
                <td className="p-3">{r.active ? <span className="text-green-600 dark:text-green-400">Yes</span> : <span className="text-gray-400">No</span>}</td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button disabled={loading} onClick={()=>onEdit(r)} className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-sky-400 to-sky-500 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">Edit</button>
                    <button disabled={loading} onClick={()=>onDelete(r.id)} className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-rose-400 to-rose-500 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <div className="text-4xl mb-2">📂</div>
                  <div>No categories found</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between mt-4 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200 dark:border-gray-700 gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Page {page} of {pages} • {items.length} total</span>
          <div className="flex items-center gap-1">
            <label className="text-sm text-gray-600 dark:text-gray-400">Show:</label>
            <select value={limit} onChange={e=>{ setLimit(Number(e.target.value)); setPage(1); setJump(1) }} className="px-2 py-1 text-sm border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600">
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button disabled={page<=1 || loading} onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">← Prev</button>
          <button disabled={page>=pages || loading} onClick={()=>setPage(p=>Math.min(pages,p+1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">Next →</button>
          <div className="flex items-center gap-1 ml-2">
            <input type="number" min={1} max={pages} value={jump} onChange={e=>setJump(Number(e.target.value)||1)} className="w-16 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-center bg-white dark:bg-gray-800 dark:text-gray-100" />
            <button disabled={loading || pages<1} onClick={()=>setPage(Math.min(pages, Math.max(1, Number(jump)||1)))} className="px-4 py-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Go</button>
          </div>
        </div>
      </div>
      {items.length===0 && (
        <div className="p-8 text-center text-gray-500 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-900/50">
          <span className="text-5xl mb-2 block">📂</span>
          <p>No categories found.</p>
        </div>
      )}
      {ConfirmDialog}
    </div>
  )
}
