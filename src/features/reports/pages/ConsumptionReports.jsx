import ReportHub from '@features/reports/components/ReportHub.jsx'
import { CONSUMPTION_REPORT_TYPES } from '@features/reports/utils/reportConsumptionTypes.js'
import { runConsumptionReport } from '@features/reports/utils/reportConsumptionEngine.js'

export default function ConsumptionReports() {
  return (
    <ReportHub
      title="Consumption Reports"
      reportTypes={CONSUMPTION_REPORT_TYPES}
      runReport={runConsumptionReport}
      defaultType="kitchen_ready_time"
    />
  )
}
