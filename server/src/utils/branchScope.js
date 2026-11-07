/**
 * Branch scoping helpers.
 *
 * Shared (no branch filter): customers, menu items/categories/rates
 * Branch-scoped: sales, KOTs, staff, settings, biometric, inventory, expenses, etc.
 */

export function isHqUser(user) {
  if (!user) return false
  if (user.role === 'Admin' || user.role === 'SuperAdmin') return true
  if (user.isHq) return true
  return false
}

/** Resolve active branch from header / query / body / user home. */
export function resolveBranchId(req, { required = false } = {}) {
  const header = req.headers['x-branch-id']
  const q = req.query?.branchId
  const b = req.body?.branchId
  const fromReq = String(header || q || b || '').trim()
  if (fromReq) return fromReq

  const home = String(req.user?.homeBranchId || '').trim()
  if (home) return home

  if (required) {
    const err = new Error('branchId is required')
    err.status = 400
    throw err
  }
  return ''
}

/** Ensure user may access this branch (HQ can access all). */
export function assertBranchAccess(req, branchId) {
  if (!branchId) return
  if (isHqUser(req.user)) return
  const allowed = Array.isArray(req.user?.branchIds) ? req.user.branchIds.map(String) : []
  const home = String(req.user?.homeBranchId || '')
  if (home && home === String(branchId)) return
  if (allowed.includes(String(branchId))) return
  const err = new Error('Forbidden for this branch')
  err.status = 403
  throw err
}

/** Stamp branchId onto a create/update payload (header → body → homeBranch). */
export function stampBranchId(req, doc = {}) {
  const branchId = resolveBranchId(req) || String(doc.branchId || '').trim()
  if (!branchId) return { ...doc }
  assertBranchAccess(req, branchId)
  return { ...doc, branchId: String(branchId) }
}

/** Branches the actor may see (HQ = no restriction). */
export function accessibleBranchFilter(req) {
  if (isHqUser(req.user)) return {}
  const ids = Array.isArray(req.user?.branchIds) ? req.user.branchIds.filter(Boolean) : []
  if (req.user?.homeBranchId) ids.push(req.user.homeBranchId)
  const uniq = [...new Set(ids.map(String))]
  if (!uniq.length) return { branchId: '__none__' }
  if (uniq.length === 1) return { branchId: uniq[0] }
  return { branchId: { $in: uniq } }
}

/** Build a Mongo filter fragment for branch-scoped lists. */
export function branchFilter(req, { allowAllForHq = true, allAccessible = false } = {}) {
  // Cross-branch pages (call center / inbox): every branch the user can access
  if (allAccessible) return accessibleBranchFilter(req)

  const branchId = resolveBranchId(req)
  if (branchId) {
    assertBranchAccess(req, branchId)
    return { branchId: String(branchId) }
  }
  if (allowAllForHq && isHqUser(req.user)) return {}
  return accessibleBranchFilter(req)
}

/** Merge an existing Mongo filter with branch scoping. */
export function mergeBranchFilter(req, filter = {}, opts) {
  const bf = branchFilter(req, opts)
  if (!bf || Object.keys(bf).length === 0) return filter || {}
  if (!filter || Object.keys(filter).length === 0) return bf
  return { $and: [filter, bf] }
}
