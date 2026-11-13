import { createPortal } from 'react-dom'
import { Plus, X } from 'lucide-react'
import { blankMenuRow } from './menuFormUtils.js'

const inp =
  'w-full px-2 py-1.5 border border-orange-200 dark:border-orange-700 rounded-md bg-white dark:bg-gray-800 text-sm'

/**
 * Multi-row add menu dialog. Portaled above the sidebar (z-[1300]).
 * Compact width — fields stay on one row with horizontal scroll if needed.
 */
export default function MenuAddDialog({
  open,
  multiRows,
  setMultiRows,
  cats = [],
  branchName = 'this branch',
  addForAllBranches,
  setAddForAllBranches,
  loading,
  onClose,
  onSubmit,
}) {
  if (!open) return null

  const patchRow = (idx, patch) => {
    // First-row category → apply to all rows; other rows → that row only
    if (Object.prototype.hasOwnProperty.call(patch, 'category') && idx === 0) {
      const cat = patch.category || ''
      setMultiRows(multiRows.map((r, i) => (i === 0 ? { ...r, ...patch, category: cat } : { ...r, category: cat })))
      return
    }
    setMultiRows(multiRows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const addRows = (count = 1) => {
    const last = multiRows[multiRows.length - 1] || {}
    const cat = multiRows[0]?.category || last.category || ''
    const extra = Array.from({ length: count }, () =>
      blankMenuRow({
        category: cat,
        price: count === 1 ? last.price : 0,
        priceFoodpanda: count === 1 ? last.priceFoodpanda : 0,
        discount: count === 1 ? last.discount : 0,
        active: last.active,
      })
    )
    setMultiRows([...multiRows, ...extra])
  }

  const node = (
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-3"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Add Menu Items</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={20} />
          </button>
        </div>
        <p className="mb-3 text-xs font-medium text-sky-800 dark:text-sky-200">
          Choose whether new items are shared to all branches or only {branchName}. Empty name rows are skipped.
          Category on the first row applies to all rows; change any other row to set that row only.
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
                  <th className="p-1.5 w-20">Image</th>
                  <th className="p-1.5 w-8" />
                </tr>
              </thead>
              <tbody>
                {multiRows.map((row, idx) => (
                  <tr key={idx} className="border-t border-orange-100 dark:border-orange-900/50">
                    <td className="p-1"><input placeholder="Name" className={inp} value={row.name} onChange={(e) => patchRow(idx, { name: e.target.value })} /></td>
                    <td className="p-1">
                      <select className={inp} value={row.category} onChange={(e) => patchRow(idx, { category: e.target.value })}>
                        <option value="">Select…</option>
                        {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className="p-1"><input type="number" placeholder="0" className={inp} value={row.price} onChange={(e) => patchRow(idx, { price: e.target.value })} /></td>
                    <td className="p-1"><input type="number" placeholder="0" className={inp} value={row.priceFoodpanda} onChange={(e) => patchRow(idx, { priceFoodpanda: e.target.value })} /></td>
                    <td className="p-1"><input type="number" min="0" max="100" placeholder="0" className={inp} value={row.discount} onChange={(e) => patchRow(idx, { discount: e.target.value })} /></td>
                    <td className="p-1"><input type="number" placeholder="0" className={inp} value={row.sortOrder} onChange={(e) => patchRow(idx, { sortOrder: e.target.value })} /></td>
                    <td className="p-1 text-center">
                      <input type="checkbox" checked={!!row.active} onChange={(e) => patchRow(idx, { active: e.target.checked })} className="w-4 h-4 text-orange-500 rounded" />
                    </td>
                    <td className="p-1">
                      <div className="flex items-center gap-0.5">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id={`menu-add-img-${idx}`}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onload = () => patchRow(idx, { imageUrl: String(reader.result) })
                            reader.readAsDataURL(file)
                          }}
                        />
                        <label htmlFor={`menu-add-img-${idx}`} className="px-1.5 py-1 border border-orange-200 dark:border-orange-700 rounded text-[10px] font-medium cursor-pointer whitespace-nowrap">
                          {row.imageUrl ? 'Change' : 'Add'}
                        </label>
                        {row.imageUrl ? (
                          <button type="button" onClick={() => patchRow(idx, { imageUrl: '' })} className="text-xs text-red-600 px-0.5">×</button>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-1">
                      {multiRows.length > 1 ? (
                        <button type="button" onClick={() => setMultiRows(multiRows.filter((_, i) => i !== idx))} className="p-0.5 rounded text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30" title="Remove row">
                          <X size={14} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => addRows(1)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 text-sm font-medium hover:bg-orange-50 dark:hover:bg-orange-900/20">
              <Plus size={16} /> Add row
            </button>
            <button type="button" onClick={() => addRows(3)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 text-sm font-medium hover:bg-sky-50 dark:hover:bg-sky-900/20">
              <Plus size={16} /> Add 3 rows
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-sm font-medium text-sky-800 dark:text-sky-200">
            <input type="checkbox" className="w-4 h-4 text-orange-500 rounded" checked={addForAllBranches} onChange={(e) => setAddForAllBranches(e.target.checked)} />
            Apply to all branches (shared catalog)
          </label>
          <p className="text-xs text-slate-500">
            {addForAllBranches ? 'New items appear in every branch.' : `New items are created for ${branchName} only.`}
          </p>

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200">Cancel</button>
            <button type="submit" disabled={loading} className="ui-btn ui-btn-primary disabled:opacity-50">Add All Items</button>
          </div>
        </form>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
