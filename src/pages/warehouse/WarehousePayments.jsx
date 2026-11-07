import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Wallet, RefreshCw } from 'lucide-react'
import PageHero from '../../components/ui/PageHero.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { warehouseApiBase, warehouseHeaders } from './warehouseApi.js'

export default function WarehousePayments() {
  const { token } = useAuth()
  const [suppliers, setSuppliers] = useState([])
  const [payments, setPayments] = useState([])
  const [ledgerSupplierId, setLedgerSupplierId] = useState('')
  const [ledger, setLedger] = useState(null)
  const [form, setForm] = useState({ supplierId: '', amount: 0, method: 'cash', reference: '', notes: '' })

  const load = async () => {
    try {
      const [a, b] = await Promise.all([
        fetch(`${warehouseApiBase()}/api/warehouse/suppliers`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${warehouseApiBase()}/api/warehouse/payments`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (a.ok) setSuppliers(await a.json())
      if (b.ok) setPayments(await b.json())
    } catch {
      toast.error('Could not load payments')
    }
  }

  const loadLedger = async (id) => {
    if (!id) { setLedger(null); return }
    const res = await fetch(`${warehouseApiBase()}/api/warehouse/suppliers/${id}/ledger`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) setLedger(await res.json())
  }

  useEffect(() => { load() }, [token])
  useEffect(() => { loadLedger(ledgerSupplierId) }, [ledgerSupplierId, token])

  const save = async (e) => {
    e.preventDefault()
    const res = await fetch(`${warehouseApiBase()}/api/warehouse/payments`, {
      method: 'POST',
      headers: warehouseHeaders(token),
      body: JSON.stringify(form),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(j.error || 'Failed')
    toast.success('Payment recorded')
    setForm({ supplierId: form.supplierId, amount: 0, method: 'cash', reference: '', notes: '' })
    load()
    if (form.supplierId) loadLedger(form.supplierId)
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHero
        title="Warehouse payment ledger"
        subtitle="Pay warehouse suppliers and track purchase vs payment balance."
        icon={Wallet}
        actions={
          <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold">
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={save} className="space-y-3 rounded-2xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-sm font-bold">Record payment</div>
          <select required className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" value={form.supplierId} onChange={e => { setForm({ ...form, supplierId: e.target.value }); setLedgerSupplierId(e.target.value) }}>
            <option value="">Warehouse supplier…</option>
            {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <input required type="number" className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" placeholder="Amount" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
          <select className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="cheque">Cheque</option>
            <option value="other">Other</option>
          </select>
          <input className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" placeholder="Reference" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} />
          <input className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <button type="submit" className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white">Save payment</button>
          <div className="text-[11px] text-slate-500">{payments.length} payments on file</div>
        </form>

        <div className="rounded-2xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-bold">Supplier ledger</div>
            <select className="rounded-lg border px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800" value={ledgerSupplierId} onChange={e => setLedgerSupplierId(e.target.value)}>
              <option value="">Pick supplier…</option>
              {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          {ledger ? (
            <>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800"><div className="text-slate-500">Purchases</div><div className="font-bold">{Number(ledger.purchaseTotal || 0).toLocaleString()}</div></div>
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800"><div className="text-slate-500">Paid</div><div className="font-bold">{Number(ledger.paidTotal || 0).toLocaleString()}</div></div>
                <div className="rounded-lg bg-amber-50 p-2 dark:bg-amber-950/30"><div className="text-slate-500">Balance due</div><div className="font-black">{Number(ledger.balance || 0).toLocaleString()}</div></div>
              </div>
              <div className="max-h-96 overflow-auto">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="px-2 py-1 text-left">Date</th>
                      <th className="px-2 py-1 text-left">Type</th>
                      <th className="px-2 py-1 text-right">Debit</th>
                      <th className="px-2 py-1 text-right">Credit</th>
                      <th className="px-2 py-1 text-right">Bal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ledger.entries || []).map((e, i) => (
                      <tr key={i} className="border-t dark:border-slate-800">
                        <td className="px-2 py-1">{e.date}</td>
                        <td className="px-2 py-1 capitalize">{e.type}</td>
                        <td className="px-2 py-1 text-right">{e.debit ? Number(e.debit).toLocaleString() : '—'}</td>
                        <td className="px-2 py-1 text-right">{e.credit ? Number(e.credit).toLocaleString() : '—'}</td>
                        <td className="px-2 py-1 text-right font-semibold">{Number(e.balance || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-sm text-slate-400">Select a warehouse supplier</div>
          )}
        </div>
      </div>
    </div>
  )
}
