import ReportHub from '@features/reports/components/ReportHub.jsx'
import { SALES_REPORT_TYPES } from '@features/reports/utils/reportSalesTypes.js'
import { runSalesReport } from '@features/reports/utils/reportSalesEngine.js'

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
