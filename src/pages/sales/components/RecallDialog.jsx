import React, { useEffect, useMemo, useRef, useState } from 'react'

export default function RecallDialog({
  open,
  onClose,
  recalls = [],
  API,
  authHeaders,
  staff = [],
  tables = [],
  onRecall = ()=>{},
  onPay = ()=>{},
  onCustomerBill = ()=>{},
}) {
  const canonicalType = (v) => {
    const t = String(v||'').trim().toLowerCase()
    if (t === 'dine-in' || t === 'dine in') return 'Dine-in'
    if (t === 'take-away' || t === 'takeaway' || t === 'take away') return 'Take-away'
    if (t === 'delivery') return 'Delivery'
    if (t === 'drive-thru' || t === 'drivethru' || t === 'drive thru' || t === 'drive-through') return 'Drive-thru'
    return String(v||'')
  }
  const [waiterFilter, setWaiterFilter] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('') // '', 'Dine-in','Take-away','Delivery','Drive-thru'

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [jump, setJump] = useState(1)
  const [loading, setLoading] = useState(false)
  const [serverRows, setServerRows] = useState([])
  const [hasLoaded, setHasLoaded] = useState(false)

  const canFetch = Boolean(API)
  const effectiveRows = canFetch ? serverRows : (Array.isArray(recalls) ? recalls : [])
  
  // Start with loading=true when using server fetch to prevent empty table flash
  const showLoading = loading || (canFetch && !hasLoaded)

  useEffect(() => {
    if (!open) return
    if (page !== 1) setPage(1)
  }, [open, waiterFilter, typeFilter, limit])

  useEffect(() => {
    if (!open) return
    if (!canFetch) return

    const waiterId = String(waiterFilter || '').trim()
    const orderType = String(typeFilter || '').trim()
    const q = String(search || '').trim()

    const ctrl = new AbortController()
    ;(async () => {
      try {
        setLoading(true)
        const params = new URLSearchParams()
        params.set('page', String(page))
        params.set('limit', String(limit))
        if (waiterId) params.set('waiterId', waiterId)
        if (orderType) params.set('orderType', orderType)
        if (q) params.set('search', q)
        const res = await fetch(`${API}/api/recalls?${params.toString()}`, { headers: authHeaders, signal: ctrl.signal, cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const rows = Array.isArray(data?.data) ? data.data : []
        setServerRows(rows)
        setTotal(Number(data?.total || rows.length || 0))
        setPages(Number(data?.pages || 1))
        setHasLoaded(true)
      } catch {}
      finally { setLoading(false) }
    })()
    return () => ctrl.abort()
  }, [open, canFetch, API, authHeaders, page, limit, waiterFilter, typeFilter, search])

  const filtered = useMemo(() => {
    if (canFetch) return effectiveRows
    let list = Array.isArray(effectiveRows) ? effectiveRows : []
    if (waiterFilter) list = list.filter(r => (r.waiterId||'') === waiterFilter)
    if (typeFilter) list = list.filter(r => canonicalType(r.orderType) === typeFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        String(r.customer?.name||'').toLowerCase().includes(q) ||
        String(r.customer?.address||'').toLowerCase().includes(q) ||
        String(r.tableNo||'').toLowerCase().includes(q) ||
        String(r.orderType||'').toLowerCase().includes(q)
      )
    }
    return list
  }, [canFetch, effectiveRows, waiterFilter, typeFilter, search])

  const counts = useMemo(() => {
    const c = { 'Dine-in': 0, 'Take-away': 0, 'Delivery': 0, 'Drive-thru': 0 }
    for (const r of (effectiveRows||[])) {
      const ct = canonicalType(r.orderType)
      if (Object.prototype.hasOwnProperty.call(c, ct)) c[ct]++
    }
    return c
  }, [effectiveRows])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-6xl max-h-[85vh] bg-white dark:bg-gray-900 border rounded-xl p-4 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Select Order</div>
            <div className="text-xs text-gray-500">Recall, pay, or print customer bill</div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">✕</button>
        </div>

        <div className="mt-3 grid grid-cols-12 gap-3 items-end">
          <div className="col-span-12 sm:col-span-4">
            <div className="text-xs text-gray-600 mb-1">Choose Waiters:</div>
            <select value={waiterFilter} onChange={e=>setWaiterFilter(e.target.value)} className="w-full px-3 py-2 border rounded">
              <option value="">All Waiters</option>
              {(staff||[]).map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div className="col-span-12 sm:col-span-6 flex gap-2 flex-wrap">
            {['Dine-in','Take-away','Delivery','Drive-thru'].map(t => (
              <button
                key={t}
                type="button"
                onClick={()=> setTypeFilter(typeFilter===t ? '' : t)}
                className={`px-3 py-2 rounded border text-sm ${typeFilter===t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100'}`}
              >{t} {counts[t] || 0}</button>
            ))}
          </div>
          <div className="col-span-12 sm:col-span-2">
            <div className="text-xs text-gray-600 mb-1">Search:</div>
            <input value={search} onChange={e=>setSearch(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>
        </div>

        <div className="mt-3 overflow-x-auto overflow-y-auto flex-1 min-h-[200px] rounded border dark:border-gray-700 relative">
          {showLoading && (
            <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 z-10 flex items-center justify-center">
              <span className="text-gray-500">Loading...</span>
            </div>
          )}
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left bg-gray-50 dark:bg-gray-800 sticky top-0">
                <th className="px-3 py-2">ORDER TIME</th>
                <th className="px-3 py-2">TOKEN NO</th>
                <th className="px-3 py-2">CUSTOMER NAME</th>
                <th className="px-3 py-2">CUSTOMER ADDRESS</th>
                <th className="px-3 py-2">WAITER</th>
                <th className="px-3 py-2">TABLE</th>
                <th className="px-3 py-2">FLOOR</th>
                <th className="px-3 py-2">ORDER TYPE</th>
                <th className="px-3 py-2">RECALL</th>
                <th className="px-3 py-2">PAY</th>
                <th className="px-3 py-2">TOTAL AMOUNT</th>
                <th className="px-3 py-2">CUSTOMER BILL</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.createdAt ? new Date(r.createdAt).toLocaleString() : '-'}</td>
                  <td className="px-3 py-2 font-medium text-blue-600">{r.tokenNo || '-'}</td>
                  <td className="px-3 py-2">{r.customer?.name || '-'}</td>
                  <td className="px-3 py-2">{r.customer?.address || '-'}</td>
                  <td className="px-3 py-2">{r.waiterName || '-'}</td>
                  <td className="px-3 py-2">{r.tableNo || '-'}</td>
                  <td className="px-3 py-2">{(() => {
                    if (!r.tableNo) return '-'
                    const tableObj = tables.find(t => (t.name || t.label || t.code || String(t)) === r.tableNo)
                    return tableObj?.floor || '-'
                  })()}</td>
                  <td className="px-3 py-2">{r.orderType || '-'}</td>
                  <td className="px-3 py-2">
                    <button className="px-2 py-1 rounded bg-blue-600 text-white" onClick={()=>onRecall(r)} title="Recall">⟲</button>
                  </td>
                  <td className="px-3 py-2">
                    <button className="px-2 py-1 rounded bg-green-600 text-white" onClick={()=>onPay(r)} title="Pay">▣</button>
                  </td>
                  <td className="px-3 py-2">{Number(r.totalAmount||0).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <button className="px-2 py-1 rounded bg-sky-600 text-white" onClick={()=>onCustomerBill(r)} title="Customer Bill">▭</button>
                  </td>
                </tr>
              ))}
              {!showLoading && hasLoaded && filtered.length === 0 && (
                <tr><td className="px-3 py-8 text-center text-gray-500" colSpan={12}>No recalled orders</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between mt-4 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200 dark:border-gray-700 gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Page {page} of {pages} • {canFetch ? total : (recalls||[]).length} total</span>
            <div className="flex items-center gap-1">
              <label className="text-sm text-gray-600 dark:text-gray-400">Show:</label>
              <select value={limit} onChange={e=>{ setLimit(parseInt(e.target.value, 10) || 20); setPage(1); setJump(1); }} className="px-2 py-1 text-sm border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page<=1 || loading} onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">← Prev</button>
            <button type="button" disabled={page>=pages || loading} onClick={()=>setPage(p=>Math.min(pages,p+1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">Next →</button>
            <div className="flex items-center gap-1 ml-2">
              <input type="number" min={1} max={pages} value={jump} onChange={e=>setJump(Number(e.target.value)||1)} className="w-16 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-center bg-white dark:bg-gray-800 dark:text-gray-100" />
              <button type="button" disabled={pages<1} onClick={()=>setPage(Math.min(pages, Math.max(1, Number(jump)||1)))} className="px-4 py-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Go</button>
            </div>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium transition-all dark:text-gray-100 ml-2">Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}
