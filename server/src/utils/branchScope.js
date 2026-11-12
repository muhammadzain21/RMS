/**
 * Branch scoping helpers.
 *
 * Shared catalog (menu/categories defaults) can use BranchMenuOverride per branch.
 * Operational data (sales, inventory, staff, expenses, …) is always branch-scoped
 * when X-Branch-Id / homeBranchId is present — including Admin / SuperAdmin.
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
    const err = new Error('branchId is required — select a branch in the header')
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

/**
 * Block cross-branch edits: Admin viewing Branch A cannot PATCH a Branch B record.
 * Legacy docs with empty branchId are allowed (then stamped on save).
 */
export function assertDocumentBranch(req, doc) {
  if (!doc) return
  const active = resolveBranchId(req)
  if (!active) return
  const docBranch = String(doc.branchId || '').trim()
  if (!docBranch) return
  if (String(docBranch) !== String(active)) {
    const err = new Error('This record belongs to another branch. Switch the header branch to edit it.')
    err.status = 403
    throw err
  }
}

/** Stamp branchId onto a create/update payload (header → body → homeBranch). */
export function stampBranchId(req, doc = {}) {
  let branchId = resolveBranchId(req) || String(doc.branchId || '').trim()
  if (!branchId) {
    const err = new Error('branchId is required — select a branch in the header')
    err.status = 400
    throw err
  }
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

/**
 * Build a Mongo filter fragment for branch-scoped lists.
 * Admin/SuperAdmin with an active branch only see THAT branch (not all branches).
 * Use allAccessible:true for call-center / cross-branch inbox.
 * Use allowAllForHq:true only for intentional HQ-wide reports.
 */
export function branchFilter(req, { allowAllForHq = false, allAccessible = false } = {}) {
  // Cross-branch pages (call center / inbox): every branch the user can access
  if (allAccessible) return accessibleBranchFilter(req)

  const branchId = resolveBranchId(req)
  if (branchId) {
    try {
      assertBranchAccess(req, branchId)
      return { branchId: String(branchId) }
    } catch (e) {
      // Stale header branch (e.g. admin branch left in the browser while a staff
      // account is logged in). Scope to branches this user may access instead of 403.
      if (e.status !== 403) throw e
      return accessibleBranchFilter(req)
    }
  }

  // No header/home: HQ-wide only when explicitly opted in
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
