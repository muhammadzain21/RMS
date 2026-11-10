import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useBranch } from '../state/BranchContext.jsx'
import { isUserBusy } from '../utils/userBusy.js'

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
 * Page-level live data (lists / boards).
 *
 * Default: event-driven only (branch change, sync, visibility, online, live_refresh).
 * Opt into quiet polling with intervalMs (e.g. KDS / call-center boards).
 * Soft refreshes are skipped while the user is mid-edit (safety net).
 */
export function useLiveRefresh(refetch, {
  intervalMs = 0,
  enabled = true,
  skipWarehouse = true,
} = {}) {
  const { activeBranchId } = useBranch()
  const location = useLocation()
  const prevBranch = useRef(activeBranchId)
  const prevPath = useRef(location.pathname)
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

  const run = (opts = {}) => {
    try {
      if (shouldSkip()) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false && !opts.force) return
      if (!opts.force && isUserBusy()) return
      safeRun(cb.current, activeBranchId)
    } catch {}
  }

  // Route entry + branch switch
  useEffect(() => {
    try {
      if (shouldSkip()) return
      const pathChanged = prevPath.current !== location.pathname
      const branchChanged = prevBranch.current !== activeBranchId
      prevPath.current = location.pathname
      prevBranch.current = activeBranchId
      if (pathChanged || branchChanged) run({ force: true })
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, location.pathname, enabled, skipWarehouse])

  // Event-driven refresh
  useEffect(() => {
    if (shouldSkip()) return
    const onSoft = () => run()
    const onForce = () => run({ force: true })
    const onSync = (e) => {
      try {
        if (e?.detail?.ok === false) return
        run()
      } catch {}
    }
    const onVis = () => {
      try {
        if (typeof document !== 'undefined' && document.hidden) return
        run()
      } catch {}
    }
    try {
      window.addEventListener('data_rehydrated', onSoft)
      window.addEventListener('route_changed', onSoft)
      window.addEventListener('active_branch_changed', onForce)
      window.addEventListener('live_refresh', onSoft)
      window.addEventListener('epicspire:sync', onSync)
      window.addEventListener('online', onSoft)
      document.addEventListener('visibilitychange', onVis)
    } catch {}
    return () => {
      try {
        window.removeEventListener('data_rehydrated', onSoft)
        window.removeEventListener('route_changed', onSoft)
        window.removeEventListener('active_branch_changed', onForce)
        window.removeEventListener('live_refresh', onSoft)
        window.removeEventListener('epicspire:sync', onSync)
        window.removeEventListener('online', onSoft)
        document.removeEventListener('visibilitychange', onVis)
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, location.pathname, enabled, skipWarehouse])

  // Optional quiet poll — only when intervalMs is explicitly set (ops boards)
  useEffect(() => {
    if (shouldSkip()) return
    if (!intervalMs || intervalMs < 5000) return
    const tick = () => {
      try {
        if (typeof document !== 'undefined' && document.hidden) return
        run()
      } catch {}
    }
    const id = setInterval(tick, intervalMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, location.pathname, enabled, skipWarehouse, intervalMs])
}

/** @deprecated prefer useLiveRefresh */
export function useRefetchOnBranchChange(refetch, opts) {
  return useLiveRefresh(refetch, opts)
}

/** Ask live pages + DataContext to refresh now (respects busy lock). */
export function pokeLiveRefresh(detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent('live_refresh', { detail }))
  } catch {}
}
