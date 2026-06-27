import DataTable from '../../components/DataTable.jsx'
import { useData } from '../../state/DataContext.jsx'
import { useMemo, useState } from 'react'

export default function ExpenseHistory() {
  const { state } = useData()
  const [date, setDate] = useState('')
  const [cat, setCat] = useState('')

  const rows = useMemo(() => state.expenses.filter(e => (!date || e.date===date) && (!cat || e.category===cat)), [state.expenses, date, cat])

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Expenses</h1>
      <div className="flex flex-wrap gap-2">
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="px-3 py-2 border rounded" />
        <select value={cat} onChange={e=>setCat(e.target.value)} className="px-3 py-2 border rounded">
          <option value="">All Categories</option>
          {['Utilities','Rent','Wages','Misc'].map(c=> <option key={c}>{c}</option>)}
        </select>
      </div>
      <DataTable columns={[{label:'Date',key:'date'},{label:'Category',key:'category'},{label:'Description',key:'description'},{label:'Amount',key:'amount'}]} data={rows} />
    </div>
  )
}
