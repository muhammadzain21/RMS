import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { useNavigate } from 'react-router-dom'
import DatePicker from '../../components/DatePicker.jsx'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { btnPrint, btnPdf, btnCsv, btnPrimary, downloadCsvFile, exportDateStamp } from '../../utils/listReportExport.js'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'
import { warehouseApiBase } from './warehouseApi.js'

export default function WarehouseTransferHistory() {
  const { token } = useAuth()
  const { state } = useData()
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(100)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/transfers`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed')
      setList(await res.json())
    } catch {
      toast.error('Could not load transfer history')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [token])

  const filtered = useMemo(() => {
    return list.filter(t => {
      const d = String(t.date || '').slice(0, 10)
      if (from && d && d < from) return false
      if (to && d && d > to) return false
      const q = search.trim().toLowerCase()
      if (!q) return true
      const hay = [t.toBranchName, t.toBranchId, t.status, t.notes, ...(t.items || []).map(i => i.name)].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [list, search, from, to])

  const total = filtered.length
  const totalPages = Math.ceil(total / limit) || 1
  const pageSafe = Math.min(page, totalPages)
  const rows = filtered.slice((pageSafe - 1) * limit, pageSafe * limit)

  const reportRows = (items) => items.map(t => [
    t.date || '',
    t.toBranchName || t.toBranchId || '',
    t.status || '',
    (t.items || []).map(i => `${i.name}×${i.qty}`).join('; '),
    t.notes || '',
  ])

  const openPrintPreview = async () => {
    try {
      const body =
        reportSummary([{ label: 'Transfers', amount: String(filtered.length) }]) +
        reportSec(`Transfer History (${filtered.length})`) +
        reportTable({
          headers: ['Date', 'Branch', 'Status', 'Items', 'Notes'],
          numbered: true,
          rows: filtered.map(t => [
            t.date || '-',
            t.toBranchName || t.toBranchId || '-',
            t.status || '-',
            (t.items || []).map(i => `${i.name}×${i.qty}`).join(', ') || '-',
            t.notes || '-',
          ]),
          emptyText: 'No transfers',
        })
      const html = wrapReportDoc({
        settings: state?.settings || {},
        title: 'Transfer History',
        reportLabel: 'Warehouse Transfers',
        reportNo: `Rpt #: WHT-${exportDateStamp()}`,
        metaLeft: [
          ['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')],
          ['From', from || 'All'],
          ['To', to || 'All'],
        ],
        metaRight: [['Records', String(filtered.length)]],
        body,
      })
      await previewHtmlReport(html, `Transfer-History-${exportDateStamp()}.pdf`)
      toast.success('Print preview opened')
    } catch {
      toast.error('Print preview failed')
    }
  }

  const exportPDF = () => {
    try {
      const doc = new jsPDF('l', 'pt', 'a4')
      doc.setFontSize(14)
      doc.text(state?.settings?.companyName || 'Transfer History', 40, 32)
      doc.setFontSize(10)
      doc.text(`${filtered.length} transfers`, 40, 46)
      doc.autoTable({
        head: [['Date', 'Branch', 'Status', 'Items', 'Notes']],
        body: reportRows(filtered),
        startY: 54,
        styles: { fontSize: 7, cellPadding: 3 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        margin: { left: 40, right: 40 },
      })
      doc.save(`transfer_history_${exportDateStamp()}.pdf`)
      toast.success('PDF exported')
    } catch {
      toast.error('PDF export failed')
    }
  }

  const exportCSV = () => {
    try {
      downloadCsvFile(
        `transfer_history_${format(new Date(), 'yyyy-MM-dd')}.csv`,
        ['Date', 'Branch', 'Status', 'Items', 'Notes'],
        reportRows(filtered)
      )
      toast.success('CSV exported')
    } catch {
      toast.error('CSV export failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="page-title">Warehouse Transfer History</h1>
        <button type="button" onClick={() => navigate('/warehouse/transfers')} className={btnPrimary}>
          + New Transfer
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-shrink-0">
            <DatePicker label="From" value={from} onChange={v => { setFrom(v || ''); setPage(1) }} />
          </div>
          <div className="flex-shrink-0">
            <DatePicker label="To" value={to} onChange={v => { setTo(v || ''); setPage(1) }} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-bold text-[var(--color-text-body)] tracking-wide">Search</label>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Branch, status, item…"
              className="mt-1 w-full px-3 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div className="flex items-end gap-3 flex-shrink-0">
            <button type="button" onClick={load} className="ui-btn ui-btn-secondary whitespace-nowrap">Refresh</button>
            <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
            <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
            <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
          </div>
        </div>
      </div>

      <DataTable
        columns={[
          { label: 'SR No', key: 'srNo', render: (_, idx) => <span className="font-medium text-[var(--color-text-body)]">{(pageSafe - 1) * limit + idx + 1}</span> },
          { label: 'Date', key: 'date', render: r => r.date || '—' },
          { label: 'Branch', key: 'toBranchName', render: r => <span className="font-medium">{r.toBranchName || r.toBranchId}</span> },
          {
            label: 'Status',
            key: 'status',
            render: r => (
              <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                r.status === 'received' ? 'bg-green-100 text-green-700'
                  : r.status === 'sent' ? 'bg-amber-100 text-amber-800'
                    : 'bg-gray-100 text-gray-600'
              }`}>
                {r.status}
              </span>
            ),
          },
          { label: 'Items', key: 'items', render: r => <span className="text-xs">{(r.items || []).map(i => `${i.name}×${i.qty}`).join(', ')}</span> },
          { label: 'Notes', key: 'notes', render: r => r.notes || '—' },
        ]}
        data={rows}
        searchable={false}
        exportable={false}
        pageSize={9999}
        showLimit={false}
        hidePagination
        maxHeight={520}
      />

      <Pagination
        page={pageSafe}
        pages={totalPages}
        total={total}
        limit={limit}
        onLimitChange={n => { setLimit(n); setPage(1) }}
        onPageChange={setPage}
        loading={loading}
      />
    </div>
  )
}
