import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ShieldCheck, X } from 'lucide-react'
import { sidebarItems } from '../layout/navConfig.js'
import { useData } from '../state/DataContext.jsx'

// Hidden superadmin portal — opened with Ctrl+Alt+S.
// Lets the owner toggle which pages/features are enabled on this installation.
export default function SuperAdminPortal() {
  const [open, setOpen] = useState(false)
  const { dispatch } = useData()

  // Global shortcut: Ctrl+Alt+S
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return null
  return <PortalModal onClose={() => setOpen(false)} dispatch={dispatch} />
}

function PortalModal({ onClose, dispatch }) {
  const getAPI = () => ((typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000')

  const [step, setStep] = useState('login') // 'login' | 'manage'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [saToken, setSaToken] = useState('')
  const [enabled, setEnabled] = useState({}) // path -> boolean
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const items = useMemo(() => sidebarItems.filter(i => !i.hidden), [])

  const loadSettings = async (token) => {
    try {
      setLoading(true)
      const res = await fetch(`${getAPI()}/api/settings`)
      const s = res.ok ? await res.json() : null
      const paths = s?.enabledPaths
      const map = {}
      items.forEach(i => {
        map[i.path] = !Array.isArray(paths) || paths.length === 0 ? true : paths.includes(i.path)
      })
      setEnabled(map)
    } catch {
      toast.error('Failed to load feature access')
    } finally {
      setLoading(false)
    }
  }

  const login = async (e) => {
    e.preventDefault()
    setError('')
    if (!username || !password) { setError('Username and password are required'); return }
    try {
      setLoading(true)
      const res = await fetch(`${getAPI()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = res.ok ? await res.json() : null
      if (!res.ok || !data?.token) {
        setError(data?.error || 'Invalid credentials')
        return
      }
      if (data.user?.role !== 'SuperAdmin') {
        setError('This portal is restricted to the superadmin account')
        return
      }
      setSaToken(data.token)
      setStep('manage')
      await loadSettings(data.token)
    } catch {
      setError('Login failed')
    } finally {
      setLoading(false)
    }
  }

  const toggle = (path) => setEnabled(prev => ({ ...prev, [path]: !prev[path] }))

  const save = async () => {
    const enabledPaths = items.filter(i => enabled[i.path]).map(i => i.path)
    if (enabledPaths.length === 0) {
      toast.error('At least one page must stay enabled')
      return
    }
    try {
      setSaving(true)
      const res = await fetch(`${getAPI()}/api/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saToken}` },
        body: JSON.stringify({ enabledPaths }),
      })
      if (res.ok) {
        const s = await res.json()
        dispatch?.({ type: 'UPDATE_SETTINGS', payload: { enabledPaths: s.enabledPaths } })
        toast.success('Feature access updated')
        onClose()
      } else {
        const body = await res.json().catch(() => ({}))
        toast.error(body?.error || 'Failed to save feature access')
      }
    } catch {
      toast.error('Failed to save feature access')
    } finally {
      setSaving(false)
    }
  }

  const enableAll = () => {
    const map = {}
    items.forEach(i => { map[i.path] = true })
    setEnabled(map)
  }

  // Group items by section (preserves order)
  const grouped = useMemo(() => {
    const g = {}
    items.forEach(i => {
      const s = i.section || 'Dashboard'
      if (!g[s]) g[s] = []
      g[s].push(i)
    })
    Object.keys(g).forEach(k => g[k].sort((a, b) => a.order - b.order))
    return g
  }, [items])

  const enabledCount = items.filter(i => enabled[i.path]).length

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-slate-900 to-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-purple-600 flex items-center justify-center">
              <ShieldCheck size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">SuperAdmin Portal</h2>
              <p className="text-[11px] text-slate-400">Feature access management</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {step === 'login' ? (
          /* ── Login step ── */
          <form onSubmit={login} className="p-6 space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Sign in with the superadmin account to manage which pages are enabled on this installation.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                placeholder="superadmin"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        ) : (
          /* ── Manage step ── */
          <>
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-semibold text-gray-900 dark:text-white">{enabledCount}</span> of {items.length} pages enabled — applies to all users on this install
              </p>
              <button onClick={enableAll} className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline">
                Enable all
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loading ? (
                <p className="text-sm text-gray-500 text-center py-8">Loading...</p>
              ) : (
                Object.keys(grouped).map(section => (
                  <div key={section} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                      {section}
                    </div>
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {grouped[section].map(item => (
                        <button
                          key={item.path}
                          onClick={() => toggle(item.path)}
                          className={`flex items-center justify-between p-2.5 rounded-lg border transition-all text-left ${
                            enabled[item.path]
                              ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
                              : 'bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                          }`}
                        >
                          <span className={`text-sm font-medium ${enabled[item.path] ? 'text-purple-900 dark:text-purple-200' : 'text-gray-600 dark:text-gray-400'}`}>
                            {item.label}
                          </span>
                          <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                            enabled[item.path] ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                          }`}>
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[#ffffff] transition-transform ${
                              enabled[item.path] ? 'translate-x-4' : 'translate-x-1'
                            }`} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || loading}
                className="px-5 py-2 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
