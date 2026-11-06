import { HandCoins } from 'lucide-react'
import { useMyWork, pkr, inRange, StatCard, Panel, Chip, Empty } from './myWorkShared.jsx'

export default function MyAdvances() {
  const { data, from, to } = useMyWork()
  const advances = inRange(data?.advances, from, to)
  const bal = advances.reduce((x, r) => x + ((r.type || 'issue') === 'issue' ? 1 : -1) * Number(r.amount || 0), 0)
  const taken = advances.filter(r => (r.type || 'issue') === 'issue')
  const repaid = advances.filter(r => (r.type || 'issue') !== 'issue')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-[var(--color-text-primary)]">Advances</h2>
        <p className="text-sm font-semibold text-[var(--color-text-muted)]">Cash advances · {from} → {to}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Balance Due" value={pkr(bal)} icon={HandCoins} iconColor={bal > 0 ? 'bg-rose-500' : 'bg-emerald-500'} />
        <StatCard title="Taken" value={taken.length} icon={HandCoins} iconColor="bg-amber-500" />
        <StatCard title="Repaid / Deducted" value={repaid.length} icon={HandCoins} iconColor="bg-blue-500" />
        <StatCard title="Entries" value={advances.length} icon={HandCoins} iconColor="bg-indigo-500" />
      </div>

      <Panel title="Advance ledger">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Notes</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {advances.length === 0 && (
                <tr><td colSpan={4}><Empty text="No advances in this date range" /></td></tr>
              )}
              {advances.map((r, i) => {
                const issue = (r.type || 'issue') === 'issue'
                const label = issue ? 'Advance taken' : r.type === 'payroll_deduct' ? 'Salary deduction' : 'Repayment'
                return (
                  <tr key={i}>
                    <td className="font-semibold">{String(r.date).slice(0, 10)}</td>
                    <td><Chip color={issue ? 'amber' : 'green'}>{label}</Chip></td>
                    <td className="font-medium">{r.notes || '-'}</td>
                    <td className={`text-right font-extrabold ${issue ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {issue ? '+' : '−'}{pkr(r.amount)}
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
