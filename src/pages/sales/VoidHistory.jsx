import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { createLineTotal } from './utils.js'
import { openKotPrintUtil } from './printUtils.js'

export default function VoidHistory() {
  const { state } = useData()
  const { token } = useAuth()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(new Set())
  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [hasMore, setHasMore] = useState(false)
  // Date filter
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const loadServer = async () => {
    try {
      setLoading(true)
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const params = new URLSearchParams()
      params.set('limit', String(pageSize))
      params.set('skip', String((page - 1) * pageSize))
      if (typeFilter) params.set('type', typeFilter)
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      const res = await fetch(`${API}/api/voids?${params.toString()}`, { headers })
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data) ? data : []
        setRows(list)
        setHasMore(list.length === pageSize)
        return
      }
    } catch {}
    setRows([])
    setHasMore(false)
    setLoading(false)
  }

  useEffect(() => { loadServer().finally(()=>setLoading(false)) }, [page, pageSize, typeFilter, fromDate, toDate])

  const staffWaiterName = (id) => (state.staff || []).find(s => s.id === id)?.name || '-'

  const filtered = useMemo(() => {
    let list = Array.isArray(rows) ? rows.slice() : []
    if (typeFilter) list = list.filter(r => (r.orderType || '') === typeFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(r => (
        String(r.customer?.name||'').toLowerCase().includes(q) ||
        String(r.customer?.address||'').toLowerCase().includes(q) ||
        String(r.tableNo||'').toLowerCase().includes(q) ||
        staffWaiterName(r.waiterId).toLowerCase().includes(q) ||
        (r.reason || '').toLowerCase().includes(q)
      ))
    }
    return list.sort((a,b) => (new Date(b.createdAt).getTime()||0) - (new Date(a.createdAt).getTime()||0))
  }, [rows, typeFilter, search, state.staff])

  const reprintKot = (r) => {
    try {
      const updatedState = { ...state, currentTokenNo: r.tokenNo }
      const lineTotal = createLineTotal(state.settings?.modifiers || {})
      openKotPrintUtil({
        state: updatedState,
        items: r.items || [],
        waiterId: r.waiterId || '',
        tableNo: r.tableNo || '',
        orderType: r.orderType || 'Dine-in',
        paymentMethod: 'Cash',
        cashReceived: 0,
        changeDue: 0,
        payRemarks: (r.reason ? `CANCELLED: ${r.reason}` : r.remarks || ''),
        lineTotal,
        createdAt: r.createdAt || null,
        isReprint: true,
        autoPrint: false,
        previewInApp: true,
      })
    } catch {}
  }

  const counts = useMemo(() => {
    return filtered.reduce((acc, r) => { acc[r.orderType || 'Other'] = (acc[r.orderType || 'Other']||0) + 1; return acc }, {})
  }, [filtered])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="text-3xl">🚫</span> Void History
        </h1>
      </div>

      <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Order Type</span>
            <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500">
              <option value="">All Types</option>
              <option value="Dine-in">Dine-in</option>
              <option value="Take-away">Take-away</option>
              <option value="Delivery">Delivery</option>
              <option value="Drive-thru">Drive-thru</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">From Date</span>
            <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">To Date</span>
            <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Search</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Token / table / waiter / reason" className="mt-1 w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500" />
          </label>
          <div className="flex items-end justify-end gap-2">
            <button onClick={loadServer} className="px-4 py-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors font-medium border border-blue-200 dark:border-blue-700" disabled={loading}>{loading ? '⏳ Refreshing...' : '🔄 Refresh'}</button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <span className="text-blue-800 dark:text-blue-200 font-medium">Dine-in: {counts['Dine-in']||0}</span>
          </div>
          <div className="px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <span className="text-green-800 dark:text-green-200 font-medium">Take-away: {counts['Take-away']||0}</span>
          </div>
          <div className="px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
            <span className="text-purple-800 dark:text-purple-200 font-medium">Delivery: {counts['Delivery']||0}</span>
          </div>
          <div className="px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
            <span className="text-orange-800 dark:text-orange-200 font-medium">Drive-thru: {counts['Drive-thru']||0}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Page size</label>
            <select value={pageSize} onChange={e=>{ setPage(1); setPageSize(Number(e.target.value)||25) }} className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600">
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
            <tr>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Time</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Token</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Type</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Table</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Waiter</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Reason</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Items</th>
              <th className="p-3 text-center font-semibold text-gray-700 dark:text-gray-300">Reprint KOT</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="p-3 text-gray-600 dark:text-gray-400">{r.createdAt ? format(new Date(r.createdAt), 'yyyy-MM-dd HH:mm:ss') : '-'}</td>
                <td className="p-3 font-medium text-red-600 dark:text-red-400">{r.tokenNo || '-'}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    r.orderType === 'Dine-in' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' :
                    r.orderType === 'Take-away' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' :
                    r.orderType === 'Delivery' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200' :
                    'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200'
                  }`}>
                    {r.orderType || '-'}
                  </span>
                </td>
                <td className="p-3 text-gray-700 dark:text-gray-300">{r.tableNo || '-'}</td>
                <td className="p-3 text-gray-700 dark:text-gray-300">{staffWaiterName(r.waiterId)}</td>
                <td className="p-3">
                  <span className="px-2 py-1 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-sm font-medium">
                    {r.reason || '-'}
                  </span>
                </td>
                <td className="p-3">
                  {(() => {
                    const menu = Array.isArray(state.menu) ? state.menu : []
                    const displayFor = (it) => {
                      try {
                        const size = String(it?.mods?.size || it?.size || '').trim().toUpperCase()
                        const ids = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
                        if (ids.length) {
                          const flvNames = ids.map(fid => (menu.find(x=>x.id===fid)?.name || '')).filter(Boolean)
                          const title = flvNames.join(' + ') || (it?.custom?.name || (menu.find(x=>x.id===it.itemId)?.name || ''))
                          return size ? `${title} (${size})` : title
                        }
                        const base = it?.custom?.name || (menu.find(x=>x.id===it.itemId)?.name || '')
                        return size ? `${base} (${size})` : base
                      } catch { return it?.custom?.name || '' }
                    }
                    const names = (r.items||[]).map(displayFor).filter(Boolean)
                    const isExpanded = expanded.has(r.id)
                    const show = isExpanded ? names : names.slice(0, 3)
                    const extra = Math.max(0, names.length - show.length)
                    return (
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {show.join(', ')}
                        {!isExpanded && extra > 0 && (
                          <button type="button" className="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline font-medium" onClick={() => setExpanded(prev => { const n = new Set(prev); n.add(r.id); return n })}>
                            +{extra} more
                          </button>
                        )}
                        {isExpanded && names.length > 3 && (
                          <button type="button" className="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline font-medium" onClick={() => setExpanded(prev => { const n = new Set(prev); n.delete(r.id); return n })}>
                            Show less
                          </button>
                        )}
                      </span>
                    )
                  })()}
                </td>
                <td className="p-3 text-center">
                  <button className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors" onClick={()=>reprintKot(r)}>🖨️ Print</button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <div className="text-4xl mb-2">🚫</div>
                  <div>No voids found</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="text-sm text-gray-600 dark:text-gray-400">Page {page}</div>
        <div className="flex gap-2">
          <button type="button" className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium transition-colors disabled:opacity-50" disabled={loading || page<=1} onClick={()=>setPage(p=>Math.max(1, p-1))}>← Prev</button>
          <button type="button" className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium transition-colors disabled:opacity-50" disabled={loading || !hasMore} onClick={()=>setPage(p=>p+1)}>Next →</button>
        </div>
      </div>
    </div>
  )
}
