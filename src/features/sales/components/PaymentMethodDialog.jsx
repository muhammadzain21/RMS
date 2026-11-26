import React, { useEffect, useMemo, useState } from 'react'
import { BANK_CHANNELS, bankChannelLabel } from '@features/sales/components/BankPaymentDialog.jsx'

const QUICK = [10, 20, 50, 100]
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0']

function itemLabel(it) {
  const size = String(it?.mods?.size || it?.size || '').trim().toUpperCase()
  const base = it?.name || it?.custom?.name || it?.itemName || 'Item'
  return size ? `${base} (${size})` : base
}

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function methodLabel(p) {
  const m = String(p?.method || '').toLowerCase()
  if (m === 'bank') return `Bank (${bankChannelLabel(p.bankChannel) || p.bankChannel || 'Transfer'}${p.bankLast4 ? ` ····${p.bankLast4}` : ''})`
  if (m === 'card') return `Card${p.bankLast4 ? ` ····${p.bankLast4}` : ''}`
  if (m === 'staff') return `Staff (${p.staffName || 'Member'})`
  if (m === 'foodpanda') return 'Foodpanda'
  if (m === 'cash') return 'Cash'
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : 'Pay'
}

let paySeq = 0
function nextPayId() {
  paySeq += 1
  return `p${Date.now()}_${paySeq}`
}

