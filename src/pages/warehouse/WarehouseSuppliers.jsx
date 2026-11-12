import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import { useConfirm } from '../../components/useConfirm.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { btnPrint, btnPdf, btnCsv, btnPrimary, downloadCsvFile, exportDateStamp } from '../../utils/listReportExport.js'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '../../utils/reportDoc.js'
import { warehouseApiBase, warehouseHeaders } from './warehouseApi.js'
import WarehouseSupplierModal from './WarehouseSupplierModal.jsx'
import WarehousePaymentModal from './WarehousePaymentModal.jsx'

export default function WarehouseSuppliers() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const { state } = useData()
  const { confirm, ConfirmDialog } = useConfirm()
  const [list, setList] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(100)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [payOpen, setPayOpen] = useState(false)
  const [paySupplier, setPaySupplier] = useState(null)
  const [payBalance, setPayBalance] = useState(0)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/suppliers`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed')
      setList(await res.json())
    } catch {
      toast.error('Could not load warehouse suppliers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [token])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(s => [s.name, s.company, s.phone].some(v => String(v || '').toLowerCase().includes(q)))
  }, [list, search])

  const total = filtered.length
  const totalPages = Math.ceil(total / limit) || 1
  const pageSafe = Math.min(page, totalPages)
  const rows = filtered.slice((pageSafe - 1) * limit, pageSafe * limit)

  const onDelete = async (s) => {
    const ok = await confirm({ title: 'Delete supplier', message: `Delete warehouse supplier "${s.name}"?` })
    if (!ok) return
    try {
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/suppliers/${s._id}`, {
        method: 'DELETE',
        headers: warehouseHeaders(token),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Supplier deleted')
      load()
    } catch {
      toast.error('Delete failed')
    }
  }

  const openPayment = async (s) => {
    setPaySupplier(s)
    setPayBalance(0)
    setPayOpen(true)
    try {
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/suppliers/${s._id}/ledger`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const led = await res.json()
        setPayBalance(Number(led.balance) || 0)
      }
    } catch {
      /* ignore — modal still usable */
    }
  }

  const reportRows = (items) => items.map(s => [
    s.name || '',
    s.company || '',
    s.phone || '',
    s.address || '',
    s.status || 'Active',
  ])

  const buildReportHtml = () => {
    const fileName = `Warehouse-Suppliers-${exportDateStamp()}.pdf`
    const body =
      reportSummary([{ label: 'Suppliers', amount: String(filtered.length) }]) +
      reportSec(`Warehouse Suppliers (${filtered.length})`) +
      reportTable({
        headers: ['Name', 'Company', 'Phone', 'Address', 'Status'],
        numbered: true,
        rows: filtered.map(s => [s.name || '-', s.company || '-', s.phone || '-', s.address || '-', s.status || 'Active']),
        emptyText: 'No suppliers',
      })
    const html = wrapReportDoc({
      settings: state?.settings || {},
      title: 'Warehouse Suppliers',
      reportLabel: 'Warehouse Supplier List',
      reportNo: `Rpt #: WHS-${exportDateStamp()}`,
      metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Search', search.trim() || 'All']],
      metaRight: [['Records', String(filtered.length)]],
      body,
    })
    return { html, fileName }
  }

  const openPrintPreview = async () => {
    try {
      const { html, fileName } = buildReportHtml()
      await previewHtmlReport(html, fileName)
      toast.success('Print preview opened')
    } catch {
      toast.error('Print preview failed')
    }
  }

  const exportPDF = async () => {
    try {
      const { html, fileName } = buildReportHtml()
      await downloadHtmlReport(html, fileName)
      toast.success('PDF downloaded')
    } catch {
      toast.error('PDF export failed')
    }
  }

  const exportCSV = () => {
    try {
      downloadCsvFile(
        `warehouse_suppliers_${format(new Date(), 'yyyy-MM-dd')}.csv`,
        ['Name', 'Company', 'Phone', 'Address', 'Status'],
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
        <h1 className="page-title">Warehouse Suppliers</h1>
        <button type="button" onClick={() => { setEditing(null); setModalOpen(true) }} className={btnPrimary}>
          + Add Supplier
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-bold text-[var(--color-text-body)] tracking-wide">Search</label>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Name, company, phone…"
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
          { label: 'Name', key: 'name', render: r => <span className="font-medium">{r.name}</span> },
          { label: 'Company', key: 'company', render: r => r.company || '—' },
          { label: 'Phone', key: 'phone', render: r => r.phone || '—' },
          {
            label: 'Status',
            key: 'status',
            render: r => (
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.status === 'Active' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600'}`}>
                {r.status || 'Active'}
              </span>
            ),
          },
          {
            label: 'Actions',
            key: 'actions',
            render: r => (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => { setEditing(r); setModalOpen(true) }} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600">Edit</button>
                <button
                  type="button"
                  onClick={() => navigate(`/warehouse/suppliers/${r._id}/history`)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-500 text-white hover:bg-blue-600"
                  title="Purchases, payments, and balance for this supplier"
                >
                  Supplier record
                </button>
                <button type="button" onClick={() => openPayment(r)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600">Payment</button>
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

      <WarehouseSupplierModal
        open={modalOpen}
        initial={editing}
        onClose={(saved) => {
          setModalOpen(false)
          setEditing(null)
          if (saved) load()
        }}
      />

      <WarehousePaymentModal
        open={payOpen}
        supplier={paySupplier}
        balanceDue={payBalance}
        onClose={(saved) => {
          setPayOpen(false)
          setPaySupplier(null)
          setPayBalance(0)
          if (saved) load()
        }}
      />
    </div>
  )
}
