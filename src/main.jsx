import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { UIProvider } from './state/UIContext.jsx'
import { AuthProvider } from './state/AuthContext.jsx'
import { DataProvider } from './state/DataContext.jsx'

const isElectron = /Electron/i.test(navigator.userAgent)
const Router = isElectron ? HashRouter : BrowserRouter

// Runtime API base discovery and fetch rewrite
;(function(){
  try{
    const envBase = import.meta.env.VITE_API_BASE
    const host = window.location.hostname || 'localhost'
    const guessBase = `http://${host}:5000`
    const isLocal = (u) => /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/i.test(String(u||''))
    const pickBase = () => {
      const e = String(envBase||'').trim()
      if (!e) return guessBase
      if (isLocal(e) && host !== 'localhost' && host !== '127.0.0.1') return guessBase
      return e
    }
    const initial = pickBase()
    const g = window
    g.API_BASE = initial
    const orig = g.fetch.bind(g)
    g.fetch = (input, init) => {
      try{
        const toUrl = (u) => typeof u === 'string' ? u : (u && 'url' in u ? u.url : '')
        const url = toUrl(input)
        if (typeof url === 'string' && /^https?:\/\/(localhost|127\.0\.0\.1):5000\//i.test(url)) {
          const base = String(g.API_BASE||'http://localhost:5000')
          const rew = url.replace(/^https?:\/\/(localhost|127\.0\.0\.1):5000/i, base)
          return orig(rew, init)
        }
      }catch{}
      return orig(input, init)
    }
    const tryDiscover = async () => {
      try{
        // Always try the server at current hostname (fallback to localhost in packaged app)
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
