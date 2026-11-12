import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useData } from '../../state/DataContext.jsx'
import {
  Server, Eye, EyeOff, ArrowRight, UtensilsCrossed, Wifi, Cloud,
  CheckCircle, AlertCircle, Monitor, Settings2, Shield,
  MapPin, Phone, Apple, Check, Sparkles,
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
  const b = normalizeUrl(base)
  if (!b) return
  try {
    if (typeof window.setAPIBase === 'function') {
      window.setAPIBase(b)
    } else {
      localStorage.setItem('server_url', b)
      window.API_BASE = b
      window.dispatchEvent(new CustomEvent('server_url_changed', { detail: b }))
    }
  } catch {}
}

function AndroidIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.6 9.48l1.84-3.18a.5.5 0 00-.86-.5l-1.86 3.22A7.9 7.9 0 0012 8c-1.57 0-3.02.45-4.22 1.22L5.92 5.8a.5.5 0 10-.86.5L6.9 9.48C5.14 10.72 4 12.72 4 15v.5h16V15c0-2.28-1.14-4.28-2.9-5.52zM9.25 13.25a.75.75 0 110-1.5.75.75 0 010 1.5zm5.5 0a.75.75 0 110-1.5.75.75 0 010 1.5zM7 16.5h10v1.25c0 .97-.78 1.75-1.75 1.75h-.5v2a1 1 0 11-2 0v-2h-1.5v2a1 1 0 11-2 0v-2h-.5C7.78 19.5 7 18.72 7 17.75V16.5z" />
    </svg>
  )
}

