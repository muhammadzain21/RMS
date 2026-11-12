import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { MapPin, Navigation, Square, Play, RefreshCw, Bike } from 'lucide-react'
import { useAuth } from '../../state/AuthContext.jsx'
import PageHero from '../../components/ui/PageHero.jsx'

const API = () => (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'

/**
 * Rider phone page (PWA): share live GPS after departing the restaurant.
 * Login must be linked to a Staff profile (position Rider recommended).
 */
export default function MyRider() {
  const { token, user } = useAuth()
  const headers = token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' }

  const [me, setMe] = useState(null)
  const [deliveries, setDeliveries] = useState([])
  const [sharing, setSharing] = useState(false)
  const [lastPing, setLastPing] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const watchRef = useRef(null)
  const sharingRef = useRef(false)

  const load = useCallback(async () => {
    try {
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
      setError('Network error loading rider data')
      return null
    }
  }, [token])

  const sendPing = useCallback(async (coords, status) => {
    try {
      const res = await fetch(`${API()}/api/rider-tracking/ping`, {
        method: 'POST',
        headers,
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
      setLastPing({ at: Date.now(), lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy })
      setMe(m => ({ ...(m || {}), session: json }))
      return true
    } catch (e) {
      console.warn('[rider] ping', e)
      return false
    }
  }, [headers])

  const stopWatch = useCallback(() => {
    if (watchRef.current != null && navigator.geolocation) {
      try { navigator.geolocation.clearWatch(watchRef.current) } catch {}
    }
    watchRef.current = null
    sharingRef.current = false
    setSharing(false)
  }, [])

  const startWatch = useCallback((status = 'available', { silent } = {}) => {
    if (!navigator.geolocation) {
      if (!silent) toast.error('GPS not available on this device')
      return
    }
    if (watchRef.current != null) {
      try { navigator.geolocation.clearWatch(watchRef.current) } catch {}
      watchRef.current = null
    }
    sharingRef.current = true
    setSharing(true)
    setError('')
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!sharingRef.current) return
        sendPing(pos.coords, status)
      },
      (err) => {
        console.warn('[rider] geo', err)
        sharingRef.current = false
        setSharing(false)
        watchRef.current = null
        setError(err?.message || 'Location permission denied')
        if (!silent) toast.error('Turn on Location and Allow for this app')
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    )
  }, [sendPing])

  // Auto-start GPS when rider opens this page (phone Location must be on + permission Allow).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const meJson = await load()
      if (cancelled || !meJson) return
      const st = meJson?.session?.status === 'on_delivery' ? 'on_delivery' : 'available'
      const tryStart = () => {
        if (cancelled || sharingRef.current) return
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
          // granted or prompt: start; browser asks once if needed
          tryStart()
          perm.onchange = () => {
            if (perm.state === 'granted') tryStart()
            if (perm.state === 'denied') stopWatch()
          }
          return
        }
      } catch { /* Permissions API missing (e.g. some iOS) — still try */ }
      tryStart()
    })()
    return () => { cancelled = true }
  }, [load, startWatch, stopWatch])

  const depart = async (delivery) => {
    setBusy(true)
    try {
      const res = await fetch(`${API()}/api/rider-tracking/depart`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          saleId: delivery?.id || '',
          orderLabel: delivery?.billNo || delivery?.tokenNo || '',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Depart failed')
      setMe(m => ({ ...(m || {}), session: json }))
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
        headers,
        body: JSON.stringify({ keepSharing: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Complete failed')
      setMe(m => ({ ...(m || {}), session: json }))
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
      await fetch(`${API()}/api/rider-tracking/stop`, { method: 'POST', headers, body: '{}' })
      toast.success('Location sharing stopped')
      load()
    } catch {
      toast.error('Failed to stop')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => () => stopWatch(), [stopWatch])

  const session = me?.session
  const onDelivery = session?.status === 'on_delivery'

  return (
    <div className="space-y-4 pb-10 w-full">
      <PageHero
        icon={Bike}
        title="Rider delivery"
        subtitle="Install on phone · GPS starts automatically when Location is allowed"
        actions={
          <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white ring-1 ring-white/30">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      />

      {error ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 font-semibold">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Rider</div>
            <div className="font-extrabold text-lg">{me?.riderName || user?.username || '—'}</div>
          </div>
          <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full ${
            onDelivery ? 'bg-emerald-100 text-emerald-800' : sharing ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
          }`}>
            {onDelivery ? 'On delivery' : sharing ? 'Sharing' : 'Offline'}
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
          {!sharing ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => startWatch(onDelivery ? 'on_delivery' : 'available')}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Retry location
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
          Keep phone Location ON. First open: tap Allow when asked. After that GPS shares automatically while this page/PWA is open. Use Depart when leaving the restaurant.
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
