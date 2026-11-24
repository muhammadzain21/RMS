import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '@/state/DataContext.jsx'
import { useAuth } from '@/state/AuthContext.jsx'
import CustomerModal from '@features/customers/components/CustomerModal.jsx'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import { useConfirm } from '@shared/components/useConfirm.jsx'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '@shared/utils/reportDoc.js'
import { btnPrint, btnPdf, btnCsv, downloadCsvFile, exportDateStamp } from '@shared/utils/listReportExport.js'
import { saleNetSpent, salesForCustomer } from '@features/customers/utils/customerLedgerUtils.js'

export default function CustomerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useData()
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const [modalOpen, setModalOpen] = useState(false)
  const [fetchedCustomer, setFetchedCustomer] = useState(null)
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

  const customerFromState = useMemo(
    () => (state.customers || []).find(c => String(c.id || c._id) === String(id)),
    [state.customers, id]
  )
  const customer = customerFromState || fetchedCustomer

  useEffect(() => {
    if (customerFromState || !id) { setFetchedCustomer(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API}/api/customers/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: 'no-store',
        })
        if (!res.ok) return
        const row = await res.json()
        if (!cancelled && row) setFetchedCustomer({ ...row, id: row.id || row._id })
      } catch {}
    })()
    return () => { cancelled = true }
  }, [API, token, id, customerFromState])
  const sales = useMemo(
    () => (customer ? salesForCustomer(state.sales || [], customer) : []),
    [state.sales, customer]
  )

  const totals = useMemo(() => {
    const visits = sales.length
    const spent = sales.reduce((a, b) => a + saleNetSpent(b), 0)
    const last = sales[0]?.date || customer?.lastVisit || ''
    return { visits, spent, last }
  }, [sales, customer])

  const saleItemsText = (s) => (s.items || []).map(it => {
    const m = (state.menu || []).find(mm => String(mm.id) === String(it.itemId))
    return `${m?.name || it.name || it.itemId} x${it.qty}`
  }).join(', ')

  const salesReportRows = () => sales.map(s => [
    s.date ? format(new Date(s.date), 'yyyy-MM-dd') : '-',
    s.billNo || '-',
    s.tokenNo || '-',
    s.orderType || '-',
    String(s.paymentMethod || '-'),
    saleItemsText(s),
    saleNetSpent(s).toFixed(2),
  ])

  const buildCustomerReport = () => {
    const fileName = `Customer-Ledger-${customer?.name || id}-${exportDateStamp()}.pdf`
    const body =
      reportSummary([
        { label: 'Customer', amount: customer?.name || '-', cls: '' },
        { label: 'Phone', amount: customer?.phone || '-' },
        { label: 'Visits', amount: String(totals.visits) },
        { label: 'Total spent (PKR)', amount: totals.spent.toLocaleString() },
      ]) +
      reportSec(`Customer Ledger (${sales.length})`) +
      reportTable({
        headers: [
          'Date', 'Bill #', 'Token', 'Type', 'Payment', 'Items',
          { t: 'Amount', align: 'r' },
        ],
        numbered: true,
        rows: sales.map(s => [
          s.date ? format(new Date(s.date), 'yyyy-MM-dd') : '-',
          s.billNo || '-',
          s.tokenNo || '-',
          s.orderType || '-',
          String(s.paymentMethod || '-'),
          saleItemsText(s) || '-',
          { v: saleNetSpent(s).toLocaleString(), align: 'r' },
        ]),
        emptyText: 'No sales for this customer',
      })
    const html = wrapReportDoc({
      settings: state?.settings || {},
      title: `Customer Ledger: ${customer?.name || 'Profile'}`,
      reportLabel: 'Customer Ledger',
      reportNo: `Rpt #: CL-${customer?.id || id}`,
      metaLeft: [['Phone', customer?.phone || '-'], ['Generated', format(new Date(), 'yyyy-MM-dd h:mm a')]],
      metaRight: [['Regular', customer?.isRegular ? 'Yes' : 'No'], ['Visits', String(sales.length)]],
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
        `customer_ledger_${format(new Date(), 'yyyy-MM-dd')}.csv`,
        ['Date', 'Bill #', 'Token', 'Type', 'Payment', 'Items', 'Amount (PKR)'],
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
    dispatch({ type: 'DELETE_CUSTOMER', payload: { id } })
    toast.success('Customer deleted')
    navigate('/customers')
  }

  if (!customer) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Customer Ledger</h1>
          <button onClick={() => navigate('/customers')} className="px-3 py-2 rounded border">Back</button>
        </div>
        <div className="p-6 border rounded text-gray-500">Customer not found.</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Customer Ledger</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
          <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
          <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
          <button onClick={() => navigate('/customers')} className="px-3 py-2 rounded border">Back</button>
          <button onClick={() => setModalOpen(true)} className="px-3 py-2 rounded border">Edit</button>
          <button onClick={onDelete} className="px-3 py-2 rounded border text-red-600">Delete</button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="p-4 border rounded bg-white dark:bg-gray-900 md:col-span-2">
          <div className="text-lg font-semibold">{customer.name}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">{customer.phone || '—'}</div>
          {customer.address ? <div className="text-sm text-gray-500 mt-1">{customer.address}</div> : null}
          <div className="mt-2 text-sm inline-flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded ${customer.isRegular ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
              {customer.isRegular ? 'Regular' : 'Normal'}
            </span>
            {totals.last && (
              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">Last: {totals.last}</span>
            )}
          </div>
        </div>
        <div className="grid gap-3">
          <div className="p-4 border rounded bg-white dark:bg-gray-900">
            <div className="text-sm text-gray-600">Visits</div>
            <div className="text-2xl font-semibold">{totals.visits}</div>
          </div>
          <div className="p-4 border rounded bg-white dark:bg-gray-900">
            <div className="text-sm text-gray-600">Spent</div>
            <div className="text-2xl font-semibold">PKR {totals.spent.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Ledger / Sales History</h2>
          <div className="text-sm text-gray-500">{sales.length} sale{sales.length === 1 ? '' : 's'}</div>
        </div>
        <div className="overflow-auto border rounded-xl bg-white dark:bg-gray-900">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="text-left p-3 font-semibold">Date</th>
                <th className="text-left p-3 font-semibold">Bill #</th>
                <th className="text-left p-3 font-semibold">Token</th>
                <th className="text-left p-3 font-semibold">Type</th>
                <th className="text-left p-3 font-semibold">Payment</th>
                <th className="text-left p-3 font-semibold">Items</th>
                <th className="text-right p-3 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(s => (
                <tr key={s.id || s._id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50/80 dark:hover:bg-gray-800/40">
                  <td className="p-3 whitespace-nowrap">{s.date ? format(new Date(s.date), 'yyyy-MM-dd') : '—'}</td>
                  <td className="p-3 font-medium text-blue-700 dark:text-blue-300">{s.billNo || '—'}</td>
                  <td className="p-3">{s.tokenNo || '—'}</td>
                  <td className="p-3">{s.orderType || '—'}</td>
                  <td className="p-3 uppercase text-xs font-semibold">{String(s.paymentMethod || '—')}</td>
                  <td className="p-3 max-w-xs truncate" title={saleItemsText(s)}>{saleItemsText(s) || '—'}</td>
                  <td className="p-3 text-right font-semibold whitespace-nowrap">PKR {saleNetSpent(s).toLocaleString()}</td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    No sales linked to this customer yet. Delivery / call-center sales with the same phone will show here.
                  </td>
                </tr>
              )}
            </tbody>
            {sales.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                  <td colSpan={6} className="p-3 text-right font-bold">Total spent</td>
                  <td className="p-3 text-right font-bold">PKR {totals.spent.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <CustomerModal open={modalOpen} initial={customer} onClose={() => setModalOpen(false)} />
      {ConfirmDialog}
    </div>
  )
}
