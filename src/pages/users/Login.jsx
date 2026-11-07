import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useData } from '../../state/DataContext.jsx'
import {
  Server, Eye, EyeOff, ArrowRight, UtensilsCrossed, Wifi, Cloud,
  CheckCircle, AlertCircle, Smartphone, Monitor, Settings2,
} from 'lucide-react'

function normalizeUrl(raw) {
  let u = String(raw || '').trim().replace(/\/+$/, '')
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`
  return u
}

function guessMode(url) {
  const u = String(url || '').toLowerCase()
  if (!u) return 'lan'
  if (u.startsWith('https://')) return 'online'
  if (/localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\./.test(u)) return 'lan'
  return 'online'
}

async function pingServer(rawUrl) {
  const base = normalizeUrl(rawUrl)
  if (!base) return { ok: false, error: 'Enter a server URL' }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(`${base}/api/health`, { cache: 'no-store', signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) return { ok: false, error: `Server returned ${res.status}` }
    const j = await res.json().catch(() => null)
    if (j?.ok) return { ok: true, base }
    return { ok: false, error: 'Server responded but health check failed' }
  } catch {
    return { ok: false, error: 'Cannot reach server. Check URL, Wi‑Fi, or firewall.' }
  }
}

function saveServerBase(base) {
  try { localStorage.setItem('server_url', base) } catch {}
  if (typeof window !== 'undefined') {
    window.API_BASE = base
    window.dispatchEvent(new CustomEvent('server_url_changed', { detail: base }))
  }
}

export default function Login() {
  const { user, login } = useAuth()
  const { state } = useData()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [installHelp, setInstallHelp] = useState('') // 'android' | 'iphone' | 'desktop' | ''

  const [connMode, setConnMode] = useState(() => {
    try { return guessMode(localStorage.getItem('server_url') || window.API_BASE || '') } catch { return 'lan' }
  })
  const [serverUrl, setServerUrl] = useState(() => {
    try {
      return localStorage.getItem('server_url')
        || (typeof window !== 'undefined' ? (window.API_BASE || '') : '')
        || ''
    } catch { return '' }
  })
  const [connTesting, setConnTesting] = useState(false)
  const [connStatus, setConnStatus] = useState(null)
  const [connError, setConnError] = useState('')
  // Hidden by default — only opens when Administrator is clicked
  const [connOpen, setConnOpen] = useState(false)

  useEffect(() => {
    setConnOpen(false)
    setInstallHelp('')
  }, [])

  const deferredPromptRef = useRef(null)
  const [canPwaInstall, setCanPwaInstall] = useState(false)
  const [pwaInstalled, setPwaInstalled] = useState(() => {
    try {
      return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true
    } catch { return false }
  })

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const onAndroid = /Android/i.test(ua)
  const onIos = /iPhone|iPad|iPod/i.test(ua)

  const brand = state?.settings?.companyName || 'Restaurant POS'
  const logo = state?.settings?.logo || null
  const connectedUrl = normalizeUrl(serverUrl)
    || (typeof window !== 'undefined' ? String(window.API_BASE || '') : '')
    || 'Not configured'

  useEffect(() => {
    const onBip = (e) => {
      e.preventDefault()
      deferredPromptRef.current = e
      setCanPwaInstall(true)
    }
    const onInstalled = () => {
      deferredPromptRef.current = null
      setCanPwaInstall(false)
      setPwaInstalled(true)
      setInstallHelp('')
      toast.success('App installed')
    }
    window.addEventListener('beforeinstallprompt', onBip)
    window.addEventListener('appinstalled', onInstalled)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    const firstAllowed = user.permissions
      ?.filter(p => p.visible)
      ?.map(p => p.path)?.[0]
    navigate(firstAllowed || '/')
  }, [user, navigate])

  /** Native Chrome Install prompt when available — never downloads a file */
  const installPwa = async (platform) => {
    if (pwaInstalled) {
      toast.success('App is already installed')
      return
    }

    if (platform === 'iphone' || onIos) {
      setInstallHelp('iphone')
      return
    }

    // Always try the system Install dialog first (Android / Desktop)
    if (deferredPromptRef.current) {
      try {
        deferredPromptRef.current.prompt()
        const choice = await deferredPromptRef.current.userChoice
        deferredPromptRef.current = null
        setCanPwaInstall(false)
        if (choice?.outcome === 'accepted') {
          toast.success('Installing EpicSpire RMS…')
          // If Play Protect appears next, tap "Install without scanning"
        }
        return
      } catch (err) {
        console.warn('PWA prompt failed', err)
      }
    }

    // Prompt not ready yet — show short steps (no downloads)
    if (platform === 'android') setInstallHelp('android')
    else setInstallHelp('desktop')
    toast('Open Chrome menu → Install app', { icon: '📱' })
  }

  const setMode = (mode) => {
    setConnMode(mode)
    setConnStatus(null)
    setConnError('')
    if (!serverUrl.trim()) {
      if (mode === 'lan') {
        const host = typeof window !== 'undefined' ? window.location.hostname : ''
        if (host && host !== 'localhost' && host !== '127.0.0.1') {
          setServerUrl(`http://${host}:5000`)
        } else {
          setServerUrl('http://192.168.')
        }
      } else {
        setServerUrl('https://')
      }
    }
  }

  const handleTestConnection = async () => {
    setConnTesting(true)
    setConnStatus(null)
    setConnError('')
    const result = await pingServer(serverUrl)
    setConnStatus(result.ok ? 'ok' : 'fail')
    setConnError(result.error || '')
    setConnTesting(false)
    if (result.ok) toast.success('Server reachable')
  }

  const handleSaveConnection = async () => {
    const base = normalizeUrl(serverUrl)
    if (!base) { setConnError('Enter a server URL'); setConnStatus('fail'); return }
    setConnTesting(true)
    const result = await pingServer(base)
    setConnTesting(false)
    setConnStatus(result.ok ? 'ok' : 'fail')
    setConnError(result.error || '')
    saveServerBase(base)
    setServerUrl(base)
    if (result.ok) toast.success('Connected — you can sign in')
    else toast('Saved. Server not reachable yet — check network.', { icon: '⚠️' })
  }

  // Ensure Electron/dev always has a usable local API target
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const current = normalizeUrl(serverUrl) || normalizeUrl(typeof window !== 'undefined' ? window.API_BASE : '')
      const local = 'http://localhost:5000'
      if (!current) {
        saveServerBase(local)
        if (!cancelled) setServerUrl(local)
        return
      }
      const ping = await pingServer(current)
      if (cancelled) return
      if (ping.ok) {
        setConnStatus('ok')
        return
      }
      const localPing = await pingServer(local)
      if (cancelled) return
      if (localPing.ok) {
        saveServerBase(local)
        setServerUrl(local)
        setConnStatus('ok')
        setConnError('')
        toast.success('Connected to local server')
      } else {
        setConnStatus('fail')
        setConnError(ping.error || 'Server not reachable')
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.username || !form.password) { setError('Username and password are required'); return }
    const base = normalizeUrl(serverUrl) || 'http://localhost:5000'
    saveServerBase(base)
    setServerUrl(base)
    try {
      setLoading(true)
      const res = await login(form.username.trim(), form.password)
      if (!res?.ok) {
        setError(res?.error || 'Login failed')
        toast.error(res?.error || 'Invalid credentials')
      } else {
        toast.success('Welcome!')
        // Admin / full-access accounts go home; others to first allowed page
        if (res?.user?.role === 'Admin' || res?.user?.role === 'SuperAdmin') {
          navigate('/')
        } else {
          const firstAllowed = res?.user?.permissions
            ?.filter(p => p.visible)
            ?.map(p => p.path)?.[0]
          navigate(firstAllowed || '/')
        }
      }
    } catch {
      setError('Login failed')
      toast.error('Login failed')
    } finally {
      setLoading(false)
    }
  }

  const placeholder = connMode === 'lan'
    ? 'http://192.168.1.40:5000'
    : 'https://pos.yourrestaurant.com'

  return (
    <div className="relative min-h-[100dvh] max-h-[100dvh] overflow-y-auto bg-[#070d1f] text-white flex items-center justify-center p-3 sm:p-5" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute -right-48 bottom-0 h-[36rem] w-[36rem] rounded-full bg-indigo-600/15 blur-[130px]" />
      </div>

      <div className="relative z-10 w-full max-w-md my-auto">
        <div className="mb-4 sm:mb-6 text-center">
          <div className="mx-auto mb-3 sm:mb-4 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-xl shadow-blue-500/30">
            {logo
              ? <img src={logo} alt={brand} className="h-full w-full object-cover" />
              : <UtensilsCrossed className="h-6 w-6 sm:h-7 sm:w-7 text-white" />}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              {brand}
            </span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">Restaurant POS &amp; Management</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-xl p-4 sm:p-6 shadow-2xl">
          <h2 className="mb-0.5 text-lg sm:text-xl font-bold text-white">Welcome back</h2>
          <p className="mb-4 sm:mb-5 text-xs sm:text-sm text-slate-400">Sign in to access your dashboard</p>

          <form onSubmit={submit} className="space-y-3.5 sm:space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-300">Username</label>
              <input
                type="text"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                autoComplete="username"
                placeholder="Enter your username"
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-3 text-sm sm:text-base text-white placeholder-slate-500 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-300">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-3 pr-11 text-sm sm:text-base text-white placeholder-slate-500 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-0.5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 sm:py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition-all hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>Sign In <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </form>

          {/* Small administrator control — opens Offline LAN / Online URL */}
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setConnOpen(v => !v)}
              title="Administrator — Offline LAN / Online URL"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                connOpen
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              }`}
            >
              <Settings2 size={13} />
              Administrator
              <Server size={12} className="opacity-70" />
            </button>
          </div>

          {connOpen && (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-white">Server URL</div>
                <div className="text-[10px] text-slate-500 truncate max-w-[60%]">{connectedUrl}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-black/30">
                <button
                  type="button"
                  onClick={() => setMode('lan')}
                  className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-bold transition-colors ${
                    connMode === 'lan' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Wifi size={14} /> Offline LAN
                </button>
                <button
                  type="button"
                  onClick={() => setMode('online')}
                  className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-bold transition-colors ${
                    connMode === 'online' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Cloud size={14} /> Online URL
                </button>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                {connMode === 'lan'
                  ? 'Same Wi‑Fi as the PC. Example: http://192.168.1.40:5000'
                  : 'Hosted link. Example: https://pos.yourrestaurant.com'}
              </p>

              <input
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                placeholder={placeholder}
                value={serverUrl}
                onChange={e => { setServerUrl(e.target.value); setConnStatus(null); setConnError('') }}
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
              />

              {connStatus === 'ok' && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-300">
                  <CheckCircle size={14} /> Server connected
                </div>
              )}
              {connStatus === 'fail' && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs text-rose-300">
                  <AlertCircle size={14} /> {connError || 'Connection failed'}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={connTesting || !serverUrl.trim()}
                  className="flex-1 rounded-lg border border-white/15 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/5 disabled:opacity-50"
                >
                  {connTesting ? 'Testing…' : 'Test'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveConnection}
                  disabled={connTesting || !serverUrl.trim()}
                  className="flex-1 rounded-lg bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Android / iPhone / Desktop — PWA only, no APK */}
          <div className="mt-4 sm:mt-5 border-t border-white/10 pt-4">
            <div className="mb-2.5 text-center text-[10px] font-bold uppercase tracking-[2px] text-slate-500">
              {pwaInstalled ? 'App installed' : 'Get the App'}
            </div>

            {pwaInstalled ? (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 text-center text-xs text-emerald-300 font-semibold">
                Installed — updates apply automatically
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => installPwa('android')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0b7a3e] py-2.5 text-[11px] font-bold text-white transition-transform hover:scale-[1.02]"
                >
                  <Smartphone size={14} />
                  {canPwaInstall && onAndroid ? 'Install' : 'Android'}
                </button>
                <button
                  type="button"
                  onClick={() => installPwa('iphone')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2.5 text-[11px] font-bold text-white transition-transform hover:scale-[1.02]"
                >
                  iPhone
                </button>
                <button
                  type="button"
                  onClick={() => installPwa('desktop')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-600 py-2.5 text-[11px] font-bold text-white transition-transform hover:scale-[1.02]"
                >
                  <Monitor size={14} /> Desktop
                </button>
              </div>
            )}

            {installHelp && (
              <div className="mt-3 rounded-lg bg-white/5 p-3 text-left text-[11px] leading-relaxed text-slate-300">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-bold text-white">
                    {installHelp === 'android' && 'Install on Android'}
                    {installHelp === 'iphone' && 'Install on iPhone'}
                    {installHelp === 'desktop' && 'Install on Desktop'}
                  </span>
                  <button type="button" onClick={() => setInstallHelp('')} className="px-1 text-slate-400 hover:text-white">✕</button>
                </div>
                {installHelp === 'android' && (
                  <ol className="list-decimal space-y-1 pl-4">
                    <li>Stay in <b>Chrome</b> and tap <b>Android</b> again when ready.</li>
                    <li>Or Chrome menu <b>(⋮)</b> → <b>Install app</b>.</li>
                    <li>If <b>Play Protect</b> appears, tap <b>Install without scanning</b> (safe — this is our web app, not a downloaded APK).</li>
                    <li>On HTTP LAN only: <b>chrome://flags</b> → enable <b>Insecure origins treated as secure</b> → add this site → Relaunch.</li>
                  </ol>
                )}
                {installHelp === 'iphone' && (
                  <ol className="list-decimal space-y-1 pl-4">
                    <li>Open this page in <b>Safari</b>.</li>
                    <li>Tap <b>Share</b> → <b>Add to Home Screen</b> → <b>Add</b>.</li>
                  </ol>
                )}
                {installHelp === 'desktop' && (
                  <ol className="list-decimal space-y-1 pl-4">
                    <li>In Chrome/Edge use the address-bar <b>install</b> icon.</li>
                    <li>Or menu → <b>Install EpicSpire RMS…</b> / <b>Install page as app</b>.</li>
                  </ol>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 sm:mt-6 text-center text-xs text-slate-600">
          &copy; {new Date().getFullYear()} EpicSpire · Restaurant POS
        </p>
      </div>
    </div>
  )
}
