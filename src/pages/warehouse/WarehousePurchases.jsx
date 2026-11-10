import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ShoppingCart, RefreshCw } from 'lucide-react'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'
import { useConfirm } from '../../components/useConfirm.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { warehouseApiBase, warehouseHeaders } from './warehouseApi.js'
import WarehousePurchaseModal from './WarehousePurchaseModal.jsx'

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function WarehousePurchases() {
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const [items, setItems] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [detail, setDetail] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (supplierId) qs.set('supplierId', supplierId)
      if (from) qs.set('from', from)
      if (to) qs.set('to', to)
      const [a, b, c] = await Promise.all([
        fetch(`${warehouseApiBase()}/api/warehouse/items`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${warehouseApiBase()}/api/warehouse/suppliers`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${warehouseApiBase()}/api/warehouse/purchases?${qs}`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (a.ok) setItems(await a.json())
      if (b.ok) setSuppliers(await b.json())
      if (c.ok) setPurchases(await c.json())
    } catch {
      toast.error('Could not load purchases')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [token, supplierId, from, to])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return purchases
    return purchases.filter(p => {
      const blob = [
        p.invoiceNo, p.supplierName, p.notes, p.date,
        ...(p.items || []).map(i => i.name),
      ].join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [purchases, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / limit))
  const pageSafe = Math.min(page, totalPages)
  const rows = filtered.slice((pageSafe - 1) * limit, pageSafe * limit)

  const deletePurchase = async (p) => {
    const ok = await confirm({
      title: 'Delete purchase',
      message: `Delete invoice ${p.invoiceNo || String(p._id).slice(-6)} and reverse stock?`,
    })
    if (!ok) return
    try {
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/purchases/${p._id}`, {
        method: 'DELETE',
        headers: warehouseHeaders(token),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Delete failed')
      toast.success('Purchase deleted')
      if (detail?._id === p._id) setDetail(null)
      load()
    } catch (err) {
      toast.error(err.message || 'Failed')
    }
  }

  return (
    <div className="space-y-4">
      {ConfirmDialog}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-white">
            <ShoppingCart size={20} />
          </div>
          <div>
            <h1 className="page-title">Warehouse Purchases</h1>
            <p className="text-sm text-gray-500">One row per invoice — view, edit, or delete</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold dark:border-slate-600">
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => { setEditing(null); setFormOpen(true) }}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
          >
            + New purchase
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Supplier</label>
          <select className="rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={supplierId} onChange={e => { setSupplierId(e.target.value); setPage(1) }}>
            <option value="">All suppliers</option>
            {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </div>
        <div><DatePicker label="From" value={from} onChange={v => setFrom(v || '')} /></div>
        <div><DatePicker label="To" value={to} onChange={v => setTo(v || '')} /></div>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-semibold text-gray-500">Search</label>
          <input className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Invoice, item, supplier…" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-gray-500 dark:border-gray-700">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Paid</th>
              <th className="px-4 py-3 text-right">Left</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const totalAmt = Number(p.total) || 0
              const paid = Number(p.paidAmount) || 0
              const left = Math.max(0, totalAmt - paid)
              const status = left <= 0.0001 ? 'paid' : paid > 0 ? 'partial' : 'unpaid'
              const lineCount = (p.items || []).length
              return (
                <tr key={p._id} className="border-b dark:border-gray-700">
                  <td className="px-4 py-3 whitespace-nowrap">{p.date || '—'}</td>
                  <td className="px-4 py-3 font-medium">{p.supplierName || '—'}</td>
                  <td className="px-4 py-3">{p.invoiceNo || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {lineCount} item{lineCount === 1 ? '' : 's'}
                    {lineCount ? ` · ${(p.items || []).slice(0, 2).map(i => i.name).join(', ')}${lineCount > 2 ? '…' : ''}` : ''}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{money(totalAmt)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{money(paid)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${left > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{money(left)}</td>
                  <td className="px-4 py-3 capitalize">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      status === 'paid' ? 'bg-emerald-100 text-emerald-800' : status === 'partial' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                    }`}>{status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold dark:bg-slate-700" onClick={() => setDetail(p)}>View</button>
                      <button type="button" className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" onClick={() => { setEditing(p); setFormOpen(true) }}>Edit</button>
                      <button type="button" className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" onClick={() => deletePurchase(p)}>Delete</button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-500">{loading ? 'Loading…' : 'No purchases yet'}</td></tr>
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

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">Purchase {detail.invoiceNo || String(detail._id).slice(-6)}</h3>
                <p className="text-sm text-gray-500">{detail.date} · {detail.supplierName || '—'}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">✕</button>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl border p-3 dark:border-slate-700"><div className="text-xs text-slate-500">Total</div><div className="font-bold">{money(detail.total)}</div></div>
              <div className="rounded-xl border p-3 dark:border-slate-700"><div className="text-xs text-slate-500">Paid</div><div className="font-bold text-emerald-700">{money(detail.paidAmount)}</div></div>
              <div className="rounded-xl border p-3 dark:border-slate-700"><div className="text-xs text-slate-500">Left</div><div className="font-bold text-amber-600">{money(Math.max(0, (Number(detail.total) || 0) - (Number(detail.paidAmount) || 0)))}</div></div>
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-500 dark:border-slate-700">
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3 text-right">Unit cost</th>
                  <th className="py-2 text-right">Line</th>
                </tr>
              </thead>
              <tbody>
                {(detail.items || []).map((line, i) => (
                  <tr key={i} className="border-b dark:border-slate-700">
                    <td className="py-2 pr-3 font-medium">{line.name}</td>
                    <td className="py-2 pr-3">{line.qty} {line.unit || ''}</td>
                    <td className="py-2 pr-3 text-right">{money(line.unitCost)}</td>
                    <td className="py-2 text-right font-semibold">{money(line.lineTotal ?? (Number(line.qty) * Number(line.unitCost)))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.notes ? <p className="mt-3 text-sm text-gray-500">Note: {detail.notes}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold" onClick={() => { setEditing(detail); setDetail(null); setFormOpen(true) }}>Edit</button>
              <button type="button" className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white" onClick={() => deletePurchase(detail)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <WarehousePurchaseModal
        open={formOpen}
        initial={editing}
        suppliers={suppliers}
        catalog={items}
        onClose={(saved) => {
          setFormOpen(false)
          setEditing(null)
          if (saved) load()
        }}
      />
    </div>
  )
}
