import { format } from 'date-fns'
import { useMemo } from 'react'
import { useData } from '../../state/DataContext.jsx'

export default function SalesSummary() {
  const { state, businessDate } = useData()
  const today = businessDate || format(new Date(), 'yyyy-MM-dd')
  const monthKey = format(new Date(), 'yyyy-MM')

  const daily = useMemo(() => state.sales.filter(s => s.date === today).reduce((a,b)=>a+b.total,0), [state.sales, today])
  const monthly = useMemo(() => state.sales.filter(s => s.date?.startsWith(monthKey)).reduce((a,b)=>a+b.total,0), [state.sales, monthKey])

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Sales Summary</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-4 border rounded">Today's Sales: ${daily.toFixed(2)}</div>
        <div className="p-4 border rounded">Monthly Sales: ${monthly.toFixed(2)}</div>
      </div>
    </div>
  )
}
