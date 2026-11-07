import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { toast } from 'react-hot-toast'
import { sidebarItems, defaultPermissionItems } from '../../layout/navConfig.js'

// Custom Confirm Modal
function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Delete', loading }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Deleting...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SidebarPermissions() {
  const { token, user: currentUser } = useAuth()
  const { state } = useData()
  const getAPI = () => ((typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000')
  const isAdminUser = currentUser?.role === 'Admin' || currentUser?.role === 'SuperAdmin' || !!currentUser?.isHq

  // Pages disabled via the SuperAdmin portal are hidden from this list entirely
  const enabledPaths = state?.settings?.enabledPaths
  const isFeatureEnabled = (path) =>
    !Array.isArray(enabledPaths) || enabledPaths.length === 0 || enabledPaths.includes(path)
  const hiddenBySuperAdmin = sidebarItems.filter(i => !i.hidden && !isFeatureEnabled(i.path)).length > 0
  
  const [roles, setRoles] = useState([])
  const [selectedRole, setSelectedRole] = useState(null)
  const [rolePermissions, setRolePermissions] = useState([])
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleDescription, setNewRoleDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, roleId: null })

  // Fetch roles on mount
  useEffect(() => {
    fetchRoles()
  }, [token])

  const grantablePaths = useMemo(() => {
    if (isAdminUser) return null
    const perms = Array.isArray(currentUser?.permissions) ? currentUser.permissions : []
    return new Set(perms.filter(p => p?.visible && p.path && p.path !== '/my').map(p => p.path))
  }, [isAdminUser, currentUser?.permissions])

  const visiblePaths = new Set(
    sidebarItems
      .filter(i => !i.hidden && i.path !== '/my' && isFeatureEnabled(i.path))
      .filter(i => isAdminUser || grantablePaths?.has(i.path))
      .map(i => i.path)
  )

  const normalizePermissions = (perms) => {
    if (!perms || !Array.isArray(perms)) return defaultPermissionItems().filter(p => visiblePaths.has(p.path))
    return perms
      .filter(p => visiblePaths.has(p.path))
      .map(p => {
        const def = sidebarItems.find(d => d.path === p.path)
        return { ...def, ...p, section: p.section || def?.section || 'Other', order: p.order ?? def?.order ?? 99 }
      })
  }

  const fetchRoles = async () => {
    if (!token) return
    try {
      setLoading(true)
      const res = await fetch(`${getAPI()}/api/roles`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setRoles(data)
        // Select first role by default
        if (data.length > 0 && !selectedRole) {
          setSelectedRole(data[0])
          setRolePermissions(normalizePermissions(data[0].permissions))
        }
      }
    } catch (e) {
      console.error('Failed to fetch roles:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = (role) => {
    setSelectedRole(role)
    setRolePermissions(normalizePermissions(role.permissions))
  }

  const toggleVisibility = (path) => {
    setRolePermissions(prev => {
      const index = prev.findIndex(p => p.path === path)
      if (index === -1) return prev
      const updated = [...prev]
      updated[index] = { ...updated[index], visible: !updated[index].visible }
      return updated
    })
  }

  const toggleSection = (sectionItems) => {
    const paths = new Set(sectionItems.map(i => i.path))
    const allOn = sectionItems.every(i => i.visible)
    setRolePermissions(prev => prev.map(p => (
      paths.has(p.path) ? { ...p, visible: !allOn } : p
    )))
  }

  const saveChanges = async () => {
    if (!selectedRole || !token) return
    try {
      setSaving(true)
      const res = await fetch(`${getAPI()}/api/roles/${selectedRole.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          permissions: [
            ...rolePermissions,
            // Keep entries for superadmin-disabled paths so re-enabling restores prior role access
            ...(selectedRole.permissions || []).filter(p => !visiblePaths.has(p.path))
          ]
        })
      })
      if (res.ok) {
        const updated = await res.json()
        setRoles(prev => prev.map(r => r.id === updated.id ? updated : r))
        toast.success('Permissions saved successfully')
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to save permissions')
      }
    } catch (e) {
      toast.error('Failed to save permissions')
    } finally {
      setSaving(false)
    }
  }

  const resetToDefaults = async () => {
    if (!selectedRole || !token) return
    try {
      setSaving(true)
      const res = await fetch(`${getAPI()}/api/roles/${selectedRole.id}/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const updated = await res.json()
        setRolePermissions(normalizePermissions(updated.permissions))
        setRoles(prev => prev.map(r => r.id === updated.id ? updated : r))
        toast.success('Permissions reset to defaults')
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to reset permissions')
      }
    } catch (e) {
      toast.error('Failed to reset permissions')
    } finally {
      setSaving(false)
    }
  }

  const createRole = async (e) => {
    e.preventDefault()
    if (!newRoleName.trim() || !token) {
      toast.error('Role name is required')
      return
    }
    try {
      setSaving(true)
      const res = await fetch(`${getAPI()}/api/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newRoleName.trim(),
          description: newRoleDescription,
          permissions: defaultPermissionItems()
        })
      })
      if (res.ok) {
        const created = await res.json()
        setRoles(prev => [...prev, created])
        setSelectedRole(created)
        setRolePermissions(normalizePermissions(created.permissions))
        setNewRoleName('')
        setNewRoleDescription('')
        toast.success('Role created successfully')
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to create role')
      }
    } catch (e) {
      toast.error('Failed to create role')
    } finally {
      setSaving(false)
    }
  }

  const deleteRole = async (roleId) => {
    const role = roles.find(r => r.id === roleId)
    if (role?.isDefault) {
      toast.error('Cannot delete default roles')
      return
    }
    setDeleteConfirm({ isOpen: true, roleId })
  }

  const confirmDeleteRole = async () => {
    if (!token) return
    
    try {
      setSaving(true)
      const res = await fetch(`${getAPI()}/api/roles/${deleteConfirm.roleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setRoles(prev => prev.filter(r => r.id !== deleteConfirm.roleId))
        if (selectedRole?.id === deleteConfirm.roleId) {
          const remaining = roles.filter(r => r.id !== deleteConfirm.roleId)
          if (remaining.length > 0) {
            setSelectedRole(remaining[0])
            setRolePermissions(normalizePermissions(remaining[0].permissions))
          } else {
            setSelectedRole(null)
            setRolePermissions([])
          }
        }
        toast.success('Role deleted successfully')
        setDeleteConfirm({ isOpen: false, roleId: null })
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to delete role')
      }
    } catch (e) {
      toast.error('Failed to delete role')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="page-hero-compact">
        <div>
          <h1 className="page-title">Sidebar Permissions</h1>
          <p className="page-sub">Manage which sidebar pages are visible to different user roles. My Work is not listed here — it is controlled per staff member.</p>
        </div>
      </div>
      {hiddenBySuperAdmin && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Some pages are disabled in the SuperAdmin portal and are hidden from this list.
        </p>
      )}

      {/* Role Selection */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Role</label>
        <div className="flex flex-wrap gap-2">
          {roles.map(role => (
            <button
              key={role.id}
              onClick={() => handleRoleChange(role)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedRole?.id === role.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {role.name}
            </button>
          ))}
          {loading && <span className="text-gray-500">Loading...</span>}
        </div>
      </div>

      {/* Create New Role — Admin only */}
      {isAdminUser && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create New Role</h3>
          <form onSubmit={createRole} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Role name (e.g. ward-admin)"
              value={newRoleName}
              onChange={e => setNewRoleName(e.target.value)}
              className="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newRoleDescription}
              onChange={e => setNewRoleDescription(e.target.value)}
              className="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <button
              type="submit"
              disabled={saving || !newRoleName.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Creating...' : 'Create Role'}
            </button>
          </form>
        </div>
      )}
      {!isAdminUser && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          You can edit page toggles for roles using only the pages Admin gave you. Creating or deleting roles is Admin-only.
        </p>
      )}

      {/* Permissions Tiles */}
      {selectedRole && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedRole.name} Permissions</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Last updated: {new Date(selectedRole.updatedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2">
              {isAdminUser && (
                <button
                  onClick={resetToDefaults}
                  disabled={saving}
                  className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                >
                  Reset to Defaults
                </button>
              )}
              <button
                onClick={saveChanges}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              {isAdminUser && !selectedRole.isDefault && (
                <button
                  onClick={() => deleteRole(selectedRole.id)}
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  Delete Role
                </button>
              )}
            </div>
          </div>

          {(() => {
            const grouped = {}
            rolePermissions.filter(item => visiblePaths.has(item.path)).forEach(item => {
              const s = item.section || 'Other'
              if (!grouped[s]) grouped[s] = []
              grouped[s].push(item)
            })
            const sectionOrder = ['Dashboard', 'Sales', 'Operations', 'Warehouse', 'Staff Management', 'Finance', 'Admin']
            const sortedSections = Object.keys(grouped).sort((a, b) => {
              const ia = sectionOrder.indexOf(a)
              const ib = sectionOrder.indexOf(b)
              if (ia === -1 && ib === -1) return a.localeCompare(b)
              if (ia === -1) return 1
              if (ib === -1) return -1
              return ia - ib
            })
            const sectionColors = {
              Dashboard: 'border-blue-500',
              Sales: 'border-orange-500',
              Operations: 'border-indigo-500',
              Warehouse: 'border-cyan-500',
              'Staff Management': 'border-emerald-500',
              Finance: 'border-green-500',
              Admin: 'border-purple-500',
            }
            const sectionHeaders = {
              Dashboard: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
              Sales: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300',
              Operations: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300',
              Warehouse: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300',
              'Staff Management': 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300',
              Finance: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300',
              Admin: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300',
            }
            return (
              <div className="grid grid-cols-1 gap-4">
                {sortedSections.map(section => {
                  const items = grouped[section].sort((a, b) => a.order - b.order)
                  const enabledCount = items.filter(i => i.visible).length
                  const sectionOn = enabledCount === items.length && items.length > 0
                  return (
                    <div key={section} className={`bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border-t-4 ${sectionColors[section] || 'border-gray-300'}`}>
                      <div className={`px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 ${sectionHeaders[section] || 'bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300'}`}>
                        <div>
                          <h3 className="font-semibold">{section}</h3>
                          <p className="text-xs opacity-75">{enabledCount} of {items.length} enabled</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleSection(items)}
                          className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-bold bg-white/70 dark:bg-gray-900/40 border border-black/5 dark:border-white/10 hover:bg-white dark:hover:bg-gray-900"
                          title={sectionOn ? 'Disable full section' : 'Enable full section'}
                        >
                          <span>{sectionOn ? 'Full section on' : 'Enable section'}</span>
                          <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            sectionOn ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                          }`}>
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[#ffffff] transition-transform ${
                              sectionOn ? 'translate-x-4' : 'translate-x-1'
                            }`} />
                          </span>
                        </button>
                      </div>
                      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {items.map(item => (
                          <button
                            key={item.path}
                            onClick={() => toggleVisibility(item.path)}
                            className={`flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                              item.visible
                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                                : 'bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                            }`}
                          >
                            <span className={`text-sm font-medium ${item.visible ? 'text-blue-900 dark:text-blue-200' : 'text-gray-700 dark:text-gray-300'}`}>
                              {item.label}
                            </span>
                            <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              item.visible ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                            }`}>
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[#ffffff] transition-transform ${
                                item.visible ? 'translate-x-4' : 'translate-x-1'
                              }`} />
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title="Delete Role"
        message="Are you sure you want to delete this role? Users assigned to this role will lose their permissions."
        onConfirm={confirmDeleteRole}
        onCancel={() => setDeleteConfirm({ isOpen: false, roleId: null })}
        loading={saving}
      />
    </div>
  )
}
