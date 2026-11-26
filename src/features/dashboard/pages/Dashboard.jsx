import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import {
  RefreshCw,
  ShoppingCart,
  CheckCircle2,
  Clock,
  Banknote,
  Wallet,
  Tag,
  UserX,
  Printer,
  FileDown,
  FileSpreadsheet,
  BarChart3,
  Users,
  UserPlus,
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { useAuth } from '@/state/AuthContext.jsx'
import { useData } from '@/state/DataContext.jsx'
import { useBusinessDateValue } from '@/hooks/useBusinessDateFilter.js'
import DatePicker from '@shared/components/DatePicker.jsx'
import PageHero from '@shared/components/UiPageHero.jsx'
import { createLineTotal } from '@features/sales/utils/cartUtils.js'
import { formatTime12 } from '@shared/utils/dateUtils.js'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '@shared/utils/reportDoc.js'

const PIE_COLORS = ['#3b82f6', '#6366f1', '#0ea5e9', '#10b981', '#f59e0b']

const ORDER_STATUS_CHIP = {
  ordered: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  preparing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  ready: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  held: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
}
const ORDER_STATUS_LABEL = {
  ordered: 'Ordered',
  new: 'KOT Sent',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Kitchen Done',
  held: 'Held',
}

function num(v) {
  return Number(v || 0)
}

function fmt(n) {
  return num(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function billDiscountOf(s) {
  const itemsDisc = num(s.itemsDiscount)
  const billDisc = num(s.billDiscount)
  const combined = num(s.discount)
  return billDisc || (combined ? Math.max(0, combined - itemsDisc) : 0) || combined
}

function totalDiscountOf(s) {
  return num(s.itemsDiscount) + billDiscountOf(s)
}

function saleGrossBeforeTaxService(s) {
  return num(s.total) - num(s.serviceAmt) - num(s.taxAmt) + totalDiscountOf(s)
}

function customerKey(s) {
  const c = s.customer
  if (!c || typeof c !== 'object') return null
  if (c.id) return `id:${c.id}`
  if (c.phone) return `ph:${String(c.phone).trim()}`
  if (c.name) return `nm:${String(c.name).trim().toLowerCase()}`
  return null
}

function tsToDateStr(ts) {
  const n = Number(ts)
  if (!n) return ''
  try {
    return format(new Date(n), 'yyyy-MM-dd')
  } catch {
    return ''
  }
}

function saleCreatedMs(s) {
  const c = s.createdAt
  if (!c) return null
  if (typeof c === 'number') return c
  const t = new Date(c).getTime()
  return Number.isFinite(t) ? t : null
}

function heldTotal(h, lineTotal) {
  if (num(h.totalAmount) > 0) return num(h.totalAmount)
  const items = Array.isArray(h.items) ? h.items : []
  return items.reduce((a, it) => a + lineTotal(null, it), 0)
}

function voidLineTotal(v, lineTotal, menu) {
  const items = Array.isArray(v.items) ? v.items : []
  return items.reduce((a, it) => {
    const m = menu.find(x => x.id === it.itemId)
    return a + lineTotal(m, it)
  }, 0)
}

function durationBucket(minutes) {
  if (minutes == null || minutes < 0) return '60 + mins'
  if (minutes <= 15) return '15 mins'
  if (minutes <= 30) return '30 mins'
  if (minutes <= 45) return '45 mins'
  if (minutes <= 60) return '60 mins'
  return '60 + mins'
}

function isPaidMethod(pm) {
  const m = String(pm || 'cash').toLowerCase()
  return m === 'cash' || m === 'card' || m === 'bank' || m === 'split'
}

function saleTenderAmt(sale, methods) {
  const want = new Set((Array.isArray(methods) ? methods : [methods]).map(m => String(m).toLowerCase()))
  const pays = Array.isArray(sale?.payments) ? sale.payments.filter(p => Number(p?.amount || 0) > 0) : []
  if (pays.length) {
    return pays
      .filter(p => want.has(String(p.method || '').toLowerCase()))
      .reduce((a, p) => a + Number(p.amount || 0), 0)
  }
  const pm = String(sale?.paymentMethod || 'cash').toLowerCase()
  return want.has(pm) ? num(sale.total ?? sale.totalAmount) : 0
}

function paymentBucket(s) {
  const pm = String(s.paymentMethod || 'cash').toLowerCase()
  const ch = String(s.bankChannel || '').toLowerCase()
  if (pm === 'split' || (Array.isArray(s.payments) && s.payments.length > 1)) return 'split'
  if (pm === 'foodpanda' || pm === 'food_panda' || pm === 'food panda') return 'foodpanda'
  if (pm === 'cash') return 'cash'
  if (pm === 'card') return 'card'
  if (pm === 'bank') {
    if (ch === 'foodpanda' || ch === 'food_panda') return 'foodpanda'
    return 'bank'
  }
  return null
}

function StatCard({ title, value, icon: Icon, iconColor = 'bg-blue-500' }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-body)]">{title}</span>
          <div className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] truncate">{value}</div>
        </div>
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${iconColor} text-white shadow-md`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
      <div className="absolute -bottom-6 -right-6 h-16 w-16 rounded-full bg-slate-50 opacity-50 dark:bg-slate-800" />
    </div>
  )
}

function MiniStat({ title, value, icon: Icon, iconColor = 'bg-blue-500' }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md flex-1 min-w-[8.5rem]">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-body)]">{title}</span>
          <div className="text-lg font-bold tracking-tight text-[var(--color-text-primary)]">{fmt(value)}</div>
        </div>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${iconColor} text-white shadow-sm`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}

