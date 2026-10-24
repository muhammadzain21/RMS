import { useEffect, useMemo, useState } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { openPdfPreview } from '../../utils/pdfPreview.js'

export default function RiderDaily() {
  const { state, businessDate } = useData()
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const riders = (state.staff || []).filter(s => String(s.position||'').toLowerCase().includes('rider') && (s.status||'Active') === 'Active')
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ riderId:'', deliveries:0, cash:0, date: String(businessDate||'').slice(0,10) || new Date().toLocaleDateString('en-CA') })
  const [loading, setLoading] = useState(false)
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }), [token])

  // totals for the current day selection
  const totals = useMemo(() => {
    const deliveries = (rows||[]).reduce((acc, r) => acc + Number(r.deliveries||0), 0)
    const amount = (rows||[]).reduce((acc, r) => acc + Number(r.amount||r.cash||0), 0)
    return { deliveries, amount }
  }, [rows])

  useEffect(() => {
    if (!form.riderId && riders.length) setForm(f => ({ ...f, riderId: riders[0].id }))
  }, [riders])

  const load = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ date: form.date })
      const res = await fetch(`${API}/api/rider-cash?${params.toString()}`, { headers })
      if (!res.ok) throw new Error('Failed')
      const list = await res.json()
      setRows((list||[]).map(r => ({ ...r, id: r._id || r.id })))
    } catch {
      // noop or toast
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [form.date])

  const add = async (e) => {
    e.preventDefault();
    if (!form.riderId) { toast.error('Select a rider'); return }
    try {
      setLoading(true)
      const r = riders.find(x=>x.id===form.riderId)
      const payload = { date: form.date, riderId: form.riderId, riderName: r?.name || '', deliveries:Number(form.deliveries||0), amount:Number(form.cash||0), method:'COD', note:'' }
      const res = await fetch(`${API}/api/rider-cash`, { method:'POST', headers, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error('Failed')
      setForm(f => ({ ...f, deliveries:0, cash:0 }))
      await load()
    } catch {
      toast.error('Failed to add')
    } finally { setLoading(false) }
  }

  const remove = async (id) => {
    const confirmed = await confirm({ title: 'Delete Record', message: 'Delete this record?' })
    if (!confirmed) return
    try {
      setLoading(true)
      const res = await fetch(`${API}/api/rider-cash/${id}`, { method:'DELETE', headers })
      if (!res.ok) throw new Error('Failed')
      await load()
    } catch {
      toast.error('Failed to delete')
    } finally { setLoading(false) }
  }

  const printReport = async () => {
    try {
      const doc = new jsPDF()
      doc.setFontSize(14)
      doc.text('Rider Daily Record', 14, 16)
      doc.setFontSize(10)
      doc.setTextColor(90, 90, 90)
      doc.text(`Date: ${form.date}`, 14, 23)
      autoTable(doc, {
        startY: 28,
        head: [['Date', 'Rider', 'Deliveries', 'Cash']],
        body: rows.map(r => [r.date || '-', r.riderName || '-', Number(r.deliveries || 0), `PKR ${Number(r.amount || r.cash || 0).toLocaleString()}`]),
        foot: [['', 'Totals', totals.deliveries, `PKR ${Number(totals.amount || 0).toLocaleString()}`]],
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [241, 245, 249], fontStyle: 'bold' },
      })
      const ok = await openPdfPreview(doc, `Rider Daily ${form.date}.pdf`)
      if (!ok) toast.error('Failed to open print preview')
    } catch {
      toast.error('Failed to open print preview')
    }
  }

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Rider Daily Record</h1>
        <button onClick={printReport} className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Print</button>
      </div>
      <form onSubmit={add} className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div>
          <label className="block text-xs mb-1">Rider</label>
          <select value={form.riderId} onChange={e=>setForm({...form,riderId:e.target.value})} className="px-3 py-2 border rounded w-full">
            {riders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1">Deliveries</label>
          <input type="number" placeholder="Deliveries" value={form.deliveries} onChange={e=>setForm({...form,deliveries:Number(e.target.value)})} className="px-3 py-2 border rounded w-full" />
        </div>
        <div>
          <label className="block text-xs mb-1">Cash Collected</label>
          <input type="number" placeholder="Cash Collected" value={form.cash} onChange={e=>setForm({...form,cash:Number(e.target.value)})} className="px-3 py-2 border rounded w-full" />
        </div>
        <div>
          <label className="block text-xs mb-1">Date</label>
          <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} className="px-3 py-2 border rounded w-full" />
        </div>
        <div className="md:col-span-1 flex items-end">
          <button disabled={loading} className="px-3 py-2 bg-primary-600 text-white rounded w-full disabled:opacity-50">Add</button>
        </div>
      </form>

      
      <div className="overflow-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 dark:bg-gray-800">
            <tr>{['Date','Rider','Deliveries','Cash'].map(h=> <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r)=> (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.date}</td>
                <td className="px-3 py-2">{r.riderName}</td>
                <td className="px-3 py-2">{r.deliveries}</td>
                <td className="px-3 py-2">{Number(r.amount||r.cash||0)}</td>
                <td className="px-3 py-2 text-right"><button onClick={()=>remove(r.id)} className="text-red-600">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals Summary (Bottom) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
        <div className="p-3 border rounded bg-gray-50 dark:bg-gray-800/30">
          <div className="text-xs text-gray-600">Delivery Count</div>
          <div className="text-lg font-semibold">{totals.deliveries}</div>
        </div>
        <div className="p-3 border rounded bg-gray-50 dark:bg-gray-800/30">
          <div className="text-xs text-gray-600">Total Amount</div>
          <div className="text-lg font-semibold">{Number(totals.amount||0).toFixed(2)}</div>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  )
}
