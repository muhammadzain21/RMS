import { useEffect, useState } from 'react'

// Blocking license gate for the packaged Electron app.
// When the license is missing/expired, covers the whole app with a
// non-dismissable dialog to enter a new key — no reinstall required.
export default function LicenseGate() {
  const [status, setStatus] = useState(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const hasLicenseApi = typeof window !== 'undefined' && !!window.license

  useEffect(() => {
    if (!hasLicenseApi) return
    let mounted = true
    window.license.getStatus?.().then(s => { if (mounted && s) setStatus(s) }).catch(() => {})
    const unsub = window.license.onStatus?.(s => { if (mounted && s) setStatus(s) })
    return () => { mounted = false; try { unsub && unsub() } catch {} }
  }, [hasLicenseApi])

  // Not packaged (dev/browser) or still loading — never block
  if (!hasLicenseApi || !status || status.dev || status.valid) return null

  const expired = status.expired || (status.daysRemaining != null && status.daysRemaining < 0)
  const expiryText = status.expiryDate ? new Date(status.expiryDate).toLocaleDateString() : ''

  const submit = async () => {
    const k = String(key || '').trim()
    if (!k) { setErr('Enter a license key'); return }
    try {
      setBusy(true)
      setErr('')
      const res = await window.license.activate(k)
      if (res?.ok) {
        setStatus(res.status || { valid: true })
        setKey('')
      } else {
        setErr(res?.error || 'Invalid license key')
      }
    } catch {
      setErr('Activation failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-gray-950/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 border-2 border-rose-500/40 rounded-2xl shadow-2xl p-6">
        <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {expired ? 'License Expired' : 'License Required'}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {expired
            ? `Your license expired${expiryText ? ` on ${expiryText}` : ''}. Enter a new license key to continue.`
            : 'No valid license found. Enter your license key to continue.'}
        </div>
        <label className="block text-sm">
          <span className="text-gray-700 dark:text-gray-300 font-medium">License Key</span>
          <input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && key && !busy) submit() }}
            className="mt-1 w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono tracking-wide focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="License key"
            autoFocus
          />
        </label>
        {err && <div className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</div>}
        <button
          disabled={!key.trim() || busy}
          onClick={submit}
          className="mt-4 w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? 'Activating…' : 'Activate License'}
        </button>
        <div className="mt-3 text-xs text-center text-gray-400 dark:text-gray-500">
          Contact support if you need a renewal key.
        </div>
      </div>
    </div>
  )
}
