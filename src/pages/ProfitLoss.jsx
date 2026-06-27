import { useMemo, useState } from 'react'
import { useData } from '../state/DataContext.jsx'
import ChartCard from '../components/ChartCard.jsx'
import { Area, AreaChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts'
import { format } from 'date-fns'

export default function ProfitLoss() {
  const { state, businessDate } = useData()
  const realToday = format(new Date(), 'yyyy-MM-dd')
  // Use businessDate from context as the primary date reference
  const todayKey = businessDate || realToday

  const [month, setMonth] = useState(todayKey.slice(0,7) || format(new Date(), 'yyyy-MM'))
  const [year, setYear] = useState((todayKey ? todayKey.slice(0,4) : String(new Date().getFullYear())))

  const monthly = useMemo(() => {
    const sales = state.sales.filter(s => s.date?.startsWith(month)).reduce((a,b)=>a+Number(b.total||0),0)
    const returns = (state.returns || []).filter(r => r.date?.startsWith(month)).reduce((a,b)=>a+Number(b.refund||0),0)
    const discount = (state.sales||[]).filter(s => s.date?.startsWith(month)).reduce((a,b)=>a+Number(b.itemsDiscount||0)+Number(b.billDiscount||b.discount||0),0)
    const complimentary = (state.sales||[]).filter(s => s.date?.startsWith(month) && s.paymentMethod === 'complimentary').reduce((a,b)=>a+Number(b.total||0),0)
    const purchases = state.supplies.filter(s => s.date?.startsWith(month)).reduce((a,b)=>a+Number(b.cost||0),0)
    const expenses = state.expenses.filter(e => e.date?.startsWith(month)).reduce((a,b)=>a+Number(b.amount||0),0)
    const profit = Math.max(0, sales - returns - complimentary) - (purchases + expenses)
    return { sales, returns, discount, complimentary, purchases, expenses, profit }
  }, [state, month])

  const todays = useMemo(() => {
    const sales = state.sales.filter(s => s.date === todayKey).reduce((a,b)=>a+Number(b.total||0),0)
    const returns = (state.returns || []).filter(r => r.date === todayKey).reduce((a,b)=>a+Number(b.refund||0),0)
    const discount = (state.sales||[]).filter(s => s.date === todayKey).reduce((a,b)=>a+Number(b.itemsDiscount||0)+Number(b.billDiscount||b.discount||0),0)
    const complimentary = (state.sales||[]).filter(s => s.date === todayKey && s.paymentMethod === 'complimentary').reduce((a,b)=>a+Number(b.total||0),0)
    const purchases = state.supplies.filter(s => s.date === todayKey).reduce((a,b)=>a+Number(b.cost||0),0)
    const expenses = state.expenses.filter(e => e.date === todayKey).reduce((a,b)=>a+Number(b.amount||0),0)
    const profit = Math.max(0, sales - returns - complimentary) - (purchases + expenses)
    return { sales, returns, discount, complimentary, purchases, expenses, profit }
  }, [state, todayKey])

  const chartData = [
    { name:'Sales', value: monthly.sales },
    { name:'Returns', value: monthly.returns },
    { name:'Expenses', value: monthly.expenses },
    { name:'Purchases', value: monthly.purchases },
    { name:'Profit', value: monthly.profit },
  ]

  // Build list of available years from data (fallback to current year)
  const yearOptions = useMemo(() => {
    const dates = [
      ...(state.sales||[]).map(s=>s.date),
      ...((state.returns||[]).map(r=>r.date) || []),
      ...(state.supplies||[]).map(s=>s.date),
      ...(state.expenses||[]).map(e=>e.date),
    ].filter(Boolean)
    const years = new Set(dates.map(d => String(d).slice(0,4)))
    if (years.size===0) years.add(String(new Date().getFullYear()))
    return Array.from(years).sort()
  }, [state])

  // Month-by-month P&L for selected year
  const monthlyRows = useMemo(() => {
    const y = Number(year)
    const rows = Array.from({ length: 12 }, (_, i) => {
      const mk = `${year}-${String(i+1).padStart(2,'0')}`
      const mName = format(new Date(y, i, 1), 'MMM')
      const sales = (state.sales||[]).filter(s => s.date?.startsWith(mk)).reduce((a,b)=>a+Number(b.total||0),0)
      const returns = (state.returns||[]).filter(r => r.date?.startsWith(mk)).reduce((a,b)=>a+Number(b.refund||0),0)
      const complimentary = (state.sales||[]).filter(s => s.date?.startsWith(mk) && s.paymentMethod === 'complimentary').reduce((a,b)=>a+Number(b.total||0),0)
      const discount = (state.sales||[]).filter(s => s.date?.startsWith(mk)).reduce((a,b)=>a+Number(b.itemsDiscount||0)+Number(b.billDiscount||b.discount||0),0)
      const purchases = (state.supplies||[]).filter(s => s.date?.startsWith(mk)).reduce((a,b)=>a+Number(b.cost||0),0)
      const expenses = (state.expenses||[]).filter(e => e.date?.startsWith(mk)).reduce((a,b)=>a+Number(b.amount||0),0)
      const profit = Math.max(0, sales - returns - complimentary) - (purchases + expenses)
      return { monthKey: mk, monthName: mName, sales, returns, discount, complimentary, purchases, expenses, profit }
    })
    return rows
  }, [state, year])

  // month-wise trend removed per request

  const yearlyTotals = useMemo(() => {
    return monthlyRows.reduce((acc, r) => ({
      sales: acc.sales + r.sales,
      returns: acc.returns + r.returns,
      discount: acc.discount + r.discount,
      complimentary: acc.complimentary + r.complimentary,
      purchases: acc.purchases + r.purchases,
      expenses: acc.expenses + r.expenses,
      profit: acc.profit + r.profit,
    }), { sales:0, returns:0, discount:0, complimentary:0, purchases:0, expenses:0, profit:0 })
  }, [monthlyRows])

  const exportPDF = () => {
    window.print()
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
        <span className="text-3xl">📊</span> Profit & Loss
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="p-5 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/30 dark:to-gray-900 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">📅</span>
            <div className="font-bold text-lg text-emerald-900 dark:text-emerald-100">Today's Summary ({todayKey})</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
            <SummaryCard title="Sales" value={todays.sales} variant="emerald" icon="💰" />
            <SummaryCard title="Returns" value={todays.returns} variant="orange" icon="↩️" />
            <SummaryCard title="Discount" value={todays.discount} variant="amber" icon="🏷️" />
            <SummaryCard title="Personal" value={todays.complimentary} variant="rose" icon="🏠" />
            <SummaryCard title="Purchases" value={todays.purchases} variant="amber" icon="🛒" />
            <SummaryCard title="Expenses" value={todays.expenses} variant="rose" icon="💸" />
            <SummaryCard title="Net Profit" value={todays.profit} variant={todays.profit >= 0 ? 'green' : 'red'} icon={todays.profit >= 0 ? '📈' : '📉'} />
          </div>
        </div>
        <div className="p-5 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50/80 to-white dark:from-blue-950/30 dark:to-gray-900 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📆</span>
              <div className="font-bold text-lg text-blue-900 dark:text-blue-100">This Month Summary</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Month</span>
              <input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="px-3 py-1.5 border-2 border-blue-200 dark:border-blue-700 rounded-lg text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
            <SummaryCard title="Sales" value={monthly.sales} variant="emerald" icon="💰" />
            <SummaryCard title="Returns" value={monthly.returns} variant="orange" icon="↩️" />
            <SummaryCard title="Discount" value={monthly.discount} variant="amber" icon="🏷️" />
            <SummaryCard title="Personal" value={monthly.complimentary} variant="rose" icon="🏠" />
            <SummaryCard title="Purchases" value={monthly.purchases} variant="amber" icon="🛒" />
            <SummaryCard title="Expenses" value={monthly.expenses} variant="rose" icon="💸" />
            <SummaryCard title="Net Profit" value={monthly.profit} variant={monthly.profit >= 0 ? 'green' : 'red'} icon={monthly.profit >= 0 ? '📈' : '📉'} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="📈 Monthly P&L Breakdown" variant="indigo">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" stroke="#6b7280" />
            <YAxis stroke="#6b7280" />
            <Legend />
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
            <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} fill="url(#colorValue)" />
          </AreaChart>
        </ChartCard>
        <div className="p-5 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50/80 to-white dark:from-purple-950/30 dark:to-gray-900 shadow-sm space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">🧮</span>
            <div className="font-bold text-lg text-purple-900 dark:text-purple-100">Quick Totals</div>
          </div>
          <div className="p-3 rounded-lg bg-white/60 dark:bg-gray-800/60 border border-purple-100 dark:border-purple-800/50 flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2">💰 Sales (Month)</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{monthly.sales.toFixed(2)}</span>
          </div>
          <div className="p-3 rounded-lg bg-white/60 dark:bg-gray-800/60 border border-orange-100 dark:border-orange-800/50 flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2">↩️ Returns (Month)</span>
            <span className="font-bold text-orange-600 dark:text-orange-400">{monthly.returns.toFixed(2)}</span>
          </div>
          <div className="p-3 rounded-lg bg-white/60 dark:bg-gray-800/60 border border-amber-100 dark:border-amber-800/50 flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2">🏷️ Discount (Month)</span>
            <span className="font-bold text-amber-600 dark:text-amber-400">{monthly.discount.toFixed(2)}</span>
          </div>
          <div className="p-3 rounded-lg bg-white/60 dark:bg-gray-800/60 border border-rose-100 dark:border-rose-800/50 flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2">🏠 Personal (Month)</span>
            <span className="font-bold text-rose-600 dark:text-rose-400">{monthly.complimentary.toFixed(2)}</span>
          </div>
          <div className="p-3 rounded-lg bg-white/60 dark:bg-gray-800/60 border border-purple-100 dark:border-purple-800/50 flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2">🛒 Purchases (Month)</span>
            <span className="font-bold text-amber-600 dark:text-amber-400">{monthly.purchases.toFixed(2)}</span>
          </div>
          <div className="p-3 rounded-lg bg-white/60 dark:bg-gray-800/60 border border-purple-100 dark:border-purple-800/50 flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2">💸 Expenses (Month)</span>
            <span className="font-bold text-rose-600 dark:text-rose-400">{monthly.expenses.toFixed(2)}</span>
          </div>
          <div className="p-3 rounded-lg bg-gradient-to-r from-purple-100 to-purple-50 dark:from-purple-900/40 dark:to-purple-800/30 border-2 border-purple-300 dark:border-purple-700 flex justify-between items-center">
            <span className="font-bold text-purple-900 dark:text-purple-100 flex items-center gap-2">📊 Net Profit (Month)</span>
            <span className={`font-bold text-lg ${monthly.profit>=0?'text-emerald-600 dark:text-emerald-400':'text-red-600 dark:text-red-400'}`}>{monthly.profit.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="p-5 rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50/60 to-white dark:from-indigo-950/30 dark:to-gray-900 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📅</span>
            <div className="font-bold text-lg text-indigo-900 dark:text-indigo-100">Yearly View</div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Year</label>
            <select value={year} onChange={e=>setYear(e.target.value)} className="px-3 py-1.5 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500">
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={exportPDF} className="px-4 py-1.5 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-lg text-sm font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">📄 Export PDF</button>
          </div>
        </div>
        <div className="overflow-auto rounded-xl border border-indigo-200 dark:border-indigo-800">
          <table className="min-w-full text-sm">
            <thead className="bg-gradient-to-r from-indigo-100 to-indigo-50 dark:from-indigo-900/60 dark:to-indigo-950/40">
              <tr>
                {['Month','Sales','Returns','Discount','Personal','Purchases','Expenses','Net Profit'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-bold text-indigo-900 dark:text-indigo-100">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white/60 dark:bg-gray-900/60">
              {monthlyRows.map((r, idx) => (
                <tr key={r.monthKey} className={`border-t border-indigo-100 dark:border-indigo-800/50 ${idx % 2 === 0 ? 'bg-white/40 dark:bg-gray-800/20' : ''}`}>
                  <td className="px-4 py-2 font-medium text-indigo-700 dark:text-indigo-300">{r.monthName}</td>
                  <td className="px-4 py-2 text-emerald-600 dark:text-emerald-400">{r.sales.toFixed(2)}</td>
                  <td className="px-4 py-2 text-orange-600 dark:text-orange-400">{r.returns.toFixed(2)}</td>
                  <td className="px-4 py-2 text-amber-600 dark:text-amber-400">{r.discount.toFixed(2)}</td>
                  <td className="px-4 py-2 text-rose-600 dark:text-rose-400">{r.complimentary.toFixed(2)}</td>
                  <td className="px-4 py-2 text-amber-600 dark:text-amber-400">{r.purchases.toFixed(2)}</td>
                  <td className="px-4 py-2 text-rose-600 dark:text-rose-400">{r.expenses.toFixed(2)}</td>
                  <td className={`px-4 py-2 font-bold ${r.profit>=0?'text-green-600 dark:text-green-400':'text-red-600 dark:text-red-400'}`}>{r.profit.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gradient-to-r from-indigo-100 to-indigo-50 dark:from-indigo-900/60 dark:to-indigo-950/40">
              <tr className="border-t-2 border-indigo-300 dark:border-indigo-700 font-bold">
                <td className="px-4 py-3 text-indigo-900 dark:text-indigo-100">Total {year}</td>
                <td className="px-4 py-3 text-emerald-700 dark:text-emerald-300">{yearlyTotals.sales.toFixed(2)}</td>
                <td className="px-4 py-3 text-orange-700 dark:text-orange-300">{yearlyTotals.returns.toFixed(2)}</td>
                <td className="px-4 py-3 text-amber-700 dark:text-amber-300">{yearlyTotals.discount.toFixed(2)}</td>
                <td className="px-4 py-3 text-rose-700 dark:text-rose-300">{yearlyTotals.complimentary.toFixed(2)}</td>
                <td className="px-4 py-3 text-amber-700 dark:text-amber-300">{yearlyTotals.purchases.toFixed(2)}</td>
                <td className="px-4 py-3 text-rose-700 dark:text-rose-300">{yearlyTotals.expenses.toFixed(2)}</td>
                <td className={`px-4 py-3 text-lg ${yearlyTotals.profit>=0?'text-green-700 dark:text-green-300':'text-red-700 dark:text-red-300'}`}>{yearlyTotals.profit.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Month-wise trend chart removed */}
    </div>
  )
}

function SummaryCard({ title, value, variant = 'slate', icon = '' }) {
  const variants = {
    emerald: { bg: 'bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/30 dark:to-gray-900 border-emerald-200 dark:border-emerald-800', value: 'text-emerald-600 dark:text-emerald-400' },
    amber: { bg: 'bg-gradient-to-br from-amber-50 to-white dark:from-amber-900/30 dark:to-gray-900 border-amber-200 dark:border-amber-800', value: 'text-amber-600 dark:text-amber-400' },
    orange: { bg: 'bg-gradient-to-br from-orange-50 to-white dark:from-orange-900/30 dark:to-gray-900 border-orange-200 dark:border-orange-800', value: 'text-orange-600 dark:text-orange-400' },
    rose: { bg: 'bg-gradient-to-br from-rose-50 to-white dark:from-rose-900/30 dark:to-gray-900 border-rose-200 dark:border-rose-800', value: 'text-rose-600 dark:text-rose-400' },
    green: { bg: 'bg-gradient-to-br from-green-50 to-white dark:from-green-900/30 dark:to-gray-900 border-green-200 dark:border-green-800', value: 'text-green-600 dark:text-green-400' },
    red: { bg: 'bg-gradient-to-br from-red-50 to-white dark:from-red-900/30 dark:to-gray-900 border-red-200 dark:border-red-800', value: 'text-red-600 dark:text-red-400' },
    slate: { bg: 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700', value: 'text-gray-600 dark:text-gray-400' },
  }
  const v = variants[variant] || variants.slate
  return (
    <div className={`p-3 rounded-xl border shadow-sm ${v.bg}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{icon} {title}</div>
      <div className={`text-lg font-bold ${v.value}`}>{value.toFixed(2)}</div>
    </div>
  )
}
