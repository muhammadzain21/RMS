import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const getAPI = () => ((typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000')
  // Initialize from sessionStorage (clears when app closes, survives page refresh within session)
  const [user, setUser] = useState(() => {
    try {
      const stored = sessionStorage.getItem('auth_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  const [token, setToken] = useState(() => sessionStorage.getItem('auth_token') || '')
  const [users, setUsers] = useState([])

  // No localStorage persistence; token and user live in memory only

  // Restore current user from token on load
  useEffect(() => {
    const restore = async () => {
      if (!token || user) return
      try {
        const res = await fetch(`${getAPI()}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const data = await res.json()
          if (data?.user) setUser(data.user)
        }
      } catch {}
    }
    restore()
  }, [token, user])

  // Hydrate users from backend for Admin when token is present
  useEffect(() => {
    const fetchUsers = async () => {
      if (!token || user?.role !== 'Admin') return
      try {
        const res = await fetch(`${getAPI()}/api/users`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const list = await res.json()
          setUsers(list)
        }
      } catch {}
    }
    fetchUsers()
  }, [token, user?.role])

  const login = async (username, password) => {
    try {
      const res = await fetch(`${getAPI()}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
      if (res.ok) {
        const data = await res.json()
        setToken(data.token)
        setUser(data.user)
        sessionStorage.setItem('auth_token', data.token)
        sessionStorage.setItem('auth_user', JSON.stringify(data.user))
        return { ok: true, user: data.user }
      }
    } catch {}
    return { ok: false, error: 'Invalid credentials' }
  }

  const logout = () => {
    // Send a best-effort audit log for logout before clearing credentials
    try {
      const t = sessionStorage.getItem('auth_token') || token
      if (t) {
        fetch(`${getAPI()}/api/audit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ type: 'auth', action: 'Logout' }),
          keepalive: true,
        }).catch(()=>{})
      }
    } catch {}
    setUser(null)
    setToken('')
    sessionStorage.removeItem('auth_token')
    sessionStorage.removeItem('auth_user')
  }

  const addUser = async (u) => {
    if (!token || user?.role !== 'Admin') return { ok: false, error: 'Unauthorized' }
    try {
      const res = await fetch(`${getAPI()}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(u) })
      if (res.ok) {
        const created = await res.json()
        setUsers(prev => [...prev, created])
        // refresh list from server to be safe
        try {
          const r = await fetch(`${getAPI()}/api/users`, { headers: { Authorization: `Bearer ${token}` } })
          if (r.ok) setUsers(await r.json())
        } catch {}
        return { ok: true }
      } else {
        let msg = 'Failed to add user'
        try { const body = await res.json(); msg = body?.error || body?.message || msg } catch {}
        return { ok: false, error: msg, status: res.status }
      }
    } catch (e) {
      return { ok: false, error: String(e?.message || 'Failed to add user') }
    }
  }

  const removeUser = async (id) => {
    if (!token || user?.role !== 'Admin') return { ok: false, error: 'Unauthorized' }
    try {
      const res = await fetch(`${getAPI()}/api/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== id))
        return { ok: true }
      } else {
        let msg = 'Failed to remove user'
        try { const body = await res.json(); msg = body?.error || body?.message || msg } catch {}
        return { ok: false, error: msg, status: res.status }
      }
    } catch (e) {
      return { ok: false, error: String(e?.message || 'Failed to remove user') }
    }
  }

  const updateUser = async (id, data) => {
    // data may contain: name, role, password
    if (!token || user?.role !== 'Admin') return { ok: false, error: 'Unauthorized' }
    try {
      const res = await fetch(`${getAPI()}/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data)
      })
      if (res.ok) {
        const updated = await res.json()
        setUsers(prev => prev.map(u => u.id === id ? updated : u))
        return { ok: true }
      } else {
        let msg = 'Failed to update user'
        try { const body = await res.json(); msg = body?.error || body?.message || msg } catch {}
        return { ok: false, error: msg, status: res.status }
      }
    } catch (e) {
      return { ok: false, error: String(e?.message || 'Failed to update user') }
    }
  }

  // Persist token & user changes in background as a safety net (e.g. when user role updates)
  useEffect(() => {
    try {
      if (token) sessionStorage.setItem('auth_token', token)
      else sessionStorage.removeItem('auth_token')
    } catch {}
  }, [token])
  useEffect(() => {
    try {
      if (user) sessionStorage.setItem('auth_user', JSON.stringify(user))
      else sessionStorage.removeItem('auth_user')
    } catch {}
  }, [user])

  const value = useMemo(() => ({ user, token, users, login, logout, addUser, removeUser, updateUser }), [user, token, users])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
