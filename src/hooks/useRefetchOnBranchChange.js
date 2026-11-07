import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useBranch } from '../state/BranchContext.jsx'

/**
 * Re-run `refetch` when the header branch changes, shared data rehydrates,
 * or the user navigates to this page again.
 * Skips warehouse pages (HQ-global, no branch scope) unless skipWarehouse=false.
 */
export function useRefetchOnBranchChange(refetch, { skipWarehouse = true } = {}) {
  const { activeBranchId } = useBranch()
  const location = useLocation()
  const prev = useRef(activeBranchId)
  const cb = useRef(refetch)
  cb.current = refetch

  useEffect(() => {
    if (skipWarehouse && String(location.pathname || '').startsWith('/warehouse')) return
    if (prev.current === activeBranchId) return
    prev.current = activeBranchId
    if (typeof cb.current === 'function') cb.current(activeBranchId)
  }, [activeBranchId, location.pathname, skipWarehouse])

  useEffect(() => {
    if (skipWarehouse && String(location.pathname || '').startsWith('/warehouse')) return
    const run = () => {
      if (typeof cb.current === 'function') cb.current(activeBranchId)
    }
    window.addEventListener('data_rehydrated', run)
    window.addEventListener('route_changed', run)
    window.addEventListener('active_branch_changed', run)
    return () => {
      window.removeEventListener('data_rehydrated', run)
      window.removeEventListener('route_changed', run)
      window.removeEventListener('active_branch_changed', run)
    }
  }, [activeBranchId, location.pathname, skipWarehouse])
}
