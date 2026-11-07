import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../state/AuthContext.jsx'
import { warehouseApiBase, warehouseHeaders } from './warehouseApi.js'

export default function WarehouseSupplierModal({ open, onClose, initial }) {
  const { token } = useAuth()
  const [form, setForm] = useState({
    name: '', company: '', phone: '', address: '', taxId: '', status: 'Active',
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setForm({
        name: initial.name || '',
        company: initial.company || '',
        phone: initial.phone || '',
        address: initial.address || '',
        taxId: initial.taxId || '',
        status: initial.status || 'Active',
      })
    } else {
      setForm({ name: '', company: '', phone: '', address: '', taxId: '', status: 'Active' })
    }
  }, [open, initial])

  if (!open) return null

  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Name required')
    setBusy(true)
    try {
      const id = initial?._id || initial?.id
      const url = id
        ? `${warehouseApiBase()}/api/warehouse/suppliers/${id}`
        : `${warehouseApiBase()}/api/warehouse/suppliers`
      const res = await fetch(url, {
        method: id ? 'PATCH' : 'POST',
        headers: warehouseHeaders(token),
        body: JSON.stringify(form),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Save failed')
      toast.success(id ? 'Supplier updated' : 'Supplier added')
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
          <h3 className="text-lg font-bold">{initial ? 'Edit warehouse supplier' : 'Add warehouse supplier'}</h3>
          <button type="button" onClick={() => onClose(false)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">✕</button>
        </div>
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Name</label>
              <input required className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Company</label>
              <input className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Phone</label>
              <input className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Tax ID</label>
              <input className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.taxId} onChange={e => setForm({ ...form, taxId: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">Address</label>
              <textarea rows={2} className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Status</label>
              <select className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
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
