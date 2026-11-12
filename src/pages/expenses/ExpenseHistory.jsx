import DataTable from '../../components/DataTable.jsx'
import { useData } from '../../state/DataContext.jsx'
import { useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import DatePicker from '../../components/DatePicker.jsx'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '../../utils/reportDoc.js'
import { exportDateStamp } from '../../utils/listReportExport.js'

const btnPrint = 'ui-btn ui-btn-print'
const btnPdf = 'ui-btn ui-btn-pdf'
const btnCsv = 'ui-btn ui-btn-csv'

export default function ExpenseHistory() {
  const { state, businessDate } = useData()
  const [date, setDate] = useState(businessDate || '')
  const [cat, setCat] = useState('')

  const rows = useMemo(() => state.expenses.filter(e => (!date || e.date===date) && (!cat || e.category===cat)), [state.expenses, date, cat])
  const totalAmount = useMemo(() => rows.reduce((a, e) => a + Number(e.amount || 0), 0), [rows])

  const buildReportHtml = () => {
    const fileName = `Expense-History-${date || 'all'}.pdf`
    const body =
      reportSummary([
        { label: 'Total amount', amount: `PKR ${totalAmount.toLocaleString()}` },
        { label: 'Entries', amount: String(rows.length) },
      ]) +
      reportSec('Expenses') +
      reportTable({
        headers: ['Date', 'Category', 'Description', { t: 'Amount (PKR)', align: 'r' }],
        numbered: true,
        rows: rows.map(e => [e.date, e.category, e.description || '-', { v: Number(e.amount || 0).toLocaleString(), align: 'r' }]),
        emptyText: 'No expenses match filters',
      })
    const html = wrapReportDoc({
      settings: state?.settings || {},
      title: 'Expense History',
      reportLabel: 'Expense Report',
      reportNo: `Rpt #: EX-${date || 'all'}`,
      metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Date filter', date || 'All']],
      metaRight: [['Category', cat || 'All'], ['Records', String(rows.length)]],
      body,
    })
    return { html, fileName }
  }

  const openPrintPreview = async () => {
    try {
      const { html, fileName } = buildReportHtml()
      await previewHtmlReport(html, fileName)
      toast.success('Print preview opened')
    } catch (err) {
      console.error(err)
      toast.error('Print preview failed')
    }
  }

  const exportPDF = async () => {
    try {
      const { html, fileName } = buildReportHtml()
      await downloadHtmlReport(html, fileName)
      toast.success('PDF downloaded')
    } catch (err) {
      console.error(err)
      toast.error('Failed to export PDF')
    }
  }

  const exportCSV = () => {
    try {
      const header = ['Date', 'Category', 'Description', 'Amount (PKR)']
      const lines = rows.map(e =>
        [e.date, e.category, e.description || '', e.amount ?? 0]
          .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
      )
      const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `expenses_${exportDateStamp()}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV exported successfully')
    } catch {
      toast.error('Failed to export CSV')
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="page-title">Expenses (legacy view)</h1>
      <p className="text-sm font-medium text-[var(--color-text-muted)]">For vouchers, approval, and head management, use the main <strong>Expenses</strong> page in the sidebar.</p>
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl card card-pad">
        <div className="flex gap-3 flex-shrink-0">
          <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
          <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
          <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
        </div>
        <div className="flex-shrink-0">
          <DatePicker label="Date" value={date} onChange={v=>setDate(v)} />
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <label className="text-xs font-semibold text-[var(--color-text-muted)] tracking-wide">Category</label>
          <select value={cat} onChange={e=>setCat(e.target.value)} className="px-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all">
            <option value="">All Categories</option>
            {['Utilities','Rent','Wages','Misc'].map(c=> <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <DataTable columns={[{label:'Date',key:'date'},{label:'Category',key:'category'},{label:'Description',key:'description'},{label:'Amount',key:'amount'}]} data={rows} />
    </div>
  )
}
