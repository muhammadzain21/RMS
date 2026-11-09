/**
 * Dual branch filters: header workspace + optional per-page filter.
 * Precedence: header real branch > page filter > All (empty).
 */

export function isAllBranches(id) {
  const v = String(id || '').trim().toLowerCase()
  return !v || v === 'all'
}

/** Effective view/write branch id ('' = All / unscoped). */
export function resolveViewBranchId(headerBranchId, pageBranchId) {
  const header = String(headerBranchId || '').trim()
  if (header && header.toLowerCase() !== 'all') return header
  const page = String(pageBranchId || '').trim()
  if (page && page.toLowerCase() !== 'all' && page !== 'active') return page
  return ''
}

/**
 * Users-style page filter: 'all' | 'active' | concrete id.
 * When header is set, header wins (treat as that branch).
 */
export function resolveListBranchId(headerBranchId, pageFilter) {
  const header = String(headerBranchId || '').trim()
  if (header && header.toLowerCase() !== 'all') return header
  const pf = String(pageFilter || 'all').trim()
  if (pf === 'all' || !pf) return ''
  if (pf === 'active') return '' // active only meaningful when header set
  return pf
}

export function headerOverridesPage(headerBranchId) {
  const header = String(headerBranchId || '').trim()
  return !!(header && header.toLowerCase() !== 'all')
}
