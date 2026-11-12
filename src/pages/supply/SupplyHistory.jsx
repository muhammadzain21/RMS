import { useData } from '../../state/DataContext.jsx'
import { useMemo, useState, useEffect } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { useConfirm } from '../../components/useConfirm.jsx'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'
import BranchPurchaseModal from '../../components/BranchPurchaseModal.jsx'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '../../utils/reportDoc.js'
import { exportDateStamp } from '../../utils/listReportExport.js'

const btnPrint = 'ui-btn ui-btn-print'
const btnPdf = 'ui-btn ui-btn-pdf'
const btnCsv = 'ui-btn ui-btn-csv'

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export default function SupplyHistory() {
  const { state, dispatch, businessDate } = useData()
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const [from, setFrom] = useState(businessDate || '')
  const [to, setTo] = useState(businessDate || '')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(100)
  const [detail, setDetail] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }

  useEffect(() => { reloadSupplies(true) }, [])

  const reloadSupplies = async (silent = false) => {
    try {
      const [sRes, iRes] = await Promise.all([
        fetch(`${API}/api/supplies`, { headers }),
        fetch(`${API}/api/ingredients`, { headers }),
      ])
      const patch = {}
      if (sRes.ok) {
        const rows = await sRes.json()
        patch.supplies = (rows || []).map(x => ({ ...x, id: x.id || x._id }))
      } else if (!silent) {
        toast.error(`Reload failed: ${sRes.status}`)
        return
      }
      if (iRes.ok) {
        const rows = await iRes.json()
        patch.ingredients = (rows || []).map(x => ({ ...x, id: x.id || x._id }))
      }
      if (Object.keys(patch).length) dispatch({ type: 'HYDRATE', payload: patch })
      if (!silent) toast.success('Purchases reloaded')
    } catch {
      if (!silent) toast.error('Network error reloading purchases')
    }
  }

  const rows = useMemo(() => {
    let list = state.supplies || []
    if (from && to) list = list.filter(s => s.date >= from && s.date <= to)
    return list
  }, [state.supplies, from, to])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      const sup = (state.suppliers || []).find(s => String(s.id) === String(r.supplierId))
      const supplier = (sup?.name || r.supplier || '').toLowerCase()
      const blob = [
        r.date, r.invoiceNo, r.notes, supplier,
        ...(r.items || []).map(i => i.name),
      ].join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [rows, search, state.suppliers])

  const totalCost = useMemo(() => filtered.reduce((a, r) => a + Number(r.cost || 0), 0), [filtered])
  const totalItems = useMemo(() => filtered.reduce((a, r) => a + (r.items || []).length, 0), [filtered])
  const paginated = filtered.slice((page - 1) * limit, page * limit)
  const pages = Math.ceil(filtered.length / limit) || 1

  const supplierName = (r) => {
    const sup = (state.suppliers || []).find(s => String(s.id) === String(r.supplierId))
    return sup?.name || sup?.company || r.supplier || '—'
  }

  const deletePurchase = async (r) => {
    const ok = await confirm({
      title: 'Delete purchase',
      message: `Delete invoice ${r.invoiceNo || String(r.id || r._id).slice(-6)} and reverse stock?`,
    })
    if (!ok) return
    try {
      const id = r.id || r._id
      const res = await fetch(`${API}/api/supplies/${id}`, { method: 'DELETE', headers })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Delete failed')
      toast.success('Purchase deleted')
      if ((detail?.id || detail?._id) === id) setDetail(null)
      await reloadSupplies(true)
    } catch (err) {
      toast.error(err.message || 'Failed')
    }
  }

  const buildReportHtml = () => {
    const fileName = `Branch-Purchases-${from || 'all'}.pdf`
    const body =
      reportSummary([
        { label: 'Purchases', amount: String(filtered.length) },
        { label: 'Total cost', amount: `PKR ${totalCost.toLocaleString()}` },
        { label: 'Line items', amount: String(totalItems) },
      ]) +
      reportSec(`Branch Purchases (${filtered.length})`) +
      reportTable({
        headers: ['Date', 'Supplier', 'Invoice', 'Items', { t: 'Total', align: 'r' }],
        numbered: true,
        rows: filtered.map(r => [
          r.date,
          supplierName(r),
          r.invoiceNo || '—',
          String((r.items || []).length),
          { v: `PKR ${Number(r.cost || 0).toLocaleString()}`, align: 'r' },
        ]),
        emptyText: 'No purchase records found',
      })
    const html = wrapReportDoc({
      settings: state?.settings || {},
      title: 'Branch Purchases',
      reportLabel: 'Branch Purchases Report',
      reportNo: `Rpt #: PUR-${from || 'all'}-${to || 'all'}`,
      metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['From', from || '...'], ['To', to || '...']],
      metaRight: [['Records', String(filtered.length)], ['Total cost', `PKR ${totalCost.toLocaleString()}`]],
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
      const header = ['Date', 'Supplier', 'Invoice', 'Items', 'Total']
      const lines = filtered.map(r =>
        [r.date, supplierName(r), r.invoiceNo || '', (r.items || []).length, Number(r.cost || 0)]
          .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
      )
      const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `branch_purchases_${exportDateStamp()}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV exported successfully')
    } catch {
      toast.error('Failed to export CSV')
    }
  }

  return (
    <div className="space-y-4">
      {ConfirmDialog}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="page-title">Branch Purchases</h1>
        <button
          type="button"
          onClick={() => { setEditing(null); setFormOpen(true) }}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
        >
          + New purchase
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Purchases</div>
          <div className="text-2xl font-bold mt-1 text-slate-800 dark:text-slate-100">{filtered.length}</div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">invoices</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Cost</div>
          <div className="text-2xl font-bold mt-1 text-emerald-600">PKR {totalCost.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Line Items</div>
          <div className="text-2xl font-bold mt-1 text-slate-800 dark:text-slate-100">{totalItems}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl card card-pad">
        <div className="flex gap-3 flex-shrink-0">
          <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
          <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
          <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
        </div>
        <div className="flex-shrink-0"><DatePicker label="From" value={from} onChange={v => setFrom(v)} /></div>
        <div className="flex-shrink-0"><DatePicker label="To" value={to} onChange={v => setTo(v)} /></div>
        <div className="flex-1 min-w-0 basis-full sm:basis-auto">
          <label className="text-xs font-semibold text-[var(--color-text-muted)] tracking-wide">Search</label>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Invoice, supplier, item…" className="mt-1 w-full px-3 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all" />
        </div>
        <button type="button" onClick={() => reloadSupplies()} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary font-medium shadow-md hover:shadow-lg transition-all whitespace-nowrap">Reload</button>
      </div>

      <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
            <tr>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Date</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Supplier</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Invoice</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Items</th>
              <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Total</th>
              <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(r => {
              const id = r.id || r._id
              const lineCount = (r.items || []).length
              return (
                <tr key={id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="p-3 text-gray-700 dark:text-gray-300">{r.date}</td>
                  <td className="p-3 text-gray-600 dark:text-gray-400">{supplierName(r)}</td>
                  <td className="p-3 text-gray-700 dark:text-gray-300">{r.invoiceNo || '—'}</td>
                  <td className="p-3 text-gray-600 dark:text-gray-400">
                    {lineCount} item{lineCount === 1 ? '' : 's'}
                    {lineCount ? ` · ${(r.items || []).slice(0, 2).map(i => i.name).join(', ')}${lineCount > 2 ? '…' : ''}` : ''}
                  </td>
                  <td className="p-3 text-right font-semibold text-emerald-600">PKR {money(r.cost)}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold dark:bg-slate-700" onClick={() => setDetail(r)}>View</button>
                      <button type="button" className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" onClick={() => { setEditing(r); setFormOpen(true) }}>Edit</button>
                      <button type="button" className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" onClick={() => deletePurchase(r)}>Delete</button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!filtered.length && (
              <tr><td colSpan={6} className="p-8 text-center text-gray-500 dark:text-gray-400">No purchase records found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pages={pages} total={filtered.length} limit={limit} onLimitChange={n => { setLimit(n); setPage(1) }} onPageChange={setPage} />

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">Purchase {detail.invoiceNo || String(detail.id || detail._id).slice(-6)}</h3>
                <p className="text-sm text-gray-500">{detail.date} · {supplierName(detail)}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">✕</button>
            </div>
            <div className="mb-4 rounded-xl border p-3 text-center dark:border-slate-700">
              <div className="text-xs text-slate-500">Invoice total</div>
              <div className="text-xl font-bold">PKR {money(detail.cost)}</div>
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-500 dark:border-slate-700">
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3 text-right">Unit price</th>
                  <th className="py-2 text-right">Line</th>
                </tr>
              </thead>
              <tbody>
                {(detail.items || []).map((line, i) => (
                  <tr key={i} className="border-b dark:border-slate-700">
                    <td className="py-2 pr-3 font-medium">{line.name}</td>
                    <td className="py-2 pr-3">{line.qty} {line.unit || ''}</td>
                    <td className="py-2 pr-3 text-right">{money(line.price)}</td>
                    <td className="py-2 text-right font-semibold">{money((Number(line.qty) || 0) * (Number(line.price) || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.notes ? <p className="mt-3 text-sm text-gray-500">Note: {detail.notes}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold" onClick={() => { setEditing(detail); setDetail(null); setFormOpen(true) }}>Edit</button>
              <button type="button" className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white" onClick={() => deletePurchase(detail)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <BranchPurchaseModal
        open={formOpen}
        initial={editing}
        items={state.ingredients || []}
        suppliers={state.suppliers || []}
        businessDate={businessDate}
        onClose={(ok) => {
          setFormOpen(false)
          setEditing(null)
          if (ok) reloadSupplies(true)
        }}
      />
    </div>
  )
}
