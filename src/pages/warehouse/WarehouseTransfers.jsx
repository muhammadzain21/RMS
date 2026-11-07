import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ArrowLeftRight } from 'lucide-react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'
import { btnPrimary } from '../../utils/listReportExport.js'
import { warehouseApiBase, warehouseHeaders } from './warehouseApi.js'

export default function WarehouseTransfers() {
  const { token } = useAuth()
  const { branches } = useBranch()
  const [items, setItems] = useState([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ toBranchId: '', notes: '', items: [{ warehouseItemId: '', qty: 1 }] })

  const load = async () => {
    try {
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/items`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setItems(await res.json())
    } catch {
      toast.error('Could not load stock')
    }
  }

  useEffect(() => { load() }, [token])

  const openDialog = () => {
    setForm({ toBranchId: '', notes: '', items: [{ warehouseItemId: '', qty: 1 }] })
    setDialogOpen(true)
  }

  const send = async (e) => {
    e.preventDefault()
    if (!form.toBranchId) return toast.error('Select branch')
    if (!form.items.some(i => i.warehouseItemId && Number(i.qty) > 0)) return toast.error('Add at least one item')
    setBusy(true)
    try {
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/transfers`, {
        method: 'POST',
        headers: warehouseHeaders(token),
        body: JSON.stringify(form),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed')
      toast.success('Stock transferred — branch can receive under Transfers In')
      setDialogOpen(false)
      load()
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="page-title">Transfer Stock</h1>
        <button type="button" onClick={openDialog} className={btnPrimary}>
          + Transfer Stock
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center">
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Send warehouse inventory to a branch. The branch receives it under Operations → Transfers In.
        </p>
        <button type="button" onClick={openDialog} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-500">
          <ArrowLeftRight size={16} /> Transfer stock to branch
        </button>
      </div>

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-800">
            <div className="flex items-center justify-between border-b px-6 py-4 dark:border-slate-700">
              <h3 className="text-lg font-bold">Transfer stock to branch</h3>
              <button type="button" onClick={() => setDialogOpen(false)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">✕</button>
            </div>
            <form onSubmit={send} className="flex flex-1 flex-col overflow-hidden">
              <div className="space-y-4 overflow-y-auto px-6 py-5">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Branch</label>
                  <select required className="w-full rounded-xl border-2 border-slate-200 px-3 py-3 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.toBranchId} onChange={e => setForm({ ...form, toBranchId: e.target.value })}>
                    <option value="">Select branch…</option>
                    {branches.map(b => <option key={b._id} value={b._id}>{b.name} ({b.code})</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Items</div>
                  {form.items.map((line, idx) => (
                    <div key={idx} className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
                      <select required className="rounded-xl border-2 border-slate-200 px-3 py-3 text-sm dark:border-slate-600 dark:bg-slate-900" value={line.warehouseItemId} onChange={e => setForm(t => ({ ...t, items: t.items.map((r, i) => i === idx ? { ...r, warehouseItemId: e.target.value } : r) }))}>
                        <option value="">Warehouse item…</option>
                        {items.map(it => <option key={it._id} value={it._id}>{it.name} ({it.qty} {it.unit})</option>)}
                      </select>
                      <input type="number" required min={0.01} step="any" className="rounded-xl border-2 border-slate-200 px-3 py-3 text-sm dark:border-slate-600 dark:bg-slate-900" placeholder="Qty" value={line.qty} onChange={e => setForm(t => ({ ...t, items: t.items.map((r, i) => i === idx ? { ...r, qty: Number(e.target.value) } : r) }))} />
                      <button
                        type="button"
                        disabled={form.items.length <= 1}
                        onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                        className="rounded-xl border px-3 py-2 text-sm text-rose-600 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <input className="w-full rounded-xl border-2 border-slate-200 px-3 py-3 text-sm dark:border-slate-600 dark:bg-slate-900" placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t px-6 py-4 dark:border-slate-700">
                <button type="button" className="rounded-xl border px-4 py-2.5 text-sm font-semibold" onClick={() => setForm(f => ({ ...f, items: [...f.items, { warehouseItemId: '', qty: 1 }] }))}>+ Line</button>
                <div className="flex-1" />
                <button type="button" onClick={() => setDialogOpen(false)} className="rounded-xl border px-5 py-2.5 text-sm font-semibold">Cancel</button>
                <button disabled={busy} type="submit" className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                  {busy ? 'Sending…' : 'Send transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
