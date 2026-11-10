/** Status ranks for call-center orders — never move backwards on sync. */
export const CC_STATUS_RANK = {
  pending: 1,
  accepted: 2,
  kot_created: 3,
  preparing: 4,
  ready: 5,
  completed: 6,
  cancelled: 7,
  expired: 7,
}

export function ccStatusRank(status) {
  return CC_STATUS_RANK[String(status || '').trim()] || 0
}

/**
 * Merge an incoming call-center row onto an existing one.
 * Higher/equal terminal status wins; never invent a duplicate _id.
 */
export function mergeCallCenterOrder(existing, incoming) {
  if (!existing) return { ...incoming }
  const out = { ...existing }
  const inRank = ccStatusRank(incoming.status)
  const exRank = ccStatusRank(existing.status)
  const keepStatus = inRank > exRank ? String(incoming.status) : String(existing.status || 'pending')
  const preferIncoming = inRank > exRank

  out.status = keepStatus
  // Fill empty fields from either side
  for (const key of Object.keys(incoming || {})) {
    if (key === '_id' || key === '__v' || key === 'status') continue
    if (key === 'kotId' || key === 'recallId' || key === 'acceptedAt' || key === 'acceptedBy') {
      if (preferIncoming && incoming[key]) out[key] = incoming[key]
      else if (!out[key] && incoming[key]) out[key] = incoming[key]
      continue
    }
    if (out[key] == null || out[key] === '') out[key] = incoming[key]
    else if (preferIncoming && incoming[key] != null && incoming[key] !== '') {
      // Don't overwrite customer/items with empties; allow updatedAt from newer status side
      if (key === 'updatedAt' || key === 'syncedAt') out[key] = incoming[key]
    }
  }
  if (existing.branchId) out.branchId = existing.branchId
  else if (incoming.branchId) out.branchId = incoming.branchId
  return out
}
