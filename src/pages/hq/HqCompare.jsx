import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { ShoppingCart, Receipt, Wallet, TrendingUp } from 'lucide-react'
import DatePicker from '../../components/DatePicker.jsx'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import StatCard from '../../components/StatCard.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { btnPrint, btnPdf, btnCsv, downloadCsvFile } from '../../utils/listReportExport.js'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'

function api() {
  return (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
}

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export default function HqCompare() {
  const { token } = useAuth()
  const { state } = useData()
  const [from, setFrom] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [to, setTo] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(100)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${api()}/api/hq/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed')
      setData(j)
      setPage(1)
    } catch (e) {
      toast.error(e.message || 'Compare failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [token])

  const branches = data?.branches || []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return branches
    return branches.filter(r => [r.name, r.code].some(v => String(v || '').toLowerCase().includes(q)))
  }, [branches, search])

  const total = filtered.length
  const totalPages = Math.ceil(total / limit) || 1
  const pageSafe = Math.min(page, totalPages)
  const rows = filtered.slice((pageSafe - 1) * limit, pageSafe * limit)

  const reportRows = (items) => items.map(r => [
    `${r.name || ''} (${r.code || ''})`,
    r.bills ?? 0,
    r.salesTotal ?? 0,
    r.avgTicket ?? 0,
    r.expenses ?? 0,
    r.netApprox ?? 0,
    r.callCenterPending ?? 0,
    r.callCenterFulfilled ?? 0,
  ])

  const openPrintPreview = async () => {
    try {
      const body =
        reportSummary([
          { label: 'Sales', amount: fmt(data?.totals?.salesTotal) },
          { label: 'Bills', amount: fmt(data?.totals?.bills) },
          { label: 'Expenses', amount: fmt(data?.totals?.expenses) },
          { label: 'Net', amount: fmt(data?.totals?.netApprox) },
        ]) +
        reportSec(`Branch Compare (${filtered.length})`) +
        reportTable({
          headers: ['Branch', 'Bills', 'Sales', 'Avg ticket', 'Expenses', 'Net', 'CC pending', 'CC done'],
          numbered: true,
          rows: filtered.map(r => [
            `${r.name} (${r.code})`,
            fmt(r.bills),
            fmt(r.salesTotal),
            fmt(r.avgTicket),
            fmt(r.expenses),
            fmt(r.netApprox),
            fmt(r.callCenterPending),
            fmt(r.callCenterFulfilled),
          ]),
          emptyText: 'No branch data',
        })
      const html = wrapReportDoc({
        settings: state?.settings || {},
        title: 'Branch Compare',
        reportLabel: 'HQ Compare',
        reportNo: `Rpt #: CMP-${format(new Date(), 'yyyy-MM-dd')}`,
        metaLeft: [['From', from], ['To', to], ['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')]],
        metaRight: [['Branches', String(filtered.length)]],
        body,
      })
      await previewHtmlReport(html, `Branch-Compare-${format(new Date(), 'yyyy-MM-dd')}.pdf`)
      toast.success('Print preview opened')
    } catch {
      toast.error('Print preview failed')
    }
  }

  const exportPDF = () => {
    try {
      const doc = new jsPDF('l', 'pt', 'a4')
      doc.setFontSize(14)
      doc.text(state?.settings?.companyName || 'Branch Compare', 40, 32)
      doc.setFontSize(10)
      doc.text(`${from} → ${to} · ${filtered.length} branches`, 40, 46)
      doc.autoTable({
        head: [['Branch', 'Bills', 'Sales', 'Avg', 'Expenses', 'Net', 'CC pend', 'CC done']],
        body: reportRows(filtered),
        startY: 54,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        margin: { left: 40, right: 40 },
      })
      doc.save(`branch_compare_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
      toast.success('PDF exported')
    } catch {
      toast.error('PDF export failed')
    }
  }

  const exportCSV = () => {
    try {
      downloadCsvFile(
        `branch_compare_${format(new Date(), 'yyyy-MM-dd')}.csv`,
        ['Branch', 'Bills', 'Sales', 'Avg ticket', 'Expenses', 'Net', 'CC pending', 'CC done'],
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
        <h1 className="page-title">Branch Compare</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-shrink-0">
            <DatePicker label="From" value={from} onChange={v => { if (v) setFrom(v) }} allowClear={false} />
          </div>
          <div className="flex-shrink-0">
            <DatePicker label="To" value={to} onChange={v => { if (v) setTo(v) }} allowClear={false} />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs font-bold text-[var(--color-text-body)] tracking-wide">Search</label>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Branch name or code…"
              className="mt-1 w-full px-3 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div className="flex items-end gap-3 flex-shrink-0">
            <button type="button" onClick={load} disabled={loading} className="ui-btn ui-btn-secondary whitespace-nowrap">
              {loading ? 'Loading…' : 'Compare'}
            </button>
            <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
            <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
            <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
          </div>
        </div>
      </div>

      {data?.totals && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Sales" value={fmt(data.totals.salesTotal)} icon={ShoppingCart} iconColor="bg-blue-500" />
          <StatCard title="Bills" value={fmt(data.totals.bills)} icon={Receipt} iconColor="bg-indigo-500" />
          <StatCard title="Expenses" value={fmt(data.totals.expenses)} icon={Wallet} iconColor="bg-rose-500" />
          <StatCard title="Net (approx)" value={fmt(data.totals.netApprox)} icon={TrendingUp} iconColor="bg-emerald-500" />
        </div>
      )}

      <DataTable
        columns={[
          { label: 'SR No', key: 'srNo', render: (_, idx) => <span className="font-medium text-[var(--color-text-body)]">{(pageSafe - 1) * limit + idx + 1}</span> },
          {
            label: 'Branch',
            key: 'name',
            render: r => (
              <span className="font-semibold">
                {r.name} <span className="text-xs font-medium text-[var(--color-text-body)]">({r.code})</span>
              </span>
            ),
          },
          { label: 'Bills', key: 'bills', render: r => fmt(r.bills) },
          { label: 'Sales', key: 'salesTotal', render: r => fmt(r.salesTotal) },
          { label: 'Avg ticket', key: 'avgTicket', render: r => fmt(r.avgTicket) },
          { label: 'Expenses', key: 'expenses', render: r => fmt(r.expenses) },
          { label: 'Net', key: 'netApprox', render: r => <span className="font-bold">{fmt(r.netApprox)}</span> },
          { label: 'CC pending', key: 'callCenterPending', render: r => fmt(r.callCenterPending) },
          { label: 'CC done', key: 'callCenterFulfilled', render: r => fmt(r.callCenterFulfilled) },
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
