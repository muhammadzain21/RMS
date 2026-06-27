import { useAuth } from '../../state/AuthContext.jsx'
import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'

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

// Edit User Modal
function EditUserModal({ isOpen, user, onSave, onCancel, loading, roleOptions }) {
  const [form, setForm] = useState({ role: 'Admin', username: '', password: '' })
  
  useEffect(() => {
    if (user) {
      setForm({ role: user.role || 'Admin', username: user.username || '', password: '' })
    }
  }, [user])
  
  if (!isOpen) return null
  
  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(form)
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Edit User</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
            <input 
              type="text"
              placeholder="Username" 
              value={form.username} 
              onChange={e => setForm({...form, username: e.target.value})} 
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
            <select 
              value={form.role} 
              onChange={e => setForm({...form, role: e.target.value})} 
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password (optional)</label>
            <input 
              type="password" 
              placeholder="Leave blank to keep current" 
              value={form.password} 
              onChange={e => setForm({...form, password: e.target.value})} 
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function UserList() {
  const { users, addUser, removeUser, updateUser, token } = useAuth()
  const getAPI = () => ((typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000')
  
  const [form, setForm] = useState({ role:'Admin', username:'', password:'' })
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [roles, setRoles] = useState([])
  const [newRoleName, setNewRoleName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, userId: null })
  const [editModal, setEditModal] = useState({ isOpen: false, user: null })

  // Fetch custom roles
  useEffect(() => {
    const fetchRoles = async () => {
      if (!token) return
      try {
        const res = await fetch(`${getAPI()}/api/roles`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const data = await res.json()
          setRoles(data)
        }
      } catch (e) {
        console.error('Failed to fetch roles:', e)
      }
    }
    fetchRoles()
  }, [token])

  const getRoleOptions = () => {
    const baseRoles = ['Admin']
    const customRoles = roles.map(r => r.name)
    return [...baseRoles, ...customRoles]
  }

  const submit = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      const payload = { role: form.role }
      if (form.password) payload.password = form.password
      
      if (editingId) {
        if (form.username) payload.username = form.username
        const res = await updateUser(editingId, payload)
        if (res?.ok) toast.success('User updated')
        else toast.error(res?.error || 'Failed to update user')
      } else {
        if (!form.username || !form.password) { 
          toast.error('Username and password required')
          setLoading(false)
          return 
        }
        const createPayload = { ...payload, username: form.username, password: form.password }
        const res = await addUser(createPayload)
        if (res?.ok) toast.success('User added')
        else toast.error(res?.error || 'Failed to add user')
      }
      reset()
    } catch {
      toast.error(editingId ? 'Failed to update user' : 'Failed to add user')
    } finally {
      setLoading(false)
    }
  }

  const remove = async (id) => {
    setDeleteConfirm({ isOpen: true, userId: id })
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

  const onEdit = (u) => {
    setEditModal({ isOpen: true, user: u })
  }

  const handleEditSave = async (formData) => {
    if (!editModal.user) return
    try {
      setLoading(true)
      const payload = { role: formData.role }
      if (formData.username) payload.username = formData.username
      if (formData.password) payload.password = formData.password
      
      const res = await updateUser(editModal.user.id, payload)
      if (res?.ok) {
        toast.success('User updated')
        setEditModal({ isOpen: false, user: null })
      } else {
        toast.error(res?.error || 'Failed to update user')
      }
    } catch {
      toast.error('Failed to update user')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => { 
    setEditingId(null)
    setForm({ role:'Admin', username:'', password:'' })
  }

  const createNewRole = async (e) => {
    e.preventDefault()
    if (!newRoleName.trim()) {
      toast.error('Role name is required')
      return
    }
    try {
      setLoading(true)
      const res = await fetch(`${getAPI()}/api/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newRoleName.trim(),
          description: ''
        })
      })
      if (res.ok) {
        const created = await res.json()
        setRoles(prev => [...prev, created])
        setNewRoleName('')
        toast.success('Role created')
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to create role')
      }
    } catch (e) {
      toast.error('Failed to create role')
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (username) => {
    return username ? username.charAt(0).toUpperCase() : '?'
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
          {users?.length || 0} users
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Side - Users Table */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">All Users</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-3">User</th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-3">Role</th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {users?.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="py-3">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium mr-3">
                          {getInitials(u.username)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{u.username}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">ID: {u.id?.slice(-6) || 'N/A'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        u.role === 'Admin'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button 
                          disabled={loading} 
                          onClick={() => onEdit(u)} 
                          className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button 
                          disabled={loading} 
                          onClick={() => remove(u.id)} 
                          className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!users || users.length === 0) && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-gray-500 dark:text-gray-400">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side - Create Role & Add User */}
        <div className="space-y-4">
          {/* Create Role Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Create Role</h3>
            <form onSubmit={createNewRole} className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. ward-admin"
                value={newRoleName}
                onChange={e => setNewRoleName(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={loading || !newRoleName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-lg hover:bg-gray-700 disabled:opacity-50"
              >
                Create
              </button>
            </form>
          </div>

          {/* Add New User Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Add New User</h3>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <input 
                  type="text"
                  placeholder="Username" 
                  value={form.username} 
                  onChange={e => setForm({...form, username: e.target.value})} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>
              
              <div>
                <select 
                  value={form.role} 
                  onChange={e => setForm({...form, role: e.target.value})} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {getRoleOptions().map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              
              <div>
                <input 
                  type="password" 
                  placeholder="Password (min 4 chars)" 
                  value={form.password} 
                  onChange={e => setForm({...form, password: e.target.value})} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                />
              </div>

              <button 
                type="submit"
                disabled={loading || !form.username || !form.password} 
                className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add User'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title="Delete User"
        message="Are you sure you want to delete this user? This action cannot be undone."
        onConfirm={confirmDeleteUser}
        onCancel={() => setDeleteConfirm({ isOpen: false, userId: null })}
        loading={loading}
      />

      {/* Edit User Modal */}
      <EditUserModal
        isOpen={editModal.isOpen}
        user={editModal.user}
        onSave={handleEditSave}
        onCancel={() => setEditModal({ isOpen: false, user: null })}
        loading={loading}
        roleOptions={getRoleOptions()}
      />
    </div>
  )
}
