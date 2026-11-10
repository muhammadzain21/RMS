import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useAuth } from '../state/AuthContext.jsx'
import { useData } from '../state/DataContext.jsx'
import DatePicker from './DatePicker.jsx'

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function emptyLine() {
  return {
    ingredientId: '',
    search: '',
    name: '',
    category: '',
    unit: '',
    qty: '',
    price: '',
    lowStock: '',
    expiry: '',
    isNew: false,
    showDrop: false,
  }
}

/**
 * Multi-line branch purchase invoice.
 * Search existing inventory (dropdown + autofill) or add a new item inline.
 */
export default function BranchPurchaseModal({
  open,
  onClose,
  items = [],
  suppliers = [],
  initial = null,
  businessDate = '',
}) {
  const { token } = useAuth()
  const { dispatch } = useData()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    supplierId: '',
    invoiceNo: '',
    date: '',
    notes: '',
  })
  const [lines, setLines] = useState([emptyLine()])
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    if (initial?.id || initial?._id) {
      setForm({
        supplierId: initial.supplierId || '',
        invoiceNo: initial.invoiceNo || '',
        date: initial.date || '',
        notes: initial.notes || '',
      })
      setLines((initial.items || []).length
        ? initial.items.map(l => ({
          ingredientId: l.ingredientId || '',
          search: l.name || '',
          name: l.name || '',
          category: l.category || '',
          unit: l.unit || '',
          qty: l.qty ?? '',
          price: l.price ?? '',
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
        date: String(businessDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        notes: '',
      })
      setLines([emptyLine()])
    }
  }, [open, initial, businessDate])

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
    () => lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0),
    [lines],
  )

  const matchesFor = (query) => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return (items || []).slice(0, 12)
    return (items || []).filter(i =>
      String(i.name || '').toLowerCase().includes(q)
      || String(i.category || '').toLowerCase().includes(q)
    ).slice(0, 12)
  }

  const updateLine = (idx, patch) => {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  const pickExisting = (idx, item) => {
    updateLine(idx, {
      ingredientId: item.id || item._id || '',
      search: item.name || '',
      name: item.name || '',
      category: item.category || '',
      unit: item.unit || '',
      price: item.price ?? '',
      lowStock: item.lowStock ?? '',
      expiry: item.expiry ? String(item.expiry).slice(0, 10) : '',
      isNew: false,
      showDrop: false,
      qty: lines[idx]?.qty || '',
    })
    if (item.supplierId) {
      setForm(f => f.supplierId ? f : { ...f, supplierId: item.supplierId })
    }
  }

  const markNewItem = (idx) => {
    const name = String(lines[idx]?.search || '').trim()
    if (!name) return toast.error('Type an item name first')
    updateLine(idx, {
      ingredientId: '',
      name,
      search: name,
      isNew: true,
      showDrop: false,
      qty: lines[idx]?.qty || 1,
      price: lines[idx]?.price || '',
      unit: lines[idx]?.unit || 'kg',
      category: lines[idx]?.category || '',
    })
  }

  const save = async (e) => {
    e.preventDefault()
    if (!form.supplierId) return toast.error('Select a supplier')
    if (!form.date) return toast.error('Date is required')
    const payloadItems = lines
      .filter(l => String(l.name || l.search || '').trim() && Number(l.qty) > 0)
      .map(l => ({
        ingredientId: l.ingredientId || undefined,
        name: String(l.name || l.search).trim(),
        qty: Number(l.qty),
        unit: l.unit || '',
        price: Number(l.price) || 0,
        category: l.category || '',
        lowStock: Number(l.lowStock) || 0,
        expiry: l.expiry || '',
      }))
    if (!payloadItems.length) return toast.error('Add at least one item with quantity')

    const supplier = (suppliers || []).find(s => String(s.id || s._id) === String(form.supplierId))
    setBusy(true)
    try {
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const id = initial?.id || initial?._id
      const url = id ? `${API}/api/supplies/${id}` : `${API}/api/supplies`
      const res = await fetch(url, {
        method: id ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify({
          date: form.date,
          supplierId: form.supplierId,
          supplier: supplier?.name || supplier?.company || '',
          invoiceNo: form.invoiceNo || '',
          notes: form.notes || '',
          items: payloadItems,
          cost: Number(invoiceTotal.toFixed(2)),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Save failed')

      // Refresh supplies + ingredients
      try {
        const [sRes, iRes] = await Promise.all([
          fetch(`${API}/api/supplies`, { headers }),
          fetch(`${API}/api/ingredients`, { headers }),
        ])
        const patch = {}
        if (sRes.ok) {
          const rows = await sRes.json()
          patch.supplies = (rows || []).map(x => ({ ...x, id: x.id || x._id }))
        }
        if (iRes.ok) {
          const rows = await iRes.json()
          patch.ingredients = (rows || []).map(x => ({ ...x, id: x.id || x._id }))
        }
        if (Object.keys(patch).length) dispatch({ type: 'HYDRATE', payload: patch })
      } catch {}

      toast.success(id ? 'Purchase updated' : 'Purchase saved — inventory updated')
      onClose(true)
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null
  const editing = !!(initial?.id || initial?._id)

  return (
    <div data-user-busy="1" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <form
        ref={wrapRef}
        onSubmit={save}
        className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800"
      >
        <div className="flex items-center justify-between border-b px-6 py-4 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-bold">{editing ? 'Edit branch purchase' : 'Add inventory / purchase'}</h3>
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
                {(suppliers || []).map(s => (
                  <option key={s.id || s._id} value={s.id || s._id}>{s.name || s.company}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Invoice #</label>
              <input className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.invoiceNo} onChange={e => setForm({ ...form, invoiceNo: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Date</label>
              <DatePicker value={form.date} onChange={v => setForm({ ...form, date: v || '' })} />
            </div>
          </div>

          <div className="space-y-3">
            {lines.map((line, idx) => {
              const matches = matchesFor(line.search)
              const ready = !!(line.ingredientId || line.isNew || line.name)
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
                        ingredientId: '',
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
                            key={it.id || it._id}
                            type="button"
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50 dark:hover:bg-slate-800"
                            onClick={() => pickExisting(idx, it)}
                          >
                            <span className="font-medium">{it.name}</span>
                            <span className="text-xs text-slate-500">{it.qty} {it.unit} · {money(it.price)}</span>
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
                      {(line.isNew || !line.ingredientId) && (
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
                        <select className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={line.unit} onChange={e => updateLine(idx, { unit: e.target.value })}>
                          <option value="">Select…</option>
                          <option value="g">Grams (g)</option>
                          <option value="kg">Kilograms (kg)</option>
                          <option value="pcs">Pieces (pcs)</option>
                          <option value="ltr">Liters (ltr)</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Price / unit</label>
                        <input type="number" min="0" step="any" className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={line.price} onChange={e => updateLine(idx, { price: e.target.value })} />
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
                        <DatePicker value={line.expiry || ''} onChange={v => updateLine(idx, { expiry: v || '' })} />
                      </div>
                      <div className="flex items-end justify-between gap-2 sm:col-span-2 lg:col-span-4">
                        <div className="text-xs text-slate-500">
                          Line total: <span className="font-bold text-slate-800 dark:text-slate-100">{money((Number(line.qty) || 0) * (Number(line.price) || 0))}</span>
                          {line.ingredientId ? ' · existing item' : ' · new inventory item'}
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

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Notes</label>
            <input className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="rounded-xl border bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
            Invoice total: <span className="font-bold">{money(invoiceTotal)}</span>
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
