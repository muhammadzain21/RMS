/** Keep in sync with src/pages/my/myWorkPages.js */
export const ALL_MY_WORK_PATHS = [
  '/my',
  '/my/attendance',
  '/my/purchases',
  '/my/advances',
  '/my/earnings',
  '/my/salary',
  '/rider',
]

export const DEFAULT_MY_WORK_PAGES = ALL_MY_WORK_PATHS.filter(p => p !== '/rider')

export function resolveMyWorkPages(staff) {
  if (!staff) return []
  if (Array.isArray(staff.myWorkPages)) {
    return staff.myWorkPages.filter(p => ALL_MY_WORK_PATHS.includes(String(p)))
  }
  if (staff.myWorkAccess === false) return []
  // Legacy single toggle: only Rider position keeps /rider; waiters etc. get the rest
  const pos = String(staff.position || '').toLowerCase()
  if (pos === 'rider') return [...ALL_MY_WORK_PATHS]
  return [...DEFAULT_MY_WORK_PAGES]
}

export function normalizeMyWorkPages(input, { myWorkAccess } = {}) {
  if (Array.isArray(input)) {
    const pages = [...new Set(input.map(String).filter(p => ALL_MY_WORK_PATHS.includes(p)))]
    return { myWorkPages: pages, myWorkAccess: pages.length > 0 }
  }
  if (myWorkAccess === false) return { myWorkPages: [], myWorkAccess: false }
  if (myWorkAccess === true) return { myWorkPages: [...DEFAULT_MY_WORK_PAGES], myWorkAccess: true }
  return null
}
