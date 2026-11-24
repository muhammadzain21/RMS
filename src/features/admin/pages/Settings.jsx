import { useEffect, useState } from 'react'
import { useData } from '@/state/DataContext.jsx'
import { useAuth } from '@/state/AuthContext.jsx'
import { useBranch } from '@/state/BranchContext.jsx'
import { toast } from 'react-hot-toast'

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
 printBankQrOnBill: Boolean(s.printBankQrOnBill),
 bankQrLabel: s.bankQrLabel || 'Scan to pay',
 bankQrPayload: s.bankQrPayload || '',
 bankQrImage: s.bankQrImage || '',
 })
 const [system, setSystem] = useState({
 taxRate: s.taxRate ?? 0,
 useBusinessDayForToday: s.useBusinessDayForToday ?? true,
 businessDayCutoffHour: s.businessDayCutoffHour ?? 4,
 googleMapsApiKey: s.googleMapsApiKey || '',
 })

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
 printBankQrOnBill: Boolean(ns.printBankQrOnBill),
 bankQrLabel: ns.bankQrLabel || 'Scan to pay',
 bankQrPayload: ns.bankQrPayload || '',
 bankQrImage: ns.bankQrImage || '',
 })
 setSystem({
 taxRate: ns.taxRate ?? 0,
 useBusinessDayForToday: ns.useBusinessDayForToday ?? true,
 businessDayCutoffHour: ns.businessDayCutoffHour ?? 4,
 googleMapsApiKey: ns.googleMapsApiKey || '',
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

 const onBankQrImageChange = (file) => {
 if (!file) return
 const reader = new FileReader()
 reader.onload = () => setCompany(prev => ({ ...prev, bankQrImage: String(reader.result) }))
 reader.readAsDataURL(file)
 }

 return (
 <div className="space-y-4 w-full">
 {/* Header */}
 <div className="flex items-center gap-4"><div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg"><span className="text-2xl text-white font-bold">S</span></div><div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>{branchLabel ? <p className="text-sm text-gray-500">{branchLabel}</p> : null}</div></div>
 {isAllBranches ? (
  <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
   Select a branch in the header to edit settings.
  </div>
 ) : null}

 {/* Tabs */}
 <div className="border-b border-gray-200 dark:border-gray-700"><div className="flex flex-wrap gap-1"><TabButton id="company" label="Restaurant" icon="" activeTab={tab} onClick={setTab} /><TabButton id="system" label="System" icon="" activeTab={tab} onClick={setTab} /><TabButton id="restriction" label="Restriction" icon="" activeTab={tab} onClick={setTab} /></div></div>

 {/* Company Settings */}
 {tab === 'company' && (
 <div className="space-y-4"><Card><CardHeader
 title="Restaurant Information"
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
 /></InputGroup></div><InputGroup label="Restaurant Address"><textarea
 className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
 rows={3}
 value={company.address}
 onChange={e => setCompany(v => ({ ...v, address: e.target.value }))}
 placeholder="Enter full address"
 /></InputGroup><InputGroup label="Receipt Footer Message"><textarea
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
 </div></div>
 <div className="flex justify-end pt-2"><PrimaryButton onClick={saveCompany} disabled={isAllBranches}>Save Settings</PrimaryButton></div>
 </CardBody></Card>

 <Card><CardHeader
 title="Bank payment QR on bill"
 icon=""
 /><CardBody>
 <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-700 rounded-lg mb-4">
 <input
 type="checkbox"
 id="printBankQrOnBill"
 checked={Boolean(company.printBankQrOnBill)}
 onChange={e => setCompany(v => ({ ...v, printBankQrOnBill: e.target.checked }))}
 className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
 />
 <label htmlFor="printBankQrOnBill" className="font-medium text-gray-900 dark:text-white cursor-pointer">
 Print bank QR on bill slip
 </label>
 </div>
 <div className="pt-1 mb-4">
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Bank QR image</label>
 <div className="flex items-center gap-4">
 <div className="relative">
 <input type="file" accept="image/*" className="hidden" id="bank-qr-upload" onChange={e => onBankQrImageChange(e.target.files?.[0])} />
 <label
 htmlFor="bank-qr-upload"
 className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors cursor-pointer"
 >
 Choose QR image
 </label>
 </div>
 {company.bankQrImage ? (
 <div className="relative">
 <img src={company.bankQrImage} alt="Bank QR preview" className="h-20 w-20 object-contain rounded-lg border border-gray-200 dark:border-gray-600 bg-white p-1" />
 <button
 type="button"
 onClick={() => setCompany(v => ({ ...v, bankQrImage: '' }))}
 className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 transition-colors"
 >×</button>
 </div>
 ) : null}
 </div>
 </div>
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
 <InputGroup label="QR label">
 <input
 className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
 value={company.bankQrLabel || ''}
 onChange={e => setCompany(v => ({ ...v, bankQrLabel: e.target.value }))}
 placeholder="Scan to pay"
 />
 </InputGroup>
 <InputGroup label="IBAN / account">
 <input
 className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
 value={company.bankQrPayload || ''}
 onChange={e => setCompany(v => ({ ...v, bankQrPayload: e.target.value }))}
 placeholder="PK56MEZN0009080107925324"
 />
 </InputGroup>
 </div>
 <div className="flex justify-end pt-2"><PrimaryButton onClick={saveCompany} disabled={isAllBranches}>Save Settings</PrimaryButton></div>
 </CardBody></Card>
 </div>
 )}

 {/* System Settings */}
 {tab === 'system' && (
 <div className="space-y-4"><Card><CardHeader
 title="Tax & Business Settings"
 icon=""
 /><CardBody><div className="grid grid-cols-1 lg:grid-cols-2 gap-5"><InputGroup label="Tax Rate (%)"><div className="relative"><input
 type="number"
 step="0.01"
 min="0"
 max="100"
 className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all pr-10"
 value={system.taxRate}
 onChange={e => setSystem(v => ({ ...v, taxRate: Number(e.target.value) }))}
 /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span></div></InputGroup><InputGroup label="Business Day Cutoff Hour"><input
 type="number"
 min="0"
 max="23"
 className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
 value={system.businessDayCutoffHour}
 onChange={e => setSystem(v => ({ ...v, businessDayCutoffHour: Math.min(23, Math.max(0, Number(e.target.value || 0))) }))}
 /></InputGroup></div> <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"><input
 type="checkbox"
 id="useBusinessDay"
 checked={Boolean(system.useBusinessDayForToday)}
 onChange={e => setSystem(v => ({ ...v, useBusinessDayForToday: e.target.checked }))}
 className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
 /><label htmlFor="useBusinessDay" className="font-medium text-gray-900 dark:text-white cursor-pointer">
 Use Business Day for "Today" Widgets
 </label></div>
 <InputGroup label="Google Maps API key (Rider Live Map)">
   <input
     type="password"
     autoComplete="off"
     className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
     value={system.googleMapsApiKey || ''}
     onChange={e => setSystem(v => ({ ...v, googleMapsApiKey: e.target.value.trim() }))}
     placeholder="AIza…"
   />
 </InputGroup>
 <div className="flex justify-end pt-2"><PrimaryButton onClick={saveSystem} disabled={isAllBranches}>Save Settings</PrimaryButton></div>
 </CardBody></Card></div>
 )}

 {/* Restriction — Sell page bill fields */}
 {tab === 'restriction' && (
 <div className="space-y-4">
 <Card>
 <CardHeader
 title="Sell Page Fields"
 icon=""
 />
 <CardBody>
 <div className="space-y-3">
 {[
 { key: 'totalTax', label: 'Total Tax' },
 { key: 'amountIncTax', label: 'Amount inc Tax' },
 { key: 'totalItemsDiscount', label: 'Total Items Discount' },
 { key: 'billDiscPct', label: 'Bill Disc (%)' },
 { key: 'billDiscAmt', label: 'Bill Disc Amount (PKR)' },
 { key: 'serviceCharges', label: 'Ser Charges (PKR)' },
 { key: 'taxAmt', label: 'Tax (PKR)' },
 ].map((f) => (
 <label
 key={f.key}
 className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-slate-50 dark:bg-slate-900/30 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors"
 >
 <input
 type="checkbox"
 className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
 checked={Boolean(sellFields[f.key])}
 onChange={(e) => setSellFields((v) => ({ ...v, [f.key]: e.target.checked }))}
 />
 <div className="font-medium text-gray-900 dark:text-white">{f.label}</div>
 </label>
 ))}
 </div>
 <div className="flex justify-end pt-2">
 <PrimaryButton onClick={saveRestrictions} disabled={isAllBranches}>Save Settings</PrimaryButton>
 </div>
 </CardBody>
 </Card>
 </div>
 )}

 </div>
 )
}
