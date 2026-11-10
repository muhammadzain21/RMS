import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { Wallet } from 'lucide-react'
import DatePicker from '../../components/DatePicker.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { warehouseApiBase, warehouseHeaders } from './warehouseApi.js'

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function WarehousePaymentModal({ open, onClose, supplier, balanceDue, preselectPurchaseId = '' }) {
  const { token } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [loadingInv, setLoadingInv] = useState(false)
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    method: 'cash',
    notes: '',
    purchaseId: '',
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !supplier) return
    let cancelled = false
    ;(async () => {
      setLoadingInv(true)
      try {
        const sid = supplier._id || supplier.id
        const res = await fetch(
          `${warehouseApiBase()}/api/warehouse/purchases?supplierId=${encodeURIComponent(sid)}&open=1`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const list = res.ok ? await res.json() : []
        if (cancelled) return
        setInvoices(Array.isArray(list) ? list : [])
        const preferred = preselectPurchaseId && list.some(p => String(p._id) === String(preselectPurchaseId))
          ? String(preselectPurchaseId)
          : (list[0]?._id ? String(list[0]._id) : '')
        const inv = list.find(p => String(p._id) === preferred)
        const due = inv ? Number(inv.balanceDue) : Number(balanceDue) || 0
        setForm({
          date: format(new Date(), 'yyyy-MM-dd'),
          amount: due > 0 ? String(due) : '',
          method: 'cash',
          notes: '',
          purchaseId: preferred,
        })
      } catch {
        if (!cancelled) setInvoices([])
      } finally {
        if (!cancelled) setLoadingInv(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, supplier, balanceDue, preselectPurchaseId, token])

  const selected = useMemo(
    () => invoices.find(p => String(p._id) === String(form.purchaseId)) || null,
    [invoices, form.purchaseId]
  )

  if (!open || !supplier) return null

  const onPickInvoice = (purchaseId) => {
    const inv = invoices.find(p => String(p._id) === String(purchaseId))
    const due = inv ? Number(inv.balanceDue) : 0
    setForm(f => ({
      ...f,
      purchaseId,
      amount: due > 0 ? String(due) : '',
    }))
  }

  const save = async (e) => {
    e.preventDefault()
    if (!form.purchaseId) return toast.error('Select a purchase invoice')
    const amount = Number(form.amount)
    if (!(amount > 0)) return toast.error('Enter a valid amount')
    if (!form.date) return toast.error('Select payment date')
    const remaining = Number(selected?.balanceDue) || 0
    if (amount > remaining + 0.0001) {
      return toast.error(`Amount exceeds invoice balance (${money(remaining)})`)
    }
    setBusy(true)
    try {
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/payments`, {
        method: 'POST',
        headers: warehouseHeaders(token),
        body: JSON.stringify({
          supplierId: supplier._id || supplier.id,
          purchaseId: form.purchaseId,
          date: form.date,
          amount,
          method: form.method,
          notes: form.notes,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed')
      const left = j.purchase?.balanceDue
      toast.success(
        left != null && left > 0.0001
          ? `Payment saved — ${money(left)} left on invoice`
          : 'Payment saved — invoice fully paid'
      )
      onClose(true)
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const invDue = Number(selected?.balanceDue) || 0
  const supplierDue = Number(balanceDue) || 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={() => !busy && onClose(false)} aria-hidden />
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 text-white dark:border-slate-700">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
              <Wallet size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold">Pay purchase invoice</h3>
              <p className="text-sm text-emerald-50/90">{supplier.name}</p>
            </div>
          </div>
          <button type="button" disabled={busy} onClick={() => onClose(false)} className="rounded-lg px-2 py-1 text-white/80 hover:bg-white/10">
            ✕
          </button>
        </div>

        <form onSubmit={save} className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Supplier due</div>
              <div className={`mt-0.5 text-xl font-black ${supplierDue > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {money(supplierDue)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">This invoice left</div>
              <div className={`mt-0.5 text-xl font-black ${invDue > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {selected ? money(invDue) : '—'}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Purchase invoice</label>
            {loadingInv ? (
              <div className="rounded-xl border px-3 py-2.5 text-sm text-slate-500">Loading open invoices…</div>
            ) : !invoices.length ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
                No unpaid invoices for this supplier.
              </div>
            ) : (
              <select
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold dark:border-slate-600 dark:bg-slate-900"
                value={form.purchaseId}
                onChange={e => onPickInvoice(e.target.value)}
              >
                <option value="">Select invoice…</option>
                {invoices.map(inv => (
                  <option key={inv._id} value={inv._id}>
                    {(inv.invoiceNo || String(inv._id).slice(-6))} · {inv.date} · Total {money(inv.total)} · Paid {money(inv.paidAmount)} · Left {money(inv.balanceDue)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selected && (
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 p-3 text-center text-sm dark:border-slate-700">
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-500">Invoice</div>
                <div className="font-bold">{money(selected.total)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-500">Paid</div>
                <div className="font-bold text-emerald-700">{money(selected.paidAmount)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-500">Left</div>
                <div className="font-bold text-amber-600">{money(selected.balanceDue)}</div>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <DatePicker
                label="Payment date"
                value={form.date}
                onChange={v => setForm(f => ({ ...f, date: v || '' }))}
                allowClear={false}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Amount (PKR)</label>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold dark:border-slate-600 dark:bg-slate-900"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
              />
              {invDue > 0 && (
                <button
                  type="button"
                  className="mt-1 text-[11px] font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                  onClick={() => setForm(f => ({ ...f, amount: String(invDue) }))}
                >
                  Pay remaining on this invoice
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Payment method</label>
            <div className="grid grid-cols-2 gap-2">
              {['cash', 'bank'].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm({ ...form, method: m })}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition ${
                    form.method === m
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Notes</label>
            <textarea
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900"
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional note"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
            <button type="button" disabled={busy} onClick={() => onClose(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold dark:border-slate-600">
              Cancel
            </button>
            <button
              disabled={busy || !form.purchaseId || !invoices.length}
              type="submit"
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
