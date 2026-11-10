import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { addDays, format } from 'date-fns'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { Package, Wallet, AlertTriangle, Ban, CalendarClock } from 'lucide-react'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import StatCard from '../../components/StatCard.jsx'
import { useConfirm } from '../../components/useConfirm.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { btnPrint, btnPdf, btnCsv, btnPrimary, exportDateStamp } from '../../utils/listReportExport.js'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'
import {
  parseSpreadsheetFile,
  rowsToWarehouseImportPayload,
  exportWarehouseSpreadsheet,
  WAREHOUSE_EXPORT_HEADERS,
} from '../../utils/spreadsheetIo.js'
import { warehouseApiBase, warehouseHeaders } from './warehouseApi.js'
import WarehouseItemModal from './WarehouseItemModal.jsx'
import WarehousePurchaseModal from './WarehousePurchaseModal.jsx'

export default function WarehouseStock() {
  const { token } = useAuth()
  const { state } = useData()
  const { confirm, ConfirmDialog } = useConfirm()
  const fileInputRef = useRef(null)
  const [items, setItems] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(100)
  const [modalOpen, setModalOpen] = useState(false)
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [tab, setTab] = useState('all') // all | low | out | expiring | expired

  const load = async () => {
    setLoading(true)
    try {
      const [a, b] = await Promise.all([
        fetch(`${warehouseApiBase()}/api/warehouse/items`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${warehouseApiBase()}/api/warehouse/suppliers`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (a.ok) setItems(await a.json())
      if (b.ok) setSuppliers(await b.json())
    } catch {
      toast.error('Could not load warehouse inventory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [token])

  const supplierNameOf = (it) => {
    const id = String(it?.supplierId || '')
    if (!id) return ''
    const s = suppliers.find(x => String(x._id || x.id) === id)
    return s?.name || s?.company || ''
  }

  const today = new Date()
  const soon = addDays(today, 7)
  const stockValue = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.costPrice) || 0), 0)
  const outOfStock = items.filter(it => Number(it.qty) === 0)
  const low = items.filter(it => {
    const qty = Number(it.qty) || 0
    const thr = Number(it.lowStock) || 0
    return thr > 0 ? (qty > 0 && qty <= thr) : (qty > 0 && qty <= 5)
  })
  const expiring = items.filter(it => {
    if (!it.expiry || !(Number(it.qty) > 0)) return false
    const d = new Date(it.expiry)
    return d >= today && d <= soon
  })
  const expired = items.filter(it => {
    if (!it.expiry || !(Number(it.qty) > 0)) return false
    return new Date(it.expiry) < today
  })

  const filtered = useMemo(() => {
    let list = items
    if (tab === 'low') list = low
    else if (tab === 'out') list = outOfStock
    else if (tab === 'expiring') list = expiring
    else if (tab === 'expired') list = expired
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(it =>
      String(it.name || '').toLowerCase().includes(q)
      || String(it.category || '').toLowerCase().includes(q)
      || String(supplierNameOf(it) || '').toLowerCase().includes(q)
    )
  }, [items, search, tab, suppliers]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = filtered.length
  const totalPages = Math.ceil(total / limit) || 1
  const pageSafe = Math.min(page, totalPages)
  const rows = filtered.slice((pageSafe - 1) * limit, pageSafe * limit)

  useEffect(() => { setPage(1) }, [tab, search, limit])

  const onDelete = async (it) => {
    const ok = await confirm({ title: 'Delete item', message: `Remove "${it.name}" from warehouse inventory?` })
    if (!ok) return
    try {
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/items/${it._id}`, {
        method: 'PATCH',
        headers: warehouseHeaders(token),
        body: JSON.stringify({ active: false }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Item deactivated')
      load()
    } catch {
      toast.error('Delete failed')
    }
  }

  const reportRows = (list) => list.map(it => [
    it.name || '',
    it.category || '',
    it.qty ?? '',
    it.unit || '',
    Number(it.costPrice || 0),
    Number(it.transferPrice || 0),
    Number(it.lowStock || 0),
    supplierNameOf(it),
    ((Number(it.qty) || 0) * (Number(it.costPrice) || 0)),
  ])

  const openPrintPreview = async () => {
    try {
      const body =
        reportSummary([
          { label: 'SKUs', amount: String(filtered.length) },
          { label: 'Stock value', amount: stockValue.toLocaleString() },
        ]) +
        reportSec(`Inventory (${filtered.length})`) +
        reportTable({
          headers: WAREHOUSE_EXPORT_HEADERS,
          numbered: true,
          rows: filtered.map(it => [
            it.name || '-',
            it.category || '-',
            String(it.qty ?? '-'),
            it.unit || '-',
            Number(it.costPrice || 0).toLocaleString(),
            Number(it.transferPrice || 0).toLocaleString(),
            String(it.lowStock ?? 0),
            supplierNameOf(it) || '-',
            ((Number(it.qty) || 0) * (Number(it.costPrice) || 0)).toLocaleString(),
          ]),
          emptyText: 'No inventory',
        })
      const html = wrapReportDoc({
        settings: state?.settings || {},
        title: 'Warehouse Inventory',
        reportLabel: 'Warehouse Stock',
        reportNo: `Rpt #: WH-${exportDateStamp()}`,
        metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Search', search.trim() || 'All']],
        metaRight: [['Records', String(filtered.length)]],
        body,
      })
      await previewHtmlReport(html, `Warehouse-Stock-${exportDateStamp()}.pdf`)
      toast.success('Print preview opened')
    } catch {
      toast.error('Print preview failed')
    }
  }

  const exportPDF = () => {
    try {
      const doc = new jsPDF('l', 'pt', 'a4')
      doc.setFontSize(14)
      doc.text(state?.settings?.companyName || 'Warehouse Inventory', 40, 32)
      doc.setFontSize(10)
      doc.text(`${filtered.length} items`, 40, 46)
      doc.autoTable({
        head: [WAREHOUSE_EXPORT_HEADERS],
        body: reportRows(filtered),
        startY: 54,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        margin: { left: 40, right: 40 },
      })
      doc.save(`warehouse_stock_${exportDateStamp()}.pdf`)
      toast.success('PDF exported')
    } catch {
      toast.error('PDF export failed')
    }
  }

  const exportCSV = () => {
    try {
      exportWarehouseSpreadsheet('csv', filtered, supplierNameOf)
      toast.success('CSV exported')
    } catch {
      toast.error('CSV export failed')
    }
  }

  const importWarehouseFile = async (file) => {
    if (!file) return
    try {
      setImporting(true)
      const rows = await parseSpreadsheetFile(file)
      const payload = rowsToWarehouseImportPayload(rows)
      if (!payload.items.length) throw new Error('No inventory rows found (need an Item / Name column)')
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/items/import`, {
        method: 'POST',
        headers: warehouseHeaders(token),
        body: JSON.stringify(payload),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Import failed')
      await load()
      toast.success(
        `Imported ${j.items || 0} items` +
        (j.created || j.updated ? ` (${j.created || 0} new, ${j.updated || 0} updated)` : '')
      )
    } catch (e) {
      toast.error(e.message || 'Invalid CSV / Excel file')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {ConfirmDialog}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="page-title">Warehouse Inventory</h1>
        <button type="button" onClick={() => setPurchaseOpen(true)} className={btnPrimary}>
          + Add Inventory
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-bold text-[var(--color-text-body)] tracking-wide">Search</label>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Item or category…"
              className="mt-1 w-full px-3 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div className="flex items-end gap-3 flex-shrink-0">
            <button type="button" onClick={load} className="ui-btn ui-btn-secondary whitespace-nowrap">Refresh</button>
            <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
            <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
            <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
            <button
              type="button"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
              className="ui-btn ui-btn-secondary disabled:opacity-50 whitespace-nowrap"
              title="Upload the same CSV/Excel format as export"
            >
              {importing ? 'Importing…' : 'Import CSV / Excel'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                e.target.value = ''
                importWarehouseFile(f)
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <button type="button" onClick={() => setTab('all')} className="text-left">
          <StatCard title="All SKUs" value={String(items.length)} icon={Package} iconColor="bg-blue-500" />
        </button>
        <button type="button" onClick={() => setTab('out')} className="text-left">
          <StatCard title="Out of stock" value={String(outOfStock.length)} icon={Ban} iconColor="bg-rose-500" />
        </button>
        <button type="button" onClick={() => setTab('low')} className="text-left">
          <StatCard title="Low stock" value={String(low.length)} icon={AlertTriangle} iconColor="bg-amber-500" />
        </button>
        <button type="button" onClick={() => setTab('expiring')} className="text-left">
          <StatCard title="Expiring soon" value={String(expiring.length)} icon={CalendarClock} iconColor="bg-orange-500" />
        </button>
        <button type="button" onClick={() => setTab('all')} className="text-left">
          <StatCard title="Stock value" value={stockValue.toLocaleString()} icon={Wallet} iconColor="bg-emerald-500" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900/40">
        {[
          { id: 'all', label: `All (${items.length})` },
          { id: 'out', label: `Out of stock (${outOfStock.length})` },
          { id: 'low', label: `Low stock (${low.length})` },
          { id: 'expiring', label: `Expiring (${expiring.length})` },
          { id: 'expired', label: `Expired (${expired.length})` },
        ].map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === t.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-gray-800 dark:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={[
          { label: 'SR No', key: 'srNo', render: (_, idx) => <span className="font-medium text-[var(--color-text-body)]">{(pageSafe - 1) * limit + idx + 1}</span> },
          { label: 'Item', key: 'name', render: r => <span className="font-medium">{r.name}</span> },
          { label: 'Category', key: 'category', render: r => r.category || '—' },
          {
            label: 'Qty',
            key: 'qty',
            render: r => {
              const qty = Number(r.qty) || 0
              const thr = Number(r.lowStock) || 0
              const cls = qty === 0 ? 'text-rose-600' : (thr > 0 && qty <= thr) || qty <= 5 ? 'text-amber-600' : 'text-emerald-600'
              return <span className={`tabular-nums font-semibold ${cls}`}>{qty}</span>
            },
          },
          {
            label: 'Status',
            key: 'status',
            render: r => {
              const qty = Number(r.qty) || 0
              const thr = Number(r.lowStock) || 5
              if (qty === 0) return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">Out of stock</span>
              if (qty <= thr) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">Low stock</span>
              return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">In stock</span>
            },
          },
          { label: 'Unit', key: 'unit', render: r => r.unit || '—' },
          {
            label: 'Expiry',
            key: 'expiry',
            render: r => {
              if (!r.expiry) return <span className="text-slate-400">—</span>
              const d = new Date(r.expiry)
              const isExp = d < today
              const isSoon = !isExp && d <= soon
              return (
                <span className={`text-sm ${isExp ? 'font-semibold text-rose-600' : isSoon ? 'font-semibold text-orange-600' : ''}`}>
                  {String(r.expiry).slice(0, 10)}
                  {isExp ? ' (Expired)' : isSoon ? ' (Soon)' : ''}
                </span>
              )
            },
          },
          { label: 'Cost', key: 'costPrice', render: r => Number(r.costPrice || 0).toLocaleString() },
          { label: 'Transfer', key: 'transferPrice', render: r => Number(r.transferPrice || 0).toLocaleString() },
          { label: 'Value', key: 'value', render: r => ((Number(r.qty) || 0) * (Number(r.costPrice) || 0)).toLocaleString() },
          {
            label: 'Actions',
            key: 'actions',
            render: r => (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setEditing(r); setModalOpen(true) }} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600">Edit</button>
                <button type="button" onClick={() => onDelete(r)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500 text-white hover:bg-rose-600">Delete</button>
              </div>
            ),
          },
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

      <WarehouseItemModal
        open={modalOpen}
        initial={editing}
        suppliers={suppliers}
        onClose={(saved) => {
          setModalOpen(false)
          setEditing(null)
          if (saved) load()
        }}
      />
      <WarehousePurchaseModal
        open={purchaseOpen}
        suppliers={suppliers}
        catalog={items}
        onClose={(saved) => {
          setPurchaseOpen(false)
          if (saved) load()
        }}
      />
    </div>
  )
}
