import { ShoppingBag } from 'lucide-react'
import { useMyWork, pkr, inRange, StatCard, Panel, Chip, Empty } from './myWorkShared.jsx'

export default function MyPurchases() {
  const { data, from, to } = useMyWork()
  const purchases = inRange(data?.purchases, from, to)
  const pending = purchases.filter(r => r.status === 'pending')
  const pendTotal = pending.reduce((x, r) => x + Number(r.amount || 0), 0)
  const settled = purchases.filter(r => r.status !== 'pending').length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-[var(--color-text-primary)]">Purchases</h2>
        <p className="text-sm font-semibold text-[var(--color-text-muted)]">Staff meals & orders · {from} → {to}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Orders" value={purchases.length} icon={ShoppingBag} iconColor="bg-violet-500" />
        <StatCard title="Pending" value={pending.length} icon={ShoppingBag} iconColor="bg-rose-500" />
        <StatCard title="To Deduct" value={pkr(pendTotal)} icon={ShoppingBag} iconColor="bg-amber-500" />
        <StatCard title="Settled" value={settled} icon={ShoppingBag} iconColor="bg-emerald-500" />
      </div>

      <Panel title="Purchase history">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Bill No</th>
                <th>Status</th>
                <th>Settlement</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {purchases.length === 0 && (
                <tr><td colSpan={5}><Empty text="No staff purchases in this date range" /></td></tr>
              )}
              {purchases.map((r, i) => (
                <tr key={i}>
                  <td className="font-semibold">{String(r.date).slice(0, 10)}</td>
                  <td className="font-medium">{r.billNo || '-'}</td>
                  <td>
                    <Chip color={r.status === 'pending' ? 'red' : 'green'}>
                      {r.status === 'pending' ? 'Unpaid' : 'Paid'}
                    </Chip>
                  </td>
                  <td className="font-medium">
                    {r.status === 'pending' ? '—' : r.settledVia === 'salary' ? 'Salary deduct' : 'Paid'}
                  </td>
                  <td className="text-right font-extrabold">{pkr(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
