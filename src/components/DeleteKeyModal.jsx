import { useEffect, useState } from 'react'

// Reusable modal that prompts for the sale/delete secret key (settings.salesDeleteKey)
export default function DeleteKeyModal({ open, title, description, busy, error, onSubmit, onClose }) {
  const [key, setKey] = useState('')

  useEffect(() => { if (open) setKey('') }, [open])
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4" onClick={() => { if (!busy) onClose?.() }}>
      <div
        className="w-full max-w-md rounded-t-2xl sm:rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-700 shadow-xl p-4 sm:p-5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-lg font-semibold mb-1">{title || 'Enter Secret Key'}</div>
        {description ? <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">{description}</div> : null}
        <label className="block text-sm">
          <span>Sale Delete Key</span>
          <input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && key && !busy) onSubmit?.(key) }}
            className="mt-1 w-full px-3 py-2.5 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 dark:border-gray-600"
            placeholder="Enter key"
            autoFocus
          />
        </label>
        {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
        <div className="mt-4 flex flex-col-reverse sm:flex-row justify-end gap-2">
          <button disabled={busy} onClick={onClose} className="min-h-11 px-3 py-2.5 border rounded-lg">Cancel</button>
          <button
            disabled={!key || busy}
            onClick={() => onSubmit?.(key)}
            className="min-h-11 px-3 py-2.5 rounded-lg bg-rose-600 text-white disabled:opacity-50"
          >
            {busy ? 'Please wait…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
