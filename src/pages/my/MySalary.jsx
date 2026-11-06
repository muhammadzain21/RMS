import { FileText } from 'lucide-react'
import { useMyWork, pkr, monthName, StatCard, Panel, Chip, Empty } from './myWorkShared.jsx'

export default function MySalary() {
  const { data, month, from, to } = useMyWork()
  const slips = (data?.slips || []).filter((r) => {
    const p = String(r.period || '').slice(0, 7)
    if (!p) return true
    const start = from ? String(from).slice(0, 7) : ''
    const end = to ? String(to).slice(0, 7) : ''
    if (start && p < start) return false
    if (end && p > end) return false
    return true
  })
  const paid = slips.filter(r => r.status === 'paid').length
  const netTotal = slips.reduce((a, r) => a + Number(r.netPay || 0), 0)
  const grossTotal = slips.reduce((a, r) => a + Number(r.grossPay || 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-[var(--color-text-primary)]">Salary Slips</h2>
        <p className="text-sm font-semibold text-[var(--color-text-muted)]">Payroll history · {from?.slice(0, 7) || month} → {to?.slice(0, 7) || month}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Slips" value={slips.length} icon={FileText} iconColor="bg-indigo-500" />
        <StatCard title="Paid" value={paid} icon={FileText} iconColor="bg-emerald-500" />
        <StatCard title="Gross Total" value={pkr(grossTotal)} icon={FileText} iconColor="bg-blue-500" />
        <StatCard title="Net Total" value={pkr(netTotal)} icon={FileText} iconColor="bg-violet-500" />
      </div>

      <Panel title="Salary slip history">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Period</th>
                <th>Status</th>
                <th className="text-right">Gross</th>
                <th className="text-right">Advance Deduct</th>
                <th className="text-right">Purchase Deduct</th>
                <th className="text-right">Net Pay</th>
              </tr>
            </thead>
            <tbody>
              {slips.length === 0 && (
                <tr><td colSpan={6}><Empty text="No salary slips yet" /></td></tr>
              )}
              {slips.map((r, i) => (
                <tr key={i}>
                  <td className="font-semibold">{monthName(r.period || month)}</td>
                  <td><Chip color={r.status === 'paid' ? 'green' : 'slate'}>{r.status || '-'}</Chip></td>
                  <td className="text-right font-semibold">{pkr(r.grossPay)}</td>
                  <td className="text-right font-medium">{pkr(r.advanceDeducted || 0)}</td>
                  <td className="text-right font-medium">{pkr(r.purchaseDeducted || 0)}</td>
                  <td className="text-right font-extrabold text-blue-600">{pkr(r.netPay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
