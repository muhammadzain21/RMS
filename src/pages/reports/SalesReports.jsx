import ReportHub from './ReportHub.jsx'
import { SALES_REPORT_TYPES } from './reportTypes.js'
import { runSalesReport } from './engines/salesEngine.js'

export default function SalesReports() {
  return (
    <ReportHub
      title="Sales Reports"
      reportTypes={SALES_REPORT_TYPES}
      runReport={runSalesReport}
      defaultType="transaction"
      extraFilters={({ extra, setExtra, state, reportType }) => {
        if (reportType !== 'customer_ledger') return null
        return (
          <div className="flex min-w-[14rem] flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Customer</label>
            <select
              value={extra.customerId || ''}
              onChange={e => setExtra(x => ({ ...x, customerId: e.target.value }))}
              className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">Select customer…</option>
              {(state.customers || []).map(c => (
                <option key={c.id || c._id} value={c.id || c._id}>
                  {c.name || c.phone || c.id}
                </option>
              ))}
            </select>
          </div>
        )
      }}
    />
  )
}
