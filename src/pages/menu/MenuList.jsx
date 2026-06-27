import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'

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
  })
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [jump, setJump] = useState(1)
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

  const items = state.menu || []
  const cats = (state.categories || [])
    .filter(c => c.active !== false)
    .sort((a,b)=> String(a.name||'').localeCompare(String(b.name||'')))
  
  const pages = Math.ceil(items.length / limit) || 1
  const paginatedItems = items.slice((page - 1) * limit, page * limit)

  const reset = () => {
    setEditingId(null);
    setForm({ name:'', category:'', price:0, sortOrder:0, active:true })
  }
  const onEdit = (row) => {
    setEditingId(row.id)
    setForm({
      name: row.name||'',
      category: row.category||'',
      price: Number(row.price||0),
      sortOrder: Number(row.sortOrder||0),
      active: row.active ?? true,
    })
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    const payload = { ...form, price: Number(form.price||0), sortOrder: Number(form.sortOrder||0) }
    if (!payload.name?.trim()) { toast.error('Name is required'); return }
    try {
      setLoading(true)
      if (editingId) {
        // optimistic
        dispatch({ type:'UPDATE_MENU', payload:{ id: editingId, data: payload } })
        try {
          const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
          const res = await fetch(`${API}/api/menu/${editingId}`, { method:'PATCH', headers, body: JSON.stringify(payload) })
          if (!res.ok) throw new Error('Failed to update')
          toast.success('Menu item updated')
        } catch {
          toast.error('Updated locally. Backend update failed.')
        }
      } else {
        const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        const res = await fetch(`${API}/api/menu`, { method:'POST', headers, body: JSON.stringify(payload) })
        if (res.ok) {
          const created = await res.json()
          dispatch({ type:'ADD_MENU', payload: { ...payload, id: created._id || created.id } })
          toast.success('Menu item added')
        } else {
          dispatch({ type:'ADD_MENU', payload })
          toast.error('Added locally. Backend create failed.')
        }
      }
    } catch {
      if (!editingId) dispatch({ type:'ADD_MENU', payload })
      toast.error('Network error. Change applied locally.')
    } finally {
      setLoading(false)
      reset()
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
    <div className="space-y-4 w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="text-3xl">🍔</span> Menu
        </h1>
        <div className="flex items-center gap-2">
          <button type="button" disabled={loading} onClick={()=>onExport('csv')} className="px-4 py-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 text-sm disabled:opacity-50">📥 Export CSV</button>
        </div>
      </div>

      <form onSubmit={onSubmit} className="p-5 rounded-xl border-2 border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50/60 to-white dark:from-orange-950/30 dark:to-gray-900 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">🍔 Item Name</label>
            <input placeholder="e.g. Zinger Burger" className="w-full px-4 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-orange-500 transition-all" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">📂 Category</label>
            <select className="w-full px-4 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-orange-500 transition-all" value={form.category} onChange={e=>setForm(v=>({...v,category:e.target.value}))}>
              <option value="">Select category...</option>
              {cats.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">💰 Price (PKR)</label>
            <input type="number" placeholder="0" className="w-full px-4 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-orange-500 transition-all" value={form.price} onChange={e=>setForm(v=>({...v,price:e.target.value}))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">#️⃣ Sort Order</label>
            <input type="number" placeholder="0" className="w-full px-4 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-orange-500 transition-all" value={form.sortOrder} onChange={e=>setForm(v=>({...v,sortOrder:e.target.value}))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">✅ Status</label>
            <label className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all h-[46px]">
              <input type="checkbox" checked={!!form.active} onChange={e=>setForm(v=>({...v,active:e.target.checked}))} className="w-5 h-5 text-orange-500 rounded focus:ring-orange-500" />
              <span className="font-medium">Active</span>
            </label>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">⚡ Action</label>
            <div className="flex gap-2">
              <button disabled={loading} className="flex-1 px-4 py-2.5 bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-lg font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">{editingId ? '💾 Update' : '➕ Add'}</button>
              {editingId && <button type="button" disabled={loading} onClick={reset} className="px-4 py-2.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-all disabled:opacity-50">❌</button>}
            </div>
          </div>
        </div>
      </form>

      <div className="border-2 border-orange-200 dark:border-orange-800 rounded-xl overflow-hidden shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
            <tr>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">#️⃣ Order</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">🍔 Name</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">📂 Category</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">💰 Price</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">✅ Active</th>
              <th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">⚙️ Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map((r, idx) => (
              <tr key={r.id || idx} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="p-3 text-gray-600 dark:text-gray-400">{Number(r.sortOrder||0)}</td>
                <td className="p-3 font-medium text-gray-900 dark:text-gray-100">{r.name}</td>
                <td className="p-3 text-gray-600 dark:text-gray-400">{r.category}</td>
                <td className="p-3 text-gray-700 dark:text-gray-300">PKR {Number(r.price||0).toLocaleString()}</td>
                <td className="p-3">{r.active ? <span className="text-green-600 dark:text-green-400">Yes</span> : <span className="text-gray-400">No</span>}</td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button disabled={loading} onClick={()=>onEdit(r)} className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-sky-400 to-sky-500 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">✏️ Edit</button>
                    <button disabled={loading} onClick={()=>onDelete(r.id)} className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-rose-400 to-rose-500 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">🗑️ Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <div className="text-4xl mb-2">🍔</div>
                  <div>No menu items found</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between mt-4 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200 dark:border-gray-700">
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
        <div className="text-sm text-gray-600">No menu items found.</div>
      )}
      {ConfirmDialog}
    </div>
  )
}
