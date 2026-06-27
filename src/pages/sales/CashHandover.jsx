import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import SlipDialog from '../../components/SlipDialog.jsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function CashHandover() {
  const { state, dispatch, businessDate } = useData()
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

  // lock edits after day close
  const closedDates = useMemo(() => new Set((state.dayCloses||[]).map(d => d.date)), [state.dayCloses])
  const isSelectedDateClosed = closedDates.has(date)
  const isTodayClosed = closedDates.has(today)

  const rows = useMemo(() => {
    let list = state.cashHandovers || []
    if (from) list = list.filter(r => r.date >= from)
    if (to) list = list.filter(r => r.date <= to)
    if (search) {
      const t = search.toLowerCase()
      list = list.filter(r => r.date.includes(search) || String(r.amount).toLowerCase().includes(t) || (r.receiver||'').toLowerCase().includes(t) || (r.note||'').toLowerCase().includes(t) || (r.userName||'').toLowerCase().includes(t))
    }
    return list
  }, [state.cashHandovers, from, to, search])

  const totalAmount = useMemo(() => rows.reduce((a,b) => a + Number(b.amount||0), 0), [rows])

  const printSlip = ({ date, amount, receiver, note, userName, entryId, createdAt }) => {
    const dt = new Date()
    const nowDate = format(dt, 'd-M-yyyy')
    const nowTime = format(dt, 'h:mm a')
    const settings = state.settings || {}
    const companyName = settings.companyName || 'Restaurant POS'
    const phone = settings.phone || ''
    const address = settings.address || ''
    const logo = settings.logo || ''
    const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cash Handover Slip</title>
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
        <div class="center bold">Cash Handover Slip</div>
        <div class="kv"><span>Entry Date:</span><span>${createdAt ? format(new Date(createdAt), 'd-M-yyyy') : escapeHtml(date || '')}</span></div>
        <div class="kv"><span>Entry Time:</span><span>${createdAt ? format(new Date(createdAt), 'h:mm a') : '-'}</span></div>
        <div class="kv"><span>Printed Date:</span><span>${nowDate}</span></div>
        <div class="kv"><span>Printed Time:</span><span>${nowTime}</span></div>
        <div class="kv"><span>User (From):</span><span>${escapeHtml(userName || '-')}</span></div>
        <div class="kv"><span>Receiver (To):</span><span>${escapeHtml(receiver || '-')}</span></div>
        <div class="line"></div>
        <table>
          <tr><td><b>Amount</b></td><td style="text-align:right"><b>PKR ${fmt(amount)}</b></td></tr>
          <tr><td>Note</td><td style="text-align:right">${escapeHtml(note || '-')}</td></tr>
        </table>
        <div class="line"></div>
      </body></html>`

    setSlipHtml(html)
  }

  const refreshHandovers = async () => {
    try {
      const res = await fetch(`${API}/api/cash-handovers`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' })
      if (!res.ok) return
      const list = await res.json()
      const mapId = (x) => ({ ...x, id: x.id || x._id })
      dispatch({ type: 'HYDRATE', payload: { cashHandovers: (list || []).map(mapId) } })
    } catch {}
  }

  // Fetch on mount
  useEffect(() => { refreshHandovers() }, [])

  const onAdd = async (e) => {
    e.preventDefault()
    if (isSelectedDateClosed) { toast.error('This date is closed. You cannot add handovers.'); return }
    const amt = Number(amount)
    if (!date || Number.isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid positive amount')
      return
    }
    if (!receiver.trim()) {
      toast.error('Please enter receiver name')
      return
    }
    try {
      const res = await fetch(`${API}/api/cash-handovers`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ date, amount: amt, receiver: receiver.trim(), note, userId: user?.id, userName: user?.name }) })
      if (res.status === 409) { toast.error('Date is closed'); return }
      if (!res.ok) throw new Error('Failed to add handover')
      await refreshHandovers()
      if (autoPrint) {
        setSlipAutoPrint(true)
        printSlip({ date, amount: amt, receiver, note, userName: user?.name })
      }
      setAmount('')
      setReceiver('')
      setNote('')
      toast.success(`Handover recorded: PKR ${amt.toLocaleString()} to ${receiver}`)
    } catch {
      toast.error('Failed to add handover')
    }
  }

  const exportCSV = () => {
    const headers = ['Date','Amount','Receiver','Note','User','Entry ID']
    const lines = rows.map(r => [r.date, r.amount, r.receiver, r.note, r.userName || '', r.id]
      .map(v => '"' + String(v ?? '').replaceAll('"','""') + '"').join(',')).join('\n')
    const csv = headers.join(',') + '\n' + lines
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cash_handover_history.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text('Cash Handover History', 14, 16)
    const body = rows.map(r => [r.date, `PKR ${Number(r.amount).toLocaleString()}`, r.receiver || '-', r.note || '-', r.userName || '-', r.id])
    autoTable(doc, {
      head: [['Date','Amount','Receiver','Note','User','Entry ID']],
      body,
      startY: 20,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [240,240,240], textColor: 0 },
      foot: [[
        'Totals', `PKR ${totalAmount.toLocaleString()}`, '', '', '', ''
      ]],
      footStyles: { fillColor: [245,245,245] },
    })
    doc.save('cash_handover_history.pdf')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="text-3xl">💸</span> Cash Handover
        </h1>
      </div>

      <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Record Cash Handover</h2>
          {isTodayClosed && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">🔒 Today Closed</span>
          )}
        </div>

        {isSelectedDateClosed && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
              <span className="text-xl">🚫</span>
              <span className="font-medium">Selected date is closed. Adding new handovers is disabled.</span>
            </div>
          </div>
        )}

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
            <button type="submit" disabled={isSelectedDateClosed} className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
              ✓ Add Handover
            </button>
          </div>
        </form>
      </div>

      {slipHtml && <SlipDialog html={slipHtml} title="Cash Handover Slip" onClose={() => { setSlipHtml(null); setSlipAutoPrint(false) }} autoPrint={slipAutoPrint} />}

      <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Cash Handover History</h2>
          <div className="ml-auto flex flex-wrap gap-2">
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
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Print Slip</th>
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
                    <button
                      className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors font-medium text-sm border border-blue-200 dark:border-blue-700"
                      onClick={() => { setSlipAutoPrint(false); printSlip({ date: r.date, amount: r.amount, receiver: r.receiver, note: r.note, userName: r.userName, entryId: r.id, createdAt: r.createdAt }) }}
                    >🖨️ Print</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-gray-500 dark:text-gray-400" colSpan={7}>
                    <div className="text-4xl mb-2">💸</div>
                    <div>No records yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr className="border-t">
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">Total Handed Over</td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">PKR {totalAmount.toLocaleString()}</td>
                <td className="px-4 py-3" colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
