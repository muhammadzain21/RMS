import { useEffect, useMemo, useState } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import { format } from 'date-fns'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '../../utils/reportDoc.js'
import DatePicker from '../../components/DatePicker.jsx'

const btnPrint = 'ui-btn ui-btn-print'
const btnPdf = 'ui-btn ui-btn-pdf'
const btnCsv = 'ui-btn ui-btn-csv'

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

  const buildRiderDailyReport = () => {
    const fileName = `Rider-Daily-${form.date}.pdf`
    const body =
      reportSummary([
        { label: 'Total deliveries', amount: String(totals.deliveries) },
        { label: 'Total cash', amount: `PKR ${Number(totals.amount || 0).toLocaleString()}` },
        { label: 'Records', amount: String(rows.length) },
      ]) +
      reportSec(`Rider daily — ${form.date}`) +
      reportTable({
        headers: ['Date', 'Rider', { t: 'Deliveries', align: 'r' }, { t: 'Cash (PKR)', align: 'r' }],
        numbered: true,
        rows: rows.map(r => [
          r.date || '-',
          r.riderName || '-',
          { v: Number(r.deliveries || 0), align: 'r' },
          { v: Number(r.amount || r.cash || 0).toLocaleString(), align: 'r' },
        ]),
        emptyText: 'No records for this date',
      })
    const html = wrapReportDoc({
      settings: state?.settings || {},
      title: 'Rider Daily Record',
      reportLabel: 'Rider Daily Report',
      reportNo: `Rpt #: RD-${form.date}`,
      metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Date', form.date]],
      metaRight: [['Records', String(rows.length)]],
      body,
    })
    return { html, fileName }
  }

  const openPrintPreview = async () => {
    try {
      const { html, fileName } = buildRiderDailyReport()
      await previewHtmlReport(html, fileName)
      toast.success('Print preview opened')
    } catch {
      toast.error('Failed to open print preview')
    }
  }

  const exportPDF = async () => {
    try {
      const { html, fileName } = buildRiderDailyReport()
      await downloadHtmlReport(html, fileName)
      toast.success('PDF downloaded')
    } catch {
      toast.error('Failed to download PDF')
    }
  }

  const exportCSV = () => {
    try {
      const header = ['Date', 'Rider', 'Deliveries', 'Cash (PKR)']
      const lines = rows.map(r =>
        [r.date, r.riderName, r.deliveries, Number(r.amount || r.cash || 0)]
          .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
      )
      const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rider_daily_${form.date}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV exported')
    } catch {
      toast.error('Failed to export CSV')
    }
  }

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Rider Daily Record</h1>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
          <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
          <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
        </div>
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
          <DatePicker label="Date" value={form.date} onChange={v=>{ if (v) setForm({...form, date:v}) }} allowClear={false} />
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
