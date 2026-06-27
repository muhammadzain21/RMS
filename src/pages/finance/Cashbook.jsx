import { useMemo, useState } from 'react'
import { useData } from '../../state/DataContext.jsx'

export default function Cashbook() {
  const { state } = useData()
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7))
  const returns = useMemo(() => (state.returns || []).filter(r => r.date?.startsWith(month)), [state.returns, month])

  const byMethod = useMemo(() => {
    const map = {}
    for (const r of returns) {
      const m = r.paymentMethod || 'cash'
      map[m] = (map[m] || 0) + Number(r.refund || 0)
    }
    return map
  }, [returns])
  const methods = Object.keys(byMethod)
  const totalRefunds = methods.reduce((a,m)=>a+byMethod[m],0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Cashbook (Returns by Payment Method)</h1>
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="px-3 py-2 border rounded" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {methods.map(m => (
          <div key={m} className="p-4 rounded border bg-white dark:bg-gray-900">
            <div className="text-sm text-gray-600">{m.toUpperCase()}</div>
            <div className="text-xl font-semibold">PKR {byMethod[m].toLocaleString()}</div>
          </div>
        ))}
        <div className="p-4 rounded border bg-white dark:bg-gray-900">
          <div className="text-sm text-gray-600">TOTAL REFUNDS</div>
          <div className="text-xl font-semibold">PKR {totalRefunds.toLocaleString()}</div>
        </div>
      </div>

      <div className="p-4 rounded border bg-white dark:bg-gray-900">
        <div className="font-medium mb-2">Return Entries</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800">
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Sale Ref</th>
                <th className="text-left p-2">Customer</th>
                <th className="text-left p-2">Payment</th>
                <th className="text-right p-2">Refund</th>
                <th className="text-left p-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {returns.map(r => {
                const sale = state.sales.find(s => s.id===r.saleId)
                const saleRef = r.saleId ? (sale?.billNo ? `BILL-${sale.billNo}` : r.saleId.slice(0,6)) : '-'
                return (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{r.date}</td>
                    <td className="p-2">{saleRef}</td>
                    <td className="p-2">{r.customer || '-'}</td>
                    <td className="p-2">{r.paymentMethod || 'cash'}</td>
                    <td className="p-2 text-right">PKR {Number(r.refund||0).toLocaleString()}</td>
                    <td className="p-2">{r.reason || '-'}</td>
                  </tr>
                )
              })}
              {returns.length===0 && (
                <tr><td colSpan={6} className="p-4 text-center text-gray-500">No returns in this month.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
