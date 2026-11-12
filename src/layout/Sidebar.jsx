import { NavLink, useNavigate } from 'react-router-dom'
import { dashboardItem, navSections, myWorkNavItems, expandEnabledPaths } from './navConfig.js'
import { LogOut, X, Menu as MenuIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { useData } from '../state/DataContext.jsx'

// ─── Tailwind token strings ─────────────────────────────────────────────────
const SB_BG = 'bg-gradient-to-b from-[#0f2d5c] via-[#0c2449] to-[#0a1e3c]'
const SB_BORDER = 'border-white/10'
const SB_ITEM_BASE = 'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[0.9375rem] font-medium transition-all duration-150 cursor-pointer w-full'
const SB_ITEM_INACTIVE = 'text-slate-300 hover:bg-white/10 hover:text-white'
const SB_ITEM_ACTIVE = 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
const SB_SECTION_LABEL = 'px-3 pt-3 pb-1 text-[11px] font-semibold tracking-widest uppercase text-sky-200/50 select-none'
const SB_SECTION_WAREHOUSE = 'px-3 pt-3 pb-1 text-[11px] font-bold tracking-widest uppercase text-cyan-300/80 select-none'

// ─── Permission helpers ───────────────────────────────────────────────────
// enabledPaths = superadmin-managed feature access (null/empty array = all enabled)
const isEnabled = (enabledPaths, path) =>
 !Array.isArray(enabledPaths) || enabledPaths.length === 0 || enabledPaths.includes(path)

export function isDashboardVisible(user, enabledPaths) {
 enabledPaths = expandEnabledPaths(enabledPaths)
 // Admin / SuperAdmin always see everything
 if (user?.role === 'SuperAdmin' || user?.role === 'Admin') return true
 if (!isEnabled(enabledPaths, '/')) return false
 if (user?.permissions && Array.isArray(user.permissions)) {
 return user.permissions.some(p => p.path === '/' && p.visible)
 }
 return false
}

function withStaffMyWork(sections, user) {
 const pages = Array.isArray(user?.myWorkPages) ? user.myWorkPages : []
 // Granted in Add Staff. These paths are not in the installation feature list,
 // so they must not disappear once settings.enabledPaths loads.
 const showMyWork = Boolean(user?.staffId) && pages.length > 0
 if (!showMyWork) return sections.filter(s => s.label !== 'My Work')
 const rest = sections.filter(s => s.label !== 'My Work')
 const allowed = new Set(pages)
 return [{
  label: 'My Work',
  items: myWorkNavItems
   .filter(i => allowed.has(i.path))
   .map(i => ({ to: i.path, label: i.label, icon: i.icon, end: i.end })),
 }, ...rest].filter(s => s.items.length > 0)
}

export function getVisibleSections(user, enabledPaths) {
 enabledPaths = expandEnabledPaths(enabledPaths)
 const sections = navSections()
 // Admin / SuperAdmin always get every page
 if (user?.role === 'SuperAdmin' || user?.role === 'Admin') {
 return withStaffMyWork(sections, user)
 }
 if (user?.permissions && Array.isArray(user.permissions)) {
 const allowedPaths = new Set(user.permissions.filter(p => p.visible && p.path !== '/my').map(p => p.path))
 const roleName = String(user?.role || '')
 if (roleName === 'Manager') {
  for (const p of ['/warehouse/stock', '/warehouse/suppliers', '/warehouse/purchase-history', '/warehouse/purchases', '/warehouse/demands', '/warehouse/transfers', '/warehouse/transfer-history', '/warehouse/finance']) {
   if (!allowedPaths.has(p)) {
    const perm = user.permissions.find(x => x.path === p)
    if (!perm || perm.visible !== false) allowedPaths.add(p)
   }
  }
 }
 return withStaffMyWork(
  sections
   .map(s => ({ ...s, items: s.items.filter(i => i.to !== '/my' && allowedPaths.has(i.to) && isEnabled(enabledPaths, i.to)) }))
   .filter(s => s.items.length > 0),
  user
 )
 }
 return withStaffMyWork([], user)
}

// ─── Sidebar component ────────────────────────────────────────────────────
export default function Sidebar({ user, brand, collapsed, setCollapsed, mobileOpen, setMobileOpen, canSell, onBlockedSellClick, logout, hidden }) {
 const navigate = useNavigate()
 const { state } = useData()
 const enabledPaths = state?.settings?.enabledPaths

 const dashboardVisible = isDashboardVisible(user, enabledPaths)
 const visibleSections = getVisibleSections(user, enabledPaths)

 const Icon = ({ icon: Ic, size = 18 }) => Ic ? <Ic size={size} className="flex-shrink-0" /> : null

const NavItem = ({ item, onClick }) => {
 if (item.gated && !canSell) {
 return (
 <button
 onClick={onBlockedSellClick}
 className={`${SB_ITEM_BASE} ${collapsed ? 'justify-center px-0' : ''} text-slate-600 dark:text-gray-600 cursor-not-allowed italic`}
 title={collapsed ? item.label : 'Daybook closed — open the day first'}
 ><Icon icon={item.icon} />
 {!collapsed && <span>{item.label} (Locked)</span>}
 </button>
 )
 }
 return (
 <NavLink
 to={item.to}
 onClick={onClick}
 end={item.end}
 title={collapsed ? item.label : undefined}
 className={({ isActive }) =>
 `${SB_ITEM_BASE} ${collapsed ? 'justify-center px-0' : ''} ${isActive ? SB_ITEM_ACTIVE : SB_ITEM_INACTIVE}`
 }
 ><Icon icon={item.icon} />
 {!collapsed && <span>{item.label}</span>}
 </NavLink>
 )
 }

 return (
 <>
 {/* ── DESKTOP SIDEBAR ── */}
 {!hidden && (
 <aside
 className={`
 no-print hidden md:flex flex-none flex-col
 ${collapsed ? 'md:w-[4.5rem] min-w-[4.5rem]' : 'md:w-60 min-w-[15rem]'}
 sticky top-0 h-[100dvh] overflow-y-auto overflow-x-visible app-drawer-safe
 ${SB_BG} border-r ${SB_BORDER}
 transition-[width] duration-200 z-[1000]
 `}
 >
 {/* Brand */}
 <div className={`flex items-center gap-3 px-4 py-4 border-b ${SB_BORDER} flex-shrink-0 ${collapsed ? 'justify-center' : ''}`}><div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/40"><span className="text-white text-sm font-bold leading-none">
 {(brand?.[0] || 'R').toUpperCase()}
 </span></div>
 {!collapsed && (
 <div><div className="text-sm font-bold text-white leading-tight tracking-wide truncate max-w-[160px]">{brand}</div><div className="text-[11px] text-slate-400 dark:text-gray-400 font-medium tracking-wider uppercase">POS System</div></div>
 )}
 </div>

 {/* Nav */}
 <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
 {/* Dashboard */}
 {dashboardVisible && (
 <NavItem item={{ to: dashboardItem.path, label: dashboardItem.label, icon: dashboardItem.icon }} />
 )}

 {/* Grouped sections */}
 {visibleSections.map(section => (
 <div key={section.label} className="pt-1">
 {!collapsed && (
 <div className={section.label === 'Warehouse' ? SB_SECTION_WAREHOUSE : SB_SECTION_LABEL}>{section.label}</div>
 )}
 {section.items.map(item => (
 <NavItem key={item.to} item={item} />
 ))}
 </div>
 ))}
 </nav>

 {/* Footer */}
 <div className={`flex-shrink-0 border-t ${SB_BORDER} px-2 py-3`}>
 {collapsed ? (
 <div className="flex flex-col items-center gap-2"><button
 onClick={() => { logout(); navigate('/login') }}
 title="Logout"
 className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-500 text-white hover:bg-red-600 transition-colors"
 ><LogOut size={18} /></button></div>
 ) : (
 <div className="flex items-center justify-between px-1"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-xs font-semibold text-white">
 {(user?.name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
 </div> <span className="text-sm text-slate-300 dark:text-gray-300 truncate max-w-[100px]">{user?.name || user?.email || 'User'}</span></div><button
 onClick={() => { logout(); navigate('/login') }}
 className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
>
 <LogOut size={14} /> Log Out
 </button></div>
 )}
 </div></aside>
 )}

 {/* ── MOBILE DRAWER ── */}
 {mobileOpen && (
 <><div className="fixed inset-0 z-[1100] bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} /><div className={`fixed inset-y-0 left-0 z-[1200] w-72 max-w-[82vw] ${SB_BG} border-r ${SB_BORDER} flex flex-col shadow-2xl app-drawer-safe`}>
 {/* Mobile header */}
 <div className={`flex items-center justify-between px-4 py-4 border-b ${SB_BORDER} app-sidebar-safe-top`}><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30 overflow-hidden"><img src="/icons/icon-48.png" alt="" className="w-8 h-8 object-cover" onError={(e)=>{ e.currentTarget.style.display='none'; e.currentTarget.nextSibling?.classList.remove('hidden') }} /><span className="hidden text-white text-sm font-bold">{(brand?.[0] || 'R').toUpperCase()}</span></div><div><div className="text-sm font-bold text-white leading-tight">{brand}</div><div className="text-[10px] text-slate-400 dark:text-gray-400 uppercase tracking-wider">EpicSpire RMS</div></div></div><button
 onClick={() => setMobileOpen(false)}
 className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-800 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
 ><X size={18} /></button></div>

 {/* Mobile nav */}
 <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
 {/* Mobile Dashboard */}
 {dashboardVisible && (
 <NavLink
 to={dashboardItem.path}
 onClick={() => setMobileOpen(false)}
 className={({ isActive }) =>
 `${SB_ITEM_BASE} ${isActive ? SB_ITEM_ACTIVE : SB_ITEM_INACTIVE}`
 }
 ><Icon icon={dashboardItem.icon} /><span>{dashboardItem.label}</span></NavLink>
 )}

 {/* Mobile grouped sections */}
 {visibleSections.map(section => (
 <div key={section.label} className="pt-1"><div className={section.label === 'Warehouse' ? SB_SECTION_WAREHOUSE : SB_SECTION_LABEL}>{section.label}</div>
 {section.items.map(item => {
 if (item.gated && !canSell) {
 return (
 <button
 key={item.to}
 onClick={onBlockedSellClick}
 className={`${SB_ITEM_BASE} text-slate-600 dark:text-gray-600 cursor-not-allowed italic`}
 ><Icon icon={item.icon} /><span>{item.label} (Locked)</span></button>
 )
 }
 return (
 <NavLink
 key={item.to}
 to={item.to}
 end={item.end}
 onClick={() => setMobileOpen(false)}
 className={({ isActive }) =>
 `${SB_ITEM_BASE} ${isActive ? SB_ITEM_ACTIVE : SB_ITEM_INACTIVE}`
 }
 ><Icon icon={item.icon} /><span>{item.label}</span></NavLink>
 )
 })}
 </div>
 ))}
 </nav>

 {/* Mobile footer */}
 <div className={`border-t ${SB_BORDER} px-3 py-3 flex items-center justify-between`}><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold text-slate-200">
 {(user?.name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
 </div><span className="text-xs text-slate-300">{user?.name || user?.email || 'User'}</span></div><button
 onClick={() => { setMobileOpen(false); logout(); navigate('/login') }}
 className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors"
>
 <LogOut size={14} /> Logout
 </button></div></div></>
 )}
 </>
 )
}
