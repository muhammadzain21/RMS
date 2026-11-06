import { useEffect, useState } from 'react'

/**
 * Reusable pagination bar with page info, page-size selector,
 * prev/next buttons, and jump-to-page input.
 *
 * Props:
 *  - page: current page (1-indexed)
 *  - pages: total number of pages
 *  - total: total item count (for display)
 *  - limit: current page size
 *  - onLimitChange: (newLimit) => void
 *  - onPageChange: (newPage) => void
 *  - limitOptions: array of page sizes (default [10, 25, 50, 100])
 *  - loading: disable controls while loading (optional)
 */
export default function Pagination({
  page,
  pages,
  total,
  limit,
  onLimitChange,
  onPageChange,
  limitOptions = [20, 30, 50, 100],
  loading = false,
  showLimit = true,
}) {
  const [jump, setJump] = useState(page)

  useEffect(() => { setJump(page) }, [page])

  const go = () => {
    const target = Math.min(pages, Math.max(1, Number(jump) || 1))
    onPageChange(target)
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between mt-4 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200 dark:border-gray-700 gap-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
          Page {page} of {pages}{total != null ? ` • ${total} total` : ''}
        </span>
        {showLimit && (
        <div className="flex items-center gap-1">
          <label className="text-sm text-gray-600 dark:text-gray-400">Show:</label>
          <select
            value={limit}
            onChange={e => { onLimitChange(Number(e.target.value)); onPageChange(1) }}
            className="px-2 py-1 text-sm border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
          >
            {limitOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100"
        >
          Prev
        </button>
        <button
          disabled={page >= pages || loading}
          onClick={() => onPageChange(Math.min(pages, page + 1))}
          className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100"
        >
          Next
        </button>
        <div className="flex items-center gap-1 ml-2">
          <input
            type="number"
            min={1}
            max={pages}
            value={jump}
            onChange={e => setJump(Number(e.target.value) || 1)}
            className="w-16 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-center bg-white dark:bg-gray-800 dark:text-gray-100"
          />
          <button
            disabled={loading || pages < 1}
            onClick={go}
            className="px-4 py-2 rounded-lg ui-btn ui-btn-primary"
          >
            Go
          </button>
        </div>
      </div>
    </div>
  )
}
