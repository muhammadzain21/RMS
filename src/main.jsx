import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { UIProvider } from './state/UIContext.jsx'
import { AuthProvider } from './state/AuthContext.jsx'
import { DataProvider } from './state/DataContext.jsx'
import { BranchProvider } from './state/BranchContext.jsx'

const isElectron = /Electron/i.test(navigator.userAgent)
const isCapacitor = typeof window !== 'undefined' && !!(window.Capacitor || /Capacitor/i.test(navigator.userAgent))
// Use HashRouter for Electron and Capacitor (file:// / capacitor:// origins)
const Router = (isElectron || isCapacitor) ? HashRouter : BrowserRouter

// Runtime API base discovery and fetch rewrite
;(function(){
  try{
    // Check for a user-configured server URL (mobile app / cloud)
    const savedBase = typeof localStorage !== 'undefined' ? localStorage.getItem('server_url') : null
    const envBase = import.meta.env.VITE_API_BASE
    const host = window.location.hostname || 'localhost'
    const guessBase = `http://${host}:5000`
    const isLocal = (u) => /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/i.test(String(u||''))
    const pickBase = () => {
      // Electron/dev: prefer local API so stale cloud URLs don't break login
      if (isElectron && import.meta.env.DEV) return guessBase
      // Priority: saved server URL (mobile) > env base > guessed base
      const s = String(savedBase||'').trim()
      if (s) return s
      const e = String(envBase||'').trim()
      if (!e) return guessBase
      if (isLocal(e) && host !== 'localhost' && host !== '127.0.0.1') return guessBase
      return e
    }
    const initial = pickBase()
    const g = window
    g.API_BASE = initial
    const orig = g.fetch.bind(g)
    // Rewrite hardcoded localhost / env API URLs to the active server (LAN or online)
    g.fetch = (input, init) => {
      try{
        const toUrl = (u) => typeof u === 'string' ? u : (u && 'url' in u ? u.url : '')
        let url = toUrl(input)
        const nextInit = init ? { ...init } : {}
        // Auto-attach active branch for multi-branch writes/reads
        try {
          const branchId = g.ACTIVE_BRANCH_ID || localStorage.getItem('active_branch_id') || ''
          // Skip auth/health/config — no branch scope needed (also avoids CORS preflight noise)
          // Warehouse catalog is HQ-global (no branch). Auth/health/config skip too.
          // Call-center list/inbox is cross-branch by default (pages may still pass branchId when needed)
          // Shared/global: customers + call-center lists; warehouse is HQ catalog
          const skipBranch = /\/api\/(auth|health|client-config|warehouse|call-center-orders|customers)(\/|$|\?)/i.test(String(url || ''))
          if (branchId && !skipBranch && typeof url === 'string' && url.includes('/api/')) {
            const headers = new Headers(nextInit.headers || (input && input.headers) || {})
            if (!headers.has('X-Branch-Id')) headers.set('X-Branch-Id', branchId)
            nextInit.headers = headers
          }
        } catch {}
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return orig(input, nextInit)
        const base = String(g.API_BASE || '').replace(/\/+$/, '')
        if (!base) return orig(input, nextInit)
        const candidates = [
          'http://localhost:5000',
          'https://localhost:5000',
          'http://127.0.0.1:5000',
          'https://127.0.0.1:5000',
        ]
        const e = String(envBase || '').trim().replace(/\/+$/, '')
        if (e && !candidates.includes(e)) candidates.push(e)
        for (const c of candidates) {
          if (c === base) continue
          if (url === c || url.startsWith(c + '/')) {
            return orig(base + url.slice(c.length), nextInit)
          }
        }
        return orig(input, nextInit)
      }catch{}
      return orig(input, init)
    }
    // Skip auto-discovery on Capacitor — user manually configures the server URL
    if (!isCapacitor) {
      const tryDiscover = async () => {
        try{
          const discoverHost = window.location.hostname || 'localhost'
          const discoverBase = `http://${discoverHost}:5000`
          const res = await fetch(`${discoverBase}/api/client-config`, { cache: 'no-store' })
          if (res.ok) {
            const j = await res.json()
            if (j && j.apiBase) g.API_BASE = String(j.apiBase)
          }
        }catch{}
      }
      tryDiscover()
    }
  }catch{}
})()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
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
  </React.StrictMode>
)