export default function Login() {
  const { user, login } = useAuth()
  const { state } = useData()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [installHelp, setInstallHelp] = useState('')

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
  const [connOpen, setConnOpen] = useState(false)

  useEffect(() => {
    setConnOpen(false)
    setInstallHelp('')
  }, [])

  useEffect(() => {
    const id = 'login-fonts'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap'
    document.head.appendChild(link)
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

  const settings = state?.settings || {}
  const brand = settings.companyName || 'Restaurant POS'
  const logo = settings.logo || null
  const phone = String(settings.phone || '').trim()
  const address = String(settings.address || '').trim()
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
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        try { reg.update() } catch {}
      }).catch(() => {})
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

  const installPwa = async (platform) => {
    if (pwaInstalled) {
      toast.success('App is already installed')
      return
    }
    if (platform === 'iphone' || onIos) {
      setInstallHelp('iphone')
      return
    }
    if (deferredPromptRef.current) {
      try {
        deferredPromptRef.current.prompt()
        const choice = await deferredPromptRef.current.userChoice
        deferredPromptRef.current = null
        setCanPwaInstall(false)
        if (choice?.outcome === 'accepted') toast.success('Installing EpicSpire RMS…')
        return
      } catch (err) {
        console.warn('PWA prompt failed', err)
      }
    }
    if (platform === 'android') setInstallHelp('android')
    else setInstallHelp('desktop')
    toast('Open Chrome menu → Install app', { icon: '📱' })
  }

  const setMode = (mode) => {
    setConnMode(mode)
    setConnStatus(null)
    setConnError('')
    const cur = String(serverUrl || '').trim()
    if (!cur || cur === 'http://' || cur === 'https://' || cur === 'http://192.168.') {
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
    setConnMode(guessMode(base))
    if (result.ok) toast.success('Connected — you can sign in')
    else toast('Saved. Server not reachable yet — check network.', { icon: '⚠️' })
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const current = normalizeUrl(serverUrl) || normalizeUrl(typeof window !== 'undefined' ? window.API_BASE : '')
      if (!current) {
        const local = 'http://localhost:5000'
        const localPing = await pingServer(local)
        if (cancelled) return
        if (localPing.ok) {
          saveServerBase(local)
          setServerUrl(local)
          setConnStatus('ok')
        }
        return
      }
      const ping = await pingServer(current)
      if (cancelled) return
      if (ping.ok) {
        setConnStatus('ok')
        saveServerBase(current)
        return
      }
      setConnStatus('fail')
      setConnError(ping.error || 'Server not reachable')
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.username || !form.password) { setError('Username and password are required'); return }
    const base = normalizeUrl(serverUrl) || normalizeUrl(typeof window !== 'undefined' ? window.API_BASE : '') || 'http://localhost:5000'
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

  const installBtn =
    'inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition touch-manipulation focus:outline-none focus:ring-2 focus:ring-blue-400/40'

  return (
    <div
      className="relative min-h-[100dvh] overflow-y-auto text-slate-900"
      style={{
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: 'linear-gradient(180deg, #f4f8ff 0%, #eef4ff 40%, #ffffff 100%)',
      }}
    >
      {/* soft blue atmosphere */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-blue-400/20 blur-3xl" />
        <div className="absolute -right-20 top-1/3 h-[24rem] w-[24rem] rounded-full bg-sky-300/25 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-indigo-300/15 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(37,99,235,0.08) 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-6xl items-center p-4 sm:p-6 lg:p-8">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-[0_30px_80px_-40px_rgba(37,99,235,0.35)] lg:grid-cols-2">
          {/* Brand half */}
          <section className="relative flex min-h-[220px] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1d4ed8] via-[#2563eb] to-[#0ea5e9] px-6 py-7 text-white sm:min-h-[280px] sm:px-10 sm:py-10 lg:min-h-[640px]">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-sky-300/20 blur-2xl" />
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)',
                  backgroundSize: '36px 36px',
                }}
              />
            </div>

            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/95 backdrop-blur">
                <Sparkles size={12} /> EpicSpire RMS
              </div>

              <div className="mt-6 flex items-center gap-4 lg:mt-12 lg:flex-col lg:items-start lg:gap-7">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.25rem] bg-white shadow-xl shadow-blue-950/20 ring-4 ring-white/25 sm:h-20 sm:w-20 lg:h-28 lg:w-28 lg:rounded-[1.75rem]">
                  {logo
                    ? <img src={logo} alt={brand} className="h-full w-full object-cover" />
                    : <UtensilsCrossed className="h-8 w-8 text-blue-600 sm:h-9 sm:w-9 lg:h-12 lg:w-12" strokeWidth={2.2} />}
                </div>
                <div className="min-w-0">
                  <h1
                    className="text-2xl font-bold leading-[1.1] tracking-tight text-white sm:text-3xl lg:text-[2.75rem]"
                    style={{ fontFamily: '"Fraunces", "Plus Jakarta Sans", serif' }}
                  >
                    {brand}
                  </h1>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-blue-50/90 sm:text-base lg:mt-3">
                    Sell faster. Run the kitchen. Manage every branch — from one calm workspace.
                  </p>
                </div>
              </div>

              <ul className="mt-6 hidden space-y-3 lg:mt-10 lg:block">
                {[
                  'Counter, KOT & delivery in one flow',
                  'Call center ready for busy nights',
                  'Works on local LAN or cloud URL',
                ].map((line) => (
                  <li key={line} className="flex items-center gap-3 text-sm text-white/95">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white">
                      <Check size={13} strokeWidth={3} />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative mt-6 space-y-2 border-t border-white/20 pt-5 text-sm text-blue-50">
              {phone ? (
                <div className="flex items-center gap-2">
                  <Phone size={15} className="shrink-0 text-white" />
                  <span className="truncate font-medium">{phone}</span>
                </div>
              ) : null}
              {address ? (
                <div className="flex items-start gap-2">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-white" />
                  <span className="leading-snug font-medium">{address}</span>
                </div>
              ) : null}
              {!phone && !address ? (
                <p className="text-xs text-blue-100/80">Restaurant phone & address show here from Settings.</p>
              ) : null}
              <p className="pt-1 text-[11px] text-blue-100/70">
                &copy; {new Date().getFullYear()} EpicSpire
              </p>
            </div>
          </section>

          {/* Form half */}
          <section className="flex items-center bg-white px-5 py-7 sm:px-10 sm:py-10">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <h2
                    className="text-2xl font-bold tracking-tight text-slate-900"
                    style={{ fontFamily: '"Fraunces", serif' }}
                  >
                    Welcome back
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">Sign in with your staff account</p>
                </div>
                <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  connStatus === 'ok'
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                    : connStatus === 'fail'
                    ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                    : 'bg-slate-50 text-slate-500 ring-1 ring-slate-200'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    connStatus === 'ok' ? 'bg-emerald-500' : connStatus === 'fail' ? 'bg-rose-500' : 'bg-slate-400'
                  }`} />
                  {connStatus === 'ok' ? 'Online' : connStatus === 'fail' ? 'Offline' : 'Ready'}
                </div>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Username</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                    autoComplete="username"
                    placeholder="Enter username"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-[15px] text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      autoComplete="current-password"
                      placeholder="Enter password"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 pr-12 text-[15px] text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {error && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-3.5 text-sm font-bold text-white shadow-[0_14px_30px_-12px_rgba(37,99,235,0.7)] transition hover:brightness-105 disabled:opacity-60"
                >
                  {loading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <>Sign in <ArrowRight className="h-4 w-4" /></>
                  )}
                </button>
              </form>

              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setConnOpen(v => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                    connOpen
                      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  <Shield size={12} />
                  Administrator
                  <Settings2 size={12} className="opacity-70" />
                </button>

                <div className="flex items-center gap-2">
                  {pwaInstalled ? (
                    <span
                      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600"
                      title="App installed"
                    >
                      <CheckCircle size={18} />
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => installPwa('android')}
                        title={canPwaInstall && onAndroid ? 'Install on Android' : 'Android'}
                        aria-label="Install on Android"
                        className={`${installBtn} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
                      >
                        <AndroidIcon size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => installPwa('iphone')}
                        title="Install on iPhone"
                        aria-label="Install on iPhone"
                        className={`${installBtn} border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100`}
                      >
                        <Apple size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => installPwa('desktop')}
                        title="Install on Desktop"
                        aria-label="Install on Desktop"
                        className={`${installBtn} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}
                      >
                        <Monitor size={18} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {connOpen && (
                <div className="mt-4 space-y-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <Server size={13} className="text-blue-600" /> Server connection
                    </div>
                    <div className="mt-1 break-all text-[10px] text-slate-500">{connectedUrl}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-white p-1 ring-1 ring-blue-100">
                    <button
                      type="button"
                      onClick={() => setMode('lan')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition ${
                        connMode === 'lan' ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Wifi size={14} /> Offline LAN
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('online')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition ${
                        connMode === 'online' ? 'bg-sky-500 text-white shadow' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Cloud size={14} /> Online URL
                    </button>
                  </div>

                  <p className="text-[11px] leading-relaxed text-slate-500">
                    {connMode === 'lan'
                      ? 'Same Wi‑Fi as the PC running the server. Example: http://192.168.1.40:5000'
                      : 'Hosted / cloud link. Example: https://pos.yourrestaurant.com'}
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
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  />

                  {connStatus === 'ok' && (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                      <CheckCircle size={14} /> Server connected
                    </div>
                  )}
                  {connStatus === 'fail' && (
                    <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      <AlertCircle size={14} /> {connError || 'Connection failed'}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={connTesting || !serverUrl.trim()}
                      className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {connTesting ? 'Testing…' : 'Test'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveConnection}
                      disabled={connTesting || !serverUrl.trim()}
                      className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      Save & use
                    </button>
                  </div>
                </div>
              )}

              {installHelp && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left text-[11px] leading-relaxed text-slate-600">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-bold text-slate-800">
                      {installHelp === 'android' && 'Install on Android'}
                      {installHelp === 'iphone' && 'Install on iPhone'}
                      {installHelp === 'desktop' && 'Install on Desktop'}
                    </span>
                    <button type="button" onClick={() => setInstallHelp('')} className="px-1 text-slate-400 hover:text-slate-700">✕</button>
                  </div>
                  {installHelp === 'android' && (
                    <ol className="list-decimal space-y-1 pl-4">
                      <li>Stay in <b>Chrome</b> and tap the Android icon again when ready.</li>
                      <li>Or Chrome menu <b>(⋮)</b> → <b>Install app</b>.</li>
                      <li>If <b>Play Protect</b> appears, tap <b>Install without scanning</b>.</li>
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
                      <li>Or menu → <b>Install EpicSpire RMS…</b>.</li>
                    </ol>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