export default function PaymentMethodDialog({
  open,
  totalAmount = 0,
  items = [],
  tableNo = '',
  waiterName = '',
  orderType = '',
  initialMethod = 'cash',
  initialBankChannel = 'ubl',
  initialLast4 = '',
  initialCashReceived = 0,
  initialStaffId = '',
  initialRiderId = '',
  staff = [],
  riders = [],
  locked = false,
  onConfirm = () => {},
  onCancel = () => {},
}) {
  const due = Math.max(0, Math.round(Number(totalAmount) || 0))
  const isDelivery = String(orderType || '').toLowerCase() === 'delivery'
  const [display, setDisplay] = useState('')
  const [method, setMethod] = useState('cash')
  const [bankChannel, setBankChannel] = useState('ubl')
  const [last4, setLast4] = useState('')
  const [staffId, setStaffId] = useState('')
  const [riderId, setRiderId] = useState('')
  const [err, setErr] = useState('')
  const [splitN, setSplitN] = useState('')
  const [payments, setPayments] = useState([])

  const activeStaff = useMemo(
    () => (staff || []).filter(s => s.status !== 'Inactive' && s.status !== 'inactive'),
    [staff],
  )
  const chosenStaff = activeStaff.find(s => String(s.id) === String(staffId))
  const chosenRider = (riders || []).find(r => String(r.id) === String(riderId))

  const amount = useMemo(() => {
    const n = Number(String(display || '').replace(/,/g, ''))
    return Number.isFinite(n) ? Math.max(0, n) : 0
  }, [display])

  const paidTowardBill = useMemo(
    () => payments.reduce((s, p) => s + Number(p.amount || 0), 0),
    [payments],
  )
  const remaining = Math.max(0, due - paidTowardBill)

  const lines = useMemo(() => {
    return (Array.isArray(items) ? items : []).map((it, i) => {
      const qty = Number(it.qty || 0)
      const price = Number(it.price != null ? it.price : (it.custom?.price || 0))
      return { key: i, qty, name: itemLabel(it), amount: qty * price }
    })
  }, [items])

  const invoiceTotal = useMemo(
    () => lines.reduce((s, l) => s + Number(l.amount || 0), 0) || due,
    [lines, due],
  )

  useEffect(() => {
    if (!open) return
    setMethod(initialMethod || 'cash')
    const ch = String(initialBankChannel || '').toLowerCase()
    setBankChannel(BANK_CHANNELS.some(c => c.key === ch) ? ch : 'ubl')
    setLast4(initialLast4 || '')
    const start = Math.floor(Number(initialCashReceived) || due || 0)
    setDisplay(start ? String(start) : (due ? String(due) : ''))
    setStaffId(initialStaffId || '')
    setRiderId(initialRiderId || '')
    setSplitN('')
    setPayments([])
    setErr('')
  }, [open, initialMethod, initialBankChannel, initialLast4, initialCashReceived, initialStaffId, initialRiderId, due])

  // After each tender, refresh keypad to remaining balance
  useEffect(() => {
    if (!open) return
    if (remaining > 0) setDisplay(String(remaining))
    else if (payments.length) setDisplay('')
  }, [remaining]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const setAmountValue = (n) => {
    const v = Math.max(0, Math.round(Number(n) || 0))
    setDisplay(v ? String(v) : '')
    setErr('')
  }

  const appendKey = (k) => {
    setErr('')
    setDisplay((prev) => {
      const cur = String(prev || '')
      if (k === '.') {
        if (cur.includes('.')) return cur
        return cur ? `${cur}.` : '0.'
      }
      if (cur === '0' && k !== '.') return k
      return `${cur}${k}`
    })
  }

  const addQuick = (n) => setAmountValue(amount + Number(n))

  const finish = (list, tipAmount = 0) => {
    if (locked) return
    let pays = Array.isArray(list) ? list : payments
    // Zero-total bills (e.g. fully discounted / package priced elsewhere): record as cash 0
    if (!pays.length && due <= 0) {
      pays = [{ id: nextPayId(), method: 'cash', amount: 0, bankChannel: '', bankLast4: '', staffId: '', staffName: '' }]
    }
    if (!pays.length) {
      setErr('Add at least one payment method')
      return
    }
    const paid = pays.reduce((s, p) => s + Number(p.amount || 0), 0)
    // Payments may include tip in the method amount (paid >= due)
    if (due > 0 && paid + 0.0001 < due) {
      setErr(`Still short ${fmt(due - paid)} — add another method`)
      return
    }
    const primary = pays[0]
    const tip = Math.max(0, Number(tipAmount) || Math.max(0, paid - due))
    const rider = isDelivery && riderId
      ? { id: String(riderId), name: chosenRider?.name || '' }
      : null
    const usesFoodpanda = pays.some(p => String(p.method || '').toLowerCase() === 'foodpanda')
    onConfirm({
      method: pays.length === 1 ? primary.method : 'split',
      payments: pays.map(p => ({
        method: p.method,
        amount: Number(p.amount || 0),
        bankChannel: p.bankChannel || '',
        bankLast4: p.bankLast4 || '',
        staffId: p.staffId || '',
        staffName: p.staffName || '',
      })),
      bankChannel: pays.find(p => p.method === 'bank')?.bankChannel || '',
      bankLast4: pays.find(p => p.method === 'bank' || p.method === 'card')?.bankLast4 || '',
      // Full amount collected on the tender(s), including tip
      cashReceived: Math.max(paid, due + tip),
      tipAmount: tip,
      staffId: pays.find(p => p.method === 'staff')?.staffId || '',
      staffName: pays.find(p => p.method === 'staff')?.staffName || '',
      riderId: rider?.id || '',
      riderName: rider?.name || '',
      rider,
      // Foodpanda tender also records order type so FP rates / My Day bucket apply
      orderType: usesFoodpanda ? 'Foodpanda' : undefined,
    })
  }

  const addTender = (nextMethod, extra = {}) => {
    if (locked) return
    const m = nextMethod || method
    setMethod(m)
    setErr('')

    // Nothing left to collect — complete instead of blocking with a missing button
    if (remaining <= 0) {
      finish(payments.length ? payments : undefined)
      return
    }

    let take = Math.round(amount > 0 ? amount : remaining)
    if (take <= 0) {
      setErr('Enter an amount first')
      return
    }

    if (m === 'bank' && !(extra.bankChannel || bankChannel)) {
      setErr('Select a bank')
      return
    }
    const useLast4 = extra.bankLast4 != null ? extra.bankLast4 : last4
    if ((m === 'bank' || m === 'card') && useLast4 && !/^\d{4}$/.test(String(useLast4))) {
      setErr('Last 4 digits must be exactly 4 digits (or leave empty)')
      return
    }
    const useStaffId = extra.staffId != null ? extra.staffId : staffId
    const staffRow = activeStaff.find(s => String(s.id) === String(useStaffId))
    if (m === 'staff' && (!useStaffId || !staffRow)) {
      setErr('Select the staff member')
      return
    }

    // Overpayment on cash / card / bank / foodpanda = waiter tip.
    // Tip stays IN the method amount so the bill shows full collected on that tender.
    let tipExtra = 0
    const tipAllowed = m === 'cash' || m === 'card' || m === 'bank' || m === 'foodpanda'
    if (tipAllowed && take > remaining) {
      tipExtra = take - remaining
      // keep `take` as full collected (bill portion + tip)
    } else if (take > remaining) {
      take = remaining
    }

    const entry = {
      id: nextPayId(),
      method: m,
      amount: take,
      bankChannel: m === 'bank' ? String(extra.bankChannel || bankChannel || '') : '',
      bankLast4: (m === 'bank' || m === 'card') ? String(useLast4 || '') : '',
      staffId: m === 'staff' ? String(staffRow?.id || '') : '',
      staffName: m === 'staff' ? (staffRow?.name || '') : '',
    }

    const next = [...payments, entry]
    setPayments(next)
    setMethod('cash')

    // Bill portion covered = sum of amounts minus tips embedded in this add
    const nextBillCovered = next.reduce((s, p) => s + Number(p.amount || 0), 0) - tipExtra
    if (nextBillCovered + 0.0001 >= due) {
      finish(next, tipExtra)
    }
  }

  const removePayment = (id) => {
    setPayments(prev => prev.filter(p => p.id !== id))
    setErr('')
  }

  const headerBits = [
    tableNo ? `Table: ${tableNo}` : '',
    waiterName ? `: ${String(waiterName).toUpperCase()}` : '',
    orderType ? `(${orderType})` : '',
  ].filter(Boolean).join(' ')

  const btnBase =
    'h-12 sm:h-14 rounded-xl border text-lg font-bold shadow-sm active:scale-[0.98] transition select-none'
  const numBtn = `${btnBase} bg-[#f3f0ea] border-[#d9d2c6] text-[#5c4033] hover:bg-[#ebe6dc]`
  const greenBtn = `${btnBase} bg-[#6f9e3e] border-[#5d8633] text-white hover:bg-[#628c36]`
  const tealBtn = `${btnBase} bg-[#2f8f9d] border-[#277987] text-white hover:bg-[#287f8c]`
  const allBtn = `${btnBase} bg-[#1e4d8c] border-[#183d70] text-white hover:bg-[#1a437a]`

  return (
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 p-2 sm:p-4"
      onClick={onCancel}
    >
      <div
        className="flex w-[min(1100px,98vw)] max-h-[94dvh] overflow-hidden rounded-2xl border border-[#d7cfc3] bg-[#f7f3ec] shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
      >
        {/* LEFT — receipt + split list */}
        <aside className="hidden w-[32%] min-w-[220px] flex-col border-r border-[#e0d7cb] bg-[#faf7f2] p-4 sm:flex">
          <div className="mb-3 text-[13px] font-semibold text-[#6b4f3f]">
            {headerBits || 'Payment'}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-[13px] text-[#5c4033]">
              <tbody>
                {lines.length ? lines.map(l => (
                  <tr key={l.key} className="align-top">
                    <td className="py-1 pr-2 whitespace-nowrap">{l.qty} x</td>
                    <td className="py-1 pr-2">{l.name}</td>
                    <td className="py-1 text-right whitespace-nowrap">{fmt(l.amount)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td className="py-6 text-center text-[#9a8576]" colSpan={3}>No line items</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-1 border-t border-[#e0d7cb] pt-3 text-[14px] font-semibold text-[#5c4033]">
            <div className="flex justify-between"><span>Invoice Total:</span><span>{fmt(invoiceTotal)}</span></div>
            <div className="flex justify-between"><span>Grand Total:</span><span>{fmt(due)}</span></div>
            <div className="flex justify-between text-[#2f8f9d]"><span>Paid:</span><span>{fmt(paidTowardBill)}</span></div>
            <div className={`flex justify-between ${remaining > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              <span>Remaining:</span><span>{fmt(remaining)}</span>
            </div>
          </div>
          {payments.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-[#e0d7cb] pt-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#8a7364]">Split payments</div>
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/80 px-2 py-1.5 text-[12px] text-[#5c4033]">
                  <span className="truncate font-semibold">{methodLabel(p)}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-bold tabular-nums">{fmt(p.amount)}</span>
                    <button type="button" onClick={() => removePayment(p.id)} className="text-rose-600 font-bold" title="Remove">×</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* CENTER — totals + keypad */}
        <section className="flex min-w-0 flex-1 flex-col p-3 sm:p-4 overflow-y-auto">
          <div className="mb-2 flex items-end justify-between gap-3 text-[#6b4f3f]">
            <div>
              <div className="text-sm font-semibold sm:text-base">Total: {fmt(due)}</div>
              <div className="text-sm font-semibold sm:text-base">Remaining: {fmt(remaining)}</div>
              <div className="text-xs text-[#8a7364]">Enter amount, then tap a method (split allowed)</div>
            </div>
            <div className="sm:hidden text-xs text-[#8a7364]">{headerBits}</div>
          </div>

          {isDelivery && (
            <div className="mb-3 rounded-xl border border-[#e0d7cb] bg-white/80 p-3">
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#8a7364]">
                Assign Rider <span className="font-normal normal-case">(optional)</span>
              </label>
              <select
                value={riderId}
                onChange={e => { setRiderId(e.target.value); setErr('') }}
                className="w-full rounded-lg border border-[#d9d2c6] bg-white px-3 py-2.5 text-sm font-semibold text-[#5c4033] outline-none focus:border-[#a89078]"
              >
                <option value="">No rider</option>
                {(riders || []).map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {(riders || []).length === 0 && (
                <p className="mt-1.5 text-xs text-[#9a8576]">No active riders found in staff.</p>
              )}
            </div>
          )}

          <input
            type="text"
            inputMode="decimal"
            value={display}
            onChange={e => { setDisplay((e.target.value || '').replace(/[^\d.]/g, '')); setErr('') }}
            placeholder="0"
            className="mb-3 w-full rounded-lg border-2 border-[#cfc5b6] bg-white px-3 py-2.5 text-right text-xl font-semibold text-[#5c4033] outline-none focus:border-[#a89078]"
          />

          <div className="grid flex-1 grid-cols-4 gap-2 content-start">
            {QUICK.map(n => (
              <button key={n} type="button" className={greenBtn} onClick={() => addQuick(n)}>{n}</button>
            ))}

            {KEYS.slice(0, 3).map(k => (
              <button key={k} type="button" className={numBtn} onClick={() => appendKey(k)}>{k}</button>
            ))}
            <button type="button" className={allBtn} onClick={() => setAmountValue(remaining || due)}>ALL</button>

            {KEYS.slice(3, 6).map(k => (
              <button key={k} type="button" className={numBtn} onClick={() => appendKey(k)}>{k}</button>
            ))}
            <button type="button" className={tealBtn} onClick={() => setAmountValue((remaining || due) / 2)}>1/2</button>

            {KEYS.slice(6, 9).map(k => (
              <button key={k} type="button" className={numBtn} onClick={() => appendKey(k)}>{k}</button>
            ))}
            <button type="button" className={tealBtn} onClick={() => setAmountValue((remaining || due) / 3)}>1/3</button>

            <button type="button" className={numBtn} onClick={() => appendKey('.')}>.</button>
            <button type="button" className={numBtn} onClick={() => appendKey('0')}>0</button>
            <button
              type="button"
              className={numBtn}
              onClick={() => {
                const n = Math.max(1, Number(splitN) || 0)
                if (!n) { setErr('Enter n for 1/n'); return }
                setAmountValue((remaining || due) / n)
              }}
            >1/n</button>
            <button type="button" className={`${btnBase} bg-white border-[#d9d2c6] text-[#5c4033] hover:bg-[#f3f0ea]`} onClick={() => { setDisplay(''); setErr('') }}>C</button>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={splitN}
              onChange={e => setSplitN((e.target.value || '').replace(/\D+/g, '').slice(0, 3))}
              placeholder="n"
              className="w-16 rounded-lg border border-[#d9d2c6] bg-white px-2 py-1.5 text-center text-sm text-[#5c4033]"
              title="Split into n parts"
            />
            <span className="text-xs text-[#8a7364]">for 1/n · tip = amount over remaining (cash/card/bank/FP)</span>
          </div>

          {payments.length > 0 && (
            <div className="mt-3 space-y-1.5 rounded-xl border border-[#e0d7cb] bg-white/70 p-2 sm:hidden">
              {payments.map(p => (
                <div key={p.id} className="flex justify-between text-xs font-semibold text-[#5c4033]">
                  <span>{methodLabel(p)}</span>
                  <span className="flex gap-2">
                    {fmt(p.amount)}
                    <button type="button" onClick={() => removePayment(p.id)} className="text-rose-600">×</button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {(method === 'bank' || method === 'card' || method === 'staff') && remaining > 0 && (
            <div className="mt-3 space-y-2 rounded-xl border border-[#e0d7cb] bg-white/70 p-3">
              {method === 'bank' && (
                <div className="grid grid-cols-2 gap-1.5">
                  {BANK_CHANNELS.map(c => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setBankChannel(c.key)}
                      className={`rounded-lg border px-2 py-2 text-xs font-bold ${
                        bankChannel === c.key
                          ? 'border-[#1e4d8c] bg-[#1e4d8c] text-white'
                          : 'border-[#d9d2c6] bg-white text-[#5c4033]'
                      }`}
                    >{c.label}</button>
                  ))}
                </div>
              )}
              {(method === 'bank' || method === 'card') && (
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Last 4 digits (optional)"
                  value={last4}
                  onChange={e => setLast4((e.target.value || '').replace(/\D+/g, '').slice(0, 4))}
                  className="w-full rounded-lg border border-[#d9d2c6] bg-white px-3 py-2 text-sm text-[#5c4033]"
                />
              )}
              {method === 'staff' && (
                <select
                  value={staffId}
                  onChange={e => setStaffId(e.target.value)}
                  className="w-full rounded-lg border border-[#d9d2c6] bg-white px-3 py-2 text-sm text-[#5c4033]"
                >
                  <option value="">Select staff…</option>
                  {activeStaff.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.branchName ? ` (${s.branchName})` : ''}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => addTender(method)}
                className="w-full rounded-xl bg-[#1e4d8c] py-2.5 text-sm font-bold text-white"
              >
                {(() => {
                  const take = amount > 0 ? amount : remaining
                  const tip = method !== 'staff' && take > remaining ? take - remaining : 0
                  const label = method === 'bank' ? (bankChannelLabel(bankChannel) || 'Bank') : method === 'card' ? 'Card' : 'Staff'
                  if (tip > 0) return `Add ${label} ${fmt(remaining)} + tip ${fmt(tip)}`
                  return `Add ${label} ${fmt(take > 0 ? Math.min(take, remaining) : remaining)}`
                })()}
              </button>
            </div>
          )}

          {(remaining <= 0 && (payments.length > 0 || due <= 0)) && (
            <button
              type="button"
              disabled={locked}
              onClick={() => finish(payments)}
              className="mt-3 w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              Complete Payment
            </button>
          )}

          {err && <div className="mt-2 text-sm font-semibold text-rose-600">{err}</div>}
        </section>

        {/* RIGHT — payment methods */}
        <aside className="flex w-[28%] min-w-[140px] max-w-[210px] flex-col gap-2.5 border-l border-[#e0d7cb] bg-[#faf7f2] p-3 sm:p-4">
          <button type="button" onClick={() => addTender('cash')} className="rounded-full bg-[#3aa6a0] px-3 py-3 text-sm font-bold text-white shadow hover:brightness-105 sm:py-3.5 sm:text-base">
            Cash
          </button>
          <button
            type="button"
            onClick={() => { setMethod('card'); setErr('') }}
            className={`rounded-full px-3 py-3 text-sm font-bold text-white shadow hover:brightness-105 sm:py-3.5 sm:text-base ${method === 'card' ? 'bg-[#2f5fb0] ring-2 ring-[#1e3f7a]' : 'bg-[#3d6ec4]'}`}
          >
            Credit Card
          </button>
          <button
            type="button"
            onClick={() => { setMethod('bank'); setErr('') }}
            className={`rounded-full px-3 py-3 text-sm font-bold text-white shadow hover:brightness-105 sm:py-3.5 sm:text-base ${method === 'bank' ? 'bg-[#2f5fb0] ring-2 ring-[#1e3f7a]' : 'bg-[#3d6ec4]'}`}
          >
            Bank Account
          </button>
          <button
            type="button"
            onClick={() => { setMethod('staff'); setErr('') }}
            className={`rounded-full px-3 py-3 text-sm font-bold text-white shadow hover:brightness-105 sm:py-3.5 sm:text-base ${method === 'staff' ? 'bg-[#2f5fb0] ring-2 ring-[#1e3f7a]' : 'bg-[#3d6ec4]'}`}
          >
            Staff Charge
          </button>
          <button
            type="button"
            onClick={() => addTender('foodpanda')}
            className="rounded-full bg-[#c5d86a] px-3 py-3 text-sm font-bold text-[#3f4a16] shadow hover:brightness-105 sm:py-3.5 sm:text-base"
          >
            Foodpanda
          </button>
          <button type="button" onClick={onCancel} className="mt-auto rounded-full bg-[#e53935] px-3 py-3 text-sm font-bold text-white shadow hover:brightness-105 sm:py-3.5 sm:text-base">
            Close
          </button>
        </aside>
      </div>
    </div>
  )
}
