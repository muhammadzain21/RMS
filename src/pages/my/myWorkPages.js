/** Paths that can be granted per staff in Add/Edit Staff. */
export const MY_WORK_PAGE_OPTIONS = [
  { path: '/my', label: 'Home', desc: 'My Work dashboard' },
  { path: '/my/attendance', label: 'Attendance', desc: 'Check-in history' },
  { path: '/my/purchases', label: 'Purchases', desc: 'Orders & dues' },
  { path: '/my/advances', label: 'Advances', desc: 'Taken & repaid' },
  { path: '/my/earnings', label: 'Earnings', desc: 'Pay & deductions' },
  { path: '/my/salary', label: 'Salary', desc: 'Salary slips' },
  { path: '/rider', label: 'Rider delivery', desc: 'Live GPS on depart' },
]

export const ALL_MY_WORK_PATHS = MY_WORK_PAGE_OPTIONS.map(p => p.path)

/** New staff default: everything except Rider (waiters should not get it automatically). */
export const DEFAULT_MY_WORK_PAGES = ALL_MY_WORK_PATHS.filter(p => p !== '/rider')

export function resolveMyWorkPages(staffLike) {
  if (!staffLike) return []
  if (Array.isArray(staffLike.myWorkPages)) {
    return staffLike.myWorkPages.filter(p => ALL_MY_WORK_PATHS.includes(p))
  }
  if (staffLike.myWorkAccess === false) return []
  // Legacy single toggle: Rider position keeps delivery page; waiters/others do not
  const pos = String(staffLike.position || '').toLowerCase()
  if (pos === 'rider') return [...ALL_MY_WORK_PATHS]
  return [...DEFAULT_MY_WORK_PAGES]
}

export function hasMyWorkPage(pages, path) {
  const list = Array.isArray(pages) ? pages : []
  if (!path) return false
  if (list.includes(path)) return true
  // Prefix match for nested routes under a granted page (not for bare /my)
  return list.some(p => p !== '/my' && p !== '/rider' && (path === p || path.startsWith(p + '/')))
}
