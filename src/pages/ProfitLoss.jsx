import { useMemo, useState } from 'react'
import { useData } from '../state/DataContext.jsx'
import ChartCard from '../components/ChartCard.jsx'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Tooltip, XAxis, YAxis } from 'recharts'
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

 // Yearly trend data for bar charts (must be after monthlyRows)
 const yearlyTrendData = monthlyRows.map(r => ({ name: r.monthName, profit: r.profit, sales: r.sales, purchases: r.purchases, expenses: r.expenses }))

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
 <div className="space-y-4">
 <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Profit &amp; Loss</h1>
 {/* Charts Row */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
 {/* Yearly Profit Trend */}
 <ChartCard title="Yearly Profit Trend" variant="green">
 <BarChart data={yearlyTrendData}>
 <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
 <XAxis dataKey="name" stroke="#6b7280" />
 <YAxis stroke="#6b7280" />
 <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
 <Legend />
 <Bar dataKey="profit" name="Net Profit" radius={[4,4,0,0]}>
 {yearlyTrendData.map((entry, idx) => (
 <Cell key={idx} fill={entry.profit >= 0 ? '#10b981' : '#ef4444'} />
 ))}
 </Bar>
 </BarChart>
 </ChartCard>
 {/* Sales vs Purchases */}
 <ChartCard title="Sales vs Purchases (Monthly)" variant="blue">
 <BarChart data={yearlyTrendData}>
 <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
 <XAxis dataKey="name" stroke="#6b7280" />
 <YAxis stroke="#6b7280" />
 <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
 <Legend />
 <Bar dataKey="sales" name="Sales" fill="#3b82f6" radius={[4,4,0,0]} />
 <Bar dataKey="purchases" name="Purchases" fill="#f59e0b" radius={[4,4,0,0]} />
 <Bar dataKey="expenses" name="Expenses" fill="#a855f7" radius={[4,4,0,0]} />
 </BarChart>
 </ChartCard>
 </div>
 {/* Monthly P&L Chart */}
 <ChartCard title="Monthly P&L Breakdown" variant="indigo">
 <AreaChart data={chartData}>
 <defs>
 <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
 <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
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
 {/* Yearly View */}
 <div className="p-5 rounded-xl border-2 border-indigo-300 dark:border-indigo-800 bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-950/40 dark:to-gray-900 shadow-sm space-y-4">
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
 <div className="font-bold text-lg text-indigo-900 dark:text-indigo-100">Yearly View</div>
 <div className="flex items-center gap-2">
 <label className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Year</label>
 <select value={year} onChange={e=>setYear(e.target.value)} className="px-3 py-1.5 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500">
 {yearOptions.map(y =><option key={y} value={y}>{y}</option>)}
 </select>
 <button onClick={exportPDF} className="px-4 py-1.5 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-lg text-sm font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Export PDF</button>
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
 <td className="px-4 py-2 text-purple-600 dark:text-purple-400">{r.expenses.toFixed(2)}</td>
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
 <td className="px-4 py-3 text-purple-700 dark:text-purple-300">{yearlyTotals.expenses.toFixed(2)}</td>
 <td className={`px-4 py-3 text-lg ${yearlyTotals.profit>=0?'text-green-700 dark:text-green-300':'text-red-700 dark:text-red-300'}`}>{yearlyTotals.profit.toFixed(2)}</td>
 </tr>
 </tfoot>
 </table>
 </div>
 </div>
 </div>
 )
}
