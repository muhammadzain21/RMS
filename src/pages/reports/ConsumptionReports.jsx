import ReportHub from './ReportHub.jsx'
import { CONSUMPTION_REPORT_TYPES } from './reportTypes.js'
import { runConsumptionReport } from './engines/consumptionEngine.js'

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
