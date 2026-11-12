import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { MapPin, Navigation, Square, Play, RefreshCw, Bike, WifiOff } from 'lucide-react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useRiderLocation } from '../../state/RiderLocationContext.jsx'
import PageHero from '../../components/ui/PageHero.jsx'

const API = () => (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'

/**
 * Rider phone UI. GPS sharing lives in RiderLocationProvider (app-wide),
 * so leaving this page / opening WhatsApp does not stop tracking.
 */
export default function MyRider() {
  const { token, user } = useAuth()
  const {
    sharing,
    reconnecting,
    lastPing,
    error,
    status,
    startSharing,
    stopSharing,
    setDeliveryStatus,
  } = useRiderLocation()

  const [me, setMe] = useState(null)
  const [deliveries, setDeliveries] = useState([])
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')

  const authHeaders = useCallback(() => (
    token
      ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' }
  ), [token])

  const load = useCallback(async () => {
    try {
      const headers = authHeaders()
      const [meRes, delRes] = await Promise.all([
        fetch(`${API()}/api/rider-tracking/me`, { headers }),
        fetch(`${API()}/api/rider-tracking/my-deliveries`, { headers }),
      ])
      const meJson = await meRes.json().catch(() => ({}))
      if (!meRes.ok) {
        setLoadError(meJson.error || 'Could not load rider profile')
        return null
      }
      setLoadError('')
      setMe(meJson)
      const delJson = await delRes.json().catch(() => ({}))
      if (delRes.ok) setDeliveries(Array.isArray(delJson.deliveries) ? delJson.deliveries : [])
      return meJson
    } catch {
      setLoadError('Network error loading rider data')
      return null
    }
  }, [authHeaders])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const meJson = await load()
      if (cancelled || !meJson) return
      const st = meJson?.session?.status === 'on_delivery' ? 'on_delivery' : 'available'
      // Start (or keep) app-wide sharing — does not stop when leaving this page
      if (!sharing) startSharing(st, { silent: true })
      else if (st === 'on_delivery') setDeliveryStatus('on_delivery')
    })()
    return () => { cancelled = true }
    // Do NOT stop sharing on unmount
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
      setDeliveryStatus('on_delivery')
      startSharing('on_delivery')
      toast.success('Departed — location keeps sharing even if you open WhatsApp')
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
      setDeliveryStatus('available')
      startSharing('available')
      toast.success('Delivery marked complete')
      load()
    } catch (e) {
      toast.error(e.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const onStop = async () => {
    setBusy(true)
    try {
      await stopSharing({ notifyServer: true })
      toast.success('Location sharing stopped')
      load()
    } catch {
      toast.error('Failed to stop')
    } finally {
      setBusy(false)
    }
  }

  const session = me?.session
  const onDelivery = session?.status === 'on_delivery' || status === 'on_delivery'
  const banner = error || loadError

  return (
    <div className="space-y-4 pb-10 w-full">
      <PageHero
        icon={Bike}
        title="Rider delivery"
        subtitle="Turn phone Location ON · tap Allow once · keeps sharing when minimized"
        actions={
          <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white ring-1 ring-white/30">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      />

      {banner ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 font-semibold flex items-start gap-2">
          {reconnecting ? <WifiOff className="h-4 w-4 shrink-0 mt-0.5" /> : null}
          <span>{banner}</span>
        </div>
      ) : null}

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm font-medium text-emerald-900 dark:text-emerald-100">
        <b>How to use:</b> turn Location ON on the phone, open this page, tap <b>Allow</b> once when asked.
        No need to change App Settings. Minimize or open WhatsApp — GPS keeps updating until you tap <b>Stop sharing</b>.
        (Force-closing the app from Recents still stops GPS; open the app again and it resumes.)
      </div>

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
              onClick={() => startSharing(onDelivery ? 'on_delivery' : 'available')}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Start location
            </button>
          ) : reconnecting && !sharing ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => startSharing(onDelivery ? 'on_delivery' : 'available', { fromReconnect: true })}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4 animate-spin" /> Reconnecting… tap to retry now
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onStop}
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
