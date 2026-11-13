import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const inp =
  'w-full px-2 py-1.5 border border-orange-200 dark:border-orange-700 rounded-md bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-orange-500'

/**
 * Edit all menu items in a category (multi-row). Portaled above sidebar (z-[1300]).
 */
export default function MenuEditDialog({
  open,
  editRows = [],
  setEditRows,
  cats = [],
  categoryLabel = '',
  branchName = 'this branch',
  applyToAllBranches,
  setApplyToAllBranches,
  loading,
  onClose,
  onSubmit,
}) {
  if (!open) return null

  const patchRow = (idx, patch) => {
    if (Object.prototype.hasOwnProperty.call(patch, 'category') && idx === 0) {
      const cat = patch.category || ''
      setEditRows(editRows.map((r, i) => (i === 0 ? { ...r, ...patch, category: cat } : { ...r, category: cat })))
      return
    }
    setEditRows(editRows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const node = (
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-3"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Edit Menu — {categoryLabel || 'Category'}
            <span className="ml-2 text-sm font-medium text-gray-500">({editRows.length} item{editRows.length === 1 ? '' : 's'})</span>
          </h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={20} />
          </button>
        </div>
        <p className="mb-3 text-xs font-medium text-amber-800 dark:text-amber-200">
          Showing all items in this category. “Apply to all branches” updates the shared catalog everywhere (default on).
          Uncheck to save overrides for {branchName} only. First-row category applies to all rows.
        </p>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-orange-200 dark:border-orange-700">
            <table className="min-w-[1180px] w-full text-sm">
              <thead className="bg-orange-50 dark:bg-orange-950/40">
                <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-orange-800 dark:text-orange-200">
                  <th className="p-1.5 min-w-[280px] w-[32%]">Name</th>
                  <th className="p-1.5 min-w-[160px] w-[16%]">Category</th>
                  <th className="p-1.5 w-24">Price</th>
                  <th className="p-1.5 w-28">Foodpanda</th>
                  <th className="p-1.5 w-24">Discount</th>
                  <th className="p-1.5 w-16">Sort</th>
                  <th className="p-1.5 w-16">Active</th>
                  <th className="p-1.5 w-28">Image</th>
                </tr>
              </thead>
              <tbody>
                {editRows.map((row, idx) => (
                  <tr key={row.id || idx} className="border-t border-orange-100 dark:border-orange-900/50">
                    <td className="p-1">
                      <input
                        placeholder="Name"
                        className={inp}
                        value={row.name}
                        onChange={(e) => patchRow(idx, { name: e.target.value })}
                      />
                    </td>
                    <td className="p-1">
                      <select
                        className={inp}
                        value={row.category}
                        onChange={(e) => patchRow(idx, { category: e.target.value })}
                      >
                        <option value="">Select…</option>
                        {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className="p-1">
                      <input type="number" placeholder="0" className={inp} value={row.price} onChange={(e) => patchRow(idx, { price: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <input type="number" placeholder="0" className={inp} value={row.priceFoodpanda} onChange={(e) => patchRow(idx, { priceFoodpanda: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <input type="number" min="0" max="100" placeholder="0" className={inp} value={row.discount} onChange={(e) => patchRow(idx, { discount: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <input type="number" placeholder="0" className={inp} value={row.sortOrder} onChange={(e) => patchRow(idx, { sortOrder: e.target.value })} />
                    </td>
                    <td className="p-1 text-center">
                      <input type="checkbox" checked={!!row.active} onChange={(e) => patchRow(idx, { active: e.target.checked })} className="w-4 h-4 text-orange-500 rounded" />
                    </td>
                    <td className="p-1">
                      <div className="flex items-center gap-1">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id={`menu-edit-img-${idx}`}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onload = () => patchRow(idx, { imageUrl: String(reader.result) })
                            reader.readAsDataURL(file)
                          }}
                        />
                        <label htmlFor={`menu-edit-img-${idx}`} className="px-1.5 py-1 border border-orange-200 dark:border-orange-700 rounded text-[10px] font-medium cursor-pointer whitespace-nowrap">
                          {row.imageUrl ? 'Change' : 'Add'}
                        </label>
                        {row.imageUrl ? (
                          <button type="button" onClick={() => patchRow(idx, { imageUrl: '' })} className="text-xs text-red-600 px-0.5">×</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="inline-flex items-center gap-2 text-sm font-medium text-sky-800 dark:text-sky-200">
            <input
              type="checkbox"
              className="w-4 h-4 text-orange-500 rounded"
              checked={applyToAllBranches}
              onChange={(e) => setApplyToAllBranches(e.target.checked)}
            />
            Apply to all branches (shared catalog)
          </label>

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200">Cancel</button>
            <button type="submit" disabled={loading} className="ui-btn ui-btn-primary disabled:opacity-50">
              {loading ? 'Saving…' : `Update ${editRows.length} Item${editRows.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
