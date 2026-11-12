import { Outlet, useLocation, NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { MapPin } from 'lucide-react'
import { useAuth } from '../state/AuthContext.jsx'
import { useData } from '../state/DataContext.jsx'
import { useBranch } from '../state/BranchContext.jsx'
import { useRiderLocation } from '../state/RiderLocationContext.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import Header from './Header.jsx'
import Sidebar from './Sidebar.jsx'

export default function Layout() {
  const { user, logout } = useAuth()
  const { state, rehydrate } = useData()
  const { activeBranchId } = useBranch()
  const location = useLocation()
  const brand = state?.settings?.companyName || 'Restaurant POS'
  const riderShare = useRiderLocation()
  const sharingLive = Boolean(riderShare?.sharing || riderShare?.reconnecting)

  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarHidden, setSidebarHidden] = useState(() => {
    try { return localStorage.getItem('sidebarHidden') === '1' } catch { return false }
  })
  const toggleSidebarHidden = () => {
    setSidebarHidden(v => {
      const next = !v
      try { localStorage.setItem('sidebarHidden', next ? '1' : '0') } catch {}
      return next
    })
  }

  // Fresh shared data whenever the user navigates to another page
  useEffect(() => {
    if (!user) return
    try {
      const p = rehydrate?.()
      if (p != null && typeof p.then === 'function') p.catch(() => {})
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent('route_changed', {
        detail: { path: location.pathname, branchId: activeBranchId || '' },
      }))
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on route change; branch handled by DataContext + Outlet key
  }, [user, location.pathname])

  const toaster = (
    <Toaster
      position="top-right"
      toastOptions={{
        className: 'dark:bg-slate-800 dark:text-slate-100',
        style: {
          background: 'var(--color-surface)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
        },
      }}
    />
  )

  if (!user) {
    return (
      <>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
        {toaster}
      </>
    )
  }

  const canSell = Boolean(state?.daybook?.open)
  const onBlockedSellClick = (e) => {
    e.preventDefault()
    toast.error('Selling is locked. Please open the day from Day Opening to continue.')
  }

  // Remount when route OR header branch changes — except Call Center pages (always cross-branch)
  const crossBranchPage = /^\/(call-center|sales\/cc-inbox)\/?$/.test(location.pathname)
  const pageKey = crossBranchPage
    ? location.pathname
    : `${location.pathname}::${activeBranchId || 'none'}`

  return (
    <div className="min-h-[100dvh] flex bg-transparent">
      <Sidebar
        user={user}
        brand={brand}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        canSell={canSell}
        onBlockedSellClick={onBlockedSellClick}
        logout={logout}
        hidden={sidebarHidden}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-[100dvh] h-[100dvh] overflow-y-auto bg-transparent">
        <Header
          brand={brand}
          onMenuClick={() => setMobileOpen(true)}
          onCollapseClick={() => setCollapsed(v => !v)}
          collapsed={collapsed}
          user={user}
          canSell={canSell}
          onBlockedSellClick={onBlockedSellClick}
          logout={logout}
          sidebarHidden={sidebarHidden}
          onToggleSidebarHidden={toggleSidebarHidden}
        />
        <main className="px-4 py-4 sm:px-6 sm:py-6 overflow-x-auto flex-1 bg-transparent pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <ErrorBoundary key={pageKey}>
            <Outlet key={pageKey} />
          </ErrorBoundary>
        </main>
      </div>

      {sharingLive && location.pathname !== '/rider' ? (
        <NavLink
          to="/rider"
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] right-4 z-[60] inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-white shadow-lg shadow-blue-600/30"
        >
          <MapPin className="h-3.5 w-3.5" />
          {riderShare?.minimized
            ? 'Sharing while minimized…'
            : riderShare?.reconnecting
              ? 'GPS reconnecting…'
              : 'Location sharing on'}
        </NavLink>
      ) : null}

      {toaster}
    </div>
  )
}
