import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useAuth } from '../state/AuthContext.jsx'
import { useData } from '../state/DataContext.jsx'
import StatsCard from '../components/StatsCard.jsx'
import ChartCard from '../components/ChartCard.jsx'
import { LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, Legend, CartesianGrid } from 'recharts'
import { format, subDays, addDays } from 'date-fns'

export default function Dashboard() {
  const { metrics, state, businessDate, dispatch } = useData()
  const { token } = useAuth()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  // Per-card selectors (already added)
  const [saleCardRange, setSaleCardRange] = useState('today')
  const [returnCardRange, setReturnCardRange] = useState('today')
  const [netCardRange, setNetCardRange] = useState('today')
  // New per-chart/table selectors
  const [salesChartRange, setSalesChartRange] = useState('30') // '7' | '30' | '90' | 'today'
  const [expenseChartRange, setExpenseChartRange] = useState('30')
  const [itemTableRange, setItemTableRange] = useState('30')
  const [categoryTableRange, setCategoryTableRange] = useState('30')
  const rangeToDays = (v) => (v === 'today' ? 1 : Number(v))
  const sinceDateStr = (n) => format(subDays(new Date(), Math.max(0, n - 1)), 'yyyy-MM-dd')
  const inLastNDays = (dateStr, n) => {
    const since = sinceDateStr(n)
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    // All dates are yyyy-MM-dd so lexicographic compare works
    return dateStr >= since && dateStr <= todayStr
  }
  const getSalesAgg = (rangeVal) => {
    const n = Math.max(1, rangeToDays(rangeVal))
    const list = rangeVal === 'today'
      ? state.sales.filter(s => {
          // Include sales dated with the active business day.
          if (s.date === businessDate) return true
          // If daybook is open and calendar today != businessDate, also include calendar today's sales.
          if (Boolean(state?.daybook?.open) && businessDate !== format(new Date(), 'yyyy-MM-dd')) {
            return s.date === format(new Date(), 'yyyy-MM-dd')
          }
          return false
        })
      : state.sales.filter(s => inLastNDays(s.date, n))
    // netTotal = sum of saved totals (after all discounts)
    const compTotal = list.filter(s => s.paymentMethod === 'complimentary').reduce((a,b) => a + Number(b.total||0), 0)
    const netTotal = Math.max(0, list.reduce((a,b) => a + Number(b.total||0), 0) - compTotal)
    // preGross = sum of pre-discount subtotals: total + itemsDiscount + billDiscount (or legacy discount)
    const preGross = list.reduce((a,b) => a + Number(b.total || 0) + Number(b.itemsDiscount || 0) + Number(b.billDiscount || b.discount || 0), 0)
    const itemsDiscounts = list.reduce((a,b) => a + Number(b.itemsDiscount || 0), 0)
    const billDiscounts = list.reduce((a,b) => {
      const itemsDisc = Number(b.itemsDiscount || 0)
      const billDisc = Number(b.billDiscount || 0)
      const combined = Number(b.discount || 0)
      // Prefer explicit billDiscount; else derive from combined - items
      const derived = billDisc || (combined ? Math.max(0, combined - itemsDisc) : 0) || 0
      return a + derived
    }, 0)
    const discount = itemsDiscounts + billDiscounts
    const items = list.reduce((a, sale) => a + sale.items.reduce((x, it) => x + Number(it.qty), 0), 0)
    const byMethod = list.reduce((acc, s) => {
      const m = s.paymentMethod || 'cash'
      const key = m === 'card' ? 'online' : m
      if (!acc[key]) acc[key] = { gross: 0, discount: 0 }
      // For the 'Total Sale in PKR' card we display pre-discount totals.
      acc[key].gross += Number(s.total || 0) + Number(s.itemsDiscount || 0) + Number(s.billDiscount || s.discount || 0)
      acc[key].discount += Number(s.billDiscount || s.discount || 0) + Number(s.itemsDiscount || 0)
      return acc
    }, {})
    // Also provide by-method bill-only discounts for Net card alignment
    const byMethodBillDiscounts = list.reduce((acc, s) => {
      const m = s.paymentMethod || 'cash'
      const key = m === 'card' ? 'online' : m
      if (!acc[key]) acc[key] = { bill: 0 }
      const itemsDisc = Number(s.itemsDiscount || 0)
      const billDisc = Number(s.billDiscount || 0)
      const combined = Number(s.discount || 0)
      const derived = billDisc || (combined ? Math.max(0, combined - itemsDisc) : 0) || 0
      acc[m].bill += derived
      return acc
    }, {})
    // Provide by-method net aligned to gross - billDiscounts (exclude item discounts)
    const byMethodNet = Object.keys(byMethod).reduce((acc, m) => {
      if (m === 'complimentary') {
        acc[m] = { net: 0 }
      } else {
        const gross = byMethod[m]?.gross || 0
        const bill = byMethodBillDiscounts[m]?.bill || 0
        acc[m] = { net: Math.max(0, gross - bill) }
      }
      return acc
    }, {})
    return { gross: preGross, net: netTotal, discount, items, byMethod, byMethodNet, billDiscounts }
  }
  const saleAgg = useMemo(() => getSalesAgg(saleCardRange), [state.sales, saleCardRange, businessDate, state?.daybook?.open])
  const netAgg = useMemo(() => getSalesAgg(netCardRange), [state.sales, netCardRange, businessDate, state?.daybook?.open])

  // Returns aggregation for range selectors
  const getReturnsAgg = (rangeVal) => {
    const n = Math.max(1, rangeToDays(rangeVal))
    const list = rangeVal === 'today'
      ? (state.returns||[]).filter(r => {
          if (r.date === businessDate) return true
          if (Boolean(state?.daybook?.open) && businessDate !== format(new Date(), 'yyyy-MM-dd')) {
            return r.date === format(new Date(), 'yyyy-MM-dd')
          }
          return false
        })
      : (state.returns||[]).filter(r => inLastNDays(r.date, n))
    const totalRefund = list.reduce((a,b) => a + Number(b.refund || 0), 0)
    const byMethod = list.reduce((acc, r) => {
      const m = r.paymentMethod || 'cash'
      if (!acc[m]) acc[m] = { refund: 0 }
      acc[m].refund += Number(r.refund || 0)
      return acc
    }, {})
    return { totalRefund, byMethod }
  }
  const returnAgg = useMemo(() => getReturnsAgg(returnCardRange), [state.returns, returnCardRange, businessDate, state?.daybook?.open])
  const netReturnAgg = useMemo(() => getReturnsAgg(netCardRange), [state.returns, netCardRange, businessDate, state?.daybook?.open])

  const salesSeries = useMemo(() => {
    const n = Math.max(1, rangeToDays(salesChartRange))
    // Use businessDate as anchor if daybook is open and has sales; otherwise use calendar today
    const hasBusinessDateSales = state.sales.some(s => s.date === businessDate)
    const anchorDate = (state?.daybook?.open && hasBusinessDateSales) ? new Date(businessDate) : new Date()
    const days = Array.from({ length: n }).map((_, i) => format(subDays(anchorDate, n - 1 - i), 'yyyy-MM-dd'))
    return days.map(d => {
      const gross = state.sales
        .filter(s => s.date === d)
        .reduce((a,b) => a + Number(b.total||0), 0)
      const returns = (state.returns||[])
        .filter(r => r.date === d)
        .reduce((a,b) => a + Number(b.refund||0), 0)
      return {
        date: d.slice(5),
        sales: Math.max(0, gross - returns)
      }
    })
  }, [state.sales, state.returns, salesChartRange, businessDate, state?.daybook?.open])

  // Ensure we have both businessDate and calendar-today sales when daybook stays open past midnight
  useEffect(() => {
    const fetchBoth = async () => {
      try {
        if (!token) return
        if (!state?.daybook?.open) return
        const realToday = format(new Date(), 'yyyy-MM-dd')
        if (businessDate === realToday) return
        const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        const yesterday = format(subDays(new Date(realToday), 1), 'yyyy-MM-dd')
        const [bizRes, todayRes, yRes] = await Promise.all([
          fetch(`${API}/api/sales?from=${businessDate}&to=${businessDate}`, { headers }),
          fetch(`${API}/api/sales?from=${realToday}&to=${realToday}`, { headers }),
          fetch(`${API}/api/sales?from=${yesterday}&to=${yesterday}`, { headers }),
        ])
        let rows = []
        if (bizRes.ok) rows = [...rows, ...(await bizRes.json()||[])]
        if (todayRes.ok) rows = [...rows, ...(await todayRes.json()||[])]
        if (yRes.ok) rows = [...rows, ...(await yRes.json()||[])]
        // Merge with existing sales; keep all historical records
        const base = Array.isArray(state?.sales) ? state.sales : []
        const all = [...base, ...rows]
        const seen = new Set(); const merged = []
        for (const s of all) {
          const key = s._id || s.id || `${s.billNo || ''}-${s.date || ''}`
          if (seen.has(key)) continue
          seen.add(key)
          merged.push({ ...s, id: s.id || s._id })
        }
        if (merged.length) dispatch({ type: 'HYDRATE', payload: { sales: merged } })
      } catch {}
    }
    fetchBoth()
  }, [businessDate, state?.daybook?.open, token])

  const expenseVsRevenue = useMemo(() => {
    const n = Math.max(1, rangeToDays(expenseChartRange))
    // Use businessDate as anchor when daybook is open; otherwise use calendar today
    const hasBusinessDateData = state.sales.some(s => s.date === businessDate) || 
                                state.expenses.some(e => e.date === businessDate) ||
                                state.supplies.some(s => s.date === businessDate)
    const anchorDate = (state?.daybook?.open && hasBusinessDateData) ? new Date(businessDate) : new Date()
    const since = format(subDays(anchorDate, n - 1), 'yyyy-MM-dd')
    const anchorStr = format(anchorDate, 'yyyy-MM-dd')
    const inRange = (dateStr) => dateStr >= since && dateStr <= anchorStr
    
    // Include both businessDate data AND calendar today's data when daybook is open and spans midnight
    const includeCalendarToday = Boolean(state?.daybook?.open) && businessDate !== format(new Date(), 'yyyy-MM-dd')
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    
    const grossSales = state.sales
      .filter(s => inRange(s.date) || (includeCalendarToday && s.date === todayStr))
      .reduce((a,b) => a + Number(b.total||0), 0)
    const returns = (state.returns||[])
      .filter(r => inRange(r.date) || (includeCalendarToday && r.date === todayStr))
      .reduce((a,b) => a + Number(b.refund||0), 0)
    const sales = Math.max(0, grossSales - returns)

    const purchases = state.supplies
      .filter(s => inRange(s.date) || (includeCalendarToday && s.date === todayStr))
      .reduce((a,b) => a + Number(b.cost||0), 0)

    const expenses = state.expenses
      .filter(e => inRange(e.date) || (includeCalendarToday && e.date === todayStr))
      .reduce((a,b) => a + Number(b.amount||0), 0)

    return [
      { name: 'Sales', amount: sales },
      { name: 'Purchases', amount: purchases },
      { name: 'Expenses', amount: expenses },
    ]
  }, [state.sales, state.returns, state.supplies, state.expenses, expenseChartRange, businessDate, state?.daybook?.open])

  // === Sales Statistics (business day vs last CLOSED day) ===
  // Business day persists past midnight until a Day Close is performed.
  const realToday = format(new Date(), 'yyyy-MM-dd')
  const closedDates = (state.dayCloses||[]).map(d => d.date)
  const closedSet = new Set(closedDates)
  // Use businessDate from context; fall back to real today if absent
  const activeBusinessDate = businessDate || realToday
  const isDaybookOpenForActive = Boolean(state?.daybook?.open) && (state?.daybook?.date === activeBusinessDate)
  const isBusinessDateClosed = !isDaybookOpenForActive && closedSet.has(activeBusinessDate)
  // If the current businessDate is already closed (e.g. just after closing),
  // treat the effective 'today' reference as the next day so that the just-closed
  // date appears under 'Yesterday'.
  const effectiveToday = isBusinessDateClosed
    ? format(addDays(new Date(activeBusinessDate), 1), 'yyyy-MM-dd')
    : activeBusinessDate
  const sortedClosed = [...closedDates].sort()
  const salesDateSet = new Set((state.sales||[]).map(s=>s.date))
  // Pick the most recent closed date strictly before the current businessDate
  let yesterdayDate = ''
  // Prefer a closed date that actually has sales
  for (let i = sortedClosed.length - 1; i >= 0; i--) {
    const d = sortedClosed[i]
    if (d < effectiveToday && salesDateSet.has(d)) { yesterdayDate = d; break }
  }
  // If none with sales, pick the latest closed before effectiveToday regardless of sales
  if (!yesterdayDate) {
    for (let i = sortedClosed.length - 1; i >= 0; i--) {
      const d = sortedClosed[i]
      if (d < effectiveToday) { yesterdayDate = d; break }
    }
  }
  // Fallback: use the day immediately before effectiveToday (business-aware),
  // not calendar yesterday. This avoids duplicating the same date in both Today & Yesterday
  // when businessDate equals calendar yesterday.
  if (!yesterdayDate) {
    yesterdayDate = format(subDays(new Date(effectiveToday), 1), 'yyyy-MM-dd')
  }
  // For business day: if closed, show zeros; else use records of the business date.
  // When daybook is open and calendar today != business date, also include calendar today's entries
  // so after-midnight sales/returns appear in the current business day's totals until Day Close.
  const includeCalendarTodayAlso = Boolean(state?.daybook?.open) && (activeBusinessDate !== realToday)
  const todaysSalesList = isBusinessDateClosed ? [] : state.sales.filter(s => (s.date === activeBusinessDate) || (includeCalendarTodayAlso && s.date === realToday))
  const todaysReturnsList = isBusinessDateClosed ? [] : (state.returns||[]).filter(r => (r.date === activeBusinessDate) || (includeCalendarTodayAlso && r.date === realToday))
  const todaysSalesAmount = todaysSalesList.reduce((a,b) => a + Number(b.total||0), 0)
  const todaysSalesCount = todaysSalesList.length
  // Items discount amount today
  // Support legacy sales where itemsDiscount/billDiscount were not persisted
  // Derive items discount as: explicit itemsDiscount; else (combined - billDiscount) if positive; else 0
  const todaysItemsDiscountAmount = todaysSalesList.reduce((a,b) => {
    const itemsDisc = Number(b.itemsDiscount || 0)
    const billDisc = Number(b.billDiscount || 0)
    const combined = Number(b.discount || 0)
    const derivedItems = itemsDisc || (combined > 0 ? Math.max(0, combined - billDisc) : 0)
    return a + Number(derivedItems || 0)
  }, 0)
  // Derive count robustly even if backend didn't persist itemsDiscountCount
  const todaysItemsDiscountCount = todaysSalesList.reduce((acc, sale) => {
    const hasItemDisc = Number(sale.itemsDiscount || 0) > 0 || Number(sale.billDiscount || 0) > 0 || Number(sale.discount || 0) > 0
    if (!hasItemDisc) return acc
    const qty = Array.isArray(sale.items) ? sale.items.reduce((q,it)=> q + Number(it.qty||0), 0) : 0
    return acc + qty
  }, 0)
  // Bill discount should reflect bill-level discount, not item discount
  const todaysBillDiscounts = todaysSalesList.reduce((a,b) => {
    const itemsDisc = Number(b.itemsDiscount || 0)
    const billDisc = Number(b.billDiscount || 0)
    const combined = Number(b.discount || 0)
    // Prefer explicit billDiscount; else try to derive from combined - items; else assume combined is bill-level
    const derived = billDisc || (combined ? Math.max(0, combined - itemsDisc) : 0) || combined
    return a + Number(derived || 0)
  }, 0)
  // Today's metrics alignment
  // "TODAY'S TOTAL SALE AMOUNT" = sum before discounts (approx) = total + itemsDiscount + billDiscount
  const todaysPreDiscountTotal = todaysSalesAmount + todaysBillDiscounts + todaysItemsDiscountAmount
  const todaysComplimentary = todaysSalesList.filter(s => s.paymentMethod === 'complimentary').reduce((a,b) => a + Number(b.total||0), 0)
  const todaysReturns = todaysReturnsList.reduce((a,b) => a + Number(b.refund || 0), 0)
  // "TOTAL BILL AFTER DISCOUNT" = TODAY'S TOTAL SALE AMOUNT - ALL DISCOUNTS (item + bill) - COMPLIMENTARY - RETURNS
  const todaysBillAfterDiscount = Math.max(0, todaysPreDiscountTotal - todaysBillDiscounts - todaysItemsDiscountAmount - todaysComplimentary - todaysReturns)
  const yesterdayReturnsList = state.returns?.filter(r => r.date === yesterdayDate) || []
  const yesterdayReturns = yesterdayReturnsList.reduce((a,b) => a + Number(b.refund || 0), 0)
  const todaysByMethod = todaysSalesList.reduce((acc, s) => {
    const m = s.paymentMethod || 'cash'
    if (!acc[m]) acc[m] = { gross: 0, discount: 0 }
    acc[m].gross += Number(s.total)
    acc[m].discount += Number(s.discount || 0)
    return acc
  }, {})
  const methodValue = (m) => (todaysByMethod[m]?.gross || 0)
  const methodNet = (m) => (todaysByMethod[m]?.gross || 0) - (todaysByMethod[m]?.discount || 0)
  const yesterdaySalesAmount = state.sales.filter(s => s.date === yesterdayDate).reduce((a,b) => a + Number(b.total||0), 0)
  const yesterdaySalesCount = state.sales.filter(s => s.date === yesterdayDate).length
  const yesterdayItemsSold = state.sales.filter(s => s.date === yesterdayDate).reduce((a, sale) => a + (Array.isArray(sale.items)? sale.items.reduce((x, it) => x + Number(it.qty||0), 0) : 0), 0)
  const yesterdayItemsDiscountAmount = state.sales.filter(s => s.date === yesterdayDate).reduce((a,b) => {
    const itemsDisc = Number(b.itemsDiscount || 0)
    const billDisc = Number(b.billDiscount || 0)
    const combined = Number(b.discount || 0)
    const derivedItems = itemsDisc || (combined > 0 ? Math.max(0, combined - billDisc) : 0)
    return a + Number(derivedItems || 0)
  }, 0)
  const yesterdayItemsDiscountCount = state.sales.filter(s => s.date === yesterdayDate).reduce((acc, sale) => {
    const hasItemDisc = Number(sale.itemsDiscount || 0) > 0 || Number(sale.billDiscount || 0) > 0 || Number(sale.discount || 0) > 0
    if (!hasItemDisc) return acc
    const qty = Array.isArray(sale.items) ? sale.items.reduce((q,it)=> q + Number(it.qty||0), 0) : 0
    return acc + qty
  }, 0)
  const yesterdayBillDiscounts = state.sales.filter(s => s.date === yesterdayDate).reduce((a,b) => {
    const itemsDisc = Number(b.itemsDiscount || 0)
    const billDisc = Number(b.billDiscount || 0)
    const combined = Number(b.discount || 0)
    const derived = billDisc || (combined ? Math.max(0, combined - itemsDisc) : 0) || combined
    return a + Number(derived || 0)
  }, 0)
  // Fallback: if no sales captured but day close exists, use its aggregates
  const yesterdayClose = (state.dayCloses||[]).find(dc => dc.date === yesterdayDate)
  let ySalesAmt = yesterdaySalesAmount
  if (ySalesAmt === 0 && yesterdayClose) {
    ySalesAmt = Number(yesterdayClose.cashSales||0) + Number(yesterdayClose.onlineSales||yesterdayClose.cardSales||0)
  }
  const yesterdayPreDiscountTotal = ySalesAmt + yesterdayBillDiscounts + yesterdayItemsDiscountAmount
  const yesterdayComplimentary = state.sales.filter(s => s.date === yesterdayDate && s.paymentMethod === 'complimentary').reduce((a,b) => a + Number(b.total||0), 0)
  const yesterdayBillAfterDiscount = Math.max(0, yesterdayPreDiscountTotal - yesterdayBillDiscounts - yesterdayItemsDiscountAmount - yesterdayComplimentary - yesterdayReturns)

  // === Item-wise aggregation for last N days (own selector) ===
  const itemNDays = rangeToDays(itemTableRange)
  const itemRecentSales = state.sales.filter(s => inLastNDays(s.date, itemNDays))

  const menuById = useMemo(() => Object.fromEntries(state.menu.map(m => [m.id, m])), [state.menu])
  const itemAgg = useMemo(() => {
    const map = {}
    itemRecentSales.forEach(sale => {
      let contributed = false
      sale.items.forEach(it => {
        const m = menuById[it.itemId]
        const name = m?.name || it?.name || it?.itemName || it?.title || it?.custom?.name || 'Item'
        const qty = Number(it?.qty ?? it?.quantity ?? it?.count ?? 0)
        let lineTotal = Number(it?.total ?? it?.lineTotal ?? it?.amount ?? 0)
        let rate = Number(m?.price ?? it?.price ?? it?.rate ?? it?.unitPrice ?? 0)
        // If no unit rate but we have a line total and qty, derive it
        if (!rate && qty > 0 && lineTotal > 0) rate = lineTotal / qty
        // If still no price info and the sale has exactly 1 item, treat sale.total as this line total
        if (!rate && lineTotal <= 0 && Array.isArray(sale.items) && sale.items.length === 1) {
          lineTotal = Number(sale.total || 0)
          if (qty > 0 && lineTotal > 0) rate = lineTotal / qty
        }
        if (!map[name]) map[name] = { product: name, quantity: 0, amount: 0 }
        map[name].quantity += qty
        map[name].amount += (lineTotal > 0 ? lineTotal : qty * rate)
        if ((lineTotal > 0) || (qty > 0 && rate > 0)) contributed = true
      })
      // If nothing contributed (missing names/prices), roll up the sale as a single generic line
      if (!contributed) {
        const fallbackName = 'Unlabeled Item'
        if (!map[fallbackName]) map[fallbackName] = { product: fallbackName, quantity: 0, amount: 0 }
        const q = sale.items?.reduce((a,b)=> a + Number(b?.qty ?? b?.quantity ?? b?.count ?? 0), 0) || 1
        map[fallbackName].quantity += q
        map[fallbackName].amount += Number(sale.total || 0)
      }
    })
    return Object.values(map).sort((a,b) => b.amount - a.amount)
  }, [itemRecentSales, menuById])

  // === Category-wise aggregation for last N days (own selector) ===
  const categoryNDays = rangeToDays(categoryTableRange)
  const categoryRecentSales = state.sales.filter(s => inLastNDays(s.date, categoryNDays))

  const categoryAgg = useMemo(() => {
    const map = {}
    categoryRecentSales.forEach(sale => {
      let contributed = false
      sale.items.forEach(it => {
        const m = menuById[it.itemId]
        const cat = m?.category || it?.category || it?.custom?.category || 'Uncategorized'
        const name = m?.name || it?.name || it?.itemName || it?.title || it?.custom?.name || 'Item'
        const qty = Number(it?.qty ?? it?.quantity ?? it?.count ?? 0)
        let lineTotal = Number(it?.total ?? it?.lineTotal ?? it?.amount ?? 0)
        let rate = Number(m?.price ?? it?.price ?? it?.rate ?? it?.unitPrice ?? 0)
        if (!rate && qty > 0 && lineTotal > 0) rate = lineTotal / qty
        if (!rate && lineTotal <= 0 && Array.isArray(sale.items) && sale.items.length === 1) {
          lineTotal = Number(sale.total || 0)
          if (qty > 0 && lineTotal > 0) rate = lineTotal / qty
        }
        if (!map[cat]) map[cat] = { category: cat, quantity: 0, amount: 0 }
        map[cat].quantity += qty
        map[cat].amount += (lineTotal > 0 ? lineTotal : qty * rate)
        if ((lineTotal > 0) || (qty > 0 && rate > 0)) contributed = true
      })
      if (!contributed) {
        const cat = 'Uncategorized'
        if (!map[cat]) map[cat] = { category: cat, quantity: 0, amount: 0 }
        const q = sale.items?.reduce((a,b)=> a + Number(b?.qty ?? b?.quantity ?? b?.count ?? 0), 0) || 1
        map[cat].quantity += q
        map[cat].amount += Number(sale.total || 0)
      }
    })
    return Object.values(map).sort((a,b) => b.amount - a.amount)
  }, [categoryRecentSales, menuById])

  return (
    <div className="space-y-4">
      {/* Sales Statistics panel */}
      <div className="p-4 rounded-xl border border-gray-300 dark:border-gray-700 bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800/50 dark:to-gray-900 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="text-base font-semibold text-gray-900 dark:text-gray-100">Dashboard Summary</div>
          <button
            className="px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-sm font-medium"
            onClick={async()=>{
              try {
                const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
                const res = await fetch(`${API}/api/backup/export`, { headers })
                if (!res.ok) { const t = await res.text().catch(()=>`${res.status}`); toast.error(`Export failed: ${t}`); return }
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                const today = new Date().toLocaleDateString('en-CA')
                a.download = `rms-backup-${today}.json`
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(url)
              } catch { toast.error('Network error while exporting data') }
            }}
          >Export Data</button>
        </div>
      
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          <StatsCard variant="blue" title="TODAY'S TOTAL SALE AMOUNT" value={`PKR ${todaysPreDiscountTotal.toLocaleString()}`} />
          <StatsCard variant="green" title="TOTAL SALES TODAY" value={todaysSalesCount} />
          <StatsCard variant="red" title="ITEMS DISCOUNTED TODAY" value={`${todaysItemsDiscountCount}`} />
          <StatsCard variant="red" title="TOTAL DISCOUNTS" value={`PKR ${(todaysBillDiscounts + todaysItemsDiscountAmount).toLocaleString()}`} />
          <StatsCard variant="red" title="PERSONAL TODAY" value={`PKR ${todaysComplimentary.toLocaleString()}`} />
          <StatsCard variant="orange" title="RETURNS TODAY" value={`PKR ${todaysReturns.toLocaleString()}`} />
          <StatsCard variant="blue" title="TOTAL BILL AFTER DISCOUNT" value={`PKR ${todaysBillAfterDiscount.toLocaleString()}`} />
          <StatsCard variant="slate" title="YESTERDAY'S TOTAL SALE" value={`PKR ${yesterdayPreDiscountTotal.toLocaleString()}`} sub={`Yesterday: ${yesterdayDate}`} />
          <StatsCard variant="slate" title="TOTAL SALES YESTERDAY" value={yesterdaySalesCount} sub={`Yesterday: ${yesterdayDate}`} />
          <StatsCard variant="slate" title="ITEMS DISCOUNTED YESTERDAY" value={`${yesterdayItemsDiscountCount}`} sub={`Yesterday: ${yesterdayDate}`} />
          <StatsCard variant="slate" title="TOTAL DISCOUNTS YESTERDAY" value={`PKR ${(yesterdayBillDiscounts + yesterdayItemsDiscountAmount).toLocaleString()}`} sub={`Yesterday: ${yesterdayDate}`} />
          <StatsCard variant="slate" title="PERSONAL YESTERDAY" value={`PKR ${yesterdayComplimentary.toLocaleString()}`} sub={`Yesterday: ${yesterdayDate}`} />
          <StatsCard variant="slate" title="RETURNS YESTERDAY" value={`PKR ${yesterdayReturns.toLocaleString()}`} sub={`Yesterday: ${yesterdayDate}`} />
          <StatsCard variant="slate" title="BILL AFTER DISCOUNT YESTERDAY" value={`PKR ${yesterdayBillAfterDiscount.toLocaleString()}`} sub={`Yesterday: ${yesterdayDate}`} />
        </div>
      </div>

      {/* moved charts to end */}

      {/* Today summaries */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Total Sale in PKR" variant="blue">
          <div className="p-2">
            <div className="flex items-center justify-between">
              <div className="text-3xl font-semibold text-gray-900 dark:text-gray-100">{saleAgg.gross.toLocaleString()}</div>
              <select value={saleCardRange} onChange={e => setSaleCardRange(e.target.value)} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs">
                <option value="today">Today</option>
                <option value="7">7d</option>
                <option value="30">30d</option>
                <option value="90">90d</option>
              </select>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Sales</div>
            <ul className="mt-3 text-sm space-y-1 text-gray-700 dark:text-gray-300">
              <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-500" /> Cash Sale : {(saleAgg.byMethod['cash']?.gross || 0).toLocaleString()}</li>
              <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-indigo-500" /> Online Sale : {(saleAgg.byMethod['online']?.gross || 0).toLocaleString()}</li>
              <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500" /> Personal : {(saleAgg.byMethod['complimentary']?.gross || 0).toLocaleString()}</li>
            </ul>
          </div>
        </ChartCard>

        <ChartCard title="Total Sale Return in PKR" variant="red">
          <div className="p-2">
            <div className="flex items-center justify-between">
              <div className="text-3xl font-semibold text-gray-900 dark:text-gray-100">{returnAgg.totalRefund.toLocaleString()}</div>
              <select value={returnCardRange} onChange={e => setReturnCardRange(e.target.value)} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs">
                <option value="today">Today</option>
                <option value="7">7d</option>
                <option value="30">30d</option>
                <option value="90">90d</option>
              </select>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Return</div>
            <ul className="mt-3 text-sm space-y-1 text-gray-700 dark:text-gray-300">
              <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-500" /> Cash Return : {(returnAgg.byMethod['cash']?.refund || 0).toLocaleString()}</li>
              <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-indigo-500" /> Online Return : {(returnAgg.byMethod['online']?.refund || returnAgg.byMethod['card']?.refund || 0).toLocaleString()}</li>
            </ul>
          </div>
        </ChartCard>

        <ChartCard title="Total Net Sales in PKR" variant="green">
          <div className="p-2">
            <div className="flex items-center justify-between">
              <div className="text-3xl font-semibold text-gray-900 dark:text-gray-100">{Math.max(0, (netAgg.net || 0) - (netReturnAgg.totalRefund || 0)).toLocaleString()}</div>
              <select value={netCardRange} onChange={e => setNetCardRange(e.target.value)} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs">
                <option value="today">Today</option>
                <option value="7">7d</option>
                <option value="30">30d</option>
                <option value="90">90d</option>
              </select>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Net Sales</div>
            <ul className="mt-3 text-sm space-y-1 text-gray-700 dark:text-gray-300">
              <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-600" /> Net Cash Sale : {(netAgg.byMethodNet['cash']?.net || 0).toLocaleString()}</li>
              <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-purple-600" /> Net Online Sale : {(netAgg.byMethodNet['online']?.net || netAgg.byMethodNet['card']?.net || 0).toLocaleString()}</li>
              <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-orange-500" /> Returns : {-(netReturnAgg.totalRefund || 0).toLocaleString()}</li>
            </ul>
          </div>
        </ChartCard>
      </div>

      {/* Item-wise and Category-wise tables (hidden per request) */}
      {false && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Item wise sales by value">
          <div className="p-2">
            <div className="mb-2 text-xs text-gray-500 flex items-center justify-between">
              <span>Last {itemNDays} days</span>
              <select value={itemTableRange} onChange={e => setItemTableRange(e.target.value)} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs">
                <option value="7">7d</option>
                <option value="30">30d</option>
                <option value="90">90d</option>
              </select>
            </div>
            <div className="overflow-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-800">
                  <tr>
                    <th className="text-left px-3 py-2">PRODUCT</th>
                    <th className="text-right px-3 py-2">QUANTITY</th>
                    <th className="text-right px-3 py-2">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {itemAgg.map((r) => (
                    <tr key={r.product} className="border-t">
                      <td className="px-3 py-2">{r.product}</td>
                      <td className="px-3 py-2 text-right">{r.quantity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })}</td>
                      <td className="px-3 py-2 text-right">PKR {r.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  {itemAgg.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-500">No data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Category wise sales by value">
          <div className="p-2">
            <div className="mb-2 text-xs text-gray-500 flex items-center justify-between">
              <span>Last {categoryNDays} days</span>
              <select value={categoryTableRange} onChange={e => setCategoryTableRange(e.target.value)} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs">
                <option value="7">7d</option>
                <option value="30">30d</option>
                <option value="90">90d</option>
              </select>
            </div>
            <div className="overflow-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-800">
                  <tr>
                    <th className="text-left px-3 py-2">CATEGORY</th>
                    <th className="text-right px-3 py-2">QUANTITY</th>
                    <th className="text-right px-3 py-2">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryAgg.map((r) => (
                    <tr key={r.category} className="border-t">
                      <td className="px-3 py-2">{r.category}</td>
                      <td className="px-3 py-2 text-right">{r.quantity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })}</td>
                      <td className="px-3 py-2 text-right">PKR {r.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  {categoryAgg.length === 0 && (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-500">No data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </ChartCard>
      </div>
      )}

      {/* Charts at the end with selectors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={`Daily Sales`}>
          <div className="mb-2 flex justify-end">
            <select value={salesChartRange} onChange={e => setSalesChartRange(e.target.value)} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs">
              <option value="7">7d</option>
              <option value="30">30d</option>
              <option value="90">90d</option>
            </select>
          </div>
          <LineChart data={salesSeries}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Expense vs Revenue">
          <div className="mb-2 flex justify-end">
            <select value={expenseChartRange} onChange={e => setExpenseChartRange(e.target.value)} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs">
              <option value="7">7d</option>
              <option value="30">30d</option>
              <option value="90">90d</option>
            </select>
          </div>
          <BarChart data={expenseVsRevenue}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Legend />
            <Tooltip />
            <Bar dataKey="amount" fill="#10b981" />
          </BarChart>
        </ChartCard>
      </div>

    </div>
  )
}
