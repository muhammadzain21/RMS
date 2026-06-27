import { useMemo, useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'

export default function PayInOut() {
  const { state, dispatch, businessDate } = useData()
  const { user, token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const today = businessDate || format(new Date(), 'yyyy-MM-dd')

  const [date, setDate] = useState(today)
  const [type, setType] = useState('IN')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [serverRows, setServerRows] = useState([])

  // preset categories
  const presetCategories = ['Petty Cash','Supplies','Maintenance','Tips','Refund','Misc']

  // lock edits after day close
  const closedDates = useMemo(() => new Set((state.dayCloses||[]).map(d => d.date)), [state.dayCloses])
  const isSelectedDateClosed = closedDates.has(date)

  const rows = serverRows

  const totals = useMemo(() => {
    const IN = rows.filter(r => r.type === 'IN').reduce((a,b)=>a+Number(b.amount||0),0)
    const OUT = rows.filter(r => r.type === 'OUT').reduce((a,b)=>a+Number(b.amount||0),0)
    return { IN, OUT, NET: IN-OUT }
  }, [rows])

  const categoryTotals = useMemo(() => {
    const map = {}
    rows.forEach(r => {
      const key = r.category || 'Uncategorized'
      map[key] = (map[key] || 0) + Number(r.amount || 0) * (r.type === 'OUT' ? -1 : 1)
    })
    return Object.entries(map).sort((a,b) => a[0].localeCompare(b[0]))
  }, [rows])

  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }), [token])

  const refreshPayIO = useCallback(async (resetPage = false) => {
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (search.trim()) params.set('search', search.trim())
      const currentPage = resetPage ? 1 : page
      params.set('page', currentPage)
      params.set('limit', limit)
      const res = await fetch(`${API}/api/pay-in-outs?${params.toString()}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
      if (!res.ok) return
      const data = await res.json()
      const mapId = (x) => ({ ...x, id: x.id || x._id })
      setServerRows((data.rows || []).map(mapId))
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 1)
      if (resetPage) setPage(1)
    } catch {}
  }, [from, to, search, page, limit, API, token])

  // Refresh data when filters change
  useEffect(() => {
    refreshPayIO()
  }, [refreshPayIO])

  // Reset page when filters change (but not page itself)
  useEffect(() => {
    setPage(1)
  }, [from, to, search])

  const onAdd = async (e) => {
    e.preventDefault()
    if (isSelectedDateClosed) { toast.error('This date is closed. You cannot add Pay In/Out.'); return }
    const amt = Number(amount)
    if (!date || !type || !category.trim() || Number.isNaN(amt) || amt <= 0) {
      toast.error('Date, Type, Category are required. Amount must be > 0.')
      return
    }
    try {
      const body = { date, type, amount: amt, category: category.trim(), note, userId: user?.id, userName: user?.name }
      const res = await fetch(`${API}/api/pay-in-outs`, { method: 'POST', headers, body: JSON.stringify(body) })
      if (!res.ok) {
        if (res.status === 409) { toast.error('Date is closed'); return }
        throw new Error('Failed to save')
      }
      const saved = await res.json()
      dispatch({ type: 'ADD_PAY_IO', payload: { ...saved, id: saved.id || saved._id, date, type, amount: amt, category: category.trim(), note, userId: user?.id, userName: user?.name } })
      await refreshPayIO()
      setCategory('')
      setAmount('')
      setNote('')
      setType('IN')
      setDate(today)
      toast.success(`${type === 'IN' ? 'Pay In' : 'Pay Out'} recorded: PKR ${amt.toLocaleString()}`)
    } catch {
      toast.error('Failed to save entry')
    }
  }

  const remove = async (id) => {
    const confirmed = await confirm({ title: 'Delete Entry', message: 'Delete this entry?' })
    if (!confirmed) return
    try {
      const res = await fetch(`${API}/api/pay-in-outs/${id}`, { method: 'DELETE', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
      if (!res.ok) throw new Error('Failed')
      dispatch({ type: 'DELETE_PAY_IO', payload: { id } })
      await refreshPayIO()
    } catch {
      toast.error('Failed to delete entry')
    }
  }

  const exportCSV = () => {
    const header = ['Date','Type','Category','Amount','Note','User']
    const lines = [header.join(',')]
    rows.forEach(r => {
      lines.push([r.date, r.type, r.category, r.amount, JSON.stringify(r.note||''), r.userName||''].join(','))
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'pay_in_out.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.text('Pay In / Pay Out', 14, 16)
    autoTable(doc, {
      startY: 20,
      head: [[ 'Date','Type','Category','Amount','Note','User' ]],
      body: rows.map(r => [ r.date, r.type, r.category, `PKR ${Number(r.amount).toLocaleString()}`, r.note||'-', r.userName||'-' ]),
      foot: [[ '', '', 'Totals', `IN: PKR ${totals.IN.toLocaleString()}`, `OUT: PKR ${totals.OUT.toLocaleString()}`, `NET: PKR ${totals.NET.toLocaleString()}` ]],
      footStyles: { fillColor: [245,245,245] },
    })
    doc.save('pay_in_out.pdf')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="text-3xl">💳</span> Pay In / Pay Out
        </h1>
      </div>

      <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Record Transaction</h2>
          {isSelectedDateClosed && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200">🔒 Date Closed</span>
          )}
        </div>

        {isSelectedDateClosed && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
              <span className="text-xl">🚫</span>
              <span className="font-medium">Selected date is closed. Adding new entries is disabled.</span>
            </div>
          </div>
        )}

        <form onSubmit={onAdd} className="grid grid-cols-1 sm:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
            <select value={type} onChange={e=>setType(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500">
              <option value="IN">📥 Pay In (Cash In)</option>
              <option value="OUT">📤 Pay Out (Cash Out)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
            <input list="payio-categories" value={category} onChange={e=>setCategory(e.target.value)} placeholder="Petty Cash / Supplies / ..." className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500" />
            <datalist id="payio-categories">
              {presetCategories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500 dark:text-gray-400 font-medium">PKR</span>
              <input type="number" min="1" value={amount} onChange={e=>setAmount(e.target.value)} className="w-full pl-12 pr-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500" placeholder="0" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note</label>
            <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional description..." className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="sm:col-span-6">
            <button disabled={isSelectedDateClosed} className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
              ✓ Add {type === 'IN' ? 'Pay In' : 'Pay Out'}
            </button>
          </div>
        </form>
      </div>

      <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Transaction History</h2>
          <div className="flex gap-2 items-end flex-wrap">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">From</label>
              <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">To</label>
              <input type="date" value={to} onChange={e=>setTo(e.target.value)} className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Search</label>
              <input placeholder="Date, type, category, note, user..." value={search} onChange={e=>setSearch(e.target.value)} className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 w-64" />
            </div>
            <div className="flex gap-2">
              <button onClick={exportCSV} className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 transition-colors font-medium border border-emerald-200 dark:border-emerald-700 text-sm">📊 CSV</button>
              <button onClick={exportPDF} className="px-3 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium border border-red-200 dark:border-red-700 text-sm">📄 PDF</button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto border-2 border-gray-200 dark:border-gray-700 rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Category</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Amount</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Note</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">User</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-medium">{r.date}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.type === 'IN' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200'}`}>
                      {r.type === 'IN' ? '📥 IN' : '📤 OUT'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.category || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${r.type === 'IN' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {r.type === 'IN' ? '+' : '-'}PKR {Number(r.amount).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">{r.note || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.userName || '-'}</td>
                  <td className="px-4 py-3">
                    <button onClick={()=>remove(r.id)} disabled={closedDates.has(r.date)} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium text-sm border border-red-200 dark:border-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
                      🗑️ Delete
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-gray-500 dark:text-gray-400" colSpan={7}>
                    <div className="text-4xl mb-2">💳</div>
                    <div>No data.</div>
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr className="border-t">
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">Totals</td>
                <td className="px-4 py-3" colSpan={2}></td>
                <td className="px-4 py-3" colSpan={4}>
                  <div className="flex flex-wrap gap-4">
                    <span className="text-emerald-600 dark:text-emerald-400">📥 IN: PKR {totals.IN.toLocaleString()}</span>
                    <span className="text-rose-600 dark:text-rose-400">📤 OUT: PKR {totals.OUT.toLocaleString()}</span>
                    <span className="text-blue-600 dark:text-blue-400 font-bold">NET: PKR {totals.NET.toLocaleString()}</span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Showing {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} of {total} entries
            </div>
            <div className="flex items-center gap-2">
              <select
                value={limit}
                onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:text-white border-gray-300 dark:border-gray-600"
              >
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >«</button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >&lt;</button>
                <span className="px-3 py-2 text-gray-700 dark:text-gray-300 font-medium">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >&gt;</button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >»</button>
              </div>
            </div>
          </div>
        )}

        {/* Category summary */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold mb-3 text-gray-800 dark:text-gray-100">Category Summary (NET)</h3>
          <div className="overflow-x-auto border-2 border-gray-200 dark:border-gray-700 rounded-xl">
            <table className="min-w-[24rem] text-sm">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Category</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Net Amount</th>
                </tr>
              </thead>
              <tbody>
                {categoryTotals.map(([cat, amt]) => (
                  <tr key={cat} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{cat}</td>
                    <td className={`px-4 py-3 font-semibold ${Number(amt) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {Number(amt) >= 0 ? '+' : ''}PKR {Number(amt).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {categoryTotals.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-gray-500 dark:text-gray-400" colSpan={2}>
                      <div className="text-2xl mb-1">📊</div>
                      <div>No data.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  )
}
