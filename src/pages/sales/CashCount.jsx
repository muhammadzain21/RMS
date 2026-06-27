import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import SlipDialog from '../../components/SlipDialog.jsx'

export default function CashCount() {
  const { state, businessDate } = useData()
  const { user, token } = useAuth()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const authHeaders = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
  const today = businessDate || format(new Date(), 'yyyy-MM-dd')
  const [date, setDate] = useState(today)
  const [amount, setAmount] = useState('')
  const [receiver, setReceiver] = useState('')
  const [note, setNote] = useState('')
  const [autoPrint, setAutoPrint] = useState(true)
  const [slipHtml, setSlipHtml] = useState(null)
  const [slipAutoPrint, setSlipAutoPrint] = useState(false)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [jump, setJump] = useState(1)
  const [rows, setRows] = useState([])

  const totalAmount = useMemo(() => rows.reduce((a,b) => a + Number(b.amount||0), 0), [rows])

  const refreshCashCounts = useCallback(async (resetPage = false) => {
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (search.trim()) params.set('search', search.trim())
      const currentPage = resetPage ? 1 : page
      params.set('page', currentPage)
      params.set('limit', limit)
      const res = await fetch(`${API}/api/cash-counts?${params.toString()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) return
      const data = await res.json()
      setRows((data.rows || []).map(x => ({ ...x, id: x.id || x._id })))
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 1)
      if (resetPage) setPage(1)
    } catch {}
  }, [from, to, search, page, limit, API, token])

  // Fetch on mount / when deps change
  useEffect(() => {
    refreshCashCounts()
  }, [refreshCashCounts])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [from, to, search])

  const printSlip = ({ date, amount, receiver, note, userName, entryId, createdAt }) => {
    const dt = new Date()
    const nowDate = format(dt, 'd-M-yyyy')
    const nowTime = format(dt, 'h:mm a')
    const settings = state.settings || {}
    const companyName = settings.companyName || "O'RESTO"
    const phone = settings.phone || ''
    const address = settings.address || ''
    const logo = settings.logo || ''
    const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cash Count Slip</title>
      <style>
        body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial; padding:12px;}
        .center{text-align:center}
        .bold{font-weight:700}
        table{width:100%; border-collapse:collapse}
        td{font-size:12px; padding:4px 0}
        .line{border-top:1px dashed #333; margin:8px 0}
        .kv{display:flex; justify-content:space-between; align-items:flex-start}
        .kv span:first-child{flex-shrink:0; margin-right:8px}
        .kv span:last-child{white-space:nowrap; text-align:right}
      </style></head><body>
        ${logo ? `<div class="center"><img src="${escapeHtml(logo)}" style="max-height:60px;max-width:100%;display:block;margin:0 auto 4px" /></div>` : ''}
        <div class="center bold" style="font-size:16px">${escapeHtml(companyName)}</div>
        ${phone ? `<div class="center">${escapeHtml(phone)}</div>` : ''}
        ${address ? `<div class="center">${escapeHtml(address)}</div>` : ''}
        <div class="line"></div>
        <div class="center bold">Manager Cash Count</div>
        <div class="kv"><span>Entry Date:</span><span>${createdAt ? format(new Date(createdAt), 'd-M-yyyy') : escapeHtml(date || '')}</span></div>
        <div class="kv"><span>Entry Time:</span><span>${createdAt ? format(new Date(createdAt), 'h:mm a') : '-'}</span></div>
        <div class="kv"><span>Printed Date:</span><span>${nowDate}</span></div>
        <div class="kv"><span>Printed Time:</span><span>${nowTime}</span></div>
        <div class="kv"><span>User (From):</span><span>${escapeHtml(userName || '-')}</span></div>
        <div class="kv"><span>Receiver (To):</span><span>${escapeHtml(receiver || '-')}</span></div>
        <div class="line"></div>
        <table>
          <tr><td>Amount Counted</td><td style="text-align:right">PKR ${fmt(amount)}</td></tr>
          <tr><td>Note</td><td style="text-align:right">${escapeHtml(note || '-')}</td></tr>
        </table>
        <div class="line"></div>
      </body></html>`

    setSlipHtml(html)
  }

  const onAdd = async (e) => {
    e.preventDefault()
    const amt = Number(amount)
    if (!date || Number.isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid positive amount')
      return
    }
    try {
      const res = await fetch(`${API}/api/cash-counts`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ date, amount: amt, receiver, note }) })
      if (!res.ok) throw new Error('Failed to add')
      const created = await res.json()
      // optimistic update
      setRows(prev => [{ ...created, id: created.id || created._id }, ...prev])
      if (autoPrint) {
        setSlipAutoPrint(true)
        printSlip({ date, amount: amt, receiver, note, userName: user?.name, entryId: created?.id || created?._id })
      }
      setAmount(''); setReceiver(''); setNote('')
      toast.success(`Cash count recorded: PKR ${amt.toLocaleString()}`)
      await refreshCashCounts()
    } catch {
      toast.error('Failed to add cash count')
    }
  }

  const exportCSV = () => {
    const headers = ['Date','Time','Amount (PKR)','Receiver','Note','User']
    const lines = rows.map(r => [r.date, (r.createdAt ? format(new Date(r.createdAt), 'h:mm a') : ''), r.amount, r.receiver, r.note, r.userName || '']
      .map(v => '"' + String(v ?? '').replaceAll('"','""') + '"').join(',')).join('\n')
    const csv = headers.join(',') + '\n' + lines
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cash_count_history_${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported successfully')
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('Manager Cash Count History', 14, 16)
    doc.setFontSize(10)
    doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 24)
    const body = rows.map(r => [
      r.date,
      (r.createdAt ? format(new Date(r.createdAt), 'h:mm a') : ''),
      `PKR ${Number(r.amount).toLocaleString()}`,
      r.receiver || '-',
      r.note || '-',
      r.userName || '-',
    ])
    autoTable(doc, {
      head: [['Date','Time','Amount','Receiver','Note','User']],
      body,
      startY: 30,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      foot: [['Totals', '', `PKR ${totalAmount.toLocaleString()}`, '', '', '']],
      footStyles: { fillColor: [245,245,245] },
    })
    doc.save(`cash_count_history_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
    toast.success('PDF exported successfully')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="text-3xl">🧮</span> Manager Cash Count
        </h1>
      </div>

      <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Record Cash Count</h2>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">ℹ️ No Impact on Day Close</span>
        </div>

        <form onSubmit={onAdd} className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500 dark:text-gray-400 font-medium">PKR</span>
              <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="w-full pl-12 pr-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Receiver</label>
            <input value={receiver} onChange={e => setReceiver(e.target.value)} placeholder="Manager name" className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="flex items-end gap-3">
            <label className="inline-flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <input type="checkbox" checked={autoPrint} onChange={e=>setAutoPrint(e.target.checked)} className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">🖨️ Auto print slip</span>
            </label>
            <button type="submit" className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]">✓ Add</button>
          </div>
        </form>
      </div>

      {slipHtml && <SlipDialog html={slipHtml} title="Cash Count Slip" onClose={() => { setSlipHtml(null); setSlipAutoPrint(false) }} autoPrint={slipAutoPrint} />}

      <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Cash Count History</h2>
          <div className="sm:ml-auto flex flex-wrap gap-2">
            <button onClick={exportCSV} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 transition-colors font-medium border border-emerald-200 dark:border-emerald-700">📊 CSV</button>
            <button onClick={exportPDF} className="px-3 py-1.5 text-sm rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium border border-red-200 dark:border-red-700">📄 PDF</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Search</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Date, amount, receiver..." className="px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="overflow-x-auto border-2 border-gray-200 dark:border-gray-700 rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Time</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Amount</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Receiver</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Note</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">User</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-medium">{r.date}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.createdAt ? format(new Date(r.createdAt), 'h:mm a') : ''}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">PKR {Number(r.amount).toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.receiver || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">{r.note || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.userName || '-'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => { setSlipAutoPrint(false); printSlip({ date: r.date, amount: r.amount, receiver: r.receiver, note: r.note, userName: r.userName, entryId: r.id, createdAt: r.createdAt }) }} className="px-3 py-1.5 text-xs rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors font-medium border border-blue-200 dark:border-blue-700">🖨️ Print</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-gray-500 dark:text-gray-400" colSpan={7}>
                    <div className="text-4xl mb-2">🧮</div>
                    <div>No records yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr className="border-t">
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">Total Counted</td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">PKR {totalAmount.toLocaleString()}</td>
                <td className="px-4 py-3" colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Pagination */}
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
      </div>
    </div>
  )
}
