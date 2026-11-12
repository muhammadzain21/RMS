import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { getFixOnce, GEO_OPTS_BG, requestLocationAccess, watchLocation } from '../utils/riderGeo.js'

const API = () => (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
const STORE_KEY = 'rms_rider_share_v1'
const RECONNECT_MS = 3000
const HEARTBEAT_MS = 10000
const QUIET_MS = 18000
const FG_PING_MS = 15000
const BG_PING_MS = 8000 // faster while minimized so live map still moves

const RiderLocationContext = createContext(null)

function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const j = JSON.parse(raw)
    return j && typeof j === 'object' ? j : null
  } catch {
    return null
  }
}

function writeStore(patch) {
  try {
    const prev = readStore() || {}
    const next = { ...prev, ...patch, updatedAt: Date.now() }
    localStorage.setItem(STORE_KEY, JSON.stringify(next))
    return next
  } catch {
    return null
  }
}

function clearStore() {
  try { localStorage.removeItem(STORE_KEY) } catch {}
}

function isPageHidden() {
  try { return typeof document !== 'undefined' && document.hidden } catch { return false }
}

/**
 * App-wide rider GPS.
 * - Permission: one phone "Allow" prompt when Location is ON (not App Settings).
 * - Minimize / WhatsApp: keep polling GPS + pinging server.
 */
