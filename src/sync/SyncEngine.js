/**
 * Cloud ↔ local sync engine (background).
 *
 * Branch PC: localStorage.cloud_sync_url = VPS origin
 * VPS / HQ: leave cloud_sync_url empty
 * Toggle: localStorage.cloud_sync_enabled = '1' | '0' (URL can stay saved when off)
 *
 * Branch data is the source of truth: every branch collection is pushed up.
 * Cloud → branch is only call-center orders, warehouse issues, and demand status.
 * Coming back online triggers an immediate catch-up sync.
 */

const INTERVAL_MS = 5000
const MAX_DRAIN_PAGES = 12

/** Uploaded local → cloud. Same _id updates the cloud row; it does not insert another. */
const PUSH_COLLECTIONS = [
  'sales', 'deletedSales', 'returns', 'kots', 'recalls', 'voids', 'helds',
  'expenses', 'expenseHeads', 'staff', 'attendance', 'staffAdvances', 'staffEarnings',
  'staffPurchases', 'payrollRuns', 'ingredients', 'supplies', 'demands', 'tables',
  'suppliers', 'riders', 'riderCash', 'cashOpenings', 'payInOuts', 'cashCounts',
  'dayCloses', 'advanceBookings', 'physicalCounts', 'menuOverrides', 'categoryOverrides',
  'callCenterOrders', 'warehouseTransfers', 'customers', 'users',
]

/** Downloaded cloud → branch. Head office creates these; the branch does not. */
const PULL_COLLECTIONS = ['callCenterOrders', 'warehouseTransfers', 'demands']

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

/** Saved VPS URL even when sync toggle is off. */
export function getSavedCloudUrl() {
  try {
    return normalizeCloudUrl(localStorage.getItem('cloud_sync_url') || '')
  } catch {
    return ''
  }
}

/**
 * Sync master switch. Missing key + existing URL → treat as enabled (upgrade-safe).
 */
export function isCloudSyncEnabled() {
  try {
    const v = localStorage.getItem('cloud_sync_enabled')
    if (v === null || v === '') return Boolean(getSavedCloudUrl())
    return v === '1' || v === 'true'
  } catch {
    return false
  }
}

export function setCloudSyncEnabled(on) {
  try {
    localStorage.setItem('cloud_sync_enabled', on ? '1' : '0')
  } catch {}
}

/** Active cloud origin used by the engine (empty when toggle is off). */
function cloudApi() {
  if (!isCloudSyncEnabled()) return ''
  return getSavedCloudUrl()
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
    // Prefer the branch tied to this device's sync home (set when a real branch was selected)
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
  // Always bypass HTTP cache — a 304 with empty body was silently skipping
  // sales heartbeat and leaving cloud without recent bills.
  const res = await fetch(url, { ...opts, cache: 'no-store' })
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

/**
 * Call VPS sync APIs via the local Node server so the browser stays same-origin
 * (avoids CORS blocks from http://127.0.0.1 → https://cloud).
 */
async function cloudFetchJson(cloud, syncPath, { method = 'GET', token, cloudToken, branchId, body, omitBranch = false } = {}) {
  const local = String(localApi() || '').replace(/\/+$/, '')
  const tok = String(cloudToken || token || '').trim()
  const bid = omitBranch ? '' : (branchId || resolveSyncBranchId())
  return fetchJson(`${local}/api/sync/proxy`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      cloudBase: cloud,
      path: syncPath,
      method,
      cloudToken: tok,
      branchId: bid,
      body,
    }),
  })
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

/** Missed/failed push rows kept for the next sync cycle (by collection → id → doc). */
function failedPushKey(branchId) {
  return `sync_push_failed_${String(branchId || '').trim()}`
}

