import { useState, useEffect } from 'react'
import { useData } from '../state/DataContext.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { PanelLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react'

export default function Header({ brand, onMenuClick, onCollapseClick, collapsed }) {
 const { state, businessDate } = useData()
 const [currentTime, setCurrentTime] = useState(new Date())
 const [licenseInfo, setLicenseInfo] = useState({ valid: true, daysRemaining: Infinity })

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
 <header className="no-print sticky top-0 z-10 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 text-white shadow-lg px-3 sm:px-5 py-3 flex items-center justify-between"><div className="flex items-center gap-3">
 {/* Mobile menu button */}
 <button
 onClick={onMenuClick}
 className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
 title="Open menu"
 ><PanelLeft size={20} /></button>
 {/* Desktop collapse button */}
 <button
 onClick={onCollapseClick}
 className="hidden md:inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors text-xs"
 title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
 >
 {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
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
 </span></div><div className="bg-white/20 rounded-lg p-1"><ThemeToggle /></div></div></header>
 )
}
