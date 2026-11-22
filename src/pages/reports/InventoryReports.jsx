import ReportHub from './ReportHub.jsx'
import { INVENTORY_REPORT_TYPES } from './reportTypes.js'
import { runInventoryReport } from './engines/inventoryEngine.js'

export default function InventoryReports() {
  return (
    <ReportHub
      title="Inventory Reports"
      reportTypes={INVENTORY_REPORT_TYPES}
      runReport={runInventoryReport}
      defaultType="stock"
      extraFilters={({ extra, setExtra, state, reportType }) => {
        if (reportType !== 'supplier_ledger') return null
        return (
          <div className="flex min-w-[14rem] flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Supplier</label>
            <select
              value={extra.supplierId || ''}
              onChange={e => setExtra(x => ({ ...x, supplierId: e.target.value }))}
              className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">Select supplier…</option>
              {(state.suppliers || []).map(s => (
                <option key={s.id || s._id} value={s.id || s._id}>
                  {s.name || s.id}
                </option>
              ))}
            </select>
          </div>
        )
      }}
    />
  )
}
