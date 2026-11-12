import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { MapPin, Navigation, Square, Play, RefreshCw, Bike, WifiOff } from 'lucide-react'
import { useAuth } from '../../state/AuthContext.jsx'
import PageHero from '../../components/ui/PageHero.jsx'

const API = () => (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'

const GEO_OPTS = { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
const GEO_OPTS_SOFT = { enableHighAccuracy: false, maximumAge: 30000, timeout: 45000 }
const RECONNECT_MS = 4000
const HEARTBEAT_MS = 15000
const QUIET_MS = 25000

/**
 * Rider phone page (PWA): share live GPS after departing the restaurant.
 * Survives brief GPS/network drops and auto-reconnects — no full app reload.
 */
export default function MyRider() {
  const { token, user } = useAuth()
  const tokenRef = useRef(token)
  tokenRef.current = token

  const [me, setMe] = useState(null)
  const [deliveries, setDeliveries] = useState([])
  const [sharing, setSharing] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [lastPing, setLastPing] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const watchRef = useRef(null)
  const wantShareRef = useRef(false) // user/session wants sharing on
  const statusRef = useRef('available')
  const sharingRef = useRef(false)
  const reconnectTimerRef = useRef(null)
  const heartbeatRef = useRef(null)
  const lastFixAtRef = useRef(0)
  const softModeRef = useRef(false)
  const permListenerRef = useRef(null)
  const aliveRef = useRef(true)

  const authHeaders = useCallback(() => {
    const t = tokenRef.current
    return t
      ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' }
  }, [])

  const load = useCallback(async () => {
    try {
      const headers = authHeaders()
      const [meRes, delRes] = await Promise.all([
        fetch(`${API()}/api/rider-tracking/me`, { headers }),
        fetch(`${API()}/api/rider-tracking/my-deliveries`, { headers }),
      ])
      const meJson = await meRes.json().catch(() => ({}))
      if (!meRes.ok) {
        setError(meJson.error || 'Could not load rider profile')
        return null
      }
      setError('')
      setMe(meJson)
      const delJson = await delRes.json().catch(() => ({}))
      if (delRes.ok) setDeliveries(Array.isArray(delJson.deliveries) ? delJson.deliveries : [])
      return meJson
    } catch {
      setError('Network error loading rider data — will retry when online')
      return null
    }
  }, [authHeaders])

  const sendPing = useCallback(async (coords, status) => {
    if (!coords || coords.latitude == null || coords.longitude == null) return false
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
          ...(status ? { status } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Ping failed')
      lastFixAtRef.current = Date.now()
      setLastPing({ at: Date.now(), lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy })
      setMe(m => ({ ...(m || {}), session: json }))
      setReconnecting(false)
      setError('')
      return true
    } catch (e) {
      console.warn('[rider] ping', e)
      // Keep sharing — network blip; heartbeat/reconnect will retry
      setReconnecting(true)
      return false
    }
  }, [authHeaders])

  const clearWatchOnly = useCallback(() => {
    if (watchRef.current != null && navigator.geolocation) {
      try { navigator.geolocation.clearWatch(watchRef.current) } catch {}
    }
    watchRef.current = null
  }, [])

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const scheduleReconnect = useCallback((reason) => {
    if (!wantShareRef.current || !aliveRef.current) return
    clearReconnectTimer()
    setReconnecting(true)
    if (reason) setError(reason)
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      if (!wantShareRef.current || !aliveRef.current) return
      // Soften accuracy after a timeout — more reliable indoors / weak GPS
      softModeRef.current = true
      // eslint-disable-next-line no-use-before-define
      startWatch(statusRef.current, { silent: true, fromReconnect: true })
    }, RECONNECT_MS)
  }, [clearReconnectTimer])

  const startWatch = useCallback((status = 'available', { silent, fromReconnect } = {}) => {
    if (!navigator.geolocation) {
      if (!silent) toast.error('GPS not available on this device')
      setError('GPS not available on this device')
      return
    }
    wantShareRef.current = true
    statusRef.current = status || statusRef.current || 'available'
    clearReconnectTimer()
    clearWatchOnly()
    sharingRef.current = true
    setSharing(true)
    if (!fromReconnect) setError('')
    if (fromReconnect) setReconnecting(true)

    const opts = softModeRef.current ? GEO_OPTS_SOFT : GEO_OPTS
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!wantShareRef.current || !sharingRef.current) return
        softModeRef.current = false
        setReconnecting(false)
        sendPing(pos.coords, statusRef.current)
      },
      (err) => {
        console.warn('[rider] geo', err?.code, err?.message)
        // PERMISSION_DENIED = 1 — only permanent stop
        if (err?.code === 1) {
          wantShareRef.current = false
          sharingRef.current = false
          setSharing(false)
          setReconnecting(false)
          clearWatchOnly()
          setError('Location blocked — enable Location for this app in phone settings')
          if (!silent) toast.error('Turn on Location and Allow for this app')
          return
        }
        // TIMEOUT (3) / POSITION_UNAVAILABLE (2) — keep intent, auto-retry
        clearWatchOnly()
        sharingRef.current = false
        setSharing(false)
        const tip = err?.code === 3
          ? 'GPS weak / timed out — reconnecting…'
          : 'Location unavailable — reconnecting…'
        scheduleReconnect(tip)
      },
      opts
    )
  }, [clearReconnectTimer, clearWatchOnly, scheduleReconnect, sendPing])

  const stopWatch = useCallback(() => {
    wantShareRef.current = false
    sharingRef.current = false
    softModeRef.current = false
    clearReconnectTimer()
    clearWatchOnly()
    setSharing(false)
    setReconnecting(false)
  }, [clearReconnectTimer, clearWatchOnly])

  // Heartbeat: if watch goes quiet or network returns, force a fix + ping
  useEffect(() => {
    heartbeatRef.current = setInterval(() => {
      if (!wantShareRef.current || !aliveRef.current) return
      const quiet = Date.now() - (lastFixAtRef.current || 0) > QUIET_MS
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      if (offline) {
        setReconnecting(true)
        setError('Offline — location will resume when internet returns')
        return
      }
      if (!sharingRef.current || quiet || watchRef.current == null) {
        if (!sharingRef.current || watchRef.current == null) {
          startWatch(statusRef.current, { silent: true, fromReconnect: true })
          return
        }
        try {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (!wantShareRef.current) return
              sendPing(pos.coords, statusRef.current)
            },
            () => {
              if (wantShareRef.current) scheduleReconnect('GPS quiet — reconnecting…')
            },
            softModeRef.current ? GEO_OPTS_SOFT : GEO_OPTS
          )
        } catch {
          scheduleReconnect('GPS error — reconnecting…')
        }
      }
    }, HEARTBEAT_MS)
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    }
  }, [scheduleReconnect, sendPing, startWatch])

  // Online / visibility → resume sharing without full reload
  useEffect(() => {
    const resume = () => {
      if (!wantShareRef.current || !aliveRef.current) return
      softModeRef.current = false
      startWatch(statusRef.current, { silent: true, fromReconnect: true })
    }
    const onOnline = () => {
      setError('')
      resume()
    }
    const onOffline = () => {
      setReconnecting(true)
      setError('Offline — location will resume when internet returns')
    }
    const onVis = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      resume()
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', resume)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', resume)
    }
  }, [startWatch])

  // Mount: load profile + auto-start GPS once (stable — no restart on every render)
  useEffect(() => {
    aliveRef.current = true
    let cancelled = false
    ;(async () => {
      const meJson = await load()
      if (cancelled || !meJson) return
      const st = meJson?.session?.status === 'on_delivery' ? 'on_delivery' : 'available'
      statusRef.current = st
      const tryStart = () => {
        if (cancelled || wantShareRef.current) return
        startWatch(st, { silent: true })
      }
      try {
        if (navigator.permissions?.query) {
          const perm = await navigator.permissions.query({ name: 'geolocation' })
          if (cancelled) return
          if (perm.state === 'denied') {
            setError('Location blocked — enable Location for this app in phone settings')
            return
          }
          tryStart()
          const onChange = () => {
            if (perm.state === 'granted') {
              softModeRef.current = false
              startWatch(statusRef.current, { silent: true, fromReconnect: true })
            }
            if (perm.state === 'denied') stopWatch()
          }
          perm.addEventListener?.('change', onChange)
          perm.onchange = onChange
          permListenerRef.current = { perm, onChange }
          return
        }
      } catch { /* Permissions API missing */ }
      tryStart()
    })()
    return () => {
      cancelled = true
      aliveRef.current = false
      try {
        const pl = permListenerRef.current
        if (pl?.perm && pl.onChange) {
          pl.perm.removeEventListener?.('change', pl.onChange)
          pl.perm.onchange = null
        }
      } catch {}
      stopWatch()
    }
    // intentionally once on mount / token change only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const depart = async (delivery) => {
    setBusy(true)
    try {
      const res = await fetch(`${API()}/api/rider-tracking/depart`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          saleId: delivery?.id || '',
          orderLabel: delivery?.billNo || delivery?.tokenNo || '',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Depart failed')
      setMe(m => ({ ...(m || {}), session: json }))
      softModeRef.current = false
      startWatch('on_delivery')
      toast.success('Departed — live location sharing')
    } catch (e) {
      toast.error(e.message || 'Failed to depart')
    } finally {
      setBusy(false)
    }
  }

  const complete = async () => {
    setBusy(true)
    try {
      const res = await fetch(`${API()}/api/rider-tracking/complete`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ keepSharing: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Complete failed')
      setMe(m => ({ ...(m || {}), session: json }))
      softModeRef.current = false
      startWatch('available')
      toast.success('Delivery marked complete')
      load()
    } catch (e) {
      toast.error(e.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const stopSharing = async () => {
    setBusy(true)
    try {
      stopWatch()
      await fetch(`${API()}/api/rider-tracking/stop`, { method: 'POST', headers: authHeaders(), body: '{}' })
      toast.success('Location sharing stopped')
      load()
    } catch {
      toast.error('Failed to stop')
    } finally {
      setBusy(false)
    }
  }

  const session = me?.session
  const onDelivery = session?.status === 'on_delivery'

  return (
    <div className="space-y-4 pb-10 w-full">
      <PageHero
        icon={Bike}
        title="Rider delivery"
        subtitle="Install on phone · GPS auto-reconnects if signal or internet drops"
        actions={
          <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white ring-1 ring-white/30">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      />

      {error ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 font-semibold flex items-start gap-2">
          {reconnecting ? <WifiOff className="h-4 w-4 shrink-0 mt-0.5" /> : null}
          <span>{error}</span>
        </div>
      ) : null}

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Rider</div>
            <div className="font-extrabold text-lg">{me?.riderName || user?.username || '—'}</div>
          </div>
          <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full ${
            onDelivery ? 'bg-emerald-100 text-emerald-800'
              : reconnecting ? 'bg-amber-100 text-amber-800'
                : sharing ? 'bg-blue-100 text-blue-800'
                  : 'bg-slate-100 text-slate-600'
          }`}>
            {onDelivery ? 'On delivery' : reconnecting ? 'Reconnecting' : sharing ? 'Sharing' : 'Offline'}
          </span>
        </div>
        {session?.orderLabel ? (
          <div className="text-sm font-semibold text-[var(--color-text-body)]">
            Active order: {session.orderLabel}
            {session.customerName ? ` · ${session.customerName}` : ''}
          </div>
        ) : null}
        {lastPing ? (
          <div className="text-xs font-semibold text-[var(--color-text-muted)] flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {lastPing.lat.toFixed(5)}, {lastPing.lng.toFixed(5)}
            {lastPing.accuracy != null ? ` · ±${Math.round(lastPing.accuracy)}m` : ''}
          </div>
        ) : (
          <div className="text-xs font-semibold text-[var(--color-text-muted)]">No GPS ping yet</div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {!sharing && !reconnecting ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                softModeRef.current = false
                startWatch(onDelivery ? 'on_delivery' : 'available')
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Start / Retry location
            </button>
          ) : reconnecting && !sharing ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                softModeRef.current = false
                startWatch(statusRef.current || (onDelivery ? 'on_delivery' : 'available'), { fromReconnect: true })
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4 animate-spin" /> Reconnecting… tap to retry now
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={stopSharing}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Square className="h-4 w-4" /> Stop sharing
            </button>
          )}
          {onDelivery ? (
            <button
              type="button"
              disabled={busy}
              onClick={complete}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Navigation className="h-4 w-4" /> Complete delivery
            </button>
          ) : null}
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)] font-medium">
          Keep phone Location ON. If GPS or internet drops, sharing reconnects automatically — no need to reload the app.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] font-extrabold">Today’s deliveries</div>
        <div className="divide-y divide-[var(--color-border)]">
          {deliveries.length === 0 ? (
            <div className="p-6 text-center text-sm font-semibold text-[var(--color-text-muted)]">
              No delivery sales assigned to you today yet.
            </div>
          ) : deliveries.map(d => (
            <div key={d.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-bold truncate">{d.billNo || d.tokenNo || d.id}</div>
                <div className="text-xs font-semibold text-[var(--color-text-muted)]">
                  {d.customerName || 'Customer'}{d.customerAddress ? ` · ${d.customerAddress}` : ''}
                </div>
                <div className="text-xs font-extrabold">PKR {Number(d.total || 0).toLocaleString()}</div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => depart(d)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                <Navigation className="h-4 w-4" /> Depart
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