export function RiderLocationProvider({ children }) {
  const { token, user } = useAuth()
  const tokenRef = useRef(token)
  const userRef = useRef(user)
  tokenRef.current = token
  userRef.current = user

  const [sharing, setSharing] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [lastPing, setLastPing] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('available')
  const [minimized, setMinimized] = useState(false)

  const watchClearRef = useRef(null)
  const wantShareRef = useRef(false)
  const statusRef = useRef('available')
  const sharingRef = useRef(false)
  const softModeRef = useRef(false)
  const reconnectTimerRef = useRef(null)
  const heartbeatRef = useRef(null)
  const pingTimerRef = useRef(null)
  const lastFixAtRef = useRef(0)
  const wakeLockRef = useRef(null)
  const startedForUserRef = useRef('')
  const startingRef = useRef(false)

  const authHeaders = useCallback(() => {
    const t = tokenRef.current
    return t
      ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' }
  }, [])

  const clearWatchOnly = useCallback(() => {
    try { watchClearRef.current?.() } catch {}
    watchClearRef.current = null
  }, [])

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const releaseWakeLock = useCallback(async () => {
    try { await wakeLockRef.current?.release?.() } catch {}
    wakeLockRef.current = null
  }, [])

  const requestWakeLock = useCallback(async () => {
    try {
      if (!wantShareRef.current || isPageHidden()) return
      if (!('wakeLock' in navigator)) return
      await releaseWakeLock()
      wakeLockRef.current = await navigator.wakeLock.request('screen')
    } catch {}
  }, [releaseWakeLock])

  const sendPing = useCallback(async (coords, st) => {
    if (!coords || coords.latitude == null || coords.longitude == null) return false
    if (!tokenRef.current) return false
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
      const res = await fetch(`${API()}/api/rider-tracking/ping`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          heading: coords.heading,
          speed: coords.speed,
          ...(st ? { status: st } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Ping failed')
      lastFixAtRef.current = Date.now()
      setLastPing({
        at: Date.now(),
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: coords.accuracy,
      })
      setReconnecting(false)
      setError('')
      writeStore({
        wantShare: true,
        status: statusRef.current,
        userId: String(userRef.current?.id || userRef.current?._id || ''),
        staffId: String(userRef.current?.staffId || ''),
        lastLat: coords.latitude,
        lastLng: coords.longitude,
      })
      return true
    } catch (e) {
      console.warn('[rider-share] ping', e)
      setReconnecting(true)
      return false
    }
  }, [authHeaders])

  const scheduleReconnect = useCallback((reason) => {
    if (!wantShareRef.current) return
    clearReconnectTimer()
    setReconnecting(true)
    if (reason) setError(reason)
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      if (!wantShareRef.current) return
      softModeRef.current = true
      // eslint-disable-next-line no-use-before-define
      startWatch(statusRef.current, { silent: true, fromReconnect: true })
    }, RECONNECT_MS)
  }, [clearReconnectTimer])

  const startWatch = useCallback(async (st = 'available', { silent, fromReconnect } = {}) => {
    if (!navigator.geolocation) {
      setError('This phone cannot share GPS')
      return false
    }
    if (!tokenRef.current) {
      setError('Login required to share location')
      return false
    }
    if (startingRef.current) return false
    startingRef.current = true

    try {
      wantShareRef.current = true
      statusRef.current = st || statusRef.current || 'available'
      setStatus(statusRef.current)
      clearReconnectTimer()
      clearWatchOnly()

      // First time (or after Location was off): show the normal Allow dialog — not Settings
      if (!fromReconnect && !silent) {
        const access = await requestLocationAccess()
        if (!access.ok && !access.soft) {
          if (access.reason === 'denied') {
            wantShareRef.current = false
            sharingRef.current = false
            setSharing(false)
            setError(access.message)
            return false
          }
          if (access.reason === 'off') {
            setError(access.message)
            // Keep wantShare so when they turn Location ON we auto-continue
            scheduleReconnect(access.message)
            return false
          }
          setError(access.message || 'Waiting for GPS…')
        } else if (access.ok && access.coords) {
          await sendPing(access.coords, statusRef.current)
        } else if (access.soft) {
          setError(access.message)
        }
      } else if (fromReconnect) {
        // Quiet re-check — if Location was turned off, say so simply
        const access = await requestLocationAccess()
        if (!access.ok && access.reason === 'off') {
          scheduleReconnect(access.message)
          sharingRef.current = false
          setSharing(false)
          return false
        }
        if (!access.ok && access.reason === 'denied') {
          wantShareRef.current = false
          sharingRef.current = false
          setSharing(false)
          clearStore()
          setError(access.message)
          return false
        }
        if (access.ok && access.coords) await sendPing(access.coords, statusRef.current)
      }

      sharingRef.current = true
      setSharing(true)
      if (!fromReconnect) setError('')
      if (fromReconnect) setReconnecting(true)

      writeStore({
        wantShare: true,
        status: statusRef.current,
        userId: String(userRef.current?.id || userRef.current?._id || ''),
        staffId: String(userRef.current?.staffId || ''),
      })

      const bg = isPageHidden()
      const handle = watchLocation({
        soft: softModeRef.current,
        background: bg,
        onFix: (coords) => {
          if (!wantShareRef.current || !sharingRef.current) return
          softModeRef.current = false
          setReconnecting(false)
          sendPing(coords, statusRef.current)
        },
        onError: (err) => {
          console.warn('[rider-share] geo', err?.code, err?.message)
          if (err?.code === 1) {
            wantShareRef.current = false
            sharingRef.current = false
            setSharing(false)
            setReconnecting(false)
            clearWatchOnly()
            clearStore()
            setError('Location was blocked. Tap Start again and choose Allow on the phone prompt.')
            return
          }
          clearWatchOnly()
          sharingRef.current = false
          setSharing(false)
          const tip = err?.code === 2
            ? 'Turn ON Location (GPS) on your phone — then sharing continues automatically.'
            : 'GPS weak / timed out — reconnecting…'
          scheduleReconnect(tip)
        },
      })
      watchClearRef.current = handle.clear
      requestWakeLock()
      return true
    } finally {
      startingRef.current = false
    }
  }, [clearReconnectTimer, clearWatchOnly, requestWakeLock, scheduleReconnect, sendPing])

  const stopSharing = useCallback(async ({ notifyServer = true } = {}) => {
    wantShareRef.current = false
    sharingRef.current = false
    softModeRef.current = false
    clearReconnectTimer()
    clearWatchOnly()
    setSharing(false)
    setReconnecting(false)
    setError('')
    clearStore()
    await releaseWakeLock()
    if (notifyServer && tokenRef.current) {
      try {
        await fetch(`${API()}/api/rider-tracking/stop`, {
          method: 'POST',
          headers: authHeaders(),
          body: '{}',
        })
      } catch {}
    }
  }, [authHeaders, clearReconnectTimer, clearWatchOnly, releaseWakeLock])

  const setDeliveryStatus = useCallback((st) => {
    statusRef.current = st || 'available'
    setStatus(statusRef.current)
    writeStore({ status: statusRef.current, wantShare: wantShareRef.current })
    if (wantShareRef.current) {
      softModeRef.current = false
      startWatch(statusRef.current, { silent: true })
    }
  }, [startWatch])

  // Heartbeat + minimize-aware GPS polling (works while app is in background/WhatsApp)
  useEffect(() => {
    const tickPing = async () => {
      if (!wantShareRef.current) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setReconnecting(true)
        setError('Offline — location resumes when internet returns')
        return
      }
      const coords = await getFixOnce(GEO_OPTS_BG)
      if (coords && wantShareRef.current) {
        softModeRef.current = false
        await sendPing(coords, statusRef.current)
        if (!sharingRef.current) {
          sharingRef.current = true
          setSharing(true)
        }
        return
      }
      if (wantShareRef.current && Date.now() - (lastFixAtRef.current || 0) > QUIET_MS) {
        scheduleReconnect('Getting GPS while minimized…')
      }
    }

    const armPingTimer = () => {
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
      const ms = isPageHidden() ? BG_PING_MS : FG_PING_MS
      pingTimerRef.current = setInterval(tickPing, ms)
    }

    heartbeatRef.current = setInterval(() => {
      if (!wantShareRef.current) return
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      if (offline) {
        setReconnecting(true)
        setError('Offline — location resumes when internet returns')
        return
      }
      const quiet = Date.now() - (lastFixAtRef.current || 0) > QUIET_MS
      if (!sharingRef.current || !watchClearRef.current) {
        startWatch(statusRef.current, { silent: true, fromReconnect: true })
        return
      }
      if (quiet) tickPing()
    }, HEARTBEAT_MS)

    armPingTimer()

    const onVis = () => {
      const hidden = isPageHidden()
      setMinimized(hidden)
      armPingTimer()
      if (!wantShareRef.current) return
      if (hidden) {
        // Minimized — keep sharing; force a fix immediately
        setReconnecting(true)
        tickPing()
      } else {
        softModeRef.current = false
        startWatch(statusRef.current, { silent: true, fromReconnect: true })
        requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [requestWakeLock, scheduleReconnect, sendPing, startWatch])

  useEffect(() => {
    const resume = () => {
      if (!wantShareRef.current) return
      softModeRef.current = false
      startWatch(statusRef.current, { silent: true, fromReconnect: true })
      requestWakeLock()
    }
    const onOnline = () => { setError(''); resume() }
    const onOffline = () => {
      setReconnecting(true)
      setError('Offline — location resumes when internet returns')
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('focus', resume)
    window.addEventListener('pageshow', resume)

    let capHandle = null
    ;(async () => {
      try {
        if (!window.Capacitor) return
        const { App } = await import('@capacitor/app')
        capHandle = await App.addListener('appStateChange', ({ isActive }) => {
          setMinimized(!isActive)
          if (isActive) resume()
          else if (wantShareRef.current) {
            // App minimized — keep intent; polling timer still runs in WebView when possible
            setReconnecting(true)
            getFixOnce(GEO_OPTS_BG).then((c) => {
              if (c && wantShareRef.current) sendPing(c, statusRef.current)
            })
          }
        })
      } catch {}
    })()

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('focus', resume)
      window.removeEventListener('pageshow', resume)
      try { capHandle?.remove?.() } catch {}
    }
  }, [requestWakeLock, sendPing, startWatch])

  // Auto-resume after login / reopen
  useEffect(() => {
    if (!token || !user?.staffId) {
      clearWatchOnly()
      sharingRef.current = false
      setSharing(false)
      startedForUserRef.current = ''
      return
    }
    const uid = String(user.id || user._id || '')
    if (startedForUserRef.current === uid) return
    startedForUserRef.current = uid

    const stored = readStore()
    if (!stored?.wantShare) return
    const sameUser = !stored.userId || stored.userId === uid || stored.staffId === String(user.staffId)
    if (!sameUser) {
      clearStore()
      return
    }
    statusRef.current = stored.status === 'on_delivery' ? 'on_delivery' : 'available'
    setStatus(statusRef.current)
    wantShareRef.current = true
    startWatch(statusRef.current, { silent: true, fromReconnect: true })
  }, [token, user, clearWatchOnly, startWatch])

  const value = useMemo(() => ({
    sharing,
    reconnecting,
    lastPing,
    error,
    status,
    minimized,
    startSharing: startWatch,
    stopSharing,
    setDeliveryStatus,
    clearError: () => setError(''),
  }), [sharing, reconnecting, lastPing, error, status, minimized, startWatch, stopSharing, setDeliveryStatus])

  return (
    <RiderLocationContext.Provider value={value}>
      {children}
    </RiderLocationContext.Provider>
  )
}

export function useRiderLocation() {
  const ctx = useContext(RiderLocationContext)
  if (!ctx) throw new Error('useRiderLocation requires RiderLocationProvider')
  return ctx
}
