import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../state/AuthContext.jsx'
import { warehouseApiBase, warehouseHeaders } from './warehouseApi.js'

export default function WarehouseItemModal({ open, onClose, initial, suppliers = [] }) {
  const { token } = useAuth()
  const [form, setForm] = useState({
    name: '', category: '', unit: '', qty: 0, costPrice: 0, transferPrice: 0, lowStock: 0,
    supplierId: '', notes: '',
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (initial) {
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
      })
    } else {
      setForm({
        name: '', category: '', unit: '', qty: 0, costPrice: 0, transferPrice: 0, lowStock: 0,
        supplierId: '', notes: '',
      })
    }
  }, [open, initial])

  if (!open) return null

  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Item name required')
    setBusy(true)
    try {
      const id = initial?._id || initial?.id
      const url = id
        ? `${warehouseApiBase()}/api/warehouse/items/${id}`
        : `${warehouseApiBase()}/api/warehouse/items`
      const res = await fetch(url, {
        method: id ? 'PATCH' : 'POST',
        headers: warehouseHeaders(token),
        body: JSON.stringify({
          ...form,
          transferPrice: form.transferPrice || form.costPrice,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Save failed')
      toast.success(id ? 'Inventory updated' : 'Inventory item added')
      onClose(true)
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{initial ? 'Edit inventory' : 'Add inventory'}</h3>
          <button type="button" onClick={() => onClose(false)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">✕</button>
        </div>
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">Item name</label>
              <input required className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Category</label>
              <input className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Unit</label>
              <input className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" placeholder="kg, pcs…" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Qty</label>
              <input type="number" className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.qty} onChange={e => setForm({ ...form, qty: Number(e.target.value) })} />
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
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">Preferred warehouse supplier</label>
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
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => onClose(false)} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Cancel</button>
            <button disabled={busy} type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
