import { useAuth } from '../state/AuthContext.jsx'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function AuditLog() {
  const { token, users: authUsers, user: currentUser } = useAuth()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const today = useMemo(() => new Date().toLocaleDateString('en-CA'), [])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [type, setType] = useState('')
  const [q, setQ] = useState('')
  const [userId, setUserId] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [jump, setJump] = useState(1)

  const types = ['','recall','kot','void','return','sale','deleted_sale','inventory','expense','booking','cash','day','auth','menu','category','user','staff','supplier','customer','rider','table','settings']

  const typeColors = {
    'sale': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
    'deleted_sale': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
    'return': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
    'void': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
    'kot': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
    'inventory': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
    'expense': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200',
    'booking': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
    'cash': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
    'auth': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
    'user': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-200',
    'settings': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  }

  const getTypeIcon = (t) => {
    const icons = {
      'sale': '🛒',
      'deleted_sale': '🗑️',
      'return': '🔄',
      'void': '🚫',
      'kot': '🧾',
      'inventory': '📦',
      'expense': '💸',
      'booking': '📅',
      'cash': '💰',
      'day': '🌙',
      'auth': '🔐',
      'user': '👤',
      'staff': '👥',
      'menu': '🍔',
      'category': '🗂️',
      'settings': '⚙️',
      'supplier': '🏭',
      'customer': '🤝',
      'rider': '🏍️',
      'table': '🪑',
      'recall': '↩️',
    }
    return icons[t] || '📝'
  }

  const load = async () => {
    if (!token) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (type) params.set('type', type)
      if (userId) params.set('userId', userId)
      if (q) params.set('q', q)
      params.set('limit', '500')
      const res = await fetch(`${API}/api/audit?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      if (res.ok) setRows(await res.json())
    } catch {}
    setLoading(false)
  }

  const pages = Math.ceil(rows.length / limit) || 1
  const paginatedRows = rows.slice((page - 1) * limit, page * limit)

  useEffect(() => { load() }, [token])

  // Build user options: prefer backend users for Admin; else derive from current rows
  const userOptions = useMemo(() => {
    const list = Array.isArray(authUsers) && authUsers.length ? authUsers.map(u => ({ id: u.id, name: u.name || u.username || u.id })) :
      Array.from(new Map(rows.map(r => [r.userId || r.userName || '-', { id: r.userId || '', name: r.userName || '-' }])).values())
    return [{ id: '', name: 'All Users' }, ...list]
  }, [authUsers, rows])

  const exportCSV = () => {
    const headers = ['Time','Type','User','Action']
    const lines = rows.map(r => [
      r.at ? format(new Date(r.at), 'yyyy-MM-dd HH:mm:ss') : '-',
      r.type || '',
      r.userName || r.user || '',
      r.action || r.message || ''
    ].map(v => '"' + String(v ?? '').replaceAll('"','""') + '"').join(',')).join('\n')
    const csv = headers.join(',') + '\n' + lines
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit_log_${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported successfully')
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('Audit Log Report', 14, 16)
    doc.setFontSize(10)
    doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 24)
    if (from || to) {
      doc.text(`Period: ${from || 'All'} to ${to || 'All'}`, 14, 30)
    }
    const body = rows.map(r => [
      r.at ? format(new Date(r.at), 'yyyy-MM-dd HH:mm:ss') : '-',
      r.type || '',
      r.userName || r.user || '-',
      (r.action || r.message || '-').substring(0, 60)
    ])
    autoTable(doc, {
      head: [['Time','Type','User','Action']],
      body,
      startY: from || to ? 34 : 28,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 }
    })
    doc.save(`audit_log_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
    toast.success('PDF exported successfully')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="text-3xl">📝</span> Audit Log
        </h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/30 dark:to-gray-900 border-2 border-blue-200 dark:border-blue-800">
          <div className="text-xs font-semibold uppercase text-blue-600 dark:text-blue-300 mb-1">Total Entries</div>
          <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{rows.length.toLocaleString()}</div>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/30 dark:to-gray-900 border-2 border-emerald-200 dark:border-emerald-800">
          <div className="text-xs font-semibold uppercase text-emerald-600 dark:text-emerald-300 mb-1">Date Range</div>
          <div className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
            {from && to ? `${from} to ${to}` : from ? `From ${from}` : to ? `Until ${to}` : 'All Time'}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/30 dark:to-gray-900 border-2 border-purple-200 dark:border-purple-800">
          <div className="text-xs font-semibold uppercase text-purple-600 dark:text-purple-300 mb-1">Active Filter</div>
          <div className="text-lg font-bold text-purple-900 dark:text-purple-100">
            {type ? `${getTypeIcon(type)} ${type}` : userId ? 'By User' : q ? 'Search' : 'None'}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="p-5 rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50/60 to-white dark:from-indigo-950/30 dark:to-gray-900 shadow-sm">
        <div className="text-sm font-bold text-indigo-900 dark:text-indigo-100 mb-4 flex items-center gap-2">
          <span>🔍</span> Filters
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">📅 From</label>
            <input 
              type="date" 
              value={from} 
              max={to || today} 
              onChange={e=>setFrom(e.target.value)} 
              className="px-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all" 
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">📅 To</label>
            <input 
              type="date" 
              value={to} 
              min={from || ''} 
              max={today} 
              onChange={e=>setTo(e.target.value)} 
              className="px-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all" 
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">🏷️ Type</label>
            <select 
              value={type} 
              onChange={e=>setType(e.target.value)} 
              className="px-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all min-w-[8rem]"
            >
              {types.map(t => <option key={t||'all'} value={t}>{t ? `${getTypeIcon(t)} ${t}` : '📋 All Types'}</option>)}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">👤 User</label>
            <select 
              value={userId} 
              onChange={e=>setUserId(e.target.value)} 
              className="px-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all min-w-[10rem]"
            >
              {userOptions.map(u => <option key={u.id || 'all'} value={u.id}>{u.name || u.id || 'Unknown'}</option>)}
            </select>
          </div>
          <div className="flex flex-col flex-1 min-w-[12rem]">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">🔎 Search</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-400 dark:text-gray-500">🔍</span>
              <input 
                value={q} 
                onChange={e=>setQ(e.target.value)} 
                placeholder="Find action..." 
                className="w-full pl-10 pr-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all" 
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={load} 
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              {loading ? '⏳ Loading...' : '🔍 Apply'}
            </button>
            <button 
              onClick={()=>{ setFrom(''); setTo(''); setType(''); setQ(''); setUserId(''); setTimeout(load,0) }} 
              className="px-4 py-2 rounded-lg bg-gradient-to-br from-gray-500 to-gray-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95"
            >
              🔄 Reset
            </button>
          </div>
        </div>
      </div>

      {/* Export Buttons */}
      <div className="flex justify-end gap-2">
        <button 
          onClick={exportCSV} 
          disabled={rows.length === 0}
          className="px-4 py-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 transition-colors font-medium border border-emerald-200 dark:border-emerald-700 disabled:opacity-50"
        >
          📊 Export CSV
        </button>
        <button 
          onClick={exportPDF} 
          disabled={rows.length === 0}
          className="px-4 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium border border-red-200 dark:border-red-700 disabled:opacity-50"
        >
          📄 Export PDF
        </button>
      </div>

      {/* Data Table */}
      <div className="border-2 border-indigo-200 dark:border-indigo-800 rounded-xl overflow-x-auto shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
            <tr>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Time</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Type</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">User</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map(r => (
              <tr key={r.id || r.at} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="p-3 text-gray-700 dark:text-gray-300">{r.at ? format(new Date(r.at), 'yyyy-MM-dd HH:mm:ss') : '-'}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeColors[r.type] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'}`}>
                    {getTypeIcon(r.type)} {r.type || 'other'}
                  </span>
                </td>
                <td className="p-3 font-medium text-gray-900 dark:text-gray-100">{r.userName || r.user || '-'}</td>
                <td className="p-3 text-sm text-gray-700 dark:text-gray-300">{r.action || r.message || '-'}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <div className="text-4xl mb-2">📝</div>
                  <div>No audit entries found</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between mt-4 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200 dark:border-gray-700 gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Page {page} of {pages} • {rows.length} total</span>
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
          <button disabled={page<=1 || loading} onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">← Prev</button>
          <button disabled={page>=pages || loading} onClick={()=>setPage(p=>Math.min(pages,p+1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">Next →</button>
          <div className="flex items-center gap-1 ml-2">
            <input type="number" min={1} max={pages} value={jump} onChange={e=>setJump(Number(e.target.value)||1)} className="w-16 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-center bg-white dark:bg-gray-800 dark:text-gray-100" />
            <button disabled={loading || pages<1} onClick={()=>setPage(Math.min(pages, Math.max(1, Number(jump)||1)))} className="px-4 py-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Go</button>
          </div>
        </div>
      </div>

      {rows.length === 0 && !loading && (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700">
          <div className="text-4xl mb-2">📝</div>
          <p>No audit entries found. Adjust your filters to see results.</p>
        </div>
      )}
    </div>
  )
}
