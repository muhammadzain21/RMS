import React, { useEffect, useState } from 'react'

// Modal shown when Card is selected — captures last 4 digits of the card.
export default function CardPaymentDialog({
  open,
  last4 = '',
  onConfirm,
  onCancel,
}) {
  const [digits, setDigits] = useState(last4 || '')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (open) {
      setDigits(last4 || '')
      setErr('')
    }
  }, [open, last4])

  if (!open) return null

  const confirm = () => {
    if (digits && !/^\d{4}$/.test(digits)) {
      setErr('Last 4 digits must be exactly 4 digits (or leave empty)')
      return
    }
    onConfirm({ last4: digits })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 border-2 border-indigo-200 dark:border-indigo-800 shadow-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Card Details</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Enter the last 4 digits of the card for verification.</p>
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Last 4 digits <span className="text-gray-400 font-normal">(optional)</span></span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            autoFocus
            placeholder="e.g. 4521"
            value={digits}
            onChange={e => setDigits((e.target.value || '').replace(/\D+/g, '').slice(0, 4))}
            onKeyDown={e => { if (e.key === 'Enter') confirm() }}
            className="mt-1 w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-center text-sm font-mono tracking-widest bg-white dark:bg-gray-800 dark:text-white focus:border-indigo-500 outline-none"
          />
        </label>

        {err && <div className="text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{err}</div>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel} className="flex-1 px-3 py-2.5 rounded-lg border-2 border-gray-200 dark:border-gray-600 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button type="button" onClick={confirm} className="flex-1 px-3 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow-md">Confirm</button>
        </div>
      </div>
    </div>
  )
}
