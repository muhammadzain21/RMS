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

        <div className="flex items-center gap-2 text-sm">
          <label>Show</label>
          <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value)); setPage(1)}} className="border rounded px-2 py-1">
            {[10,20,50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>entries</span>
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

        <div className="flex items-center justify-between text-sm">
          <div>Showing {Math.min((page-1)*pageSize+1, filtered.length)} to {Math.min(page*pageSize, filtered.length)} of {filtered.length} entries</div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page<=1} className="px-3 py-1 border rounded disabled:opacity-50" onClick={()=>setPage(p=>Math.max(1,p-1))}>Previous</button>
            <div>{page}</div>
            <button type="button" disabled={page>=totalPages} className="px-3 py-1 border rounded disabled:opacity-50" onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next</button>
          </div>
        </div>
      </div>
    </div>
  )
}
