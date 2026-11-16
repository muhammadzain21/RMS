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
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">Supplier</label>
            <select
              value={extra.supplierId || ''}
              onChange={e => setExtra(x => ({ ...x, supplierId: e.target.value }))}
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
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
