import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ShoppingCart, RefreshCw } from 'lucide-react'
import PageHero from '../../components/ui/PageHero.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { warehouseApiBase, warehouseHeaders } from './warehouseApi.js'

export default function WarehousePurchases() {
  const { token } = useAuth()
  const [items, setItems] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [purchases, setPurchases] = useState([])
  const [form, setForm] = useState({
    supplierId: '', invoiceNo: '', notes: '', paidAmount: 0, paymentMethod: 'cash',
    items: [{ name: '', qty: 1, unitCost: 0 }],
  })

  const load = async () => {
    try {
      const [a, b, c] = await Promise.all([
        fetch(`${warehouseApiBase()}/api/warehouse/items`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${warehouseApiBase()}/api/warehouse/suppliers`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${warehouseApiBase()}/api/warehouse/purchases`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (a.ok) setItems(await a.json())
      if (b.ok) setSuppliers(await b.json())
      if (c.ok) setPurchases(await c.json())
    } catch {
      toast.error('Could not load purchases')
    }
  }

  useEffect(() => { load() }, [token])

  const save = async (e) => {
    e.preventDefault()
    if (!form.supplierId) return toast.error('Select a warehouse supplier')
    const res = await fetch(`${warehouseApiBase()}/api/warehouse/purchases`, {
      method: 'POST',
      headers: warehouseHeaders(token),
      body: JSON.stringify(form),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(j.error || 'Failed')
    toast.success('Purchase recorded — stock updated')
    setForm({
      supplierId: '', invoiceNo: '', notes: '', paidAmount: 0, paymentMethod: 'cash',
      items: [{ name: '', qty: 1, unitCost: 0 }],
    })
    load()
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHero
        title="Warehouse purchases"
        subtitle="Buy into central warehouse stock from warehouse suppliers only."
        icon={ShoppingCart}
        actions={
          <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold">
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={save} className="space-y-3 rounded-2xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-sm font-bold">New purchase</div>
          <select required className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" value={form.supplierId} onChange={e => setForm({ ...form, supplierId: e.target.value })}>
            <option value="">Warehouse supplier…</option>
            {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <input className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" placeholder="Invoice #" value={form.invoiceNo} onChange={e => setForm({ ...form, invoiceNo: e.target.value })} />
          {form.items.map((line, idx) => (
            <div key={idx} className="grid gap-2 sm:grid-cols-3">
              <input list="wh-stock-items" className="rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" placeholder="Item" value={line.name} onChange={e => setForm(f => ({ ...f, items: f.items.map((r, i) => i === idx ? { ...r, name: e.target.value } : r) }))} />
              <input type="number" className="rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" placeholder="Qty" value={line.qty} onChange={e => setForm(f => ({ ...f, items: f.items.map((r, i) => i === idx ? { ...r, qty: Number(e.target.value) } : r) }))} />
              <input type="number" className="rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" placeholder="Unit cost" value={line.unitCost} onChange={e => setForm(f => ({ ...f, items: f.items.map((r, i) => i === idx ? { ...r, unitCost: Number(e.target.value) } : r) }))} />
            </div>
          ))}
          <datalist id="wh-stock-items">{items.map(i => <option key={i._id} value={i.name} />)}</datalist>
          <div className="grid gap-2 sm:grid-cols-2">
            <input type="number" className="rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" placeholder="Paid now" value={form.paidAmount} onChange={e => setForm({ ...form, paidAmount: Number(e.target.value) })} />
            <select className="rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
          </div>
          <input className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <div className="flex gap-2">
            <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => setForm(f => ({ ...f, items: [...f.items, { name: '', qty: 1, unitCost: 0 }] }))}>+ Line</button>
            <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Save purchase</button>
          </div>
        </form>

        <div className="overflow-auto rounded-2xl border bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b px-4 py-2 text-sm font-bold dark:border-slate-800">Purchase history</div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Supplier</th>
                <th className="px-3 py-2 text-left">Invoice</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Paid</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map(p => (
                <tr key={p._id} className="border-t dark:border-slate-800">
                  <td className="px-3 py-2">{p.date}</td>
                  <td className="px-3 py-2">{p.supplierName || '—'}</td>
                  <td className="px-3 py-2">{p.invoiceNo || '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold">{Number(p.total || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{Number(p.paidAmount || 0).toLocaleString()}</td>
                </tr>
              ))}
              {!purchases.length && <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-400">No purchases yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
