import DataTable from '../../components/DataTable.jsx'
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
      <div className="flex items-center justify-between">
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
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            <button onClick={exportPDF} className="px-4 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium border border-red-200 dark:border-red-700">📄 PDF</button>
            <button onClick={exportCSV} className="px-4 py-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 transition-colors font-medium border border-emerald-200 dark:border-emerald-700">📊 CSV</button>
            <button onClick={bulkPrint} className="px-4 py-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors font-medium border border-blue-200 dark:border-blue-700">🖨️ Bulk Print</button>
          </div>
          <div className="ml-4 flex items-end gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Date Filter</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="ml-auto">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search returns..." className="px-4 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 w-64" />
          </div>
        </div>
      </div>

      <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
        <DataTable
          columns={cols}
          data={rows}
          searchable={false}
          exportable={false}
          pageSize={10}
          pageSizeOptions={[10,25,50,100]}
          compact
          maxHeight={520}
        />
      </div>

      {ConfirmDialog}
    </div>
  )
}