function Panel({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm ${className}`}>
      <div className="mb-4 flex items-center gap-2 text-[var(--color-text-primary)] font-semibold">
        {Icon ? <Icon className="h-4 w-4 text-blue-500" /> : null}
        {title}
      </div>
      {children}
    </div>
  )
}

export default function Dashboard() {
  const { state, businessDate, dispatch } = useData()
  const { token } = useAuth()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const companyName = state?.settings?.companyName || 'Restaurant POS'

  const [selectedDate, setSelectedDate] = useBusinessDateValue()
  const [refreshing, setRefreshing] = useState(false)
  const [voidRows, setVoidRows] = useState([])
  const [attendanceRows, setAttendanceRows] = useState([])
  const [pieIndex, setPieIndex] = useState(0)
  // Sales fetched for the selected date (source of truth for dashboard filter)
  const [daySalesOverride, setDaySalesOverride] = useState(null)
  // Expenses for selected business date (approved + pending)
  const [dayExpenses, setDayExpenses] = useState(null)

  const lineTotal = useMemo(() => createLineTotal(state.settings?.modifiers || {}), [state.settings?.modifiers])

  const daySales = useMemo(() => {
    if (Array.isArray(daySalesOverride)) return daySalesOverride
    return (state.sales || []).filter(s => String(s.date) === String(selectedDate))
  }, [daySalesOverride, state.sales, selectedDate])

  const saleTokenSet = useMemo(() => {
    const set = new Set()
    daySales.forEach(s => {
      if (s.tokenNo) set.add(String(s.tokenNo))
    })
    return set
  }, [daySales])

  const pendingRecalls = useMemo(() => {
    const recalls = Array.isArray(state.recalls) ? state.recalls : []
    return recalls.filter(r => {
      const d = r.date || tsToDateStr(r.createdAt)
      if (d !== selectedDate) return false
      const tok = String(r.tokenNo || '')
      if (tok && saleTokenSet.has(tok)) return false
      return true
    })
  }, [state.recalls, selectedDate, saleTokenSet])

  const pendingHelds = useMemo(() => {
    const helds = Array.isArray(state.helds) ? state.helds : []
    return helds.filter(h => tsToDateStr(h.createdAt) === selectedDate)
  }, [state.helds, selectedDate])

  const completedCount = daySales.length
  const pendingCount = pendingRecalls.length + pendingHelds.length
  const totalOrders = completedCount + pendingCount

  // Open recalls + helds currently in progress (unpaid / not settled)
  const currentOrders = useMemo(() => {
    const recalls = (Array.isArray(state.recalls) ? state.recalls : [])
      .filter(r => {
        const tok = String(r.tokenNo || '')
        if (tok && saleTokenSet.has(tok)) return false
        return true
      })
      .map(r => ({
        kind: 'recall',
        id: String(r.id || r._id || ''),
        createdAt: Number(r.createdAt || 0),
        date: r.date || tsToDateStr(r.createdAt),
        tokenNo: r.tokenNo || '',
        orderType: r.orderType || '',
        tableNo: r.tableNo || '',
        waiterName: r.waiterName || '',
        customer: r.customer?.name || '',
        status: r.orderStatus || 'ordered',
        total: num(r.totalAmount),
      }))
    const helds = (Array.isArray(state.helds) ? state.helds : []).map(h => ({
      kind: 'held',
      id: String(h.id || h._id || ''),
      createdAt: Number(h.createdAt || 0),
      date: tsToDateStr(h.createdAt),
      tokenNo: h.tokenNo || '',
      orderType: h.orderType || '',
      tableNo: h.tableNo || '',
      waiterName: h.waiterName || '',
      customer: h.customer?.name || '',
      status: 'held',
      total: heldTotal(h, lineTotal),
    }))
    return [...recalls, ...helds].sort((a, b) => b.createdAt - a.createdAt)
  }, [state.recalls, state.helds, saleTokenSet, lineTotal])

  const customerStats = useMemo(() => {
    const beforeKeys = new Set()
    ;(state.sales || []).forEach(s => {
      if (s.date >= selectedDate) return
      const k = customerKey(s)
      if (k) beforeKeys.add(k)
    })
    const newKeys = new Set()
    const oldKeys = new Set()
    daySales.forEach(s => {
      const k = customerKey(s)
      if (!k) return
      if (beforeKeys.has(k)) oldKeys.add(k)
      else newKeys.add(k)
    })
    const identified = newKeys.size + oldKeys.size
    const newPct = identified ? (newKeys.size / identified) * 100 : 0
    const oldPct = identified ? (oldKeys.size / identified) * 100 : 0
    return { newCount: newKeys.size, oldCount: oldKeys.size, newPct, oldPct }
  }, [state.sales, daySales, selectedDate])

  const salesSummary = useMemo(() => {
    const transactions = daySales.length
    let sale = 0
    let discount = 0
    let charges = 0
    let taxIn = 0
    let taxEx = 0
    let total = 0
    let paid = 0
    daySales.forEach(s => {
      sale += saleGrossBeforeTaxService(s)
      discount += totalDiscountOf(s)
      charges += num(s.serviceAmt)
      const tax = num(s.taxAmt)
      if (s.taxInclusive) taxIn += tax
      else taxEx += tax
      total += num(s.total)
      if (isPaidMethod(s.paymentMethod)) paid += num(s.total)
    })
    const dayExp = Array.isArray(dayExpenses)
      ? dayExpenses
      : (state.expenses || []).filter(e => String(e.date) === String(selectedDate))
    const expense = dayExp.reduce((a, e) => a + num(e.amount), 0)
    const billSize = transactions ? total / transactions : 0
    return { transactions, sale, discount, charges, taxIn, taxEx, total, paid, billSize, expense }
  }, [daySales, state.expenses, dayExpenses, selectedDate])

  const recallStartByToken = useMemo(() => {
    const map = new Map()
    ;(state.recalls || []).forEach(r => {
      const d = r.date || tsToDateStr(r.createdAt)
      if (d !== selectedDate) return
      const tok = String(r.tokenNo || '')
      if (!tok) return
      const t = Number(r.createdAt || 0)
      if (!map.has(tok) || t < map.get(tok)) map.set(tok, t)
    })
    return map
  }, [state.recalls, selectedDate])

  const timeBuckets = useMemo(() => {
    const labels = ['15 mins', '30 mins', '45 mins', '60 mins', '60 + mins']
    const counts = Object.fromEntries(labels.map(l => [l, 0]))
    daySales.forEach(s => {
      const tok = String(s.tokenNo || '')
      const start = tok ? recallStartByToken.get(tok) : null
      const end = saleCreatedMs(s)
      let minutes = null
      if (start && end) minutes = Math.max(0, Math.floor((end - start) / 60000))
      const bucket = durationBucket(minutes)
      counts[bucket] = (counts[bucket] || 0) + 1
    })
    const rows = labels.map(label => ({ label, count: counts[label] || 0 }))
    const total = rows.reduce((a, r) => a + r.count, 0)
    const pieData = rows
      .filter(r => r.count > 0)
      .map(r => ({ name: r.label, value: r.count, pct: total ? Math.round((r.count / total) * 100) : 0 }))
    return { rows, total, pieData }
  }, [daySales, recallStartByToken])

  useEffect(() => {
    setPieIndex(0)
  }, [selectedDate, timeBuckets.pieData.length])

  const posStats = useMemo(() => {
    let sale = 0
    let settled = 0
    let discount = 0
    let gift = 0
    daySales.forEach(s => {
      sale += saleGrossBeforeTaxService(s)
      discount += totalDiscountOf(s)
      const pm = String(s.paymentMethod || '').toLowerCase()
      if (pm === 'complimentary') gift += num(s.total)
      if (isPaidMethod(pm)) settled += num(s.total)
    })
    const voidTotal = voidRows.reduce((a, v) => a + voidLineTotal(v, lineTotal, state.menu || []), 0)
    return { sale, settled, discount, gift, void: voidTotal }
  }, [daySales, voidRows, lineTotal, state.menu])

  const paymentRows = useMemo(() => {
    const buckets = { bank: 0, cash: 0, card: 0, foodpanda: 0 }
    daySales.forEach(s => {
      const pays = Array.isArray(s.payments) ? s.payments.filter(p => Number(p?.amount || 0) > 0) : []
      if (pays.length > 1 || String(s.paymentMethod || '').toLowerCase() === 'split') {
        buckets.cash += saleTenderAmt(s, 'cash')
        buckets.card += saleTenderAmt(s, 'card')
        buckets.bank += saleTenderAmt(s, ['bank', 'online'])
        buckets.foodpanda += saleTenderAmt(s, ['foodpanda', 'food_panda', 'food panda'])
        return
      }
      const b = paymentBucket(s)
      if (!b || b === 'split') return
      buckets[b] += num(s.total)
    })
    return [
      { type: 'Bank Account', amount: buckets.bank },
      { type: 'Cash', amount: buckets.cash },
      { type: 'Card', amount: buckets.card },
      { type: 'Food Panda', amount: buckets.foodpanda },
    ]
  }, [daySales])

  const billAnalysis = useMemo(() => {
    const bookings = (state.advanceBookings || []).filter(b => b.date === selectedDate)
    const bookedFromBookings = bookings
      .filter(b => String(b.status || '').toLowerCase() !== 'completed' && String(b.status || '').toLowerCase() !== 'cancelled')
      .reduce((a, b) => a + num(b.deposit), 0)
    const paidBookings = bookings
      .filter(b => String(b.status || '').toLowerCase() === 'completed')
      .reduce((a, b) => a + num(b.deposit), 0)
    const heldAmt = pendingHelds.reduce((a, h) => a + heldTotal(h, lineTotal), 0)
    const billBooked = bookedFromBookings + heldAmt
    const billPaid = paidBookings
    return { billBooked, billPaid, totalPayable: Math.max(0, billBooked - billPaid) }
  }, [state.advanceBookings, pendingHelds, selectedDate, lineTotal])

  const expenseAnalysis = useMemo(() => {
    const dayExp = Array.isArray(dayExpenses)
      ? dayExpenses
      : (state.expenses || []).filter(e => String(e.date) === String(selectedDate))
    const isApproved = (e) => String(e?.status || '').toLowerCase() === 'approved'
    const approvedRows = dayExp.filter(isApproved)
    const pendingRows = dayExp.filter(e => !isApproved(e))
    const approved = approvedRows.reduce((a, e) => a + num(e.amount), 0)
    const pending = pendingRows.reduce((a, e) => a + num(e.amount), 0)
    const booked = approved + pending
    const paid = (state.payInOuts || [])
      .filter(p => String(p.date) === String(selectedDate) && p.type === 'OUT')
      .reduce((a, p) => a + num(p.amount), 0)
    return {
      booked,
      paid,
      approved,
      pending,
      approvedCount: approvedRows.length,
      pendingCount: pendingRows.length,
    }
  }, [dayExpenses, state.expenses, state.payInOuts, selectedDate])

  const hrRows = useMemo(() => {
    const staffById = Object.fromEntries((state.staff || []).map(s => [String(s.id), s]))
    const byPos = {}
    attendanceRows.forEach(rec => {
      const st = staffById[String(rec.staffId)]
      const pos = st?.position || rec.staffName || 'Staff'
      const status = String(rec.status || '')
      const present =
        status === 'Present' ||
        status === 'Late' ||
        (rec.checkIn && status !== 'Leave' && status !== 'Absent')
      if (!present) return
      byPos[pos] = (byPos[pos] || 0) + 1
    })
    return Object.entries(byPos)
      .map(([designation, present]) => ({ designation, present }))
      .sort((a, b) => a.designation.localeCompare(b.designation))
  }, [attendanceRows, state.staff])

  const hrAttendanceTable = useMemo(() => {
    const staffList = state.staff || []
    const rows = (attendanceRows || []).map(r => {
      const st = staffList.find(s => String(s.id) === String(r.staffId))
      return {
        id: r.id || r._id || `${r.staffId}-${r.date}`,
        staffName: r.staffName || st?.name || '—',
        biometricId: st?.biometricId || '',
        position: st?.position || '—',
        status: r.status || '—',
        checkIn: r.checkIn || '',
        checkOut: r.checkOut || '',
        lateMinutes: Number(r.lateMinutes || 0),
        earlyOutMinutes: Number(r.earlyOutMinutes || 0),
      }
    }).sort((a, b) => String(a.staffName).localeCompare(String(b.staffName)))
    const stats = {
      present: rows.filter(r => r.status === 'Present' || r.status === 'Late').length,
      late: rows.filter(r => r.status === 'Late').length,
      leave: rows.filter(r => r.status === 'Leave').length,
      absent: rows.filter(r => r.status === 'Absent').length,
    }
    return { rows, stats }
  }, [attendanceRows, state.staff])

  const hrStatusClass = (status) => {
    switch (String(status || '')) {
      case 'Present': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      case 'Late': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
      case 'Absent': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      case 'Leave': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400'
    }
  }

  const authHeaders = useMemo(
    () => ({ ...(token ? { Authorization: `Bearer ${token}` } : {}) }),
    [token]
  )

  const refreshData = useCallback(async (opts = {}) => {
    const quiet = !!opts.quiet
    if (!token || !selectedDate) return
    setRefreshing(true)
    try {
      const month = selectedDate.slice(0, 7)
      const expenseParams = new URLSearchParams({
        from: selectedDate,
        to: selectedDate,
        page: '1',
        limit: '200',
      })
      const [salesRes, recallsRes, heldsRes, voidsRes, attRes, bookingsRes, expensesRes] = await Promise.all([
        fetch(`${API}/api/sales?from=${selectedDate}&to=${selectedDate}`, { headers: authHeaders, cache: 'no-store' }),
        fetch(`${API}/api/recalls`, { headers: authHeaders, cache: 'no-store' }),
        fetch(`${API}/api/helds`, { headers: authHeaders, cache: 'no-store' }),
        fetch(`${API}/api/voids?from=${selectedDate}&to=${selectedDate}&limit=500`, { headers: authHeaders, cache: 'no-store' }),
        fetch(`${API}/api/attendance?date=${encodeURIComponent(selectedDate)}`, { headers: authHeaders, cache: 'no-store' }),
        fetch(`${API}/api/advance-bookings`, { headers: authHeaders, cache: 'no-store' }),
        fetch(`${API}/api/expenses?${expenseParams}`, { headers: authHeaders, cache: 'no-store' }),
      ])

      const patch = {}
      if (salesRes.ok) {
        const rows = await salesRes.json()
        const fetched = (Array.isArray(rows) ? rows : []).map(s => ({ ...s, id: s.id || s._id }))
        setDaySalesOverride(fetched)
        // Replace that date's sales in global state; keep other dates
        const others = (state.sales || []).filter(s => String(s.date) !== String(selectedDate))
        patch.sales = [...fetched, ...others]
      }
      if (recallsRes.ok) {
        const data = await recallsRes.json()
        if (Array.isArray(data)) patch.recalls = data.map(r => ({ ...r, id: r.id || r._id }))
      }
      if (heldsRes.ok) {
        const data = await heldsRes.json()
        if (Array.isArray(data)) patch.helds = data.map(h => ({ ...h, id: h.id || h._id }))
      }
      if (Object.keys(patch).length) dispatch({ type: 'HYDRATE', payload: patch })

      if (voidsRes.ok) {
        const data = await voidsRes.json()
        const list = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : []
        setVoidRows(list)
      } else setVoidRows([])

      if (attRes.ok) {
        const docs = await attRes.json()
        setAttendanceRows(Array.isArray(docs) ? docs : [])
      } else {
        const fallback = await fetch(`${API}/api/attendance?month=${encodeURIComponent(month)}`, { headers: authHeaders })
        if (fallback.ok) {
          const docs = await fallback.json()
          setAttendanceRows((Array.isArray(docs) ? docs : []).filter(d => d.date === selectedDate))
        } else setAttendanceRows([])
      }

      if (bookingsRes.ok) {
        const rows = await bookingsRes.json()
        dispatch({
          type: 'HYDRATE',
          payload: { advanceBookings: (rows || []).map(x => ({ ...x, id: x.id || x._id })) },
        })
      }

      if (expensesRes.ok) {
        const data = await expensesRes.json()
        const rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : []
        setDayExpenses(rows.map(x => ({ ...x, id: x.id || x._id })))
      } else {
        setDayExpenses([])
      }

      if (!quiet) toast.success('Dashboard refreshed')
    } catch {
      toast.error('Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }, [API, authHeaders, dispatch, selectedDate, state.sales, token])

  useEffect(() => {
    setDaySalesOverride(null)
    setDayExpenses(null)
    refreshData({ quiet: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  const exportPayload = useMemo(
    () => ({
      date: selectedDate,
      companyName,
      totalOrders,
      completedCount,
      pendingCount,
      customers: customerStats,
      salesSummary,
      timeBuckets: timeBuckets.rows,
      posStats,
      paymentRows,
      billAnalysis,
      expenseAnalysis,
      hrRows,
      hrAttendanceRows: hrAttendanceTable.rows,
      hrStats: hrAttendanceTable.stats,
    }),
    [
      selectedDate,
      companyName,
      totalOrders,
      completedCount,
      pendingCount,
      customerStats,
      salesSummary,
      timeBuckets.rows,
      posStats,
      paymentRows,
      billAnalysis,
      expenseAnalysis,
      hrRows,
      hrAttendanceTable,
    ]
  )

  const buildReportHtml = () => {
    const p = exportPayload
    const fileName = `Dashboard-${p.date}.pdf`
    const body =
        reportSummary([
          { label: 'Date', amount: p.date },
          { label: 'Total orders', amount: String(p.totalOrders) },
          { label: 'Completed', amount: String(p.completedCount) },
          { label: 'Pending', amount: String(p.pendingCount) },
          { label: 'New customers', amount: String(p.customers.newCount) },
          { label: 'Old customers', amount: String(p.customers.oldCount) },
        ]) +
        reportSec('Sales') +
        reportTable({
          headers: ['Branch', 'Transactions', 'Sale', 'Discount', 'Charges', 'Total', 'Paid', 'Bill Size', 'Expense'],
          rows: [
            [
              p.companyName,
              String(p.salesSummary.transactions),
              fmt(p.salesSummary.sale),
              fmt(p.salesSummary.discount),
              fmt(p.salesSummary.charges),
              fmt(p.salesSummary.total),
              fmt(p.salesSummary.paid),
              fmt(p.salesSummary.billSize),
              fmt(p.salesSummary.expense),
            ],
          ],
        }) +
        reportSec('Time analysis') +
        reportTable({
          headers: ['Minutes', 'Invoice count'],
          rows: p.timeBuckets.map(r => [r.label, String(r.count)]),
        }) +
        reportSec('POS stats') +
        reportSummary([
          { label: 'Sale', amount: fmt(p.posStats.sale) },
          { label: 'Settled', amount: fmt(p.posStats.settled) },
          { label: 'Discount', amount: fmt(p.posStats.discount) },
          { label: 'Void', amount: fmt(p.posStats.void) },
        ]) +
        reportSec('Payment analysis') +
        reportTable({
          headers: ['Payment type', 'Amount'],
          rows: p.paymentRows.map(r => [r.type, fmt(r.amount)]),
        }) +
        reportSec('Bill & expense') +
        reportSummary([
          { label: 'Bill booked', amount: fmt(p.billAnalysis.billBooked) },
          { label: 'Bill paid', amount: fmt(p.billAnalysis.billPaid) },
          { label: 'Total payable', amount: fmt(p.billAnalysis.totalPayable) },
          { label: 'Expense total', amount: fmt(p.expenseAnalysis.booked) },
          { label: `Approved (${p.expenseAnalysis.approvedCount || 0})`, amount: fmt(p.expenseAnalysis.approved) },
          { label: `Unapproved (${p.expenseAnalysis.pendingCount || 0})`, amount: fmt(p.expenseAnalysis.pending) },
          { label: 'Expense paid (pay-out)', amount: fmt(p.expenseAnalysis.paid) },
        ]) +
        reportSec('HR information — by designation') +
        reportTable({
          headers: ['Staff designation', 'Present'],
          rows: p.hrRows.map(r => [r.designation, String(r.present)]),
          emptyText: 'No attendance for this date',
        }) +
        reportSec(`Daily attendance — ${p.date}`) +
        reportTable({
          headers: ['Staff', 'Biometric ID', 'Position', 'Status', 'Check In', 'Check Out', 'Late Min', 'Early Min'],
          numbered: true,
          rows: (p.hrAttendanceRows || []).map(r => [
            r.staffName,
            r.biometricId || '—',
            r.position,
            r.status,
            r.checkIn ? formatTime12(r.checkIn) : '—',
            r.checkOut ? formatTime12(r.checkOut) : '—',
            Number(r.lateMinutes || 0) > 0 ? String(r.lateMinutes) : '—',
            Number(r.earlyOutMinutes || 0) > 0 ? String(r.earlyOutMinutes) : '—',
          ]),
          emptyText: 'No attendance records for this date',
        })

    const html = wrapReportDoc({
      settings: state?.settings || {},
      title: 'POS Dashboard',
      reportLabel: 'Dashboard Summary',
      reportNo: `Rpt #: DB-${p.date}`,
      metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd h:mm a')], ['Business date', p.date]],
      metaRight: [['Branch', p.companyName]],
      body,
    })
    return { html, fileName }
  }

  const openPrint = async () => {
    try {
      const { html, fileName } = buildReportHtml()
      await previewHtmlReport(html, fileName)
      toast.success('Print preview opened')
    } catch {
      toast.error('Print preview failed')
    }
  }

  const exportPdf = async () => {
    try {
      const { html, fileName } = buildReportHtml()
      await downloadHtmlReport(html, fileName)
      toast.success('PDF downloaded')
    } catch {
      toast.error('PDF export failed')
    }
  }

  const exportCsv = () => {
    try {
      const p = exportPayload
      const lines = [
        ['Section', 'Field', 'Value'].join(','),
        ['KPI', 'Total Orders', p.totalOrders].map(v => `"${v}"`).join(','),
        ['KPI', 'Completed', p.completedCount].map(v => `"${v}"`).join(','),
        ['KPI', 'Pending', p.pendingCount].map(v => `"${v}"`).join(','),
        ['Sales', 'Branch', p.companyName].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','),
        ['Sales', 'Transactions', p.salesSummary.transactions].map(v => `"${v}"`).join(','),
        ['Sales', 'Sale', p.salesSummary.sale].map(v => `"${v}"`).join(','),
        ['Sales', 'Total', p.salesSummary.total].map(v => `"${v}"`).join(','),
        ...p.paymentRows.map(r => ['Payment', r.type, r.amount].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
        ...p.hrRows.map(r => ['HR', r.designation, r.present].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
        ...(p.hrAttendanceRows || []).map(r => ['Attendance', r.staffName, r.status, r.checkIn || '', r.checkOut || '', r.lateMinutes || 0, r.earlyOutMinutes || 0].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
      ]
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dashboard_${p.date}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV exported')
    } catch {
      toast.error('CSV export failed')
    }
  }

  const activeSlice = timeBuckets.pieData[pieIndex] || timeBuckets.pieData[0]

  const topCards = [
    { title: 'Total Orders', value: String(totalOrders), icon: ShoppingCart, iconColor: 'bg-blue-500' },
    { title: 'Completed', value: String(completedCount), icon: CheckCircle2, iconColor: 'bg-emerald-500' },
    { title: 'Pending', value: String(pendingCount), icon: Clock, iconColor: 'bg-amber-500' },
    { title: 'Sale Total', value: `PKR ${fmt(salesSummary.total)}`, icon: Wallet, iconColor: 'bg-indigo-500' },
  ]

  const customerCards = [
    { title: 'New Customers', value: String(customerStats.newCount), icon: UserPlus, iconColor: 'bg-sky-500' },
    { title: 'Returning Customers', value: String(customerStats.oldCount), icon: Users, iconColor: 'bg-blue-600' },
    { title: 'Transactions', value: String(salesSummary.transactions), icon: BarChart3, iconColor: 'bg-violet-500' },
    { title: 'Bill Size', value: `PKR ${fmt(salesSummary.billSize)}`, icon: Banknote, iconColor: 'bg-teal-500' },
  ]

  const heroBtn =
    'inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold uppercase tracking-wider transition-all active:scale-95'
  const heroBtnSolid = `${heroBtn} bg-white text-blue-700 shadow-lg hover:bg-blue-50 disabled:opacity-60`
  const heroBtnGhost = `${heroBtn} bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25`

  return (
    <div className="space-y-6 pb-10">
      <PageHero
        icon={BarChart3}
        title="Dashboard"
        subtitle={`POS overview · Business date ${selectedDate}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative z-20 h-9 w-[11.5rem] rounded-xl bg-white shadow-lg">
              <DatePicker
                value={selectedDate}
                onChange={v => {
                  if (!v) return
                  setSelectedDate(v)
                }}
                className="h-full w-full gap-0"
                compact
                allowClear={false}
              />
            </div>
            <button type="button" onClick={() => refreshData()} disabled={refreshing} className={heroBtnSolid}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button type="button" onClick={openPrint} className={heroBtnGhost}>
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
            <button type="button" onClick={exportPdf} className={heroBtnGhost}>
              <FileDown className="h-3.5 w-3.5" /> PDF
            </button>
            <button type="button" onClick={exportCsv} className={heroBtnGhost}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {topCards.map(card => (
          <StatCard key={card.title} {...card} />
        ))}
      </div>

      <Panel title={`Current Orders (${currentOrders.length})`} icon={Clock}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                {['Time', 'Token', 'Type', 'Table', 'Waiter', 'Customer', 'Status', 'Amount'].map(h => (
                  <th key={h} className={h === 'Amount' ? 'text-right' : ''}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentOrders.map(o => (
                <tr key={`${o.kind}-${o.id}`}>
                  <td className="whitespace-nowrap text-xs">
                    {o.createdAt ? format(new Date(o.createdAt), 'h:mm a') : '—'}
                    {o.date && o.date !== selectedDate ? (
                      <span className="ml-1 text-[var(--color-text-muted)]">({o.date})</span>
                    ) : null}
                  </td>
                  <td className="font-semibold text-blue-600 dark:text-blue-400">{o.tokenNo || '—'}</td>
                  <td>{o.orderType || '—'}</td>
                  <td>{o.tableNo || '—'}</td>
                  <td>{o.waiterName || '—'}</td>
                  <td className="max-w-[10rem] truncate">{o.customer || '—'}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ORDER_STATUS_CHIP[o.status] || ORDER_STATUS_CHIP.ordered}`}>
                      {ORDER_STATUS_LABEL[o.status] || o.status || 'Ordered'}
                    </span>
                  </td>
                  <td className="text-right font-semibold">{fmt(o.total)}</td>
                </tr>
              ))}
              {currentOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-[var(--color-text-muted)] py-8">
                    No open recalls or in-process orders
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {customerCards.map(card => (
          <StatCard key={card.title} {...card} />
        ))}
      </div>

      <Panel title="Sales" icon={BarChart3}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                {['Branch', 'Transactions', 'Sale', 'Discount', 'Charges', 'Tax Inclusive', 'Tax Exclusive', 'Total', 'Paid Amount', 'Bill Size', 'Expense'].map(h => (
                  <th key={h} className="whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-medium">{companyName}</td>
                <td>{salesSummary.transactions}</td>
                <td>{fmt(salesSummary.sale)}</td>
                <td>{fmt(salesSummary.discount)}</td>
                <td>{fmt(salesSummary.charges)}</td>
                <td>{fmt(salesSummary.taxIn)}</td>
                <td>{fmt(salesSummary.taxEx)}</td>
                <td className="font-semibold">{fmt(salesSummary.total)}</td>
                <td>{fmt(salesSummary.paid)}</td>
                <td>{fmt(salesSummary.billSize)}</td>
                <td>{fmt(salesSummary.expense)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Time Analysis" icon={Clock}>
          <div className="overflow-x-auto mb-4">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Minutes</th>
                  <th className="text-right">Invoice Count</th>
                </tr>
              </thead>
              <tbody>
                {timeBuckets.rows.map(r => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className="text-right">{r.count}</td>
                  </tr>
                ))}
                <tr>
                  <td className="font-semibold">Total</td>
                  <td className="text-right font-semibold">{timeBuckets.total}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="relative h-[260px]">
            {timeBuckets.pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={timeBuckets.pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      onClick={(_, i) => setPieIndex(i)}
                    >
                      {timeBuckets.pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#0f172a' }}
                    />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                  <div className="text-2xl font-bold text-blue-600">{activeSlice ? `${activeSlice.pct}%` : '0%'}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{activeSlice?.name || '15 mins'}</div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-[var(--color-text-muted)] text-sm">No invoices for this date</div>
            )}
          </div>
        </Panel>

        <Panel title="Payment Analysis" icon={Wallet}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Payment Type</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.map(r => (
                  <tr key={r.type}>
                    <td>{r.type}</td>
                    <td className="text-right font-semibold">{fmt(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title="POS Stats" icon={Banknote}>
        <div className="flex flex-wrap gap-3">
          <MiniStat icon={Banknote} title="Sale" value={posStats.sale} iconColor="bg-blue-500" />
          <MiniStat icon={Wallet} title="Settled" value={posStats.settled} iconColor="bg-emerald-500" />
          <MiniStat icon={Tag} title="Discount" value={posStats.discount} iconColor="bg-amber-500" />
          <MiniStat icon={UserX} title="Void" value={posStats.void} iconColor="bg-rose-500" />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Bill Analysis" icon={CheckCircle2}>
          <div className="flex flex-wrap gap-3">
            <MiniStat icon={Banknote} title="Bill Booked" value={billAnalysis.billBooked} iconColor="bg-blue-500" />
            <MiniStat icon={CheckCircle2} title="Bill Paid" value={billAnalysis.billPaid} iconColor="bg-emerald-500" />
            <MiniStat icon={Wallet} title="Total Payable" value={billAnalysis.totalPayable} iconColor="bg-indigo-500" />
          </div>
        </Panel>

        <Panel title={`Expense Analysis · ${selectedDate}`} icon={Tag}>
          <div className="flex flex-wrap gap-3">
            <MiniStat icon={Banknote} title="Total Expenses" value={expenseAnalysis.booked} iconColor="bg-rose-500" />
            <MiniStat
              icon={CheckCircle2}
              title={`Approved (${expenseAnalysis.approvedCount})`}
              value={expenseAnalysis.approved}
              iconColor="bg-emerald-500"
            />
            <MiniStat
              icon={Clock}
              title={`Unapproved (${expenseAnalysis.pendingCount})`}
              value={expenseAnalysis.pending}
              iconColor="bg-amber-500"
            />
            <MiniStat icon={Wallet} title="Pay-Out" value={expenseAnalysis.paid} iconColor="bg-indigo-500" />
          </div>
        </Panel>
      </div>

      <Panel title="HR Information" icon={Users}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-2xl font-bold text-green-600">{hrAttendanceTable.stats.present}</div>
              <div className="text-xs text-slate-500">Present</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-2xl font-bold text-orange-600">{hrAttendanceTable.stats.late}</div>
              <div className="text-xs text-slate-500">Late</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-2xl font-bold text-blue-600">{hrAttendanceTable.stats.leave}</div>
              <div className="text-xs text-slate-500">Leave</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-2xl font-bold text-red-600">{hrAttendanceTable.stats.absent}</div>
              <div className="text-xs text-slate-500">Absent</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                <span className="h-2 w-2 rounded-full bg-teal-500" />
                Daily Attendance — {selectedDate} ({hrAttendanceTable.rows.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-700/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Staff</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Biometric ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Position</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Check In</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Check Out</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Late Min</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Early Min</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {hrAttendanceTable.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                        No attendance records for {selectedDate}
                      </td>
                    </tr>
                  )}
                  {hrAttendanceTable.rows.map((r, idx) => (
                    <tr
                      key={r.id}
                      className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30 ${
                        idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-blue-500 text-sm font-bold text-white">
                            {String(r.staffName || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{r.staffName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono text-sm ${r.biometricId ? 'text-blue-700 dark:text-blue-300' : 'text-slate-400'}`}>
                          {r.biometricId || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                          {r.position}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${hrStatusClass(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-slate-700 dark:text-slate-300">
                        {r.checkIn ? formatTime12(r.checkIn) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-slate-700 dark:text-slate-300">
                        {r.checkOut ? formatTime12(r.checkOut) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.lateMinutes > 0
                          ? <span className="font-medium text-orange-600">{r.lateMinutes}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.earlyOutMinutes > 0
                          ? <span className="font-medium text-blue-600">{r.earlyOutMinutes}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}
