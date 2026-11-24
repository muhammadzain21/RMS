import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { Inbox, RefreshCw, ShoppingCart, Clock, CheckCircle2, List } from 'lucide-react'
import PageHero from '@shared/components/UiPageHero.jsx'
import DataTable from '@shared/components/DataTable.jsx'
import Pagination from '@shared/components/Pagination.jsx'
import DatePicker from '@shared/components/DatePicker.jsx'
import { useAuth } from '@/state/AuthContext.jsx'
import { useBranch } from '@/state/BranchContext.jsx'
import { useBusinessDateFilter } from '@/hooks/useBusinessDateFilter.js'
import { ccStatusLabel, ccStatusStyle } from '@features/sales/utils/callCenterStatus.js'
import { useLiveRefresh, pokeLiveRefresh } from '@/hooks/useLiveRefresh.js'

function api() {
  return (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
}

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function orderDate(o) {
  const raw = o?.createdAt || o?.date || ''
  try {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return format(d, 'yyyy-MM-dd h:mm a')
  } catch {}
  return String(raw).slice(0, 16) || '—'
}

function orderDay(o) {
  const raw = o?.createdAt || o?.date || ''
  try {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return format(d, 'yyyy-MM-dd')
  } catch {}
  return String(raw).slice(0, 10)
}

function orderTs(o) {
  const raw = o?.createdAt || o?.date || ''
  const t = new Date(raw).getTime()
  return Number.isNaN(t) ? 0 : t
}

const REMAINING_STATUSES = new Set(['pending', 'accepted'])

/**
 * CC Inbox: All / Remaining / Complete — newest first, business-date defaults.
 */
export default function CallCenterInbox() {
  const { token } = useAuth()
  const { branches, activeBranchId, setActiveBranchId } = useBranch()
  const navigate = useNavigate()
  const { from, setFrom, to, setTo } = useBusinessDateFilter()
  const [remaining, setRemaining] = useState([])
  const [complete, setComplete] = useState([])
  const [tab, setTab] = useState('all') // all | remaining | complete
  const [busyId, setBusyId] = useState('')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(100)

  const branchName = (oOrId) => {
    if (oOrId && typeof oOrId === 'object') {
      const snap = String(oOrId.branchName || '').trim()
      if (snap) return snap
      const id = oOrId.branchId
      return branches.find(b => String(b._id) === String(id))?.name || id || '—'
    }
    return branches.find(b => String(b._id) === String(oOrId))?.name || oOrId || '—'
  }

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    try {
      const [remRes, doneRes] = await Promise.all([
        fetch(`${api()}/api/call-center-orders/inbox?tab=remaining`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
        fetch(`${api()}/api/call-center-orders/inbox?tab=complete`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
      ])
      const rem = remRes.ok ? await remRes.json() : []
      const done = doneRes.ok ? await doneRes.json() : []
      setRemaining(Array.isArray(rem) ? rem : [])
      setComplete(Array.isArray(done) ? done : [])
    } catch {
      if (!quiet) toast.error('Could not load inbox')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])
  useLiveRefresh(() => load({ quiet: true }), { intervalMs: 15000 })
  useEffect(() => { setPage(1) }, [tab, from, to, search])

  const counts = useMemo(() => ({
    remaining: remaining.length,
    complete: complete.length,
    all: remaining.length + complete.length,
  }), [remaining, complete])

  const sourceList = useMemo(() => {
    if (tab === 'remaining') return remaining
    if (tab === 'complete') return complete
    const byId = new Map()
    for (const o of [...remaining, ...complete]) {
      const id = String(o?._id || o?.id || '')
      if (id) byId.set(id, o)
      else byId.set(`tmp-${byId.size}`, o)
    }
    return [...byId.values()]
  }, [tab, remaining, complete])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = (sourceList || []).filter(o => {
      const day = orderDay(o)
      if (from && day && day < from) return false
      if (to && day && day > to) return false
      if (!q) return true
      const hay = [
        o.customer?.name, o.customer?.phone, o.customer?.address,
        o.orderType, o.status, ccStatusLabel(o.status), o.remarks, branchName(o),
        ...(o.items || []).map(i => i.name),
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
    // Most recent at the top
    rows.sort((a, b) => orderTs(b) - orderTs(a))
    return rows
  }, [sourceList, from, to, search, branches])

  const total = filtered.length
  const totalPages = Math.ceil(total / limit) || 1
  const pageSafe = Math.min(page, totalPages)
  const rows = filtered.slice((pageSafe - 1) * limit, pageSafe * limit)

  const acceptToCart = async (o) => {
    const id = o._id
    const orderBranchId = String(o.branchId || '')
    setBusyId(id)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      if (orderBranchId) headers['X-Branch-Id'] = orderBranchId
      const res = await fetch(`${api()}/api/call-center-orders/${id}/accept`, {
        method: 'POST',
        headers,
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Accept failed')
      if (!j.cart || !Array.isArray(j.cart.items) || !j.cart.items.length) {
        throw new Error('Order has no items to load')
      }
      try {
        sessionStorage.setItem('cc_cart_payload', JSON.stringify(j.cart))
        if (j.cart.callCenterOrderId) sessionStorage.setItem('cc_order_id', String(j.cart.callCenterOrderId))
      } catch {}
      const needBranchSwitch = orderBranchId && String(activeBranchId || '') !== orderBranchId
      if (needBranchSwitch) {
        setActiveBranchId(orderBranchId)
        await new Promise((resolve) => {
          let settled = false
          const finish = () => {
            if (settled) return
            settled = true
            window.removeEventListener('data_rehydrated', onReh)
            clearTimeout(t)
            resolve()
          }
          const onReh = (e) => {
            const bid = String(e?.detail?.branchId || '')
            if (!orderBranchId || !bid || bid === orderBranchId) finish()
          }
          window.addEventListener('data_rehydrated', onReh)
          const t = setTimeout(finish, 2200)
        })
      }
      pokeLiveRefresh({ source: 'call-center-accept', branchId: orderBranchId })
      navigate('/sales/new?from=callcenter')
    } catch (e) {
      toast.error(e.message || 'Failed')
    } finally {
      setBusyId('')
    }
  }

  const canAccept = (r) => REMAINING_STATUSES.has(String(r.status || ''))

  const columns = [
    {
      label: 'SR No',
      key: 'srNo',
      render: (_, idx) => (
        <span className="font-medium text-[var(--color-text-body)]">
          {(pageSafe - 1) * limit + idx + 1}
        </span>
      ),
    },
    {
      label: 'Date',
      key: 'date',
      render: r => <span className="whitespace-nowrap text-sm font-medium">{orderDate(r)}</span>,
    },
    {
      label: 'Branch',
      key: 'branch',
      render: r => (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Branch</div>
          <div className="font-bold text-indigo-700 dark:text-indigo-300">
            {branchName(r)}
          </div>
        </div>
      ),
    },
    {
      label: 'Customer',
      key: 'customer',
      render: r => (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Customer</div>
          <div className="font-bold text-gray-900 dark:text-gray-100">{r.customer?.name || '—'}</div>
          <div className="text-xs text-slate-500">{r.customer?.phone || '—'}</div>
          {r.isAddOn ? (
            <span className="mt-1 inline-flex rounded-md border border-violet-400 bg-violet-100 px-2 py-0.5 text-[10px] font-extrabold text-violet-900 dark:border-violet-500 dark:bg-violet-900/50 dark:text-violet-100">
              ADD-ON · same customer
            </span>
          ) : null}
        </div>
      ),
    },
    {
      label: 'Type',
      key: 'orderType',
      render: r => r.orderType || '—',
    },
    {
      label: 'Items',
      key: 'items',
      render: r => (
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {(r.items || []).map(i => `${i.name}×${i.qty}`).join(', ') || '—'}
        </span>
      ),
    },
    {
      label: 'Address / Remarks',
      key: 'address',
      render: r => (
        <div className="max-w-[14rem]">
          <div className="text-xs truncate" title={r.customer?.address || ''}>{r.customer?.address || '—'}</div>
          {r.remarks ? <div className="text-[11px] text-amber-600 truncate" title={r.remarks}>{r.remarks}</div> : null}
        </div>
      ),
    },
    {
      label: 'Total',
      key: 'total',
      render: r => <span className="font-bold whitespace-nowrap">{money(r.total)}</span>,
    },
    {
      label: 'Status',
      key: 'status',
      render: r => (
        <div className="flex flex-col items-start gap-1">
          <span className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-bold ${ccStatusStyle(r.status)}`}>
            {ccStatusLabel(r.status)}
          </span>
          {r.isAddOn ? (
            <span className="inline-flex rounded-md border border-violet-400 bg-violet-100 px-2 py-0.5 text-[10px] font-extrabold text-violet-900 dark:border-violet-500 dark:bg-violet-900/50 dark:text-violet-100">
              Same customer
            </span>
          ) : null}
        </div>
      ),
    },
    {
      label: 'Action',
      key: 'action',
      render: r => (
        canAccept(r) ? (
          <button
            type="button"
            disabled={!!busyId}
            onClick={() => acceptToCart(r)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60 ${
              r.isAddOn ? 'bg-violet-600 hover:bg-violet-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            <ShoppingCart size={14} />
            {busyId === r._id ? 'Loading…' : (r.isAddOn ? 'ADD-ON → cart & KOT' : 'Add to cart & KOT')}
          </button>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )
      ),
    },
  ]

  const tabBtn = (id, label, Icon, count, activeCls) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 sm:px-4 sm:py-2.5 text-sm font-semibold transition ${
        tab === id
          ? `${activeCls} text-white shadow-sm`
          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-gray-800 dark:text-slate-200'
      }`}
    >
      <Icon size={16} />
      {label}
      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
        tab === id ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
      }`}>
        {count}
      </span>
    </button>
  )

  return (
    <div className="space-y-4">
      <PageHero
        title="Call-center inbox"
        subtitle="All branches — completed and remaining in one table (newest first)."
        icon={Inbox}
        actions={
          <button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold">
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {tabBtn('all', 'All', List, counts.all, 'bg-indigo-600')}
        {tabBtn('remaining', 'Remaining', Clock, counts.remaining, 'bg-amber-500')}
        {tabBtn('complete', 'Complete', CheckCircle2, counts.complete, 'bg-emerald-600')}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
          <div className="grid grid-cols-2 gap-3 sm:contents">
            <div className="min-w-0 sm:flex-shrink-0">
              <DatePicker label="From" value={from} onChange={v => setFrom(v || '')} />
            </div>
            <div className="min-w-0 sm:flex-shrink-0">
              <DatePicker label="To" value={to} onChange={v => setTo(v || '')} />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <label className="text-xs font-bold tracking-wide text-[var(--color-text-body)]">Search</label>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Customer, phone, branch, item…"
              className="mt-1 w-full rounded-lg border-2 border-indigo-200 bg-white px-3 py-2.5 text-gray-900 transition-all focus:ring-2 focus:ring-indigo-500 dark:border-indigo-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <button type="button" onClick={load} className="ui-btn ui-btn-secondary w-full sm:w-auto whitespace-nowrap">Refresh</button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <DataTable
          columns={columns}
          data={rows}
          searchable={false}
          exportable={false}
          pageSize={9999}
          showLimit={false}
          hidePagination
          maxHeight={520}
        />
      </div>

      <Pagination
        page={pageSafe}
        pages={totalPages}
        total={total}
        limit={limit}
        onLimitChange={n => { setLimit(n); setPage(1) }}
        onPageChange={setPage}
        loading={loading}
      />
    </div>
  )
}
