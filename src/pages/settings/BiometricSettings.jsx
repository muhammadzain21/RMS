import { useEffect, useState } from 'react'
import { Fingerprint, Info, Network, RefreshCw, Save, PlugZap } from 'lucide-react'
import { useAuth } from '../../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'
import PageHero from '../../components/ui/PageHero.jsx'

export default function BiometricSettings() {
  const { token } = useAuth()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

  const [form, setForm] = useState({
    enabled: false,
    ip: '',
    port: 4370,
    deviceId: 'ZK-01',
    commPassword: 0,
    pollIntervalMs: 120000,
    duplicateWindowSec: 60,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const fetchConfig = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`${API}/api/biometric-config`, { headers })
      if (res.ok) {
        const data = await res.json()
        setForm({
          enabled: data.enabled ?? false,
          ip: data.ip || '',
          port: data.port ?? 4370,
          deviceId: data.deviceId || 'ZK-01',
          commPassword: data.commPassword ?? 0,
          pollIntervalMs: data.pollIntervalMs ?? 120000,
          duplicateWindowSec: data.duplicateWindowSec ?? 60,
        })
      }
    } catch {
      toast.error('Failed to load biometric config')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchConfig() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const save = async () => {
    try {
      setSaving(true)
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }
      const res = await fetch(`${API}/api/biometric-config`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Biometric settings saved')
    } catch {
      toast.error('Failed to save biometric settings')
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    try {
      setTesting(true)
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`${API}/api/biometric/test-connection`, {
        method: 'POST',
        headers,
      })
      const data = await res.json()
      if (data.ok) toast.success(data.message)
      else toast.error(data.message || 'Connection failed')
    } catch {
      toast.error('Failed to test connection')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHero
        icon={Fingerprint}
        title="Biometric Settings"
        subtitle="Connect the fingerprint attendance device to this POS"
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={testConnection}
              disabled={testing || !form.ip}
              className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white ring-1 ring-white/30 hover:bg-white/25 disabled:opacity-50"
            >
              <PlugZap className="h-3.5 w-3.5" /> {testing ? 'Testing…' : 'Test'}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || loading}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-blue-700 shadow-lg hover:bg-blue-50 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-white">
            <Network className="h-5 w-5" />
          </div>
          <div className="space-y-2 text-sm">
            <div className="font-extrabold text-amber-950 dark:text-amber-100">Gateway / DNS are set on the machine — not in this page</div>
            <ul className="list-disc pl-5 space-y-1 font-semibold text-amber-900 dark:text-amber-200">
              <li><b>Do not leave Gateway / DNS as <code>0.0.0.0</code></b> on the biometric device. That means “not set”.</li>
              <li>On the device network menu, set a real <b>IP</b> (e.g. <code>192.168.1.201</code>), matching <b>Subnet Mask</b> (usually <code>255.255.255.0</code>).</li>
              <li>Set <b>Gateway</b> to your router (e.g. <code>192.168.1.1</code>). Set <b>DNS</b> to the same router, or <code>8.8.8.8</code>.</li>
              <li>This POS page only needs the device <b>IP + Port (4370)</b>. Enter that IP below after you configure the machine.</li>
              <li>PC and device must be on the <b>same LAN / same subnet</b> for sync to work.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-500" />
          <div className="font-extrabold text-[var(--color-text-primary)]">App connection settings</div>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)]">
            <div>
              <div className="font-extrabold text-[var(--color-text-primary)]">Enable Biometric</div>
              <div className="text-xs font-semibold text-[var(--color-text-muted)]">Turn on to sync attendance from the fingerprint device</div>
            </div>
            <button
              type="button"
              onClick={() => update('enabled', !form.enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.enabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-[#ffffff] transition-transform ${form.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Device IP</label>
              <input type="text" value={form.ip} onChange={e => update('ip', e.target.value)} placeholder="192.168.1.201" className="input mt-1" />
              <p className="text-xs font-semibold text-[var(--color-text-muted)] mt-1">Must match the IP configured on the machine</p>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Port</label>
              <input type="number" value={form.port} onChange={e => update('port', Number(e.target.value))} className="input mt-1" />
              <p className="text-xs font-semibold text-[var(--color-text-muted)] mt-1">Usually 4370 for ZK devices</p>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Device ID</label>
              <input type="text" value={form.deviceId} onChange={e => update('deviceId', e.target.value)} className="input mt-1" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">COMM Password</label>
              <input type="number" value={form.commPassword} onChange={e => update('commPassword', Number(e.target.value))} className="input mt-1" />
              <p className="text-xs font-semibold text-[var(--color-text-muted)] mt-1">Use 0 if the device has no password</p>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Poll Interval (ms)</label>
              <input type="number" value={form.pollIntervalMs} onChange={e => update('pollIntervalMs', Number(e.target.value))} step="1000" min="5000" className="input mt-1" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Duplicate Window (sec)</label>
              <input type="number" value={form.duplicateWindowSec} onChange={e => update('duplicateWindowSec', Number(e.target.value))} min="0" className="input mt-1" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={fetchConfig} className="ui-btn ui-btn-secondary">
              <RefreshCw className="h-4 w-4" /> Reload
            </button>
            <button type="button" onClick={testConnection} disabled={testing || !form.ip} className="ui-btn ui-btn-primary disabled:opacity-50">
              <PlugZap className="h-4 w-4" /> {testing ? 'Testing…' : 'Test Connection'}
            </button>
            <button type="button" onClick={save} disabled={saving || loading} className="ui-btn ui-btn-primary disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
