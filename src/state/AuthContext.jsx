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
  const [token, setToken] = useState(() => {
    try { return sessionStorage.getItem('auth_token') || '' } catch { return '' }
  })
  const [users, setUsers] = useState([])

  // No localStorage persistence; token and user live in memory only

  // Refresh current user from token on load — stored sessionStorage user is
  // only a first-paint hint; server response is the source of truth for
  // permissions (roles, per-staff toggles can change between sessions).
  useEffect(() => {
    if (!token) return
    let cancelled = false
    const restore = async () => {
      try {
        const res = await fetch(`${getAPI()}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled && data?.user) {
            setUser(data.user)
            try {
              const u = data.user
              const hq = u?.role === 'Admin' || u?.role === 'SuperAdmin' || !!u?.isHq
              if (!hq && u?.staffId) {
                const branchId = String(u.homeBranchId || '')
                const current = String(localStorage.getItem('active_branch_id') || '')
                const allowed = new Set([
                  ...(Array.isArray(u.branchIds) ? u.branchIds : []),
                  u.homeBranchId,
                ].filter(Boolean).map(String))
                if (!current || (allowed.size && !allowed.has(current))) {
                  localStorage.setItem('active_branch_id', branchId)
                  window.ACTIVE_BRANCH_ID = branchId
                  window.dispatchEvent(new CustomEvent('active_branch_changed', { detail: branchId }))
                }
              }
            } catch {}
          }
        } else if (res.status === 401 && !cancelled) {
          // Stale/invalid token — force re-login
          setUser(null)
          setToken('')
          sessionStorage.removeItem('auth_token')
          sessionStorage.removeItem('auth_user')
        }
      } catch {}
    }
    restore()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const refreshUsers = async (branchIdOverride) => {
    if (!token || !user) return []
    try {
      const hq = user.role === 'Admin' || user.role === 'SuperAdmin' || !!user.isHq
      let branchId = branchIdOverride !== undefined
        ? String(branchIdOverride || '')
        : (
          (typeof window !== 'undefined' && (window.ACTIVE_BRANCH_ID || localStorage.getItem('active_branch_id')))
          || user.homeBranchId
          || ''
        )
      // Managers always scope to a branch they own
      if (!hq) {
        const allowed = [
          ...(Array.isArray(user.branchIds) ? user.branchIds : []),
          user.homeBranchId,
        ].filter(Boolean).map(String)
        if (!branchId || (allowed.length && !allowed.includes(String(branchId)))) {
          branchId = user.homeBranchId || allowed[0] || ''
        }
      }
      const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
      const res = await fetch(`${getAPI()}/api/users${qs}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const list = await res.json()
        setUsers(list)
        return list
      }
      // Fallback: ask server to filter by actor branches
      if (!hq && res.status === 403) {
        const r2 = await fetch(`${getAPI()}/api/users`, { headers: { Authorization: `Bearer ${token}` } })
        if (r2.ok) {
          const list = await r2.json()
          setUsers(list)
          return list
        }
      }
    } catch {}
    return []
  }

  // Hydrate users list for anyone who can open User Management (API enforces branch scope)
  useEffect(() => {
    refreshUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.role, user?.isHq, user?.homeBranchId])

  const login = async (username, password) => {
    const userName = String(username || '').trim()
    const pass = String(password || '')
    const tryLogin = async (base) => {
      const url = `${String(base || '').replace(/\/+$/, '')}/api/auth/login`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userName, password: pass }),
      })
      const data = await res.json().catch(() => ({}))
      return { res, data }
    }
    try {
      let base = getAPI()
      let { res, data } = await tryLogin(base)
      // Electron DEV only: if no intentional remote URL and local works, fall back once.
      // Never overwrite a user-saved LAN/online URL from the Administrator panel.
      if (!res.ok) {
        const local = 'http://localhost:5000'
        const current = String(base || '').replace(/\/+$/, '')
        let saved = ''
        try { saved = String(localStorage.getItem('server_url') || '').replace(/\/+$/, '') } catch {}
        const isElectron = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)
        const isDev = !!import.meta.env.DEV
        const userPinnedRemote = saved && saved !== local && !/localhost|127\.0\.0\.1/i.test(saved)
        if (isElectron && isDev && !userPinnedRemote && current !== local) {
          try {
            const retry = await tryLogin(local)
            if (retry.res.ok) {
              base = local
              res = retry.res
              data = retry.data
              try {
                if (typeof window.setAPIBase === 'function') window.setAPIBase(local)
                else {
                  localStorage.setItem('server_url', local)
                  window.API_BASE = local
                  window.dispatchEvent(new CustomEvent('server_url_changed', { detail: local }))
                }
              } catch {}
            }
          } catch {}
        }
      }
      if (res.ok && data?.token && data?.user) {
        setToken(data.token)
        setUser(data.user)
        sessionStorage.setItem('auth_token', data.token)
        sessionStorage.setItem('auth_user', JSON.stringify(data.user))
        // Admin/HQ: reset header workspace to All branches on login
        try {
          const u = data.user
          const hq = u?.role === 'Admin' || u?.role === 'SuperAdmin' || !!u?.isHq
          // Staff must not keep an admin branch in the header — that header is sent
          // on every API call and comes back 403 Forbidden.
          const branchId = hq ? '' : String(u?.homeBranchId || '')
          localStorage.setItem('active_branch_id', branchId)
          const uk = String(u?.id || u?._id || u?.username || '')
          if (uk) localStorage.setItem(`active_branch_id_u_${uk}`, branchId)
          if (typeof window !== 'undefined') {
            window.ACTIVE_BRANCH_ID = branchId
            window.dispatchEvent(new CustomEvent('active_branch_changed', { detail: branchId }))
          }
        } catch {}
        return { ok: true, user: data.user }
      }
      return { ok: false, error: data?.error || 'Invalid credentials' }
    } catch (e) {
      return { ok: false, error: 'Cannot reach server. Check server URL / connection.' }
    }
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
    // Drop staff/admin branch header so post-logout /api/settings is not Forbidden
    try {
      localStorage.setItem('active_branch_id', '')
      if (typeof window !== 'undefined') {
        window.ACTIVE_BRANCH_ID = ''
        window.dispatchEvent(new CustomEvent('active_branch_changed', { detail: '' }))
      }
    } catch {}
  }

  const canManageUsers = () => !!(token && user)

  const addUser = async (u) => {
    if (!canManageUsers()) return { ok: false, error: 'Unauthorized' }
    try {
      const res = await fetch(`${getAPI()}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(u) })
      if (res.ok) {
        const created = await res.json()
        setUsers(prev => [...prev, created])
        try {
          const branchId = (typeof window !== 'undefined' && (window.ACTIVE_BRANCH_ID || localStorage.getItem('active_branch_id'))) || user?.homeBranchId || ''
          const qs = branchId && user?.role !== 'Admin' && user?.role !== 'SuperAdmin' && !user?.isHq
            ? `?branchId=${encodeURIComponent(branchId)}`
            : ''
          const r = await fetch(`${getAPI()}/api/users${qs}`, { headers: { Authorization: `Bearer ${token}` } })
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
    if (!canManageUsers()) return { ok: false, error: 'Unauthorized' }
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
    if (!canManageUsers()) return { ok: false, error: 'Unauthorized' }
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

  const value = useMemo(
    () => ({ user, token, users, login, logout, addUser, removeUser, updateUser, refreshUsers }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, token, users]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
