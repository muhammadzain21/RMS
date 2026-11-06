import React from 'react'
import DatePicker from '../../../components/DatePicker.jsx'

export default function PosHeader({
  date,
  setDate,
  waiterId,
  setWaiterId,
  staff = [],
  custQuery,
  setCustQuery,
  onOpenAddCustomer,
}) {
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <div className="col-span-3 flex items-center gap-2 text-sm">
        <div className="w-full min-w-0">
          <DatePicker value={date} onChange={v => { if (v) setDate(v) }} allowClear={false} />
        </div>
        <select className="px-3 py-2 border rounded w-full" value={waiterId} onChange={e=>setWaiterId(e.target.value)}>
          <option value="">Waiter: Default</option>
          {(staff||[]).map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
        </select>
      </div>
      <div className="col-span-5">
        <input placeholder="Search Customer" className="px-3 py-2 border rounded w-full" value={custQuery} onChange={e=>setCustQuery(e.target.value)} />
      </div>
      <div className="col-span-4 text-right">
        <button type="button" className="px-4 py-2 bg-sky-500 text-white rounded" onClick={onOpenAddCustomer}>+ Add New Customer</button>
      </div>
    </div>
  )
}
