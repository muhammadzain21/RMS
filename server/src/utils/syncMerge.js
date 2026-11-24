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
const DEMAND_RANK = {
  pending: 1,
  sent: 2,
  accepted: 3,
  issued: 4,
  completed: 5,
}

/**
 * Demand status only moves forward. Rejected sticks unless the demand was already completed.
 * Same _id is updated — a re-sync does not insert a second demand.
 */
export function mergeDemand(existing, incoming) {
  if (!existing) return { ...incoming }
  const ex = String(existing.status || 'pending')
  const inc = String(incoming.status || 'pending')
  let status = ex
  if (ex === 'completed' || inc === 'completed') status = 'completed'
  else if (ex === 'rejected' || inc === 'rejected') status = 'rejected'
  else status = (DEMAND_RANK[inc] || 0) >= (DEMAND_RANK[ex] || 0) ? inc : ex

  const incomingWins = status === inc && inc !== ex
  const out = incomingWins ? { ...existing, ...incoming } : { ...existing }
  out.status = status
  out.branchId = existing.branchId || incoming.branchId
  if (!out.transferId) out.transferId = existing.transferId || incoming.transferId || ''
  if (status === 'issued' || status === 'completed') {
    out.items = Array.isArray(incoming.items) && incoming.items.length ? incoming.items : existing.items
    out.transferId = incoming.transferId || existing.transferId || ''
  }
  return out
}

const TRANSFER_RANK = { draft: 1, sent: 2, received: 3, cancelled: 4 }

/**
 * A received transfer stays received. Cloud "sent" cannot duplicate or rewind it.
 */
export function mergeWarehouseTransfer(existing, incoming) {
  if (!existing) return { ...incoming }
  const er = TRANSFER_RANK[String(existing.status || '')] || 0
  const ir = TRANSFER_RANK[String(incoming.status || '')] || 0
  const localReceived = existing.status === 'received' || existing.appliedToInventory
  if (localReceived && ir < TRANSFER_RANK.received && incoming.status !== 'cancelled') {
    return {
      ...incoming,
      ...existing,
      status: 'received',
      appliedToInventory: true,
      toBranchId: existing.toBranchId || incoming.toBranchId,
    }
  }
  if (ir >= er) {
    return {
      ...existing,
      ...incoming,
      toBranchId: existing.toBranchId || incoming.toBranchId,
      appliedToInventory: !!(incoming.appliedToInventory || existing.appliedToInventory),
      status: ir > er ? incoming.status : (existing.status || incoming.status),
    }
  }
  return {
    ...incoming,
    ...existing,
    toBranchId: existing.toBranchId || incoming.toBranchId,
  }
}

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
