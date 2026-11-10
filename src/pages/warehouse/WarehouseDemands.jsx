import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ClipboardList, RefreshCw, CheckCircle2, XCircle, ArrowLeftRight } from 'lucide-react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'
import { warehouseApiBase, warehouseHeaders } from './warehouseApi.js'

const STATUS_STYLE = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  accepted: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
  issued: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200',
}

const emptyTransferForm = () => ({
  demandId: '',
  toBranchId: '',
  toBranchName: '',
  notes: '',
  items: [],
})

export default function WarehouseDemands() {
  const { token } = useAuth()
  const { branches } = useBranch()
  const [rows, setRows] = useState([])
  const [whItems, setWhItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [expanded, setExpanded] = useState('')
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferBusy, setTransferBusy] = useState(false)
  const [form, setForm] = useState(emptyTransferForm)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('status', statusFilter === 'all' ? 'all' : statusFilter)
      if (from && to) {
        params.set('from', from)
        params.set('to', to)
      }
      if (branchFilter) params.set('branchId', branchFilter)
      const [demRes, itemsRes] = await Promise.all([
        fetch(`${warehouseApiBase()}/api/warehouse/demands?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
        fetch(`${warehouseApiBase()}/api/warehouse/items`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
      ])
      if (!demRes.ok) throw new Error('Failed to load')
      const j = await demRes.json()
      let list = Array.isArray(j) ? j : []
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        list = list.filter(d => {
          const blob = [
            d.note, d.branchName, d.status, d.date,
            ...(d.items || []).map(i => i.name),
          ].join(' ').toLowerCase()
          return blob.includes(q)
        })
      }
      setRows(list)
      if (itemsRes.ok) setWhItems(await itemsRes.json())
    } catch {
      toast.error('Could not load branch demands')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [token, statusFilter, from, to, search, branchFilter])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [statusFilter, branchFilter, from, to, search, limit])

  const filtered = rows
  const totalPages = Math.max(1, Math.ceil(filtered.length / limit))
  const pageSafe = Math.min(page, totalPages)
  const pageRows = filtered.slice((pageSafe - 1) * limit, pageSafe * limit)

  const stockFor = (warehouseItemId) => {
    const it = whItems.find(x => String(x._id) === String(warehouseItemId))
    return it ? Number(it.qty) || 0 : null
  }

  const setStatus = async (demand, status, reason = '') => {
    const id = String(demand._id || demand.id)
    setBusyId(id)
    try {
      const res = await fetch(`${warehouseApiBase()}/api/demands/${id}/status`, {
        method: 'PATCH',
        headers: warehouseHeaders(token),
        body: JSON.stringify({ status, reason }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed')
      setRows(prev => prev.map(r => (String(r._id || r.id) === id ? { ...r, status, ...(reason ? { rejectedReason: reason } : {}) } : r)))
      toast.success(`Demand ${status}`)
      load()
    } catch (e) {
      toast.error(e.message || 'Failed')
    } finally {
      setBusyId('')
    }
  }

  const openTransferDialog = async (demand) => {
    const id = String(demand._id || demand.id)
    setBusyId(id)
    try {
      if (demand.status === 'sent' || demand.status === 'pending') {
        const res = await fetch(`${warehouseApiBase()}/api/demands/${id}/status`, {
          method: 'PATCH',
          headers: warehouseHeaders(token),
          body: JSON.stringify({ status: 'accepted' }),
        })
        if (res.ok) {
          setRows(prev => prev.map(r => (String(r._id || r.id) === id ? { ...r, status: 'accepted' } : r)))
        }
      }
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/demands/${id}/transfer-preview`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not load demand items')
      setForm({
        demandId: id,
        toBranchId: j.toBranchId || demand.branchId || '',
        toBranchName: j.toBranchName || demand.branchName || '',
        notes: demand.note || j.demand?.note || '',
        items: (j.items || []).map(line => {
          const stock = Number(line.warehouseStock) || 0
          const requested = Number(line.requestedQty) || 0
          const qty = Math.min(requested, stock > 0 ? stock : 0)
          return {
            name: line.name || '',
            unit: line.unit || '',
            warehouseItemId: line.warehouseItemId || '',
            warehouseStock: stock,
            requestedQty: requested,
            qty,
            matched: !!line.matched,
          }
        }),
      })
      setTransferOpen(true)
    } catch (e) {
      toast.error(e.message || 'Failed to open transfer')
    } finally {
      setBusyId('')
    }
  }

  const updateLineQty = (idx, raw) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((line, i) => {
        if (i !== idx) return line
        const stock = line.warehouseStock != null ? Number(line.warehouseStock) : (stockFor(line.warehouseItemId) ?? 0)
        let qty = Number(raw)
        if (!Number.isFinite(qty) || qty < 0) qty = 0
        if (qty > stock) {
          toast.error(`Max available in warehouse: ${stock}`)
          qty = stock
        }
        return { ...line, qty }
      }),
    }))
  }

  const submitTransfer = async (e) => {
    e.preventDefault()
    if (!form.toBranchId) return toast.error('Branch is required')
    const lines = form.items.filter(i => i.warehouseItemId && Number(i.qty) > 0)
    if (!lines.length) return toast.error('Set transfer qty for at least one matched warehouse item')
    for (const line of lines) {
      const stock = line.warehouseStock != null ? Number(line.warehouseStock) : (stockFor(line.warehouseItemId) ?? 0)
      if (Number(line.qty) > stock) {
        return toast.error(`“${line.name}” qty exceeds warehouse stock (${stock})`)
      }
      if (!line.warehouseItemId) {
        return toast.error(`“${line.name}” is not matched to a warehouse item`)
      }
    }
    setTransferBusy(true)
    try {
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/transfers`, {
        method: 'POST',
        headers: warehouseHeaders(token),
        body: JSON.stringify({
          toBranchId: form.toBranchId,
          notes: form.notes,
          demandId: form.demandId || undefined,
          items: lines.map(i => ({
            warehouseItemId: i.warehouseItemId,
            qty: Number(i.qty),
            unit: i.unit || '',
          })),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Transfer failed')
      toast.success('Stock transferred — branch can receive under Branch Transfers')
      setTransferOpen(false)
      setForm(emptyTransferForm())
      load()
    } catch (err) {
      toast.error(err.message || 'Transfer failed')
    } finally {
      setTransferBusy(false)
    }
  }

  const branchLabel = (d) => {
    if (d.branchName) return d.branchName
    const b = branches.find(x => String(x._id) === String(d.branchId))
    return b?.name || d.branchId || '—'
  }

  const transferBranchName = form.toBranchName
    || branches.find(b => String(b._id) === String(form.toBranchId))?.name
    || form.toBranchId
    || 'branch'

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white">
            <ClipboardList size={20} />
          </div>
          <div>
            <h1 className="page-title">Branch Demands</h1>
            <p className="text-sm text-gray-500">
              Demands sent by branches to head office / warehouse. Accept and transfer stock to the branch.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold dark:border-slate-600"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Status</label>
          <select
            className="rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="open">Open (pending / sent / accepted)</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="issued">Issued</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Branch</label>
          <select
            className="rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
          >
            <option value="">All branches</option>
            {branches.map(b => (
              <option key={b._id} value={b._id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <DatePicker label="From" value={from} onChange={v => setFrom(v || '')} />
        </div>
        <div>
          <DatePicker label="To" value={to} onChange={v => setTo(v || '')} />
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-semibold text-gray-500">Search</label>
          <input
            className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Item, note, branch…"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-[980px] w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-gray-500 dark:border-gray-700">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3 min-w-[280px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(d => {
              const id = String(d._id || d.id)
              const busy = busyId === id
              const status = String(d.status || '')
              const canAccept = status === 'sent' || status === 'pending'
              const canTransfer = ['sent', 'accepted', 'pending'].includes(status)
              const canReject = canTransfer
              return (
                <tr key={id} className="border-b align-top dark:border-gray-700">
                  <td className="px-4 py-3 whitespace-nowrap">{d.date || '—'}</td>
                  <td className="px-4 py-3 font-medium">{branchLabel(d)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="text-left text-indigo-600 hover:underline dark:text-indigo-300"
                      onClick={() => setExpanded(expanded === id ? '' : id)}
                    >
                      {(d.items || []).length} item{(d.items || []).length === 1 ? '' : 's'}
                      {' — '}
                      {(d.items || []).slice(0, 2).map(i => `${i.name}×${i.quantity}`).join(', ')}
                      {(d.items || []).length > 2 ? '…' : ''}
                    </button>
                    {expanded === id && (
                      <ul className="mt-2 space-y-1 rounded-lg border bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-900/50">
                        {(d.items || []).map((it, i) => (
                          <li key={i} className="flex justify-between gap-3">
                            <span>{it.name}</span>
                            <span className="font-semibold">{it.quantity} {it.unit || ''}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${STATUS_STYLE[status] || STATUS_STYLE.pending}`}>
                      {status || 'pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate">{d.note || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {canAccept && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setStatus(d, 'accepted')}
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                        >
                          <CheckCircle2 size={12} /> Accept
                        </button>
                      )}
                      {canTransfer && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openTransferDialog(d)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                        >
                          <ArrowLeftRight size={12} /> Transfer stock
                        </button>
                      )}
                      {canReject && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt('Reject reason (optional)') || ''
                            setStatus(d, 'rejected', reason)
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300"
                        >
                          <XCircle size={12} /> Reject
                        </button>
                      )}
                      {status === 'issued' && (
                        <span className="text-[11px] text-gray-500">Transfer created</span>
                      )}
                      {status === 'completed' && (
                        <span className="text-[11px] font-semibold text-emerald-600">Completed</span>
                      )}
                      {status === 'rejected' && (
                        <span className="text-[11px] font-semibold text-rose-600">Rejected</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!pageRows.length && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                  {loading ? 'Loading…' : 'No branch demands yet. When a branch uses Demands → Send to warehouse, they appear here.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={pageSafe}
        pages={totalPages}
        total={filtered.length}
        limit={limit}
        onLimitChange={n => { setLimit(n); setPage(1) }}
        onPageChange={setPage}
        loading={loading}
      />

      {transferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-800">
            <div className="flex items-center justify-between border-b px-6 py-4 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-bold">Transfer stock to branch</h3>
                <p className="text-sm text-gray-500">
                  Sending to <span className="font-semibold text-gray-800 dark:text-gray-200">{transferBranchName}</span>
                  . Edit qty — cannot exceed warehouse stock.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setTransferOpen(false); setForm(emptyTransferForm()) }}
                className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                ✕
              </button>
            </div>
            <form onSubmit={submitTransfer} className="flex flex-1 flex-col overflow-hidden">
              <div className="space-y-4 overflow-y-auto px-6 py-5">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Branch</label>
                  <select
                    required
                    className="w-full rounded-xl border-2 border-slate-200 px-3 py-3 text-sm dark:border-slate-600 dark:bg-slate-900"
                    value={form.toBranchId}
                    onChange={e => setForm({ ...form, toBranchId: e.target.value })}
                  >
                    <option value="">Select branch…</option>
                    {branches.map(b => (
                      <option key={b._id} value={b._id}>{b.name} ({b.code})</option>
                    ))}
                  </select>
                </div>

                <div className="overflow-x-auto rounded-xl border dark:border-slate-700">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/60">
                      <tr>
                        <th className="px-3 py-2 text-left">Item</th>
                        <th className="px-3 py-2 text-right">Requested</th>
                        <th className="px-3 py-2 text-right">WH stock</th>
                        <th className="px-3 py-2 text-right">Transfer qty</th>
                        <th className="px-3 py-2 text-left">Warehouse item</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((line, idx) => {
                        const stock = line.warehouseStock != null
                          ? Number(line.warehouseStock)
                          : (stockFor(line.warehouseItemId) ?? 0)
                        const over = Number(line.qty) > stock
                        return (
                          <tr key={idx} className="border-t dark:border-slate-700">
                            <td className="px-3 py-2 font-medium">
                              {line.name || '—'}
                              {!line.matched && (
                                <div className="text-[11px] font-normal text-amber-600">Not matched in warehouse inventory</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {line.requestedQty} {line.unit || ''}
                            </td>
                            <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${stock <= 0 ? 'text-rose-600' : ''}`}>
                              {stock} {line.unit || ''}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                max={stock}
                                disabled={!line.warehouseItemId || stock <= 0}
                                className={`w-28 rounded-lg border px-2 py-1.5 text-right text-sm dark:bg-slate-900 ${over ? 'border-rose-400' : 'border-slate-200 dark:border-slate-600'}`}
                                value={line.qty}
                                onChange={e => updateLineQty(idx, e.target.value)}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                className="w-full min-w-[180px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                                value={line.warehouseItemId}
                                onChange={e => {
                                  const wid = e.target.value
                                  const s = stockFor(wid) ?? 0
                                  const requested = Number(line.requestedQty) || 0
                                  setForm(prev => ({
                                    ...prev,
                                    items: prev.items.map((r, i) => i === idx ? {
                                      ...r,
                                      warehouseItemId: wid,
                                      warehouseStock: s,
                                      matched: !!wid,
                                      qty: Math.min(requested, s),
                                      unit: whItems.find(x => String(x._id) === String(wid))?.unit || r.unit,
                                    } : r),
                                  }))
                                }}
                              >
                                <option value="">Select warehouse item…</option>
                                {whItems.map(it => (
                                  <option key={it._id} value={it._id}>
                                    {it.name} ({Number(it.qty) || 0} {it.unit || ''})
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                      {!form.items.length && (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-gray-500">No items on this demand</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <input
                  className="w-full rounded-xl border-2 border-slate-200 px-3 py-3 text-sm dark:border-slate-600 dark:bg-slate-900"
                  placeholder="Notes"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t px-6 py-4 dark:border-slate-700">
                <div className="flex-1 text-xs text-gray-500">
                  Transfer qty is capped by warehouse stock. Branch receives under Operations → Branch Transfers.
                </div>
                <button
                  type="button"
                  onClick={() => { setTransferOpen(false); setForm(emptyTransferForm()) }}
                  className="rounded-xl border px-5 py-2.5 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  disabled={transferBusy}
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {transferBusy ? 'Transferring…' : 'Transfer stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
