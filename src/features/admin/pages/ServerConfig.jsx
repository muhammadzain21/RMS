import { useState } from 'react'
import { Server, Wifi, Cloud, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react'

export default function ServerConfig({ onSaved }) {
  const [mode, setMode] = useState(() => {
    try {
      const u = (localStorage.getItem('server_url') || '').toLowerCase()
      if (u.startsWith('https://')) return 'online'
      return 'lan'
    } catch { return 'lan' }
  })
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
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 6000)
      const res = await fetch(`${base}/api/health`, { cache: 'no-store', signal: ctrl.signal })
      clearTimeout(t)
      if (res.ok) {
        const j = await res.json()
        if (j?.ok) return { ok: true }
        return { ok: false, error: 'Server responded but health check failed' }
      }
      return { ok: false, error: `Server returned ${res.status}` }
    } catch {
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
    } else {
      setStatus('ok')
    }
    try {
      if (typeof window.setAPIBase === 'function') window.setAPIBase(base)
      else {
        localStorage.setItem('server_url', base)
        window.API_BASE = base
        window.dispatchEvent(new CustomEvent('server_url_changed', { detail: base }))
      }
    } catch {}
    if (onSaved) onSaved(base)
  }

  const handleClear = () => {
    try { localStorage.removeItem('server_url') } catch {}
    setUrl('')
    setStatus(null)
    setError('')
    window.API_BASE = ''
    try { window.__API_BASE_CANDIDATES?.clear?.() } catch {}
    window.dispatchEvent(new CustomEvent('server_url_changed', { detail: '' }))
  }

  const switchMode = (next) => {
    setMode(next)
    setStatus(null)
    setError('')
    if (!url.trim()) {
      setUrl(next === 'lan' ? 'http://192.168.' : 'https://')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070d1f] p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Server className="text-white" size={24} />
          </div>
          <div className="text-center">
            <div className="font-bold text-white text-lg">Restaurant POS</div>
            <div className="text-slate-500 text-[10px] uppercase tracking-widest">Server Setup</div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-xl shadow-2xl p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-white mb-1">Connect to Server</h2>
            <p className="text-sm text-slate-400">
              Choose LAN for local Wi‑Fi, or Online for your hosted link.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-black/30">
            <button
              type="button"
              onClick={() => switchMode('lan')}
              className={`flex items-center justify-center gap-1.5 rounded-md py-2.5 text-xs font-bold transition-colors ${
                mode === 'lan' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wifi size={14} /> LAN / Wi‑Fi
            </button>
            <button
              type="button"
              onClick={() => switchMode('online')}
              className={`flex items-center justify-center gap-1.5 rounded-md py-2.5 text-xs font-bold transition-colors ${
                mode === 'online' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cloud size={14} /> Online link
            </button>
          </div>

          <div className="space-y-2">
            {mode === 'lan' ? (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Wifi className="text-blue-400 flex-shrink-0 mt-0.5" size={18} />
                <div className="text-xs">
                  <div className="font-semibold text-blue-200">Same Wi‑Fi as the PC running the server</div>
                  <div className="text-blue-300/80 mt-0.5">e.g. http://192.168.18.40:5000</div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <Cloud className="text-emerald-400 flex-shrink-0 mt-0.5" size={18} />
                <div className="text-xs">
                  <div className="font-semibold text-emerald-200">Public / hosted URL</div>
                  <div className="text-emerald-300/80 mt-0.5">e.g. https://pos.myrestaurant.com</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Server URL
            </label>
            <input
              type="url"
              inputMode="url"
              placeholder={mode === 'lan' ? 'http://192.168.18.40:5000' : 'https://pos.myrestaurant.com'}
              value={url}
              onChange={e => { setUrl(e.target.value); setStatus(null); setError('') }}
              className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/[0.06] text-white text-sm placeholder-slate-500 outline-none transition-all focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
            />
          </div>

          {status === 'ok' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle className="text-emerald-400" size={18} />
              <span className="text-emerald-300 text-sm font-medium">Server connected successfully!</span>
            </div>
          )}
          {status === 'fail' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20">
              <AlertCircle className="text-rose-400" size={18} />
              <span className="text-rose-300 text-sm">{error}</span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !url}
              className="flex-1 py-3 rounded-xl border border-white/15 text-slate-200 font-semibold text-sm transition-all hover:bg-white/5 disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={testing || !url}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50"
            >
              Save & Continue <ArrowRight size={16} />
            </button>
          </div>

          {url && (
            <button
              type="button"
              onClick={handleClear}
              className="w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear saved server and start over
            </button>
          )}
        </div>

        <p className="text-center text-xs text-slate-500 mt-4">
          LAN: PC server must be running on the same Wi‑Fi. Online: use your public hosting URL.
        </p>
      </div>
    </div>
  )
}
