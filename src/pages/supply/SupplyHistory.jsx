import { useData } from '../../state/DataContext.jsx'
import { useMemo, useState, useEffect } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'

export default function SupplyHistory() {
  const { state, dispatch } = useData()
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [jump, setJump] = useState(1)
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  // Reload supplies on first render to ensure latest data
  useEffect(() => { reloadSupplies() }, [])

  const rows = useMemo(() => {
    let list = state.supplies || []
    if (from && to) list = list.filter(s => s.date >= from && s.date <= to)
    return list
  }, [state.supplies, from, to])

  const pages = Math.ceil(rows.length / limit) || 1
  const paginatedRows = rows.slice((page - 1) * limit, page * limit)
  const backfillCandidates = useMemo(() => {
    // Ingredients that have supplierId but no corresponding supply on record
    const haveSupplies = new Set((state.supplies||[]).map(sp => `${sp.supplierId}|${sp.date}`))
    return (state.ingredients||[])
      .filter(ing => ing.supplierId)
      .map(ing => ({ ing, key: `${ing.supplierId}|${new Date().toLocaleDateString('en-CA')}` }))
      .filter(({ key }) => !haveSupplies.has(key))
  }, [state.ingredients, state.supplies])
  const generateFromIngredients = async () => {
    if (!backfillCandidates.length) return
    const confirmed = await confirm({ title: 'Generate Supplies', message: `Create ${backfillCandidates.length} supply record(s) from ingredients with suppliers?` })
    if (!confirmed) return
    for (const { ing } of backfillCandidates) {
      try {
        const sup = (state.suppliers||[]).find(s => s.id === ing.supplierId)
        const payload = {
          date: new Date().toLocaleDateString('en-CA'),
          supplierId: ing.supplierId,
          supplier: sup?.name || sup?.company || '',
          items: [{ name: ing.name, qty: Number(ing.qty||0), unit: ing.unit || '', price: Number(ing.price||0) }],
          cost: Number((Number(ing.qty||0) * Number(ing.price||0)).toFixed(2))
        }
        const res = await fetch(`${API}/api/supplies`, { method: 'POST', headers, body: JSON.stringify(payload) })
        if (!res.ok) {
          const msg = await res.text().catch(()=>String(res.status))
          toast.error(`Failed to create supply for ${ing.name}: ${res.status} ${msg}`)
        }
      } catch {}
    }
    // Rehydrate supplies from backend so entries appear even if local reducer blocked additions due to day close
    try {
      const resList = await fetch(`${API}/api/supplies`, { headers })
      if (resList.ok) {
        const rows = await resList.json()
        const mapId = (x) => ({ ...x, id: x.id || x._id })
        dispatch({ type: 'HYDRATE', payload: { supplies: (rows||[]).map(mapId) } })
      }
    } catch {}
    toast.success('Backfill complete')
  }

  const reloadSupplies = async () => {
    try {
      const resList = await fetch(`${API}/api/supplies`, { headers })
      if (!resList.ok) { toast.error(`Reload failed: ${resList.status}`); return }
      const rows = await resList.json()
      const mapId = (x) => ({ ...x, id: x.id || x._id })
      dispatch({ type: 'HYDRATE', payload: { supplies: (rows||[]).map(mapId) } })
      toast.success('Supplies reloaded')
    } catch { toast.error('Network error reloading supplies') }
  }
  const columns = [
    { label: 'Date', key: 'date' },
    { label: 'Supplier', key: 'supplier', render: (r) => {
      const sup = (state.suppliers||[]).find(s => s.id === r.supplierId)
      return sup?.name || sup?.company || r.supplier || '-'
    } },
    { label: 'Items', render: r => r.items.map(i => `${i.name} x${i.qty}${i.unit}`).join(', ') },
    { label: 'Cost', key: 'cost' },
  ]
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Supply History</h1>
        <div className="flex items-center gap-2 text-sm">
          <label>From</label>
          <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="px-2 py-1 border rounded" />
          <label>To</label>
          <input type="date" value={to} onChange={e=>setTo(e.target.value)} className="px-2 py-1 border rounded" />
          <button type="button" onClick={reloadSupplies} className="px-2 py-1 rounded border">Reload</button>
          {backfillCandidates.length > 0 && (
            <button type="button" onClick={generateFromIngredients} className="px-2 py-1 rounded border bg-amber-100">Generate from Ingredients ({backfillCandidates.length})</button>
          )}
        </div>
      </div>
      <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
            <tr>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Date</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Supplier</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Items</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Cost</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map(r => (
              <tr key={r.id} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="p-3 text-gray-700 dark:text-gray-300">{r.date}</td>
                <td className="p-3 text-gray-600 dark:text-gray-400">{(() => { const sup = (state.suppliers||[]).find(s => s.id === r.supplierId); return sup?.name || sup?.company || r.supplier || '-' })()}</td>
                <td className="p-3 text-gray-600 dark:text-gray-400">{r.items.map(i => `${i.name} x${i.qty}${i.unit}`).join(', ')}</td>
                <td className="p-3 text-gray-700 dark:text-gray-300">{r.cost}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <div className="text-4xl mb-2">📦</div>
                  <div>No supply records found</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between mt-4 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200 dark:border-gray-700 gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Page {page} of {pages} • {rows.length} total</span>
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
          <button disabled={page>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">Next →</button>
          <div className="flex items-center gap-1 ml-2">
            <input type="number" min={1} max={pages} value={jump} onChange={e=>setJump(Number(e.target.value)||1)} className="w-16 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-center bg-white dark:bg-gray-800 dark:text-gray-100" />
            <button disabled={pages<1} onClick={()=>setPage(Math.min(pages, Math.max(1, Number(jump)||1)))} className="px-4 py-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Go</button>
          </div>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  )
}
