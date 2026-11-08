import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext.jsx'

const BranchContext = createContext(null)

function getApi() {
  return (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
}

function userKey(user) {
  return String(user?.id || user?._id || user?.username || '')
}

function isHq(user) {
  return user?.role === 'Admin' || user?.role === 'SuperAdmin' || !!user?.isHq
}

/** Default header branch: homeBranchId if valid, else first branch by name. */
function pickDefaultBranchId(branches, user) {
  const list = Array.isArray(branches) ? branches : []
  const home = user?.homeBranchId ? String(user.homeBranchId) : ''
  if (home && list.some(b => String(b._id) === home)) return home
  const sorted = [...list].sort((a, b) =>
    String(a?.name || a?.code || '').localeCompare(String(b?.name || b?.code || ''), undefined, { sensitivity: 'base' })
  )
  return sorted[0]?._id ? String(sorted[0]._id) : ''
}

export function BranchProvider({ children }) {
  const { user, token } = useAuth()
  const [branches, setBranches] = useState([])
  const [activeBranchId, setActiveBranchIdState] = useState(() => {
    try { return localStorage.getItem('active_branch_id') || '' } catch { return '' }
  })
  const [loading, setLoading] = useState(false)
  const prevUserKey = useRef('')

  const setActiveBranchId = (id) => {
    const v = String(id || '')
    setActiveBranchIdState(v)
    try { localStorage.setItem('active_branch_id', v) } catch {}
    try {
      const uk = userKey(user)
      if (uk) localStorage.setItem(`active_branch_id_u_${uk}`, v)
    } catch {}
    if (typeof window !== 'undefined') {
      window.ACTIVE_BRANCH_ID = v
      window.dispatchEvent(new CustomEvent('active_branch_changed', { detail: v }))
    }
  }

  useEffect(() => {
    if (!token || !user) {
      setBranches([])
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`${getApi()}/api/branches`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const list = res.ok ? await res.json() : []
        if (cancelled) return
        const next = Array.isArray(list) ? list : []
        setBranches(next)

        const uk = userKey(user)
        const userChanged = prevUserKey.current && prevUserKey.current !== uk
        prevUserKey.current = uk

        const preferred = pickDefaultBranchId(next, user)
        const hq = isHq(user)

        if (!hq) {
          // Staff/Manager: always locked to home / first allowed
          if (preferred && String(activeBranchId) !== preferred) setActiveBranchId(preferred)
          return
        }

        // Admin / SuperAdmin:
        // - New login or user switch → home branch (else first by name)
        // - Same session refresh → keep current if still valid, else preferred
        let storedForUser = ''
        try { storedForUser = localStorage.getItem(`active_branch_id_u_${uk}`) || '' } catch {}
        const stillValid = next.some(b => String(b._id) === String(activeBranchId))
        const storedValid = storedForUser && next.some(b => String(b._id) === String(storedForUser))

        if (userChanged || !activeBranchId || !stillValid) {
          const nextId = (storedValid && !userChanged ? storedForUser : null) || preferred
          if (nextId) setActiveBranchId(nextId)
        }
      } catch {
        if (!cancelled) setBranches([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeBranchId read only for validity; set via setActiveBranchId
  }, [token, user?.id, user?._id, user?.username, user?.homeBranchId, user?.role])

  useEffect(() => {
    if (typeof window !== 'undefined') window.ACTIVE_BRANCH_ID = activeBranchId || ''
  }, [activeBranchId])

  const activeBranch = useMemo(
    () => branches.find(b => String(b._id) === String(activeBranchId)) || null,
    [branches, activeBranchId]
  )

  const value = {
    branches,
    activeBranchId,
    activeBranch,
    setActiveBranchId,
    loading,
    isHq: isHq(user),
    refresh: async () => {
      if (!token) return
      const res = await fetch(`${getApi()}/api/branches`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setBranches(await res.json())
    },
  }

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
}

export function useBranch() {
  const ctx = useContext(BranchContext)
  if (!ctx) throw new Error('useBranch must be used within BranchProvider')
  return ctx
}
