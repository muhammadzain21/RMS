import { useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import {
  CalendarCheck, ShoppingBag, HandCoins, TrendingUp, FileText, ChevronRight,
  Wallet, Clock, UserRound, Percent, AlertCircle, Bike,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from 'recharts'
import { useAuth } from '../../state/AuthContext.jsx'
import { useMyWork, pkr, inRange, monthName, StatCard, Chip } from './myWorkShared.jsx'

const LINKS = [
  { to: '/rider', label: 'Rider delivery', desc: 'Share live GPS on depart', icon: Bike, color: 'bg-rose-500' },
  { to: '/my/attendance', label: 'Attendance', desc: 'Daily check-in history', icon: CalendarCheck, color: 'bg-blue-500' },
  { to: '/my/purchases', label: 'Purchases', desc: 'Orders & dues', icon: ShoppingBag, color: 'bg-violet-500' },
  { to: '/my/advances', label: 'Advances', desc: 'Taken & repaid', icon: HandCoins, color: 'bg-amber-500' },
  { to: '/my/earnings', label: 'Earnings', desc: 'Pay & deductions', icon: TrendingUp, color: 'bg-emerald-500' },
  { to: '/my/salary', label: 'Salary Slips', desc: 'Payroll history', icon: FileText, color: 'bg-indigo-500' },
]

const ATT_COLORS = {
  Present: '#10b981',
  Late: '#f59e0b',
  Absent: '#ef4444',
  Leave: '#3b82f6',
  Other: '#94a3b8',
}

const tipStyle = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  color: '#0f172a',
  fontWeight: 600,
}

function ChartPanel({ title, children, className = '' }) {
  return (
    <div className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm ${className}`}>
      <div className="mb-4 text-sm font-extrabold text-[var(--color-text-primary)]">{title}</div>
      {children}
    </div>
  )
}

export default function MyHome() {
  const { user } = useAuth()
  const { data, month, from, to } = useMyWork()
  const staff = data?.staff || {}
  const allowedPages = Array.isArray(user?.myWorkPages) ? user.myWorkPages : null
  const quickLinks = allowedPages
    ? LINKS.filter(item => allowedPages.includes(item.to))
    : LINKS
  const att = inRange(data?.attendance, from, to)
  const purchases = inRange(data?.purchases, from, to)
  const advances = inRange(data?.advances, from, to)
  const earnings = inRange(data?.earnings, from, to)
  const slips = (data?.slips || []).filter((r) => {
    const p = String(r.period || '').slice(0, 7)
    if (!p) return true
    const start = from ? String(from).slice(0, 7) : ''
    const end = to ? String(to).slice(0, 7) : ''
    if (start && p < start) return false
    if (end && p > end) return false
    return true
  })

  const present = att.filter(r => r.status === 'Present').length
  const late = att.filter(r => r.status === 'Late').length
  const absent = att.filter(r => r.status === 'Absent').length
  const leave = att.filter(r => r.status === 'Leave').length
  const worked = present + late
  const attendanceRate = att.length ? Math.round((worked / att.length) * 100) : 0
  const lateMinutes = att.reduce((a, r) => a + Number(r.lateMinutes || 0), 0)

  const pendPurch = purchases.filter(r => r.status === 'pending').reduce((a, r) => a + Number(r.amount || 0), 0)
  const purchTotal = purchases.reduce((a, r) => a + Number(r.amount || 0), 0)
  const advTaken = advances.filter(r => (r.type || 'issue') === 'issue').reduce((a, r) => a + Number(r.amount || 0), 0)
  const advRepaid = advances.filter(r => (r.type || 'issue') !== 'issue').reduce((a, r) => a + Number(r.amount || 0), 0)
  const advBal = advTaken - advRepaid
  const earned = earnings.filter(r => r.category !== 'Deduction').reduce((x, r) => x + Number(r.amount || 0), 0)
  const deducted = earnings.filter(r => r.category === 'Deduction').reduce((x, r) => x + Number(r.amount || 0), 0)
  const lastSlip = slips[0]

  const attendancePie = useMemo(() => {
    const rows = [
      { name: 'Present', value: present, color: ATT_COLORS.Present },
      { name: 'Late', value: late, color: ATT_COLORS.Late },
      { name: 'Absent', value: absent, color: ATT_COLORS.Absent },
      { name: 'Leave', value: leave, color: ATT_COLORS.Leave },
    ].filter(r => r.value > 0)
    return rows
  }, [present, late, absent, leave])

  const moneyBars = useMemo(() => ([
    { name: 'Earned', amount: earned },
    { name: 'Deducted', amount: deducted },
    { name: 'Advances', amount: advTaken },
    { name: 'Repaid', amount: advRepaid },
    { name: 'Purchases', amount: purchTotal },
  ]), [earned, deducted, advTaken, advRepaid, purchTotal])

  const weeklyTrend = useMemo(() => {
    // Group earnings & purchases into week buckets for the selected month
    const weeks = [
      { name: 'W1', earning: 0, purchase: 0, advance: 0 },
      { name: 'W2', earning: 0, purchase: 0, advance: 0 },
      { name: 'W3', earning: 0, purchase: 0, advance: 0 },
      { name: 'W4', earning: 0, purchase: 0, advance: 0 },
      { name: 'W5', earning: 0, purchase: 0, advance: 0 },
    ]
    const weekOf = (dateStr) => {
      const day = Number(String(dateStr || '').slice(8, 10)) || 1
      return Math.min(4, Math.floor((day - 1) / 7))
    }
    for (const e of earnings) {
      const w = weekOf(e.date)
      if (e.category === 'Deduction') continue
      weeks[w].earning += Number(e.amount || 0)
    }
    for (const p of purchases) {
      weeks[weekOf(p.date)].purchase += Number(p.amount || 0)
    }
    for (const a of advances) {
      if ((a.type || 'issue') !== 'issue') continue
      weeks[weekOf(a.date)].advance += Number(a.amount || 0)
    }
    return weeks.filter(w => w.earning || w.purchase || w.advance)
  }, [earnings, purchases, advances])

  const recentActivity = useMemo(() => {
    const items = []
    for (const r of att.slice(0, 8)) {
      items.push({
        key: `a-${r.date}`,
        date: r.date,
        title: `Attendance · ${r.status || '-'}`,
        detail: [r.checkIn && `In ${r.checkIn}`, r.checkOut && `Out ${r.checkOut}`].filter(Boolean).join(' · ') || '—',
        tone: r.status === 'Present' ? 'green' : r.status === 'Late' ? 'amber' : r.status === 'Leave' ? 'blue' : 'red',
        sort: r.date,
      })
    }
    for (const r of purchases.slice(0, 6)) {
      items.push({
        key: `p-${r.date}-${r.billNo}`,
        date: String(r.date).slice(0, 10),
        title: `Purchase · ${r.billNo || 'Order'}`,
        detail: pkr(r.amount),
        tone: r.status === 'pending' ? 'red' : 'green',
        sort: String(r.date).slice(0, 10),
      })
    }
    for (const r of advances.slice(0, 6)) {
      const issue = (r.type || 'issue') === 'issue'
      items.push({
        key: `adv-${r.date}-${r.amount}`,
        date: String(r.date).slice(0, 10),
        title: issue ? 'Advance taken' : r.type === 'payroll_deduct' ? 'Salary deduction' : 'Repayment',
        detail: pkr(r.amount),
        tone: issue ? 'amber' : 'green',
        sort: String(r.date).slice(0, 10),
      })
    }
    return items.sort((a, b) => String(b.sort).localeCompare(String(a.sort))).slice(0, 10)
  }, [att, purchases, advances])

  return (
    <div className="space-y-6">
      {/* Profile strip */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-500 text-white shadow-md">
            <UserRound className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-extrabold text-[var(--color-text-primary)] truncate">{staff.name || 'Staff'}</div>
            <div className="text-sm font-semibold text-[var(--color-text-muted)]">
              {staff.position || 'Team member'}
              {staff.phone ? ` · ${staff.phone}` : ''}
              {staff.joinDate ? ` · Joined ${String(staff.joinDate).slice(0, 10)}` : ''}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-text-muted)]">Viewing</div>
          <div className="text-sm font-extrabold text-blue-600">{from} → {to}</div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Attendance Rate" value={`${attendanceRate}%`} icon={Percent} iconColor="bg-blue-500" />
        <StatCard title="Days Worked" value={worked} icon={Clock} iconColor="bg-emerald-500" />
        <StatCard title="Net Earnings" value={pkr(earned - deducted)} icon={TrendingUp} iconColor="bg-indigo-500" />
        <StatCard title="Open Dues" value={pkr(advBal + pendPurch)} icon={AlertCircle} iconColor={(advBal + pendPurch) > 0 ? 'bg-rose-500' : 'bg-emerald-500'} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Earned" value={pkr(earned)} icon={TrendingUp} iconColor="bg-emerald-500" />
        <StatCard title="Advance Due" value={pkr(advBal)} icon={HandCoins} iconColor={advBal > 0 ? 'bg-amber-500' : 'bg-emerald-500'} />
        <StatCard title="Purchase Dues" value={pkr(pendPurch)} icon={Wallet} iconColor={pendPurch > 0 ? 'bg-rose-500' : 'bg-emerald-500'} />
        <StatCard title="Late Minutes" value={lateMinutes} icon={Clock} iconColor="bg-orange-500" />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Attendance breakdown">
          <div className="h-[280px]">
            {attendancePie.length === 0 ? (
              <div className="h-full grid place-items-center text-sm font-semibold text-[var(--color-text-muted)]">No attendance data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={attendancePie} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={55} outerRadius={85} paddingAngle={4}>
                    {attendancePie.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tipStyle} formatter={(v, n) => [`${v} day(s)`, n]} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-1 text-center text-sm font-semibold text-[var(--color-text-muted)]">
            {worked} worked · {absent} absent · {leave} leave · {attendanceRate}% rate
          </div>
        </ChartPanel>

        <ChartPanel title="Money snapshot (selected range)">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={moneyBars} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
                <Tooltip contentStyle={tipStyle} formatter={v => [pkr(v), 'Amount']} />
                <Bar dataKey="amount" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Weekly trend">
          <div className="h-[260px]">
            {weeklyTrend.length === 0 ? (
              <div className="h-full grid place-items-center text-sm font-semibold text-[var(--color-text-muted)]">No weekly activity yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mwEarn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="mwPurch" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
                  <Tooltip contentStyle={tipStyle} formatter={v => pkr(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="earning" name="Earning" stroke="#10b981" strokeWidth={2.5} fill="url(#mwEarn)" />
                  <Area type="monotone" dataKey="purchase" name="Purchase" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#mwPurch)" />
                  <Area type="monotone" dataKey="advance" name="Advance" stroke="#f59e0b" strokeWidth={2} fillOpacity={0} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartPanel>

        <ChartPanel title="Latest salary slip">
          {!lastSlip ? (
            <div className="h-[260px] grid place-items-center text-sm font-semibold text-[var(--color-text-muted)]">No salary slips yet</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-wider text-[var(--color-text-muted)]">Period</div>
                  <div className="text-lg font-extrabold text-[var(--color-text-primary)]">{monthName(lastSlip.period || month)}</div>
                </div>
                <Chip color={lastSlip.status === 'paid' ? 'green' : 'slate'}>{lastSlip.status || '-'}</Chip>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Gross</div>
                  <div className="text-xl font-extrabold mt-1">{pkr(lastSlip.grossPay)}</div>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Net pay</div>
                  <div className="text-xl font-extrabold mt-1 text-blue-600">{pkr(lastSlip.netPay)}</div>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Advance deduct</div>
                  <div className="text-lg font-extrabold mt-1">{pkr(lastSlip.advanceDeducted || 0)}</div>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Purchase deduct</div>
                  <div className="text-lg font-extrabold mt-1">{pkr(lastSlip.purchaseDeducted || 0)}</div>
                </div>
              </div>
              <NavLink to="/my/salary" className="inline-flex items-center gap-1 text-sm font-extrabold text-blue-600 hover:underline">
                View all slips <ChevronRight size={16} />
              </NavLink>
            </div>
          )}
        </ChartPanel>
      </div>

      {/* Recent activity + quick access */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Recent activity">
          {recentActivity.length === 0 ? (
            <div className="py-10 text-center text-sm font-semibold text-[var(--color-text-muted)]">No recent activity</div>
          ) : (
            <div className="divide-y divide-[var(--color-border-subtle)] max-h-[340px] overflow-auto">
              {recentActivity.map(item => (
                <div key={item.key} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-[var(--color-text-primary)] truncate">{item.title}</div>
                    <div className="text-xs font-semibold text-[var(--color-text-muted)] mt-0.5">{item.date} · {item.detail}</div>
                  </div>
                  <Chip color={item.tone}>{item.tone === 'green' ? 'OK' : item.tone === 'amber' ? 'Note' : item.tone === 'red' ? 'Due' : 'Info'}</Chip>
                </div>
              ))}
            </div>
          )}
        </ChartPanel>

        <div className="space-y-3">
          <h2 className="text-lg font-extrabold text-[var(--color-text-primary)]">Quick access</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {quickLinks.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-blue-300 transition-all"
              >
                <div className={`grid h-10 w-10 place-items-center rounded-xl text-white shadow-md ${item.color}`}>
                  <item.icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold text-[var(--color-text-primary)]">{item.label}</div>
                  <div className="text-xs font-semibold text-[var(--color-text-muted)]">{item.desc}</div>
                </div>
                <ChevronRight size={16} className="text-slate-400" />
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
