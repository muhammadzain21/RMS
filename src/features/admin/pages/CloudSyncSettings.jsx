import { useEffect, useState } from 'react'
import { Cloud, Loader2, RefreshCw, Save } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useAuth } from '@/state/AuthContext.jsx'
import {
  getSyncStatus,
  syncOnce,
  startSyncEngine,
  stopSyncEngine,
  normalizeCloudUrl,
  isCloudSyncEnabled,
  setCloudSyncEnabled,
  getSavedCloudUrl,
} from '@/sync/SyncEngine.js'

const inputClass =
  'w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all'

function readFormFromStorage() {
  try {
    return {
      enabled: isCloudSyncEnabled(),
      url: getSavedCloudUrl() || String(localStorage.getItem('cloud_sync_url') || ''),
      token: String(localStorage.getItem('cloud_sync_token') || ''),
    }
  } catch {
    return { enabled: false, url: '', token: '' }
  }
}

function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return String(a || '').replace(/\/+$/, '') === String(b || '').replace(/\/+$/, '')
  }
}

export default function CloudSyncSettings() {
  const { token } = useAuth()
  const [form, setForm] = useState(readFormFromStorage)
  const [status, setStatus] = useState(() => getSyncStatus())
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)

  const refreshStatus = () => {
    try { setStatus(getSyncStatus()) } catch {}
  }

  // Re-read storage when opening the page (avoids stale form after other tabs / reloads)
  useEffect(() => {
    setForm(readFormFromStorage())
    refreshStatus()
  }, [])

  useEffect(() => {
    const onSync = () => refreshStatus()
    const onConfig = () => {
      setForm(readFormFromStorage())
      refreshStatus()
    }
    window.addEventListener('epicspire:sync', onSync)
    window.addEventListener('cloud_sync_config_changed', onConfig)
    return () => {
      window.removeEventListener('epicspire:sync', onSync)
      window.removeEventListener('cloud_sync_config_changed', onConfig)
    }
  }, [])

  const persist = ({ url, tok, enabled }) => {
    const normalized = normalizeCloudUrl(url)
    if (normalized) localStorage.setItem('cloud_sync_url', normalized)
    else localStorage.removeItem('cloud_sync_url')
    if (tok) localStorage.setItem('cloud_sync_token', tok)
    else localStorage.removeItem('cloud_sync_token')
    setCloudSyncEnabled(enabled)
    return normalized
  }

  const applyEngine = (enabled, url) => {
    try {
      window.dispatchEvent(new CustomEvent('cloud_sync_config_changed', {
        detail: { url, enabled },
      }))
    } catch {}
    if (!token) return
    if (enabled && url) startSyncEngine(() => sessionStorage.getItem('auth_token') || token)
    else stopSyncEngine()
  }

  const save = () => {
    setSaving(true)
    try {
      const tok = String(form.token || '').trim()
      let enabled = Boolean(form.enabled)
      const typed = String(form.url || '').trim()

      if (!typed && enabled) {
        toast.error('Enter a Cloud Sync URL before enabling')
        setSaving(false)
        return
      }

      // Typing a URL and hitting Save should turn sync on (common “I saved but nothing happened”)
      if (typed && !enabled) enabled = true

      const url = persist({ url: typed, tok, enabled })
      if (typed && !url) {
        toast.error('Invalid Cloud Sync URL')
        setSaving(false)
        return
      }

      const local = status.local || ((typeof window !== 'undefined' && window.API_BASE) || '')
      if (url && local && sameOrigin(url, local)) {
        toast.error('Cloud URL must be your VPS, not this PC’s local API')
        // Still keep the saved values so the field does not look “wiped”
        setForm({ enabled, url, token: tok })
        refreshStatus()
        setSaving(false)
        return
      }

      setForm({ enabled, url, token: tok })
      applyEngine(enabled, url)
      refreshStatus()

      if (!url) toast.success('Cloud URL cleared — sync off')
      else if (!enabled) toast.success('Cloud sync off — URL kept')
      else toast.success(`Cloud sync on (${url})`)
    } catch {
      toast.error('Could not save cloud sync settings')
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = (on) => {
    try {
      const typed = String(form.url || '').trim()
      const url = normalizeCloudUrl(typed) || getSavedCloudUrl()
      if (on && !url) {
        toast.error('Enter and save a Cloud Sync URL first')
        return
      }
      const tok = String(form.token || '').trim()
      const savedUrl = persist({ url: url || typed, tok, enabled: on })
      setForm((v) => ({ ...v, enabled: on, url: savedUrl || v.url }))
      applyEngine(on, savedUrl)
      refreshStatus()
      toast.success(on ? 'Cloud sync enabled' : 'Cloud sync disabled')
    } catch {
      toast.error('Could not update sync toggle')
    }
  }

  const runNow = async () => {
    if (!token) { toast.error('Login required'); return }
    if (!form.enabled && !isCloudSyncEnabled()) {
      toast('Turn on Cloud Sync first', { icon: 'ℹ️' })
      return
    }
    setBusy(true)
    try {
      const r = await syncOnce(token)
      refreshStatus()
      if (r?.skipped) {
        const msg = r.reason === 'cloud sync is turned off'
          ? 'Cloud sync is turned off'
          : r.reason === 'cloud_sync_url not set or same as local'
            ? 'Set a VPS URL different from this PC’s local API'
            : r.reason === 'browser offline — will sync when back online'
              ? 'You are offline — reconnect and Sync Now'
              : r.reason === 'no active branch'
                ? 'Select a branch in the header then sync'
                : (r.reason || 'Sync skipped')
        toast(msg, { icon: 'ℹ️' })
      } else if (r?.ok) toast.success('Synced with cloud')
      else toast.error(r?.error || 'Sync failed')
    } catch (e) {
      toast.error(e?.message || 'Sync failed')
    } finally {
      setBusy(false)
      refreshStatus()
    }
  }

  return (
    <div className="space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-600 shadow-lg">
            <Cloud className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cloud Sync</h1>
            <p className="text-sm text-gray-500">Branch ↔ VPS</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runNow}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {busy ? 'Syncing…' : 'Sync Now'}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="ui-btn ui-btn-primary inline-flex items-center gap-2 px-4 disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Save Settings
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/40">
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">Enable cloud sync</div>
            <div className="text-xs text-slate-500">
              {form.enabled ? 'Syncing is on' : 'Syncing is off — URL stays saved'}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.enabled}
            onClick={() => toggleEnabled(!form.enabled)}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
              form.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <span
              className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                form.enabled ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Cloud Sync URL (VPS)
            </label>
            <input
              className={inputClass}
              value={form.url}
              onChange={(e) => setForm((v) => ({ ...v, url: e.target.value }))}
              onBlur={() => {
                const normalized = normalizeCloudUrl(form.url)
                if (normalized && normalized !== form.url) {
                  setForm((v) => ({ ...v, url: normalized }))
                }
              }}
              placeholder="https://forksnknives.epicspire.com"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-slate-500">
              Save once with the VPS URL — sync stays on for every login (cashier included).
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Cloud Sync Token (optional)
            </label>
            <input
              type="password"
              className={inputClass}
              value={form.token}
              onChange={(e) => setForm((v) => ({ ...v, token: e.target.value }))}
              placeholder="Optional HQ JWT (recommended if VPS secret differs)"
              autoComplete="off"
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm space-y-1 dark:border-gray-600 dark:bg-gray-900/40">
            <div>
              <span className="text-gray-500">Status:</span>{' '}
              <span className={`font-medium ${status.enabled ? 'text-emerald-600' : 'text-slate-500'}`}>
                {status.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div><span className="text-gray-500">Local API:</span> <span className="font-medium break-all">{status.local || '—'}</span></div>
            <div><span className="text-gray-500">Cloud URL:</span> <span className="font-medium break-all">{status.cloud || '(not set)'}</span></div>
            <div><span className="text-gray-500">Last OK:</span> <span className="font-medium">{status.lastOkAt || '—'}</span></div>
            {status.lastError ? (
              <div className="text-rose-600 dark:text-rose-400">Error: {status.lastError}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
