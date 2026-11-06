import { TrendingUp } from 'lucide-react'
import { useMyWork, pkr, inRange, StatCard, Panel, Chip, Empty } from './myWorkShared.jsx'

export default function MyEarnings() {
  const { data, from, to } = useMyWork()
  const earnings = inRange(data?.earnings, from, to)
  const income = earnings.filter(r => r.category !== 'Deduction').reduce((x, r) => x + Number(r.amount || 0), 0)
  const deduct = earnings.filter(r => r.category === 'Deduction').reduce((x, r) => x + Number(r.amount || 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-[var(--color-text-primary)]">Earnings</h2>
        <p className="text-sm font-semibold text-[var(--color-text-muted)]">Pay entries · {from} → {to}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Earned" value={pkr(income)} icon={TrendingUp} iconColor="bg-emerald-500" />
        <StatCard title="Deducted" value={pkr(deduct)} icon={TrendingUp} iconColor="bg-rose-500" />
        <StatCard title="Net" value={pkr(income - deduct)} icon={TrendingUp} iconColor="bg-blue-500" />
        <StatCard title="Entries" value={earnings.length} icon={TrendingUp} iconColor="bg-indigo-500" />
      </div>

      <Panel title="Earnings register">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Notes</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {earnings.length === 0 && (
                <tr><td colSpan={4}><Empty text="No earnings entries in this date range" /></td></tr>
              )}
              {earnings.map((r, i) => {
                const isDed = r.category === 'Deduction'
                return (
                  <tr key={i}>
                    <td className="font-semibold">{String(r.date).slice(0, 10)}</td>
                    <td><Chip color={isDed ? 'red' : 'green'}>{r.category || 'Earning'}</Chip></td>
                    <td className="font-medium">{r.notes || '-'}</td>
                    <td className={`text-right font-extrabold ${isDed ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {isDed ? '−' : '+'}{pkr(r.amount)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
