import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { UIProvider } from './state/UIContext.jsx'
import { AuthProvider } from './state/AuthContext.jsx'
import { DataProvider } from './state/DataContext.jsx'

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
        const url = toUrl(input)
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return orig(input, init)
        const base = String(g.API_BASE || '').replace(/\/+$/, '')
        if (!base) return orig(input, init)
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
            return orig(base + url.slice(c.length), init)
          }
        }
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
          <DataProvider>
            <App />
          </DataProvider>
        </AuthProvider>
      </UIProvider>
    </Router>
  </React.StrictMode>
)
