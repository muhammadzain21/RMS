import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../../state/DataContext.jsx'
import CustomerModal from '../../components/CustomerModal.jsx'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '../../utils/reportDoc.js'
import { btnPrint, btnPdf, btnCsv, downloadCsvFile, exportDateStamp } from '../../utils/listReportExport.js'

export default function CustomerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useData()
  const { confirm, ConfirmDialog } = useConfirm()
  const [modalOpen, setModalOpen] = useState(false)

  const customer = useMemo(() => (state.customers||[]).find(c => c.id === id), [state.customers, id])
  const sales = useMemo(() => (state.sales||[]).filter(s => s.customer?.id === id), [state.sales, id])

  const totals = useMemo(() => {
    const visits = sales.length
    const spent = sales.reduce((a,b)=> a + Number(b.total||0) - Number(b.discount||0), 0)
    const last = (customer?.lastVisit) || (sales[0]?.date)
    return { visits, spent, last }
  }, [sales, customer])

  const saleItemsText = (s) => (s.items || []).map(it => {
    const m = (state.menu || []).find(mm => mm.id === it.itemId)
    return `${m?.name || it.itemId} x${it.qty}`
  }).join(', ')

  const salesReportRows = () => sales.map(s => [
    s.date ? format(new Date(s.date), 'yyyy-MM-dd') : '-',
    saleItemsText(s),
    Number(((s.total || 0) + (s.discount || 0))).toFixed(2),
    Number(s.discount || 0).toFixed(2),
    Number(s.total || 0).toFixed(2),
  ])

  const buildCustomerReport = () => {
    const fileName = `Customer-${customer?.name || id}-${exportDateStamp()}.pdf`
    const body =
      reportSummary([
        { label: 'Customer', amount: customer?.name || '-', cls: '' },
        { label: 'Visits', amount: String(totals.visits) },
        { label: 'Total spent', amount: totals.spent.toFixed(2) },
      ]) +
      reportSec(`Sales (${sales.length})`) +
      reportTable({
        headers: ['Date', 'Items', { t: 'Subtotal', align: 'r' }, { t: 'Discount', align: 'r' }, { t: 'Total', align: 'r' }],
        numbered: true,
        rows: sales.map(s => [
          s.date ? format(new Date(s.date), 'yyyy-MM-dd') : '-',
          saleItemsText(s) || '-',
          { v: Number(((s.total || 0) + (s.discount || 0))).toFixed(2), align: 'r' },
          { v: Number(s.discount || 0).toFixed(2), align: 'r' },
          { v: Number(s.total || 0).toFixed(2), align: 'r' },
        ]),
        emptyText: 'No sales for this customer',
      })
    const html = wrapReportDoc({
      settings: state?.settings || {},
      title: `Customer: ${customer?.name || 'Profile'}`,
      reportLabel: 'Customer Sales',
      reportNo: `Rpt #: C-${customer?.id || id}`,
      metaLeft: [['Phone', customer?.phone || '-'], ['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')]],
      metaRight: [['Regular', customer?.isRegular ? 'Yes' : 'No'], ['Sales', String(sales.length)]],
      body,
    })
    return { html, fileName }
  }

  const openPrintPreview = async () => {
    try {
      const { html, fileName } = buildCustomerReport()
      await previewHtmlReport(html, fileName)
      toast.success('Print preview opened')
    } catch (e) {
      console.error(e)
      toast.error('Print preview failed')
    }
  }

  const exportPDF = async () => {
    try {
      const { html, fileName } = buildCustomerReport()
      await downloadHtmlReport(html, fileName)
      toast.success('PDF downloaded')
    } catch (e) {
      console.error(e)
      toast.error('Failed to export PDF')
    }
  }

  const exportCSV = () => {
    try {
      downloadCsvFile(
        `customer_sales_${format(new Date(), 'yyyy-MM-dd')}.csv`,
        ['Date', 'Items', 'Subtotal', 'Discount', 'Total'],
        salesReportRows()
      )
      toast.success('CSV exported successfully')
    } catch {
      toast.error('Failed to export CSV')
    }
  }

  const onDelete = async () => {
    const confirmed = await confirm({ title: 'Delete Customer', message: 'Delete this customer?' })
    if (!confirmed) return
    dispatch({ type:'DELETE_CUSTOMER', payload:{ id } })
    toast.success('Customer deleted')
    navigate('/customers')
  }

  if (!customer) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Customer</h1>
          <button onClick={()=>navigate('/customers')} className="px-3 py-2 rounded border">Back</button>
        </div>
        <div className="p-6 border rounded text-gray-500">Customer not found.</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Customer Profile</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
          <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
          <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
          <button onClick={()=>navigate('/customers')} className="px-3 py-2 rounded border">Back</button>
          <button onClick={()=>setModalOpen(true)} className="px-3 py-2 rounded border">Edit</button>
          <button onClick={onDelete} className="px-3 py-2 rounded border text-red-600">Delete</button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="p-4 border rounded bg-white dark:bg-gray-900 md:col-span-2">
          <div className="text-lg font-semibold">{customer.name}</div>
          <div className="text-sm text-gray-600">{customer.phone}</div>
          <div className="mt-2 text-sm inline-flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded ${customer.isRegular ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{customer.isRegular ? 'Regular' : 'Normal'}</span>
            {totals.last && (<span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">Last: {totals.last}</span>)}
          </div>
        </div>
        <div className="grid gap-3">
          <div className="p-4 border rounded bg-white dark:bg-gray-900">
            <div className="text-sm text-gray-600">Visits</div>
            <div className="text-2xl font-semibold">{totals.visits}</div>
          </div>
          <div className="p-4 border rounded bg-white dark:bg-gray-900">
            <div className="text-sm text-gray-600">Spent</div>
            <div className="text-2xl font-semibold">${totals.spent.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Sales History</h2>
        </div>
        <div className="overflow-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Items</th>
                <th className="text-left p-2">Subtotal</th>
                <th className="text-left p-2">Discount</th>
                <th className="text-left p-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(s => (
                <tr key={s.id} className="border-t">
                  <td className="p-2">{s.date ? format(new Date(s.date), 'yyyy-MM-dd') : '-'}</td>
                  <td className="p-2">{(s.items||[]).map(it => {
                    const m = (state.menu||[]).find(mm => mm.id === it.itemId)
                    return `${m?.name || it.itemId} x${it.qty}`
                  }).join(', ')}</td>
                  <td className="p-2">${Number(((s.total||0) + (s.discount||0))).toFixed(2)}</td>
                  <td className="p-2">-${Number(s.discount||0).toFixed(2)}</td>
                  <td className="p-2">${Number(s.total||0).toFixed(2)}</td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-gray-500">No sales for this customer yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CustomerModal open={modalOpen} initial={customer} onClose={()=>setModalOpen(false)} />
      {ConfirmDialog}
    </div>
  )
}
