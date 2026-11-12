import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { MapPinned, RefreshCw, Bike, ExternalLink } from 'lucide-react'
import { useAuth } from '../../state/AuthContext.jsx'
import PageHero from '../../components/ui/PageHero.jsx'

const API = () => (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'

function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L)
    const cssId = 'leaflet-css'
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link')
      link.id = cssId
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    const existing = document.querySelector('script[data-leaflet]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L))
      existing.addEventListener('error', reject)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.async = true
    script.dataset.leaflet = '1'
    script.onload = () => resolve(window.L)
    script.onerror = reject
    document.body.appendChild(script)
  })
}

/** Restaurant / manager live map of riders sharing GPS from the PWA. */
export default function RiderLiveMap() {
  const { token } = useAuth()
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const [riders, setRiders] = useState([])
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState('')
  const [netError, setNetError] = useState('')
  const lastToastAt = useRef(0)

  const headers = token ? { Authorization: `Bearer ${token}` } : {}

  const ensureMap = useCallback(async () => {
    const L = await loadLeaflet()
    if (!mapEl.current) return L
    if (!mapRef.current) {
      mapRef.current = L.map(mapEl.current).setView([31.5204, 74.3587], 12) // default Lahore-ish; fits Pakistan cities
      // Carto tiles are more reliable behind some firewalls than osm.org directly
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        crossOrigin: true,
      }).addTo(mapRef.current)
    }
    return L
  }, [])

  const paint = useCallback(async (list) => {
    try {
      const L = await ensureMap()
      if (!mapRef.current) return
      const ids = new Set()
      const latLngs = []
      for (const r of list || []) {
        if (r.lat == null || r.lng == null) continue
        const id = String(r.riderId)
        ids.add(id)
        latLngs.push([r.lat, r.lng])
        const label = `${r.riderName || 'Rider'}${r.status === 'on_delivery' ? ' · delivery' : ''}${r.stale ? ' · stale' : ''}`
        if (markersRef.current[id]) {
          markersRef.current[id].setLatLng([r.lat, r.lng])
          markersRef.current[id].bindPopup(
            `<b>${r.riderName || 'Rider'}</b><br/>${r.status}${r.orderLabel ? `<br/>Order: ${r.orderLabel}` : ''}${r.customerAddress ? `<br/>${r.customerAddress}` : ''}<br/><small>${r.ageSeconds != null ? `${r.ageSeconds}s ago` : ''}</small>`
          )
        } else {
          const m = L.marker([r.lat, r.lng]).addTo(mapRef.current)
          m.bindPopup(
            `<b>${r.riderName || 'Rider'}</b><br/>${r.status}${r.orderLabel ? `<br/>Order: ${r.orderLabel}` : ''}${r.customerAddress ? `<br/>${r.customerAddress}` : ''}`
          )
          m.bindTooltip(label, { permanent: false })
          markersRef.current[id] = m
        }
      }
      Object.keys(markersRef.current).forEach((id) => {
        if (!ids.has(id)) {
          try { mapRef.current.removeLayer(markersRef.current[id]) } catch {}
          delete markersRef.current[id]
        }
      })
      if (latLngs.length === 1) mapRef.current.setView(latLngs[0], 14)
      else if (latLngs.length > 1) mapRef.current.fitBounds(L.latLngBounds(latLngs).pad(0.2))
    } catch (e) {
      console.warn('[RiderLiveMap]', e)
    }
  }, [ensureMap])

  const reload = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setNetError('Offline — live locations pause until internet returns')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API()}/api/rider-tracking/live`, { headers, cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `Failed to load (${res.status})`)
      const list = Array.isArray(json.riders) ? json.riders : []
      setRiders(list)
      setUpdatedAt(new Date().toLocaleTimeString())
      setNetError('')
      await paint(list)
    } catch (e) {
      const msg = e?.message || 'Live map failed'
      setNetError(msg)
      // Avoid toast spam every 8s while polling
      const now = Date.now()
      if (now - lastToastAt.current > 20000) {
        lastToastAt.current = now
        toast.error(msg)
      }
    } finally {
      setLoading(false)
    }
  }, [headers, paint])

  useEffect(() => {
    reload()
    const t = setInterval(reload, 8000)
    return () => {
      clearInterval(t)
      try {
        Object.values(markersRef.current).forEach((m) => {
          try { mapRef.current?.removeLayer(m) } catch {}
        })
        markersRef.current = {}
        mapRef.current?.remove()
        mapRef.current = null
      } catch {}
    }
  }, [reload])

  return (
    <div className="space-y-4 pb-10">
      <PageHero
        icon={MapPinned}
        title="Rider live map"
        subtitle="See riders who are sharing location from the Rider PWA after they depart"
        actions={
          <button type="button" onClick={reload} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-blue-700 shadow-lg">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />

      {netError ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm font-semibold text-amber-900 dark:text-amber-100">
          {netError}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm bg-[var(--color-surface)]">
          <div ref={mapEl} className="w-full h-[min(70vh,640px)] min-h-[360px] z-0" />
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
            <div className="font-extrabold flex items-center gap-2"><Bike className="h-4 w-4" /> On the road</div>
            <div className="text-[10px] font-semibold text-[var(--color-text-muted)]">{updatedAt || '—'}</div>
          </div>
          <div className="divide-y divide-[var(--color-border)] max-h-[min(70vh,640px)] overflow-auto">
            {riders.length === 0 ? (
              <div className="p-6 text-sm font-semibold text-[var(--color-text-muted)] text-center">
                No active riders. Rider opens staff app → Rider delivery (/rider) with Location on.
              </div>
            ) : riders.map(r => (
              <div key={r.riderId} className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold truncate">{r.riderName || r.riderId}</div>
                  <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                    r.stale ? 'bg-amber-100 text-amber-800' : r.status === 'on_delivery' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {r.stale ? 'Stale' : r.status === 'on_delivery' ? 'Delivery' : 'Available'}
                  </span>
                </div>
                {r.orderLabel ? <div className="text-xs font-semibold">Order: {r.orderLabel}</div> : null}
                {r.customerAddress ? <div className="text-xs text-[var(--color-text-muted)] font-medium">{r.customerAddress}</div> : null}
                <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                  {r.ageSeconds != null ? `Updated ${r.ageSeconds}s ago` : '—'}
                  {r.lat != null ? ` · ${Number(r.lat).toFixed(4)}, ${Number(r.lng).toFixed(4)}` : ''}
                </div>
                {r.lat != null && r.lng != null ? (
                  <a
                    className="inline-flex items-center gap-1 text-xs font-bold text-blue-600"
                    href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Maps <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
