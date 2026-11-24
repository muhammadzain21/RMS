import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useAuth } from '@/state/AuthContext.jsx'
import { isAllBranches } from '@shared/utils/branchWorkspace.js'

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

/** Default branch for non-HQ: homeBranchId if valid, else first branch by name. */
function pickDefaultBranchId(branches, user) {
  const list = Array.isArray(branches) ? branches : []
  const home = user?.homeBranchId ? String(user.homeBranchId) : ''
  if (home && list.some(b => String(b._id) === home)) return home
  const sorted = [...list].sort((a, b) =>
    String(a?.name || a?.code || '').localeCompare(String(b?.name || b?.code || ''), undefined, { sensitivity: 'base' })
  )
  return sorted[0]?._id ? String(sorted[0]._id) : ''
}

function readStoredBranchId() {
  try { return String(localStorage.getItem('active_branch_id') || '') } catch { return '' }
}

export function BranchProvider({ children }) {
  const { user, token } = useAuth()
  const [branches, setBranches] = useState([])
  const [activeBranchId, setActiveBranchIdState] = useState(() => {
    const v = readStoredBranchId()
    // Sync immediately so the first API calls after reload attach the right X-Branch-Id
    try { if (typeof window !== 'undefined') window.ACTIVE_BRANCH_ID = v } catch {}
    return v
  })
  const [loading, setLoading] = useState(false)
  /** True after first branches fetch settles (or no token). Gate DataContext hydrate on this. */
  const [branchReady, setBranchReady] = useState(() => !token)
  const prevUserKey = useRef('')
  const bootstrappedUser = useRef('')

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
    // Keep a non-empty branch for background cloud sync when header is later set to All
    if (v) {
      try {
        localStorage.setItem('sync_last_branch_id', v)
        if (!localStorage.getItem('sync_home_branch_id') && user?.homeBranchId) {
          localStorage.setItem('sync_home_branch_id', String(user.homeBranchId))
        } else if (!localStorage.getItem('sync_home_branch_id')) {
          localStorage.setItem('sync_home_branch_id', v)
        }
      } catch {}
    }
  }

  useEffect(() => {
    if (!token || !user) {
      setBranches([])
      setBranchReady(true)
      return
    }
    let cancelled = false
    setBranchReady(false)
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
        const firstBootForUser = bootstrappedUser.current !== uk
        bootstrappedUser.current = uk

        const preferred = pickDefaultBranchId(next, user)
        const hq = isHq(user)
        const current = String(activeBranchId || '')

        if (!hq) {
          // Staff/Manager: always locked to home / first allowed
          if (preferred && current !== preferred) setActiveBranchId(preferred)
          else {
            // Ensure window + storage match even when React state already had the right id
            try {
              if (preferred) {
                localStorage.setItem('active_branch_id', preferred)
                window.ACTIVE_BRANCH_ID = preferred
              }
            } catch {}
          }
          return
        }

        // Admin / SuperAdmin: keep All or a still-valid selection; prefer per-user storage on boot
        let storedForUser = ''
        try { storedForUser = localStorage.getItem(`active_branch_id_u_${uk}`) || '' } catch {}
        const stillValid = !current || next.some(b => String(b._id) === current)
        const storedValid = storedForUser && next.some(b => String(b._id) === String(storedForUser))

        if (userChanged) {
          setActiveBranchId('')
          return
        }
        if (firstBootForUser && storedValid && current !== storedForUser) {
          // Reload / first paint: restore this admin's last working branch
          setActiveBranchId(storedForUser)
          return
        }
        if (current && !stillValid) {
          setActiveBranchId(storedValid ? storedForUser : '')
          return
        }
        // Keep window in sync for the already-selected branch (no React state change → no remount)
        try { window.ACTIVE_BRANCH_ID = current } catch {}
        // Empty All is intentional for Admin — do not auto-pick a branch.
      } catch {
        if (!cancelled) setBranches([])
      } finally {
        if (!cancelled) {
          setLoading(false)
          setBranchReady(true)
        }
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
    branchReady,
    isHq: isHq(user),
    isAllBranches: isAllBranches(activeBranchId),
    requireBranch: (message) => {
      if (!isAllBranches(activeBranchId)) return true
      toast.error(message || 'Select a branch in the header to continue')
      return false
    },
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
