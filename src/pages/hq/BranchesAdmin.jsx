import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import DataTable from '../../components/DataTable.jsx'
import Pagination from '../../components/Pagination.jsx'
import { useConfirm } from '../../components/useConfirm.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { btnPrint, btnPdf, btnCsv, btnPrimary, downloadCsvFile } from '../../utils/listReportExport.js'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'
import BranchModal from './BranchModal.jsx'

function api() {
  return (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
}

export default function BranchesAdmin() {
  const { token } = useAuth()
  const { refresh } = useBranch()
  const { state } = useData()
  const { confirm, ConfirmDialog } = useConfirm()
  const [list, setList] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(100)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${api()}/api/branches`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Failed')
      setList(await res.json())
    } catch {
      toast.error('Could not load branches')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [token])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(b =>
      [b.code, b.name, b.phone, b.address, b.mode].some(v => String(v || '').toLowerCase().includes(q))
    )
  }, [list, search])

  const total = filtered.length
  const totalPages = Math.ceil(total / limit) || 1
  const pageSafe = Math.min(page, totalPages)
  const rows = filtered.slice((pageSafe - 1) * limit, pageSafe * limit)

  const onDelete = async (b) => {
    const ok = await confirm({ title: 'Delete Branch', message: `Deactivate branch "${b.name}" (${b.code})?` })
    if (!ok) return
    try {
      const res = await fetch(`${api()}/api/branches/${b._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active: false }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Branch deactivated')
      await load()
      await refresh()
    } catch {
      toast.error('Failed to delete branch')
    }
  }

  const reportRows = (items) => items.map(b => [
    b.code || '',
    b.name || '',
    b.mode || '',
    b.phone || '',
    b.address || '',
  ])

  const openPrintPreview = async () => {
    try {
      const body =
        reportSummary([{ label: 'Branches', amount: String(filtered.length) }]) +
        reportSec(`Branches (${filtered.length})`) +
        reportTable({
          headers: ['Code', 'Name', 'Mode', 'Phone', 'Address'],
          numbered: true,
          rows: filtered.map(b => [
            b.code || '-',
            b.name || '-',
            b.mode || '-',
            b.phone || '-',
            b.address || '-',
          ]),
          emptyText: 'No branches',
        })
      const html = wrapReportDoc({
        settings: state?.settings || {},
        title: 'Branches',
        reportLabel: 'Branch List',
        reportNo: `Rpt #: BR-${format(new Date(), 'yyyy-MM-dd')}`,
        metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Search', search.trim() || 'All']],
        metaRight: [['Records', String(filtered.length)]],
        body,
      })
      await previewHtmlReport(html, `Branches-${format(new Date(), 'yyyy-MM-dd')}.pdf`)
      toast.success('Print preview opened')
    } catch {
      toast.error('Print preview failed')
    }
  }

  const exportPDF = () => {
    try {
      const doc = new jsPDF('l', 'pt', 'a4')
      doc.setFontSize(14)
      doc.text(state?.settings?.companyName || 'Branches', 40, 32)
      doc.setFontSize(10)
      doc.text(`${filtered.length} branches`, 40, 46)
      doc.autoTable({
        head: [['Code', 'Name', 'Mode', 'Phone', 'Address']],
        body: reportRows(filtered),
        startY: 54,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        margin: { left: 40, right: 40 },
      })
      doc.save(`branches_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
      toast.success('PDF exported')
    } catch {
      toast.error('PDF export failed')
    }
  }

  const exportCSV = () => {
    try {
      downloadCsvFile(
        `branches_${format(new Date(), 'yyyy-MM-dd')}.csv`,
        ['Code', 'Name', 'Mode', 'Phone', 'Address'],
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
        <h1 className="page-title">Branches</h1>
        <button type="button" onClick={() => { setEditing(null); setModalOpen(true) }} className={btnPrimary}>
          + Add Branch
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-bold text-[var(--color-text-body)] tracking-wide">Search</label>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Code, name, phone…"
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
          { label: 'Code', key: 'code', render: r => <span className="font-bold">{r.code}</span> },
          { label: 'Name', key: 'name' },
          { label: 'Mode', key: 'mode', render: r => <span className="capitalize">{r.mode}</span> },
          { label: 'Phone', key: 'phone', render: r => r.phone || '—' },
          { label: 'Address', key: 'address', render: r => <span className="text-gray-500 truncate max-w-xs block">{r.address || '—'}</span> },
          {
            label: 'Actions',
            key: 'actions',
            render: r => (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setEditing(r); setModalOpen(true) }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(r)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition-colors"
                >
                  Delete
                </button>
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

      <BranchModal
        open={modalOpen}
        initial={editing}
        onClose={async (saved) => {
          setModalOpen(false)
          setEditing(null)
          if (saved) {
            await load()
            await refresh()
          }
        }}
      />
    </div>
  )
}
