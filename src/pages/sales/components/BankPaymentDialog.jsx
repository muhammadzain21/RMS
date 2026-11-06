import React, { useEffect, useState } from 'react'

export const BANK_CHANNELS = [
  { key: 'bank_account', label: 'Bank Account' },
  { key: 'jazzcash', label: 'JazzCash' },
  { key: 'easypaisa', label: 'EasyPaisa' },
  { key: 'sadapay', label: 'SadaPay' },
  { key: 'nayapay', label: 'NayaPay' },
  { key: 'raast', label: 'Raast' },
  { key: 'upaisa', label: 'UPaisa' },
  { key: 'zindigi', label: 'Zindigi' },
]

export const bankChannelLabel = (key) => BANK_CHANNELS.find(c => c.key === String(key || '').toLowerCase())?.label || key || ''

// Modal shown when the Bank payment method is selected. Requires the
// destination channel + optional last 4 digits of the sender's account.
export default function BankPaymentDialog({
  open,
  channel,
  last4,
  onConfirm,
  onCancel,
}) {
  const [ch, setCh] = useState(channel || 'bank_account')
  const [digits, setDigits] = useState(last4 || '')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (open) {
      setCh(channel || 'bank_account')
      setDigits(last4 || '')
      setErr('')
    }
  }, [open, channel, last4])

  if (!open) return null

  const confirm = () => {
    if (!ch) { setErr('Select where the payment was received'); return }
    if (digits && !/^\d{4}$/.test(digits)) { setErr('Last 4 digits must be exactly 4 digits (or leave empty)'); return }
    onConfirm({ channel: ch, last4: digits })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 border-2 border-blue-200 dark:border-blue-800 shadow-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Bank Payment Details</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Select where the payment was received and enter the sender's last 4 digits for verification.</p>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Received In</div>
          <div className="grid grid-cols-2 gap-2">
            {BANK_CHANNELS.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCh(c.key)}
                className={`px-2 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                  ch === c.key
                    ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                    : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50 dark:bg-gray-800 dark:text-blue-300 dark:border-blue-700 dark:hover:bg-blue-900/30'
                }`}
              >{c.label}</button>
            ))}
          </div>
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
            className="mt-1 w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-center text-sm font-mono tracking-widest bg-white dark:bg-gray-800 dark:text-white focus:border-blue-500 outline-none"
          />
        </label>

        {err && <div className="text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{err}</div>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel} className="flex-1 px-3 py-2.5 rounded-lg border-2 border-gray-200 dark:border-gray-600 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button type="button" onClick={confirm} className="flex-1 px-3 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-md">Confirm</button>
        </div>
      </div>
    </div>
  )
}
