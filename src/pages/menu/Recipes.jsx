import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'

export default function Recipes() {
  const { state, dispatch } = useData()
  const { token } = useAuth()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

  const allMenu = useMemo(() => (state.menu || []).filter(m => m.active !== false).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))), [state.menu])
  const ingredients = useMemo(() => (state.ingredients || []).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))), [state.ingredients])

  const [menuId, setMenuId] = useState(allMenu[0]?.id || '')
  const current = useMemo(() => allMenu.find(m => m.id === menuId) || null, [menuId, allMenu])
  const [rows, setRows] = useState([]) // [{ingredientName, amount}]
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  // Removed recipe scope: we now only edit the base recipe

  useEffect(() => {
    const base = current?.recipe || {}
    const list = Object.keys(base).map(name => ({ ingredientName: name, amount: Number(base[name] || 0) }))
    setRows(list)
  }, [current])

  const addRow = () => setRows(prev => [...prev, { ingredientName: '', amount: 0 }])
  const removeRow = (idx) => setRows(prev => prev.filter((_,i)=>i!==idx))

  const onSave = async () => {
    if (!current) return
    // validate
    const norm = (s) => String(s||'').trim().toLowerCase().replace(/\s+/g,' ')
    // Map input to canonical ingredient names from inventory
    const byCanon = new Map()
    for (const r of rows) {
      const rawName = String(r.ingredientName || '').trim()
      const amt = Number(r.amount || 0)
      if (!rawName || Number.isNaN(amt) || amt < 0) continue
      const inv = ingredients.find(i => norm(i.name) === norm(rawName))
      const canon = inv?.name || rawName
      const key = canon
      byCanon.set(key, Number((byCanon.get(key) || 0) + amt))
    }
    const recipe = {}
    byCanon.forEach((amt, name) => { if (amt > 0) recipe[name] = amt })

    try {
      setSaving(true)
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const body = { recipe }
      const res = await fetch(`${API}/api/menu/${current.id}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
      if (!res.ok) throw new Error('Failed to save recipe')
      dispatch({ type: 'UPDATE_MENU', payload: { id: current.id, data: { recipe } } })
      toast.success('Recipe saved')
    } catch (e) {
      toast.error('Failed to save recipe on server')
    } finally {
      setSaving(false)
    }
  }

  const ingredientOptions = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = ingredients
    const list = q ? base.filter(i => (i.name||'').toLowerCase().includes(q)) : base
    return list
  }, [ingredients, search])

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-xl font-semibold">Recipes</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-gray-600">Menu item</span>
          <select value={menuId} onChange={e=>setMenuId(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600">
            {allMenu.map(m => <option key={m.id} value={m.id}>{m.name} {m.category ? `(${m.category})` : ''}</option>)}
          </select>
        </label>
        <div className="block">
          <span className="text-sm text-gray-600">Ingredient search</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ingredients" className="mt-1 w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600" />
        </div>
        {/* Recipe scope removed */}
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="text-left p-2">Ingredient</th>
              <th className="text-left p-2">Unit</th>
              <th className="text-right p-2">Amount per 1 item</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const inv = ingredients.find(i => i.name === r.ingredientName)
              return (
                <tr key={idx} className="border-t">
                  <td className="p-2">
                    <select value={r.ingredientName} onChange={e=>setRows(arr=>arr.map((it,i)=> i===idx ? { ...it, ingredientName: e.target.value } : it))} className="w-full px-2 py-1 border rounded bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600">
                      <option value="">-- Select ingredient --</option>
                      {ingredientOptions.map(i => (
                        <option key={i.id} value={i.name}>{i.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">{inv?.unit || '-'}</td>
                  <td className="p-2 text-right">
                    <input type="number" step="0.001" min="0" value={r.amount}
                      onChange={e=>setRows(arr=>arr.map((it,i)=> i===idx ? { ...it, amount: Number(e.target.value) } : it))}
                      className="w-28 px-2 py-1 border rounded text-right bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600" />
                  </td>
                  <td className="p-2 text-right">
                    <button onClick={()=>removeRow(idx)} className="px-2 py-1 text-red-600">Remove</button>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="p-3 text-center text-gray-500">No ingredients in recipe. Add some below.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={addRow} className="px-3 py-2 border rounded">+ Add Ingredient</button>
        <button disabled={saving || !current} onClick={onSave} className="px-3 py-2 rounded bg-primary-600 text-white disabled:opacity-50">Save Recipe</button>
      </div>

      <p className="text-xs text-gray-500">Note: Amounts should use the same base unit as the inventory item, e.g., grams for weight items or pcs for piece items. Inventory reduction on sale is automatic using these recipes.</p>
    </div>
  )
}
