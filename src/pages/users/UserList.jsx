import { useAuth } from '../../state/AuthContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { useMemo, useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { UserPlus, Shield, Trash2 } from 'lucide-react'
import PageHero from '../../components/PageHero.jsx'
import { sidebarItems } from '../../layout/navConfig.js'
import { format } from 'date-fns'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'
import { btnPrint, btnPdf, btnCsv, downloadCsvFile } from '../../utils/listReportExport.js'

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
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)]/50 p-3">
      <label className="mb-2 block text-sm font-medium text-[var(--color-text-body)]">Page Access</label>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-[var(--color-surface-muted)] p-1">
        <button
          type="button"
          onClick={() => onModeChange('role')}
          className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${mode === 'role' ? 'bg-[var(--color-surface)] text-sky-700 shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-body)]'}`}
        >
          Role-based
        </button>
        <button
          type="button"
          onClick={() => onModeChange('custom')}
          className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${mode === 'custom' ? 'bg-[var(--color-surface)] text-sky-700 shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-body)]'}`}
        >
          Custom pages
        </button>
      </div>
      {mode === 'role' ? (
        <p className="text-xs text-[var(--color-text-muted)]">Uses the selected role&apos;s sidebar permissions. Set those on the Permissions page.</p>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--color-text-muted)]">{value.length} of {pages.length} pages allowed</span>
            <div className="flex gap-3">
              <button type="button" onClick={() => onChange(pages.map(p => p.path))} className="text-xs font-semibold text-sky-600 hover:text-sky-700">Select all</button>
              <button type="button" onClick={() => onChange([])} className="text-xs font-semibold text-slate-500 hover:text-slate-700">Deselect all</button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
            {groups.map(([section, items]) => (
              <div key={section}>
                <div className="bg-[var(--color-surface-muted)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">{section}</div>
                <div className="grid sm:grid-cols-2">
                  {items.map(p => (
                    <div key={p.path} className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-[var(--color-text-body)]">
                      <span className="truncate">{p.label}</span>
                      <Toggle on={selected.has(p.path)} onClick={() => toggle(p.path)} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function UserList() {
  const { users, addUser, removeUser, updateUser, token } = useAuth()
  const { state } = useData()
  const getAPI = () => ((typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000')

  const enabledPaths = state?.settings?.enabledPaths
  const isFeatureEnabled = (path) =>
    !Array.isArray(enabledPaths) || enabledPaths.length === 0 || enabledPaths.includes(path)
  const pages = sidebarItems.filter(i => !i.hidden && i.path !== '/my' && isFeatureEnabled(i.path))

  const [roles, setRoles] = useState([])
  const [newRoleName, setNewRoleName] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newRole, setNewRole] = useState('Admin')
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
    return [...new Set(['Admin', ...customRoles])]
  }

  const createNewRole = async () => {
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
    try {
      setLoading(true)
      const payload = {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
        pageAccess: newAccessMode === 'custom' ? newPageAccess : null,
      }
      const res = await addUser(payload)
      if (res?.ok) {
        toast.success('User added')
        setNewUsername('')
        setNewPassword('')
        setNewRole(roleOptions()[0] || 'Admin')
        setNewPageAccess([])
        setNewAccessMode('role')
        setAddOpen(false)
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
    try {
      setLoading(true)
      const payload = {
        role: editing.role,
        username: editing.username,
        pageAccess: editing.accessMode === 'custom' ? (editing.pageAccess || []) : null,
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
    setEditing({
      id: u.id,
      username: u.username || '',
      role: u.role || 'Admin',
      password: '',
      accessMode: custom ? 'custom' : 'role',
      pageAccess: custom ? [...u.pageAccess] : [],
    })
  }

  const userList = users || []

  const pageAccessLabel = (u) => {
    if (Array.isArray(u.pageAccess) && u.pageAccess.length) return `${u.pageAccess.length} custom pages`
    return 'Role default'
  }

  const userReportRows = () => userList.map(u => [
    u.username || '',
    u.role || '',
    pageAccessLabel(u),
  ])

  const openPrintPreview = async () => {
    try {
      const body =
        reportSummary([{ label: 'Users', amount: String(userList.length) }]) +
        reportSec(`Users (${userList.length})`) +
        reportTable({
          headers: ['Username', 'Role', 'Page Access'],
          numbered: true,
          rows: userList.map(u => [u.username || '-', u.role || '-', pageAccessLabel(u)]),
          emptyText: 'No users',
        })
      const html = wrapReportDoc({
        settings: state?.settings || {},
        title: 'User List',
        reportLabel: 'Users Report',
        reportNo: `Rpt #: USR-${format(new Date(), 'yyyy-MM-dd')}`,
        metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')]],
        metaRight: [['Records', String(userList.length)]],
        body,
      })
      await previewHtmlReport(html, `Users-${format(new Date(), 'yyyy-MM-dd')}.pdf`)
      toast.success('Print preview opened')
    } catch (e) {
      console.error(e)
      toast.error('Print preview failed')
    }
  }

  const exportPDF = () => {
    try {
      const doc = new jsPDF('p', 'pt', 'a4')
      doc.setFontSize(14)
      doc.text(state?.settings?.companyName || 'Users', 40, 32)
      doc.setFontSize(10)
      doc.text(`${userList.length} users`, 40, 46)
      doc.autoTable({
        head: [['Username', 'Role', 'Page Access']],
        body: userReportRows(),
        startY: 54,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [14, 165, 233], textColor: 255, fontStyle: 'bold' },
        margin: { left: 40, right: 40 },
      })
      doc.save(`users_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
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
        ['Username', 'Role', 'Page Access'],
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
          <button onClick={() => setAddOpen(true)} className="ui-btn ui-btn-primary inline-flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Add User
          </button>
        }
      />

      <div className="rounded-xl bg-[var(--color-surface)] p-6 shadow border border-[var(--color-border)]">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">All Users</div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
            <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
            <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {users?.length || 0} user{(users?.length || 0) === 1 ? '' : 's'}
            </div>
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
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="tbl min-w-full text-left">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Page Access</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
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
                    {Array.isArray(u.pageAccess) ? (
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold border ${u.pageAccess.length ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                        {u.pageAccess.length} / {pages.length} pages
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-muted)]">Role-based</span>
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
              {(!users || users.length === 0) && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[var(--color-text-muted)]">No users yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-black/5">
            <div className="px-5 py-3 text-base font-semibold text-white" style={{ background: 'linear-gradient(90deg, #0284c7, #2563eb)' }}>Add New User</div>
            <div className="space-y-3 p-5 max-h-[78vh] overflow-y-auto">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text-body)]">Username</label>
                <input value={newUsername} onChange={e => setNewUsername(e.target.value)} className="input" placeholder="Enter username" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text-body)]">Role</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)} className="input">
                  {roleOptions().map(r => <option key={r} value={r}>{r}</option>)}
                </select>
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
              {addUserError && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{addUserError}</div>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
              <button type="button" onClick={() => { setAddOpen(false); setAddUserError('') }} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-text-body)] hover:bg-[var(--color-surface-muted)]">Cancel</button>
              <button type="button" disabled={loading} onClick={submitAdd} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">Add User</button>
            </div>
          </div>
        </div>
      )}

      {roleOpen && (
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-black/5">
            <div className="px-5 py-3 text-base font-semibold text-white" style={{ background: 'linear-gradient(90deg, #0284c7, #2563eb)' }}>Edit User</div>
            <div className="space-y-3 p-5 max-h-[78vh] overflow-y-auto">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text-body)]">Username</label>
                <input value={editing.username} onChange={e => setEditing(prev => prev ? { ...prev, username: e.target.value } : prev)} className="input" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-text-body)]">Role</label>
                <select value={editing.role} onChange={e => setEditing(prev => prev ? { ...prev, role: e.target.value } : prev)} className="input">
                  {roleOptions().map(r => <option key={r} value={r}>{r}</option>)}
                </select>
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
