import { useState } from 'react'
import { Server, Wifi, Cloud, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react'

export default function ServerConfig({ onSaved }) {
  const [url, setUrl] = useState(() => {
    try { return localStorage.getItem('server_url') || '' } catch { return '' }
  })
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState(null) // null | 'ok' | 'fail'
  const [error, setError] = useState('')

  const normalizeUrl = (raw) => {
    let u = String(raw || '').trim().replace(/\/+$/, '')
    if (!u) return ''
    if (!/^https?:\/\//i.test(u)) u = `http://${u}`
    return u
  }

  const testConnection = async (rawUrl) => {
    const base = normalizeUrl(rawUrl)
    if (!base) return { ok: false, error: 'Enter a server URL' }
    try {
      const res = await fetch(`${base}/api/health`, { cache: 'no-store', timeout: 5000 })
      if (res.ok) {
        const j = await res.json()
        if (j?.ok) return { ok: true }
        return { ok: false, error: 'Server responded but health check failed' }
      }
      return { ok: false, error: `Server returned ${res.status}` }
    } catch (e) {
      return { ok: false, error: 'Cannot reach server. Check IP/URL and network.' }
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setStatus(null)
    setError('')
    const result = await testConnection(url)
    setStatus(result.ok ? 'ok' : 'fail')
    setError(result.error || '')
    setTesting(false)
  }

  const handleSave = async () => {
    const base = normalizeUrl(url)
    if (!base) { setError('Enter a server URL'); return }
    setTesting(true)
    const result = await testConnection(url)
    setTesting(false)
    if (!result.ok) {
      setStatus('fail')
      setError(result.error)
      // Still allow saving even if test fails (server might be starting)
    }
    try {
      localStorage.setItem('server_url', base)
      window.API_BASE = base
    } catch {}
    if (onSaved) onSaved(base)
  }

  const handleClear = () => {
    try { localStorage.removeItem('server_url') } catch {}
    setUrl('')
    setStatus(null)
    setError('')
    window.API_BASE = ''
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 dark:bg-stone-950 p-4">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-200 dark:shadow-orange-900/30">
            <Server className="text-white" size={24} />
          </div>
          <div className="text-center">
            <div className="font-bold text-stone-800 dark:text-stone-100 text-lg">Restaurant POS</div>
            <div className="text-stone-400 text-[10px] uppercase tracking-widest">Server Setup</div>
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100 mb-1">Connect to Server</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Enter your server IP address (for WiFi) or cloud URL (for online).
            </p>
          </div>

          {/* Examples */}
          <div className="space-y-2">
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
              <Wifi className="text-blue-500 flex-shrink-0 mt-0.5" size={18} />
              <div className="text-xs">
                <div className="font-semibold text-blue-700 dark:text-blue-300">WiFi (Local Network)</div>
                <div className="text-blue-600 dark:text-blue-400 mt-0.5">e.g. http://192.168.18.40:5000</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900">
              <Cloud className="text-emerald-500 flex-shrink-0 mt-0.5" size={18} />
              <div className="text-xs">
                <div className="font-semibold text-emerald-700 dark:text-emerald-300">Cloud (Online)</div>
                <div className="text-emerald-600 dark:text-emerald-400 mt-0.5">e.g. https://myrestaurant.com</div>
              </div>
            </div>
          </div>

          {/* Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
              Server URL
            </label>
            <input
              type="text"
              placeholder="http://192.168.18.40:5000"
              value={url}
              onChange={e => { setUrl(e.target.value); setStatus(null); setError('') }}
              className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm placeholder-stone-300 dark:placeholder-stone-600 outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-400/15"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
            />
          </div>

          {/* Status */}
          {status === 'ok' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900">
              <CheckCircle className="text-emerald-500" size={18} />
              <span className="text-emerald-700 dark:text-emerald-300 text-sm font-medium">Server connected successfully!</span>
            </div>
          )}
          {status === 'fail' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900">
              <AlertCircle className="text-red-500" size={18} />
              <span className="text-red-600 dark:text-red-400 text-sm">{error}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleTest}
              disabled={testing || !url}
              className="flex-1 py-3 rounded-xl border-2 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 font-semibold text-sm transition-all hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              onClick={handleSave}
              disabled={testing || !url}
              className="flex-1 py-3 rounded-xl bg-orange-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all hover:bg-orange-600 disabled:opacity-50"
              style={{ boxShadow: '0 4px 16px rgba(249,115,22,0.30)' }}
            >
              Save & Continue <ArrowRight size={16} />
            </button>
          </div>

          {/* Clear (for re-configuration) */}
          {url && (
            <button
              onClick={handleClear}
              className="w-full text-center text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
            >
              Clear saved server and start over
            </button>
          )}
        </div>

        <p className="text-center text-xs text-stone-400 mt-4">
          The server runs on your desktop machine. Make sure it's running and on the same network.
        </p>
      </div>
    </div>
  )
}
