import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { Package, Wallet, AlertTriangle } from 'lucide-react'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import StatCard from '../../components/StatCard.jsx'
import { useConfirm } from '../../components/useConfirm.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { btnPrint, btnPdf, btnCsv, btnPrimary, downloadCsvFile } from '../../utils/listReportExport.js'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'
import { warehouseApiBase, warehouseHeaders } from './warehouseApi.js'
import WarehouseItemModal from './WarehouseItemModal.jsx'

export default function WarehouseStock() {
  const { token } = useAuth()
  const { state } = useData()
  const { confirm, ConfirmDialog } = useConfirm()
  const [items, setItems] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(100)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(false)

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(it =>
      String(it.name || '').toLowerCase().includes(q) || String(it.category || '').toLowerCase().includes(q)
    )
  }, [items, search])

  const stockValue = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.costPrice) || 0), 0)
  const low = items.filter(it => (Number(it.qty) || 0) <= (Number(it.lowStock) || 0) && (Number(it.lowStock) || 0) > 0)

  const total = filtered.length
  const totalPages = Math.ceil(total / limit) || 1
  const pageSafe = Math.min(page, totalPages)
  const rows = filtered.slice((pageSafe - 1) * limit, pageSafe * limit)

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
          headers: ['Item', 'Category', 'Qty', 'Unit', 'Cost', 'Transfer', 'Value'],
          numbered: true,
          rows: filtered.map(it => [
            it.name || '-',
            it.category || '-',
            String(it.qty ?? '-'),
            it.unit || '-',
            Number(it.costPrice || 0).toLocaleString(),
            Number(it.transferPrice || 0).toLocaleString(),
            ((Number(it.qty) || 0) * (Number(it.costPrice) || 0)).toLocaleString(),
          ]),
          emptyText: 'No inventory',
        })
      const html = wrapReportDoc({
        settings: state?.settings || {},
        title: 'Warehouse Inventory',
        reportLabel: 'Warehouse Stock',
        reportNo: `Rpt #: WH-${format(new Date(), 'yyyy-MM-dd')}`,
        metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Search', search.trim() || 'All']],
        metaRight: [['Records', String(filtered.length)]],
        body,
      })
      await previewHtmlReport(html, `Warehouse-Stock-${format(new Date(), 'yyyy-MM-dd')}.pdf`)
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
        head: [['Item', 'Category', 'Qty', 'Unit', 'Cost', 'Transfer', 'Value']],
        body: reportRows(filtered),
        startY: 54,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        margin: { left: 40, right: 40 },
      })
      doc.save(`warehouse_stock_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
      toast.success('PDF exported')
    } catch {
      toast.error('PDF export failed')
    }
  }

  const exportCSV = () => {
    try {
      downloadCsvFile(
        `warehouse_stock_${format(new Date(), 'yyyy-MM-dd')}.csv`,
        ['Item', 'Category', 'Qty', 'Unit', 'Cost', 'Transfer', 'Value'],
        reportRows(filtered)
      )
      toast.success('CSV exported')
    } catch {
      toast.error('CSV export failed')
    }
  }

  return (
    <div className="space-y-4">
      {ConfirmDialog}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="page-title">Warehouse Inventory</h1>
        <button type="button" onClick={() => { setEditing(null); setModalOpen(true) }} className={btnPrimary}>
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
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="SKUs" value={String(items.length)} icon={Package} iconColor="bg-blue-500" />
        <StatCard title="Stock value" value={stockValue.toLocaleString()} icon={Wallet} iconColor="bg-emerald-500" />
        <StatCard title="Low stock" value={String(low.length)} icon={AlertTriangle} iconColor="bg-amber-500" />
      </div>

      <DataTable
        columns={[
          { label: 'SR No', key: 'srNo', render: (_, idx) => <span className="font-medium text-[var(--color-text-body)]">{(pageSafe - 1) * limit + idx + 1}</span> },
          { label: 'Item', key: 'name', render: r => <span className="font-medium">{r.name}</span> },
          { label: 'Category', key: 'category', render: r => r.category || '—' },
          { label: 'Qty', key: 'qty', render: r => <span className="tabular-nums">{r.qty}</span> },
          { label: 'Unit', key: 'unit', render: r => r.unit || '—' },
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
    </div>
  )
}
