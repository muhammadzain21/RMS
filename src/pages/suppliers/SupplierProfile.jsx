import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import SupplierModal from '../../components/SupplierModal.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '../../utils/reportDoc.js'
import { btnPrint, btnPdf, btnCsv, downloadCsvFile, exportDateStamp } from '../../utils/listReportExport.js'

export default function SupplierProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useData()
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const [modalOpen, setModalOpen] = useState(false)
  const [fetchedSupplier, setFetchedSupplier] = useState(null)
  const [fetchedSupplies, setFetchedSupplies] = useState([])
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

  useEffect(() => {
    const hdr = token ? { Authorization: `Bearer ${token}` } : {}
    fetch(`${API}/api/suppliers/${id}`, { headers: hdr })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setFetchedSupplier({ ...d, id: d.id || d._id }) })
      .catch(() => {})
    fetch(`${API}/api/supplies?supplierId=${id}`, { headers: hdr })
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        const arr = Array.isArray(d) ? d : (d.rows || [])
        setFetchedSupplies(arr.map(x => ({ ...x, id: x.id || x._id })))
      })
      .catch(() => {})
  }, [id, API, token])

  const supplier = useMemo(() => fetchedSupplier || (state.suppliers||[]).find(s => s.id === id), [fetchedSupplier, state.suppliers, id])
  const supplies = useMemo(() => {
    const list = fetchedSupplies.length ? fetchedSupplies : (state.supplies||[]).filter(sp => sp.supplierId === id)
    return list
  }, [fetchedSupplies, state.supplies, id])
  const totals = useMemo(() => {
    const totalCost = supplies.reduce((a,b) => a + Number(b.cost||0), 0)
    const totalEntries = supplies.length
    const totalItems = supplies.reduce((a,b) => a + (b.items||[]).reduce((x,y)=>x+Number(y.qty||0),0), 0)
    return { totalCost, totalEntries, totalItems }
  }, [supplies])

  const supplyLines = useMemo(() => supplies.flatMap(sp => (sp.items || []).map(it => ({
    date: sp.date ? format(new Date(sp.date), 'yyyy-MM-dd') : '-',
    name: it.name || '-',
    qty: Number(it.qty || 0),
    unit: it.unit || '',
    unitPrice: Number(it.price || 0),
    totalPrice: Number(it.qty || 0) * Number(it.price || 0),
  }))), [supplies])

  const supplyReportRows = () => supplyLines.map(l => [
    l.date,
    l.name,
    l.qty,
    l.unit,
    l.unitPrice,
    l.totalPrice,
  ])

  const buildReportHtml = () => {
    const fileName = `Supplier-Supplies-${exportDateStamp()}.pdf`
    const body =
      reportSummary([
        { label: 'Supply entries', amount: String(totals.totalEntries) },
        { label: 'Line items', amount: String(supplyLines.length) },
        { label: 'Total cost (PKR)', amount: totals.totalCost.toLocaleString() },
      ]) +
      reportSec(`Supply lines (${supplyLines.length})`) +
      reportTable({
        headers: ['Date', 'Name', { t: 'Qty', align: 'r' }, 'Unit', { t: 'Unit Price', align: 'r' }, { t: 'Total', align: 'r' }],
        numbered: true,
        rows: supplyLines.map(l => [
          l.date,
          l.name,
          { v: l.qty, align: 'r' },
          l.unit,
          { v: l.unitPrice.toLocaleString(), align: 'r' },
          { v: l.totalPrice.toLocaleString(), align: 'r' },
        ]),
        emptyText: 'No supply lines',
      })
    const html = wrapReportDoc({
      settings: state?.settings || {},
      title: `Supplier: ${supplier?.name || supplier?.company || 'Profile'}`,
      reportLabel: 'Supplier Supplies',
      reportNo: `Rpt #: SP-${id}`,
      metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Phone', supplier?.phone || '-']],
      metaRight: [['Status', supplier?.status || 'Active'], ['Lines', String(supplyLines.length)]],
      body,
    })
    return { html, fileName }
  }

  const openPrintPreview = async () => {
    try {
      const { html, fileName } = buildReportHtml()
      await previewHtmlReport(html, fileName)
      toast.success('Print preview opened')
    } catch (e) {
      console.error(e)
      toast.error('Print preview failed')
    }
  }

  const exportPDF = async () => {
    try {
      const { html, fileName } = buildReportHtml()
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
        `supplier_supplies_${format(new Date(), 'yyyy-MM-dd')}.csv`,
        ['Date', 'Name', 'Qty', 'Unit', 'Unit Price (PKR)', 'Total (PKR)'],
        supplyReportRows()
      )
      toast.success('CSV exported successfully')
    } catch {
      toast.error('Failed to export CSV')
    }
  }

  const reloadSuppliers = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`${API}/api/suppliers`, { headers })
      const rows = await res.json()
      const mapId = (x) => ({ ...x, id: x.id || x._id })
      dispatch({ type: 'HYDRATE', payload: { suppliers: (rows||[]).map(mapId) } })
    } catch {}
  }

  const onDelete = async () => {
    const confirmed = await confirm({ title: 'Delete Supplier', message: 'Delete this supplier?' })
    if (!confirmed) return
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`${API}/api/suppliers/${id}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error('Failed')
      await reloadSuppliers()
      toast.success('Supplier deleted')
      navigate('/suppliers')
    } catch {
      toast.error('Failed to delete supplier.')
    }
  }

  if (!supplier) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h1 className="page-title">Supplier</h1>
          <button onClick={()=>navigate('/suppliers')} className="px-4 py-2.5 rounded-lg bg-gray-500 text-white font-medium hover:bg-gray-600 transition-colors">Back</button>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-8 text-center">
          <div className="text-5xl mb-3"></div>
          <p className="text-slate-500 dark:text-slate-400">Supplier not found.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="page-title">Supplier Profile</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
          <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
          <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
          <button onClick={()=>navigate('/suppliers')} className="px-4 py-2.5 rounded-lg bg-slate-600 text-white font-medium hover:bg-slate-700 transition-colors">Back</button>
        </div>
      </div>

      {/* Profile Header Card */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center text-2xl font-bold flex-shrink-0">
            {(supplier.name?.[0] || supplier.company?.[0] || 'S').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{supplier.name || supplier.company || '-'}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-sm text-slate-500 dark:text-slate-400">{supplier.company || '-'}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${supplier.status==='Active' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                {supplier.status || 'Active'}
              </span>
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Phone</div>
            <div className="text-sm text-slate-800 dark:text-slate-200 mt-1">{supplier.phone || '-'}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Address</div>
            <div className="text-sm text-slate-800 dark:text-slate-200 mt-1">{supplier.address || '-'}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Tax ID</div>
            <div className="text-sm text-slate-800 dark:text-slate-200 mt-1">{supplier.taxId || '-'}</div>
          </div>
        </div>
      </div>

      {/* Stats Widgets */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Supplies</div>
          <div className="text-2xl font-bold mt-1 text-blue-600">{totals.totalEntries}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Items</div>
          <div className="text-2xl font-bold mt-1 text-amber-600">{totals.totalItems}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Cost</div>
          <div className="text-2xl font-bold mt-1 text-emerald-600">PKR {totals.totalCost.toLocaleString()}</div>
        </div>
      </div>

      {/* Supply Records Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
            Supply Records ({supplies.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-700/50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Name</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Qty</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Unit</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Unit Price</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Total Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {supplies.flatMap(sp => (sp.items||[]).map((it, i) => (
                <tr key={sp.id + '_' + i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{sp.date ? format(new Date(sp.date), 'yyyy-MM-dd') : '-'}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium">{it.name || '-'}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300 text-right">{Number(it.qty || 0)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{it.unit || ''}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300 text-right">PKR {Number(it.price || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">PKR {Number((Number(it.qty||0) * Number(it.price||0))).toLocaleString()}</td>
                </tr>
              )))}
              {supplies.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">No supplies from this supplier yet.</td></tr>
              )}
            </tbody>
            {supplies.length > 0 && (
              <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-semibold">
                <tr className="border-t border-slate-200 dark:border-slate-700">
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300" colSpan={3}>Totals</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">PKR {totals.totalCost.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <SupplierModal open={modalOpen} initial={supplier} onClose={(ok)=>{ setModalOpen(false); if (ok) reloadSuppliers() }} />
      {ConfirmDialog}
    </div>
  )
}
