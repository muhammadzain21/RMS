import { useMemo, useState, useEffect } from 'react'

export default function DataTable({
  columns,
  data,
  pageSize = 20,
  pageSizeOptions = [20, 30, 50, 'all'],
  searchable = true,
  compact = false,
  exportable = true,
  maxHeight = 420,
  onPageSizeChange,
}) {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  const [size, setSize] = useState(pageSize)

  // Reset page to 1 when size changes
  useEffect(() => { setPage(1) }, [size])

  // Notify parent when page size changes
  useEffect(() => {
    if (onPageSizeChange && size !== pageSize) {
      onPageSizeChange(size)
    }
  }, [size])

  const filtered = useMemo(() => {
    if (!q) return data
    const term = q.toLowerCase()
    return data.filter(row => Object.values(row).some(v => String(v).toLowerCase().includes(term)))
  }, [q, data])

  const sorted = useMemo(() => {
    if (!sort.key) return filtered
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      if (av == null && bv == null) return 0
      if (av == null) return -1
      if (bv == null) return 1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * (sort.dir === 'asc' ? 1 : -1)
      return String(av).localeCompare(String(bv)) * (sort.dir === 'asc' ? 1 : -1)
    })
    return copy
  }, [filtered, sort])

  const isAll = size === 'all' || size >= sorted.length
  const pages = isAll ? 1 : Math.max(1, Math.ceil(sorted.length / size))
  const effectiveSize = isAll ? sorted.length : size
  const start = (page - 1) * effectiveSize
  const rows = sorted.slice(start, start + effectiveSize)

  const toggleSort = (key) => {
    setPage(1)
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' }
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
    })
  }

  const exportCsv = () => {
    const headers = columns.map(c => '"' + (c.label ?? c.key) + '"').join(',')
    const lines = sorted.map(row => columns.map(c => {
      const v = c.render ? c.render(row) : row[c.key]
      const s = typeof v === 'string' ? v : v == null ? '' : String(v)
      return '"' + s.replaceAll('"', '""') + '"'
    }).join(',')).join('\n')
    const csv = headers + '\n' + lines
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'export.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {searchable && (
          <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="Search..." className="w-full sm:w-64 px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900" />
        )}
        {exportable && (
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={exportCsv} className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">Export CSV</button>
          </div>
        )}
      </div>
      <div className="border border-gray-200 dark:border-gray-800 rounded" style={{ maxHeight, overflow: 'auto' }}>
        <table className={`min-w-full ${compact ? 'text-xs' : 'text-sm'}`}>
          <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0 z-10">
            <tr>
              {columns.map(col => {
                const key = col.key || col.label
                const isSortable = !!col.key
                const isActive = isSortable && sort.key === col.key
                const arrow = isActive ? (sort.dir === 'asc' ? '▲' : '▼') : ''
                return (
                  <th
                    key={key}
                    className={`text-left px-3 py-2 whitespace-nowrap ${isSortable ? 'cursor-pointer select-none' : ''} ${col.thClassName || col.className || ''} ${col.hideBelow === 'sm' ? 'hidden sm:table-cell' : col.hideBelow === 'md' ? 'hidden md:table-cell' : col.hideBelow === 'lg' ? 'hidden lg:table-cell' : ''}`}
                    onClick={() => isSortable && toggleSort(col.key)}
                    title={isSortable ? 'Sort' : ''}
                  >
                    <span className="inline-flex items-center gap-1">{col.label} {arrow && <span>{arrow}</span>}</span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.id || idx} className="border-t border-gray-100 dark:border-gray-800 odd:bg-white even:bg-gray-50 dark:odd:bg-gray-950 dark:even:bg-gray-900">
                {columns.map(col => (
                  <td
                    key={col.key || col.label}
                    className={`px-3 py-2 whitespace-nowrap ${col.tdClassName || col.className || ''} ${col.hideBelow === 'sm' ? 'hidden sm:table-cell' : col.hideBelow === 'md' ? 'hidden md:table-cell' : col.hideBelow === 'lg' ? 'hidden lg:table-cell' : ''}`}
                  >
                    {col.render ? col.render(row, idx) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={columns.length}>No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Show:</span>
          <select
            value={size}
            onChange={(e) => {
              const newSize = e.target.value === 'all' ? 'all' : Number(e.target.value)
              setSize(newSize)
            }}
            className="px-2 py-1 text-sm border rounded dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 bg-white"
          >
            {pageSizeOptions.map(opt => (
              <option key={opt} value={opt}>{opt === 'all' || opt === 'All' ? 'All' : opt}</option>
            ))}
          </select>
          <span className="text-xs text-gray-500 dark:text-gray-400">of {sorted.length} items</span>
        </div>
        <div className="flex gap-2">
          <button className="px-2 py-1 text-sm border rounded dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700" onClick={() => setPage(p => Math.max(1, p-1))}>Prev</button>
          <span className="text-sm dark:text-gray-100">{page}/{pages}</span>
          <button className="px-2 py-1 text-sm border rounded dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700" onClick={() => setPage(p => Math.min(pages, p+1))}>Next</button>
        </div>
      </div>
    </div>
  )
}
