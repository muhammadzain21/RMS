import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'

export default function Consumption() {
  const { state, businessDate, dispatch } = useData()
  const { token } = useAuth()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const [date, setDate] = useState(businessDate || new Date().toLocaleDateString('en-CA'))

  // Sales for selected date (Completed and Pending both contribute to consumption if recorded)
  const sales = useMemo(() => (state.sales || []).filter(s => s.date === date), [state.sales, date])
  const menu = state.menu || []
  const ingredients = state.ingredients || []
  const modsConfig = state.settings?.modifiers || {}

  // Build maps for quick lookup
  const menuById = useMemo(() => new Map(menu.map(m => [m.id, m])), [menu])
  const ingByName = useMemo(() => new Map(ingredients.map(i => [i.name, i])), [ingredients])

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
      const inv = ingByName.get(ingName)
      const currentQty = Number(inv?.qty || 0)
      const afterQty = Number((currentQty - amt).toFixed(3))
      rows.push({ name: ingName, consumed: Number(amt.toFixed(3)), currentQty, afterQty, unit: inv?.unit || '' })
    })
    // Include ingredients that had no consumption to help reconciliation
    ingredients.forEach(inv => {
      if (!consumption.has(inv.name)) {
        rows.push({ name: inv.name, consumed: 0, currentQty: Number(inv.qty || 0), afterQty: Number(inv.qty || 0), unit: inv.unit || '' })
      }
    })
    rows.sort((a,b) => String(a.name).localeCompare(String(b.name)))
    return rows
  }, [consumption, ingByName, ingredients])

  const totalItems = itemRows.reduce((a,b)=>a + Number(b.qty||0), 0)
  // Pagination state
  const [itemsPage, setItemsPage] = useState(1)
  const [itemsPageSize, setItemsPageSize] = useState(15)
  const [itemsJump, setItemsJump] = useState(1)
  const [consPage, setConsPage] = useState(1)
  const [consPageSize, setConsPageSize] = useState(15)
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
        const sRes = await fetch(`${API}/api/sales?from=${date}&to=${date}`, { headers, cache: 'no-store' })
        if (sRes.ok) {
          const list = await sRes.json()
          const mapId = (x) => ({ ...x, id: x.id || x._id })
          const fresh = (Array.isArray(list) ? list : []).map(mapId)
          const others = (Array.isArray(state.sales) ? state.sales : []).filter(s => s.date !== date)
          dispatch({ type: 'HYDRATE', payload: { sales: [...fresh, ...others] } })
        }
      } catch {}
    } catch {}
  }

  // Reset pages when date changes
  const resetPagesKey = `${date}-${itemRows.length}-${consumption.size}`
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
      const inv = ingByName.get(ingName)
      const currentQty = Number(inv?.qty || 0)
      const afterQty = Number((currentQty - amt).toFixed(3))
      rows.push({ name: ingName, consumed: Number(amt.toFixed(3)), currentQty, afterQty, unit: inv?.unit || '' })
    })
    rows.sort((a,b)=> String(a.name).localeCompare(String(b.name)))
    return rows
  }, [applyFilterToConsumption, itemFilter, sales, menuById, modsConfig, ingByName])

  const consTotalPages = Math.max(1, Math.ceil(filteredConsumptionRows.length / consPageSize))
  const consStart = (consPage - 1) * consPageSize
  const pagedConsumption = filteredConsumptionRows.slice(consStart, consStart + consPageSize)

  // Export: CSV (includes Items Sold and Ingredient Consumption sections)
  const exportCSV = () => {
    try {
      const lines = []
      lines.push(`Date,${date}`)
      // Items Sold
      lines.push('Items Sold,,,')
      lines.push('Name,Category,Qty,')
      for (const r of filteredItemRows) {
        lines.push([r.name, r.category||'', r.qty].map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(','))
      }
      lines.push('')
      // Consumption
      lines.push('Ingredient Consumption vs Inventory,,,')
      lines.push('Ingredient,Unit,Consumed,Current Qty')
      for (const r of filteredConsumptionRows) {
        lines.push([r.name, r.unit||'', r.consumed, r.currentQty].map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(','))
      }
      const csv = lines.join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `consumption_${date||'all'}.csv`
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
      doc.text(`Daily Sales & Consumption - ${date||''}`, 14, 14)
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
        head: [['Ingredient','Unit','Consumed','Current Qty']],
        body: filteredConsumptionRows.map(r => [r.name, r.unit||'', r.consumed, r.currentQty]),
        startY: y + 4,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' }
      })
      doc.save(`consumption_${date||'all'}.pdf`)
      toast.success('PDF exported successfully')
    } catch {
      toast.error('Export failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="text-3xl">📊</span> Daily Sales & Consumption
        </h1>
      </div>

      <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={refreshData} className="px-4 py-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors font-medium border border-blue-200 dark:border-blue-700">Refresh</button>
          <div className="sm:ml-auto flex gap-2">
            <button onClick={exportCSV} className="px-4 py-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 transition-colors font-medium border border-emerald-200 dark:border-emerald-700">Export CSV</button>
            <button onClick={exportPDF} className="px-4 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium border border-red-200 dark:border-red-700">Export PDF</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat title="Sales Count (lines)" value={sales.reduce((a,b)=>a + (b.items?.length||0), 0)} icon="" variant="blue" />
        <Stat title="Items Sold (qty)" value={totalItems} icon="" variant="emerald" />
        <Stat title="Unique Items Sold" value={itemRows.length} icon="" variant="purple" />
      </div>

      <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by item (name or category)</span>
            <input value={itemFilter} onChange={e=>{ setItemFilter(e.target.value); setItemsPage(1); setConsPage(1) }} placeholder="e.g., Pizza, Midnight Deal, Zinger" className="mt-1 w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="inline-flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <input type="checkbox" checked={applyFilterToConsumption} onChange={e=>{ setApplyFilterToConsumption(e.target.checked); setConsPage(1) }} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Apply filter to consumption</span>
          </label>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="text-xl">🛍️</span> Items Sold
        </h2>
        <div className="overflow-x-auto overflow-y-auto border-2 border-gray-200 dark:border-gray-700 rounded-xl max-h-[420px] shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 sticky top-0 z-10">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Name</th>
                <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Category</th>
                <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Qty</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map(r => (
                <tr key={r.id} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="p-3 font-medium text-gray-900 dark:text-gray-100">{r.name}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                      {r.category || '-'}
                    </span>
                  </td>
                  <td className="p-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{r.qty}</td>
                </tr>
              ))}
              {filteredItemRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-gray-500 dark:text-gray-400">
                    <div className="text-4xl mb-2">🛒</div>
                    <div>No sales for this date</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="text-xl">🥘</span> Ingredient Consumption vs Inventory
        </h2>
        <div className="overflow-x-auto overflow-y-auto border-2 border-gray-200 dark:border-gray-700 rounded-xl max-h-[420px] shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 sticky top-0 z-10">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Ingredient</th>
                <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Unit</th>
                <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Consumed</th>
                <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Current Qty</th>
              </tr>
            </thead>
            <tbody>
              {pagedConsumption.map(r => (
                <tr key={r.name} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="p-3 font-medium text-gray-900 dark:text-gray-100">{r.name}</td>
                  <td className="p-3 text-gray-600 dark:text-gray-400">{r.unit}</td>
                  <td className="p-3 text-right font-semibold text-rose-600 dark:text-rose-400">{r.consumed}</td>
                  <td className="p-3 text-right text-gray-700 dark:text-gray-300">{r.currentQty}</td>
                </tr>
              ))}
              {filteredConsumptionRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500 dark:text-gray-400">
                    <div className="text-4xl mb-2">🥗</div>
                    <div>No ingredients found</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
          Note: Consumption is computed from menu item recipes and applied modifiers for the selected date.
        </p>
      </section>
    </div>
  )
}

function Stat({ title, value, icon = '', variant = 'slate' }) {
  const variants = {
    blue: { bg: 'bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/30 dark:to-gray-900 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100', iconBg: 'bg-blue-500/20 text-blue-600 dark:text-blue-300' },
    emerald: { bg: 'bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/30 dark:to-gray-900 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100', iconBg: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300' },
    purple: { bg: 'bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/30 dark:to-gray-900 border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-100', iconBg: 'bg-purple-500/20 text-purple-600 dark:text-purple-300' },
    slate: { bg: 'bg-gradient-to-br from-gray-50 to-white dark:from-gray-900/50 dark:to-gray-950 border-gray-200 dark:border-gray-700', iconBg: 'bg-gray-500/20 text-gray-600 dark:text-gray-300' },
  }
  const v = variants[variant] || variants.slate
  return (
    <div className={`p-4 rounded-xl border-2 shadow-sm ${v.bg}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{title}</div>
          <div className="text-2xl font-bold mt-1">{value}</div>
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${v.iconBg}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
