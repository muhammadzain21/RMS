import DataTable from '../../components/DataTable.jsx'
import { useData } from '../../state/DataContext.jsx'
import { useMemo, useState } from 'react'
import DatePicker from '../../components/DatePicker.jsx'

export default function ExpenseHistory() {
  const { state, businessDate } = useData()
  const [date, setDate] = useState(businessDate || '')
  const [cat, setCat] = useState('')

  const rows = useMemo(() => state.expenses.filter(e => (!date || e.date===date) && (!cat || e.category===cat)), [state.expenses, date, cat])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Expenses</h1>
      <div className="flex flex-row flex-nowrap items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-2 border-indigo-200 dark:border-indigo-800">
        <div className="flex-shrink-0">
          <DatePicker label="Date" value={date} onChange={v=>setDate(v)} />
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Category</label>
          <select value={cat} onChange={e=>setCat(e.target.value)} className="px-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all">
            <option value="">All Categories</option>
            {['Utilities','Rent','Wages','Misc'].map(c=> <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <DataTable columns={[{label:'Date',key:'date'},{label:'Category',key:'category'},{label:'Description',key:'description'},{label:'Amount',key:'amount'}]} data={rows} />
    </div>
  )
}