function loadFailedPushDocs(branchId) {
  try {
    const raw = JSON.parse(localStorage.getItem(failedPushKey(branchId)) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function saveFailedPushDocs(branchId, map) {
  try {
    const clean = {}
    for (const [col, byId] of Object.entries(map || {})) {
      if (!byId || typeof byId !== 'object') continue
      const ids = Object.keys(byId)
      if (!ids.length) continue
      // Cap per collection so localStorage stays small
      const keep = ids.slice(-300)
      clean[col] = {}
      for (const id of keep) clean[col][id] = byId[id]
    }
    if (Object.keys(clean).length) localStorage.setItem(failedPushKey(branchId), JSON.stringify(clean))
    else localStorage.removeItem(failedPushKey(branchId))
  } catch {}
}

function rememberFailedPushDocs(branchId, docs, pushErrors) {
  const failed = loadFailedPushDocs(branchId)
  const failedIds = new Set((pushErrors || []).map((e) => String(e?.id || '')).filter(Boolean))
  const failedCols = new Set((pushErrors || []).map((e) => String(e?.collection || '')).filter(Boolean))
  for (const [col, rows] of Object.entries(docs || {})) {
    if (!Array.isArray(rows) || !rows.length) continue
    if (!failedCols.has(col) && !rows.some((r) => failedIds.has(String(r?._id || r?.id || '')))) continue
    if (!failed[col]) failed[col] = {}
    for (const row of rows) {
      const id = String(row?._id || row?.id || '')
      if (!id) continue
      if (failedIds.has(id) || failedCols.has(col)) failed[col][id] = row
    }
  }
  saveFailedPushDocs(branchId, failed)
}

function clearFailedPushDocs(branchId, docs, pushErrors) {
  const failed = loadFailedPushDocs(branchId)
  if (!Object.keys(failed).length) return
  const errIds = new Set((pushErrors || []).map((e) => String(e?.id || '')).filter(Boolean))
  const errCols = new Set((pushErrors || []).map((e) => String(e?.collection || '')).filter(Boolean))
  for (const [col, rows] of Object.entries(docs || {})) {
    if (!Array.isArray(rows) || !failed[col]) continue
    for (const row of rows) {
      const id = String(row?._id || row?.id || '')
      if (!id || !failed[col][id]) continue
      // Keep if this id/collection still reported an error
      if (errIds.has(id) || errCols.has(col)) continue
      delete failed[col][id]
    }
    if (!Object.keys(failed[col] || {}).length) delete failed[col]
  }
  saveFailedPushDocs(branchId, failed)
}

/** Merge previously missed docs into this batch so resync uploads them again. */
function mergeFailedPushDocs(branchId, docs) {
  const failed = loadFailedPushDocs(branchId)
  const out = { ...(docs || {}) }
  for (const [col, byId] of Object.entries(failed)) {
    const pending = Object.values(byId || {}).filter(Boolean)
    if (!pending.length) continue
    const existing = Array.isArray(out[col]) ? out[col] : []
    const seen = new Set(existing.map((r) => String(r?._id || r?.id || '')).filter(Boolean))
    const extra = pending.filter((r) => {
      const id = String(r?._id || r?.id || '')
      return id && !seen.has(id)
    })
    if (extra.length) out[col] = [...existing, ...extra]
  }
  return out
}

/**
 * Force-queue docs for the next cloud push (used after day open/close so they
 * are never lost inside a large sales batch or an advanced cursor).
 */
export function queuePushDocs(docs) {
  const branchId = resolveSyncBranchId()
  if (!branchId) return
  const failed = loadFailedPushDocs(branchId)
  for (const [col, rows] of Object.entries(docs || {})) {
    const list = Array.isArray(rows) ? rows : (rows ? [rows] : [])
    if (!list.length) continue
    if (!failed[col]) failed[col] = {}
    for (const row of list) {
      if (!row || typeof row !== 'object') continue
      const id = String(row._id || row.id || '')
      if (!id) continue
      failed[col][id] = row
    }
  }
  saveFailedPushDocs(branchId, failed)
}

function ymdLocal(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d)
  if (!Number.isFinite(x.getTime())) return ''
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daybookRestDoneKey(branchId) {
  return `sync_daybook_rest_done_${String(branchId || '').trim()}`
}

function loadDaybookRestDone(branchId) {
  try {
    const raw = JSON.parse(localStorage.getItem(daybookRestDoneKey(branchId)) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function markDaybookRestDone(branchId, kind, date) {
  if (!branchId || !date) return
  try {
    const map = loadDaybookRestDone(branchId)
    map[`${kind}:${date}`] = 1
    localStorage.setItem(daybookRestDoneKey(branchId), JSON.stringify(map))
  } catch {}
}

/** Branch already closed offline — clear stale open recalls on cloud that block REST day-close. */
async function clearCloudOpenRecalls({ cloud, token, cloudToken, branchId }) {
  const collect = async (opts) => {
    try {
      const list = await cloudFetchJson(cloud, '/api/recalls?limit=500', {
        method: 'GET',
        token,
        cloudToken,
        branchId,
        ...opts,
      })
      return Array.isArray(list) ? list : (Array.isArray(list?.rows) ? list.rows : [])
    } catch {
      return []
    }
  }
  try {
    // Cloud day-close may count recalls without branch scope while GET is scoped —
    // pull both the branch list and an unscoped list.
    const [scoped, all] = await Promise.all([
      collect({}),
      collect({ omitBranch: true }),
    ])
    const byId = new Map()
    for (const row of [...scoped, ...all]) {
      const id = String(row?._id || row?.id || '')
      if (id) byId.set(id, row)
    }
    let cleared = 0
    for (const id of byId.keys()) {
      try {
        await cloudFetchJson(cloud, `/api/recalls/${id}`, {
          method: 'DELETE',
          token,
          cloudToken,
          branchId,
          omitBranch: true,
        })
        cleared += 1
      } catch {}
    }
    return cleared
  } catch {
    return 0
  }
}

/** Older cloud builds omit dayCloses/cashOpenings from /api/sync/push — use REST. */
async function pushDaybookViaRest({ cloud, token, cloudToken, branchId, dayDocs }) {
  const closes = Array.isArray(dayDocs?.dayCloses) ? dayDocs.dayCloses : []
  const opens = Array.isArray(dayDocs?.cashOpenings) ? dayDocs.cashOpenings : []
  const done = loadDaybookRestDone(branchId)
  const errors = []
  let closeOk = 0
  let openOk = 0

  // Newest first so today's/yesterday's close lands before older history
  const closeSorted = [...closes].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  // Only push openings for dates that are already closed online (or have no close locally),
  // so we never mark a day Open on cloud without its matching close.
  const localCloseDates = new Set(closeSorted.map((r) => String(r?.date || '').slice(0, 10)).filter(Boolean))
  const openSorted = [...opens]
    .filter((r) => {
      const d = String(r?.date || '').slice(0, 10)
      if (!d) return false
      // If we still need to upload a close for this date, wait — don't open cloud first
      if (localCloseDates.has(d) && !done[`dayCloses:${d}`]) return false
      return true
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

  for (const row of closeSorted) {
    const date = String(row?.date || '').slice(0, 10)
    if (!date) continue
    if (done[`dayCloses:${date}`]) {
      closeOk += 1
      continue
    }
    const blockedUntil = Number(done[`dayCloses:${date}:blockedUntil`] || 0)
    if (blockedUntil && Date.now() < blockedUntil) {
      errors.push({ collection: 'dayCloses', id: String(row?._id || row?.id || date), error: 'waiting to retry cloud day-close' })
      break
    }
    const body = {
      date,
      openingCash: Number(row.openingCash || 0),
      cashSales: Number(row.cashSales || 0),
      cardSales: Number(row.cardSales || 0),
      onlineSales: Number(row.onlineSales || 0),
      complimentarySales: Number(row.complimentarySales || 0),
      staffSales: Number(row.staffSales || 0),
      returns: Number(row.returns || 0),
      handovers: Number(row.handovers || 0),
      handoverTo: String(row.handoverTo || ''),
      leftAtCounter: Number(row.leftAtCounter || 0),
      payIns: Number(row.payIns || 0),
      payOuts: Number(row.payOuts || 0),
      expectedCash: Number(row.expectedCash || 0),
      countedCash: Number(row.countedCash || 0),
      variance: Number(row.variance || 0),
      note: String(row.note || ''),
      userId: String(row.userId || ''),
      userName: String(row.userName || ''),
    }
    const tryClose = async () => cloudFetchJson(cloud, '/api/day-closes', {
      method: 'POST',
      token,
      cloudToken,
      branchId,
      body,
    })
    try {
      await tryClose()
      markDaybookRestDone(branchId, 'dayCloses', date)
      closeOk += 1
    } catch (e) {
      const msg = String(e?.message || e)
      // Already closed online = success for our purpose
      if (/already closed|409/i.test(msg)) {
        markDaybookRestDone(branchId, 'dayCloses', date)
        closeOk += 1
        continue
      }
      // Cloud still has open recalls the branch already cleared — clear them, retry once
      if (/OPEN_RECALLS|open recall/i.test(msg)) {
        await clearCloudOpenRecalls({ cloud, token, cloudToken, branchId })
        try {
          await tryClose()
          markDaybookRestDone(branchId, 'dayCloses', date)
          closeOk += 1
          continue
        } catch (e2) {
          const msg2 = String(e2?.message || e2)
          if (/already closed|409/i.test(msg2)) {
            markDaybookRestDone(branchId, 'dayCloses', date)
            closeOk += 1
            continue
          }
          errors.push({ collection: 'dayCloses', id: String(row?._id || row?.id || date), error: msg2 })
          break
        }
      }
      // Back off this date for 10 minutes so we don't hammer cloud every sync tick
      try {
        const map = loadDaybookRestDone(branchId)
        map[`dayCloses:${date}:blockedUntil`] = Date.now() + 10 * 60e3
        localStorage.setItem(daybookRestDoneKey(branchId), JSON.stringify(map))
      } catch {}
      errors.push({ collection: 'dayCloses', id: String(row?._id || row?.id || date), error: msg })
      // Don't hammer older dates if the newest close is blocked
      break
    }
  }

  for (const row of openSorted) {
    const date = String(row?.date || '').slice(0, 10)
    if (!date) continue
    if (done[`cashOpenings:${date}`]) {
      openOk += 1
      continue
    }
    try {
      const body = {
        date,
        openingCash: Number(row.openingCash || 0),
        note: String(row.note || ''),
        userId: String(row.userId || ''),
        userName: String(row.userName || ''),
      }
      await cloudFetchJson(cloud, '/api/cash-openings', {
        method: 'POST',
        token,
        cloudToken,
        branchId,
        body,
      })
      markDaybookRestDone(branchId, 'cashOpenings', date)
      openOk += 1
    } catch (e) {
      const msg = String(e?.message || e)
      if (/already open|ALREADY_OPEN|409/i.test(msg)) {
        markDaybookRestDone(branchId, 'cashOpenings', date)
        openOk += 1
        continue
      }
      errors.push({ collection: 'cashOpenings', id: String(row?._id || row?.id || date), error: msg })
      break
    }
  }

  return {
    ok: errors.length === 0,
    results: { dayCloses: closeOk, cashOpenings: openOk },
    errors,
  }
}

/** Small, first-priority push: day open/close only (before sales backlog). */
async function pushDaybookPriority({ cloud, local, token, cloudToken, branchId }) {
  const toDate = ymdLocal(new Date())
  const fromDate = ymdLocal(Date.now() - 21 * 864e5)
  const [opens, closes] = await Promise.all([
    fetchJson(
      `${local}/api/cash-openings?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`,
      { headers: authHeaders(token) },
    ),
    fetchJson(
      `${local}/api/day-closes?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`,
      { headers: authHeaders(token) },
    ),
  ])
  const openRows = Array.isArray(opens) ? opens : (Array.isArray(opens?.rows) ? opens.rows : [])
  const closeRows = Array.isArray(closes) ? closes : (Array.isArray(closes?.rows) ? closes.rows : [])
  let dayDocs = {}
  if (openRows.length) dayDocs.cashOpenings = openRows
  if (closeRows.length) dayDocs.dayCloses = closeRows
  dayDocs = mergeFailedPushDocs(branchId, dayDocs)
  // Keep only daybook collections in this priority pass
  dayDocs = {
    ...(dayDocs.cashOpenings?.length ? { cashOpenings: dayDocs.cashOpenings } : {}),
    ...(dayDocs.dayCloses?.length ? { dayCloses: dayDocs.dayCloses } : {}),
  }
  if (!batchHasRows(dayDocs)) return { ok: true, skipped: true }

  // Prefer dedicated upsert (new cloud). Falls back when VPS is older.
  try {
    const upserted = await cloudFetchJson(cloud, '/api/sync/daybook-upsert', {
      method: 'POST',
      token,
      cloudToken,
      branchId,
      body: { branchId, deviceId: deviceId(), docs: dayDocs },
    })
    if (upserted?.ok && (upserted?.results?.dayCloses != null || upserted?.results?.cashOpenings != null)) {
      const pushErrors = Array.isArray(upserted?.errors) ? upserted.errors : []
      if (pushErrors.length) {
        rememberFailedPushDocs(branchId, dayDocs, pushErrors)
        clearFailedPushDocs(branchId, dayDocs, pushErrors)
        const first = pushErrors[0]
        if (first?.error) lastError = `Push ${first.collection || 'daybook'}: ${first.error}`
        return { ok: false, errors: pushErrors }
      }
      clearFailedPushDocs(branchId, dayDocs, [])
      return { ok: true, results: upserted.results || {}, via: 'daybook-upsert' }
    }
  } catch {
    // Endpoint missing on older cloud — continue with push / REST fallback
  }

  const pushed = await cloudFetchJson(cloud, '/api/sync/push', {
    method: 'POST',
    token,
    cloudToken,
    branchId,
    body: { branchId, deviceId: deviceId(), docs: dayDocs },
  })
  const pushErrors = Array.isArray(pushed?.errors) ? pushed.errors : []
  const results = pushed?.results || {}
  // Older cloud ignores these collections entirely (no key in results)
  const cloudIgnoredDaybook =
    results.dayCloses == null && results.cashOpenings == null

  if (cloudIgnoredDaybook) {
    const rest = await pushDaybookViaRest({ cloud, token, cloudToken, branchId, dayDocs })
    if (rest.errors?.length) {
      rememberFailedPushDocs(branchId, dayDocs, rest.errors)
      clearFailedPushDocs(branchId, dayDocs, rest.errors)
      const first = rest.errors[0]
      if (first?.error) lastError = `Push ${first.collection || 'daybook'}: ${first.error}`
      return { ok: false, errors: rest.errors, via: 'rest' }
    }
    clearFailedPushDocs(branchId, dayDocs, [])
    return { ok: true, results: rest.results, via: 'rest' }
  }

  if (pushErrors.length) {
    rememberFailedPushDocs(branchId, dayDocs, pushErrors)
    clearFailedPushDocs(branchId, dayDocs, pushErrors)
    const first = pushErrors[0]
    if (first?.error) lastError = `Push ${first.collection || 'daybook'}: ${first.error}`
    return { ok: false, errors: pushErrors }
  }
  clearFailedPushDocs(branchId, dayDocs, [])
  return { ok: true, results, via: 'sync-push' }
}

/** Push local changes to cloud (drain pages so overnight offline backlog clears). */
async function pushLocal({ cloud, local, token, cloudToken, branchId }) {
  // Day open/close first — never wait behind a large sales backlog
  try {
    await pushDaybookPriority({ cloud, local, token, cloudToken, branchId })
  } catch (e) {
    if (!lastError) lastError = e?.message || 'Daybook priority push failed'
  }

  const sinceKey = `sync_push_since_${branchId}`
  let since = '1970-01-01T00:00:00.000Z'
  try { since = localStorage.getItem(sinceKey) || since } catch {}

  let pages = 0
  let lastServerTime = ''
  while (pages < MAX_DRAIN_PAGES) {
    pages += 1
    const localPull = await fetchJson(
      `${local}/api/sync/pull?branchId=${encodeURIComponent(branchId)}&since=${encodeURIComponent(since)}&deviceId=${encodeURIComponent(deviceId())}&limit=500&scope=outbound&collections=${encodeURIComponent(PUSH_COLLECTIONS.join(','))}`,
      { headers: authHeaders(token) }
    )

    const pullDocs = pickDocs(localPull.data, PUSH_COLLECTIONS)
    // Re-attach anything that failed or was skipped earlier so resync uploads it again
    const docs = mergeFailedPushDocs(branchId, pullDocs)
    lastServerTime = localPull.serverTime || lastServerTime

    if (!batchHasRows(docs)) {
      // Do NOT jump cursor to wall-clock serverTime — that permanently skips
      // sales whose updatedAt is already behind the stored since.
      break
    }

    const pushed = await cloudFetchJson(cloud, '/api/sync/push', {
      method: 'POST',
      token,
      cloudToken,
      branchId,
      body: { branchId, deviceId: deviceId(), docs },
    })

    // Do not advance the cursor past rows that failed — otherwise day open/close
    // (and other unique-key conflicts) would never retry and cloud stays on the old day.
    const pushErrors = Array.isArray(pushed?.errors) ? pushed.errors : []
    if (pushErrors.length) {
      rememberFailedPushDocs(branchId, docs, pushErrors)
      clearFailedPushDocs(branchId, docs, pushErrors)
      const failedIds = new Set(pushErrors.map((e) => String(e?.id || '')).filter(Boolean))
      const failedCols = new Set(pushErrors.map((e) => String(e?.collection || '')).filter(Boolean))
      // Keep since just before the oldest failed row so they are retried next cycle.
      // Never advance with okMax while errors remain — that skipped missed sales.
      let failMin = Infinity
      for (const [col, rows] of Object.entries(docs || {})) {
        if (!Array.isArray(rows)) continue
        for (const row of rows) {
          const rid = String(row?._id || row?.id || '')
          const hit = (rid && failedIds.has(rid)) || failedCols.has(col)
          if (!hit) continue
          const t = new Date(row?.updatedAt || 0).getTime()
          if (Number.isFinite(t) && t < failMin) failMin = t
        }
      }
      if (Number.isFinite(failMin) && failMin < Infinity) {
        const next = new Date(Math.max(0, failMin - 1)).toISOString()
        since = next
        try { localStorage.setItem(sinceKey, next) } catch {}
      }
      // Surface first error so the Cloud Sync badge shows why sales stalled
      const first = pushErrors[0]
      if (first?.error) {
        lastError = `Push ${first.collection || 'docs'}: ${first.error}`
      }
      break
    }

    // Full success — drop any queued retries that were in this batch
    clearFailedPushDocs(branchId, docs, [])

    // Advance only from incremental pull rows (not replayed retries), so a successful
    // retry of an old missed sale does not rewind the cursor and re-flood the cloud.
    if (batchHasRows(pullDocs)) {
      const advanced = maxUpdatedAt(pullDocs) || localPull.serverTime
      if (advanced) {
        let next = advanced
        const t = new Date(advanced).getTime()
        if (Number.isFinite(t) && t > 0) {
          // Step 1ms past the newest row so the next $gt pull does not drop it,
          // and 1ms back when another page is waiting so same-timestamp rows are kept.
          next = new Date(localPull.hasMore ? t - 1 : t + 1).toISOString()
        }
        since = next
        try { localStorage.setItem(sinceKey, next) } catch {}
      }
    }

    // If this page was only retries (no new pull rows), stop draining — heartbeat covers the rest
    if (!batchHasRows(pullDocs)) break
    if (!localPull.hasMore) break
  }

  // Heartbeat: daybook again (priority), then recent sales so cloud matches offline SOT.
  try {
    await pushDaybookPriority({ cloud, local, token, cloudToken, branchId })
  } catch (e) {
    if (!lastError) lastError = e?.message || 'Daybook heartbeat failed'
  }
  try {
    const toDate = ymdLocal(new Date())
    const fromDate = ymdLocal(Date.now() - 14 * 864e5)
    const [sales, deletedSales] = await Promise.all([
      fetchJson(
        `${local}/api/sales?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`,
        { headers: authHeaders(token) },
      ),
      fetchJson(
        `${local}/api/sales/deleted?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`,
        { headers: authHeaders(token) },
      ),
    ])
    const saleRows = Array.isArray(sales) ? sales : (Array.isArray(sales?.rows) ? sales.rows : [])
    const deletedRows = Array.isArray(deletedSales)
      ? deletedSales
      : (Array.isArray(deletedSales?.rows) ? deletedSales.rows : [])
    let dayDocs = {}
    if (saleRows.length) {
      dayDocs.sales = [...saleRows].sort((a, b) =>
        String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')),
      ).slice(0, 800)
    }
    if (deletedRows.length) dayDocs.deletedSales = deletedRows.slice(0, 400)
    dayDocs = mergeFailedPushDocs(branchId, dayDocs)
    // Daybook already pushed above — don't bury it in the sales payload again
    delete dayDocs.cashOpenings
    delete dayDocs.dayCloses
    if (batchHasRows(dayDocs)) {
      const hb = await cloudFetchJson(cloud, '/api/sync/push', {
        method: 'POST',
        token,
        cloudToken,
        branchId,
        body: { branchId, deviceId: deviceId(), docs: dayDocs },
      })
      const hbErrors = Array.isArray(hb?.errors) ? hb.errors : []
      if (hbErrors.length) {
        rememberFailedPushDocs(branchId, dayDocs, hbErrors)
        clearFailedPushDocs(branchId, dayDocs, hbErrors)
        const first = hbErrors[0]
        if (first?.error) lastError = `Push ${first.collection || 'docs'}: ${first.error}`
      } else {
        clearFailedPushDocs(branchId, dayDocs, [])
      }
    }
  } catch (e) {
    if (!lastError) lastError = e?.message || 'Heartbeat push failed'
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
    const pulled = await cloudFetchJson(
      cloud,
      `/api/sync/pull?branchId=${encodeURIComponent(branchId)}&since=${encodeURIComponent(since)}&deviceId=${encodeURIComponent(deviceId())}&limit=500&collections=${encodeURIComponent(PULL_COLLECTIONS.join(','))}`,
      { method: 'GET', token, cloudToken, branchId }
    )

    const data = pulled.data || {}
    const docs = pickDocs(data, PULL_COLLECTIONS)
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
  const saved = getSavedCloudUrl()
  const enabled = isCloudSyncEnabled()
  return {
    running: !!timer,
    busy: running,
    lastError,
    lastOkAt,
    enabled,
    cloud: saved,
    active: enabled ? saved : '',
    local: localApi(),
    branchId: resolveSyncBranchId(),
    offline: isBrowserOffline(),
  }
}

export async function syncOnce(token) {
  if (!isCloudSyncEnabled()) {
    lastError = ''
    return { skipped: true, reason: 'cloud sync is turned off' }
  }
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

export { CC_STATUS_RANK, PUSH_COLLECTIONS, PULL_COLLECTIONS }
