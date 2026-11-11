import { useEffect, useState } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'
import { toast } from 'react-hot-toast'
import { getSyncStatus, syncOnce, startSyncEngine, normalizeCloudUrl } from '../../sync/SyncEngine.js'

// Helper components defined outside Settings to prevent remounting on state changes
const TabButton = ({ id, label, icon, activeTab, onClick }) => (
 <button
 onClick={() => onClick(id)}
 className={`flex items-center gap-2 px-5 py-3 rounded-t-lg font-medium transition-all duration-200 ${
 activeTab === id
 ? 'bg-white text-blue-600 border-t-2 border-blue-500 shadow-sm'
 : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
 }`}
 ><span className="text-lg">{icon}</span><span>{label}</span></button>
)

const Card = ({ children, className = '' }) => (
 <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden ${className}`}>
 {children}
 </div>
)

const CardHeader = ({ title, subtitle, icon }) => (
 <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center"><span className="text-xl">{icon}</span></div><div><h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
 {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
 </div></div></div>
)

const CardBody = ({ children }) =><div className="p-6 space-y-5">{children}</div>

const InputGroup = ({ label, children, helpText }) => (
 <div className="space-y-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
 {children}
 {helpText && <p className="text-xs text-gray-500 dark:text-gray-400">{helpText}</p>}
 </div>
)

const PrimaryButton = ({ onClick, children, icon, disabled = false }) => (
 <button
 type="button"
 onClick={onClick}
 disabled={disabled}
 className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
 >
 {icon && <span>{icon}</span>}
 {children}
 </button>
)

const SecondaryButton = ({ onClick, children, icon }) => (
 <button
 onClick={onClick}
 className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
 >
 {icon && <span>{icon}</span>}
 {children}
 </button>
)

export default function Settings() {
 const { state, dispatch } = useData()
 const { token } = useAuth()
 const { activeBranch, activeBranchId, isAllBranches, requireBranch } = useBranch()
 const s = state.settings || {}
 const [tab, setTab] = useState('company')
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const branchLabel = activeBranch?.name || activeBranch?.code || ''

 const [company, setCompany] = useState({
 companyName: s.companyName || '',
 phone: s.phone || '',
 address: s.address || '',
 billingFooter: s.billingFooter || '',
 logo: s.logo || '',
 })
 const [system, setSystem] = useState({
 taxRate: s.taxRate ?? 0,
 useBusinessDayForToday: s.useBusinessDayForToday ?? true,
 businessDayCutoffHour: s.businessDayCutoffHour ?? 4,
 showPersonalPayment: Boolean(s.showPersonalPayment),
 kotPrinterName: s.kotPrinterName || '',
 billPrinterName: s.billPrinterName || '',
 })

 const [cloudSync, setCloudSync] = useState(() => {
  try {
   return {
    url: String(localStorage.getItem('cloud_sync_url') || ''),
    token: String(localStorage.getItem('cloud_sync_token') || ''),
   }
  } catch {
   return { url: '', token: '' }
  }
 })
 const [cloudSyncStatus, setCloudSyncStatus] = useState(() => getSyncStatus())
 const [cloudSyncBusy, setCloudSyncBusy] = useState(false)

 const refreshCloudSyncStatus = () => {
  try { setCloudSyncStatus(getSyncStatus()) } catch {}
 }

 useEffect(() => {
  const onSync = () => refreshCloudSyncStatus()
  window.addEventListener('epicspire:sync', onSync)
  return () => window.removeEventListener('epicspire:sync', onSync)
 }, [])

 const saveCloudSync = () => {
  try {
   const url = normalizeCloudUrl(cloudSync.url)
   const tok = String(cloudSync.token || '').trim()
   if (url) localStorage.setItem('cloud_sync_url', url)
   else localStorage.removeItem('cloud_sync_url')
   if (tok) localStorage.setItem('cloud_sync_token', tok)
   else localStorage.removeItem('cloud_sync_token')
   setCloudSync(v => ({ ...v, url, token: tok }))
   try { window.dispatchEvent(new CustomEvent('cloud_sync_config_changed', { detail: { url } })) } catch {}
   if (token) startSyncEngine(() => token)
   refreshCloudSyncStatus()
   toast.success(url ? `Cloud sync URL saved (${url})` : 'Cloud sync cleared (local-only)')
  } catch {
   toast.error('Could not save cloud sync settings')
  }
 }

 const runCloudSyncNow = async () => {
  if (!token) { toast.error('Login required'); return }
  setCloudSyncBusy(true)
  try {
   const r = await syncOnce(token)
   refreshCloudSyncStatus()
   if (r?.skipped) toast(r.reason === 'cloud_sync_url not set or same as local'
     ? 'Set a VPS URL different from this PC’s local API'
     : (r.reason || 'Sync skipped'), { icon: 'ℹ️' })
   else if (r?.ok) toast.success('Synced with cloud')
   else toast.error(r?.error || 'Sync failed')
  } catch (e) {
   toast.error(e?.message || 'Sync failed')
  } finally {
   setCloudSyncBusy(false)
   refreshCloudSyncStatus()
  }
 }

 const defaultSellFields = () => ({
 totalTax: false,
 amountIncTax: false,
 totalItemsDiscount: false,
 billDiscPct: false,
 billDiscAmt: false,
 serviceCharges: false,
 taxAmt: false,
 })
 const [sellFields, setSellFields] = useState(() => ({
 ...defaultSellFields(),
 ...(s.sellPageFields || {}),
 }))

 const applySettingsToForm = (ns = {}) => {
 setCompany({
 companyName: ns.companyName || '',
 phone: ns.phone || '',
 address: ns.address || '',
 billingFooter: ns.billingFooter || '',
 logo: ns.logo || '',
 })
 setSystem({
 taxRate: ns.taxRate ?? 0,
 useBusinessDayForToday: ns.useBusinessDayForToday ?? true,
 businessDayCutoffHour: ns.businessDayCutoffHour ?? 4,
 showPersonalPayment: Boolean(ns.showPersonalPayment),
 kotPrinterName: ns.kotPrinterName || '',
 billPrinterName: ns.billPrinterName || '',
 })
 setSellFields({
 ...defaultSellFields(),
 ...(ns.sellPageFields || {}),
 })
 }

 // Keep form in sync when DataContext settings change for the active branch
 useEffect(() => {
  const ns = state.settings || {}
  // Ignore stale hydrate from a previous branch
  if (activeBranchId && ns.branchId && String(ns.branchId) !== String(activeBranchId)) return
  applySettingsToForm(ns)
 }, [state.settings, activeBranchId])

 // Explicit refetch when header branch changes
 useEffect(() => {
 let cancelled = false
 const load = async () => {
  if (!token) return
  if (isAllBranches || !activeBranchId) {
   applySettingsToForm({})
   return
  }
  try {
   const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'X-Branch-Id': String(activeBranchId),
   }
   const res = await fetch(`${API}/api/settings`, { headers, cache: 'no-store' })
   if (!res.ok || cancelled) return
   const saved = await res.json()
   if (cancelled) return
   const next = { ...(saved || {}), branchId: saved?.branchId || activeBranchId }
   dispatch({ type: 'HYDRATE', payload: { settings: next } })
   applySettingsToForm(next)
  } catch {}
 }
 load()
 return () => { cancelled = true }
 }, [token, activeBranchId, isAllBranches, API, dispatch])

 const [printers, setPrinters] = useState([])
 useEffect(() => {
 let done = false
 async function loadPrinters() {
 try {
 if (tab !== 'system') return
 if (window?.printing && typeof window.printing.listPrinters === 'function') {
 const list = await window.printing.listPrinters()
 if (!done) setPrinters(Array.isArray(list) ? list : [])
 return
 }
 const res = await fetch(`${API}/api/print/printers`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
 if (res.ok) {
 const list = await res.json()
 if (!done) setPrinters(Array.isArray(list) ? list : [])
 }
 } catch { }
 }
 loadPrinters()
 return () => { done = true }
 }, [tab, API, token])

 const settingsHeaders = () => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(activeBranchId ? { 'X-Branch-Id': String(activeBranchId) } : {}),
 })

 const saveCompany = async () => {
 if (!requireBranch('Select a branch in the header to edit that branch’s settings')) return
 try {
 const res = await fetch(`${API}/api/settings`, { method: 'PATCH', headers: settingsHeaders(), body: JSON.stringify(company) })
 const saved = await res.json().catch(() => ({}))
 if (!res.ok) throw new Error(saved.error || 'Failed')
 dispatch({ type: 'HYDRATE', payload: { settings: { ...saved, branchId: saved.branchId || activeBranchId } } })
 toast.success(`Restaurant settings saved${branchLabel ? ` (${branchLabel})` : ''}`)
 } catch (e) {
 toast.error(e.message || 'Failed to save restaurant settings')
 }
 }

 const saveSystem = async () => {
 if (!requireBranch('Select a branch in the header to edit that branch’s settings')) return
 try {
 const payload = {
 ...system,
 businessDayCutoffHour: Math.min(23, Math.max(0, Number(system.businessDayCutoffHour ?? 4)))
 }
 const res = await fetch(`${API}/api/settings`, { method: 'PATCH', headers: settingsHeaders(), body: JSON.stringify(payload) })
 const saved = await res.json().catch(() => ({}))
 if (!res.ok) throw new Error(saved.error || 'Failed')
 dispatch({ type: 'HYDRATE', payload: { settings: { ...saved, branchId: saved.branchId || activeBranchId } } })
 toast.success(`System settings saved${branchLabel ? ` (${branchLabel})` : ''}`)
 } catch (e) {
 toast.error(e.message || 'Failed to save system settings')
 }
 }

 const saveRestrictions = async () => {
 if (!requireBranch('Select a branch in the header to edit that branch’s settings')) return
 try {
 const res = await fetch(`${API}/api/settings`, {
 method: 'PATCH',
 headers: settingsHeaders(),
 body: JSON.stringify({ sellPageFields: sellFields }),
 })
 const saved = await res.json().catch(() => ({}))
 if (!res.ok) throw new Error(saved.error || 'Failed')
 dispatch({ type: 'HYDRATE', payload: { settings: { ...saved, branchId: saved.branchId || activeBranchId } } })
 toast.success(`Sell page restrictions saved${branchLabel ? ` (${branchLabel})` : ''}`)
 } catch (e) {
 toast.error(e.message || 'Failed to save restrictions')
 }
 }

 const onLogoChange = (file) => {
 if (!file) return
 const reader = new FileReader()
 reader.onload = () => setCompany(prev => ({ ...prev, logo: String(reader.result) }))
 reader.readAsDataURL(file)
 }

 return (
 <div className="space-y-4 w-full">
 {/* Header */}
 <div className="flex items-center gap-4"><div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg"><span className="text-2xl text-white font-bold">S</span></div><div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1><p className="text-sm text-gray-500">Per-branch restaurant and system preferences{branchLabel ? ` · editing ${branchLabel}` : ''}</p></div></div>
 {isAllBranches ? (
  <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
   Select a branch in the header (<b>Working as</b>) to view and save that branch’s settings. Cloud Sync below is machine-local and does not need a branch.
  </div>
 ) : null}

 {/* Tabs */}
 <div className="border-b border-gray-200 dark:border-gray-700"><div className="flex flex-wrap gap-1"><TabButton id="company" label="Restaurant" icon="" activeTab={tab} onClick={setTab} /><TabButton id="system" label="System" icon="" activeTab={tab} onClick={setTab} /><TabButton id="restriction" label="Restriction" icon="" activeTab={tab} onClick={setTab} /><TabButton id="cloud" label="Cloud Sync" icon="" activeTab={tab} onClick={setTab} /></div></div>

 {/* Company Settings */}
 {tab === 'company' && (
 <div className="space-y-4"><Card><CardHeader
 title="Restaurant Information"
 subtitle="Configure your restaurant details that appear on receipts and reports"
 icon=""
 /><CardBody><div className="grid grid-cols-1 lg:grid-cols-2 gap-5"><InputGroup label="Restaurant Name"><input
 className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
 value={company.companyName}
 onChange={e => setCompany(v => ({ ...v, companyName: e.target.value }))}
 placeholder="Enter restaurant name"
 /></InputGroup><InputGroup label="Phone Number"><input
 className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
 value={company.phone}
 onChange={e => setCompany(v => ({ ...v, phone: e.target.value }))}
 placeholder="+1 234 567 8900"
 /></InputGroup></div><InputGroup label="Restaurant Address" helpText="This will appear on customer receipts"><textarea
 className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
 rows={3}
 value={company.address}
 onChange={e => setCompany(v => ({ ...v, address: e.target.value }))}
 placeholder="Enter full address"
 /></InputGroup><InputGroup label="Receipt Footer Message" helpText="Custom message shown at the bottom of receipts"><textarea
 className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
 rows={2}
 value={company.billingFooter}
 onChange={e => setCompany(v => ({ ...v, billingFooter: e.target.value }))}
 placeholder="Thank you for your visit!"
 /></InputGroup><div className="pt-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Restaurant Logo</label><div className="flex items-center gap-4"><div className="relative"><input
 type="file"
 accept="image/*"
 className="hidden"
 id="logo-upload"
 onChange={e => onLogoChange(e.target.files?.[0])}
 /><label
 htmlFor="logo-upload"
 className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors cursor-pointer"
 ><span></span>
 Choose Image
 </label></div>
 {company.logo && (
 <div className="relative"><img src={company.logo} alt="Logo preview" className="h-16 w-auto rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm" /><button
 onClick={() => setCompany(v => ({ ...v, logo: '' }))}
 className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 transition-colors"
 ></button></div>
 )}
 </div></div></CardBody></Card><div className="flex justify-end"><PrimaryButton onClick={saveCompany} icon="" disabled={isAllBranches}>Save Restaurant Settings</PrimaryButton></div></div>
 )}

 {/* System Settings */}
 {tab === 'system' && (
 <div className="space-y-4"><Card><CardHeader
 title="Tax & Business Settings"
 subtitle="Configure tax rates and business day preferences"
 icon=""
 /><CardBody><div className="grid grid-cols-1 lg:grid-cols-2 gap-5"><InputGroup label="Tax Rate (%)" helpText="Default tax percentage applied to orders"><div className="relative"><input
 type="number"
 step="0.01"
 min="0"
 max="100"
 className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all pr-10"
 value={system.taxRate}
 onChange={e => setSystem(v => ({ ...v, taxRate: Number(e.target.value) }))}
 /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span></div></InputGroup><InputGroup label="Business Day Cutoff Hour" helpText="Hour (0-23) when the business day ends. Example: 4 means 4:00 AM"><input
 type="number"
 min="0"
 max="23"
 className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
 value={system.businessDayCutoffHour}
 onChange={e => setSystem(v => ({ ...v, businessDayCutoffHour: Math.min(23, Math.max(0, Number(e.target.value || 0))) }))}
 /></InputGroup></div> <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"><input
 type="checkbox"
 id="useBusinessDay"
 checked={Boolean(system.useBusinessDayForToday)}
 onChange={e => setSystem(v => ({ ...v, useBusinessDayForToday: e.target.checked }))}
 className="mt-1 w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
 /><div><label htmlFor="useBusinessDay" className="font-medium text-gray-900 dark:text-white cursor-pointer">
 Use Business Day for "Today" Widgets
 </label><p className="text-sm text-gray-600 dark:text-gray-400">
 When enabled, totals continue past midnight until you perform Day Close. After closing, the closed day moves to Yesterday widgets.
 </p></div></div><div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-700 rounded-lg"><input
 type="checkbox"
 id="showPersonalPayment"
 checked={Boolean(system.showPersonalPayment)}
 onChange={e => setSystem(v => ({ ...v, showPersonalPayment: e.target.checked }))}
 className="mt-1 w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
 /><div><label htmlFor="showPersonalPayment" className="font-medium text-gray-900 dark:text-white cursor-pointer">
 Show Personal payment option on Sell page
 </label><p className="text-sm text-gray-600 dark:text-gray-400">
 When enabled, cashiers can mark orders as Personal (no payment collected). Off by default.
 </p></div></div></CardBody></Card><Card><CardHeader
 title="Printer Configuration"
 subtitle="Configure printers for KOT/void slips and customer bills"
 icon=""
 /><CardBody><div className="grid grid-cols-1 lg:grid-cols-2 gap-5"><InputGroup label="KOT / Void Printer"><select
 className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
 value={system.kotPrinterName}
 onChange={e => setSystem(v => ({ ...v, kotPrinterName: e.target.value }))}
 ><option value="">None (use preview/default)</option>
 {(printers || []).map((p, idx) => (
 <option key={idx} value={p.deviceName || p.name || ''}>
 {p.name || p.deviceName}{p.isDefault ? ' (Default)' : ''}
 </option>
 ))}
 </select></InputGroup><InputGroup label="Bill / Customer Bill Printer"><select
 className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
 value={system.billPrinterName}
 onChange={e => setSystem(v => ({ ...v, billPrinterName: e.target.value }))}
 ><option value="">None (use preview/default)</option>
 {(printers || []).map((p, idx) => (
 <option key={idx} value={p.deviceName || p.name || ''}>
 {p.name || p.deviceName}{p.isDefault ? ' (Default)' : ''}
 </option>
 ))}
 </select></InputGroup></div><div className="flex gap-3 pt-2"><SecondaryButton
 onClick={async () => {
 try {
 if (window?.printing && typeof window.printing.listPrinters === 'function') {
 const list = await window.printing.listPrinters()
 setPrinters(Array.isArray(list) ? list : [])
 } else {
 const res = await fetch(`${API}/api/print/printers`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
 if (res.ok) setPrinters(await res.json())
 }
 toast.success('Printer list refreshed')
 } catch {
 toast.error('Failed to refresh printers')
 }
 }}
 icon=""
 >
 Refresh Printers
 </SecondaryButton></div></CardBody></Card><div className="flex justify-end"><PrimaryButton onClick={saveSystem} icon="" disabled={isAllBranches}>Save System Settings</PrimaryButton></div></div>
 )}

 {/* Restriction — Sell page bill fields */}
 {tab === 'restriction' && (
 <div className="space-y-4">
 <Card>
 <CardHeader
 title="Sell Page Fields"
 subtitle="Checked fields appear on the Sell page for every branch. Unchecked fields stay hidden. All off by default."
 icon=""
 />
 <CardBody>
 <div className="space-y-3">
 {[
 { key: 'totalTax', label: 'Total Tax', hint: 'Shows the computed tax total' },
 { key: 'amountIncTax', label: 'Amount inc Tax', hint: 'Subtotal plus tax / charges minus discounts' },
 { key: 'totalItemsDiscount', label: 'Total Items Discount', hint: 'Sum of line-item discounts' },
 { key: 'billDiscPct', label: 'Bill Disc (%)', hint: 'Percent bill discount input' },
 { key: 'billDiscAmt', label: 'Bill Disc Amount (PKR)', hint: 'Fixed PKR bill discount input' },
 { key: 'serviceCharges', label: 'Ser Charges (PKR)', hint: 'Service charges input' },
 { key: 'taxAmt', label: 'Tax (PKR)', hint: 'Editable tax amount input' },
 ].map((f) => (
 <label
 key={f.key}
 className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-slate-50 dark:bg-slate-900/30 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors"
 >
 <input
 type="checkbox"
 className="mt-1 w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
 checked={Boolean(sellFields[f.key])}
 onChange={(e) => setSellFields((v) => ({ ...v, [f.key]: e.target.checked }))}
 />
 <div>
 <div className="font-medium text-gray-900 dark:text-white">{f.label}</div>
 <p className="text-sm text-gray-600 dark:text-gray-400">{f.hint}</p>
 </div>
 </label>
 ))}
 </div>
 </CardBody>
 </Card>
 <div className="flex justify-end">
 <PrimaryButton onClick={saveRestrictions} icon="" disabled={isAllBranches}>Save Restrictions</PrimaryButton>
 </div>
 </div>
 )}

 {/* Backup & Security */}
 {tab === 'cloud' && (
 <div className="space-y-4">
  <Card>
   <CardHeader
    title="Cloud Sync (Branch ↔ VPS)"
    subtitle="On branch PCs: point this to your VPS so local Mongo stays in sync online. Leave empty on the VPS / call-center machine."
    icon=""
   />
   <CardBody>
    <InputGroup
     label="Cloud Sync URL (VPS)"
     helpText="Example: https://pos.yourdomain.com — no trailing slash. Must be different from this PC’s local API."
    >
     <input
      className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
      value={cloudSync.url}
      onChange={e => setCloudSync(v => ({ ...v, url: e.target.value }))}
      placeholder="https://forksnknives.epicspire.com"
      autoComplete="off"
     />
    </InputGroup>
    <InputGroup
     label="Cloud Sync Token (optional)"
     helpText="Only if the VPS needs a separate JWT. Usually leave blank and use the same login token."
    >
     <input
      type="password"
      className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
      value={cloudSync.token}
      onChange={e => setCloudSync(v => ({ ...v, token: e.target.value }))}
      placeholder="Optional HQ JWT"
      autoComplete="off"
     />
    </InputGroup>
    <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 p-4 text-sm space-y-1">
     <div><span className="text-gray-500">Local API:</span> <span className="font-medium break-all">{cloudSyncStatus.local || '—'}</span></div>
     <div><span className="text-gray-500">Cloud URL:</span> <span className="font-medium break-all">{cloudSyncStatus.cloud || '(not set)'}</span></div>
     <div><span className="text-gray-500">Last OK:</span> <span className="font-medium">{cloudSyncStatus.lastOkAt || '—'}</span></div>
     {cloudSyncStatus.lastError ? (
      <div className="text-rose-600 dark:text-rose-400">Error: {cloudSyncStatus.lastError}</div>
     ) : null}
    </div>
    <div className="flex flex-wrap justify-end gap-2 pt-2">
     <SecondaryButton onClick={runCloudSyncNow} icon="">
      {cloudSyncBusy ? 'Syncing…' : 'Sync Now'}
     </SecondaryButton>
     <PrimaryButton onClick={saveCloudSync} icon="">Save Cloud Sync</PrimaryButton>
    </div>
   </CardBody>
  </Card>
 </div>
 )}

 </div>
 )
}
