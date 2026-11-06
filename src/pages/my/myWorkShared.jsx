import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { UserCheck, RefreshCw } from 'lucide-react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import PageHero from '../../components/ui/PageHero.jsx'
import DatePicker from '../../components/DatePicker.jsx'

export const pkr = (n) => `PKR ${Number(n || 0).toLocaleString()}`
export const monthName = (m) => {
  if (!m) return '—'
  try {
    return new Date(`${String(m).slice(0, 7)}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  } catch {
    return String(m)
  }
}

function monthBounds(month) {
  const m = String(month || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(m)) {
    const now = new Date()
    const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return monthBounds(fallback)
  }
  const [y, mo] = m.split('-').map(Number)
  const last = new Date(y, mo, 0).getDate()
  return {
    from: `${m}-01`,
    to: `${m}-${String(last).padStart(2, '0')}`,
  }
}

export const CHIP = {
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  vio: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
}

export const Chip = ({ color = 'slate', children }) => (
  <span className={`inline-block text-[10px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full ${CHIP[color]}`}>{children}</span>
)

export function StatCard({ title, value, icon: Icon, iconColor = 'bg-blue-500' }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">{title}</span>
          <div className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] truncate">{value}</div>
        </div>
        {Icon ? (
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${iconColor} text-white shadow-md`}>
            <Icon className="h-6 w-6" />
          </div>
        ) : null}
      </div>
      <div className="absolute -bottom-6 -right-6 h-16 w-16 rounded-full bg-slate-50 opacity-50 dark:bg-slate-800" />
    </div>
  )
}

export function Panel({ title, children, actions }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
      {(title || actions) && (
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3">
          {title ? <div className="font-extrabold text-[var(--color-text-primary)]">{title}</div> : <div />}
          {actions}
        </div>
      )}
      <div className="p-0">{children}</div>
    </div>
  )
}

export const Empty = ({ text }) => (
  <div className="text-center text-sm font-semibold text-[var(--color-text-muted)] py-14">{text}</div>
)

const MyWorkCtx = createContext(null)
export const useMyWork = () => useContext(MyWorkCtx)

export function inMonth(rows, month) {
  return (rows || []).filter(r => String(r.date || r.period || '').startsWith(String(month || '')))
}

export function inRange(rows, from, to, field = 'date') {
  const a = from ? String(from).slice(0, 10) : ''
  const b = to ? String(to).slice(0, 10) : ''
  return (rows || []).filter((r) => {
    const d = String(r?.[field] || r?.date || r?.period || '').slice(0, 10)
    if (!d) return false
    if (a && d < a) return false
    if (b && d > b) return false
    return true
  })
}

export default function MyWorkLayout() {
  const { user, token } = useAuth()
  const { state: appState } = useData()
  const API = (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'

  const initialMonth = new Date().toISOString().slice(0, 7)
  const initialBounds = monthBounds(initialMonth)
  const [month, setMonth] = useState(initialMonth)
  const [from, setFrom] = useState(initialBounds.from)
  const [to, setTo] = useState(initialBounds.to)
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')
  const [refreshing, setRefreshing] = useState(false)

  const onMonthChange = useCallback((v) => {
    if (!v) return
    const next = String(v).slice(0, 7)
    setMonth(next)
    const b = monthBounds(next)
    setFrom(b.from)
    setTo(b.to)
  }, [])

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const params = new URLSearchParams()
      if (from && to) {
        params.set('from', from)
        params.set('to', to)
      } else if (month) {
        params.set('month', month)
      }
      const res = await fetch(`${API}/api/my/me?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 403) { setState('unlinked'); setData(null); return }
      if (!res.ok) { setState('error'); return }
      setData(await res.json())
      setState('ready')
    } catch {
      setState('error')
    } finally {
      setRefreshing(false)
    }
  }, [API, token, month, from, to])

  useEffect(() => {
    setState('loading')
    load()
  }, [load])

  const value = useMemo(() => ({
    data,
    state,
    month,
    setMonth: onMonthChange,
    from,
    setFrom,
    to,
    setTo,
    user,
    appState,
    API,
    token,
    reload: load,
  }), [data, state, month, onMonthChange, from, to, user, appState, API, token, load])

  if (state === 'unlinked') {
    return (
      <div className="space-y-6 pb-10">
        <PageHero icon={UserCheck} title="My Work" subtitle="Staff self-service portal" />
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-8 text-center">
          <div className="text-lg font-extrabold text-amber-900 dark:text-amber-200 mb-2">No staff record linked</div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Ask your administrator to link this login to a staff member and enable My Work access.
          </p>
        </div>
      </div>
    )
  }

  return (
    <MyWorkCtx.Provider value={value}>
      <div className="space-y-6 pb-10">
        <PageHero
          icon={UserCheck}
          title={data?.staff?.name || user?.username || 'My Work'}
          subtitle={`${data?.staff?.position || 'Staff portal'} · ${from || '…'} → ${to || '…'}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-9 w-[9.75rem] rounded-xl bg-white shadow-lg">
                <DatePicker
                  mode="month"
                  value={month}
                  onChange={onMonthChange}
                  allowClear={false}
                  compact
                  className="h-full w-full"
                />
              </div>
              <div className="h-9 w-[10.5rem] rounded-xl bg-white shadow-lg">
                <DatePicker
                  value={from}
                  onChange={(v) => { if (v) setFrom(v) }}
                  allowClear={false}
                  compact
                  className="h-full w-full"
                  placeholder="From"
                />
              </div>
              <div className="h-9 w-[10.5rem] rounded-xl bg-white shadow-lg">
                <DatePicker
                  value={to}
                  onChange={(v) => { if (v) setTo(v) }}
                  allowClear={false}
                  compact
                  className="h-full w-full"
                  placeholder="To"
                />
              </div>
              <button
                type="button"
                onClick={load}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-blue-700 shadow-lg hover:bg-blue-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
          }
        />

        {state === 'loading' ? (
          <div className="py-20 text-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
            <p className="mt-2 text-sm font-semibold text-[var(--color-text-muted)]">Loading your records…</p>
          </div>
        ) : state === 'error' ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <Empty text="Couldn't load your records — check the server connection and retry." />
          </div>
        ) : (
          <Outlet />
        )}
      </div>
    </MyWorkCtx.Provider>
  )
}
