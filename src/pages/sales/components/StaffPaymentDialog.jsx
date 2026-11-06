import React, { useEffect, useState } from 'react'

// Shown when the Staff payment method is selected. Picks the staff member —
// the amount is always tracked as a staff purchase, deducted from salary at
// payroll unless the staff pays it off first (Staff History → Purchases).
export default function StaffPaymentDialog({
  open,
  staff = [],
  staffId,
  onConfirm,
  onCancel,
}) {
  const [sid, setSid] = useState(staffId || '')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (open) {
      setSid(staffId || '')
      setErr('')
    }
  }, [open, staffId])

  if (!open) return null

  const activeStaff = (staff || []).filter(s => s.status !== 'Inactive' && s.status !== 'inactive')
  const chosen = activeStaff.find(s => String(s.id) === String(sid))

  const confirm = () => {
    if (!sid || !chosen) { setErr('Select the staff member'); return }
    onConfirm({ staffId: String(chosen.id), staffName: chosen.name || '' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 border-2 border-violet-200 dark:border-violet-800 shadow-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Staff Purchase</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Select the staff member. The amount is deducted from their salary at payroll — unless they pay it earlier from Staff History.</p>
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Staff Member <span className="text-rose-500">*</span></span>
          <select
            value={sid}
            onChange={e => setSid(e.target.value)}
            autoFocus
            className="mt-1 w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-white focus:border-violet-500 outline-none"
          >
            <option value="">— Select staff —</option>
            {activeStaff.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.position ? ` (${s.position})` : ''}</option>
            ))}
          </select>
        </label>

        {err && <div className="text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{err}</div>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel} className="flex-1 px-3 py-2.5 rounded-lg border-2 border-gray-200 dark:border-gray-600 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button type="button" onClick={confirm} className="flex-1 px-3 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 shadow-md">Confirm</button>
        </div>
      </div>
    </div>
  )
}
