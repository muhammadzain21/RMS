import { useEffect, useMemo, useState } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'

export default function Tables() {
  const { state, dispatch } = useData()
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const [newTable, setNewTable] = useState('')
  const [newFloor, setNewFloor] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedTable, setSelectedTable] = useState('')
  const [tables, setTables] = useState([])
  const [history, setHistory] = useState([])
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [summary, setSummary] = useState([])
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [jump, setJump] = useState(1)
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

  // Keep public settings.tables in sync so POS can read tables without auth
  const syncSettingsTables = async (names) => {
    try {
      const headers = { 'Content-Type': 'application/json' }
      await fetch(`${API}/api/settings`, { method: 'PATCH', headers, body: JSON.stringify({ tables: names }) })
    } catch {}
  }

  // Load tables from backend
  useEffect(() => {
    const load = async () => {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        const res = await fetch(`${API}/api/tables`, { headers })
        if (!res.ok) return
        const rows = await res.json()
        setTables(rows || [])
      } catch {}
    }
    load()
  }, [API, token])

  // Load per-day or range summary
  useEffect(() => {
    const loadSummary = async () => {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        const params = new URLSearchParams()
        if (selectedDate && !fromDate && !toDate) params.set('date', selectedDate)
        if (fromDate) params.set('from', fromDate)
        if (toDate) params.set('to', toDate)
        const url = `${API}/api/tables/summary?${params.toString()}`
        const res = await fetch(url, { headers })
        if (!res.ok) { setSummary([]); return }
        const data = await res.json()
        setSummary(data?.tables || [])
      } catch { setSummary([]) }
    }
    loadSummary()
  }, [API, token, selectedDate, fromDate, toDate])

  const rows = useMemo(() => {
    const dineInSales = (state.sales||[]).filter(s => s.orderType === 'Dine-in')
    const mapped = tables.map((t) => {
      const name = t.name || t
      const salesForTable = dineInSales.filter(s => (s.tableNo||'').trim() === name)
      const sumRow = summary.find(s => s.table === name)
      const lastDate = sumRow?.lastDate || t.lastOrderDate || (salesForTable.length ? salesForTable[0].date : '-')
      const lastWaiter = sumRow?.lastWaiter || (t.lastWaiter && t.lastWaiter.trim()) || (salesForTable.length ? (salesForTable[0].waiter || '-') : '-')
      const totalAmount = typeof sumRow?.totalAmount === 'number' ? sumRow.totalAmount : (typeof t.totalAmount === 'number' ? t.totalAmount : salesForTable.reduce((a,b)=>a+Number(b.total||0),0))
      return {
        table: name,
        orders: typeof sumRow?.orders === 'number' ? sumRow.orders : (typeof t.totalOrders === 'number' ? t.totalOrders : salesForTable.length),
        lastDate,
        lastWaiter,
        totalAmount,
        _id: t._id,
      }
    })
    if (search) {
      const q = search.toLowerCase()
      return mapped.filter(r => r.table.toLowerCase().includes(q))
    }
    return mapped
  }, [tables, state.sales, search])

  const pages = Math.ceil(rows.length / limit) || 1
  const paginatedRows = rows.slice((page - 1) * limit, page * limit)

  const cols = [
    { label: 'Table', key: 'table' },
    { label: 'Floor', key: 'floor', render: r => (tables.find(t => (t.name||t)===r.table)?.floor || '-') },
    { label: 'Orders', key: 'orders' },
    { label: 'Last Order Date', key: 'lastDate' },
    { label: 'Last Waiter', key: 'lastWaiter' },
    { label: 'Total Bill', key: 'totalAmount', render: r => `PKR ${Number(r.totalAmount||0).toLocaleString()}` },
    { label: 'Actions', key: 'actions', render: r => (
      <div className="flex gap-2">
        <button onClick={()=>{ setSelectedTable(r.table); setDrawerOpen(true) }} className="px-2 py-1 text-xs rounded bg-blue-600 text-white">View Sales</button>
        <button onClick={async ()=>{
          const confirmed = await confirm({ title: 'Delete Table', message: `Delete table "${r.table}"? This will not delete sales history.` })
          if (!confirmed) return
          try {
            const headers = token ? { Authorization: `Bearer ${token}` } : {}
            const t = tables.find(x => (x.name||x) === r.table)
            const id = t?._id
            if (!id) throw new Error('Not found')
            const res = await fetch(`${API}/api/tables/${id}`, { method: 'DELETE', headers })
            if (!res.ok) throw new Error('Failed')
            setTables(prev => {
              const next = prev.filter(x => (x._id||x.name) !== id)
              // update settings.tables
              const names = next.map(x => x.name || x).filter(Boolean)
              syncSettingsTables(names)
              // Update DataContext so Sales page and KOT see the change immediately
              dispatch({ type: 'HYDRATE', payload: { settings: { ...state.settings, tables: next.map(x => ({ name: x.name || x, floor: x.floor || '' })) } } })
              return next
            })
            toast.success('Table deleted')
          } catch (e) {
            toast.error('Failed to delete table. Please retry.')
          }
        }} className="px-2 py-1 text-xs rounded bg-rose-500 text-white">Delete</button>
      </div>
    )}
  ]

  const addTable = async () => {
    const name = newTable.trim()
    if (!name) return
    if (tables.some(t => (t.name||t) === name)) { toast.error('Table already exists'); return }
    try {
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const res = await fetch(`${API}/api/tables`, { method: 'POST', headers, body: JSON.stringify({ name }) })
      if (!res.ok) throw new Error('Failed')
      const created = await res.json()
      setTables(prev => {
        const next = [...prev, created]
        const names = next.map(x => x.name || x).filter(Boolean)
        syncSettingsTables(names)
        // Update DataContext so Sales page and KOT see the new table immediately
        dispatch({ type: 'HYDRATE', payload: { settings: { ...state.settings, tables: next.map(x => ({ name: x.name || x, floor: x.floor || '' })) } } })
        return next
      })
      toast.success('Table added')
    } catch (e) {
      toast.error('Failed to add table. Please retry.')
    }
    setNewTable('')
  }

  // Load history when drawer opens
  useEffect(() => {
    const loadHistory = async () => {
      if (!drawerOpen || !selectedTable) return
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        const res = await fetch(`${API}/api/tables/by-name/${encodeURIComponent(selectedTable)}/history`, { headers })
        if (!res.ok) { setHistory([]); return }
        const rows = await res.json()
        const mapped = (rows||[]).map(s => ({
          date: s.date,
          billNo: s.billNo ? `BILL-${s.billNo}` : '-',
          waiter: s.waiter || '-',
          total: Number(s.total||0),
        }))
        setHistory(mapped)
      } catch { setHistory([]) }
    }
    loadHistory()
  }, [drawerOpen, selectedTable, API, token])

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Tables</h1>
      </div>
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-end gap-2">
        <button onClick={()=>setAddOpen(true)} className="px-3 py-2 rounded border bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800">Add Table</button>
        <label className="text-sm flex flex-col">
          <span className="text-sm">Date</span>
          <input type="date" className="mt-1 px-3 py-2 border rounded bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600" value={selectedDate} onChange={e=>{ setSelectedDate(e.target.value); setFromDate(''); setToDate('') }} />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm flex flex-col">
            <span className="text-sm">From</span>
            <input type="date" className="mt-1 px-3 py-2 border rounded bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600" value={fromDate} onChange={e=>{ setFromDate(e.target.value); setSelectedDate('') }} />
          </label>
          <label className="text-sm flex flex-col">
            <span className="text-sm">To</span>
            <input type="date" className="mt-1 px-3 py-2 border rounded bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600" value={toDate} onChange={e=>{ setToDate(e.target.value); setSelectedDate('') }} />
          </label>
          <button onClick={()=>{ setSelectedDate(format(new Date(), 'yyyy-MM-dd')); setFromDate(''); setToDate('') }} className="px-3 py-2 rounded border bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600">Today</button>
          <button onClick={()=>{
            const headers = ['Table','Orders','Last Order Date','Last Waiter','Total Bill']
            const lines = [headers.join(',')]
            for (const r of summary) {
              const row = [
                `"${(r.table||'').replaceAll('"','\"')}"`,
                Number(r.orders||0),
                `"${(r.lastDate||'').replaceAll('"','\"')}"`,
                `"${(r.lastWaiter||'').replaceAll('"','\"')}"`,
                Number(r.totalAmount||0)
              ]
              lines.push(row.join(','))
            }
            const csv = lines.join('\n')
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            const label = selectedDate ? `tables_${selectedDate}` : `tables_${fromDate||'from'}_${toDate||'to'}`
            a.href = url
            a.download = `${label}.csv`
            a.click()
            URL.revokeObjectURL(url)
          }} className="px-3 py-2 rounded border bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900 dark:text-green-200 dark:hover:bg-green-800">Export CSV</button>
        </div>
        <div className="sm:ml-auto w-full sm:w-auto">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." className="w-full sm:w-auto px-3 py-2 border rounded bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600" />
        </div>
      </div>

      <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
            <tr>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Table</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Floor</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Orders</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Last Order Date</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Last Waiter</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Total Bill</th>
              <th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map(r => (
              <tr key={r.table} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="p-3 text-gray-700 dark:text-gray-300">{r.table}</td>
                <td className="p-3 text-gray-600 dark:text-gray-400">{tables.find(t => (t.name||t)===r.table)?.floor || '-'}</td>
                <td className="p-3 text-gray-700 dark:text-gray-300">{r.orders}</td>
                <td className="p-3 text-gray-600 dark:text-gray-400">{r.lastDate}</td>
                <td className="p-3 text-gray-600 dark:text-gray-400">{r.lastWaiter}</td>
                <td className="p-3 font-medium text-gray-800 dark:text-gray-200">PKR {Number(r.totalAmount||0).toLocaleString()}</td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={()=>{ setSelectedTable(r.table); setDrawerOpen(true) }} className="px-2 py-1 text-xs rounded bg-blue-600 text-white">View Sales</button>
                    <button onClick={async ()=>{
                      const confirmed = await confirm({ title: 'Delete Table', message: `Delete table "${r.table}"? This will not delete sales history.` })
                      if (!confirmed) return
                      try {
                        const headers = token ? { Authorization: `Bearer ${token}` } : {}
                        const t = tables.find(x => (x.name||x) === r.table)
                        const id = t?._id
                        if (!id) throw new Error('Not found')
                        const res = await fetch(`${API}/api/tables/${id}`, { method: 'DELETE', headers })
                        if (!res.ok) throw new Error('Failed')
                        setTables(prev => {
                          const next = prev.filter(x => (x._id||x.name) !== id)
                          const names = next.map(x => x.name || x).filter(Boolean)
                          syncSettingsTables(names)
                          dispatch({ type: 'HYDRATE', payload: { settings: { ...state.settings, tables: next.map(x => ({ name: x.name || x, floor: x.floor || '' })) } } })
                          return next
                        })
                        toast.success('Table deleted')
                      } catch (e) {
                        toast.error('Failed to delete table. Please retry.')
                      }
                    }} className="px-2 py-1 text-xs rounded bg-rose-500 text-white">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <div className="text-4xl mb-2">🪑</div>
                  <div>No tables found</div>
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

      {addOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={()=>setAddOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white dark:bg-gray-900 shadow-xl flex flex-col w-full max-w-md p-4 rounded-md border">
            <h2 className="text-lg font-semibold mb-2 dark:text-white">Add Table</h2>
            <label className="text-sm mb-1 dark:text-gray-300">Table No</label>
            <input type="text" className="px-3 py-2 border rounded bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 mb-2" value={newTable} onChange={e=>setNewTable(e.target.value)} placeholder="e.g., Table 4" />
            <label className="text-sm mb-1 dark:text-gray-300">Floor</label>
            <input type="text" className="px-3 py-2 border rounded bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 mb-4" value={newFloor} onChange={e=>setNewFloor(e.target.value)} placeholder="e.g., Ground / 1st" />
            <div className="flex justify-end gap-2">
              <button onClick={()=>setAddOpen(false)} className="px-3 py-2 rounded border dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600">Cancel</button>
              <button onClick={async ()=>{
                const name = newTable.trim()
                if (!name) return
                try {
                  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
                  const res = await fetch(`${API}/api/tables`, { method: 'POST', headers, body: JSON.stringify({ name, floor: (newFloor||'').trim() }) })
                  if (res.ok) {
                    const row = await res.json()
                    setTables(prev => [...prev, row])
                    setNewTable(''); setNewFloor(''); setAddOpen(false)
                  }
                } catch {}
              }} className="px-3 py-2 rounded bg-primary-600 dark:bg-blue-600 text-white disabled:opacity-50" disabled={!newTable.trim()}>Save</button>
            </div>
          </div>
        </>
      )}

      {ConfirmDialog}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={()=>setDrawerOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-md z-50 bg-white dark:bg-gray-900 shadow-xl flex flex-col">
            <div className="p-4 border-b flex items-center justify-between dark:border-gray-700">
              <div className="font-semibold dark:text-white">Sales - {selectedTable}</div>
              <button onClick={()=>setDrawerOpen(false)} className="px-2 py-1 text-sm rounded border dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600">Close</button>
            </div>
            <div className="p-4 space-y-2 overflow-auto">
              {(history||[]).length === 0 && <div className="text-sm text-gray-500 dark:text-gray-400">No sales found for this table.</div>}
              {(history||[]).map((r, i) => (
                <div key={i} className="flex items-center justify-between border rounded p-2 text-sm dark:border-gray-700">
                  <div>
                    <div className="font-medium dark:text-white">{r.billNo}</div>
                    <div className="text-gray-600 dark:text-gray-400">{r.date}</div>
                  </div>
                  <div className="text-right">
                    <div className="dark:text-gray-300">Waiter: <span className="font-medium dark:text-white">{r.waiter}</span></div>
                    <div className="dark:text-gray-300">Total: <span className="font-semibold dark:text-white">PKR {r.total.toLocaleString()}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
