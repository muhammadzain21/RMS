import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../state/AuthContext.jsx'
import { warehouseApiBase, warehouseHeaders } from './warehouseApi.js'

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function emptyLine() {
  return {
    warehouseItemId: '',
    search: '',
    name: '',
    category: '',
    unit: '',
    qty: '',
    unitCost: '',
    transferPrice: '',
    lowStock: '',
    expiry: '',
    isNew: false,
    showDrop: false,
  }
}

/**
 * Multi-line warehouse purchase invoice.
 * Search existing items (dropdown match + autofill) or type a new item name and fill details.
 */
export default function WarehousePurchaseModal({
  open,
  onClose,
  suppliers = [],
  catalog = [],
  initial = null,
}) {
  const { token } = useAuth()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    supplierId: '',
    invoiceNo: '',
    date: '',
    notes: '',
    paidAmount: '',
    paymentMethod: 'cash',
  })
  const [lines, setLines] = useState([emptyLine()])
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    if (initial?._id || initial?.id) {
      setForm({
        supplierId: initial.supplierId || '',
        invoiceNo: initial.invoiceNo || '',
        date: initial.date || '',
        notes: initial.notes || '',
        paidAmount: initial.paidAmount ?? '',
        paymentMethod: initial.paymentMethod || 'cash',
      })
      setLines((initial.items || []).length
        ? initial.items.map(l => ({
          warehouseItemId: l.warehouseItemId || '',
          search: l.name || '',
          name: l.name || '',
          category: l.category || '',
          unit: l.unit || '',
          qty: l.qty ?? '',
          unitCost: l.unitCost ?? '',
          transferPrice: l.transferPrice ?? l.unitCost ?? '',
          lowStock: l.lowStock ?? '',
          expiry: l.expiry ? String(l.expiry).slice(0, 10) : '',
          isNew: false,
          showDrop: false,
        }))
        : [emptyLine()])
    } else {
      setForm({
        supplierId: '',
        invoiceNo: '',
        date: new Date().toISOString().slice(0, 10),
        notes: '',
        paidAmount: '',
        paymentMethod: 'cash',
      })
      setLines([emptyLine()])
    }
  }, [open, initial])

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setLines(ls => ls.map(l => ({ ...l, showDrop: false })))
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const invoiceTotal = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0),
    [lines],
  )

  const matchesFor = (query) => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return catalog.slice(0, 12)
    return catalog.filter(i =>
      String(i.name || '').toLowerCase().includes(q)
      || String(i.category || '').toLowerCase().includes(q)
    ).slice(0, 12)
  }

  const updateLine = (idx, patch) => {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  const pickExisting = async (idx, item) => {
    const id = String(item._id || item.id)
    updateLine(idx, {
      warehouseItemId: id,
      search: item.name || '',
      name: item.name || '',
      category: item.category || '',
      unit: item.unit || '',
      unitCost: Number(item.costPrice) || 0,
      transferPrice: Number(item.transferPrice) || Number(item.costPrice) || 0,
      lowStock: Number(item.lowStock) || 0,
      expiry: item.expiry ? String(item.expiry).slice(0, 10) : '',
      isNew: false,
      showDrop: false,
      qty: lines[idx]?.qty || '',
    })
    try {
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/items/${id}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const j = await res.json()
      const lp = j.lastPurchase
      const it = j.item || item
      updateLine(idx, {
        warehouseItemId: id,
        search: it.name || item.name || '',
        name: it.name || item.name || '',
        category: it.category || '',
        unit: it.unit || '',
        unitCost: Number(lp?.unitCost) || Number(it.costPrice) || 0,
        transferPrice: Number(it.transferPrice) || Number(lp?.unitCost) || Number(it.costPrice) || 0,
        lowStock: Number(it.lowStock) || 0,
        expiry: it.expiry ? String(it.expiry).slice(0, 10) : '',
        isNew: false,
        showDrop: false,
      })
      if (lp?.supplierId) {
        setForm(f => f.supplierId ? f : { ...f, supplierId: lp.supplierId })
      }
    } catch {}
  }

  const markNewItem = (idx) => {
    const name = String(lines[idx]?.search || '').trim()
    if (!name) return toast.error('Type an item name first')
    updateLine(idx, {
      warehouseItemId: '',
      name,
      search: name,
      isNew: true,
      showDrop: false,
      qty: lines[idx]?.qty || 1,
      unitCost: lines[idx]?.unitCost || '',
      unit: lines[idx]?.unit || '',
    })
  }

  const save = async (e) => {
    e.preventDefault()
    if (!form.supplierId) return toast.error('Select a supplier')
    const payloadItems = lines
      .filter(l => String(l.name || l.search || '').trim() && Number(l.qty) > 0)
      .map(l => ({
        warehouseItemId: l.warehouseItemId || undefined,
        name: String(l.name || l.search).trim(),
        qty: Number(l.qty),
        unit: l.unit || '',
        unitCost: Number(l.unitCost) || 0,
        transferPrice: Number(l.transferPrice) || Number(l.unitCost) || 0,
        category: l.category || '',
        lowStock: Number(l.lowStock) || 0,
        expiry: l.expiry || '',
      }))
    if (!payloadItems.length) return toast.error('Add at least one item with quantity')

    setBusy(true)
    try {
      const id = initial?._id || initial?.id
      const url = id
        ? `${warehouseApiBase()}/api/warehouse/purchases/${id}`
        : `${warehouseApiBase()}/api/warehouse/purchases`
      const res = await fetch(url, {
        method: id ? 'PATCH' : 'POST',
        headers: warehouseHeaders(token),
        body: JSON.stringify({
          ...form,
          paidAmount: Number(form.paidAmount) || 0,
          items: payloadItems,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Save failed')
      toast.success(id ? 'Purchase updated' : 'Purchase saved — inventory updated')
      onClose(true)
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null
  const editing = !!(initial?._id || initial?.id)

  return (
    <div data-user-busy="1" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <form
        ref={wrapRef}
        onSubmit={save}
        className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800"
      >
        <div className="flex items-center justify-between border-b px-6 py-4 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-bold">{editing ? 'Edit warehouse purchase' : 'Add inventory / purchase'}</h3>
            <p className="text-xs text-slate-500">Search items to autofill, or type a new name and enter details. Multiple lines = one invoice.</p>
          </div>
          <button type="button" onClick={() => onClose(false)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">✕</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">Supplier</label>
              <select
                required
                className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={form.supplierId}
                onChange={e => setForm({ ...form, supplierId: e.target.value })}
              >
                <option value="">Select supplier…</option>
                {suppliers.map(s => <option key={s._id || s.id} value={s._id || s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Invoice #</label>
              <input className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.invoiceNo} onChange={e => setForm({ ...form, invoiceNo: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Date</label>
              <input type="date" className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>

          <div className="space-y-3">
            {lines.map((line, idx) => {
              const matches = matchesFor(line.search)
              const ready = !!(line.warehouseItemId || line.isNew || line.name)
              return (
                <div key={idx} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="relative mb-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Item {idx + 1}</label>
                    <input
                      className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                      placeholder="Type to search inventory…"
                      value={line.search}
                      onChange={e => updateLine(idx, {
                        search: e.target.value,
                        warehouseItemId: '',
                        isNew: false,
                        name: '',
                        showDrop: true,
                      })}
                      onFocus={() => updateLine(idx, { showDrop: true })}
                      autoComplete="off"
                    />
                    {line.showDrop && (
                      <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-xl border bg-white shadow-lg dark:border-slate-600 dark:bg-slate-900">
                        {matches.map(it => (
                          <button
                            key={it._id || it.id}
                            type="button"
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50 dark:hover:bg-slate-800"
                            onClick={() => pickExisting(idx, it)}
                          >
                            <span className="font-medium">{it.name}</span>
                            <span className="text-xs text-slate-500">{it.qty} {it.unit} · {money(it.costPrice)}</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          className="w-full border-t px-3 py-2 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-slate-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                          onClick={() => markNewItem(idx)}
                        >
                          + Add as new item{line.search.trim() ? `: “${line.search.trim()}”` : ''}
                        </button>
                      </div>
                    )}
                  </div>

                  {ready && (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {(line.isNew || !line.warehouseItemId) && (
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-xs font-semibold text-slate-500">Item name</label>
                          <input
                            className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                            value={line.name}
                            onChange={e => updateLine(idx, { name: e.target.value, search: e.target.value })}
                          />
                        </div>
                      )}
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Qty</label>
                        <input type="number" min="0.01" step="any" className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={line.qty} onChange={e => updateLine(idx, { qty: e.target.value })} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Unit</label>
                        <input className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={line.unit} onChange={e => updateLine(idx, { unit: e.target.value })} placeholder="kg, pcs…" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Unit cost</label>
                        <input type="number" min="0" step="any" className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={line.unitCost} onChange={e => updateLine(idx, { unitCost: e.target.value, transferPrice: e.target.value })} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Transfer price</label>
                        <input type="number" min="0" step="any" className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={line.transferPrice} onChange={e => updateLine(idx, { transferPrice: e.target.value })} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Category</label>
                        <input className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={line.category} onChange={e => updateLine(idx, { category: e.target.value })} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Low stock</label>
                        <input type="number" className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={line.lowStock} onChange={e => updateLine(idx, { lowStock: e.target.value })} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Expiry</label>
                        <input type="date" className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={line.expiry || ''} onChange={e => updateLine(idx, { expiry: e.target.value })} />
                      </div>
                      <div className="flex items-end justify-between gap-2 sm:col-span-2 lg:col-span-4">
                        <div className="text-xs text-slate-500">
                          Line total: <span className="font-bold text-slate-800 dark:text-slate-100">{money((Number(line.qty) || 0) * (Number(line.unitCost) || 0))}</span>
                          {line.warehouseItemId ? ' · existing item' : ' · new inventory item'}
                        </div>
                        {lines.length > 1 && (
                          <button type="button" className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}>
                            Remove line
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <button
            type="button"
            className="rounded-xl border border-dashed px-3 py-2 text-sm font-semibold text-indigo-600 dark:border-slate-600"
            onClick={() => setLines(ls => [...ls, emptyLine()])}
          >
            + Add another item
          </button>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Paid now</label>
              <input type="number" min="0" step="any" className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.paidAmount} onChange={e => setForm({ ...form, paidAmount: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Payment method</label>
              <select className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Invoice total</label>
              <div className="rounded-xl border bg-slate-50 px-3 py-2.5 text-sm font-bold dark:border-slate-600 dark:bg-slate-900">{money(invoiceTotal)}</div>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Notes</label>
            <input className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4 dark:border-slate-700">
          <button type="button" onClick={() => onClose(false)} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Cancel</button>
          <button disabled={busy} type="submit" className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
            {busy ? 'Saving…' : (editing ? 'Update purchase' : 'Save purchase')}
          </button>
        </div>
      </form>
    </div>
  )
}
