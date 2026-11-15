import React, { useEffect, useMemo, useState } from 'react'

const METHODS = [
  { key: 'cash', label: 'Cash', active: 'from-emerald-500 to-emerald-600', border: 'border-emerald-400', inactive: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300' },
  { key: 'bank', label: 'Bank', active: 'from-blue-500 to-blue-600', border: 'border-blue-400', inactive: 'border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300' },
  { key: 'card', label: 'Card', active: 'from-indigo-500 to-indigo-600', border: 'border-indigo-400', inactive: 'border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300' },
  { key: 'complimentary', label: 'Personal', active: 'from-rose-500 to-rose-600', border: 'border-rose-400', inactive: 'border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300' },
  { key: 'staff', label: 'Staff', active: 'from-violet-500 to-violet-600', border: 'border-violet-400', inactive: 'border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300' },
]

const CASH_METHODS = new Set(['cash', 'card', 'bank'])

export default function PaymentMethodDialog({
  open,
  totalAmount = 0,
  initialMethod = 'cash',
  initialBankChannel = 'bank_account',
  initialLast4 = '',
  initialCashReceived = 0,
  initialStaffId = '',
  staff = [],
  showPersonalPayment = false,
  onConfirm = () => {},
  onCancel = () => {},
}) {
  const [method, setMethod] = useState(initialMethod || 'cash')
  const [last4, setLast4] = useState(initialLast4 || '')
  const [cashStr, setCashStr] = useState(String(Math.floor(Number(initialCashReceived) || 0)))
  const [staffId, setStaffId] = useState(initialStaffId || '')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setMethod(initialMethod || 'cash')
    setLast4(initialLast4 || '')
    setCashStr(String(Math.floor(Number(initialCashReceived) || Number(totalAmount) || 0)))
    setStaffId(initialStaffId || '')
    setErr('')
  }, [open, initialMethod, initialLast4, initialCashReceived, initialStaffId, totalAmount])

  const methods = useMemo(
    () => METHODS.filter(m => m.key !== 'complimentary' || showPersonalPayment),
    [showPersonalPayment],
  )

  const activeStaff = useMemo(
    () => (staff || []).filter(s => s.status !== 'Inactive' && s.status !== 'inactive'),
    [staff],
  )
  const chosenStaff = activeStaff.find(s => String(s.id) === String(staffId))
  const cashReceived = Math.max(0, Number(cashStr) || 0)
  const showCashReceived = CASH_METHODS.has(method)
  const tipAmount = showCashReceived ? Math.max(0, cashReceived - Number(totalAmount || 0)) : 0
  const due = Number(totalAmount || 0)

  if (!open) return null

  const confirm = () => {
    if (method === 'bank' || method === 'card') {
      if (last4 && !/^\d{4}$/.test(String(last4))) { setErr('Last 4 digits must be exactly 4 digits (or leave empty)'); return }
    }
    if (method === 'staff' && (!staffId || !chosenStaff)) {
      setErr('Select the staff member')
      return
    }
    onConfirm({
      method,
      bankChannel: '',
      bankLast4: (method === 'bank' || method === 'card') ? String(last4 || '') : '',
      cashReceived: showCashReceived ? cashReceived : 0,
      staffId: method === 'staff' ? String(chosenStaff?.id || '') : '',
      staffName: method === 'staff' ? (chosenStaff?.name || '') : '',
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4" onClick={onCancel}>
      <div
        className="w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-slate-50 to-white dark:from-gray-900 dark:to-gray-950">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Payment Method</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Choose how this bill is paid</p>
            </div>
            <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2 text-right shrink-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Total due</div>
              <div className="text-lg font-black text-emerald-800 dark:text-emerald-200">PKR {due.toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {methods.map(pm => (
              <button
                key={pm.key}
                type="button"
                onClick={() => { setMethod(pm.key); setErr('') }}
                className={`px-3 py-3.5 rounded-xl border-2 text-sm font-bold transition-all ${
                  method === pm.key
                    ? `bg-gradient-to-br ${pm.active} text-white ${pm.border} shadow-md scale-[1.02]`
                    : `bg-white ${pm.inactive}`
                }`}
              >{pm.label}</button>
            ))}
          </div>

          {showCashReceived && (
            <div className="rounded-xl border-2 border-emerald-100 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-4 space-y-2">
              <label className="block">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-200 uppercase tracking-wide">Cash received</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cashStr}
                  onChange={e => setCashStr((e.target.value || '').replace(/[^\d.]/g, ''))}
                  className="mt-1.5 w-full px-4 py-3 border-2 border-emerald-200 dark:border-emerald-700 rounded-xl text-base font-semibold bg-white dark:bg-gray-800 dark:text-white focus:border-emerald-500 outline-none"
                />
              </label>
              {tipAmount > 0 && (
                <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  Waiter tip: PKR {tipAmount.toLocaleString()}
                </div>
              )}
            </div>
          )}

          {method === 'bank' && (
            <div className="rounded-xl border-2 border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-4">
              <label className="block">
                <span className="text-xs font-bold text-blue-800 dark:text-blue-200 uppercase tracking-wide">
                  Last 4 digits <span className="text-blue-400 font-normal normal-case">(optional)</span>
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="e.g. 4521"
                  value={last4}
                  onChange={e => setLast4((e.target.value || '').replace(/\D+/g, '').slice(0, 4))}
                  className="mt-1.5 w-full px-4 py-3 border-2 border-blue-200 dark:border-blue-700 rounded-xl text-sm bg-white dark:bg-gray-800 dark:text-white focus:border-blue-500 outline-none"
                />
              </label>
            </div>
          )}

          {method === 'card' && (
            <div className="rounded-xl border-2 border-indigo-100 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-4">
              <label className="block">
                <span className="text-xs font-bold text-indigo-800 dark:text-indigo-200 uppercase tracking-wide">
                  Last 4 digits <span className="text-indigo-400 font-normal normal-case">(optional)</span>
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="e.g. 4521"
                  value={last4}
                  onChange={e => setLast4((e.target.value || '').replace(/\D+/g, '').slice(0, 4))}
                  className="mt-1.5 w-full px-4 py-3 border-2 border-indigo-200 dark:border-indigo-700 rounded-xl text-sm bg-white dark:bg-gray-800 dark:text-white focus:border-indigo-500 outline-none"
                />
              </label>
            </div>
          )}

          {method === 'staff' && (
            <div className="rounded-xl border-2 border-violet-100 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20 p-4">
              <label className="block">
                <span className="text-xs font-bold text-violet-800 dark:text-violet-200 uppercase tracking-wide">
                  Staff Member <span className="text-rose-500">*</span>
                </span>
                <select
                  value={staffId}
                  onChange={e => setStaffId(e.target.value)}
                  className="mt-1.5 w-full px-4 py-3 border-2 border-violet-200 dark:border-violet-700 rounded-xl text-sm bg-white dark:bg-gray-800 dark:text-white focus:border-violet-500 outline-none"
                >
                  <option value="">Select staff…</option>
                  {activeStaff.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.branchName ? ` (${s.branchName})` : ''}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {method === 'complimentary' && (
            <div className="text-sm text-rose-700 dark:text-rose-300 font-medium rounded-xl border-2 border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-4 py-3">
              Personal / complimentary — no cash collected.
            </div>
          )}

          {err && <div className="text-sm text-rose-600 dark:text-rose-400 font-medium">{err}</div>}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >Cancel</button>
          <button
            type="button"
            onClick={confirm}
            className="flex-[1.4] px-4 py-3 rounded-xl bg-gradient-to-br from-green-500 to-green-600 text-white text-sm font-bold shadow-md hover:shadow-lg"
          >Confirm Pay</button>
        </div>
      </div>
    </div>
  )
}
