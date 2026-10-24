import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useData } from '../state/DataContext.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { PanelLeft, PanelLeftClose, PanelLeftOpen, PanelLeftDashed, ChevronDown, LogOut } from 'lucide-react'
import { dashboardItem } from './navConfig.js'
import { isDashboardVisible, getVisibleSections } from './Sidebar.jsx'

export default function Header({ brand, onMenuClick, onCollapseClick, collapsed, user, canSell, onBlockedSellClick, logout, sidebarHidden, onToggleSidebarHidden }) {
 const { state, businessDate } = useData()
 const navigate = useNavigate()
 const [currentTime, setCurrentTime] = useState(new Date())
 const [licenseInfo, setLicenseInfo] = useState({ valid: true, daysRemaining: Infinity })
 const [openMenu, setOpenMenu] = useState(null)
 const navRef = useRef(null)

 // Close dropdown when clicking outside
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
  return (
   <NavLink to={item.to} end={item.end} onClick={() => setOpenMenu(null)}
    className={({ isActive }) => `${DD_ITEM} ${isActive ? DD_ACTIVE : DD_INACTIVE}`}>
    {item.icon ? <item.icon size={15} className="flex-shrink-0" /> : null}<span>{item.label}</span>
   </NavLink>
  )
 }

 useEffect(() => {
 const timer = setInterval(() => setCurrentTime(new Date()), 1000)
 return () => clearInterval(timer)
 }, [])

 // Listen for license status from main process and fetch initial status
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
 const warnText = showLicenseWarn ? `License expires in ${Number(licenseInfo.daysRemaining)} day${Number(licenseInfo.daysRemaining)===1?'':'s'}. Contact administrator.` : ''

 return (
 <header className="no-print sticky top-0 z-20 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 text-white shadow-lg px-3 sm:px-5 py-3">
 <div className="flex items-center justify-between"><div className="flex items-center gap-3">
 {/* Mobile menu button */}
 <button
 onClick={onMenuClick}
 className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
 title="Open menu"
 ><PanelLeft size={20} /></button>
 {/* Desktop collapse button */}
 {!sidebarHidden && (
 <button
 onClick={onCollapseClick}
 className="hidden md:inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors text-xs"
 title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
 >
 {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
 </button>
 )}
 {/* Hide/show sidebar button */}
 <button
 onClick={onToggleSidebarHidden}
 className="hidden md:inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors text-xs"
 title={sidebarHidden ? 'Show sidebar' : 'Hide sidebar (nav moves to header)'}
 >
 {sidebarHidden ? <PanelLeftOpen size={18} /> : <PanelLeftDashed size={18} />}
 </button><div className="md:hidden font-bold text-white drop-shadow">{brand}</div><div className="hidden md:block text-lg font-bold tracking-tight text-white drop-shadow">{brand}</div></div><div className="flex items-center gap-3"><div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/20 backdrop-blur text-xs"><span className="text-white/80 font-medium">Business Date:</span><span className="font-bold text-white">{businessDate || new Date().toISOString().slice(0, 10)}</span><span className={`ml-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${state?.daybook?.open ? 'bg-emerald-400 text-emerald-900' : 'bg-gray-300 text-gray-700'}`}>
 {state?.daybook?.open ? ' Open' : ' Closed'}
 </span></div>
 {showLicenseWarn && (
   <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/30 backdrop-blur text-xs border border-amber-300 text-white/95 font-semibold">
     {warnText}
   </div>
 )}
 <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/20 backdrop-blur text-xs" title="System Time"><span className="font-mono font-bold text-white">
 {currentTime.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
 </span><span className="text-white/60 text-[10px]">
 {Intl.DateTimeFormat().resolvedOptions().timeZone}
 </span></div> {sidebarHidden && (
 <button
 onClick={() => { logout(); navigate('/login') }}
 title="Log out"
 className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors"
 >
 <LogOut size={14} /> Log Out
 </button>
 )}
 <div className="bg-white/20 rounded-lg p-1"><ThemeToggle /></div></div></div>

 {/* Section nav shown when sidebar is hidden */}
 {sidebarHidden && (
 <nav ref={navRef} className="hidden md:flex items-center gap-1 mt-3 pt-3 border-t border-white/20">
 {dashboardVisible && (
 <NavLink to={dashboardItem.path} end
  className={({ isActive }) => `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${isActive ? 'bg-white text-blue-700 shadow' : 'text-white/90 hover:bg-white/20'}`}>
 {dashboardItem.icon ? <dashboardItem.icon size={15} /> : null}Dashboard
 </NavLink>
 )}
 {visibleSections.map(section => (
 <div key={section.label} className="relative">
 <button
  onClick={() => setOpenMenu(openMenu === section.label ? null : section.label)}
  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${openMenu === section.label ? 'bg-white text-blue-700 shadow' : 'text-white/90 hover:bg-white/20'}`}
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
