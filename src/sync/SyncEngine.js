/**
 * Cloud ↔ local sync engine (background).
 *
 * Branch PC: localStorage.cloud_sync_url = VPS origin
 * VPS / HQ: leave cloud_sync_url empty
 *
 * Runs while the app is in use. Writes should call requestSync() so
 * call-center status and inventory land without waiting for the timer.
 * Coming back online triggers an immediate catch-up sync.
 */

const INTERVAL_MS = 5000
const MAX_DRAIN_PAGES = 12

/** Branch-scoped collections pushed local → cloud and applied cloud → local */
const BRANCH_COLLECTIONS = [
  'sales', 'kots', 'recalls', 'expenses', 'staff', 'attendance',
  'callCenterOrders', 'warehouseTransfers', 'ingredients', 'demands',
  'tables', 'suppliers', 'menuOverrides', 'categoryOverrides',
]

/** Shared catalogs applied cloud → local (and optionally pushed) */
const SHARED_COLLECTIONS = ['customers', 'categories', 'menu']

const ALL_APPLY_COLLECTIONS = [...BRANCH_COLLECTIONS, ...SHARED_COLLECTIONS]

const CC_STATUS_RANK = {
  pending: 1,
  accepted: 2,
  kot_created: 3,
  preparing: 4,
  ready: 5,
  completed: 6,
  cancelled: 7,
  expired: 7,
}

