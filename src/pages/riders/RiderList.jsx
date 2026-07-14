import DataTable from '../../components/DataTable.jsx'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'

export default function RiderList() {
  const { state } = useData()
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const riders = (state.staff || []).filter(s => String(s.position||'').toLowerCase().includes('rider') && (s.status||'Active') === 'Active')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [rollup, setRollup] = useState([])

  const today = new Date().toLocaleDateString('en-CA')
  const [date, setDate] = useState(today)
  const [filterRider, setFilterRider] = useState('')
  const [form, setForm] = useState({ riderId:'', deliveries:0, amount:0, method:'COD', note:'' })

  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

  // compute totals for current records
  const totals = useMemo(() => {
    const deliveries = (records||[]).reduce((acc, r) => acc + Number(r.deliveries||0), 0)
    const amount = (records||[]).reduce((acc, r) => acc + Number(r.amount||0), 0)
    return { deliveries, amount }
  }, [records])

  useEffect(() => {
    // default rider selection
    if (!form.riderId && riders.length > 0) setForm(f => ({ ...f, riderId: riders[0].id }))
  }, [riders])

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token])

  const load = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ date })
      if (filterRider) params.set('riderId', filterRider)
      const res = await fetch(`${API}/api/rider-cash?${params.toString()}`, { headers })
      const rows = await res.json()
      setRecords(rows.map(r => ({ ...r, id: r._id || r.id })))
    } catch {
      toast.error('Failed to load records')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [date, filterRider])

  const loadRollup = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ date })
      const res = await fetch(`${API}/api/rider-cash/rollup?${params.toString()}`, { headers })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setRollup(data)
    } catch {
      toast.error('Failed to load rollup')
    } finally {
      setLoading(false)
    }
  }

  const settleRider = async (riderId) => {
    try {
      setLoading(true)
      const res = await fetch(`${API}/api/rider-cash/settle`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ date, riderId })
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Marked settled')
      await load()
      await loadRollup()
    } catch {
      toast.error('Failed to settle')
    } finally {
      setLoading(false)
    }
  }

  const exportCsv = () => {
    const params = new URLSearchParams({ date })
    // Use token if present by opening in new window with Authorization not possible; fallback to fetch+blob
    if (!token) {
      window.open(`${API}/api/rider-cash/export?${params.toString()}`, '_blank')
      return
    }
    fetch(`${API}/api/rider-cash/export?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `rider_cash_${date}.csv`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      })
      .catch(() => toast.error('Export failed'))
  }

  const onAdd = async (e) => {
    e.preventDefault()
    if (!form.riderId) { toast.error('Select a rider'); return }
    try {
      setLoading(true)
      const r = riders.find(x=>x.id===form.riderId)
      const payload = { ...form, date, deliveries:Number(form.deliveries||0), amount:Number(form.amount||0), riderName: r?.name || '' }
      const res = await fetch(`${API}/api/rider-cash`, { method:'POST', headers, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error('Failed')
      toast.success('Record added')
      setForm(f => ({ ...f, deliveries:0, amount:0, note:'' }))
      await load()
    } catch {
      toast.error('Failed to add record')
    } finally {
      setLoading(false)
    }
  }

  const onDelete = async (id) => {
    const confirmed = await confirm({ title: 'Delete Record', message: 'Delete this record?' })
    if (!confirmed) return
    try {
      setLoading(true)
      const res = await fetch(`${API}/api/rider-cash/${id}`, { method:'DELETE', headers })
      if (!res.ok) throw new Error('Failed')
      toast.success('Record deleted')
      await load()
    } catch {
      toast.error('Failed to delete record')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 w-full">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
        <span className="text-3xl">🏍️</span> Rider Cash Records
      </h1>

      <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/30 dark:to-blue-950/30 border-2 border-cyan-200 dark:border-cyan-800">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-bold text-cyan-700 dark:text-cyan-300 mb-1">Date</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="px-3 py-2 border-2 border-cyan-200 dark:border-cyan-700 rounded-lg bg-white dark:bg-gray-800 w-full focus:ring-2 focus:ring-cyan-500 transition-all" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-cyan-700 dark:text-cyan-300 mb-1">Rider</label>
            <select value={filterRider} onChange={e=>setFilterRider(e.target.value)} className="px-3 py-2 border-2 border-cyan-200 dark:border-cyan-700 rounded-lg bg-white dark:bg-gray-800 w-full focus:ring-2 focus:ring-cyan-500 transition-all">
              <option value="">All Riders</option>
              {riders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-3 flex items-end gap-2">
            <button onClick={load} className="px-4 py-2 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Refresh</button>
            <button onClick={loadRollup} className="px-4 py-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Load Rollup</button>
            <button onClick={exportCsv} className="px-4 py-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Export CSV</button>
          </div>
        </div>
      </div>

      <form onSubmit={onAdd} className="p-5 rounded-xl border-2 border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50/60 to-white dark:from-orange-950/30 dark:to-gray-900 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-bold text-orange-700 dark:text-orange-300 mb-1">Rider</label>
            <select value={form.riderId} onChange={e=>setForm({...form, riderId:e.target.value})} className="px-3 py-2 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 w-full focus:ring-2 focus:ring-orange-500 transition-all">
              {riders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-orange-700 dark:text-orange-300 mb-1">Deliveries</label>
            <input type="number" placeholder="Deliveries" value={form.deliveries} onChange={e=>setForm({...form, deliveries:Number(e.target.value)})} className="px-3 py-2 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 w-full focus:ring-2 focus:ring-orange-500 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-orange-700 dark:text-orange-300 mb-1">Amount</label>
            <input type="number" placeholder="Amount" value={form.amount} onChange={e=>setForm({...form, amount:Number(e.target.value)})} className="px-3 py-2 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 w-full focus:ring-2 focus:ring-orange-500 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-orange-700 dark:text-orange-300 mb-1">Method</label>
            <select value={form.method} onChange={e=>setForm({...form, method:e.target.value})} className="px-3 py-2 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 w-full focus:ring-2 focus:ring-orange-500 transition-all">
              <option value="COD">Cash on Delivery</option>
              <option value="PaidToOwner">Paid to Owner</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-orange-700 dark:text-orange-300 mb-1">Note (optional)</label>
            <input placeholder="Note (optional)" value={form.note} onChange={e=>setForm({...form, note:e.target.value})} className="px-3 py-2 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 w-full focus:ring-2 focus:ring-orange-500 transition-all" />
          </div>
        </div>
        <div className="mt-4">
          <button disabled={loading} className="px-5 py-2.5 bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-lg font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">Add Record</button>
        </div>
      </form>

      <div className="border-2 border-cyan-200 dark:border-cyan-800 rounded-xl overflow-x-auto shadow-sm">
        <DataTable
          columns={[
            { label: 'Date', key: 'date' },
            { label: 'Rider', key: 'riderName' },
            { label: 'Deliveries', key: 'deliveries' },
            { label: 'Amount', render: r => `${Number(r.amount||0).toFixed(2)}` },
            { label: 'Method', render: r => r.method === 'COD' ? 'Cash on Delivery' : 'Paid to Owner' },
            { label: 'Settled', render: r => r.settled ? 'Yes' : 'No' },
            { label: 'Note', key: 'note' },
            { label: 'Actions', render: r => (
              <button disabled={loading} onClick={()=>onDelete(r.id)} className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-rose-400 to-rose-500 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">Delete</button>
            )},
          ]}
          data={records}
        />
      </div>
      {records.length===0 && (
        <div className="p-8 text-center text-gray-500 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-900/50">
          <span className="text-5xl mb-2 block">📭</span>
          <p>No records for this date.</p>
        </div>
      )}

      {rollup.length > 0 && (
        <div className="space-y-3 p-5 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/30 dark:to-gray-900 shadow-sm">
          <h2 className="text-lg font-bold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">📊 Day Close Rollup</h2>
          <div className="border-2 border-emerald-200 dark:border-emerald-800 rounded-xl overflow-x-auto">
            <DataTable
              columns={[
                { label: '🏍️ Rider', key: 'riderName' },
                { label: '📦 Deliveries', key: 'deliveries' },
                { label: '💰 Amount', render: r => `${Number(r.amount||0).toFixed(2)}` },
                { label: '❌ Unsettled', key: 'unsettled' },
                { label: '⚙️ Actions', render: r => (
                  <button disabled={loading} onClick={()=>settleRider(r.riderId)} className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-xs font-medium shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50">✅ Mark Settled</button>
                )},
              ]}
              data={rollup}
            />
          </div>
        </div>
      )}

      {/* Totals Summary (Bottom) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="p-4 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-gray-900 shadow-sm">
          <div className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-1">📦 Delivery Count</div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totals.deliveries}</div>
        </div>
        <div className="p-4 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-gray-900 shadow-sm">
          <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-1">💰 Total Amount</div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{Number(totals.amount||0).toFixed(2)}</div>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  )
}
