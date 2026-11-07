import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext.jsx'

const BranchContext = createContext(null)

function getApi() {
  return (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
}

export function BranchProvider({ children }) {
  const { user, token } = useAuth()
  const [branches, setBranches] = useState([])
  const [activeBranchId, setActiveBranchIdState] = useState(() => {
    try { return localStorage.getItem('active_branch_id') || '' } catch { return '' }
  })
  const [loading, setLoading] = useState(false)

  const setActiveBranchId = (id) => {
    const v = String(id || '')
    setActiveBranchIdState(v)
    try { localStorage.setItem('active_branch_id', v) } catch {}
    if (typeof window !== 'undefined') {
      window.ACTIVE_BRANCH_ID = v
      window.dispatchEvent(new CustomEvent('active_branch_changed', { detail: v }))
    }
  }

  useEffect(() => {
    if (!token) {
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
        const home = user?.homeBranchId ? String(user.homeBranchId) : ''
        const hq = user?.role === 'Admin' || user?.role === 'SuperAdmin' || !!user?.isHq
        // Non-HQ users stay on their home/allowed branch (ignore stale admin localStorage)
        if (!hq && home && next.some(b => String(b._id) === home)) {
          if (String(activeBranchId) !== home) setActiveBranchId(home)
        } else {
          const stillValid = next.some(b => String(b._id) === String(activeBranchId))
          if (!stillValid) {
            const preferred = (home && next.some(b => String(b._id) === home))
              ? home
              : (next[0]?._id ? String(next[0]._id) : '')
            if (preferred) setActiveBranchId(preferred)
          } else if (!activeBranchId && next[0]?._id) {
            setActiveBranchId(String(next[0]._id))
          }
        }
      } catch {
        if (!cancelled) setBranches([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token, user?.homeBranchId])

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
    isHq: !!user?.isHq,
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
