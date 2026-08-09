import { NavLink, useNavigate } from 'react-router-dom'
import { dashboardItem, navSections } from './navConfig.js'
import { LogOut, X, Menu as MenuIcon, ChevronLeft, ChevronRight } from 'lucide-react'

// ─── Tailwind token strings ─────────────────────────────────────────────────
const SB_BG = 'bg-slate-900 dark:bg-gray-950'
const SB_BORDER = 'border-slate-800 dark:border-gray-800'
const SB_ITEM_BASE = 'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer w-full'
const SB_ITEM_INACTIVE = 'text-slate-400 hover:bg-slate-800 hover:text-white dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
const SB_ITEM_ACTIVE = 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
const SB_SECTION_LABEL = 'px-3 pt-3 pb-1 text-[10px] font-semibold tracking-widest uppercase text-slate-500 dark:text-gray-500 select-none'

// ─── Permission helpers ───────────────────────────────────────────────────
function isDashboardVisible(user) {
 if (user?.role === 'Admin') return true
 if (user?.permissions && Array.isArray(user.permissions)) {
 return user.permissions.some(p => p.path === '/' && p.visible)
 }
 return false
}

function getVisibleSections(user) {
 const sections = navSections()
 if (user?.role === 'Admin') return sections
 if (user?.permissions && Array.isArray(user.permissions)) {
 const allowedPaths = new Set(user.permissions.filter(p => p.visible).map(p => p.path))
 return sections
 .map(s => ({ ...s, items: s.items.filter(i => allowedPaths.has(i.to)) }))
 .filter(s => s.items.length > 0)
 }
 return []
}

// ─── Sidebar component ────────────────────────────────────────────────────
export default function Sidebar({ user, brand, collapsed, setCollapsed, mobileOpen, setMobileOpen, canSell, onBlockedSellClick, logout }) {
 const navigate = useNavigate()

 const dashboardVisible = isDashboardVisible(user)
 const visibleSections = getVisibleSections(user)

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
 <aside
 className={`
 no-print hidden md:flex flex-none flex-col
 ${collapsed ? 'md:w-[4.5rem] min-w-[4.5rem]' : 'md:w-52 min-w-[13rem]'}
 sticky top-0 h-screen overflow-y-auto overflow-x-visible
 ${SB_BG} border-r ${SB_BORDER}
 transition-[width] duration-200 z-[1000]
 `}
 >
 {/* Brand */}
 <div className={`flex items-center gap-3 px-4 py-4 border-b ${SB_BORDER} flex-shrink-0 ${collapsed ? 'justify-center' : ''}`}><div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-600/30"><span className="text-white text-sm font-bold leading-none">
 {(brand?.[0] || 'R').toUpperCase()}
 </span></div>
 {!collapsed && (
 <div><div className="text-xs font-bold text-white leading-tight tracking-wide truncate max-w-[130px]">{brand}</div><div className="text-[10px] text-slate-400 dark:text-gray-400 font-medium tracking-wider uppercase">POS System</div></div>
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
 <div className={SB_SECTION_LABEL}>{section.label}</div>
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
 className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors"
 ><LogOut size={18} /></button></div>
 ) : (
 <div className="flex items-center justify-between px-1"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-semibold text-white">
 {(user?.name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
 </div><span className="text-xs text-slate-300 dark:text-gray-300 truncate max-w-[80px]">{user?.name || user?.email || 'User'}</span></div><div className="flex items-center gap-2"><button
 onClick={() => { logout(); navigate('/login') }}
 className="text-xs text-red-400 hover:text-red-300 transition-colors font-medium"
 >
 Log Out
 </button></div></div>
 )}
 </div></aside>

 {/* ── MOBILE DRAWER ── */}
 {mobileOpen && (
 <><div className="fixed inset-0 z-[1100] bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} /><div className={`fixed inset-y-0 left-0 z-[1200] w-72 max-w-[82vw] ${SB_BG} border-r ${SB_BORDER} flex flex-col shadow-2xl`}>
 {/* Mobile header */}
 <div className={`flex items-center justify-between px-4 py-4 border-b ${SB_BORDER}`}><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30"><span className="text-white text-sm font-bold">{(brand?.[0] || 'R').toUpperCase()}</span></div><div><div className="text-sm font-bold text-white leading-tight">{brand}</div><div className="text-[10px] text-slate-400 dark:text-gray-400 uppercase tracking-wider">POS System</div></div></div><button
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
 <div key={section.label} className="pt-1"><div className={SB_SECTION_LABEL}>{section.label}</div>
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
 <div className={`border-t ${SB_BORDER} px-3 py-3 flex items-center justify-between`}><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-stone-700 flex items-center justify-center text-xs font-semibold text-stone-300">
 {(user?.name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
 </div><span className="text-xs text-stone-400">{user?.name || user?.email || 'User'}</span></div><div className="flex items-center gap-2"><button
 onClick={() => { setMobileOpen(false); logout(); navigate('/login') }}
 className="text-xs text-red-500 hover:text-red-400 font-medium transition-colors"
 >
 Logout
 </button></div></div></div></>
 )}
 </>
 )
}
