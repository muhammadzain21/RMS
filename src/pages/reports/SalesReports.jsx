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
    />
  )
}
