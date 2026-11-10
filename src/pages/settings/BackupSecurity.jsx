import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import { HardDrive, Shield } from 'lucide-react'

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

const PrimaryButton = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-sm hover:shadow-md"
  >
    {children}
  </button>
)

const SecondaryButton = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
  >
    {children}
  </button>
)

const DangerButton = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 font-medium rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
  >
    {children}
  </button>
)

export default function BackupSecurity() {
  const { state, dispatch } = useData()
  const { token } = useAuth()
  const { activeBranch, activeBranchId, isAllBranches, requireBranch } = useBranch()
  const { confirm, ConfirmDialog } = useConfirm()
  const s = state.settings || {}
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const branchLabel = activeBranch?.name || activeBranch?.code || ''

  const [backupCfg, setBackupCfg] = useState({
    autoBackupEnabled: Boolean(s.autoBackupEnabled),
    autoBackupIntervalMinutes: Number(s.autoBackupIntervalMinutes || 60),
    backupFolderPath: String(s.backupFolderPath || ''),
    salesDeleteKey: String(s.salesDeleteKey || ''),
  })

  const applyBackupFromSettings = (ns = {}) => {
    setBackupCfg({
      autoBackupEnabled: Boolean(ns.autoBackupEnabled),
      autoBackupIntervalMinutes: Number(ns.autoBackupIntervalMinutes || 60),
      backupFolderPath: String(ns.backupFolderPath || ''),
      salesDeleteKey: String(ns.salesDeleteKey || ''),
    })
  }

  useEffect(() => {
    applyBackupFromSettings(s)
  }, [s.autoBackupEnabled, s.autoBackupIntervalMinutes, s.backupFolderPath, s.salesDeleteKey, s.branchId, activeBranchId])

  // Refetch branch settings when header branch changes
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!token) return
      try {
        const res = await fetch(`${API}/api/settings`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          cache: 'no-store',
        })
        if (!res.ok || cancelled) return
        const saved = await res.json()
        if (cancelled) return
        dispatch({ type: 'HYDRATE', payload: { settings: saved } })
        applyBackupFromSettings(saved || {})
      } catch {}
    }
    load()
    return () => { cancelled = true }
  }, [token, activeBranchId])

  const headers = useMemo(
    () => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }),
    [token]
  )

  const exportBackup = async () => {
    try {
      const res = await fetch(`${API}/api/backup/export`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) throw new Error('Export failed')
      const text = await res.text()
      if (window?.backup && backupCfg.backupFolderPath) {
        const file = `rms-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
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
        toast.success('Backup downloaded')
      }
    } catch {
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
    } catch {
      toast.error('Failed to import backup. Ensure you are admin and logged in.')
    }
  }

  const [branchTargets, setBranchTargets] = useState([])
  const [selectedBranchCols, setSelectedBranchCols] = useState(() => new Set())
  const [branchTargetsLoading, setBranchTargetsLoading] = useState(false)
  const [branchPurgeBusy, setBranchPurgeBusy] = useState(false)

  const loadBranchTargets = async () => {
    if (!token || isAllBranches || !activeBranchId) {
      setBranchTargets([])
      setSelectedBranchCols(new Set())
      return
    }
    setBranchTargetsLoading(true)
    try {
      const res = await fetch(`${API}/api/backup/branch-targets`, { headers, cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed to load branch collections')
      const list = Array.isArray(j.targets) ? j.targets : []
      setBranchTargets(list)
      setSelectedBranchCols(new Set(list.filter(t => Number(t.count) > 0).map(t => t.key)))
    } catch (e) {
      setBranchTargets([])
      toast.error(e.message || 'Could not load branch collections')
    } finally {
      setBranchTargetsLoading(false)
    }
  }

  useEffect(() => {
    loadBranchTargets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeBranchId, isAllBranches])

  const toggleBranchCol = (key) => {
    setSelectedBranchCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAllBranchCols = (onlyWithData = false) => {
    setSelectedBranchCols(new Set(
      branchTargets
        .filter(t => !onlyWithData || Number(t.count) > 0)
        .map(t => t.key),
    ))
  }

  const purgeThisBranch = async ({ all = false } = {}) => {
    if (!requireBranch('Select a branch in the header to purge that branch’s data')) return
    const keys = all ? branchTargets.map(t => t.key) : [...selectedBranchCols]
    if (!keys.length) {
      toast.error('Select at least one collection')
      return
    }
    const label = branchLabel || 'this branch'
    const confirmed = await confirm({
      title: all ? `Purge all data for ${label}` : `Purge selected collections for ${label}`,
      message: all
        ? `This deletes ALL branch-scoped records for ${label} (sales, inventory, staff, overrides, settings, …). Shared menu/categories/users and other branches are kept. Continue?`
        : `Delete ${keys.length} selected collection(s) for ${label} only? Shared catalogs and other branches stay intact.`,
      confirmStyle: 'danger',
    })
    if (!confirmed) return
    setBranchPurgeBusy(true)
    try {
      const res = await fetch(`${API}/api/backup/purge-branch`, {
        method: 'POST',
        headers,
        body: JSON.stringify(all ? { all: true } : { collections: keys }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Purge failed')
      toast.success(`Deleted ${j.totalDeleted || 0} record(s) for ${label}`)
      await loadBranchTargets()
    } catch (e) {
      toast.error(e.message || 'Failed to purge branch data')
    } finally {
      setBranchPurgeBusy(false)
    }
  }

  const deleteAllData = async (includeUsers = false) => {
    const msg = includeUsers
      ? 'This will DELETE ALL DATA including users (every branch). Continue?'
      : 'This will DELETE ALL DATA across ALL branches (users will be kept). Continue?'
    const confirmed = await confirm({ title: 'Delete All Data (Global)', message: msg, confirmStyle: 'danger' })
    if (!confirmed) return
    try {
      const res = await fetch(`${API}/api/backup/purge${includeUsers ? '?includeUsers=true' : ''}`, { method: 'POST', headers })
      if (!res.ok) throw new Error('Purge failed')
      toast.success('All data deleted. App will reload.')
      setTimeout(() => window.location.reload(), 400)
    } catch {
      toast.error('Failed to delete all data. Ensure you are admin and logged in.')
    }
  }

  const timerRef = useRef(null)
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (backupCfg.autoBackupEnabled) {
      const mins = Math.max(1, Number(backupCfg.autoBackupIntervalMinutes || 60))
      timerRef.current = setInterval(() => { exportBackup() }, mins * 60 * 1000)
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backupCfg.autoBackupEnabled, backupCfg.autoBackupIntervalMinutes, backupCfg.backupFolderPath])

  const saveBackupSettings = async () => {
    if (!requireBranch('Select a branch in the header to edit that branch’s backup & security settings')) return
    try {
      const savePayload = {
        autoBackupEnabled: backupCfg.autoBackupEnabled,
        autoBackupIntervalMinutes: Math.round(Math.max(1, Number(backupCfg.autoBackupIntervalMinutes || 60))),
        backupFolderPath: backupCfg.backupFolderPath,
        salesDeleteKey: backupCfg.salesDeleteKey,
      }
      const res = await fetch(`${API}/api/settings`, { method: 'PATCH', headers, body: JSON.stringify(savePayload) })
      const saved = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(saved.error || 'Failed')
      dispatch({ type: 'HYDRATE', payload: { settings: saved } })
      toast.success(`Backup & security settings saved${branchLabel ? ` (${branchLabel})` : ''}`)
    } catch (e) {
      toast.error(e.message || 'Failed to save backup settings')
    }
  }

  return (
    <div className="space-y-4 w-full">
      {ConfirmDialog}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg">
          <HardDrive className="text-white" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Backup & Security</h1>
          <p className="text-sm text-gray-500">Export / restore data, automatic backups, and sale delete key{branchLabel ? ` · ${branchLabel}` : ''}</p>
        </div>
      </div>
      {isAllBranches ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          Select a branch in the header (<b>Working as</b>) to edit that branch’s settings and to purge <b>that branch only</b>. Global export / import / delete-all stay HQ-wide.
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={`Purge this branch${branchLabel ? ` — ${branchLabel}` : ''}`}
          subtitle="Delete selected collections for the active header branch only. Shared menu/categories/users and other branches are kept."
          icon=""
        />
        <CardBody>
          {isAllBranches ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">Select a branch in the header to purge its data.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                <SecondaryButton onClick={loadBranchTargets}>{branchTargetsLoading ? 'Loading…' : 'Refresh counts'}</SecondaryButton>
                <SecondaryButton onClick={() => selectAllBranchCols(false)}>Select all</SecondaryButton>
                <SecondaryButton onClick={() => selectAllBranchCols(true)}>Select with data</SecondaryButton>
                <SecondaryButton onClick={() => setSelectedBranchCols(new Set())}>Clear selection</SecondaryButton>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 max-h-80 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                {branchTargets.map(t => (
                  <label
                    key={t.key}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${
                      selectedBranchCols.has(t.key)
                        ? 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded"
                        checked={selectedBranchCols.has(t.key)}
                        onChange={() => toggleBranchCol(t.key)}
                      />
                      <span className="truncate font-medium text-gray-800 dark:text-gray-100">{t.label}</span>
                    </span>
                    <span className="text-xs font-bold text-slate-500 whitespace-nowrap">{Number(t.count || 0).toLocaleString()}</span>
                  </label>
                ))}
                {!branchTargets.length && !branchTargetsLoading && (
                  <div className="col-span-full text-sm text-slate-500 py-4 text-center">No branch collections loaded</div>
                )}
              </div>
              <div className="flex flex-wrap gap-3 pt-4">
                <DangerButton onClick={() => purgeThisBranch({ all: false })}>
                  {branchPurgeBusy ? 'Purging…' : `Purge selected (${selectedBranchCols.size})`}
                </DangerButton>
                <DangerButton onClick={() => purgeThisBranch({ all: true })}>
                  {branchPurgeBusy ? 'Purging…' : 'Purge all for this branch'}
                </DangerButton>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Manual Backup & Restore"
          subtitle="Create backups manually or restore from existing backup files"
          icon=""
        />
        <CardBody>
          <div className="flex flex-wrap gap-3">
            <PrimaryButton onClick={exportBackup}>Download Backup</PrimaryButton>
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
                  } catch {
                    toast.error('Failed to restore backup')
                  }
                }}
              >
                Restore from File
              </SecondaryButton>
            ) : (
              <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors cursor-pointer">
                Restore from File
                <input type="file" accept="application/json" className="hidden" onChange={e => importBackup(e.target.files?.[0])} />
              </label>
            )}
            <DangerButton onClick={() => deleteAllData(false)}>Delete All Data (Global)</DangerButton>
          </div>
          <p className="mt-3 text-xs text-slate-500">Global delete drops entire collections for every branch. Prefer “Purge this branch” above when cleaning one location.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Automatic Backup"
          subtitle="Configure automatic backups at regular intervals"
          icon=""
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
                    type="button"
                    onClick={async () => {
                      const p = await window.backup.selectFolder()
                      if (p) setBackupCfg(v => ({ ...v, backupFolderPath: p }))
                    }}
                    className="px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                  >
                    Browse
                  </button>
                )}
              </div>
            </InputGroup>
          </div>
          <div className="flex justify-end pt-2">
            <SecondaryButton onClick={saveBackupSettings}>Save Backup Settings</SecondaryButton>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Security Settings"
          subtitle="Configure security options for data protection"
          icon={<Shield size={18} className="text-indigo-600" />}
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
            <SecondaryButton onClick={saveBackupSettings}>Save Security Settings</SecondaryButton>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
