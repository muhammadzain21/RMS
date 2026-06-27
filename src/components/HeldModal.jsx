import React, { useMemo, useState } from 'react'

export default function HeldModal({
  open,
  onClose,
  held = [],
  staff = [],
  onLoad = () => {},
  onDelete = () => {},
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jump, setJump] = useState(1)

  const filtered = useMemo(() => {
    let rows = held
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(r =>
        (r.id||'').toLowerCase().includes(q) ||
        (r.customer?.name||'').toLowerCase().includes(q) ||
        (r.tableNo||'').toLowerCase().includes(q) ||
        (r.orderType||'').toLowerCase().includes(q)
      )
    }
    return rows
  }, [held, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page-1)*pageSize, (page-1)*pageSize + pageSize)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-4xl bg-white dark:bg-gray-900 border rounded p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-2xl font-semibold">Load Held Sales</div>
          <button type="button" onClick={onClose} className="text-gray-500">✕</button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label className="text-sm">Search:</label>
          <input value={search} onChange={e=>{setSearch(e.target.value); setPage(1)}} className="border rounded px-2 py-1.5" placeholder="Search" />
        </div>

        <div className="overflow-auto border rounded">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-2 py-2 text-left">ID</th>
                <th className="px-2 py-2 text-left">Created</th>
                <th className="px-2 py-2 text-left">Waiter</th>
                <th className="px-2 py-2 text-left">Table</th>
                <th className="px-2 py-2 text-left">Order Type</th>
                <th className="px-2 py-2 text-left">Load</th>
                <th className="px-2 py-2 text-left">Delete</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => {
                const waiterName = staff.find(s=>s.id===r.waiterId)?.name || '-'
                return (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-2">{r.id}</td>
                    <td className="px-2 py-2">{new Date(r.createdAt||Date.now()).toISOString().replace('T',' ').slice(0,19)}</td>
                    <td className="px-2 py-2">{waiterName}</td>
                    <td className="px-2 py-2">{r.tableNo || '-'}</td>
                    <td className="px-2 py-2">{r.orderType}</td>
                    <td className="px-2 py-2"><button type="button" className="px-2 py-1 rounded bg-sky-600 text-white" onClick={()=>onLoad(r)}>Load</button></td>
                    <td className="px-2 py-2"><button type="button" className="px-2 py-1 rounded bg-red-600 text-white" onClick={()=>onDelete(r)}>Cancel</button></td>
                  </tr>
                )
              })}
              {!paged.length && (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center text-gray-500">No held orders</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between mt-4 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200 dark:border-gray-700 gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Page {page} of {totalPages} • {filtered.length} total</span>
            <div className="flex items-center gap-1">
              <label className="text-sm text-gray-600 dark:text-gray-400">Show:</label>
              <select value={pageSize} onChange={e=>{ setPageSize(Number(e.target.value)); setPage(1); setJump(1) }} className="px-2 py-1 text-sm border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">← Prev</button>
            <button type="button" disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">Next →</button>
            <div className="flex items-center gap-1 ml-2">
              <input type="number" min={1} max={totalPages} value={jump} onChange={e=>setJump(Number(e.target.value)||1)} className="w-16 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-center bg-white dark:bg-gray-800 dark:text-gray-100" />
              <button type="button" disabled={totalPages<1} onClick={()=>setPage(Math.min(totalPages, Math.max(1, Number(jump)||1)))} className="px-4 py-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Go</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
