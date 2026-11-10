import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'
import {
  ChefHat, CheckCircle2, Clock, Flame, PackageCheck,
  Bell, ArrowRight, RefreshCw, Volume2, VolumeX,
  Timer, Utensils, Bike, ShoppingBag, Car, Printer,
} from 'lucide-react'
import DatePicker from '../../components/DatePicker.jsx'
import { previewHtmlReport, wrapReportDoc, reportSummary, reportSec, reportTable } from '../../utils/reportDoc'
import { useLiveRefresh } from '../../hooks/useLiveRefresh.js'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

const COLUMNS = [
  { key: 'new', label: 'New Orders', icon: Bell, color: 'blue', next: 'preparing', nextLabel: 'Start Cooking', nextIcon: Flame },
  { key: 'preparing', label: 'Preparing', icon: Flame, color: 'amber', next: 'ready', nextLabel: 'Mark Ready', nextIcon: CheckCircle2 },
  { key: 'ready', label: 'Ready / Pickup', icon: CheckCircle2, color: 'green', next: 'completed', nextLabel: 'Complete', nextIcon: PackageCheck },
  { key: 'completed', label: 'Completed', icon: PackageCheck, color: 'slate', next: null, nextLabel: '', nextIcon: null },
]

const colorMap = {
  blue: { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500', btn: 'bg-blue-500 hover:bg-blue-600', count: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', btn: 'bg-amber-500 hover:bg-amber-600', count: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  green: { bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-200 dark:border-green-800', text: 'text-green-600 dark:text-green-400', dot: 'bg-green-500', btn: 'bg-green-500 hover:bg-green-600', count: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' },
  slate: { bg: 'bg-slate-50 dark:bg-slate-900/30', border: 'border-slate-200 dark:border-slate-700', text: 'text-slate-500 dark:text-slate-400', dot: 'bg-slate-400', btn: 'bg-slate-500 hover:bg-slate-600', count: 'bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300' },
}

const orderTypeIcon = (type) => {
  switch (type) {
    case 'Dine-in': return Utensils
    case 'Delivery': return Bike
    case 'Take-away': return ShoppingBag
    case 'Foodpanda':
    case 'Drive-thru': return Car
    default: return ShoppingBag
  }
}

function timeAgo(date) {
  if (!date) return ''
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  const remMins = mins % 60
  return `${hrs}h ${remMins}m ago`
}

function elapsedSeconds(date) {
  if (!date) return 0
  return Math.floor((Date.now() - new Date(date).getTime()) / 1000)
}

function fmtClock(date) {
  if (!date) return '—'
  try {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return '—'
  }
}

function durationLabel(start, end) {
  if (!start || !end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const totalSec = Math.floor(ms / 1000)
  const hrs = Math.floor(totalSec / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

function kotCompletedAt(kot) {
  if (!kot) return null
  if (kot.completedAt) return kot.completedAt
  if ((kot.status || '') === 'completed') return kot.statusUpdatedAt || null
  return null
}

export default function KDS() {
  const { state, businessDate } = useData()
  const { token, user } = useAuth()
  const [selectedDate, setSelectedDate] = useState(businessDate || format(new Date(), 'yyyy-MM-dd'))
  const [dateTouched, setDateTouched] = useState(false)
  const [kots, setKots] = useState([])
  const [loading, setLoading] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastNewCount, setLastNewCount] = useState(0)
  // Mobile: show one kanban column at a time
  const [mobileCol, setMobileCol] = useState('new')
  const audioRef = useRef(null)

  useEffect(() => {
    if (!dateTouched && businessDate) setSelectedDate(businessDate)
  }, [businessDate, dateTouched])

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token])

  const loadKots = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const params = new URLSearchParams()
      params.set('limit', '500')
      if (selectedDate) {
        params.set('from', selectedDate)
        params.set('to', selectedDate)
      }
      const res = await fetch(`${API}/api/kots?${params.toString()}`, { headers: authHeaders, cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data) ? data : [])
        // Keep only KOTs for the selected business date (API already filters; belt-and-suspenders)
        const filtered = selectedDate
          ? list.filter(k => String(k.date || '').slice(0, 10) === String(selectedDate))
          : list
        setKots(filtered)
        const newCount = filtered.filter(k => (k.status || 'new') === 'new').length
        if (newCount > lastNewCount && lastNewCount > 0 && soundOn) {
          playBell()
        }
        setLastNewCount(newCount)
      }
    } catch {}
    if (!silent) setLoading(false)
  }, [authHeaders, selectedDate, lastNewCount, soundOn])

  const playBell = useCallback(() => {
    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play().catch(() => {})
      }
    } catch {}
  }, [])

  useEffect(() => {
    loadKots()
  }, [loadKots])

  useLiveRefresh(() => loadKots(true), { intervalMs: autoRefresh ? 15000 : 0 })

  const updateStatus = async (id, status) => {
    try {
      const res = await fetch(`${API}/api/kots/${id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        const updated = await res.json().catch(() => null)
        setKots(prev => prev.map(k => {
          if (k.id !== id && k._id !== id) return k
          if (updated && typeof updated === 'object') {
            return {
              ...k,
              ...updated,
              id: updated.id || k.id || k._id,
              status: updated.status || status,
              statusUpdatedAt: updated.statusUpdatedAt || new Date().toISOString(),
              completedAt: updated.completedAt || (status === 'completed' ? new Date().toISOString() : null),
            }
          }
          return {
            ...k,
            status,
            statusUpdatedAt: new Date().toISOString(),
            completedAt: status === 'completed' ? new Date().toISOString() : null,
          }
        }))
      } else {
        toast.error('Failed to update order status')
      }
    } catch {
      toast.error('Network error updating status')
    }
  }

  const groupedByStatus = useMemo(() => {
    const groups = { new: [], preparing: [], ready: [], completed: [] }
    kots.forEach(k => {
      const s = k.status || 'new'
      if (groups[s]) groups[s].push(k)
    })
    Object.keys(groups).forEach(s => {
      groups[s].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    })
    return groups
  }, [kots])

  const menuById = useMemo(() => {
    const m = {}
    ;(state.menu || []).forEach(item => { m[item.id] = item })
    return m
  }, [state.menu])

  const staffById = useMemo(() => {
    const m = {}
    ;(state.staff || []).forEach(s => { m[s.id] = s })
    return m
  }, [state.staff])

  const getItemName = (it) => {
    if (it?.custom?.name) return it.custom.name
    const m = menuById[it?.itemId]
    return m?.name || it?.name || 'Unknown Item'
  }

  const getItemMods = (it) => {
    const mods = []
    if (it?.mods?.size) mods.push(`Size: ${it.mods.size}`)
    if (Array.isArray(it?.mods?.flavours) && it.mods.flavours.length) {
      const names = it.mods.flavours.map(fid => menuById[fid]?.name).filter(Boolean)
      if (names.length) mods.push(`Flavours: ${names.join(', ')}`)
    }
    return mods
  }

  const waiterName = (id) => staffById[id]?.name || '-'

  const openPrintPreview = async () => {
    try {
      const statusLabel = (s) => {
        const col = COLUMNS.find(c => c.key === s)
        return col?.label || s || 'New'
      }
      const sorted = [...kots].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
      const completed = sorted.filter(k => (k.status || '') === 'completed')
      const avgMs = completed.length
        ? completed.reduce((acc, k) => {
            const end = kotCompletedAt(k)
            if (!k.createdAt || !end) return acc
            return acc + Math.max(0, new Date(end) - new Date(k.createdAt))
          }, 0) / completed.length
        : 0
      const avgDur = avgMs
        ? durationLabel(new Date(0), new Date(avgMs))
        : '—'

      const body =
        reportSummary([
          { label: 'Total KOTs', amount: String(sorted.length) },
          { label: 'New', amount: String(groupedByStatus.new?.length || 0) },
          { label: 'Preparing', amount: String(groupedByStatus.preparing?.length || 0) },
          { label: 'Ready', amount: String(groupedByStatus.ready?.length || 0) },
          { label: 'Completed', amount: String(groupedByStatus.completed?.length || 0) },
          { label: 'Avg cook time (completed)', amount: avgDur },
        ]) +
        reportSec(`Kitchen Orders (${sorted.length})`) +
        reportTable({
          headers: [
            'Token',
            'Type',
            'Table',
            'Status',
            'KOT Time',
            'Completed',
            'Duration',
            { t: 'Items', align: 'r' },
            'Waiter',
          ],
          numbered: true,
          rows: sorted.map(k => {
            const doneAt = kotCompletedAt(k)
            const endForDur = doneAt || ((k.status || '') !== 'completed' ? new Date() : null)
            return [
              `#${k.tokenNo || '-'}`,
              k.orderType || 'Dine-in',
              k.tableNo ? `${k.tableNo}${k.floor ? ` (${k.floor})` : ''}` : '—',
              statusLabel(k.status || 'new'),
              fmtClock(k.createdAt),
              doneAt ? fmtClock(doneAt) : '—',
              durationLabel(k.createdAt, endForDur),
              { v: (k.items || []).length, align: 'r' },
              waiterName(k.waiterId),
            ]
          }),
          emptyText: 'No KOTs for this date',
        })

      const company = state?.settings?.companyName || 'Restaurant POS'
      const html = wrapReportDoc({
        settings: state?.settings || {},
        title: 'Kitchen Display Report',
        reportLabel: 'KDS Report',
        reportNo: `Rpt #: KDS-${selectedDate || 'today'}`,
        metaLeft: [
          ['Business Date:', selectedDate || 'Today', true],
          ['Generated:', new Date().toLocaleString()],
          ['Prepared by:', user?.username || user?.name || 'staff'],
        ],
        metaRight: [
          ['Total KOTs:', String(sorted.length), true],
          ['Completed:', String(completed.length), true],
          ['Status:', 'FINAL'],
        ],
        body,
        footNote: `Duration = Completed time − KOT time (live elapsed shown for open orders). ${company} · ${selectedDate || 'Today'}`,
      })
      await previewHtmlReport(html, `KDS-Report-${selectedDate || 'today'}.pdf`)
    } catch {
      toast.error('Print preview failed')
    }
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] flex flex-col bg-gray-100 dark:bg-gray-950 -mx-4 sm:mx-0">
      {/* Hidden audio element for bell sound */}
      <audio ref={audioRef} preload="auto">
        <source src="data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==" type="audio/wav" />
      </audio>

      {/* Header bar */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg shadow-orange-500/30 flex-shrink-0">
              <ChefHat size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold text-gray-800 dark:text-gray-100 truncate">Kitchen Display</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Orders for {selectedDate || 'Today'}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <div className="h-9 w-full min-w-[9rem] max-w-[12rem] sm:w-[11.5rem] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-visible">
              <DatePicker
                value={selectedDate}
                onChange={(v) => {
                  if (!v) return
                  setDateTouched(true)
                  setSelectedDate(v)
                }}
                className="h-full w-full gap-0"
                compact
                allowClear={false}
              />
            </div>
            {/* Stats badges - desktop */}
            <div className="hidden lg:flex items-center gap-2 mr-2">
              {COLUMNS.map(col => {
                const c = colorMap[col.color]
                const count = groupedByStatus[col.key]?.length || 0
                return (
                  <div key={col.key} className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${c.count} flex items-center gap-1.5`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                    {count}
                  </div>
                )
              })}
            </div>

            {/* Sound toggle */}
            <button
              onClick={() => setSoundOn(s => !s)}
              title={soundOn ? 'Sound on' : 'Sound off'}
              className={`w-10 h-10 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center transition-colors ${soundOn ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}
            >
              {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>

            {/* Auto refresh toggle */}
            <button
              onClick={() => setAutoRefresh(a => !a)}
              title={autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
              className={`w-10 h-10 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center transition-colors ${autoRefresh ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}
            >
              <RefreshCw size={18} className={autoRefresh ? 'animate-spin-slow' : ''} />
            </button>

            {/* Print A4 preview */}
            <button
              onClick={openPrintPreview}
              className="ui-btn ui-btn-print text-sm flex items-center gap-1.5 min-h-10"
              title="Print A4 report"
            >
              <Printer size={16} />
              <span className="hidden sm:inline">Print</span>
            </button>

            {/* Manual refresh */}
            <button
              onClick={() => loadKots()}
              className="px-3 py-2 min-h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 text-white text-sm font-medium hover:shadow-lg transition-all flex items-center gap-1.5"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Mobile column tabs */}
        <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5 lg:hidden -mx-1 px-1">
          {COLUMNS.map(col => {
            const c = colorMap[col.color]
            const count = groupedByStatus[col.key]?.length || 0
            const active = mobileCol === col.key
            return (
              <button
                key={col.key}
                type="button"
                onClick={() => setMobileCol(col.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition ${
                  active ? `${c.btn} text-white shadow` : `${c.count}`
                }`}
              >
                {col.label.split(' ')[0]}
                <span className={`rounded-md px-1.5 py-0.5 text-[11px] ${active ? 'bg-white/25' : 'bg-black/5 dark:bg-white/10'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto p-3 sm:p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">

          {COLUMNS.map(col => {
            const c = colorMap[col.color]
            const items = groupedByStatus[col.key] || []
            const ColIcon = col.icon
            const hideOnMobile = mobileCol !== col.key

            return (
              <div key={col.key} className={`rounded-2xl border-2 ${c.border} ${c.bg} flex flex-col min-h-[18rem] xl:max-h-[calc(100dvh-12rem)] ${hideOnMobile ? 'hidden lg:flex' : 'flex'}`}>
                {/* Column header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/60 dark:border-gray-700/60">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg ${c.btn} flex items-center justify-center shadow-sm`}>
                      <ColIcon size={16} className="text-white" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">{col.label}</h2>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">{items.length} {items.length === 1 ? 'order' : 'orders'}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c.count}`}>{items.length}</span>
                </div>

                {/* Cards container */}
                <div className="flex-1 overflow-y-auto xl:overflow-y-auto p-3 space-y-3">
                  {items.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-300 dark:text-gray-600">
                      <ColIcon size={32} className="mb-2 opacity-40" />
                      <p className="text-xs font-medium">No orders</p>
                    </div>
                  )}

                  {items.map(kot => {
                    const OrderIcon = orderTypeIcon(kot.orderType)
                    const elapsed = elapsedSeconds(kot.createdAt)
                    const isUrgent = col.key === 'new' && elapsed > 300
                    const isVeryUrgent = col.key === 'new' && elapsed > 600
                    const doneAt = kotCompletedAt(kot)
                    const durationEnd = doneAt || (col.key !== 'completed' ? new Date() : null)
                    const duration = durationLabel(kot.createdAt, durationEnd)

                    return (
                      <div
                        key={kot.id || kot._id}
                        className={`rounded-xl bg-white dark:bg-gray-800 border-2 shadow-sm hover:shadow-md transition-all overflow-hidden ${
                          isVeryUrgent ? 'border-red-400 dark:border-red-600 animate-pulse-slow' :
                          isUrgent ? 'border-orange-300 dark:border-orange-600' :
                          'border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        {/* Card header */}
                        <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-gray-700">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${c.btn}`}>
                              <OrderIcon size={14} className="text-white" />
                            </div>
                            <div>
                              <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                                #{kot.tokenNo || '-'}
                              </span>
                              <span className="ml-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                {kot.orderType || 'Dine-in'}
                              </span>
                              {kot.tableNo && (
                                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                                  · Table {kot.tableNo}{kot.floor ? ` (${kot.floor})` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            isVeryUrgent ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                            isUrgent ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' :
                            'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                          }`}>
                            <Timer size={10} />
                            {timeAgo(kot.createdAt)}
                          </div>
                        </div>

                        {/* Timing strip: KOT / Completed / Duration */}
                        <div className="px-3 py-2 grid grid-cols-3 gap-1.5 border-b border-gray-100 dark:border-gray-700 bg-slate-50/80 dark:bg-slate-900/40">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold text-slate-400">
                              <Clock size={9} /> KOT
                            </div>
                            <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate tabular-nums">
                              {fmtClock(kot.createdAt)}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold text-slate-400">
                              <CheckCircle2 size={9} /> Done
                            </div>
                            <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate tabular-nums">
                              {doneAt ? fmtClock(doneAt) : '—'}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold text-slate-400">
                              <Timer size={9} /> Time
                            </div>
                            <div className={`text-[11px] font-bold truncate tabular-nums ${
                              doneAt ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                            }`}>
                              {duration}
                            </div>
                          </div>
                        </div>

                        {/* Items list */}
                        <div className="px-3 py-2 space-y-1.5">
                          {(kot.items || []).map((it, idx) => {
                            const name = getItemName(it)
                            const mods = getItemMods(it)
                            return (
                              <div key={idx} className="flex items-start gap-2">
                                <span className={`flex-shrink-0 w-5 h-5 rounded ${c.btn} text-white text-[10px] font-bold flex items-center justify-center mt-0.5`}>
                                  {it.qty || 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200 leading-tight">{name}</p>
                                  {mods.length > 0 && (
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                                      {mods.join(' · ')}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {/* Customer / delivery details */}
                        {(kot.customerName || kot.customerPhone || kot.customerAddress) && (
                          <div className="px-3 pb-2">
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-2 py-1.5 space-y-0.5">
                              {kot.customerName && (
                                <p className="text-[10px] text-blue-700 dark:text-blue-300 font-medium">
                                  <span className="font-bold">Customer:</span> {kot.customerName}
                                </p>
                              )}
                              {kot.customerPhone && (
                                <p className="text-[10px] text-blue-700 dark:text-blue-300 font-medium">
                                  <span className="font-bold">Phone:</span> {kot.customerPhone}
                                </p>
                              )}
                              {kot.customerAddress && (
                                <p className="text-[10px] text-blue-700 dark:text-blue-300 font-medium">
                                  <span className="font-bold">Address:</span> {kot.customerAddress}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Remarks */}
                        {kot.remarks && (
                          <div className="px-3 pb-2">
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-2 py-1.5">
                              <p className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">
                                <span className="font-bold">Note:</span> {kot.remarks}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Footer: waiter + action button */}
                        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            {(kot.items || []).length} item{(kot.items || []).length === 1 ? '' : 's'} · {waiterName(kot.waiterId)}
                          </span>
                          {col.next && (
                            <button
                              onClick={() => updateStatus(kot.id || kot._id, col.next)}
                              className={`flex items-center gap-1.5 px-3 py-2.5 sm:px-2.5 sm:py-1.5 rounded-lg ${c.btn} text-white text-sm sm:text-xs font-bold transition-all active:scale-95 touch-manipulation`}
                            >
                              {col.nextIcon && <col.nextIcon size={14} />}
                              {col.nextLabel}
                              <ArrowRight size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Custom animations */}
      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </div>
  )
}
