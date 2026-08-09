import { useEffect, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'

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

 useEffect(() => {
 fetchConfig()
 }, [])

 const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

 const save = async () => {
 try {
 setSaving(true)
 const headers = {
 'Content-Type': 'application/json',
 ...(token ? { Authorization: `Bearer ${token}` } : {})
 }
 const res = await fetch(`${API}/api/biometric-config`, {
 method: 'PATCH',
 headers,
 body: JSON.stringify(form)
 })
 if (!res.ok) throw new Error('Failed')
 await res.json()
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
 headers
 })
 const data = await res.json()
 if (data.ok) {
 toast.success(data.message)
 } else {
 toast.error(data.message || 'Connection failed')
 }
 } catch {
 toast.error('Failed to test connection')
 } finally {
 setTesting(false)
 }
 }

 return (
 <div className="max-w-3xl mx-auto space-y-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center"><span className="text-2xl"></span></div><div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Biometric Settings</h1><p className="text-sm text-gray-500 dark:text-gray-400">Configure fingerprint attendance device</p></div></div><div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"><div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-orange-50 to-white dark:from-gray-800 dark:to-gray-800"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center"><span className="text-xl"></span></div><div><h3 className="text-lg font-semibold text-gray-900 dark:text-white">Device Connection</h3><p className="text-sm text-gray-500 dark:text-gray-400">IP, port and authentication</p></div></div></div><div className="p-6 space-y-5">
 {/* Toggle */}
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600"><div><div className="font-medium text-gray-900 dark:text-white">Enable Biometric</div><div className="text-xs text-gray-500 dark:text-gray-400">Turn on to sync attendance from fingerprint device</div></div><button
 onClick={() => update('enabled', !form.enabled)}
 className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
 form.enabled ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
 }`}
 ><span
 className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
 form.enabled ? 'translate-x-6' : 'translate-x-1'
 }`}
 /></button></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-5"><div className="space-y-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Device IP</label><input
 type="text"
 value={form.ip}
 onChange={e => update('ip', e.target.value)}
 placeholder="192.168.1.201"
 className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
 /></div><div className="space-y-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Port</label><input
 type="number"
 value={form.port}
 onChange={e => update('port', Number(e.target.value))}
 className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
 /></div><div className="space-y-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Device ID</label><input
 type="text"
 value={form.deviceId}
 onChange={e => update('deviceId', e.target.value)}
 className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
 /></div><div className="space-y-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">COMM Password</label><input
 type="number"
 value={form.commPassword}
 onChange={e => update('commPassword', Number(e.target.value))}
 className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
 /><p className="text-xs text-gray-500 dark:text-gray-400">Use 0 if device password is not set</p></div><div className="space-y-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Poll Interval (ms)</label><input
 type="number"
 value={form.pollIntervalMs}
 onChange={e => update('pollIntervalMs', Number(e.target.value))}
 step="1000"
 min="5000"
 className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
 /><p className="text-xs text-gray-500 dark:text-gray-400">How often to sync attendance from device</p></div><div className="space-y-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Duplicate Window (sec)</label><input
 type="number"
 value={form.duplicateWindowSec}
 onChange={e => update('duplicateWindowSec', Number(e.target.value))}
 min="0"
 className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
 /><p className="text-xs text-gray-500 dark:text-gray-400">Ignore duplicate scans within this time</p></div></div><div className="flex flex-wrap items-center gap-3 pt-2"><button
 onClick={testConnection}
 disabled={testing || !form.ip}
 className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg transition-colors shadow-sm"
 >
 {testing ? 'Testing...' : 'Test Connection'}
 </button><button
 onClick={save}
 disabled={saving || loading}
 className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-medium rounded-lg transition-colors shadow-sm"
 >
 {saving ? 'Saving...' : 'Save Settings'}
 </button></div></div></div></div>
 )
}
