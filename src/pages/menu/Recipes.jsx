import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useConfirm } from '../../components/useConfirm.jsx'

export default function Recipes() {
  const { state, dispatch } = useData()
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

  const allMenu = useMemo(() => (state.menu || []).filter(m => m.active !== false).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))), [state.menu])
  const ingredients = useMemo(() => (state.ingredients || []).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))), [state.ingredients])

  const [menuId, setMenuId] = useState('')
  const [viewItem, setViewItem] = useState(null)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [listSearch, setListSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [jump, setJump] = useState(1)

  const menuWithRecipes = useMemo(() => {
    return allMenu.filter(m => m.recipe && Object.keys(m.recipe).length > 0)
  }, [allMenu])

  const filteredList = useMemo(() => {
    if (!listSearch) return menuWithRecipes
    const q = listSearch.toLowerCase()
    return menuWithRecipes.filter(m =>
      String(m.name||'').toLowerCase().includes(q) ||
      String(m.category||'').toLowerCase().includes(q) ||
      Object.keys(m.recipe||{}).some(ing => ing.toLowerCase().includes(q))
    )
  }, [menuWithRecipes, listSearch])

  const totalPages = Math.max(1, Math.ceil(filteredList.length / limit))
  const pagedList = filteredList.slice((page - 1) * limit, page * limit)

  const current = useMemo(() => allMenu.find(m => m.id === menuId) || null, [menuId, allMenu])

  useEffect(() => {
    if (!menuId && allMenu.length) setMenuId(allMenu[0].id)
  }, [allMenu, menuId])

  useEffect(() => {
    const base = current?.recipe || {}
    const list = Object.keys(base).map(name => ({ ingredientName: name, amount: Number(base[name] || 0) }))
    setRows(list)
  }, [current])

  useEffect(() => { setPage(1); setJump(1) }, [listSearch])

  const addRow = () => setRows(prev => [...prev, { ingredientName: '', amount: 0 }])
  const removeRow = (idx) => setRows(prev => prev.filter((_,i)=>i!==idx))

  const startEdit = (m) => {
    setMenuId(m.id)
    setSearch('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const startView = (m) => { setViewItem(m) }

  const onSave = async () => {
    if (!current) return
    const norm = (s) => String(s||'').trim().toLowerCase().replace(/\s+/g,' ')
    const byCanon = new Map()
    for (const r of rows) {
      const rawName = String(r.ingredientName || '').trim()
      const amt = Number(r.amount || 0)
      if (!rawName || Number.isNaN(amt) || amt < 0) continue
      const inv = ingredients.find(i => norm(i.name) === norm(rawName))
      const canon = inv?.name || rawName
      byCanon.set(canon, Number((byCanon.get(canon) || 0) + amt))
    }
    const recipe = {}
    byCanon.forEach((amt, name) => { if (amt > 0) recipe[name] = amt })

    try {
      setSaving(true)
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const res = await fetch(`${API}/api/menu/${current.id}`, { method: 'PATCH', headers, body: JSON.stringify({ recipe }) })
      if (!res.ok) throw new Error('Failed to save recipe')
      dispatch({ type: 'UPDATE_MENU', payload: { id: current.id, data: { recipe } } })
      toast.success('Recipe saved')
    } catch {
      toast.error('Failed to save recipe on server')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async (m) => {
    const ok = await confirm({ title: 'Delete Recipe', message: `Delete recipe for "${m.name}"? This will remove all ingredient mappings.` })
    if (!ok) return
    try {
      setDeleting(true)
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const res = await fetch(`${API}/api/menu/${m.id}`, { method: 'PATCH', headers, body: JSON.stringify({ recipe: {} }) })
      if (!res.ok) throw new Error('Failed to delete recipe')
      dispatch({ type: 'UPDATE_MENU', payload: { id: m.id, data: { recipe: {} } } })
      toast.success('Recipe deleted')
    } catch {
      toast.error('Failed to delete recipe')
    } finally {
      setDeleting(false)
    }
  }

  const ingredientOptions = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? ingredients.filter(i => (i.name||'').toLowerCase().includes(q)) : ingredients
  }, [ingredients, search])

  const getRecipeSummary = (recipe) => {
    const keys = Object.keys(recipe || {})
    if (!keys.length) return '—'
    if (keys.length <= 3) return keys.map(k => `${k} (${recipe[k]})`).join(', ')
    return `${keys.slice(0,3).map(k => `${k} (${recipe[k]})`).join(', ')} +${keys.length - 3} more`
  }

  return (
    <div className="space-y-6 w-full px-4 sm:px-6 lg:px-8">
      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-5">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
          {current?.recipe && Object.keys(current.recipe).length > 0 ? `Edit Recipe: ${current.name}` : `Create Recipe${current ? `: ${current.name}` : ''}`}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-gray-600 dark:text-gray-400">Menu item</span>
            <select value={menuId} onChange={e=>setMenuId(e.target.value)} className="mt-1 w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500">
              {allMenu.map(m => <option key={m.id} value={m.id}>{m.name} {m.category ? `(${m.category})` : ''}</option>)}
            </select>
          </label>
          <div className="block">
            <span className="text-sm text-gray-600 dark:text-gray-400">Ingredient search</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ingredients" className="mt-1 w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="border rounded-xl overflow-x-auto shadow-sm border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Ingredient</th>
                <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Unit</th>
                <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Amount per 1 item</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const inv = ingredients.find(i => i.name === r.ingredientName)
                return (
                  <tr key={idx} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="p-3">
                      <select value={r.ingredientName} onChange={e=>setRows(arr=>arr.map((it,i)=> i===idx ? { ...it, ingredientName: e.target.value } : it))} className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500">
                        <option value="">-- Select ingredient --</option>
                        {ingredientOptions.map(i => (
                          <option key={i.id} value={i.name}>{i.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 text-gray-600 dark:text-gray-400">{inv?.unit || '-'}</td>
                    <td className="p-3 text-right">
                      <input type="number" step="0.001" min="0" value={r.amount}
                        onChange={e=>setRows(arr=>arr.map((it,i)=> i===idx ? { ...it, amount: Number(e.target.value) } : it))}
                        className="w-28 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-right bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500" />
                    </td>
                    <td className="p-3 text-right">
                      <button onClick={()=>removeRow(idx)} className="px-3 py-1.5 rounded-lg border-2 border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium">Remove</button>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-gray-500 dark:text-gray-400">No ingredients in recipe. Add some below.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={addRow} className="px-4 py-2.5 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium transition-all">+ Add Ingredient</button>
          <button disabled={saving || !current} onClick={onSave} className="px-6 py-2.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">Save Recipe</button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 px-1">Note: Amounts should use the same base unit as the inventory item, e.g., grams for weight items or pcs for piece items. Inventory reduction on sale is automatic using these recipes.</p>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            Saved Recipes
          </h2>
          <input placeholder="Search recipes..." value={listSearch} onChange={e=>setListSearch(e.target.value)} className="w-full sm:w-72 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm" />
        </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-gray-900 shadow-sm">
          <div className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase">Total Recipes</div>
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{menuWithRecipes.length}</div>
        </div>
        <div className="p-4 rounded-xl border-2 border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-gray-900 shadow-sm">
          <div className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase">Without Recipes</div>
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{allMenu.length - menuWithRecipes.length}</div>
        </div>
        <div className="p-4 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-gray-900 shadow-sm">
          <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase">Total Menu Items</div>
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{allMenu.length}</div>
        </div>
      </div>

      <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
            <tr>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Menu Item</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Category</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Ingredients</th>
              <th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Count</th>
              <th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedList.map(m => {
              const recipeKeys = Object.keys(m.recipe || {})
              return (
                <tr key={m.id} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="p-3 font-medium text-gray-900 dark:text-gray-100">{m.name}</td>
                  <td className="p-3 text-gray-600 dark:text-gray-400">{m.category || '—'}</td>
                  <td className="p-3 text-gray-600 dark:text-gray-400 text-xs">{getRecipeSummary(m.recipe)}</td>
                  <td className="p-3 text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold">{recipeKeys.length}</span>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={()=>startView(m)} className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-sky-400 to-sky-500 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">View</button>
                      <button onClick={()=>startEdit(m)} className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Edit</button>
                      <button disabled={deleting} onClick={()=>onDelete(m)} className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-rose-400 to-rose-500 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">Delete</button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!pagedList.length && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <div className="text-4xl mb-2">📄</div>
                  <div>No recipes found. Use "+ New Recipe" to create one.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filteredList.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between mt-4 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200 dark:border-gray-700 gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Page {page} of {totalPages} • {filteredList.length} total</span>
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
            <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">← Prev</button>
            <button disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">Next →</button>
            <div className="flex items-center gap-1 ml-2">
              <input type="number" min={1} max={totalPages} value={jump} onChange={e=>setJump(Number(e.target.value)||1)} className="w-16 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-center bg-white dark:bg-gray-800 dark:text-gray-100" />
              <button disabled={totalPages<1} onClick={()=>setPage(Math.min(totalPages, Math.max(1, Number(jump)||1)))} className="px-4 py-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Go</button>
            </div>
          </div>
        </div>
      )}

      {viewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setViewItem(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">{viewItem.name}</h2>
                {viewItem.category && <span className="text-xs text-gray-500 dark:text-gray-400">{viewItem.category}</span>}
              </div>
              <button onClick={() => setViewItem(null)} className="px-3 py-1.5 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-all">✕ Close</button>
            </div>
            <div className="p-5">
              {Object.keys(viewItem.recipe || {}).length > 0 ? (
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="text-left p-2 font-semibold text-gray-700 dark:text-gray-300">Ingredient</th>
                      <th className="text-left p-2 font-semibold text-gray-700 dark:text-gray-300">Unit</th>
                      <th className="text-right p-2 font-semibold text-gray-700 dark:text-gray-300">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(viewItem.recipe).map(([name, amt]) => {
                      const inv = ingredients.find(i => i.name === name)
                      return (
                        <tr key={name} className="border-t">
                          <td className="p-2 font-medium text-gray-900 dark:text-gray-100">{name}</td>
                          <td className="p-2 text-gray-600 dark:text-gray-400">{inv?.unit || '-'}</td>
                          <td className="p-2 text-right font-semibold text-blue-600 dark:text-blue-400">{amt}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="text-center text-gray-500 dark:text-gray-400 py-6">No ingredients in this recipe.</div>
              )}
              <div className="flex gap-2 mt-4">
                <button onClick={() => { startEdit(viewItem); setViewItem(null) }} className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Edit Recipe</button>
                <button onClick={() => setViewItem(null)} className="px-4 py-2.5 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium transition-all">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

        {ConfirmDialog}
      </section>
    </div>
  )
}
