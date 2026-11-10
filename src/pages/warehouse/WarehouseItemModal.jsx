import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../state/AuthContext.jsx'
import { warehouseApiBase, warehouseHeaders } from './warehouseApi.js'

/** Edit warehouse catalog fields only (stock qty changes go through purchases). */
export default function WarehouseItemModal({ open, onClose, initial, suppliers = [] }) {
  const { token } = useAuth()
  const [form, setForm] = useState({
    name: '', category: '', unit: '', qty: 0, costPrice: 0, transferPrice: 0, lowStock: 0,
    supplierId: '', notes: '', expiry: '',
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !initial) return
    setForm({
      name: initial.name || '',
      category: initial.category || '',
      unit: initial.unit || '',
      qty: Number(initial.qty) || 0,
      costPrice: Number(initial.costPrice) || 0,
      transferPrice: Number(initial.transferPrice) || Number(initial.costPrice) || 0,
      lowStock: Number(initial.lowStock) || 0,
      supplierId: initial.supplierId || '',
      notes: initial.notes || '',
      expiry: initial.expiry ? String(initial.expiry).slice(0, 10) : '',
    })
  }, [open, initial])

  if (!open || !initial) return null

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const id = initial._id || initial.id
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/items/${id}`, {
        method: 'PATCH',
        headers: warehouseHeaders(token),
        body: JSON.stringify({
          ...form,
          transferPrice: form.transferPrice || form.costPrice,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Save failed')
      toast.success('Inventory updated')
      onClose(true)
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-user-busy="1" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <form onSubmit={save} className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800">
        <div className="flex items-center justify-between border-b px-6 py-4 dark:border-slate-700">
          <h3 className="text-lg font-bold">Edit inventory</h3>
          <button type="button" onClick={() => onClose(false)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">✕</button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Item name</label>
            <input required className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Qty (on hand)</label>
              <input type="number" className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.qty} onChange={e => setForm({ ...form, qty: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Category</label>
              <input className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Unit</label>
              <input className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Cost price</label>
              <input type="number" className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.costPrice} onChange={e => setForm({ ...form, costPrice: Number(e.target.value), transferPrice: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Transfer price</label>
              <input type="number" className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.transferPrice} onChange={e => setForm({ ...form, transferPrice: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Low stock</label>
              <input type="number" className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.lowStock} onChange={e => setForm({ ...form, lowStock: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Expiry</label>
              <input type="date" className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.expiry || ''} onChange={e => setForm({ ...form, expiry: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">Preferred supplier</label>
              <select className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.supplierId} onChange={e => setForm({ ...form, supplierId: e.target.value })}>
                <option value="">Optional…</option>
                {suppliers.map(s => <option key={s._id || s.id} value={s._id || s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">Notes</label>
              <input className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4 dark:border-slate-700">
          <button type="button" onClick={() => onClose(false)} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Cancel</button>
          <button disabled={busy} type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
