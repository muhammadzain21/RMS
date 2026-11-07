/**
 * Cloud ↔ local sync engine.
 *
 * Configure:
 *   localStorage.cloud_sync_url = 'https://pos.yourdomain.com'
 *   (optional) localStorage.cloud_sync_token = '<hq jwt>'
 *
 * When API_BASE is the local branch server and cloud_sync_url points at Hostinger,
 * this engine push/pulls every few seconds for the active branch.
 */

const INTERVAL_MS = 5000
const COLLECTIONS = [
  'sales', 'kots', 'recalls', 'expenses', 'staff', 'attendance',
  'callCenterOrders', 'warehouseTransfers', 'ingredients',
]

function localApi() {
  return (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
}

function cloudApi() {
  try {
    return String(localStorage.getItem('cloud_sync_url') || '').replace(/\/+$/, '')
  } catch {
    return ''
  }
}

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
    const branchId = window.ACTIVE_BRANCH_ID || localStorage.getItem('active_branch_id') || ''
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

async function fetchJson(url, opts) {
  const res = await fetch(url, opts)
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
  return j
}

/** Pull from cloud into local API (apply via local sync push endpoint mirrored as upserts) */
async function pullThenApply({ cloud, local, token, cloudToken, branchId }) {
  const sinceKey = `sync_since_${branchId}`
  let since = '1970-01-01T00:00:00.000Z'
  try { since = localStorage.getItem(sinceKey) || since } catch {}

  const pulled = await fetchJson(
    `${cloud}/api/sync/pull?branchId=${encodeURIComponent(branchId)}&since=${encodeURIComponent(since)}&deviceId=${encodeURIComponent(deviceId())}`,
    { headers: authHeaders(cloudToken || token) }
  )

  const data = pulled.data || {}
  // Apply shared + branch docs onto local server via sync/push (local acts as writer)
  await fetchJson(`${local}/api/sync/push`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ branchId, deviceId: deviceId(), docs: data }),
  })

  if (pulled.serverTime) {
    try { localStorage.setItem(sinceKey, pulled.serverTime) } catch {}
  }
  return pulled
}

/** Push local branch changes up to cloud */
async function pushLocal({ cloud, local, token, cloudToken, branchId }) {
  const sinceKey = `sync_push_since_${branchId}`
  let since = '1970-01-01T00:00:00.000Z'
  try { since = localStorage.getItem(sinceKey) || since } catch {}

  // Ask local for docs changed since last push (reuse pull against local)
  const localPull = await fetchJson(
    `${local}/api/sync/pull?branchId=${encodeURIComponent(branchId)}&since=${encodeURIComponent(since)}&deviceId=${encodeURIComponent(deviceId())}`,
    { headers: authHeaders(token) }
  )

  const docs = {}
  for (const name of COLLECTIONS) {
    if (Array.isArray(localPull.data?.[name]) && localPull.data[name].length) {
      docs[name] = localPull.data[name]
    }
  }

  if (!Object.keys(docs).length) {
    return { ok: true, empty: true }
  }

  const pushed = await fetchJson(`${cloud}/api/sync/push`, {
    method: 'POST',
    headers: authHeaders(cloudToken || token),
    body: JSON.stringify({ branchId, deviceId: deviceId(), docs }),
  })

  if (localPull.serverTime) {
    try { localStorage.setItem(sinceKey, localPull.serverTime) } catch {}
  }
  return pushed
}

let timer = null
let running = false
let lastError = ''
let lastOkAt = null

export function getSyncStatus() {
  return {
    running: !!timer,
    busy: running,
    lastError,
    lastOkAt,
    cloud: cloudApi(),
    local: localApi(),
  }
}

export async function syncOnce(token) {
  const cloud = cloudApi()
  const local = String(localApi() || '').replace(/\/+$/, '')
  if (!cloud || !local || sameHost(cloud, local)) {
    lastError = ''
    return { skipped: true, reason: 'cloud_sync_url not set or same as local' }
  }
  const branchId = (typeof window !== 'undefined' && (window.ACTIVE_BRANCH_ID || localStorage.getItem('active_branch_id'))) || ''
  if (!branchId) return { skipped: true, reason: 'no active branch' }

  let cloudToken = ''
  try { cloudToken = localStorage.getItem('cloud_sync_token') || '' } catch {}

  if (running) return { skipped: true, reason: 'busy' }
  running = true
  try {
    await pullThenApply({ cloud, local, token, cloudToken, branchId })
    await pushLocal({ cloud, local, token, cloudToken, branchId })
    lastOkAt = new Date().toISOString()
    lastError = ''
    try {
      window.dispatchEvent(new CustomEvent('epicspire:sync', { detail: { ok: true, at: lastOkAt } }))
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
  }
}

let branchListener = null

export function startSyncEngine(getToken) {
  stopSyncEngine()
  const tick = () => {
    const token = typeof getToken === 'function' ? getToken() : getToken
    if (!token) return
    if (!cloudApi()) return
    syncOnce(token)
  }
  timer = setInterval(tick, INTERVAL_MS)
  // first run shortly after start
  setTimeout(tick, 1500)
  try {
    branchListener = () => setTimeout(tick, 400)
    window.addEventListener('active_branch_changed', branchListener)
  } catch {}
}

export function stopSyncEngine() {
  if (timer) clearInterval(timer)
  timer = null
  try {
    if (branchListener) window.removeEventListener('active_branch_changed', branchListener)
  } catch {}
  branchListener = null
}
