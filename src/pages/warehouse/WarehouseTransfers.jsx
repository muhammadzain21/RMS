import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { ArrowLeftRight, ClipboardList } from 'lucide-react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'
import { btnPrimary } from '../../utils/listReportExport.js'
import { warehouseApiBase, warehouseHeaders } from './warehouseApi.js'

export default function WarehouseTransfers() {
  const { token } = useAuth()
  const { branches } = useBranch()
  const [searchParams, setSearchParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [demands, setDemands] = useState([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    toBranchId: '',
    notes: '',
    demandId: '',
    items: [{ warehouseItemId: '', qty: 1, warehouseStock: null, requestedQty: null }],
  })

  const load = async () => {
    try {
      const [itemsRes, demRes] = await Promise.all([
        fetch(`${warehouseApiBase()}/api/warehouse/items`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${warehouseApiBase()}/api/warehouse/demands`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (itemsRes.ok) setItems(await itemsRes.json())
      if (demRes.ok) setDemands(await demRes.json())
    } catch {
      toast.error('Could not load warehouse data')
    }
  }

  useEffect(() => { load() }, [token])

  const issueFromDemand = useCallback(async (demandOrId) => {
    const demand = typeof demandOrId === 'object' && demandOrId
      ? demandOrId
      : { _id: demandOrId, status: 'sent', branchId: '', note: '' }
    const id = demand._id || demand.id
    if (!id) return
    setBusy(true)
    try {
      if (demand.status === 'sent' || demand.status === 'pending') {
        await fetch(`${warehouseApiBase()}/api/demands/${id}/status`, {
          method: 'PATCH',
          headers: warehouseHeaders(token),
          body: JSON.stringify({ status: 'accepted' }),
        })
      }
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/demands/${id}/transfer-preview`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not load demand')
      setForm({
        toBranchId: j.toBranchId || demand.branchId || '',
        notes: demand.note || j.demand?.note || '',
        demandId: String(id),
        items: (j.items || []).map(line => ({
          warehouseItemId: line.warehouseItemId || '',
          qty: Number(line.qty) || 0,
          warehouseStock: Number(line.warehouseStock) || 0,
          requestedQty: Number(line.requestedQty) || 0,
          name: line.name,
          matched: line.matched,
        })),
      })
      setDialogOpen(true)
    } catch (e) {
      toast.error(e.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }, [token])

  // Open transfer dialog when arriving from Branch Demands page
  useEffect(() => {
    if (!token) return
    let id = searchParams.get('issue') || ''
    if (!id) {
      try {
        id = sessionStorage.getItem('warehouse_issue_demand_id') || ''
        if (id) sessionStorage.removeItem('warehouse_issue_demand_id')
      } catch {}
    }
    if (!id) return
    issueFromDemand(id).then(() => {
      const next = new URLSearchParams(searchParams)
      next.delete('issue')
      setSearchParams(next, { replace: true })
    })
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const openDialog = () => {
    setForm({
      toBranchId: '',
      notes: '',
      demandId: '',
      items: [{ warehouseItemId: '', qty: 1, warehouseStock: null, requestedQty: null }],
    })
    setDialogOpen(true)
  }

  const stockFor = (warehouseItemId) => {
    const it = items.find(x => String(x._id) === String(warehouseItemId))
    return it ? Number(it.qty) || 0 : null
  }

  const send = async (e) => {
    e.preventDefault()
    if (!form.toBranchId) return toast.error('Select branch')
    if (!form.items.some(i => i.warehouseItemId && Number(i.qty) > 0)) {
      return toast.error('Add at least one item with qty')
    }
    for (const line of form.items) {
      if (!line.warehouseItemId || !(Number(line.qty) > 0)) continue
      const stock = line.warehouseStock != null ? Number(line.warehouseStock) : stockFor(line.warehouseItemId)
      if (stock != null && Number(line.qty) > stock) {
        return toast.error(`Transfer qty exceeds warehouse stock (${stock})`)
      }
    }
    setBusy(true)
    try {
      const payload = {
        toBranchId: form.toBranchId,
        notes: form.notes,
        demandId: form.demandId || undefined,
        items: form.items
          .filter(i => i.warehouseItemId && Number(i.qty) > 0)
          .map(i => ({ warehouseItemId: i.warehouseItemId, qty: Number(i.qty) })),
      }
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/transfers`, {
        method: 'POST',
        headers: warehouseHeaders(token),
        body: JSON.stringify(payload),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed')
      toast.success(form.demandId
        ? 'Demand issued — branch can receive under Branch Transfers'
        : 'Stock transferred — branch can receive under Branch Transfers')
      setDialogOpen(false)
      load()
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const openDemands = demands.filter(d => d.status === 'sent' || d.status === 'accepted')

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="page-title">Warehouse Transfers</h1>
        <button type="button" onClick={openDialog} className={btnPrimary}>
          + Transfer Stock
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-indigo-600" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
              Open branch demands
            </h2>
          </div>
          <Link to="/warehouse/demands" className="text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-300">
            Open full Branch Demands page →
          </Link>
        </div>
        {!openDemands.length ? (
          <p className="text-sm text-gray-500">
            No open warehouse demands.{' '}
            <Link to="/warehouse/demands" className="font-semibold text-indigo-600 hover:underline">View all</Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-gray-500 dark:border-gray-700">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Branch</th>
                  <th className="py-2 pr-3">Items</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {openDemands.map(d => (
                  <tr key={d._id} className="border-b dark:border-gray-700">
                    <td className="py-2 pr-3 whitespace-nowrap">{d.date}</td>
                    <td className="py-2 pr-3 font-medium">{d.branchName || d.branchId}</td>
                    <td className="py-2 pr-3 text-gray-600 dark:text-gray-300">
                      {(d.items || []).slice(0, 3).map(i => `${i.name}×${i.quantity}`).join(', ')}
                      {(d.items || []).length > 3 ? '…' : ''}
                    </td>
                    <td className="py-2 pr-3 capitalize">{d.status}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => issueFromDemand(d)}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        Issue transfer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center">
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Send warehouse inventory to a branch. Edit quantities when stock is short. The branch receives under Operations → Branch Transfers.
        </p>
        <button type="button" onClick={openDialog} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-500">
          <ArrowLeftRight size={16} /> Transfer stock to branch
        </button>
      </div>

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-800">
            <div className="flex items-center justify-between border-b px-6 py-4 dark:border-slate-700">
              <h3 className="text-lg font-bold">
                {form.demandId ? 'Issue demand as transfer' : 'Transfer stock to branch'}
              </h3>
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
                  <div className="grid grid-cols-[1fr_100px_100px_100px_auto] gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span>Item</span>
                    <span>WH stock</span>
                    <span>Requested</span>
                    <span>Transfer</span>
                    <span />
                  </div>
                  {form.items.map((line, idx) => {
                    const stock = line.warehouseStock != null ? line.warehouseStock : stockFor(line.warehouseItemId)
                    return (
                      <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px_100px_100px_auto] sm:items-center">
                        <select
                          required
                          className="rounded-xl border-2 border-slate-200 px-3 py-3 text-sm dark:border-slate-600 dark:bg-slate-900"
                          value={line.warehouseItemId}
                          onChange={e => {
                            const id = e.target.value
                            const s = stockFor(id)
                            setForm(t => ({
                              ...t,
                              items: t.items.map((r, i) => i === idx ? { ...r, warehouseItemId: id, warehouseStock: s } : r),
                            }))
                          }}
                        >
                          <option value="">Warehouse item…</option>
                          {items.map(it => (
                            <option key={it._id} value={it._id}>{it.name} ({it.qty} {it.unit})</option>
                          ))}
                        </select>
                        <div className={`rounded-xl border px-3 py-3 text-sm font-semibold ${stock != null && stock <= 0 ? 'border-rose-300 text-rose-700' : 'border-slate-200 dark:border-slate-600'}`}>
                          {stock == null ? '—' : stock}
                        </div>
                        <div className="rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-600">
                          {line.requestedQty != null ? line.requestedQty : '—'}
                        </div>
                        <input
                          type="number"
                          required
                          min={0.01}
                          step="any"
                          className="rounded-xl border-2 border-slate-200 px-3 py-3 text-sm dark:border-slate-600 dark:bg-slate-900"
                          placeholder="Qty"
                          value={line.qty}
                          onChange={e => setForm(t => ({
                            ...t,
                            items: t.items.map((r, i) => i === idx ? { ...r, qty: Number(e.target.value) } : r),
                          }))}
                        />
                        <button
                          type="button"
                          disabled={form.items.length <= 1}
                          onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                          className="rounded-xl border px-3 py-2 text-sm text-rose-600 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    )
                  })}
                </div>
                <input className="w-full rounded-xl border-2 border-slate-200 px-3 py-3 text-sm dark:border-slate-600 dark:bg-slate-900" placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t px-6 py-4 dark:border-slate-700">
                <button type="button" className="rounded-xl border px-4 py-2.5 text-sm font-semibold" onClick={() => setForm(f => ({ ...f, items: [...f.items, { warehouseItemId: '', qty: 1, warehouseStock: null, requestedQty: null }] }))}>+ Line</button>
                <div className="flex-1" />
                <button type="button" onClick={() => setDialogOpen(false)} className="rounded-xl border px-5 py-2.5 text-sm font-semibold">Cancel</button>
                <button disabled={busy} type="submit" className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                  {busy ? 'Sending…' : (form.demandId ? 'Issue transfer' : 'Send transfer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
