import { useMemo, useState, useEffect } from 'react'
import { format } from 'date-fns'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'

export default function AdvanceBooking() {
  const { state, dispatch, businessDate } = useData()
  const { user, token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const today = businessDate || format(new Date(), 'yyyy-MM-dd')
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

  const refreshBookings = async () => {
    try {
      const res = await fetch(`${API}/api/advance-bookings`, { headers: { ...authHeaders } })
      if (!res.ok) throw new Error('Failed to load bookings')
      const rows = await res.json()
      const list = (rows || []).map(x => ({ ...x, id: x.id || x._id }))
      dispatch({ type: 'HYDRATE', payload: { advanceBookings: list } })
    } catch {}
  }

  // form
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('')
  const [customer, setCustomer] = useState('')
  const [phone, setPhone] = useState('')
  const [deposit, setDeposit] = useState('')
  const [note, setNote] = useState('')

  // filters
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [statusFilter, setStatusFilter] = useState('') // '', 'Booked', 'Completed', 'Cancelled'
  const [search, setSearch] = useState('')

  // Load bookings on mount
  useEffect(() => { refreshBookings() }, [])

  const rows = useMemo(() => {
    let list = state.advanceBookings || []
    if (from) list = list.filter(r => r.date >= from)
    if (to) list = list.filter(r => r.date <= to)
    if (statusFilter) list = list.filter(r => r.status === statusFilter)
    if (search) {
      const t = search.toLowerCase()
      list = list.filter(r =>
        r.date.includes(search) ||
        (r.time||'').toLowerCase().includes(t) ||
        (r.customer||'').toLowerCase().includes(t) ||
        (r.phone||'').toLowerCase().includes(t) ||
        String(r.deposit).toLowerCase().includes(t) ||
        (r.note||'').toLowerCase().includes(t) ||
        (r.userName||'').toLowerCase().includes(t)
      )
    }

  // Settlement flow: create a sale using deposit as discount, then mark Completed.
  const settleBooking = (b) => {
    const input = prompt(`Enter final bill total for ${b.customer} (deposit PKR ${b.deposit} will be applied):`, '')
    if (input == null) return
    const total = Number(input)
    if (Number.isNaN(total) || total < 0) { toast.error('Enter a valid amount'); return }
    // Create a minimal sale: no items, discount equals deposit, cash payment
    dispatch({ type: 'RECORD_SALE', payload: {
      date: b.date,
      items: [],
      total,
      paymentMethod: 'cash',
      discount: Number(b.deposit || 0),
      soldBy: user?.name,
      customer: b.customer,
    } })
    // We do not have the sale id here; mark as Completed without linking id
    dispatch({ type: 'UPDATE_BOOKING_STATUS', payload: { id: b.id, status: 'Completed' } })
    toast.success('Sale recorded and booking marked Completed.')
  }
    return list
  }, [state.advanceBookings, from, to, statusFilter, search])

  const totalDeposits = useMemo(() => rows.reduce((a,b) => a + Number(b.deposit||0), 0), [rows])

  // reminders: today/tomorrow
  const base = new Date(`${today}T00:00:00`)
  const tomorrow = format(new Date(base.getTime() + 24*60*60*1000), 'yyyy-MM-dd')
  const todaysBookings = useMemo(() => (state.advanceBookings||[]).filter(b => b.date === today), [state.advanceBookings, today])
  const tomorrowsBookings = useMemo(() => (state.advanceBookings||[]).filter(b => b.date === tomorrow), [state.advanceBookings, tomorrow])

  // inline editing state
  const [editId, setEditId] = useState(null)
  const [editData, setEditData] = useState({ date:'', time:'', customer:'', phone:'', deposit:'', note:'' })

  const beginEdit = (b) => {
    setEditId(b.id)
    setEditData({ date: b.date, time: b.time||'', customer: b.customer||'', phone: b.phone||'', deposit: String(b.deposit||''), note: b.note||'' })
  }
  const cancelEdit = () => { setEditId(null) }
  const saveEdit = async () => {
    if (!editData.date || !editData.customer) { toast.error('Date and Customer are required'); return }
    if (editData.phone && !/^\d{10,11}$/.test(editData.phone)) { toast.error('Phone must be 10-11 digits'); return }
    const dep = Number(editData.deposit || 0)
    try {
      const res = await fetch(`${API}/api/advance-bookings/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ ...editData, deposit: dep })
      })
      if (res.status === 409) { toast.error('Date is closed'); return }
      if (!res.ok) throw new Error('Failed to update booking')
      await refreshBookings()
      setEditId(null)
    } catch (e) {
      toast.error('Update failed')
    }
  }

  const onAdd = async (e) => {
    e.preventDefault()
    if (!date || !customer) { toast.error('Date and Customer are required'); return }
    if (phone && !/^\d{10,11}$/.test(phone)) { toast.error('Phone must be 10-11 digits'); return }
    const dep = Number(deposit || 0)
    try {
      const res = await fetch(`${API}/api/advance-bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ date, time, customer, phone, deposit: dep, note, userId: user?.id, userName: user?.name })
      })
      if (res.status === 409) { toast.error('Date is closed'); return }
      if (!res.ok) throw new Error('Failed to add booking')
      await refreshBookings()
      setCustomer('')
      setPhone('')
      setDeposit('')
      setNote('')
    } catch (e) {
      toast.error('Failed to add booking')
    }
  }

  const updateStatus = async (id, status) => {
    try {
      const res = await fetch(`${API}/api/advance-bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ status })
      })
      if (res.status === 409) { toast.error('Date is closed'); return }
      if (!res.ok) throw new Error('Failed to update status')
      await refreshBookings()
    } catch {
      toast.error('Failed to update status')
    }
  }

  const remove = async (id) => {
    const confirmed = await confirm({ title: 'Delete Booking', message: 'Delete this booking?' })
    if (!confirmed) return
    try {
      const res = await fetch(`${API}/api/advance-bookings/${id}`, { method: 'DELETE', headers: { ...authHeaders } })
      if (res.status === 409) { toast.error('Date is closed'); return }
      if (!res.ok) throw new Error('Failed to delete booking')
      await refreshBookings()
    } catch {
      toast.error('Failed to delete booking')
    }
  }

  const exportCSV = () => {
    const headers = ['Date','Time','Customer','Phone','Deposit (PKR)','Status','Note','User','Entry ID']
    const lines = rows.map(r => [r.date, r.time || '', r.customer || '', r.phone || '', r.deposit, r.status, r.note || '', r.userName || '', r.id]
      .map(v => '"' + String(v ?? '').replaceAll('"','""') + '"').join(',')).join('\n')
    const csv = headers.join(',') + '\n' + lines
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `advance_bookings_${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported successfully')
  }

  const exportPDF = () => {
    const doc = new jsPDF('l', 'pt', 'a4')
    doc.setFontSize(16)
    doc.text('Advance Bookings', 40, 32)
    doc.setFontSize(10)
    doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 40, 48)
    const body = rows.map(r => [r.date, r.time || '-', r.customer || '-', r.phone || '-', `PKR ${Number(r.deposit).toLocaleString()}`, r.status, r.note || '-', r.userName || '-', r.id])
    autoTable(doc, {
      head: [['Date','Time','Customer','Phone','Deposit','Status','Note','User','Entry ID']],
      body,
      startY: 60,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      foot: [['Totals', '', '', '', `PKR ${totalDeposits.toLocaleString()}`, '', '', '', '']],
      footStyles: { fillColor: [245,245,245] },
    })
    doc.save(`advance_bookings_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
    toast.success('PDF exported successfully')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="text-3xl">📅</span> Advance Booking
        </h1>
      </div>

      {/* Reminders */}
      {(todaysBookings.length > 0 || tomorrowsBookings.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {todaysBookings.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <span className="text-xl">🔔</span>
                <span className="font-semibold">Today: {todaysBookings.length} booking(s)</span>
              </div>
            </div>
          )}
          {tomorrowsBookings.length > 0 && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
              <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
                <span className="text-xl">📆</span>
                <span className="font-semibold">Tomorrow: {tomorrowsBookings.length} booking(s)</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">New Booking</h2>
        <form onSubmit={onAdd} className="grid grid-cols-1 sm:grid-cols-7 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Customer</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer name" className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="03xx..." className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Deposit</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500 dark:text-gray-400 font-medium">PKR</span>
              <input type="number" value={deposit} onChange={e => setDeposit(e.target.value)} placeholder="0" className="w-full pl-12 pr-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Any note..." className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]">✓ Add Booking</button>
          </div>
        </form>
      </div>

      <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Bookings</h2>
          <div className="ml-auto flex flex-wrap gap-2">
            <button onClick={exportCSV} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 transition-colors font-medium border border-emerald-200 dark:border-emerald-700">📊 CSV</button>
            <button onClick={exportPDF} className="px-3 py-1.5 text-sm rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium border border-red-200 dark:border-red-700">📄 PDF</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500">
              <option value="">All Status</option>
              <option value="Booked">📋 Booked</option>
              <option value="Completed">✅ Completed</option>
              <option value="Cancelled">❌ Cancelled</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Search</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="date, time, customer, phone..." className="px-3 py-2 border rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="overflow-x-auto border-2 border-gray-200 dark:border-gray-700 rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Time</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Customer</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Phone</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Deposit</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Note</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">User</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    {editId === r.id ? (
                      <input type="date" value={editData.date} onChange={e=>setEditData(d=>({...d, date:e.target.value}))} className="px-2 py-1 border rounded w-40 bg-white dark:bg-gray-700" />
                    ) : <span className="font-medium text-gray-900 dark:text-gray-100">{r.date}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {editId === r.id ? (
                      <input type="time" value={editData.time} onChange={e=>setEditData(d=>({...d, time:e.target.value}))} className="px-2 py-1 border rounded w-28 bg-white dark:bg-gray-700" />
                    ) : <span className="text-gray-700 dark:text-gray-300">{r.time || '-'}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {editId === r.id ? (
                      <input value={editData.customer} onChange={e=>setEditData(d=>({...d, customer:e.target.value}))} className="px-2 py-1 border rounded w-40 bg-white dark:bg-gray-700" />
                    ) : <span className="font-medium text-gray-900 dark:text-gray-100">{r.customer || '-'}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {editId === r.id ? (
                      <input value={editData.phone} onChange={e=>setEditData(d=>({...d, phone:e.target.value}))} className="px-2 py-1 border rounded w-36 bg-white dark:bg-gray-700" />
                    ) : <span className="text-gray-600 dark:text-gray-400">{r.phone || '-'}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {editId === r.id ? (
                      <input type="number" value={editData.deposit} onChange={e=>setEditData(d=>({...d, deposit:e.target.value}))} className="px-2 py-1 border rounded w-28 bg-white dark:bg-gray-700" />
                    ) : <span className="font-semibold text-emerald-600 dark:text-emerald-400">PKR {Number(r.deposit).toLocaleString()}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <select value={r.status} onChange={e => updateStatus(r.id, e.target.value)} className="px-2 py-1 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-sm">
                      <option value="Booked">📋 Booked</option>
                      <option value="Completed">✅ Completed</option>
                      <option value="Cancelled">❌ Cancelled</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {editId === r.id ? (
                      <input value={editData.note} onChange={e=>setEditData(d=>({...d, note:e.target.value}))} className="px-2 py-1 border rounded w-48 bg-white dark:bg-gray-700" />
                    ) : (r.note || '-')}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.userName || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {editId === r.id ? (
                        <>
                          <button onClick={saveEdit} className="px-2 py-1 text-xs rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 transition-colors font-medium border border-emerald-200 dark:border-emerald-700">Save</button>
                          <button onClick={cancelEdit} className="px-2 py-1 text-xs rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors font-medium border border-gray-200 dark:border-gray-600">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => beginEdit(r)} className="px-2 py-1 text-xs rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors font-medium border border-blue-200 dark:border-blue-700">Edit</button>
                          <button onClick={() => settleBooking(r)} disabled={r.status !== 'Booked'} className="px-2 py-1 text-xs rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 transition-colors font-medium border border-emerald-200 dark:border-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">Settle</button>
                          <button onClick={() => remove(r.id)} className="px-2 py-1 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium border border-red-200 dark:border-red-700">Delete</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500 dark:text-gray-400">
                    <div className="text-4xl mb-2">📅</div>
                    <div>No bookings found.</div>
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr className="border-t">
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">Total Deposits</td>
                <td className="px-4 py-3" colSpan={3}></td>
                <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">PKR {totalDeposits.toLocaleString()}</td>
                <td className="px-4 py-3" colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  )
}
