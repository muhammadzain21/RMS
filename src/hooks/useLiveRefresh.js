import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useBranch } from '../state/BranchContext.jsx'

function safeRun(fn, arg) {
  try {
    if (typeof fn !== 'function') return
    const result = fn(arg)
    if (result != null && typeof result.then === 'function') {
      result.catch(() => {})
    }
  } catch {
    // Never let a page refresh callback crash the app
  }
}

/**
 * Keep a page fresh for multi-branch + future offline/online sync.
 *
 * - Refetches on branch change, route entry, shared data rehydrate, and cloud sync
 * - Optional quiet polling while the tab is visible and the browser is online
 * - Swallows sync/async errors from the refetch callback
 */
export function useLiveRefresh(refetch, {
  intervalMs = 8000,
  enabled = true,
  skipWarehouse = true,
} = {}) {
  const { activeBranchId } = useBranch()
  const location = useLocation()
  const prevBranch = useRef(activeBranchId)
  const cb = useRef(refetch)
  cb.current = refetch

  const shouldSkip = () => {
    try {
      if (!enabled) return true
      if (skipWarehouse && String(location.pathname || '').startsWith('/warehouse')) return true
      return false
    } catch {
      return true
    }
  }

  const run = () => {
    try {
      if (shouldSkip()) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      safeRun(cb.current, activeBranchId)
    } catch {}
  }

  // Branch switch
  useEffect(() => {
    try {
      if (shouldSkip()) return
      if (prevBranch.current === activeBranchId) return
      prevBranch.current = activeBranchId
      run()
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, location.pathname, enabled, skipWarehouse])

  // Event-driven refresh (shared hydrate, navigation, sync, manual poke)
  useEffect(() => {
    if (shouldSkip()) return
    const onEvent = () => run()
    try {
      window.addEventListener('data_rehydrated', onEvent)
      window.addEventListener('route_changed', onEvent)
      window.addEventListener('active_branch_changed', onEvent)
      window.addEventListener('live_refresh', onEvent)
      window.addEventListener('epicspire:sync', onEvent)
      window.addEventListener('online', onEvent)
    } catch {}
    return () => {
      try {
        window.removeEventListener('data_rehydrated', onEvent)
        window.removeEventListener('route_changed', onEvent)
        window.removeEventListener('active_branch_changed', onEvent)
        window.removeEventListener('live_refresh', onEvent)
        window.removeEventListener('epicspire:sync', onEvent)
        window.removeEventListener('online', onEvent)
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, location.pathname, enabled, skipWarehouse])

  // Quiet polling while visible + online
  useEffect(() => {
    if (shouldSkip()) return
    if (!intervalMs || intervalMs < 2000) return
    const tick = () => {
      try {
        if (typeof document !== 'undefined' && document.hidden) return
        run()
      } catch {}
    }
    const id = setInterval(tick, intervalMs)
    const onVis = () => {
      try {
        if (typeof document !== 'undefined' && !document.hidden) run()
      } catch {}
    }
    try {
      document.addEventListener('visibilitychange', onVis)
    } catch {}
    return () => {
      clearInterval(id)
      try {
        document.removeEventListener('visibilitychange', onVis)
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, location.pathname, enabled, skipWarehouse, intervalMs])
}

/** @deprecated prefer useLiveRefresh — same behavior (polling + sync-aware) */
export function useRefetchOnBranchChange(refetch, opts) {
  return useLiveRefresh(refetch, opts)
}

/** Ask every live page + DataContext listeners to refresh now. */
export function pokeLiveRefresh(detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent('live_refresh', { detail }))
  } catch {}
}
