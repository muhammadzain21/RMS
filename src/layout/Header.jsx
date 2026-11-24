import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useData } from '@/state/DataContext.jsx'
import { useBranch } from '@/state/BranchContext.jsx'
import ThemeToggle from '@shared/components/ThemeToggle.jsx'
import { PanelLeft, PanelLeftClose, PanelLeftOpen, PanelLeftDashed, ChevronDown, LogOut, KeyRound, RefreshCw, Inbox } from 'lucide-react'
import { dashboardItem } from '@/layout/navConfig.js'
import { isDashboardVisible, getVisibleSections } from '@/layout/Sidebar.jsx'

export default function Header({ brand, onMenuClick, onCollapseClick, collapsed, user, canSell, onBlockedSellClick, logout, sidebarHidden, onToggleSidebarHidden, ccInboxCount = 0 }) {
  const { state, businessDate, rehydrate } = useData()
  const { branches, activeBranchId, activeBranch, setActiveBranchId } = useBranch()
  const [refreshing, setRefreshing] = useState(false)

  const onRefreshData = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      if (typeof rehydrate === 'function') await rehydrate()
      window.dispatchEvent(new CustomEvent('live_refresh'))
      toast.success('Data refreshed')
    } catch {
      toast.error('Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }
  const isHqUser = user?.role === 'Admin' || user?.role === 'SuperAdmin' || !!user?.isHq
  const staffBranchLabel = activeBranch?.name || activeBranch?.code
    || branches.find(b => String(b._id) === String(user?.homeBranchId || activeBranchId || ''))?.name
    || branches.find(b => String(b._id) === String(user?.homeBranchId || activeBranchId || ''))?.code
    || ''
  const navigate = useNavigate()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [licenseInfo, setLicenseInfo] = useState({ valid: true, daysRemaining: Infinity })
  const [openMenu, setOpenMenu] = useState(null)
  const navRef = useRef(null)

  useEffect(() => {
    const onDown = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const enabledPaths = state?.settings?.enabledPaths
  const visibleSections = getVisibleSections(user, enabledPaths)
  const dashboardVisible = isDashboardVisible(user, enabledPaths)
  const inboxBadge = Number(ccInboxCount) > 0 ? (Number(ccInboxCount) > 99 ? '99+' : String(ccInboxCount)) : ''

  const DD_ITEM = 'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full text-left'
  const DD_INACTIVE = 'text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-700'
  const DD_ACTIVE = 'bg-blue-600 text-white'

  const DropItem = ({ item }) => {
    if (item.gated && !canSell) {
      return (
        <button onClick={(e) => { setOpenMenu(null); onBlockedSellClick(e) }}
          className={`${DD_ITEM} text-gray-400 dark:text-gray-500 cursor-not-allowed italic`}>
          {item.icon ? <item.icon size={15} className="flex-shrink-0" /> : null}<span>{item.label} (Locked)</span>
        </button>
      )
    }
    const showBadge = item.to === '/sales/cc-inbox' && inboxBadge
    return (
      <NavLink to={item.to} end={item.end} onClick={() => setOpenMenu(null)}
        className={({ isActive }) => `${DD_ITEM} ${isActive ? DD_ACTIVE : DD_INACTIVE}`}>
        {item.icon ? <item.icon size={15} className="flex-shrink-0" /> : null}
        <span className="flex-1 flex items-center justify-between gap-2 min-w-0">
          <span className="truncate">{item.label}</span>
          {showBadge ? (
            <span className="shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-400 text-[10px] font-extrabold text-slate-900 flex items-center justify-center tabular-nums">{inboxBadge}</span>
          ) : null}
        </span>
      </NavLink>
    )
  }

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let off
    ;(async () => {
      try {
        if (window.license?.getStatus) {
          const st = await window.license.getStatus()
          if (st) setLicenseInfo(st)
        }
        if (window.license?.onStatus) {
          off = window.license.onStatus(st => { if (st) setLicenseInfo(st) })
        }
      } catch {}
    })()
    return () => { try { off && off() } catch {} }
  }, [])

  const showLicenseWarn = !!licenseInfo?.valid && licenseInfo?.daysRemaining !== Infinity && Number(licenseInfo.daysRemaining) <= 14
  const warnText = showLicenseWarn ? `License expires in ${Number(licenseInfo.daysRemaining)} day${Number(licenseInfo.daysRemaining) === 1 ? '' : 's'}. Click to renew.` : ''
  const showLicenseBtn = typeof window !== 'undefined' && !!window.license && licenseInfo && !licenseInfo.dev
  const licenseBtnTitle = licenseInfo?.daysRemaining === Infinity
    ? 'License: permanent — click to update'
    : `License: ${Number(licenseInfo?.daysRemaining)} day${Number(licenseInfo?.daysRemaining) === 1 ? '' : 's'} remaining — click to update`
  const openLicenseDialog = () => window.dispatchEvent(new CustomEvent('app:open-license-dialog'))

  const bizDate = businessDate || new Date().toISOString().slice(0, 10)
  const dayOpen = !!state?.daybook?.open

  return (
    <header className="no-print sticky top-0 z-20 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 text-white shadow-lg px-2 sm:px-3 lg:px-4 app-header-safe overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 min-h-[2.5rem]">
        {/* Left controls + brand */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 basis-[12rem]">
          <button
            onClick={onMenuClick}
            className="md:hidden inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors touch-manipulation"
            title="Open menu"
          >
            <PanelLeft size={18} />
          </button>
          {!sidebarHidden && (
            <button
              onClick={onCollapseClick}
              className="hidden md:inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          )}
          <button
            onClick={onToggleSidebarHidden}
            className="hidden md:inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
            title={sidebarHidden ? 'Show sidebar' : 'Hide sidebar (nav moves to header)'}
          >
            {sidebarHidden ? <PanelLeftOpen size={16} /> : <PanelLeftDashed size={16} />}
          </button>
          <div className="min-w-0 flex-1 truncate font-bold text-white drop-shadow text-sm sm:text-base lg:text-lg tracking-tight" title={brand}>
            {brand}
          </div>
          <button
            type="button"
            onClick={onRefreshData}
            disabled={refreshing}
            title="Refresh app data (no page reload)"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors disabled:opacity-60 touch-manipulation shrink-0"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => navigate('/sales/cc-inbox')}
            title={inboxBadge ? `${inboxBadge} remaining call-center order(s)` : 'CC Inbox'}
            className={`relative inline-flex items-center justify-center gap-1.5 min-h-8 px-2 sm:px-2.5 rounded-lg text-white transition-colors touch-manipulation shrink-0 ${
              inboxBadge
                ? 'bg-amber-400 text-slate-900 hover:bg-amber-300 font-bold animate-pulse'
                : 'bg-white/20 hover:bg-white/30'
            }`}
          >
            <Inbox size={15} />
            <span className="hidden sm:inline text-xs font-semibold">CC Inbox</span>
            {inboxBadge ? (
              <span className={`text-[10px] font-extrabold tabular-nums ${inboxBadge ? 'text-slate-900' : ''}`}>
                {inboxBadge}
              </span>
            ) : null}
          </button>
        </div>

        {/* Right meta — wraps instead of overlapping brand */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-2 min-w-0 flex-[1_1_18rem] flex-wrap">
          {isHqUser && branches.length > 0 ? (
            <label className="flex items-center gap-1 min-w-0 max-w-[9.5rem] sm:max-w-[12rem] lg:max-w-[14rem]" title="Header branch wins over page filters">
              <span className="hidden xl:inline text-[10px] font-semibold text-white/80 whitespace-nowrap">Working as</span>
              <select
                value={activeBranchId || ''}
                onChange={(e) => setActiveBranchId(e.target.value)}
                title="Working as — preferred over page branch filters"
                className="min-w-0 w-full truncate rounded-lg border-0 bg-white/25 px-2 py-1.5 text-xs font-bold text-white outline-none shadow-sm"
              >
                <option value="" className="text-slate-900">All branches</option>
                {branches.map(b => (
                  <option key={b._id} value={b._id} className="text-slate-900">{b.name || b.code}</option>
                ))}
              </select>
            </label>
          ) : staffBranchLabel ? (
            <span
              className="inline-flex items-center gap-1 min-w-0 max-w-[8.5rem] sm:max-w-[11rem] truncate rounded-lg bg-emerald-400/25 px-2 py-1.5 text-xs font-bold text-white shadow-sm border border-white/20"
              title={`Logged in branch: ${staffBranchLabel}`}
            >
              <span className="hidden lg:inline text-[10px] font-semibold text-white/80 whitespace-nowrap shrink-0">Branch</span>
              <span className="truncate">{staffBranchLabel}</span>
            </span>
          ) : null}

          <div
            className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/20 backdrop-blur text-[11px] sm:text-xs shrink-0"
            title={`Business Date: ${bizDate}`}
          >
            <span className="hidden lg:inline text-white/80 font-medium">Date</span>
            <span className="font-bold text-white tabular-nums">{bizDate}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${dayOpen ? 'bg-emerald-400 text-emerald-900' : 'bg-slate-500 text-white'}`}>
              {dayOpen ? 'Open' : 'Closed'}
            </span>
          </div>

          {showLicenseWarn && (
            <button
              onClick={openLicenseDialog}
              title={licenseBtnTitle}
              className="hidden 2xl:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/30 backdrop-blur text-xs border border-amber-300 text-white/95 font-semibold hover:bg-amber-500/50 transition-colors"
            >
              {warnText}
            </button>
          )}
          {showLicenseBtn && (
            <button
              onClick={openLicenseDialog}
              title={licenseBtnTitle}
              className="hidden xl:flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors shrink-0"
            >
              <KeyRound size={15} />
            </button>
          )}

          <div
            className="hidden xl:flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/20 backdrop-blur text-xs shrink-0"
            title="System Time"
          >
            <span className="font-mono font-bold text-white tabular-nums">
              {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}
            </span>
          </div>

          {user?.username || user?.name ? (
            <div
              className="hidden md:flex items-center px-2 py-1.5 rounded-lg bg-white/15 text-xs font-semibold text-white/95 max-w-[7rem] lg:max-w-[9rem] truncate shrink-0"
              title={user.username || user.name}
            >
              {user.username || user.name}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => { logout(); navigate('/login') }}
            title="Log out"
            className="inline-flex items-center justify-center gap-1 min-h-9 min-w-9 sm:min-w-0 px-2 sm:px-2.5 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors touch-manipulation shrink-0"
          >
            <LogOut size={15} /> <span className="hidden sm:inline">Log Out</span>
          </button>
          <div className="bg-white/20 rounded-lg p-0.5 shrink-0"><ThemeToggle /></div>
        </div>
      </div>

      {sidebarHidden && (
        <nav ref={navRef} className="hidden md:flex items-center gap-1 mt-2 pt-2 border-t border-white/20 overflow-x-auto">
          {dashboardVisible && (
            <NavLink to={dashboardItem.path} end
              className={({ isActive }) => `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${isActive ? 'bg-white text-blue-700 shadow' : 'text-white/90 hover:bg-white/20'}`}>
              {dashboardItem.icon ? <dashboardItem.icon size={15} /> : null}Dashboard
            </NavLink>
          )}
          {visibleSections.map(section => (
            <div key={section.label} className="relative shrink-0">
              <button
                onClick={() => setOpenMenu(openMenu === section.label ? null : section.label)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${openMenu === section.label ? 'bg-white text-blue-700 shadow' : 'text-white/90 hover:bg-white/20'}`}
              >
                {section.label}<ChevronDown size={14} className={`transition-transform ${openMenu === section.label ? 'rotate-180' : ''}`} />
              </button>
              {openMenu === section.label && (
                <div className="absolute left-0 top-full mt-1 w-56 max-h-[70vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xl p-1.5 z-50">
                  {section.items.map(item => <DropItem key={item.to} item={item} />)}
                </div>
              )}
            </div>
          ))}
        </nav>
      )}
    </header>
  )
}
