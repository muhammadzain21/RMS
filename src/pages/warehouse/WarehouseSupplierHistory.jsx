import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { ArrowLeft, Wallet, ShoppingCart, ListTree } from 'lucide-react'
import DatePicker from '../../components/DatePicker.jsx'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { btnPrint, btnPdf, btnCsv, btnPrimary, downloadCsvFile, exportDateStamp } from '../../utils/listReportExport.js'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'
import { warehouseApiBase } from './warehouseApi.js'
import WarehousePaymentModal from './WarehousePaymentModal.jsx'

const TABS = [
  { id: 'all', label: 'All', icon: ListTree },
  { id: 'purchases', label: 'Purchases', icon: ShoppingCart },
  { id: 'payments', label: 'Payments', icon: Wallet },
]

function inRange(dateStr, from, to) {
  const d = String(dateStr || '').slice(0, 10)
  if (!d) return !from && !to
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function WarehouseSupplierHistory() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()
  const { state } = useData()

  const [supplier, setSupplier] = useState(null)
  const [purchases, setPurchases] = useState([])
  const [payments, setPayments] = useState([])
  const [ledger, setLedger] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(100)
  const [payOpen, setPayOpen] = useState(false)
  const [payPurchaseId, setPayPurchaseId] = useState('')
  const [expandedPurchase, setExpandedPurchase] = useState(null)

  const load = useCallback(async () => {
    if (!id || !token) return
    setLoading(true)
    try {
      const [supRes, purchRes, payRes, ledRes] = await Promise.all([
        fetch(`${warehouseApiBase()}/api/warehouse/suppliers`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${warehouseApiBase()}/api/warehouse/purchases?supplierId=${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${warehouseApiBase()}/api/warehouse/payments?supplierId=${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${warehouseApiBase()}/api/warehouse/suppliers/${id}/ledger`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      if (supRes.ok) {
        const list = await supRes.json()
        const found = (list || []).find(s => String(s._id || s.id) === String(id))
        setSupplier(found || null)
        if (!found) toast.error('Supplier not found')
      }
      if (purchRes.ok) setPurchases(await purchRes.json())
      else setPurchases([])
      if (payRes.ok) setPayments(await payRes.json())
      else setPayments([])
      if (ledRes.ok) setLedger(await ledRes.json())
      else setLedger(null)
    } catch {
      toast.error('Could not load supplier history')
    } finally {
      setLoading(false)
    }
  }, [id, token])

  useEffect(() => { load() }, [load])

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (purchases || []).filter(p => {
      if (!inRange(p.date, from, to)) return false
      if (!q) return true
      const hay = [
        p.invoiceNo, p.notes, p.supplierName,
        ...(p.items || []).map(i => i.name),
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [purchases, from, to, search])

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (payments || []).filter(p => {
      if (!inRange(p.date, from, to)) return false
      if (!q) return true
      const hay = [p.method, p.reference, p.notes, p.amount].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [payments, from, to, search])

  const allRows = useMemo(() => {
    const purchaseRows = filteredPurchases.map(p => ({
      _kind: 'purchase',
      _sort: `${String(p.date || '').slice(0, 10)}T${p.createdAt || ''}`,
      id: p._id,
      date: p.date,
      type: 'Purchase',
      ref: p.invoiceNo || String(p._id || '').slice(-8),
      debit: Number(p.total) || 0,
      credit: 0,
      method: p.paymentMethod || '—',
      notes: p.notes || '',
      raw: p,
    }))
    const paymentRows = filteredPayments.map(p => ({
      _kind: 'payment',
      _sort: `${String(p.date || '').slice(0, 10)}T${p.createdAt || ''}`,
      id: p._id,
      date: p.date,
      type: 'Payment',
      ref: p.reference || String(p._id || '').slice(-8),
      debit: 0,
      credit: Number(p.amount) || 0,
      method: p.method || '—',
      notes: p.notes || '',
      raw: p,
    }))
    return [...purchaseRows, ...paymentRows].sort((a, b) => String(b._sort).localeCompare(String(a._sort)))
  }, [filteredPurchases, filteredPayments])

  const periodTotals = useMemo(() => {
    const purchaseTotal = filteredPurchases.reduce((s, p) => s + (Number(p.total) || 0), 0)
    const paidTotal = filteredPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    return {
      purchaseTotal,
      paidTotal,
      balance: purchaseTotal - paidTotal,
      purchaseCount: filteredPurchases.length,
      paymentCount: filteredPayments.length,
    }
  }, [filteredPurchases, filteredPayments])

  const activeRows = tab === 'purchases'
    ? filteredPurchases
    : tab === 'payments'
      ? filteredPayments
      : allRows

  const total = activeRows.length
  const totalPages = Math.ceil(total / limit) || 1
  const pageSafe = Math.min(page, totalPages)
  const pageRows = activeRows.slice((pageSafe - 1) * limit, pageSafe * limit)

  useEffect(() => { setPage(1) }, [tab, from, to, search])

  const reportRows = () => {
    if (tab === 'purchases') {
      return filteredPurchases.map(p => [
        p.date || '',
        p.invoiceNo || '',
        (p.items || []).map(i => `${i.name}×${i.qty}`).join('; '),
        Number(p.total || 0),
        Number(p.paidAmount || 0),
        p.notes || '',
      ])
    }
    if (tab === 'payments') {
      return filteredPayments.map(p => [
        p.date || '',
        p.method || '',
        p.reference || '',
        Number(p.amount || 0),
        p.notes || '',
      ])
    }
    return allRows.map(r => [
      r.date || '',
      r.type,
      r.ref || '',
      r.debit || 0,
      r.credit || 0,
      r.method || '',
      r.notes || '',
    ])
  }

  const openPrintPreview = async () => {
    try {
      let headers
      let rows
      let title
      if (tab === 'purchases') {
        title = 'Purchases'
        headers = ['Date', 'Invoice', 'Items', { t: 'Total', align: 'r' }, { t: 'Paid', align: 'r' }, 'Notes']
        rows = filteredPurchases.map(p => [
          p.date || '-',
          p.invoiceNo || '-',
          (p.items || []).map(i => `${i.name}×${i.qty}`).join(', ') || '-',
          { v: money(p.total), align: 'r' },
          { v: money(p.paidAmount), align: 'r' },
          p.notes || '-',
        ])
      } else if (tab === 'payments') {
        title = 'Payments'
        headers = ['Date', 'Method', 'Reference', { t: 'Amount', align: 'r' }, 'Notes']
        rows = filteredPayments.map(p => [
          p.date || '-',
          (p.method || '-').toString(),
          p.reference || '-',
          { v: money(p.amount), align: 'r' },
          p.notes || '-',
        ])
      } else {
        title = 'All activity'
        headers = ['Date', 'Type', 'Ref', { t: 'Debit', align: 'r' }, { t: 'Credit', align: 'r' }, 'Method', 'Notes']
        rows = allRows.map(r => [
          r.date || '-',
          r.type,
          r.ref || '-',
          { v: r.debit ? money(r.debit) : '—', align: 'r' },
          { v: r.credit ? money(r.credit) : '—', align: 'r' },
          r.method || '-',
          r.notes || '-',
        ])
      }
      const body =
        reportSummary([
          { label: 'Purchases (period)', amount: money(periodTotals.purchaseTotal) },
          { label: 'Payments (period)', amount: money(periodTotals.paidTotal) },
          { label: 'Balance (period)', amount: money(periodTotals.balance) },
        ]) +
        reportSec(`${title} (${rows.length})`) +
        reportTable({ headers, numbered: true, rows, emptyText: 'No records' })
      const html = wrapReportDoc({
        settings: state?.settings || {},
        title: `Supplier History — ${supplier?.name || id}`,
        reportLabel: `Warehouse Supplier ${title}`,
        reportNo: `Rpt #: WSH-${exportDateStamp()}`,
        metaLeft: [
          ['Supplier', supplier?.name || id],
          ['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')],
          ['From', from || 'All'],
          ['To', to || 'All'],
        ],
        metaRight: [
          ['Tab', title],
          ['Records', String(rows.length)],
          ['Overall due', money(ledger?.balance)],
        ],
        body,
      })
      await previewHtmlReport(html, `Supplier-History-${supplier?.name || id}-${exportDateStamp()}.pdf`)
      toast.success('Print preview opened')
    } catch {
      toast.error('Print preview failed')
    }
  }

  const exportPDF = () => {
    try {
      const doc = new jsPDF('l', 'pt', 'a4')
      doc.setFontSize(14)
      doc.text(`${supplier?.name || 'Supplier'} — History`, 40, 32)
      doc.setFontSize(10)
      doc.text(`Period ${from || '…'} to ${to || '…'} · ${activeRows.length} rows`, 40, 46)
      const head = tab === 'purchases'
        ? [['Date', 'Invoice', 'Items', 'Total', 'Paid', 'Notes']]
        : tab === 'payments'
          ? [['Date', 'Method', 'Reference', 'Amount', 'Notes']]
          : [['Date', 'Type', 'Ref', 'Debit', 'Credit', 'Method', 'Notes']]
      doc.autoTable({
        head,
        body: reportRows(),
        startY: 54,
        styles: { fontSize: 7, cellPadding: 3 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        margin: { left: 40, right: 40 },
      })
      doc.save(`supplier_history_${id}_${exportDateStamp()}.pdf`)
      toast.success('PDF exported')
    } catch {
      toast.error('PDF export failed')
    }
  }

  const exportCSV = () => {
    try {
      const headers = tab === 'purchases'
        ? ['Date', 'Invoice', 'Items', 'Total', 'Paid', 'Notes']
        : tab === 'payments'
          ? ['Date', 'Method', 'Reference', 'Amount', 'Notes']
          : ['Date', 'Type', 'Ref', 'Debit', 'Credit', 'Method', 'Notes']
      downloadCsvFile(`supplier_history_${id}_${exportDateStamp()}.csv`, headers, reportRows())
      toast.success('CSV exported')
    } catch {
      toast.error('CSV export failed')
    }
  }

  const allColumns = [
    { label: 'SR No', key: 'srNo', render: (_, idx) => <span className="font-medium text-[var(--color-text-body)]">{(pageSafe - 1) * limit + idx + 1}</span> },
    { label: 'Date', key: 'date', render: r => r.date || '—' },
    {
      label: 'Type',
      key: 'type',
      render: r => (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
          r._kind === 'payment'
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
        }`}>
          {r.type}
        </span>
      ),
    },
    { label: 'Ref', key: 'ref', render: r => <span className="text-xs text-slate-600 dark:text-slate-300">{r.ref || '—'}</span> },
    { label: 'Debit', key: 'debit', render: r => r.debit ? <span className="font-semibold text-rose-600">{money(r.debit)}</span> : '—' },
    { label: 'Credit', key: 'credit', render: r => r.credit ? <span className="font-semibold text-emerald-600">{money(r.credit)}</span> : '—' },
    { label: 'Method', key: 'method', render: r => <span className="capitalize">{r.method || '—'}</span> },
    { label: 'Notes', key: 'notes', render: r => r.notes || '—' },
  ]

  const purchaseColumns = [
    { label: 'SR No', key: 'srNo', render: (_, idx) => <span className="font-medium text-[var(--color-text-body)]">{(pageSafe - 1) * limit + idx + 1}</span> },
    { label: 'Date', key: 'date', render: r => r.date || '—' },
    { label: 'Invoice', key: 'invoiceNo', render: r => r.invoiceNo || '—' },
    {
      label: 'Items',
      key: 'items',
      render: r => (
        <button
          type="button"
          onClick={() => setExpandedPurchase(expandedPurchase === r._id ? null : r._id)}
          className="text-left text-xs text-indigo-600 hover:underline dark:text-indigo-300"
        >
          {(r.items || []).length
            ? `${(r.items || []).length} line${(r.items || []).length === 1 ? '' : 's'} — click to ${expandedPurchase === r._id ? 'hide' : 'view'}`
            : '—'}
        </button>
      ),
    },
    { label: 'Total', key: 'total', render: r => <span className="font-semibold">{money(r.total)}</span> },
    { label: 'Paid', key: 'paidAmount', render: r => money(r.paidAmount) },
    {
      label: 'Left',
      key: 'balanceDue',
      render: r => {
        const left = Number(r.balanceDue != null ? r.balanceDue : (Number(r.total) || 0) - (Number(r.paidAmount) || 0))
        return <span className={`font-semibold ${left > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{money(left)}</span>
      },
    },
    {
      label: 'Status',
      key: 'status',
      render: r => {
        const left = Number(r.balanceDue != null ? r.balanceDue : (Number(r.total) || 0) - (Number(r.paidAmount) || 0))
        const status = r.status || (left <= 0.0001 ? 'paid' : (Number(r.paidAmount) > 0 ? 'partial' : 'unpaid'))
        const cls = status === 'paid'
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
          : status === 'partial'
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
            : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
        return <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold capitalize ${cls}`}>{status}</span>
      },
    },
    {
      label: '',
      key: 'pay',
      render: r => {
        const left = Number(r.balanceDue != null ? r.balanceDue : (Number(r.total) || 0) - (Number(r.paidAmount) || 0))
        if (left <= 0.0001) return null
        return (
          <button
            type="button"
            onClick={() => { setPayPurchaseId(String(r._id)); setPayOpen(true) }}
            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-500"
          >
            Pay
          </button>
        )
      },
    },
    { label: 'Notes', key: 'notes', render: r => r.notes || '—' },
  ]

  const paymentColumns = [
    { label: 'SR No', key: 'srNo', render: (_, idx) => <span className="font-medium text-[var(--color-text-body)]">{(pageSafe - 1) * limit + idx + 1}</span> },
    { label: 'Date', key: 'date', render: r => r.date || '—' },
    { label: 'Invoice', key: 'invoiceNo', render: r => r.invoiceNo || (r.purchaseId ? String(r.purchaseId).slice(-6) : '—') },
    {
      label: 'Method',
      key: 'method',
      render: r => (
        <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize dark:bg-slate-700">
          {r.method || '—'}
        </span>
      ),
    },
    { label: 'Reference', key: 'reference', render: r => r.reference || '—' },
    { label: 'Amount', key: 'amount', render: r => <span className="font-semibold text-emerald-600">{money(r.amount)}</span> },
    { label: 'Notes', key: 'notes', render: r => r.notes || '—' },
  ]

  const columns = tab === 'purchases' ? purchaseColumns : tab === 'payments' ? paymentColumns : allColumns

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/warehouse/suppliers')}
            className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            title="Back to suppliers"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">{supplier?.name || 'Supplier record'}</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {[supplier?.company, supplier?.phone].filter(Boolean).join(' · ') || 'This supplier only'}
              {' · '}purchases, payments & balance (not the global purchase history)
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setPayOpen(true)} className={btnPrimary}>
          + Record payment
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-gray-800">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Overall purchases</div>
          <div className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{money(ledger?.purchaseTotal)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-gray-800">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Overall paid</div>
          <div className="mt-1 text-2xl font-black text-emerald-600">{money(ledger?.paidTotal)}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30">
          <div className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">Balance due</div>
          <div className="mt-1 text-2xl font-black text-amber-800 dark:text-amber-200">{money(ledger?.balance)}</div>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm dark:border-indigo-900/40 dark:bg-indigo-950/30">
          <div className="text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Period filter</div>
          <div className="mt-1 text-sm font-semibold text-indigo-900 dark:text-indigo-100">
            {periodTotals.purchaseCount} purchases · {periodTotals.paymentCount} payments
          </div>
          <div className="mt-0.5 text-xs text-indigo-700/80 dark:text-indigo-300/80">
            Net {money(periodTotals.balance)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-shrink-0">
            <DatePicker label="From" value={from} onChange={v => setFrom(v || '')} />
          </div>
          <div className="flex-shrink-0">
            <DatePicker label="To" value={to} onChange={v => setTo(v || '')} />
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="text-xs font-bold tracking-wide text-[var(--color-text-body)]">Search</label>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tab === 'payments' ? 'Method, reference, notes…' : 'Invoice, item, notes…'}
              className="mt-1 w-full rounded-lg border-2 border-indigo-200 bg-white px-3 py-2 text-gray-900 transition-all focus:ring-2 focus:ring-indigo-500 dark:border-indigo-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div className="flex flex-shrink-0 items-end gap-3">
            <button type="button" onClick={load} className="ui-btn ui-btn-secondary whitespace-nowrap">Refresh</button>
            <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
            <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
            <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map(t => {
          const Icon = t.icon
          const count = t.id === 'purchases'
            ? filteredPurchases.length
            : t.id === 'payments'
              ? filteredPayments.length
              : allRows.length
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                active
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-gray-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Icon size={16} />
              {t.label}
              <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <DataTable
        columns={columns}
        data={pageRows}
        searchable={false}
        exportable={false}
        pageSize={9999}
        showLimit={false}
        hidePagination
        maxHeight={520}
      />

      {tab === 'purchases' && expandedPurchase && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
          {(() => {
            const p = filteredPurchases.find(x => x._id === expandedPurchase)
            if (!p) return <div className="text-sm text-slate-500">Purchase not in current filter</div>
            return (
              <>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-bold text-indigo-900 dark:text-indigo-100">
                    Purchase lines — {p.invoiceNo || String(p._id).slice(-8)} · {p.date || '—'}
                  </div>
                  <button type="button" onClick={() => setExpandedPurchase(null)} className="text-xs font-semibold text-indigo-600 hover:underline">Close</button>
                </div>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-slate-500">
                      <th className="py-1 pr-3">Item</th>
                      <th className="py-1 pr-3">Qty</th>
                      <th className="py-1 pr-3">Unit</th>
                      <th className="py-1 pr-3 text-right">Unit cost</th>
                      <th className="py-1 text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(p.items || []).map((line, i) => (
                      <tr key={i} className="border-t border-indigo-100 dark:border-indigo-900/40">
                        <td className="py-1.5 pr-3 font-medium">{line.name}</td>
                        <td className="py-1.5 pr-3">{line.qty}</td>
                        <td className="py-1.5 pr-3">{line.unit || '—'}</td>
                        <td className="py-1.5 pr-3 text-right">{money(line.unitCost)}</td>
                        <td className="py-1.5 text-right font-semibold">{money(line.lineTotal ?? (Number(line.qty) * Number(line.unitCost)))}</td>
                      </tr>
                    ))}
                    {!(p.items || []).length && (
                      <tr><td colSpan={5} className="py-4 text-center text-slate-400">No line items</td></tr>
                    )}
                  </tbody>
                </table>
              </>
            )
          })()}
        </div>
      )}

      <Pagination
        page={pageSafe}
        pages={totalPages}
        total={total}
        limit={limit}
        onLimitChange={n => { setLimit(n); setPage(1) }}
        onPageChange={setPage}
        loading={loading}
      />

      <WarehousePaymentModal
        open={payOpen}
        supplier={supplier}
        balanceDue={Number(ledger?.balance) || 0}
        preselectPurchaseId={payPurchaseId}
        onClose={(saved) => {
          setPayOpen(false)
          setPayPurchaseId('')
          if (saved) load()
        }}
      />
    </div>
  )
}
