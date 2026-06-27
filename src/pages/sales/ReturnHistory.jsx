import { useData } from '../../state/DataContext.jsx'
import { useMemo, useState, useEffect } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { format } from 'date-fns'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'

export default function ReturnHistory() {
  const { state, dispatch, businessDate } = useData()
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const [date, setDate] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [jump, setJump] = useState(1)
  // Removed detail drawer and selected state

  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

  const closedDates = useMemo(() => new Set((state.dayCloses||[]).map(d => d.date)), [state.dayCloses])
  const isTodayClosed = closedDates.has(businessDate)
  const isFilterDateClosed = !!date && closedDates.has(date)

  // Show only item name(s) for the Items column (no qty)
  const itemsToText = (r) => r.items.map(it => `${state.menu.find(m => m.id===it.itemId)?.name || 'Item'}`).join(', ')

  const refreshReturns = async () => {
    try {
      const q = new URLSearchParams()
      if (date) q.set('date', date)
      const res = await fetch(`${API}/api/returns?${q.toString()}`, { headers: authHeaders })
      if (!res.ok) return
      const list = await res.json()
      const mapId = (x) => ({ ...x, id: x.id || x._id })
      dispatch({ type: 'HYDRATE', payload: { returns: (list || []).map(mapId) } })
    } catch {}
  }

  useEffect(() => { refreshReturns() }, [date])

  const rows = useMemo(() => {
    let list = state.returns || []
    if (date) list = list.filter(s => s.date === date)
    let mapped = list.map((r) => ({
      id: r.id,
      date: r.date,
      saleRef: r.saleId ? (state.sales.find(s => s.id===r.saleId)?.billNo ? `BILL-${state.sales.find(s => s.id===r.saleId)?.billNo}` : r.saleId.slice(0,6)) : '-',
      // Prefer customer.name when customer is an object, otherwise use string; fallback to linked sale's customer name
      customer: (typeof r.customer === 'object' && r.customer !== null ? (r.customer.name || '-') : (r.customer || state.sales.find(s => s.id===r.saleId)?.customer?.name || '-')),
      refund: Number(r.refund || 0),
      paymentMethod: r.paymentMethod || 'cash',
      reason: r.reason || '-',
      itemsText: itemsToText(r),
    }))
    if (search) {
      const t = search.toLowerCase()
      mapped = mapped.filter(row => Object.values(row).some(v => String(v).toLowerCase().includes(t)))
    }
    return mapped
  }, [state.returns, state.sales, state.menu, date, search])

  const cols = [
    { label: 'Date', key: 'date', render: r => <span className="font-medium">{r.date}</span> },
    { label: 'Sale Ref', key: 'saleRef', render: r => <span className="text-blue-600 dark:text-blue-400">{r.saleRef}</span> },
    { label: 'Customer', key: 'customer', render: r => <span className="text-gray-700 dark:text-gray-300">{r.customer}</span> },
    { label: 'Refund', key: 'refund', render: r => <span className="font-semibold text-emerald-600 dark:text-emerald-400">PKR {Number(r.refund).toLocaleString()}</span> },
    { label: 'Payment', key: 'paymentMethod', render: r => <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">{r.paymentMethod}</span> },
    { label: 'Reason', key: 'reason', render: r => <span className="text-gray-600 dark:text-gray-400 text-sm">{r.reason}</span> },
    { label: 'Items', key: 'itemsText', render: r => <span className="text-sm text-gray-700 dark:text-gray-300">{r.itemsText}</span> },
    { label: 'Actions', key: 'actions', render: r => (
      <button
        onClick={async () => {
          if (closedDates.has(r.date)) return
          const confirmed = await confirm({ title: 'Delete Return', message: 'Delete this return? This may impact related reports.' })
          if (!confirmed) return
          try {
            await fetch(`${API}/api/returns/${r.id}`, { method: 'DELETE', headers: authHeaders })
            await refreshReturns()
            toast.success('Return deleted')
          } catch {
            toast.error('Failed to delete return')
          }
        }}
        disabled={closedDates.has(r.date)}
        className="px-3 py-1.5 text-sm rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >Delete</button>
    ) },
  ]

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('Return History', 14, 16)
    doc.setFontSize(10)
    doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 24)
    const body = rows.map(r => [r.date, r.saleRef, r.customer, `PKR ${Number(r.refund).toLocaleString()}`, r.paymentMethod, r.reason])
    doc.autoTable({ 
      head: [['Date','Sale Ref','Customer','Refund','Payment','Reason']], 
      body,
      startY: 30,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 }
    })
    doc.save(`returns-${format(new Date(), 'yyyy-MM-dd')}.pdf`)
    toast.success('PDF exported')
  }

  const exportCSV = () => {
    const headers = ['Date','Sale Ref','Customer','Refund (PKR)','Payment','Reason','Items']
    const lines = rows.map(r => [r.date,r.saleRef,r.customer,r.refund,r.paymentMethod,r.reason,r.itemsText]
      .map(v => '"' + String(v ?? '').replaceAll('"','""') + '"').join(',')).join('\n')
    const csv = headers.join(',') + '\n' + lines
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `returns-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported')
  }

  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / limit)) || 1
  const start = (page - 1) * limit
  const pagedRows = rows.slice(start, start + limit)

  const bulkPrint = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const rowsHtml = rows.map(r => `<tr>
      <td>${r.date}</td><td>${r.saleRef}</td><td>${r.customer}</td><td>${r.refund}</td><td>${r.paymentMethod}</td><td>${r.reason}</td>
    </tr>`).join('')
    win.document.write(`<!doctype html><html><head><title>Bulk Print</title>
      <style>body{font-family:sans-serif} table{width:100%; border-collapse:collapse} th,td{border:1px solid #ddd;padding:6px;font-size:12px} th{background:#f3f4f6}</style>
    </head><body>
      <h3>Return History</h3>
      <table><thead><tr><th>Date</th><th>Sale Ref</th><th>Customer</th><th>Refund</th><th>Payment</th><th>Reason</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      <script>window.onload=()=>window.print()</script>
    </body></html>`)
    win.document.close()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="text-3xl">🔄</span> Return History
        </h1>
      </div>

      {isTodayClosed && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <span className="text-xl">⚠️</span>
            <span className="font-semibold">Today is closed. Edits for today are locked.</span>
          </div>
        </div>
      )}
      {isFilterDateClosed && (
        <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800">
          <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
            <span className="text-xl">🔒</span>
            <span className="font-semibold">Selected date is closed. Deleting returns for this date is disabled.</span>
          </div>
        </div>
      )}

      <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3">
          <div className="flex flex-wrap gap-2">
            <button onClick={exportPDF} className="px-4 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium border border-red-200 dark:border-red-700">📄 PDF</button>
            <button onClick={exportCSV} className="px-4 py-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 transition-colors font-medium border border-emerald-200 dark:border-emerald-700">📊 CSV</button>
            <button onClick={bulkPrint} className="px-4 py-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors font-medium border border-blue-200 dark:border-blue-700">🖨️ Bulk Print</button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Date Filter</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="sm:ml-auto w-full sm:w-auto">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search returns..." className="w-full sm:w-64 px-4 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
            <tr>
              {cols.map(c => (
                <th key={c.key} className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map(r => (
              <tr key={r.id} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                {cols.map(c => (
                  <td key={c.key} className="px-4 py-3">{c.render ? c.render(r) : r[c.key]}</td>
                ))}
              </tr>
            ))}
            {pagedRows.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  <div className="text-4xl mb-2">🔄</div>
                  <div>No returns found</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between mt-4 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200 dark:border-gray-700 gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Page {page} of {totalPages} • {total} total</span>
            <div className="flex items-center gap-1">
              <label className="text-sm text-gray-600 dark:text-gray-400">Show:</label>
              <select value={limit} onChange={e=>{ setLimit(Number(e.target.value)); setPage(1); setJump(1) }} className="px-2 py-1 text-sm border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600">
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">← Prev</button>
            <button disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">Next →</button>
            <div className="flex items-center gap-1 ml-2">
              <input type="number" min={1} max={totalPages} value={jump} onChange={e=>setJump(Number(e.target.value)||1)} className="w-16 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-center bg-white dark:bg-gray-800 dark:text-gray-100" />
              <button disabled={totalPages<1} onClick={()=>setPage(Math.min(totalPages, Math.max(1, Number(jump)||1)))} className="px-4 py-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Go</button>
            </div>
          </div>
        </div>
      )}

      {ConfirmDialog}
    </div>
  )
}
