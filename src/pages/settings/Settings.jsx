import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'

// Helper components defined outside Settings to prevent remounting on state changes
const TabButton = ({ id, label, icon, activeTab, onClick }) => (
  <button
    onClick={() => onClick(id)}
    className={`flex items-center gap-2 px-5 py-3 rounded-t-lg font-medium transition-all duration-200 ${
      activeTab === id
        ? 'bg-white text-blue-600 border-t-2 border-blue-500 shadow-sm'
        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
    }`}
  >
    <span className="text-lg">{icon}</span>
    <span>{label}</span>
  </button>
)

const Card = ({ children, className = '' }) => (
  <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden ${className}`}>
    {children}
  </div>
)

const CardHeader = ({ title, subtitle, icon }) => (
  <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
        <span className="text-xl">{icon}</span>
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
    </div>
  </div>
)

const CardBody = ({ children }) => <div className="p-6 space-y-5">{children}</div>

const InputGroup = ({ label, children, helpText }) => (
  <div className="space-y-2">
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
    {children}
    {helpText && <p className="text-xs text-gray-500 dark:text-gray-400">{helpText}</p>}
  </div>
)

const PrimaryButton = ({ onClick, children, icon }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-sm hover:shadow-md"
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

const DangerButton = ({ onClick, children }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 font-medium rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
  >
    {children}
  </button>
)

export default function Settings() {
  const { state, dispatch } = useData()
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const s = state.settings || {}
  const [tab, setTab] = useState('company')
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

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
    kotPrinterName: s.kotPrinterName || '',
    billPrinterName: s.billPrinterName || '',
  })

  const [backupCfg, setBackupCfg] = useState({
    autoBackupEnabled: Boolean(s.autoBackupEnabled),
    autoBackupIntervalMinutes: Number(s.autoBackupIntervalMinutes || 60),
    backupFolderPath: String(s.backupFolderPath || ''),
    salesDeleteKey: String(s.salesDeleteKey || ''),
  })

  useEffect(() => {
    const ns = state.settings || {}
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
      kotPrinterName: ns.kotPrinterName || '',
      billPrinterName: ns.billPrinterName || '',
    })
    setBackupCfg({
      autoBackupEnabled: Boolean(ns.autoBackupEnabled),
      autoBackupIntervalMinutes: Number(ns.autoBackupIntervalMinutes || 60),
      backupFolderPath: String(ns.backupFolderPath || ''),
      salesDeleteKey: String(ns.salesDeleteKey || ''),
    })
  }, [state.settings])

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

  const saveCompany = async () => {
    try {
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const res = await fetch(`${API}/api/settings`, { method: 'PATCH', headers, body: JSON.stringify(company) })
      if (!res.ok) throw new Error('Failed')
      const saved = await res.json()
      dispatch({ type: 'HYDRATE', payload: { settings: saved } })
      toast.success('Restaurant settings saved successfully')
    } catch (e) {
      toast.error('Failed to save restaurant settings')
    }
  }

  const saveSystem = async () => {
    try {
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const payload = {
        ...system,
        businessDayCutoffHour: Math.min(23, Math.max(0, Number(system.businessDayCutoffHour ?? 4)))
      }
      const res = await fetch(`${API}/api/settings`, { method: 'PATCH', headers, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error('Failed')
      const saved = await res.json()
      dispatch({ type: 'HYDRATE', payload: { settings: saved } })
      toast.success('System settings saved successfully')
    } catch (e) {
      toast.error('Failed to save system settings')
    }
  }

  const onLogoChange = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCompany(prev => ({ ...prev, logo: String(reader.result) }))
    reader.readAsDataURL(file)
  }

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }), [token])

  const exportBackup = async () => {
    try {
      const res = await fetch(`${API}/api/backup/export`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) throw new Error('Export failed')
      const text = await res.text()
      if (window?.backup && backupCfg.backupFolderPath) {
        const file = `rms-backup-${new Date().toISOString().replace(/[:]/g, '-').slice(0, 19)}.json`
        const out = await window.backup.saveToFolder(backupCfg.backupFolderPath, file, text)
        if (!out?.ok) throw new Error(out?.error || 'Failed to save file')
        toast.success(`Backup saved to: ${out.path}`)
      } else {
        const blob = new Blob([text], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `rms-backup-${new Date().toISOString().slice(0, 10)}.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }
    } catch (e) {
      toast.error('Failed to export backup. Please ensure you are logged in.')
    }
  }

  const importBackup = async (file) => {
    if (!file) return
    try {
      const text = await file.text()
      const res = await fetch(`${API}/api/backup/import`, { method: 'POST', headers, body: text })
      if (!res.ok) throw new Error('Import failed')
      toast.success('Backup imported. App will reload to apply data.')
      setTimeout(() => window.location.reload(), 400)
    } catch (e) {
      toast.error('Failed to import backup. Ensure you are admin and logged in.')
    }
  }

  const deleteAllData = async (includeUsers = false) => {
    const msg = includeUsers
      ? 'This will DELETE ALL DATA including users. Continue?'
      : 'This will DELETE ALL DATA (users will be kept). Continue?'
    const confirmed = await confirm({ title: 'Delete All Data', message: msg, confirmStyle: 'danger' })
    if (!confirmed) return
    try {
      const res = await fetch(`${API}/api/backup/purge${includeUsers ? '?includeUsers=true' : ''}`, { method: 'POST', headers })
      if (!res.ok) throw new Error('Purge failed')
      toast.success('All data deleted. App will reload.')
      setTimeout(() => window.location.reload(), 400)
    } catch (e) {
      toast.error('Failed to delete all data. Ensure you are admin and logged in.')
    }
  }

  const timerRef = useRef(null)
  useEffect(() => {
    if (tab !== 'backup') return
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (backupCfg.autoBackupEnabled) {
      const mins = Math.max(1, Number(backupCfg.autoBackupIntervalMinutes || 60))
      const ms = mins * 60 * 1000
      timerRef.current = setInterval(() => { exportBackup() }, ms)
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
  }, [tab, backupCfg.autoBackupEnabled, backupCfg.autoBackupIntervalMinutes])

  const saveBackupSettings = async () => {
    try {
      const savePayload = {
        autoBackupEnabled: backupCfg.autoBackupEnabled,
        autoBackupIntervalMinutes: Math.round(Math.max(1, Number(backupCfg.autoBackupIntervalMinutes || 60))),
        backupFolderPath: backupCfg.backupFolderPath,
        salesDeleteKey: backupCfg.salesDeleteKey,
      }
      const res = await fetch(`${API}/api/settings`, { method: 'PATCH', headers, body: JSON.stringify(savePayload) })
      if (!res.ok) throw new Error('Failed')
      const saved = await res.json()
      dispatch({ type: 'HYDRATE', payload: { settings: saved } })
      toast.success('Backup settings saved successfully')
    } catch {
      toast.error('Failed to save backup settings')
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
          <span className="text-2xl text-white">⚙️</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">Manage your restaurant and system preferences</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-1">
          <TabButton id="company" label="Restaurant" icon="🏪" activeTab={tab} onClick={setTab} />
          <TabButton id="system" label="System" icon="💻" activeTab={tab} onClick={setTab} />
          <TabButton id="backup" label="Backup & Security" icon="🔒" activeTab={tab} onClick={setTab} />
        </div>
      </div>

      {/* Company Settings */}
      {tab === 'company' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Restaurant Information"
              subtitle="Configure your restaurant details that appear on receipts and reports"
              icon="🏪"
            />
            <CardBody>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <InputGroup label="Restaurant Name">
                  <input
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    value={company.companyName}
                    onChange={e => setCompany(v => ({ ...v, companyName: e.target.value }))}
                    placeholder="Enter restaurant name"
                  />
                </InputGroup>

                <InputGroup label="Phone Number">
                  <input
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    value={company.phone}
                    onChange={e => setCompany(v => ({ ...v, phone: e.target.value }))}
                    placeholder="+1 234 567 8900"
                  />
                </InputGroup>
              </div>

              <InputGroup label="Restaurant Address" helpText="This will appear on customer receipts">
                <textarea
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
                  rows={3}
                  value={company.address}
                  onChange={e => setCompany(v => ({ ...v, address: e.target.value }))}
                  placeholder="Enter full address"
                />
              </InputGroup>

              <InputGroup label="Receipt Footer Message" helpText="Custom message shown at the bottom of receipts">
                <textarea
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
                  rows={2}
                  value={company.billingFooter}
                  onChange={e => setCompany(v => ({ ...v, billingFooter: e.target.value }))}
                  placeholder="Thank you for your visit!"
                />
              </InputGroup>

              <div className="pt-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Restaurant Logo</label>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="logo-upload"
                      onChange={e => onLogoChange(e.target.files?.[0])}
                    />
                    <label
                      htmlFor="logo-upload"
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors cursor-pointer"
                    >
                      <span>📷</span>
                      Choose Image
                    </label>
                  </div>
                  {company.logo && (
                    <div className="relative">
                      <img src={company.logo} alt="Logo preview" className="h-16 w-auto rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm" />
                      <button
                        onClick={() => setCompany(v => ({ ...v, logo: '' }))}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          <div className="flex justify-end">
            <PrimaryButton onClick={saveCompany} icon="💾">Save Restaurant Settings</PrimaryButton>
          </div>
        </div>
      )}

      {/* System Settings */}
      {tab === 'system' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Tax & Business Settings"
              subtitle="Configure tax rates and business day preferences"
              icon="📊"
            />
            <CardBody>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <InputGroup label="Tax Rate (%)" helpText="Default tax percentage applied to orders">
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all pr-10"
                      value={system.taxRate}
                      onChange={e => setSystem(v => ({ ...v, taxRate: Number(e.target.value) }))}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                  </div>
                </InputGroup>

                <InputGroup label="Business Day Cutoff Hour" helpText="Hour (0-23) when the business day ends. Example: 4 means 4:00 AM">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    value={system.businessDayCutoffHour}
                    onChange={e => setSystem(v => ({ ...v, businessDayCutoffHour: Math.min(23, Math.max(0, Number(e.target.value || 0))) }))}
                  />
                </InputGroup>
              </div>

              <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <input
                  type="checkbox"
                  id="useBusinessDay"
                  checked={Boolean(system.useBusinessDayForToday)}
                  onChange={e => setSystem(v => ({ ...v, useBusinessDayForToday: e.target.checked }))}
                  className="mt-1 w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <div>
                  <label htmlFor="useBusinessDay" className="font-medium text-gray-900 dark:text-white cursor-pointer">
                    Use Business Day for "Today" Widgets
                  </label>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    When enabled, totals continue past midnight until you perform Day Close. After closing, the closed day moves to Yesterday widgets.
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Printer Configuration"
              subtitle="Configure printers for KOT/void slips and customer bills"
              icon="🖨️"
            />
            <CardBody>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <InputGroup label="KOT / Void Printer">
                  <select
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    value={system.kotPrinterName}
                    onChange={e => setSystem(v => ({ ...v, kotPrinterName: e.target.value }))}
                  >
                    <option value="">None (use preview/default)</option>
                    {(printers || []).map((p, idx) => (
                      <option key={idx} value={p.deviceName || p.name || ''}>
                        {p.name || p.deviceName}{p.isDefault ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                </InputGroup>

                <InputGroup label="Bill / Customer Bill Printer">
                  <select
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    value={system.billPrinterName}
                    onChange={e => setSystem(v => ({ ...v, billPrinterName: e.target.value }))}
                  >
                    <option value="">None (use preview/default)</option>
                    {(printers || []).map((p, idx) => (
                      <option key={idx} value={p.deviceName || p.name || ''}>
                        {p.name || p.deviceName}{p.isDefault ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                </InputGroup>
              </div>

              <div className="flex gap-3 pt-2">
                <SecondaryButton
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
                  icon="🔄"
                >
                  Refresh Printers
                </SecondaryButton>
              </div>
            </CardBody>
          </Card>

          <div className="flex justify-end">
            <PrimaryButton onClick={saveSystem} icon="💾">Save System Settings</PrimaryButton>
          </div>
        </div>
      )}

      {/* Backup & Security */}
      {tab === 'backup' && (
        <div className="space-y-6">
          {/* Manual Backup */}
          <Card>
            <CardHeader
              title="Manual Backup & Restore"
              subtitle="Create backups manually or restore from existing backup files"
              icon="💾"
            />
            <CardBody>
              <div className="flex flex-wrap gap-3">
                <PrimaryButton onClick={exportBackup} icon="📥">Download Backup</PrimaryButton>

                {window?.backup ? (
                  <SecondaryButton
                    onClick={async () => {
                      try {
                        const fullPath = await window.backup.openFile()
                        if (!fullPath) return
                        const text = await window.backup.readFile(fullPath)
                        const res = await fetch(`${API}/api/backup/import`, { method: 'POST', headers, body: text })
                        if (!res.ok) throw new Error('Import failed')
                        toast.success('Backup restored. App will reload.')
                        setTimeout(() => window.location.reload(), 400)
                      } catch (e) {
                        toast.error('Failed to restore backup')
                      }
                    }}
                    icon="📤"
                  >
                    Restore from File
                  </SecondaryButton>
                ) : (
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors cursor-pointer">
                    <span>📤</span>
                    Restore from File
                    <input type="file" accept="application/json" className="hidden" onChange={e => importBackup(e.target.files?.[0])} />
                  </label>
                )}

                <DangerButton onClick={() => deleteAllData(false)}>Delete All Data</DangerButton>
              </div>
            </CardBody>
          </Card>

          {/* Auto Backup */}
          <Card>
            <CardHeader
              title="Automatic Backup"
              subtitle="Configure automatic backups at regular intervals"
              icon="⏰"
            />
            <CardBody>
              <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-4">
                <input
                  type="checkbox"
                  id="autoBackup"
                  checked={backupCfg.autoBackupEnabled}
                  onChange={e => setBackupCfg(v => ({ ...v, autoBackupEnabled: e.target.checked }))}
                  className="mt-1 w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <div>
                  <label htmlFor="autoBackup" className="font-medium text-gray-900 dark:text-white cursor-pointer">
                    Enable Automatic Backups
                  </label>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Automatically create backups at the specified interval
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <InputGroup label="Backup Interval (minutes)" helpText="Minimum 1 minute">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    value={backupCfg.autoBackupIntervalMinutes}
                    onChange={e => setBackupCfg(v => ({ ...v, autoBackupIntervalMinutes: Math.max(1, Number(e.target.value) || 1) }))}
                  />
                </InputGroup>

                <InputGroup label="Backup Folder Path" helpText="Where backup files will be saved">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                      value={backupCfg.backupFolderPath}
                      onChange={e => setBackupCfg(v => ({ ...v, backupFolderPath: e.target.value }))}
                      placeholder="E:\\backups"
                    />
                    {window?.backup && (
                      <button
                        onClick={async () => {
                          const p = await window.backup.selectFolder()
                          if (p) setBackupCfg(v => ({ ...v, backupFolderPath: p }))
                        }}
                        className="px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                      >
                        📁 Browse
                      </button>
                    )}
                  </div>
                </InputGroup>
              </div>

              <div className="flex justify-end pt-2">
                <SecondaryButton onClick={saveBackupSettings} icon="💾">Save Backup Settings</SecondaryButton>
              </div>
            </CardBody>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader
              title="Security Settings"
              subtitle="Configure security options for data protection"
              icon="🔐"
            />
            <CardBody>
              <InputGroup
                label="Sale Delete Key"
                helpText="Secret key required when deleting sales in Sales History. Keep this secure and share only with authorized staff."
              >
                <input
                  type="password"
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="Enter a secure delete key"
                  value={backupCfg.salesDeleteKey}
                  onChange={e => setBackupCfg(v => ({ ...v, salesDeleteKey: e.target.value }))}
                />
              </InputGroup>

              <div className="flex justify-end pt-2">
                <SecondaryButton onClick={saveBackupSettings} icon="💾">Save Security Settings</SecondaryButton>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
      {ConfirmDialog}
    </div>
  )
}
