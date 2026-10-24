import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { useAuth } from '../state/AuthContext.jsx'
import { useData } from '../state/DataContext.jsx'
import Header from './Header.jsx'
import Sidebar from './Sidebar.jsx'

export default function Layout() {
  const { user, logout } = useAuth()
  const { state } = useData()
  const brand = state?.settings?.companyName || 'Restaurant POS'

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

  if (!user) return <Outlet />

  const canSell = Boolean(state?.daybook?.open)
  const onBlockedSellClick = (e) => {
    e.preventDefault()
    toast.error('Selling is locked. Please open the day from Day Opening to continue.')
  }

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-900">
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

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
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
        <main className="p-2 sm:p-3 overflow-x-auto flex-1">
          <Outlet />
        </main>
      </div>

      <Toaster position="top-right" />
    </div>
  )
}
