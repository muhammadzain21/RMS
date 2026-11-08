import { useEffect, useMemo, useState } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import Pagination from '../../components/Pagination.jsx'
import DatePicker from '../../components/DatePicker.jsx'
import { Plus, X } from 'lucide-react'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'
import { btnPrint, btnPdf, btnCsv, downloadCsvFile, exportDateStamp } from '../../utils/listReportExport.js'

export default function Tables() {
 const { state, dispatch } = useData()
 const { token } = useAuth()
 const { confirm, ConfirmDialog } = useConfirm()
 const [newTable, setNewTable] = useState('')
 const [newFloor, setNewFloor] = useState('')
 const [newImage, setNewImage] = useState('')
 const [addOpen, setAddOpen] = useState(false)
 const [editTable, setEditTable] = useState(null)
 const [editOpen, setEditOpen] = useState(false)
 const [editName, setEditName] = useState('')
 const [editFloor, setEditFloor] = useState('')
 const [editImage, setEditImage] = useState('')
 const [search, setSearch] = useState('')
 const [drawerOpen, setDrawerOpen] = useState(false)
 const [selectedTable, setSelectedTable] = useState('')
 const [tables, setTables] = useState([])
 const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
 const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
 const [fromDate, setFromDate] = useState('')
 const [toDate, setToDate] = useState('')
 const [summary, setSummary] = useState([])
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
  const API = (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'

  const resolveWaiterName = (raw) => {
    const id = String(raw || '').trim()
    if (!id || id === '-') return '—'
    const staff = state.staff || []
    const st = staff.find(s =>
      String(s.id || '') === id
      || String(s._id || '') === id
      || String(s.name || '').toLowerCase() === id.toLowerCase()
    )
    return st?.name || id
  }

 const syncSettingsTables = async (names) => {
 try {
 const headers = { 'Content-Type': 'application/json' }
 await fetch(`${API}/api/settings`, { method: 'PATCH', headers, body: JSON.stringify({ tables: names }) })
 } catch {}
 }

 useEffect(() => {
 const load = async () => {
 try {
 const headers = token ? { Authorization: `Bearer ${token}` } : {}
 const res = await fetch(`${API}/api/tables`, { headers })
 if (!res.ok) return
        setTables(await res.json() || [])
 } catch {}
 }
 load()
 }, [API, token])

 useEffect(() => {
 const loadSummary = async () => {
 try {
 const headers = token ? { Authorization: `Bearer ${token}` } : {}
 const params = new URLSearchParams()
 if (selectedDate && !fromDate && !toDate) params.set('date', selectedDate)
 if (fromDate) params.set('from', fromDate)
 if (toDate) params.set('to', toDate)
        const res = await fetch(`${API}/api/tables/summary?${params}`, { headers })
 if (!res.ok) { setSummary([]); return }
 const data = await res.json()
 setSummary(data?.tables || [])
 } catch { setSummary([]) }
 }
 loadSummary()
 }, [API, token, selectedDate, fromDate, toDate])

 const rows = useMemo(() => {
    const dineInSales = (state.sales || []).filter(s => s.orderType === 'Dine-in')
 const mapped = tables.map((t) => {
 const name = t.name || t
      const salesForTable = dineInSales.filter(s => String(s.tableNo || '').trim() === name)
 const sumRow = summary.find(s => s.table === name)
      const lastDate = sumRow?.lastDate || t.lastOrderDate || (salesForTable.length ? salesForTable[0].date : '—')
      const lastWaiterRaw = sumRow?.lastWaiter
        || (t.lastWaiter && String(t.lastWaiter).trim())
        || (salesForTable.length ? (salesForTable[0].waiterId || salesForTable[0].waiter || salesForTable[0].waiterName || '') : '')
      const totalAmount = typeof sumRow?.totalAmount === 'number'
        ? sumRow.totalAmount
        : (typeof t.totalAmount === 'number'
          ? t.totalAmount
          : salesForTable.reduce((a, b) => a + Number(b.total || 0), 0))
 return {
 table: name,
 orders: typeof sumRow?.orders === 'number' ? sumRow.orders : (typeof t.totalOrders === 'number' ? t.totalOrders : salesForTable.length),
 lastDate,
        lastWaiter: resolveWaiterName(lastWaiterRaw),
 totalAmount,
 _id: t._id,
 }
 })
    if (!search) return mapped
 const q = search.toLowerCase()
 return mapped.filter(r => r.table.toLowerCase().includes(q))
  }, [tables, state.sales, state.staff, summary, search])

 const pages = Math.ceil(rows.length / limit) || 1
 const paginatedRows = rows.slice((page - 1) * limit, page * limit)

 useEffect(() => {
 const loadHistory = async () => {
 if (!drawerOpen || !selectedTable) return
      setHistoryLoading(true)
 try {
 const headers = token ? { Authorization: `Bearer ${token}` } : {}
        const params = new URLSearchParams()
        if (fromDate) params.set('from', fromDate)
        if (toDate) params.set('to', toDate)
        if (selectedDate && !fromDate && !toDate) {
          params.set('from', selectedDate)
          params.set('to', selectedDate)
        }
        const qs = params.toString()
        const res = await fetch(`${API}/api/tables/by-name/${encodeURIComponent(selectedTable)}/history${qs ? `?${qs}` : ''}`, { headers })
 if (!res.ok) { setHistory([]); return }
        const sales = await res.json()
        setHistory((sales || []).map(s => ({
          id: s.id || s._id,
          date: s.date || '—',
          billNo: s.billNo ? `BILL-${s.billNo}` : (s.orderNo || '—'),
          orderType: s.orderType || 'Dine-in',
          waiter: resolveWaiterName(s.waiterName || s.waiter || s.waiterId),
          paymentMethod: s.paymentMethod || s.payment || '—',
          itemsCount: Array.isArray(s.items) ? s.items.reduce((a, it) => a + Number(it.qty || 0), 0) : (s.itemsCount || '—'),
          itemsLabel: Array.isArray(s.items)
            ? s.items.map(it => `${it.name || it.itemName || 'Item'}×${it.qty || 1}`).join(', ')
            : '—',
          total: Number(s.total || s.netAmount || 0),
          status: s.status || 'Paid',
        })))
      } catch {
        setHistory([])
      } finally {
        setHistoryLoading(false)
      }
 }
 loadHistory()
  }, [drawerOpen, selectedTable, API, token, fromDate, toDate, selectedDate, state.staff])

  const historyTotal = useMemo(
    () => history.reduce((a, r) => a + Number(r.total || 0), 0),
    [history]
  )

 const tableReportRows = () => rows.map(r => {
 const floor = tables.find(t => (t.name || t) === r.table)?.floor || '-'
    return [r.table, floor, Number(r.orders || 0), r.lastDate || '-', r.lastWaiter || '-', Number(r.totalAmount || 0)]
 })

 const periodLabel = selectedDate && !fromDate && !toDate
   ? selectedDate
   : `${fromDate || '…'} to ${toDate || '…'}`

 const openPrintPreview = async () => {
 try {
 const totalBill = rows.reduce((a, r) => a + Number(r.totalAmount || 0), 0)
 const body =
 reportSummary([
 { label: 'Tables', amount: String(rows.length) },
 { label: 'Total bill (PKR)', amount: totalBill.toLocaleString() },
 ]) +
 reportSec(`Tables (${rows.length})`) +
 reportTable({
 headers: ['Table', 'Floor', { t: 'Orders', align: 'r' }, 'Last Order', 'Last Waiter', { t: 'Total Bill (PKR)', align: 'r' }],
 numbered: true,
 rows: rows.map(r => {
 const floor = tables.find(t => (t.name || t) === r.table)?.floor || '-'
 return [
 r.table,
 floor,
 { v: r.orders, align: 'r' },
 r.lastDate || '-',
 r.lastWaiter || '-',
 { v: Number(r.totalAmount || 0).toLocaleString(), align: 'r' },
 ]
 }),
 emptyText: 'No tables match filters',
 })
 const html = wrapReportDoc({
 settings: state?.settings || {},
 title: 'Tables Summary',
 reportLabel: 'Tables Report',
 reportNo: `Rpt #: TBL-${exportDateStamp()}`,
 metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Period', periodLabel]],
 metaRight: [['Search', search.trim() || 'All'], ['Records', String(rows.length)]],
 body,
 })
 await previewHtmlReport(html, `Tables-${exportDateStamp()}.pdf`)
 toast.success('Print preview opened')
 } catch (e) {
 console.error(e)
 toast.error('Print preview failed')
 }
 }

 const exportPDF = () => {
 try {
 const doc = new jsPDF('l', 'pt', 'a4')
 doc.setFontSize(14)
 doc.text(state?.settings?.companyName || 'Tables', 40, 32)
 doc.setFontSize(10)
 doc.text(`${periodLabel} · ${rows.length} tables`, 40, 46)
 doc.autoTable({
 head: [['Table', 'Floor', 'Orders', 'Last Order', 'Last Waiter', 'Total Bill (PKR)']],
 body: tableReportRows(),
 startY: 54,
 styles: { fontSize: 8, cellPadding: 4 },
 headStyles: { fillColor: [6, 182, 212], textColor: 255, fontStyle: 'bold' },
 margin: { left: 40, right: 40 },
 })
 doc.save(`tables_${exportDateStamp()}.pdf`)
 toast.success('PDF exported successfully')
 } catch (e) {
 console.error(e)
 toast.error('Failed to export PDF')
 }
 }

 const exportCSV = () => {
 try {
 downloadCsvFile(
 `tables_${format(new Date(), 'yyyy-MM-dd')}.csv`,
 ['Table', 'Floor', 'Orders', 'Last Order Date', 'Last Waiter', 'Total Bill (PKR)'],
 tableReportRows()
 )
 toast.success('CSV exported successfully')
 } catch {
 toast.error('Failed to export CSV')
 }
 }

  const onEditTable = (r) => {
    const t = tables.find(x => (x.name || x) === r.table)
    if (!t) return
    setEditTable(t)
    setEditName(t.name || '')
    setEditFloor(t.floor || '')
    setEditImage(t.imageUrl || '')
    setEditOpen(true)
  }

  const saveEditTable = async () => {
    if (!editTable?._id) return
    const name = editName.trim()
    if (!name) return
    try {
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const res = await fetch(`${API}/api/tables/${editTable._id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name, floor: (editFloor || '').trim(), imageUrl: editImage }),
      })
      if (!res.ok) throw new Error('Failed')
      const updated = await res.json()
      setTables(prev => {
        const next = prev.map(x => (x._id === editTable._id) ? updated : x)
        syncSettingsTables(next.map(x => x.name || x).filter(Boolean))
        dispatch({
          type: 'HYDRATE',
          payload: {
            settings: {
              ...state.settings,
              tables: next.map(x => ({ name: x.name || x, floor: x.floor || '', imageUrl: x.imageUrl || '' })),
            },
          },
        })
        return next
      })
      toast.success('Table updated')
      setEditOpen(false)
      setEditTable(null)
    } catch {
      toast.error('Failed to update table. Please retry.')
    }
  }

  const deleteTable = async (r) => {
    const ok = await confirm({ title: 'Delete Table', message: `Delete table "${r.table}"? This will not delete sales history.` })
    if (!ok) return
 try {
 const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const t = tables.find(x => (x.name || x) === r.table)
 const id = t?._id
 if (!id) throw new Error('Not found')
 const res = await fetch(`${API}/api/tables/${id}`, { method: 'DELETE', headers })
 if (!res.ok) throw new Error('Failed')
 setTables(prev => {
        const next = prev.filter(x => (x._id || x.name) !== id)
        syncSettingsTables(next.map(x => x.name || x).filter(Boolean))
        dispatch({
          type: 'HYDRATE',
          payload: {
            settings: {
              ...state.settings,
              tables: next.map(x => ({ name: x.name || x, floor: x.floor || '', imageUrl: x.imageUrl || '' })),
            },
          },
        })
 return next
 })
 toast.success('Table deleted')
    } catch {
 toast.error('Failed to delete table. Please retry.')
 }
  }

  return (
    <div className="space-y-4 w-full">
      {ConfirmDialog}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="page-title">Tables</h1>
        <button type="button" onClick={() => setAddOpen(true)} className="ui-btn ui-btn-primary flex items-center gap-2">
          <Plus size={18} /> Add Table
        </button>
      </div>

      <div className="p-4 rounded-xl card card-pad">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-shrink-0">
            <DatePicker label="From" value={fromDate} onChange={v => { setFromDate(v); setSelectedDate('') }} />
          </div>
          <div className="flex-shrink-0">
            <DatePicker label="To" value={toDate} onChange={v => { setToDate(v); setSelectedDate('') }} />
          </div>
          <div className="flex items-end gap-3 flex-shrink-0">
            <button type="button" onClick={() => { setSelectedDate(format(new Date(), 'yyyy-MM-dd')); setFromDate(''); setToDate('') }} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary font-medium whitespace-nowrap">Today</button>
            <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
            <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
            <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
          </div>
          <div className="flex-1 min-w-0 sm:ml-auto">
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search tables..."
              className="w-full px-3 py-2 border-2 border-cyan-200 dark:border-cyan-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-cyan-500 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
            <tr>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Table</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Floor</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Orders</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Last Order Date</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Last Waiter</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Total Bill</th>
              <th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map(r => (
              <tr key={r.table} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="p-3 font-medium text-gray-800 dark:text-gray-100">{r.table}</td>
                <td className="p-3 text-gray-600 dark:text-gray-400">{tables.find(t => (t.name || t) === r.table)?.floor || '—'}</td>
                <td className="p-3 text-gray-700 dark:text-gray-300">{r.orders}</td>
                <td className="p-3 text-gray-600 dark:text-gray-400">{r.lastDate}</td>
                <td className="p-3 text-gray-700 dark:text-gray-200 font-medium">{r.lastWaiter}</td>
                <td className="p-3 font-medium text-gray-800 dark:text-gray-200">PKR {Number(r.totalAmount || 0).toLocaleString()}</td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button type="button" onClick={() => { setSelectedTable(r.table); setDrawerOpen(true) }} className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500">View Sales</button>
                    <button type="button" onClick={() => onEditTable(r)} className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-400">Edit</button>
                    <button type="button" onClick={() => deleteTable(r)} className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-500 text-white hover:bg-rose-400">Delete</button>
                  </div>
                </td>
              </tr>
 ))}
 {!rows.length && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500 dark:text-gray-400">No tables found</td>
              </tr>
 )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pages={pages} total={rows.length} limit={limit} onLimitChange={n => { setLimit(n); setPage(1) }} onPageChange={setPage} />

 {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setAddOpen(false) }}>
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Add Table</h3>
              <button type="button" onClick={() => setAddOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1.5">Table No</label>
                <input type="text" className="px-3 py-2.5 border-2 border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 w-full" value={newTable} onChange={e => setNewTable(e.target.value)} placeholder="e.g., Table 4" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1.5">Floor</label>
                <input type="text" className="px-3 py-2.5 border-2 border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 w-full" value={newFloor} onChange={e => setNewFloor(e.target.value)} placeholder="e.g., Ground / 1st" />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setAddOpen(false)} className="px-4 py-2.5 border-2 rounded-lg">Cancel</button>
                <button
                  type="button"
                  disabled={!newTable.trim()}
                  onClick={async () => {
 const name = newTable.trim()
 if (!name) return
 try {
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
                      const res = await fetch(`${API}/api/tables`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ name, floor: (newFloor || '').trim(), imageUrl: newImage }),
                      })
                      if (!res.ok) throw new Error('Failed')
 const row = await res.json()
                      setTables(prev => {
                        const next = [...prev, row]
                        syncSettingsTables(next.map(x => x.name || x).filter(Boolean))
                        dispatch({
                          type: 'HYDRATE',
                          payload: {
                            settings: {
                              ...state.settings,
                              tables: next.map(x => ({ name: x.name || x, floor: x.floor || '', imageUrl: x.imageUrl || '' })),
                            },
                          },
                        })
                        return next
                      })
 setNewTable(''); setNewFloor(''); setNewImage(''); setAddOpen(false)
                      toast.success('Table added')
                    } catch {
                      toast.error('Failed to add table')
                    }
                  }}
                  className="ui-btn ui-btn-primary disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
 )}

 {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditOpen(false) }}>
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">Edit Table</h3>
              <button type="button" onClick={() => setEditOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Table No</label>
                <input type="text" className="px-3 py-2.5 border-2 border-amber-200 rounded-lg w-full dark:bg-gray-800" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">Floor</label>
                <input type="text" className="px-3 py-2.5 border-2 border-amber-200 rounded-lg w-full dark:bg-gray-800" value={editFloor} onChange={e => setEditFloor(e.target.value)} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setEditOpen(false)} className="px-4 py-2.5 border-2 rounded-lg">Cancel</button>
                <button type="button" onClick={saveEditTable} disabled={!editName.trim()} className="ui-btn ui-btn-primary disabled:opacity-50">Update</button>
              </div>
            </div>
          </div>
        </div>
      )}

 {drawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setDrawerOpen(false) }}>
          <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Sales — {selectedTable}</h3>
                <p className="text-sm text-slate-500">
                  {periodLabel} · {history.length} sale{history.length === 1 ? '' : 's'} · Total PKR {historyTotal.toLocaleString()}
                </p>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">✕</button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {historyLoading ? (
                <div className="py-16 text-center text-slate-400">Loading sales…</div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                      <tr>
                        <th className="px-3 py-2.5 text-left">#</th>
                        <th className="px-3 py-2.5 text-left">Date</th>
                        <th className="px-3 py-2.5 text-left">Bill No</th>
                        <th className="px-3 py-2.5 text-left">Waiter</th>
                        <th className="px-3 py-2.5 text-left">Payment</th>
                        <th className="px-3 py-2.5 text-left">Items</th>
                        <th className="px-3 py-2.5 text-right">Total (PKR)</th>
                        <th className="px-3 py-2.5 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((r, i) => (
                        <tr key={r.id || i} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                          <td className="px-3 py-2.5 text-slate-500">{i + 1}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap font-medium">{r.date}</td>
                          <td className="px-3 py-2.5 font-semibold text-indigo-700 dark:text-indigo-300">{r.billNo}</td>
                          <td className="px-3 py-2.5 font-medium">{r.waiter}</td>
                          <td className="px-3 py-2.5 capitalize">{r.paymentMethod}</td>
                          <td className="px-3 py-2.5 max-w-[18rem]">
                            <div className="truncate text-xs text-slate-600 dark:text-slate-300" title={r.itemsLabel}>
                              {r.itemsLabel}
                            </div>
                            <div className="text-[11px] text-slate-400">{r.itemsCount !== '—' ? `${r.itemsCount} qty` : ''}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap">{Number(r.total || 0).toLocaleString()}</td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {!history.length && (
                        <tr>
                          <td colSpan={8} className="px-3 py-12 text-center text-slate-400">No sales found for this table in the selected period</td>
                        </tr>
                      )}
                    </tbody>
                    {!!history.length && (
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                          <td colSpan={6} className="px-3 py-3 text-right text-sm font-bold">Total</td>
                          <td className="px-3 py-3 text-right text-sm font-black">PKR {historyTotal.toLocaleString()}</td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-slate-200 px-5 py-3 dark:border-slate-700">
              <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-xl border px-4 py-2 text-sm font-semibold">Close</button>
            </div>
          </div>
        </div>
 )}
 </div>
 )
}
