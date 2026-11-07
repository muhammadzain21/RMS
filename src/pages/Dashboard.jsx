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
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useAuth } from '../state/AuthContext.jsx'
import { useData } from '../state/DataContext.jsx'
import DatePicker from '../components/DatePicker.jsx'
import PageHero from '../components/ui/PageHero.jsx'
import { createLineTotal } from './sales/utils.js'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../utils/reportDoc.js'

const PIE_COLORS = ['#3b82f6', '#6366f1', '#0ea5e9', '#10b981', '#f59e0b']

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
  return m === 'cash' || m === 'card' || m === 'bank'
}

function paymentBucket(s) {
  const pm = String(s.paymentMethod || 'cash').toLowerCase()
  const ch = String(s.bankChannel || '').toLowerCase()
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

  const [selectedDate, setSelectedDate] = useState(businessDate || format(new Date(), 'yyyy-MM-dd'))
  const [dateTouched, setDateTouched] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [voidRows, setVoidRows] = useState([])
  const [attendanceRows, setAttendanceRows] = useState([])
  const [pieIndex, setPieIndex] = useState(0)
  // Sales fetched for the selected date (source of truth for dashboard filter)
  const [daySalesOverride, setDaySalesOverride] = useState(null)

  useEffect(() => {
    if (!dateTouched && businessDate) setSelectedDate(businessDate)
  }, [businessDate, dateTouched])

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
    const expense = (state.expenses || [])
      .filter(e => e.date === selectedDate)
      .reduce((a, e) => a + num(e.amount), 0)
    const billSize = transactions ? total / transactions : 0
    return { transactions, sale, discount, charges, taxIn, taxEx, total, paid, billSize, expense }
  }, [daySales, state.expenses, selectedDate])

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
      const b = paymentBucket(s)
      if (!b) return
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
    const booked = (state.expenses || [])
      .filter(e => e.date === selectedDate)
      .reduce((a, e) => a + num(e.amount), 0)
    const paid = (state.payInOuts || [])
      .filter(p => p.date === selectedDate && p.type === 'OUT')
      .reduce((a, p) => a + num(p.amount), 0)
    return { booked, paid }
  }, [state.expenses, state.payInOuts, selectedDate])

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
      const [salesRes, recallsRes, heldsRes, voidsRes, attRes, bookingsRes] = await Promise.all([
        fetch(`${API}/api/sales?from=${selectedDate}&to=${selectedDate}`, { headers: authHeaders, cache: 'no-store' }),
        fetch(`${API}/api/recalls`, { headers: authHeaders, cache: 'no-store' }),
        fetch(`${API}/api/helds`, { headers: authHeaders, cache: 'no-store' }),
        fetch(`${API}/api/voids?from=${selectedDate}&to=${selectedDate}&limit=500`, { headers: authHeaders, cache: 'no-store' }),
        fetch(`${API}/api/attendance?date=${encodeURIComponent(selectedDate)}`, { headers: authHeaders, cache: 'no-store' }),
        fetch(`${API}/api/advance-bookings`, { headers: authHeaders, cache: 'no-store' }),
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

      if (!quiet) toast.success('Dashboard refreshed')
    } catch {
      toast.error('Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }, [API, authHeaders, dispatch, selectedDate, state.sales, token])

  useEffect(() => {
    setDaySalesOverride(null)
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
    ]
  )

  const openPrint = async () => {
    try {
      const p = exportPayload
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
          { label: 'Expense booked', amount: fmt(p.expenseAnalysis.booked) },
          { label: 'Expense paid', amount: fmt(p.expenseAnalysis.paid) },
        ]) +
        reportSec('HR information') +
        reportTable({
          headers: ['Staff designation', 'Present'],
          rows: p.hrRows.map(r => [r.designation, String(r.present)]),
          emptyText: 'No attendance for this date',
        })

      const html = wrapReportDoc({
        settings: state?.settings || {},
        title: 'POS Dashboard',
        reportLabel: 'Dashboard Summary',
        reportNo: `Rpt #: DB-${p.date}`,
        metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Business date', p.date]],
        metaRight: [['Branch', p.companyName]],
        body,
      })
      await previewHtmlReport(html, `Dashboard-${p.date}.pdf`)
      toast.success('Print preview opened')
    } catch {
      toast.error('Print preview failed')
    }
  }

  const exportPdf = () => {
    try {
      const p = exportPayload
      const doc = new jsPDF()
      doc.setFontSize(14)
      doc.text(`${p.companyName} — Dashboard`, 14, 16)
      doc.setFontSize(10)
      doc.text(`Date: ${p.date}`, 14, 23)
      autoTable(doc, {
        startY: 28,
        head: [['Metric', 'Value']],
        body: [
          ['Total orders', p.totalOrders],
          ['Completed', p.completedCount],
          ['Pending', p.pendingCount],
          ['Sale total', fmt(p.salesSummary.total)],
          ['Paid amount', fmt(p.salesSummary.paid)],
          ['Expense', fmt(p.salesSummary.expense)],
        ],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [15, 45, 92] },
      })
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8,
        head: [['Payment type', 'Amount']],
        body: p.paymentRows.map(r => [r.type, fmt(r.amount)]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [15, 45, 92] },
      })
      doc.save(`dashboard_${p.date}.pdf`)
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
                  setDateTouched(true)
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

        <Panel title="Expense Analysis" icon={Tag}>
          <div className="flex flex-wrap gap-3">
            <MiniStat icon={Banknote} title="Expense Booked" value={expenseAnalysis.booked} iconColor="bg-rose-500" />
            <MiniStat icon={Wallet} title="Expense Paid" value={expenseAnalysis.paid} iconColor="bg-amber-500" />
          </div>
        </Panel>
      </div>

      <Panel title="HR Information" icon={Users}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Staff Designation</th>
                <th className="text-right">Present</th>
              </tr>
            </thead>
            <tbody>
              {hrRows.map(r => (
                <tr key={r.designation}>
                  <td>{r.designation}</td>
                  <td className="text-right">{r.present}</td>
                </tr>
              ))}
              {hrRows.length === 0 && (
                <tr>
                  <td colSpan={2} className="text-center text-[var(--color-text-muted)] py-6">
                    No attendance recorded for {selectedDate}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
