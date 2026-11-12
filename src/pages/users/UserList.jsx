import { useAuth } from '../../state/AuthContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'
import { useMemo, useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { UserPlus, Shield, Trash2 } from 'lucide-react'
import PageHero from '../../components/PageHero.jsx'
import { sidebarItems } from '../../layout/navConfig.js'
import { format } from 'date-fns'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '../../utils/reportDoc.js'
import { btnPrint, btnPdf, btnCsv, downloadCsvFile, exportDateStamp } from '../../utils/listReportExport.js'

function Toggle({ on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-sky-600' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#ffffff] shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

function PageAccessSection({ pages, mode, onModeChange, value, onChange }) {
  const groups = useMemo(() => {
    const m = new Map()
    for (const p of pages) {
      const key = p.section || 'Pages'
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(p)
    }
    return Array.from(m.entries())
  }, [pages])
  const selected = new Set(value)
  const toggle = (path) => {
    const next = new Set(selected)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    onChange(Array.from(next))
  }
  const toggleSection = (items) => {
    const paths = items.map(p => p.path)
    const allOn = paths.every(p => selected.has(p))
    const next = new Set(selected)
    if (allOn) paths.forEach(p => next.delete(p))
    else paths.forEach(p => next.add(p))
    onChange(Array.from(next))
  }
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)]/50 p-4">
      <label className="mb-2 block text-sm font-bold text-[var(--color-text-body)]">Page Access</label>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-[var(--color-surface-muted)] p-1">
        <button
          type="button"
          onClick={() => onModeChange('role')}
          className={`rounded-md px-3 py-2 text-xs font-bold transition ${mode === 'role' ? 'bg-[var(--color-surface)] text-sky-700 shadow-sm' : 'text-[var(--color-text-body)] hover:text-[var(--color-text-primary)]'}`}
        >
          Role-based
        </button>
        <button
          type="button"
          onClick={() => onModeChange('custom')}
          className={`rounded-md px-3 py-2 text-xs font-bold transition ${mode === 'custom' ? 'bg-[var(--color-surface)] text-sky-700 shadow-sm' : 'text-[var(--color-text-body)] hover:text-[var(--color-text-primary)]'}`}
        >
          Custom pages
        </button>
      </div>
      {mode === 'role' ? (
        <p className="text-xs font-medium text-[var(--color-text-body)]">Uses the selected role&apos;s sidebar permissions. Set those on the Permissions page.</p>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-bold text-[var(--color-text-body)]">{value.length} of {pages.length} pages allowed</span>
            <div className="flex gap-3">
              <button type="button" onClick={() => onChange(pages.map(p => p.path))} className="text-xs font-bold text-sky-600 hover:text-sky-700">Select all</button>
              <button type="button" onClick={() => onChange([])} className="text-xs font-bold text-slate-600 hover:text-slate-800">Deselect all</button>
            </div>
          </div>
          <div className="max-h-[28rem] overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
            {groups.map(([section, items]) => {
              const enabledCount = items.filter(p => selected.has(p.path)).length
              const sectionOn = enabledCount === items.length && items.length > 0
              return (
                <div key={section}>
                  <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 bg-[var(--color-surface-muted)] px-3 py-2 border-b border-[var(--color-border)]">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-primary)]">{section}</div>
                      <div className="text-[11px] font-medium text-[var(--color-text-body)]">{enabledCount} of {items.length} enabled</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-[var(--color-text-body)]">{sectionOn ? 'Full section' : 'Section off'}</span>
                      <Toggle on={sectionOn} onClick={() => toggleSection(items)} />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3">
                    {items.map(p => (
                      <div key={p.path} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-[var(--color-text-body)] border-b border-[var(--color-border-subtle)]">
                        <span className="truncate font-medium">{p.label}</span>
                        <Toggle on={selected.has(p.path)} onClick={() => toggle(p.path)} />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default function UserList() {
  const { users, addUser, removeUser, updateUser, token, user: currentUser, refreshUsers } = useAuth()
  const { state } = useData()
  const { branches, activeBranchId } = useBranch()
  const headerLocksBranch = !!(activeBranchId && String(activeBranchId).trim())
  const getAPI = () => ((typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000')
  const isAdminUser = currentUser?.role === 'Admin' || currentUser?.role === 'SuperAdmin' || !!currentUser?.isHq
  const managerBranchId = String(
    currentUser?.homeBranchId
    || activeBranchId
    || (Array.isArray(currentUser?.branchIds) ? currentUser.branchIds[0] : '')
    || ''
  )

  const enabledPaths = state?.settings?.enabledPaths
  const isFeatureEnabled = (path) =>
    !Array.isArray(enabledPaths) || enabledPaths.length === 0 || enabledPaths.includes(path)
  // Managers: only pages Admin gave them (including Permissions if granted)
  const allPages = sidebarItems.filter(i => !i.hidden && i.path !== '/my' && isFeatureEnabled(i.path))
  const managerGrantablePaths = useMemo(() => {
    if (isAdminUser) return null
    const perms = Array.isArray(currentUser?.permissions) ? currentUser.permissions : []
    return new Set(
      perms
        .filter(p => p?.visible && p.path && p.path !== '/my')
        .map(p => p.path)
    )
  }, [isAdminUser, currentUser?.permissions])
  const pages = isAdminUser
    ? allPages
    : allPages.filter(p => managerGrantablePaths?.has(p.path))

  const [roles, setRoles] = useState([])
  const [newRoleName, setNewRoleName] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newRole, setNewRole] = useState('')
  const [newBranchId, setNewBranchId] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPageAccess, setNewPageAccess] = useState([])
  const [newAccessMode, setNewAccessMode] = useState('role')
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const [addUserError, setAddUserError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, userId: null })
  const [deleteRoleOpen, setDeleteRoleOpen] = useState(false)
  const [deleteRole, setDeleteRole] = useState(null)
  const [editing, setEditing] = useState(null)
  // Admin default All. Values: 'all' | concrete branchId. Header wins when set.
  const [branchFilter, setBranchFilter] = useState('all')

  const branchName = (id) => {
    if (!id) return '—'
    const b = branches.find(x => String(x._id) === String(id))
    return b?.name || id
  }

  // Header branch preferred over page filter. Admin default: both All.
  useEffect(() => {
    if (!token) return
    const scoped = isAdminUser
      ? (headerLocksBranch
        ? String(activeBranchId)
        : (branchFilter && branchFilter !== 'all' ? String(branchFilter) : ''))
      : (managerBranchId || '')
    refreshUsers?.(scoped || undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeBranchId, managerBranchId, branchFilter, isAdminUser, headerLocksBranch])

  useEffect(() => {
    if (!isAdminUser && managerBranchId) {
      setNewBranchId(managerBranchId)
      setBranchFilter(managerBranchId || 'all')
    }
  }, [isAdminUser, managerBranchId])

  useEffect(() => {
    const fetchRoles = async () => {
      if (!token) return
      try {
        const res = await fetch(`${getAPI()}/api/roles`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) setRoles(await res.json())
      } catch (e) {
        console.error('Failed to fetch roles:', e)
      }
    }
    fetchRoles()
  }, [token])

  const roleOptions = () => {
    const customRoles = roles.map(r => r.name).filter(n => n && n !== 'Admin' && n !== 'SuperAdmin')
    // Built-in assignable roles so managers can add users even before custom roles exist
    const builtins = ['Manager', 'Cashier', 'Staff']
    const fromUsers = (users || []).map(u => u.role).filter(n => n && n !== 'Admin' && n !== 'SuperAdmin')
    const pool = [...new Set([...customRoles, ...builtins, ...fromUsers])]
    // Only Admin users may assign the Admin role
    return isAdminUser ? [...new Set(['Admin', ...pool])] : pool
  }

  useEffect(() => {
    const opts = roleOptions()
    if (!newRole || !opts.includes(newRole)) setNewRole(opts[0] || '')
  }, [roles, isAdminUser])

  useEffect(() => {
    if (!newBranchId && activeBranchId) setNewBranchId(activeBranchId)
  }, [activeBranchId])

  const createNewRole = async () => {
    if (!isAdminUser) {
      toast.error('Only admin can create roles')
      return
    }
    if (!newRoleName.trim()) {
      toast.error('Role name is required')
      return
    }
    try {
      setLoading(true)
      const res = await fetch(`${getAPI()}/api/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newRoleName.trim(), description: '' }),
      })
      if (res.ok) {
        const created = await res.json()
        setRoles(prev => [...prev, created])
        setNewRole(created.name)
        setNewRoleName('')
        setRoleOpen(false)
        toast.success('Role created')
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to create role')
      }
    } catch {
      toast.error('Failed to create role')
    } finally {
      setLoading(false)
    }
  }

  const confirmDeleteRole = async () => {
    if (!isAdminUser) {
      toast.error('Only admin can delete roles')
      return
    }
    if (!deleteRole) return
    try {
      setLoading(true)
      const res = await fetch(`${getAPI()}/api/roles/${deleteRole.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setRoles(prev => prev.filter(r => r.id !== deleteRole.id))
        toast.success('Role deleted')
      } else {
        const error = await res.json().catch(() => ({}))
        toast.error(error.error || 'Failed to delete role')
      }
    } catch {
      toast.error('Failed to delete role')
    } finally {
      setLoading(false)
      setDeleteRoleOpen(false)
      setDeleteRole(null)
    }
  }

  const submitAdd = async () => {
    setAddUserError('')
    if (!newUsername.trim()) { setAddUserError('Username is required'); return }
    if (!newPassword || newPassword.length < 4) { setAddUserError('Password must be at least 4 characters'); return }
    if (!newRole) { setAddUserError('Please select a role'); return }
    if (newRole === 'Admin' && !isAdminUser) {
      setAddUserError('Only admin can create admin users')
      return
    }
    const branchForUser = isAdminUser
      ? (newRole === 'Admin' ? (newBranchId || activeBranchId || '') : newBranchId)
      : (managerBranchId || newBranchId)
    if (newRole !== 'Admin' && !branchForUser) {
      setAddUserError('Please select a branch for this user')
      return
    }
    try {
      setLoading(true)
      const payload = {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
        homeBranchId: branchForUser,
        pageAccess: newAccessMode === 'custom'
          ? (isAdminUser
            ? newPageAccess
            : newPageAccess.filter(p => managerGrantablePaths?.has(p)))
          : null,
      }
      const res = await addUser(payload)
      if (res?.ok) {
        toast.success('User added')
        setNewUsername('')
        setNewPassword('')
        setNewRole(roleOptions()[0] || '')
        setNewBranchId(isAdminUser ? (activeBranchId || '') : (managerBranchId || ''))
        setNewPageAccess([])
        setNewAccessMode('role')
        setAddOpen(false)
        await refreshUsers?.(isAdminUser
          ? (headerLocksBranch
            ? activeBranchId
            : (branchFilter && branchFilter !== 'all' ? branchFilter : ''))
          : managerBranchId)
      } else {
        setAddUserError(res?.error || 'Failed to add user')
      }
    } catch {
      setAddUserError('Failed to add user')
    } finally {
      setLoading(false)
    }
  }

  const confirmDeleteUser = async () => {
    try {
      setLoading(true)
      await removeUser(deleteConfirm.userId)
      toast.success('User removed')
      setDeleteConfirm({ isOpen: false, userId: null })
    } catch {
      toast.error('Failed to remove user')
    } finally {
      setLoading(false)
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    if (editing.role === 'Admin' && !isAdminUser) {
      toast.error('Only admin can assign the Admin role')
      return
    }
    const editBranch = isAdminUser ? (editing.homeBranchId || '') : (managerBranchId || editing.homeBranchId || '')
    if (editing.role !== 'Admin' && !editBranch) {
      toast.error('Please select a branch for this user')
      return
    }
    try {
      setLoading(true)
      let pageAccess = null
      if (editing.accessMode === 'custom') {
        if (isAdminUser) {
          pageAccess = editing.pageAccess || []
        } else {
          // Manager can only toggle pages they have; keep any higher pages Admin already set
          const selected = (editing.pageAccess || []).filter(p => managerGrantablePaths?.has(p))
          const preserved = (editing.originalPageAccess || []).filter(p => !managerGrantablePaths?.has(p))
          pageAccess = [...new Set([...preserved, ...selected])]
        }
      }
      const payload = {
        role: editing.role,
        username: editing.username,
        homeBranchId: editBranch,
        pageAccess,
      }
      if (editing.password) payload.password = editing.password
      const res = await updateUser(editing.id, payload)
      if (res?.ok) {
        toast.success('User updated')
        setEditing(null)
      } else {
        toast.error(res?.error || 'Failed to update user')
      }
    } catch {
      toast.error('Failed to update user')
    } finally {
      setLoading(false)
    }
  }

  const openEdit = (u) => {
    const custom = Array.isArray(u.pageAccess)
    const fullAccess = custom ? [...u.pageAccess] : []
    setEditing({
      id: u.id,
      username: u.username || '',
      role: u.role || roleOptions()[0] || '',
      homeBranchId: isAdminUser
        ? (u.homeBranchId || activeBranchId || '')
        : (managerBranchId || u.homeBranchId || ''),
      password: '',
      accessMode: custom ? 'custom' : 'role',
      // Dialog only toggles pages this manager can grant
      pageAccess: custom
        ? (isAdminUser ? fullAccess : fullAccess.filter(p => managerGrantablePaths?.has(p)))
        : [],
      originalPageAccess: fullAccess,
    })
  }

  const userList = useMemo(() => {
    const list = users || []
    if (!isAdminUser) return list
    const effectiveId = headerLocksBranch
      ? String(activeBranchId)
      : (branchFilter && branchFilter !== 'all' ? String(branchFilter) : '')
    if (!effectiveId) return list
    return list.filter(u => {
      if (u.role === 'Admin' || u.role === 'SuperAdmin' || u.isHq) return true
      if (String(u.homeBranchId || '') === effectiveId) return true
      return Array.isArray(u.branchIds) && u.branchIds.map(String).includes(effectiveId)
    })
  }, [users, branchFilter, activeBranchId, isAdminUser, headerLocksBranch])

  const pageAccessLabel = (u) => {
    if (Array.isArray(u.pageAccess) && u.pageAccess.length) return `${u.pageAccess.length} custom pages`
    return 'Role default'
  }

  const userReportRows = () => userList.map(u => [
    u.username || '',
    u.role || '',
    u.role === 'Admin' || u.isHq ? 'All branches' : branchName(u.homeBranchId),
    pageAccessLabel(u),
  ])

  const buildUserListReport = () => {
    const body =
      reportSummary([{ label: 'Users', amount: String(userList.length) }]) +
      reportSec(`Users (${userList.length})`) +
      reportTable({
        headers: ['Username', 'Role', 'Branch', 'Page Access'],
        numbered: true,
        rows: userList.map(u => [
          u.username || '-',
          u.role || '-',
          u.role === 'Admin' || u.isHq ? 'All branches' : branchName(u.homeBranchId),
          pageAccessLabel(u),
        ]),
        emptyText: 'No users',
      })
    const fileName = `Users-${exportDateStamp()}.pdf`
    const html = wrapReportDoc({
      settings: state?.settings || {},
      title: 'User List',
      reportLabel: 'Users Report',
      reportNo: `Rpt #: USR-${exportDateStamp()}`,
      metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')]],
      metaRight: [['Records', String(userList.length)]],
      body,
    })
    return { html, fileName }
  }

  const openPrintPreview = async () => {
    try {
      const { html, fileName } = buildUserListReport()
      await previewHtmlReport(html, fileName)
      toast.success('Print preview opened')
    } catch (e) {
      console.error(e)
      toast.error('Print preview failed')
    }
  }

  const exportPDF = async () => {
    try {
      const { html, fileName } = buildUserListReport()
      await downloadHtmlReport(html, fileName)
      toast.success('PDF exported successfully')
    } catch (e) {
      console.error(e)
      toast.error('Failed to export PDF')
    }
  }

  const exportCSV = () => {
    try {
      downloadCsvFile(
        `users_${format(new Date(), 'yyyy-MM-dd')}.csv`,
        ['Username', 'Role', 'Branch', 'Page Access'],
        userReportRows()
      )
      toast.success('CSV exported successfully')
    } catch {
      toast.error('Failed to export CSV')
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon={Shield}
        title="User Management"
        subtitle="Create users, assign roles, and control page access"
        actions={
          <button
            onClick={() => {
              setNewBranchId(isAdminUser ? (activeBranchId || '') : (managerBranchId || ''))
              setNewRole(roleOptions()[0] || '')
              setAddUserError('')
              setAddOpen(true)
            }}
            className="ui-btn ui-btn-primary inline-flex items-center gap-2"
          >
            <UserPlus className="h-4 w-4" /> Add User
          </button>
        }
      />

      <div className="rounded-xl bg-[var(--color-surface)] p-6 shadow border border-[var(--color-border)]">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">Users</div>
          <div className="flex flex-wrap items-center gap-3">
            {isAdminUser ? (
              <div className="flex flex-col gap-0.5">
                <select
                  value={headerLocksBranch ? String(activeBranchId) : branchFilter}
                  onChange={e => setBranchFilter(e.target.value)}
                  disabled={headerLocksBranch}
                  className="input py-1.5 text-sm disabled:opacity-60"
                  title={headerLocksBranch
                    ? 'Using header branch (set header to All branches to use this filter)'
                    : 'Page filter — used when header is All branches'}
                >
                  <option value="all">All branches</option>
                  {branches.map(b => (
                    <option key={b._id} value={String(b._id)}>{b.name || b.code}</option>
                  ))}
                </select>
                {headerLocksBranch ? (
                  <span className="text-[10px] text-[var(--color-text-muted)]">Header branch preferred</span>
                ) : null}
              </div>
            ) : (
              <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-text-body)]">
                {branchName(managerBranchId) || 'Your branch'}
              </span>
            )}
            <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
            <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
            <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {userList.length} user{userList.length === 1 ? '' : 's'}
            </div>
            {isAdminUser && (
              <>
                <div className="relative group">
                  <button className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-body)] hover:bg-[var(--color-surface-muted)]">
                    <Trash2 className="h-4 w-4" /> Delete Role
                  </button>
                  <div className="absolute right-0 top-full z-20 mt-1 hidden max-h-64 w-48 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg group-hover:block">
                    {roles.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-[var(--color-text-muted)]">No custom roles</div>
                    ) : roles.map(r => (
                      <button key={r.id} onClick={() => { setDeleteRole(r); setDeleteRoleOpen(true) }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-[var(--color-text-body)] hover:bg-rose-50 hover:text-rose-700">
                        <span>{r.name}</span>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => setRoleOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-body)] hover:bg-[var(--color-surface-muted)]">
                  <Shield className="h-4 w-4" /> Create Role
                </button>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="tbl min-w-full text-left">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Branch</th>
                <th>Page Access</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {userList.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--color-surface-muted)] text-sm font-semibold text-[var(--color-text-primary)] ring-1 ring-[var(--color-border)]">
                        {(u.username || 'U').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="font-semibold text-[var(--color-text-primary)]">{u.username}</div>
                    </div>
                  </td>
                  <td>
                    <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-body)]">{u.role}</span>
                  </td>
                  <td>
                    <span className="text-sm font-medium text-[var(--color-text-body)]">
                      {u.role === 'Admin' || u.isHq ? 'All branches' : branchName(u.homeBranchId)}
                    </span>
                  </td>
                  <td>
                    {Array.isArray(u.pageAccess) ? (
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold border ${u.pageAccess.length ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                        {u.pageAccess.length} / {pages.length} pages
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-body)]">Role-based</span>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => openEdit(u)} className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700">Edit</button>
                      <button onClick={() => setDeleteConfirm({ isOpen: true, userId: u.id })} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {userList.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[var(--color-text-muted)]">No users for this branch yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3 sm:px-6 py-4" role="dialog" aria-modal="true">
          <div className="flex w-full max-w-5xl max-h-[92vh] flex-col overflow-hidden rounded-xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-black/5">
            <div className="px-6 py-4 text-base font-semibold text-white shrink-0" style={{ background: 'linear-gradient(90deg, #0284c7, #2563eb)' }}>Add New User</div>
            <div className="space-y-4 p-6 overflow-y-auto flex-1 min-h-0">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text-body)]">Username</label>
                <input value={newUsername} onChange={e => setNewUsername(e.target.value)} className="input" placeholder="Enter username" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text-body)]">Role</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)} className="input">
                  {roleOptions().length === 0 && <option value="">Create a role first</option>}
                  {roleOptions().map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {!isAdminUser && (
                  <p className="mt-1 text-xs text-[var(--color-text-body)]">Only admin can create Admin users.</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text-body)]">Branch</label>
                {isAdminUser ? (
                  <select
                    value={newBranchId}
                    onChange={e => setNewBranchId(e.target.value)}
                    className="input"
                    required={newRole !== 'Admin'}
                  >
                    <option value="">Select branch…</option>
                    {branches.map(b => (
                      <option key={b._id} value={b._id}>{b.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    value={branchName(managerBranchId) || managerBranchId || 'No branch assigned'}
                    disabled
                    readOnly
                  />
                )}
                {!isAdminUser && !managerBranchId && (
                  <p className="mt-1 text-xs text-rose-700">Your account has no branch. Ask admin to assign one.</p>
                )}
                {newRole === 'Admin' && isAdminUser && (
                  <p className="mt-1 text-xs text-[var(--color-text-body)]">Admin users can access all branches.</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text-body)]">Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="input" placeholder="Min 4 characters" />
              </div>
              <PageAccessSection
                pages={pages}
                mode={newAccessMode}
                onModeChange={(m) => { setNewAccessMode(m); if (m === 'custom') setNewPageAccess([]) }}
                value={newPageAccess}
                onChange={setNewPageAccess}
              />
              {!isAdminUser && (
                <p className="text-xs font-medium text-[var(--color-text-body)]">
                  You can only assign pages Admin gave you.
                </p>
              )}
              {addUserError && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{addUserError}</div>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
              <button type="button" onClick={() => { setAddOpen(false); setAddUserError('') }} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-text-body)] hover:bg-[var(--color-surface-muted)]">Cancel</button>
              <button type="button" disabled={loading} onClick={submitAdd} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">Add User</button>
            </div>
          </div>
        </div>
      )}

      {roleOpen && isAdminUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-black/5">
            <div className="px-5 py-3 text-base font-semibold text-white" style={{ background: 'linear-gradient(90deg, #7c3aed, #6366f1)' }}>Create New Role</div>
            <div className="space-y-3 p-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text-body)]">Role Name</label>
                <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createNewRole()} className="input" placeholder="e.g. cashier" autoFocus />
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">Roles determine sidebar permissions. After creating, assign pages on the Permissions page or pick Custom pages on the user.</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
              <button type="button" onClick={() => { setRoleOpen(false); setNewRoleName('') }} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-text-body)] hover:bg-[var(--color-surface-muted)]">Cancel</button>
              <button type="button" onClick={createNewRole} disabled={loading || !newRoleName.trim()} className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{loading ? 'Creating…' : 'Create Role'}</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3 sm:px-6 py-4" role="dialog" aria-modal="true">
          <div className="flex w-full max-w-5xl max-h-[92vh] flex-col overflow-hidden rounded-xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-black/5">
            <div className="px-6 py-4 text-base font-semibold text-white shrink-0" style={{ background: 'linear-gradient(90deg, #0284c7, #2563eb)' }}>Edit User</div>
            <div className="space-y-4 p-6 overflow-y-auto flex-1 min-h-0">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text-body)]">Username</label>
                <input value={editing.username} onChange={e => setEditing(prev => prev ? { ...prev, username: e.target.value } : prev)} className="input" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text-body)]">Role</label>
                <select value={editing.role} onChange={e => setEditing(prev => prev ? { ...prev, role: e.target.value } : prev)} className="input">
                  {roleOptions().map(r => <option key={r} value={r}>{r}</option>)}
                  {editing.role && !roleOptions().includes(editing.role) && (
                    <option value={editing.role}>{editing.role}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text-body)]">Branch</label>
                {isAdminUser ? (
                  <select
                    value={editing.homeBranchId || ''}
                    onChange={e => setEditing(prev => prev ? { ...prev, homeBranchId: e.target.value } : prev)}
                    className="input"
                  >
                    <option value="">Select branch…</option>
                    {branches.map(b => (
                      <option key={b._id} value={b._id}>{b.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    value={branchName(editing.homeBranchId || managerBranchId) || editing.homeBranchId || ''}
                    disabled
                    readOnly
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text-body)]">New Password</label>
                <input type="password" value={editing.password} onChange={e => setEditing(prev => prev ? { ...prev, password: e.target.value } : prev)} placeholder="Leave blank to keep current" className="input" />
              </div>
              <PageAccessSection
                pages={pages}
                mode={editing.accessMode}
                onModeChange={(m) => setEditing(prev => prev ? { ...prev, accessMode: m, pageAccess: m === 'custom' ? (prev.pageAccess || []) : [] } : prev)}
                value={editing.pageAccess || []}
                onChange={(v) => setEditing(prev => prev ? { ...prev, pageAccess: v } : prev)}
              />
              {!isAdminUser && (
                <p className="text-xs font-medium text-[var(--color-text-body)]">
                  Only pages you have access to are listed.
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
              <button type="button" onClick={() => setEditing(null)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-text-body)] hover:bg-[var(--color-surface-muted)]">Cancel</button>
              <button type="button" onClick={saveEdit} disabled={loading} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">{loading ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-black/5">
            <div className="border-b border-[var(--color-border)] px-5 py-3 text-base font-semibold text-[var(--color-text-primary)]">Confirm Delete</div>
            <div className="px-5 py-4 text-sm text-[var(--color-text-body)]">Delete this user? This action cannot be undone.</div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
              <button onClick={() => setDeleteConfirm({ isOpen: false, userId: null })} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-text-body)] hover:bg-[var(--color-surface-muted)]">Cancel</button>
              <button onClick={confirmDeleteUser} disabled={loading} className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{loading ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteRoleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-black/5">
            <div className="border-b border-[var(--color-border)] px-5 py-3 text-base font-semibold text-[var(--color-text-primary)]">Confirm Delete Role</div>
            <div className="px-5 py-4 text-sm text-[var(--color-text-body)]">Delete role <span className="font-bold">{deleteRole?.name}</span>? Users with this role will need to be reassigned.</div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
              <button onClick={() => { setDeleteRoleOpen(false); setDeleteRole(null) }} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-text-body)] hover:bg-[var(--color-surface-muted)]">Cancel</button>
              <button onClick={confirmDeleteRole} disabled={loading} className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{loading ? 'Deleting…' : 'Delete Role'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
