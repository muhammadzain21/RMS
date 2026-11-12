import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { UIProvider } from './state/UIContext.jsx'
import { AuthProvider } from './state/AuthContext.jsx'
import { DataProvider } from './state/DataContext.jsx'
import { BranchProvider } from './state/BranchContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { setupNativeChrome } from './native/statusBar.js'

const isElectron = /Electron/i.test(navigator.userAgent)
const isCapacitor = typeof window !== 'undefined' && !!(window.Capacitor || /Capacitor/i.test(navigator.userAgent))
// Use HashRouter for Electron and Capacitor (file:// / capacitor:// origins)
const Router = (isElectron || isCapacitor) ? HashRouter : BrowserRouter

setupNativeChrome()

// Never let an unhandled async/render side-effect blank Electron or the browser tab
;(function installGlobalGuards() {
  try {
    window.addEventListener('unhandledrejection', (ev) => {
      try {
        console.error('[unhandledrejection]', ev?.reason)
        ev?.preventDefault?.()
      } catch {}
    })
    window.addEventListener('error', (ev) => {
      try {
        // Resource load failures (script/img) still fire "error"; don't spam if no message
        if (ev?.error) console.error('[window.error]', ev.error)
        else if (ev?.message) console.error('[window.error]', ev.message)
      } catch {}
    })
  } catch {}
})()

// Runtime API base discovery and fetch rewrite
;(function(){
  try{
    // Check for a user-configured server URL (mobile app / cloud)
    const savedBase = typeof localStorage !== 'undefined' ? localStorage.getItem('server_url') : null
    const envBase = import.meta.env.VITE_API_BASE
    const host = window.location.hostname || 'localhost'
    const guessBase = `http://${host}:5000`
    const isLocal = (u) => /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/i.test(String(u||''))
    const strip = (u) => String(u || '').trim().replace(/\/+$/, '')
    const pickBase = () => {
      // Always prefer explicit user-saved URL (LAN / online) — including Electron
      const s = strip(savedBase)
      if (s) return s
      // Electron/dev with nothing saved: local API
      if (isElectron && import.meta.env.DEV) return guessBase
      const e = strip(envBase)
      if (!e) return guessBase
      if (isLocal(e) && host !== 'localhost' && host !== '127.0.0.1') return guessBase
      return e
    }
    const initial = pickBase()
    const g = window
    g.API_BASE = initial
    // Track previous bases so LAN↔online switches keep rewriting old absolute URLs
    g.__API_BASE_CANDIDATES = new Set([
      'http://localhost:5000',
      'https://localhost:5000',
      'http://127.0.0.1:5000',
      'https://127.0.0.1:5000',
    ])
    const e0 = strip(envBase)
    if (e0) g.__API_BASE_CANDIDATES.add(e0)
    if (initial) g.__API_BASE_CANDIDATES.add(strip(initial))

    const rememberBase = (next) => {
      const n = strip(next)
      if (!n) return
      const prev = strip(g.API_BASE)
      if (prev) g.__API_BASE_CANDIDATES.add(prev)
      g.__API_BASE_CANDIDATES.add(n)
      g.API_BASE = n
    }
    g.setAPIBase = (next) => {
      rememberBase(next)
      try { localStorage.setItem('server_url', strip(next)) } catch {}
      try { g.dispatchEvent(new CustomEvent('server_url_changed', { detail: strip(next) })) } catch {}
    }

    window.addEventListener('server_url_changed', (ev) => {
      const next = strip(ev?.detail || localStorage.getItem('server_url') || '')
      if (next) rememberBase(next)
    })

    const orig = g.fetch.bind(g)
    // Rewrite hardcoded localhost / env / previous API URLs to the active server
    g.fetch = (input, init) => {
      try{
        const toUrl = (u) => typeof u === 'string' ? u : (u && 'url' in u ? u.url : '')
        let url = toUrl(input)
        const nextInit = init ? { ...init } : {}
        const method = String(nextInit.method || (input && input.method) || 'GET').toUpperCase()
        // Auto-attach active branch for multi-branch writes/reads
        try {
          const branchId = g.ACTIVE_BRANCH_ID || localStorage.getItem('active_branch_id') || ''
          // Shared catalogs that ignore branch scope (menu still gets branch for overrides when header is set)
          const skipBranch = /\/api\/(auth|health|client-config|warehouse|call-center-orders|customers)(\/|$|\?)/i.test(String(url || ''))
          if (branchId && !skipBranch && typeof url === 'string' && url.includes('/api/')) {
            const headers = new Headers(nextInit.headers || (input && input.headers) || {})
            if (!headers.has('X-Branch-Id')) headers.set('X-Branch-Id', branchId)
            nextInit.headers = headers
          }
        } catch {}

        const maybeKickSync = (finalUrl) => {
          try {
            if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return
            if (!/\/api\//i.test(String(finalUrl || url || ''))) return
            // Skip sync endpoints themselves and auth
            if (/\/api\/(sync|auth|health|client-config)(\/|$|\?)/i.test(String(finalUrl || url || ''))) return
            import('./sync/SyncEngine.js').then(m => m.requestSync?.(method)).catch(() => {})
          } catch {}
        }

        const wrap = (p) => {
          Promise.resolve(p).then(res => {
            if (res && res.ok) maybeKickSync(typeof url === 'string' ? url : '')
          }).catch(() => {})
          return p
        }

        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return wrap(orig(input, nextInit))
        const base = strip(g.API_BASE)
        if (!base) return wrap(orig(input, nextInit))
        const candidates = [...(g.__API_BASE_CANDIDATES || [])]
        const e = strip(envBase)
        if (e && !candidates.includes(e)) candidates.push(e)
        for (const c of candidates) {
          const cc = strip(c)
          if (!cc || cc === base) continue
          if (url === cc || url.startsWith(cc + '/')) {
            return wrap(orig(base + url.slice(cc.length), nextInit))
          }
        }
        return wrap(orig(input, nextInit))
      }catch{}
      return orig(input, init)
    }
    // Auto-discovery only when user has NOT saved a URL (never overwrite LAN/online choice)
    if (!isCapacitor && !strip(savedBase)) {
      const tryDiscover = async () => {
        try{
          // Skip if user saved a URL while we were discovering
          if (strip(localStorage.getItem('server_url'))) return
          const discoverHost = window.location.hostname || 'localhost'
          const discoverBase = `http://${discoverHost}:5000`
          const res = await fetch(`${discoverBase}/api/client-config`, { cache: 'no-store' })
          if (res.ok) {
            if (strip(localStorage.getItem('server_url'))) return
            const j = await res.json()
            if (j && j.apiBase) rememberBase(j.apiBase)
          }
        }catch{}
      }
      tryDiscover()
    }
  }catch{}
})()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Router>
        <UIProvider>
          <AuthProvider>
            <BranchProvider>
              <DataProvider>
                <App />
              </DataProvider>
            </BranchProvider>
          </AuthProvider>
        </UIProvider>
      </Router>
    </ErrorBoundary>
  </React.StrictMode>
)

// Keep PWA installable, but refresh SW so map tiles / API are not intercepted
try {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !isElectron) {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      try { reg.update() } catch {}
    }).catch(() => {})
  }
} catch {}
