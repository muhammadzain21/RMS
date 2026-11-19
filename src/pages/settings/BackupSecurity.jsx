import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import { HardDrive, Shield, Building2, Globe2 } from 'lucide-react'

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

const PrimaryButton = ({ onClick, children, disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-sm hover:shadow-md disabled:opacity-50"
  >
    {children}
  </button>
)

const SecondaryButton = ({ onClick, children, disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
  >
    {children}
  </button>
)

const DangerButton = ({ onClick, children, disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 font-medium rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
  >
    {children}
  </button>
)

function CollectionGrid({ targets, selected, onToggle, loading }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 max-h-80 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 p-3">
      {targets.map(t => (
        <label
          key={t.key}
          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${
            selected.has(t.key)
              ? 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30'
              : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <input
              type="checkbox"
              className="w-4 h-4 rounded"
              checked={selected.has(t.key)}
              onChange={() => onToggle(t.key)}
            />
            <span className="truncate font-medium text-gray-800 dark:text-gray-100">{t.label}</span>
          </span>
          <span className="text-xs font-bold text-slate-500 whitespace-nowrap">{Number(t.count || 0).toLocaleString()}</span>
        </label>
      ))}
      {!targets.length && !loading && (
        <div className="col-span-full text-sm text-slate-500 py-4 text-center">No collections loaded</div>
      )}
    </div>
  )
}

export default function BackupSecurity() {
  const { state, dispatch } = useData()
  const { token } = useAuth()
  const { activeBranch, activeBranchId, isAllBranches, requireBranch } = useBranch()
  const { confirm, ConfirmDialog } = useConfirm()
  const s = state.settings || {}
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const branchLabel = activeBranch?.name || activeBranch?.code || ''

  const [scope, setScope] = useState('branch') // 'branch' | 'global'

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

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!token) return
      if (isAllBranches || !activeBranchId) {
        applyBackupFromSettings({})
        return
      }
      try {
        const res = await fetch(`${API}/api/settings`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'X-Branch-Id': String(activeBranchId),
          },
          cache: 'no-store',
        })
        if (!res.ok || cancelled) return
        const saved = await res.json()
        if (cancelled) return
        const next = { ...(saved || {}), branchId: saved?.branchId || activeBranchId }
        dispatch({ type: 'HYDRATE', payload: { settings: next } })
        applyBackupFromSettings(next)
      } catch {}
    }
    load()
    return () => { cancelled = true }
  }, [token, activeBranchId, isAllBranches, API, dispatch])

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(activeBranchId ? { 'X-Branch-Id': String(activeBranchId) } : {}),
    }),
    [token, activeBranchId],
  )

  const authOnly = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token],
  )

  const downloadJson = async (url, filename, opts = {}) => {
    const res = await fetch(url, opts)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error || 'Export failed')
    }
    const text = await res.text()
    if (window?.backup && backupCfg.backupFolderPath) {
      const file = filename.replace(/\.json$/i, '') + `-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
      const out = await window.backup.saveToFolder(backupCfg.backupFolderPath, file, text)
      if (!out?.ok) throw new Error(out?.error || 'Failed to save file')
      toast.success(`Backup saved to: ${out.path}`)
      return
    }
    const blob = new Blob([text], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
    toast.success('Backup downloaded')
  }

  const exportGlobalBackup = async () => {
    try {
      await downloadJson(
        `${API}/api/backup/export`,
        `rms-backup-${new Date().toISOString().slice(0, 10)}.json`,
        { headers: authOnly },
      )
    } catch (e) {
      toast.error(e.message || 'Failed to export global backup')
    }
  }

  const exportBranchBackup = async () => {
    if (!requireBranch('Select a branch in the header to export that branch’s data')) return
    try {
      const safe = String(branchLabel || activeBranchId || 'branch').replace(/[^\w.-]+/g, '_')
      await downloadJson(
        `${API}/api/backup/export-branch`,
        `rms-branch-${safe}-${new Date().toISOString().slice(0, 10)}.json`,
        { headers },
      )
    } catch (e) {
      toast.error(e.message || 'Failed to export branch backup')
    }
  }

  const importGlobalBackup = async (file) => {
    if (!file) return
    const confirmed = await confirm({
      title: 'Restore global backup?',
      message: 'This replaces the ENTIRE database with the backup file (all branches). Continue?',
      confirmStyle: 'danger',
    })
    if (!confirmed) return
    try {
      const text = await file.text()
      const res = await fetch(`${API}/api/backup/import`, { method: 'POST', headers: authOnly, body: text })
      if (!res.ok) throw new Error('Import failed')
      toast.success('Global backup restored. App will reload.')
      setTimeout(() => window.location.reload(), 400)
    } catch {
      toast.error('Failed to import backup. Ensure you are admin and logged in.')
    }
  }

  const importBranchBackup = async (file) => {
    if (!file) return
    if (!requireBranch('Select a branch in the header to restore into that branch')) return
    const confirmed = await confirm({
      title: `Restore into ${branchLabel || 'this branch'}?`,
      message: `Branch-scoped collections in the file will replace data for ${branchLabel || 'this branch'} only. Other branches and HQ warehouse stay intact.`,
      confirmStyle: 'danger',
    })
    if (!confirmed) return
    try {
      const text = await file.text()
      const res = await fetch(`${API}/api/backup/import-branch`, { method: 'POST', headers, body: text })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Import failed')
      toast.success(`Branch restore done (${j.totalInserted || 0} docs). App will reload.`)
      setTimeout(() => window.location.reload(), 400)
    } catch (e) {
      toast.error(e.message || 'Failed to restore branch backup')
    }
  }

  const [branchTargets, setBranchTargets] = useState([])
  const [globalTargets, setGlobalTargets] = useState([])
  const [selectedBranchCols, setSelectedBranchCols] = useState(() => new Set())
  const [selectedGlobalCols, setSelectedGlobalCols] = useState(() => new Set())
  const [branchTargetsLoading, setBranchTargetsLoading] = useState(false)
  const [globalTargetsLoading, setGlobalTargetsLoading] = useState(false)
  const [purgeBusy, setPurgeBusy] = useState(false)

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

  const loadGlobalTargets = async () => {
    if (!token) return
    setGlobalTargetsLoading(true)
    try {
      const res = await fetch(`${API}/api/backup/global-targets`, { headers: authOnly, cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed to load global collections')
      const list = Array.isArray(j.targets) ? j.targets : []
      setGlobalTargets(list)
      setSelectedGlobalCols(new Set(list.filter(t => Number(t.count) > 0 && !t.preserveOnPurge).map(t => t.key)))
    } catch (e) {
      setGlobalTargets([])
      toast.error(e.message || 'Could not load global collections')
    } finally {
      setGlobalTargetsLoading(false)
    }
  }

  useEffect(() => {
    loadBranchTargets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeBranchId, isAllBranches])

  useEffect(() => {
    if (scope === 'global') loadGlobalTargets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, token])

  const toggleSet = (setter) => (key) => {
    setter(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
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
      title: all ? `Purge all data for ${label}` : `Purge selected for ${label}`,
      message: all
        ? `Deletes ALL branch-scoped records for ${label}. Shared catalogs, warehouse, users, and other branches are kept.`
        : `Delete ${keys.length} selected collection(s) for ${label} only?`,
      confirmStyle: 'danger',
    })
    if (!confirmed) return
    setPurgeBusy(true)
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
      setPurgeBusy(false)
    }
  }

  const purgeGlobalSelected = async ({ all = false, includeUsers = false } = {}) => {
    const keys = all
      ? globalTargets.filter(t => includeUsers || !t.preserveOnPurge).map(t => t.key)
      : [...selectedGlobalCols]
    if (!keys.length) {
      toast.error('Select at least one collection')
      return
    }
    const confirmed = await confirm({
      title: all ? 'Purge ALL global data?' : 'Purge selected global collections?',
      message: all
        ? `This deletes data across EVERY branch${includeUsers ? ' including users' : ' (users kept)'}. Prefer branch purge when cleaning one location.`
        : `Delete ${keys.length} collection(s) globally (all branches)?`,
      confirmStyle: 'danger',
    })
    if (!confirmed) return
    setPurgeBusy(true)
    try {
      const res = await fetch(`${API}/api/backup/purge-global`, {
        method: 'POST',
        headers: authOnly,
        body: JSON.stringify(all ? { all: true, includeUsers } : { collections: keys, includeUsers }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Purge failed')
      toast.success(`Deleted ${j.totalDeleted || 0} record(s) globally`)
      await loadGlobalTargets()
    } catch (e) {
      toast.error(e.message || 'Failed to purge global data')
    } finally {
      setPurgeBusy(false)
    }
  }

  const deleteAllData = async (includeUsers = false) => {
    const confirmed = await confirm({
      title: 'Delete All Data (Global)',
      message: includeUsers
        ? 'DELETE ALL DATA including users (every branch). Continue?'
        : 'DELETE ALL DATA across ALL branches (users kept). Continue?',
      confirmStyle: 'danger',
    })
    if (!confirmed) return
    try {
      const res = await fetch(`${API}/api/backup/purge${includeUsers ? '?includeUsers=true' : ''}`, { method: 'POST', headers: authOnly })
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
      timerRef.current = setInterval(() => { exportGlobalBackup() }, mins * 60 * 1000)
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

  const restoreFromPicker = async (mode) => {
    try {
      if (window?.backup) {
        const fullPath = await window.backup.openFile()
        if (!fullPath) return
        const text = await window.backup.readFile(fullPath)
        const blob = new Blob([text], { type: 'application/json' })
        const file = new File([blob], 'restore.json', { type: 'application/json' })
        if (mode === 'branch') await importBranchBackup(file)
        else await importGlobalBackup(file)
        return
      }
    } catch {
      toast.error('Failed to restore backup')
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
          <p className="text-sm text-gray-500">
            Manage data by branch or globally · export / restore · auto backup · delete key
            {branchLabel ? ` · ${branchLabel}` : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 w-fit">
        <button
          type="button"
          onClick={() => setScope('branch')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
            scope === 'branch' ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow' : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          <Building2 size={16} /> Branch data
        </button>
        <button
          type="button"
          onClick={() => setScope('global')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
            scope === 'global' ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow' : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          <Globe2 size={16} /> Global data
        </button>
      </div>

      {scope === 'branch' && (
        <>
          {isAllBranches ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
              Select a branch in the header (<b>Working as</b>) to export, restore, or purge <b>that branch only</b>.
            </div>
          ) : null}

          <Card>
            <CardHeader
              title={`Branch backup — ${branchLabel || 'select a branch'}`}
              subtitle="Export / restore only this branch’s operational data (sales, inventory, staff, expenses, …)."
              icon=""
            />
            <CardBody>
              <div className="flex flex-wrap gap-3">
                <PrimaryButton onClick={exportBranchBackup} disabled={isAllBranches}>Download branch backup</PrimaryButton>
                {window?.backup ? (
                  <SecondaryButton onClick={() => restoreFromPicker('branch')} disabled={isAllBranches}>
                    Restore into this branch
                  </SecondaryButton>
                ) : (
                  <label className={`inline-flex items-center gap-2 px-4 py-2.5 border rounded-lg font-medium cursor-pointer ${isAllBranches ? 'opacity-50 pointer-events-none' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600'}`}>
                    Restore into this branch
                    <input type="file" accept="application/json" className="hidden" onChange={e => importBranchBackup(e.target.files?.[0])} />
                  </label>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Branch restore replaces collections for the active branch from the file. Full global backups also work — only matching branch rows are applied.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={`Purge this branch${branchLabel ? ` — ${branchLabel}` : ''}`}
              subtitle="Delete selected collections for the active header branch only. Shared menu/categories/users/warehouse and other branches are kept."
              icon=""
            />
            <CardBody>
              {isAllBranches ? (
                <p className="text-sm text-amber-800 dark:text-amber-200">Select a branch in the header to purge its data.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <SecondaryButton onClick={loadBranchTargets}>{branchTargetsLoading ? 'Loading…' : 'Refresh counts'}</SecondaryButton>
                    <SecondaryButton onClick={() => setSelectedBranchCols(new Set(branchTargets.map(t => t.key)))}>Select all</SecondaryButton>
                    <SecondaryButton onClick={() => setSelectedBranchCols(new Set(branchTargets.filter(t => Number(t.count) > 0).map(t => t.key)))}>Select with data</SecondaryButton>
                    <SecondaryButton onClick={() => setSelectedBranchCols(new Set())}>Clear</SecondaryButton>
                  </div>
                  <CollectionGrid
                    targets={branchTargets}
                    selected={selectedBranchCols}
                    onToggle={toggleSet(setSelectedBranchCols)}
                    loading={branchTargetsLoading}
                  />
                  <div className="flex flex-wrap gap-3 pt-2">
                    <DangerButton disabled={purgeBusy} onClick={() => purgeThisBranch({ all: false })}>
                      {purgeBusy ? 'Purging…' : `Purge selected (${selectedBranchCols.size})`}
                    </DangerButton>
                    <DangerButton disabled={purgeBusy} onClick={() => purgeThisBranch({ all: true })}>
                      {purgeBusy ? 'Purging…' : 'Purge all for this branch'}
                    </DangerButton>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {scope === 'global' && (
        <>
          <Card>
            <CardHeader
              title="Global backup & restore"
              subtitle="Full database: all branches, warehouse, menu, users, biometric, … Restore replaces everything."
              icon=""
            />
            <CardBody>
              <div className="flex flex-wrap gap-3">
                <PrimaryButton onClick={exportGlobalBackup}>Download full backup</PrimaryButton>
                {window?.backup ? (
                  <SecondaryButton onClick={() => restoreFromPicker('global')}>Restore full backup</SecondaryButton>
                ) : (
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors cursor-pointer">
                    Restore full backup
                    <input type="file" accept="application/json" className="hidden" onChange={e => importGlobalBackup(e.target.files?.[0])} />
                  </label>
                )}
                <DangerButton onClick={() => deleteAllData(false)}>Delete all data (keep users)</DangerButton>
              </div>
              <p className="text-xs text-slate-500">
                Full restore drops listed collections then inserts every collection from the file (including warehouse, branches, expense heads, snapshots, …).
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Manage global collections"
              subtitle="Select collections to purge across the whole system. Prefer Branch mode when cleaning one location."
              icon=""
            />
            <CardBody>
              <div className="flex flex-wrap gap-2 mb-3">
                <SecondaryButton onClick={loadGlobalTargets}>{globalTargetsLoading ? 'Loading…' : 'Refresh counts'}</SecondaryButton>
                <SecondaryButton onClick={() => setSelectedGlobalCols(new Set(globalTargets.filter(t => !t.preserveOnPurge).map(t => t.key)))}>Select all (no users)</SecondaryButton>
                <SecondaryButton onClick={() => setSelectedGlobalCols(new Set(globalTargets.filter(t => Number(t.count) > 0 && !t.preserveOnPurge).map(t => t.key)))}>Select with data</SecondaryButton>
                <SecondaryButton onClick={() => setSelectedGlobalCols(new Set())}>Clear</SecondaryButton>
              </div>
              <CollectionGrid
                targets={globalTargets}
                selected={selectedGlobalCols}
                onToggle={toggleSet(setSelectedGlobalCols)}
                loading={globalTargetsLoading}
              />
              <div className="flex flex-wrap gap-3 pt-2">
                <DangerButton disabled={purgeBusy} onClick={() => purgeGlobalSelected({ all: false })}>
                  {purgeBusy ? 'Purging…' : `Purge selected (${selectedGlobalCols.size})`}
                </DangerButton>
                <DangerButton disabled={purgeBusy} onClick={() => purgeGlobalSelected({ all: true, includeUsers: false })}>
                  Purge all global (keep users)
                </DangerButton>
              </div>
            </CardBody>
          </Card>
        </>
      )}

      <Card>
        <CardHeader
          title="Automatic Backup"
          subtitle="Runs a full (global) backup at the interval below"
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
                Automatically create full backups at the specified interval
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
