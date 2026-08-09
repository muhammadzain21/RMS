import { useEffect, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useData } from '../../state/DataContext.jsx'

export default function Login() {
 const { user, login } = useAuth()
 const { state } = useData()
 const navigate = useNavigate()
 const [form, setForm] = useState({ username: '', password: '' })
 const [error, setError] = useState('')
 const [loading, setLoading] = useState(false)
 const [showPass, setShowPass] = useState(false)

 // ── Fetch brand info from settings ────────────────────────────────────────
 const brand = state?.settings?.companyName || 'Restaurant POS'
 const logo = state?.settings?.logo || null // URL or base64 from settings

 useEffect(() => {
 if (user) {
 const firstAllowed = user.permissions
 ?.filter(p => p.visible)
 ?.map(p => p.path)?.[0]
 navigate(firstAllowed || '/')
 }
 }, [user, navigate])

 const submit = async (e) => {
 e.preventDefault()
 setError('')
 if (!form.username || !form.password) { setError('Username and password are required'); return }
 try {
 setLoading(true)
 const res = await login(form.username, form.password)
 if (!res?.ok) {
 setError(res?.error || 'Login failed')
 toast.error(res?.error || 'Invalid credentials')
 } else {
 toast.success('Welcome!')
 const firstAllowed = res?.user?.permissions
 ?.filter(p => p.visible)
 ?.map(p => p.path)?.[0]
 navigate(firstAllowed || '/')
 }
 } catch {
 setError('Login failed')
 toast.error('Login failed')
 } finally {
 setLoading(false)
 }
 }

 return (
 <div className="min-h-screen flex items-center justify-center bg-stone-100 dark:bg-stone-950 p-4"><div className="w-full max-w-4xl flex rounded-2xl overflow-hidden shadow-2xl border border-stone-200 dark:border-stone-800"
 style={{ minHeight: '560px' }}>

 {/* ── LEFT HERO PANEL ─────────────────────────────────────────────── */}
 <div className="hidden md:flex flex-col justify-between flex-1 p-10 bg-[#1c1917] relative overflow-hidden">

 {/* Subtle grid pattern */}
 <div className="absolute inset-0 opacity-[0.03]"
 style={{
 backgroundImage: 'repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 40px)'
 }} />
 {/* Soft glow blobs */}
 <div className="absolute w-80 h-80 rounded-full bg-orange-500 opacity-[0.06] -top-20 -left-20" /><div className="absolute w-56 h-56 rounded-full bg-orange-500 opacity-[0.04] -bottom-10 -right-10" />

 {/* Brand */}
 <div className="relative z-10 flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-900/30 overflow-hidden">
 {logo
 ? <img src={logo} alt={brand} className="w-full h-full object-cover" />
 : <span className="text-white font-bold text-lg leading-none">
 {brand.charAt(0).toUpperCase()}
 </span>
 }
 </div><div><div className="text-white font-bold text-lg leading-tight tracking-wide">{brand}</div><div className="text-stone-500 text-[10px] uppercase tracking-widest font-medium">POS &amp; Management</div></div></div>

 {/* Centre illustration */}
 <div className="relative z-10 flex flex-col items-center text-center flex-1 justify-center py-8"><div className="text-[96px] leading-none" style={{ filter: 'drop-shadow(0 16px 32px rgba(249,115,22,0.18))' }}></div><div className="mt-6 text-white font-semibold text-2xl leading-snug max-w-[240px]"
 style={{ fontFamily: 'Georgia, serif' }}>
 Run your kitchen with{' '}
 <span className="text-orange-400">confidence</span></div><div className="mt-3 text-stone-500 text-sm leading-relaxed max-w-[220px]">
 Sales, inventory, staff and finance — all in one place.
 </div></div>

 {/* Bottom stats */}
 <div className="relative z-10 flex items-center gap-6">
 {[['99%','Uptime'],['2s','Avg order'],['24/7','Support']].map(([n,l],i,a) => (
 <div key={l} className="flex items-center gap-6"><div><div className="text-white font-bold text-xl">{n}</div><div className="text-stone-600 text-[10px] uppercase tracking-wider">{l}</div></div>
 {i < a.length - 1 && <div className="w-px h-8 bg-stone-800" />}
 </div>
 ))}
 </div></div>

 {/* ── RIGHT LOGIN PANEL ────────────────────────────────────────────── */}
 <div className="flex flex-col justify-center w-full md:w-[400px] flex-shrink-0 bg-[#faf8f5] dark:bg-stone-900 px-10 py-12 relative">

 {/* Mobile brand (hidden on desktop since left panel shows it) */}
 <div className="md:hidden flex items-center gap-3 mb-8"><div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center overflow-hidden shadow-lg shadow-orange-200">
 {logo
 ? <img src={logo} alt={brand} className="w-full h-full object-cover" />
 : <span className="text-white font-bold text-base leading-none">
 {brand.charAt(0).toUpperCase()}
 </span>
 }
 </div><div><div className="font-bold text-stone-800 dark:text-stone-100 text-base leading-tight">{brand}</div><div className="text-stone-400 text-[10px] uppercase tracking-widest">POS &amp; Management</div></div></div>

 {/* Heading */}
 <div className="mb-8"><div className="text-orange-500 text-[10px] font-bold uppercase tracking-[2px] mb-2">Welcome back</div><div className="text-stone-800 dark:text-stone-100 font-bold text-[28px] leading-tight"
 style={{ fontFamily: 'Georgia, serif' }}>
 Sign in to your<br />restaurant
 </div><div className="text-stone-400 text-sm mt-2 leading-relaxed">
 Enter your credentials to access the dashboard.
 </div></div>

 {/* Form */}
 <form onSubmit={submit} className="flex flex-col gap-4">

 {/* Username */}
 <div className="flex flex-col gap-1.5"><label className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
 Username
 </label><div className="relative flex items-center"><span className="absolute left-3.5 text-stone-400 text-sm pointer-events-none"></span><input
 type="text"
 placeholder="Enter your username"
 value={form.username}
 onChange={e => setForm({ ...form, username: e.target.value })}
 className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm placeholder-stone-300 dark:placeholder-stone-600 outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-400/15"
 /></div></div>

 {/* Password */}
 <div className="flex flex-col gap-1.5"><label className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
 Password
 </label><div className="relative flex items-center"><span className="absolute left-3.5 text-stone-400 text-sm pointer-events-none"></span><input
 type={showPass ? 'text' : 'password'}
 placeholder="••••••••"
 value={form.password}
 onChange={e => setForm({ ...form, password: e.target.value })}
 className="w-full pl-10 pr-10 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm placeholder-stone-300 dark:placeholder-stone-600 outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-400/15"
 /><button
 type="button"
 onClick={() => setShowPass(v => !v)}
 className="absolute right-3.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 text-sm transition-colors"
 >
 {showPass ? '' : ''}
 </button></div></div>

 {/* Error */}
 {error && (
 <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900"><span className="text-red-500 text-sm"></span><span className="text-red-600 dark:text-red-400 text-sm">{error}</span></div>
 )}

 {/* Submit — always fully visible, no hover needed to see it */}
 <button
 type="submit"
 disabled={loading}
 className="w-full mt-1 py-3.5 rounded-xl bg-orange-500 text-white font-bold text-[15px] tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
 style={{ boxShadow: '0 4px 16px rgba(249,115,22,0.30)' }}
 onMouseEnter={e => { if(!loading) e.currentTarget.style.background='#ea580c' }}
 onMouseLeave={e => { e.currentTarget.style.background='#f97316' }}
 >
 {loading ? (
 <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
 Signing in...
 </>
 ) : (
 <>Sign in to Dashboard <span className="text-base"></span></>
 )}
 </button></form><div className="mt-8 text-center text-xs text-stone-400">
 Having trouble?{' '}
 <span className="text-orange-500 font-semibold cursor-pointer hover:underline">
 Contact your administrator
 </span></div></div></div></div>
 )
}
