import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'

export default function CashOpening() {
  const { state, dispatch, businessDate } = useData()
  const { user, token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const authHeaders = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
  const today = businessDate || format(new Date(), 'yyyy-MM-dd')
  const [date, setDate] = useState(today)
  const [openingCash, setOpeningCash] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const [jump, setJump] = useState(1)
  const [loading, setLoading] = useState(false)
  const [serverRows, setServerRows] = useState([])

  // lock if selected date is closed
  const closedDates = useMemo(() => new Set((state.dayCloses||[]).map(d => d.date)), [state.dayCloses])
  const isSelectedDateClosed = closedDates.has(date)
  const isTodayClosed = closedDates.has(today)

  const rows = useMemo(() => [...serverRows], [serverRows])

  const totalOpening = useMemo(() => rows.reduce((a,b) => a + Number(b.openingCash||0), 0), [rows])
  const pageCount = useMemo(() => Math.max(1, Math.ceil(Math.max(0, Number(total||0)) / Math.max(1, Number(limit||10)))), [total, limit])
  useEffect(() => { setPage(1) }, [search, from, to])
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [pageCount])

  // Server-side fetch for history grid
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const params = new URLSearchParams()
        if (from) params.set('from', from)
        if (to) params.set('to', to)
        if (page) params.set('page', String(page))
        if (limit) params.set('limit', String(limit))
        if (search.trim()) params.set('search', search.trim())
        const url = `${API}/api/cash-openings${params.toString() ? `?${params.toString()}` : ''}`
        const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' })
        if (!res.ok) throw new Error(`Failed to load cash openings (${res.status})`)
        const data = await res.json()
        const mapId = (x) => ({ ...x, id: x.id || x._id })
        if (Array.isArray(data)) {
          if (!cancelled) { setServerRows((data||[]).map(mapId)); setTotal((data||[]).length) }
        } else {
          const list = Array.isArray(data?.rows) ? data.rows : []
          const tot = Number(data?.total || list.length || 0)
          if (!cancelled) { setServerRows(list.map(mapId)); setTotal(tot) }
        }
      } catch (e) {
        if (!cancelled) { setServerRows([]); setTotal(0) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [API, token, from, to, page, limit, search])

  const refreshOpenings = async () => {
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (page) params.set('page', String(page))
      if (limit) params.set('limit', String(limit))
      if (search.trim()) params.set('search', search.trim())
      const url = `${API}/api/cash-openings${params.toString() ? `?${params.toString()}` : ''}`
      const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        const mapId = (x) => ({ ...x, id: x.id || x._id })
        if (Array.isArray(data)) { setServerRows((data||[]).map(mapId)); setTotal((data||[]).length) }
        else { const list = Array.isArray(data?.rows) ? data.rows : []; const tot = Number(data?.total || list.length || 0); setServerRows(list.map(mapId)); setTotal(tot) }
      }
      const resAll = await fetch(`${API}/api/cash-openings`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' })
      if (resAll.ok) {
        const listAll = await resAll.json()
        const mapId = (x) => ({ ...x, id: x.id || x._id })
        dispatch({ type: 'HYDRATE', payload: { cashOpenings: (listAll || []).map(mapId) } })
      }
    } catch {}
  }

  const onOpen = async (e) => {
    e.preventDefault()
    if (!date) return
    const amt = Number(openingCash)
    if (Number.isNaN(amt) || amt < 0) {
      toast.error('Please enter a valid positive amount')
      return
    }
    try {
      // If the selected date is closed, ask to re-open and do it
      if (isSelectedDateClosed) {
        const confirmed = await confirm({ title: 'Re-open Day', message: `Date ${date} is closed. Do you want to re-open this day and proceed?` })
        if (!confirmed) return
        const re = await fetch(`${API}/api/day-closes/reopen`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ date }) })
        if (!re.ok) throw new Error('Failed to re-open day')
        await refreshDayCloses()
      }
      const res = await fetch(`${API}/api/cash-openings`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ date, openingCash: amt, note: '', userId: user?.id, userName: user?.name }) })
      if (!res.ok) throw new Error('Failed to open day')
      await refreshOpenings()
      setOpeningCash('')
      toast.success(`Opening cash recorded: PKR ${amt.toLocaleString()}`)
    } catch {
      toast.error('Failed to open day')
    }
  }

  const refreshDayCloses = async () => {
    try {
      const res = await fetch(`${API}/api/day-closes`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' })
      if (!res.ok) return
      const list = await res.json()
      const mapId = (x) => ({ ...x, id: x.id || x._id })
      dispatch({ type: 'HYDRATE', payload: { dayCloses: (list || []).map(mapId) } })
    } catch {}
  }

  const exportCSV = () => {
    const headers = ['Date','Opening Cash','User']
    const lines = rows.map(r => [r.date, r.openingCash, r.userName || '']
      .map(v => '"' + String(v ?? '').replaceAll('"','""') + '"').join(',')).join('\n')
    const csv = headers.join(',') + '\n' + lines
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cash_opening_history.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text('Cash Opening History', 14, 16)
    const body = rows.map(r => [r.date, `PKR ${Number(r.openingCash).toLocaleString()}`, r.userName || '-'])
    autoTable(doc, {
      head: [['Date','Opening Cash','User']],
      body,
      startY: 20,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [240,240,240], textColor: 0 },
      foot: [[
        'Totals', `PKR ${totalOpening.toLocaleString()}`, ''
      ]],
      footStyles: { fillColor: [245,245,245] },
    })
    doc.save('cash_opening_history.pdf')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="text-3xl">💰</span> Cash Opening
        </h1>
      </div>

      <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Record Opening Cash</h2>
          {isTodayClosed && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">🔒 Today Closed</span>
          )}
        </div>
        
        {isSelectedDateClosed && (
          <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <span className="text-xl">⚠️</span>
              <span className="font-medium">Selected date is closed. You can re-open it to record cash.</span>
            </div>
          </div>
        )}
        
        <form onSubmit={onOpen} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Opening Cash Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500 dark:text-gray-400 font-medium">PKR</span>
              <input type="number" min="0" value={openingCash} onChange={e => setOpeningCash(e.target.value)} placeholder="0" className="w-full pl-12 pr-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
            </div>
          </div>
          <div className="flex items-end">
            <button type="submit" className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]">
              {isSelectedDateClosed ? '🔓 Re-open & Record' : '✓ Record Opening'}
            </button>
          </div>
        </form>
      </div>

      <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Cash Opening History</h2>
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Date, amount, user..." className="px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="overflow-x-auto border-2 border-gray-200 dark:border-gray-700 rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Opening Cash</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">User</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-medium">{r.date}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">PKR {Number(r.openingCash).toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.userName || '-'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-gray-500 dark:text-gray-400" colSpan={3}>
                    <div className="text-4xl mb-2">💰</div>
                    <div>No records yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr className="border-t">
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">Total Opening Cash</td>
                <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">PKR {totalOpening.toLocaleString()}</td>
                <td className="px-4 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between mt-4 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200 dark:border-gray-700 gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Page {page} of {pageCount} • {total} total</span>
              <div className="flex items-center gap-1">
                <label className="text-sm text-gray-600 dark:text-gray-400">Show:</label>
                <select value={limit} onChange={e=>{ setLimit(Number(e.target.value) || 10); setPage(1); setJump(1) }} className="px-2 py-1 text-sm border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600">
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button disabled={page<=1 || loading} onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">← Prev</button>
              <button disabled={page>=pageCount || loading} onClick={()=>setPage(p=>Math.min(pageCount,p+1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">Next →</button>
              <div className="flex items-center gap-1 ml-2">
                <input type="number" min={1} max={pageCount} value={jump} onChange={e=>setJump(Number(e.target.value)||1)} className="w-16 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-center bg-white dark:bg-gray-800 dark:text-gray-100" />
                <button disabled={loading || pageCount<1} onClick={()=>setPage(Math.min(pageCount, Math.max(1, Number(jump)||1)))} className="px-4 py-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Go</button>
              </div>
            </div>
          </div>
        )}
      </div>
      {ConfirmDialog}
    </div>
  )
}