function localApi() {
  return (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
}

function normalizeCloudUrl(raw) {
  let u = String(raw || '').trim().replace(/\/+$/, '')
  if (!u) return ''
  try {
    const parsed = new URL(u.includes('://') ? u : `https://${u}`)
    const host = parsed.hostname || ''
    const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(host)
    if (!isLocal && parsed.protocol === 'http:') parsed.protocol = 'https:'
    return parsed.origin
  } catch {
    return u
  }
}

function cloudApi() {
  try {
    return normalizeCloudUrl(localStorage.getItem('cloud_sync_url') || '')
  } catch {
    return ''
  }
}

export { normalizeCloudUrl }

function sameHost(a, b) {
  try {
    return new URL(a).host === new URL(b).host
  } catch {
    return a === b
  }
}

function authHeaders(token) {
  const h = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  try {
    const branchId = resolveSyncBranchId()
    if (branchId) h['X-Branch-Id'] = branchId
  } catch {}
  return h
}

function deviceId() {
  try {
    let id = localStorage.getItem('sync_device_id')
    if (!id) {
      id = `dev-${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem('sync_device_id', id)
    }
    return id
  } catch {
    return 'default'
  }
}

function isBrowserOffline() {
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false
  } catch {
    return false
  }
}

/** Prefer header branch; if All, use home / last stored so sync still runs. */
export function resolveSyncBranchId() {
  try {
    const active = String(window.ACTIVE_BRANCH_ID || localStorage.getItem('active_branch_id') || '').trim()
    if (active) return active
    const home = String(localStorage.getItem('sync_home_branch_id') || '').trim()
    if (home) return home
    const last = String(localStorage.getItem('sync_last_branch_id') || '').trim()
    return last
  } catch {
    return ''
  }
}

export function rememberSyncBranch(branchId) {
  const id = String(branchId || '').trim()
  if (!id) return
  try {
    localStorage.setItem('sync_last_branch_id', id)
    if (!localStorage.getItem('sync_home_branch_id')) {
      localStorage.setItem('sync_home_branch_id', id)
    }
  } catch {}
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts)
  const ct = String(res.headers.get('content-type') || '')
  const text = await res.text()
  if (ct.includes('text/html') || /^\s*<!doctype/i.test(text) || /^\s*<html/i.test(text)) {
    throw new Error(
      'Cloud URL returned HTML instead of the API. On the VPS, nginx must proxy /api to Node (port 5000). See deploy/nginx-api-proxy.conf'
    )
  }
  let j = {}
  try { j = text ? JSON.parse(text) : {} } catch {
    throw new Error(`Cloud API returned non-JSON (HTTP ${res.status})`)
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        j.error ||
        `Cloud auth failed (HTTP ${res.status}). Set Cloud Sync Token in Settings if VPS JWT secret differs from this PC.`
      )
    }
    throw new Error(j.error || `HTTP ${res.status}`)
  }
  return j
}

function pickDocs(data, names) {
  const docs = {}
  for (const name of names) {
    if (Array.isArray(data?.[name]) && data[name].length) docs[name] = data[name]
  }
  return docs
}

function batchHasRows(docs) {
  return Object.values(docs || {}).some((arr) => Array.isArray(arr) && arr.length > 0)
}

function maxUpdatedAt(docs) {
  let max = 0
  for (const rows of Object.values(docs || {})) {
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      const t = new Date(row?.updatedAt || 0).getTime()
      if (Number.isFinite(t) && t > max) max = t
    }
  }
  return max ? new Date(max).toISOString() : ''
}

/** Push local changes to cloud (drain pages so overnight offline backlog clears). */
async function pushLocal({ cloud, local, token, cloudToken, branchId }) {
  const sinceKey = `sync_push_since_${branchId}`
  let since = '1970-01-01T00:00:00.000Z'
  try { since = localStorage.getItem(sinceKey) || since } catch {}

  let pages = 0
  let lastServerTime = ''
  while (pages < MAX_DRAIN_PAGES) {
    pages += 1
    const localPull = await fetchJson(
      `${local}/api/sync/pull?branchId=${encodeURIComponent(branchId)}&since=${encodeURIComponent(since)}&deviceId=${encodeURIComponent(deviceId())}&limit=500`,
      { headers: authHeaders(token) }
    )

    const docs = pickDocs(localPull.data, BRANCH_COLLECTIONS)
    lastServerTime = localPull.serverTime || lastServerTime

    if (!batchHasRows(docs)) {
      if (localPull.serverTime) {
        try { localStorage.setItem(sinceKey, localPull.serverTime) } catch {}
      }
      break
    }

    await fetchJson(`${cloud}/api/sync/push`, {
      method: 'POST',
      headers: authHeaders(cloudToken || token),
      body: JSON.stringify({ branchId, deviceId: deviceId(), docs }),
    })

    // Advance past the newest row we actually sent (not wall clock — avoids skipping mid-batch).
    // When more pages remain, step back 1ms so same-timestamp rows cut by the limit are not missed.
    const advanced = maxUpdatedAt(docs) || localPull.serverTime
    if (advanced) {
      let next = advanced
      if (localPull.hasMore) {
        const t = new Date(advanced).getTime()
        if (Number.isFinite(t) && t > 0) next = new Date(t - 1).toISOString()
      }
      since = next
      try { localStorage.setItem(sinceKey, next) } catch {}
    }

    if (!localPull.hasMore) break
  }
  return { ok: true, pages, serverTime: lastServerTime }
}

/** Pull cloud into local (apply via local sync push upsert); drain pages. */
async function pullThenApply({ cloud, local, token, cloudToken, branchId }) {
  const sinceKey = `sync_since_${branchId}`
  let since = '1970-01-01T00:00:00.000Z'
  try { since = localStorage.getItem(sinceKey) || since } catch {}

  let pages = 0
  let lastServerTime = ''
  while (pages < MAX_DRAIN_PAGES) {
    pages += 1
    const pulled = await fetchJson(
      `${cloud}/api/sync/pull?branchId=${encodeURIComponent(branchId)}&since=${encodeURIComponent(since)}&deviceId=${encodeURIComponent(deviceId())}&limit=500`,
      { headers: authHeaders(cloudToken || token) }
    )

    const data = pulled.data || {}
    const docs = pickDocs(data, ALL_APPLY_COLLECTIONS)
    lastServerTime = pulled.serverTime || lastServerTime

    if (batchHasRows(docs)) {
      await fetchJson(`${local}/api/sync/push`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ branchId, deviceId: deviceId(), docs }),
      })
      const advanced = maxUpdatedAt(docs) || pulled.serverTime
      if (advanced) {
        let next = advanced
        if (pulled.hasMore) {
          const t = new Date(advanced).getTime()
          if (Number.isFinite(t) && t > 0) next = new Date(t - 1).toISOString()
        }
        since = next
        try { localStorage.setItem(sinceKey, next) } catch {}
      }
    } else if (pulled.serverTime) {
      try { localStorage.setItem(sinceKey, pulled.serverTime) } catch {}
    }

    if (!pulled.hasMore || !batchHasRows(docs)) break
  }
  return { ok: true, pages, serverTime: lastServerTime }
}

let timer = null
let running = false
let lastError = ''
let lastOkAt = null
let getTokenFn = null
let pendingSync = false
let debounceTimer = null
let onlineListener = null
let branchListener = null

export function getSyncStatus() {
  return {
    running: !!timer,
    busy: running,
    lastError,
    lastOkAt,
    cloud: cloudApi(),
    local: localApi(),
    branchId: resolveSyncBranchId(),
    offline: isBrowserOffline(),
  }
}

export async function syncOnce(token) {
  const cloud = cloudApi()
  const local = String(localApi() || '').replace(/\/+$/, '')
  if (!cloud || !local || sameHost(cloud, local)) {
    lastError = ''
    return { skipped: true, reason: 'cloud_sync_url not set or same as local' }
  }
  if (isBrowserOffline()) {
    return { skipped: true, reason: 'browser offline — will sync when back online' }
  }
  const branchId = resolveSyncBranchId()
  if (!branchId) return { skipped: true, reason: 'no active branch' }

  let cloudToken = ''
  try { cloudToken = localStorage.getItem('cloud_sync_token') || '' } catch {}

  if (running) {
    pendingSync = true
    return { skipped: true, reason: 'busy' }
  }
  running = true
  try {
    // Push first so kitchen/payment status cannot be overwritten by older cloud rows
    await pushLocal({ cloud, local, token, cloudToken, branchId })
    await pullThenApply({ cloud, local, token, cloudToken, branchId })
    lastOkAt = new Date().toISOString()
    lastError = ''
    try {
      window.dispatchEvent(new CustomEvent('epicspire:sync', { detail: { ok: true, at: lastOkAt } }))
      window.dispatchEvent(new CustomEvent('live_refresh', { detail: { source: 'sync', at: lastOkAt } }))
      window.dispatchEvent(new CustomEvent('data_rehydrated', { detail: { branchId, source: 'sync' } }))
    } catch {}
    return { ok: true }
  } catch (e) {
    lastError = e.message || 'sync failed'
    try {
      window.dispatchEvent(new CustomEvent('epicspire:sync', { detail: { ok: false, error: lastError } }))
    } catch {}
    return { ok: false, error: lastError }
  } finally {
    running = false
    if (pendingSync) {
      pendingSync = false
      setTimeout(() => {
        try {
          const t = typeof getTokenFn === 'function' ? getTokenFn() : getTokenFn
          if (t) Promise.resolve(syncOnce(t)).catch(() => {})
        } catch {}
      }, 400)
    }
  }
}

/**
 * Fire-and-forget background sync after a local write (inventory, CC accept, sale…).
 * Debounced so rapid saves coalesce into one tick.
 */
export function requestSync(reason = 'write') {
  if (!cloudApi()) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    try {
      const token = typeof getTokenFn === 'function' ? getTokenFn() : getTokenFn
      if (!token) return
      Promise.resolve(syncOnce(token)).catch(() => {})
      try {
        window.dispatchEvent(new CustomEvent('epicspire:sync_requested', { detail: { reason } }))
      } catch {}
    } catch {}
  }, 600)
}

function kick(reason = 'timer') {
  try {
    const token = typeof getTokenFn === 'function' ? getTokenFn() : getTokenFn
    if (!token) return
    if (!cloudApi()) return
    Promise.resolve(syncOnce(token)).catch(() => {})
    try {
      window.dispatchEvent(new CustomEvent('epicspire:sync_requested', { detail: { reason } }))
    } catch {}
  } catch {}
}

export function startSyncEngine(getToken) {
  stopSyncEngine()
  getTokenFn = getToken
  timer = setInterval(() => kick('timer'), INTERVAL_MS)
  setTimeout(() => kick('start'), 1500)
  try {
    branchListener = (ev) => {
      const id = ev?.detail
      if (id) rememberSyncBranch(id)
      setTimeout(() => kick('branch'), 400)
    }
    window.addEventListener('active_branch_changed', branchListener)
  } catch {}
  try {
    onlineListener = () => {
      // Back online after offline POS — drain backlog immediately
      setTimeout(() => kick('online'), 500)
    }
    window.addEventListener('online', onlineListener)
  } catch {}
}

export function stopSyncEngine() {
  if (timer) clearInterval(timer)
  timer = null
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = null
  try {
    if (branchListener) window.removeEventListener('active_branch_changed', branchListener)
  } catch {}
  try {
    if (onlineListener) window.removeEventListener('online', onlineListener)
  } catch {}
  branchListener = null
  onlineListener = null
}

export { CC_STATUS_RANK, BRANCH_COLLECTIONS, SHARED_COLLECTIONS }
