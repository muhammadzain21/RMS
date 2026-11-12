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
      if (window.L) return resolve(window.L)
      existing.addEventListener('load', () => resolve(window.L), { once: true })
      existing.addEventListener('error', reject, { once: true })
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

function fixDefaultIcons(L) {
  try {
    // CDN Leaflet loses image paths under Vite bundling; point markers at unpkg
    delete L.Icon.Default.prototype._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })
  } catch {}
}

/** Wheel-zoom setTimeouts can fire after map.remove() and crash the whole app. */
function hardenLeaflet(L) {
  if (!L || L.__rmsHardened) return
  L.__rmsHardened = true
  try {
    const origGetPos = L.DomUtil.getPosition
    L.DomUtil.getPosition = function (el) {
      if (!el) return new L.Point(0, 0)
      try {
        return origGetPos.call(this, el)
      } catch {
        return new L.Point(0, 0)
      }
    }
  } catch {}
  try {
    const Proto = L.Map?.prototype
    if (Proto && !Proto.__rmsSafeZoom) {
      Proto.__rmsSafeZoom = true
      const origSetZoomAround = Proto.setZoomAround
      Proto.setZoomAround = function (...args) {
        try {
          if (!this || !this._mapPane || this._removed) return this
          return origSetZoomAround.apply(this, args)
        } catch {
          return this
        }
      }
    }
  } catch {}
}

function safeMapCall(map, fn) {
  try {
    if (!map || !map._loaded || !map._mapPane) return null
    return fn(map)
  } catch (e) {
    console.warn('[RiderLiveMap] map op skipped', e)
    return null
  }
}

/** Restaurant / manager live map of riders sharing GPS from the PWA. */
export default function RiderLiveMap() {
  const { token } = useAuth()
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const aliveRef = useRef(true)
  const tokenRef = useRef(token)
  const [riders, setRiders] = useState([])
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState('')
  const [netError, setNetError] = useState('')
  const [mapReady, setMapReady] = useState(false)
  const lastToastAt = useRef(0)

  tokenRef.current = token

  const invalidate = useCallback(() => {
    safeMapCall(mapRef.current, (map) => {
      map.invalidateSize({ animate: false })
    })
  }, [])

  const paint = useCallback((list) => {
    const map = mapRef.current
    const L = window.L
    if (!map || !L || !aliveRef.current) return
    try {
      if (!map._loaded || !map._mapPane) return
      const ids = new Set()
      const latLngs = []
      for (const r of list || []) {
        if (r.lat == null || r.lng == null || Number.isNaN(Number(r.lat)) || Number.isNaN(Number(r.lng))) continue
        const id = String(r.riderId)
        ids.add(id)
        const latlng = [Number(r.lat), Number(r.lng)]
        latLngs.push(latlng)
        const popup = `<b>${r.riderName || 'Rider'}</b><br/>${r.status}${r.orderLabel ? `<br/>Order: ${r.orderLabel}` : ''}${r.customerAddress ? `<br/>${r.customerAddress}` : ''}<br/><small>${r.ageSeconds != null ? `${r.ageSeconds}s ago` : ''}</small>`
        const label = `${r.riderName || 'Rider'}${r.status === 'on_delivery' ? ' · delivery' : ''}${r.stale ? ' · stale' : ''}`
        if (markersRef.current[id]) {
          markersRef.current[id].setLatLng(latlng)
          markersRef.current[id].setPopupContent(popup)
          markersRef.current[id].setTooltipContent(label)
        } else {
          const m = L.marker(latlng).addTo(map)
          m.bindPopup(popup)
          m.bindTooltip(label, { permanent: false })
          markersRef.current[id] = m
        }
      }
      Object.keys(markersRef.current).forEach((id) => {
        if (!ids.has(id)) {
          try { map.removeLayer(markersRef.current[id]) } catch {}
          delete markersRef.current[id]
        }
      })
      if (latLngs.length === 1) {
        safeMapCall(map, (m) => m.setView(latLngs[0], Math.max(m.getZoom(), 14), { animate: false }))
      } else if (latLngs.length > 1) {
        safeMapCall(map, (m) => m.fitBounds(L.latLngBounds(latLngs).pad(0.25), { animate: false, maxZoom: 15 }))
      }
      invalidate()
    } catch (e) {
      console.warn('[RiderLiveMap] paint', e)
    }
  }, [invalidate])

  const reload = useCallback(async () => {
    if (!aliveRef.current) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setNetError('Offline — live locations pause until internet returns')
      return
    }
    setLoading(true)
    try {
      const t = tokenRef.current
      const headers = t ? { Authorization: `Bearer ${t}` } : {}
      const res = await fetch(`${API()}/api/rider-tracking/live`, { headers, cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!aliveRef.current) return
      if (!res.ok) throw new Error(json.error || `Failed to load (${res.status})`)
      const list = Array.isArray(json.riders) ? json.riders : []
      setRiders(list)
      setUpdatedAt(new Date().toLocaleTimeString())
      setNetError('')
      paint(list)
    } catch (e) {
      if (!aliveRef.current) return
      const msg = e?.message || 'Live map failed'
      setNetError(msg)
      const now = Date.now()
      if (now - lastToastAt.current > 20000) {
        lastToastAt.current = now
        toast.error(msg)
      }
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }, [paint])

  // Create map once; never tear it down on poll / token object churn
  useEffect(() => {
    aliveRef.current = true
    let cancelled = false
    let resizeObs = null
    let roTimer = null

    ;(async () => {
      try {
        const L = await loadLeaflet()
        if (cancelled || !mapEl.current || !aliveRef.current) return
        fixDefaultIcons(L)
        hardenLeaflet(L)

        // Re-init if a previous instance left Leaflet's internal id on the node
        if (mapEl.current._leaflet_id) {
          try {
            const old = mapEl.current._leaflet_id
            if (L.Map?._instances?.[old]) L.Map._instances[old].remove()
          } catch {}
          try { delete mapEl.current._leaflet_id } catch {}
          mapEl.current.innerHTML = ''
        }

        const map = L.map(mapEl.current, {
          zoomControl: true,
          scrollWheelZoom: true,
          fadeAnimation: false,
          zoomAnimation: true,
          markerZoomAnimation: false,
        }).setView([31.5204, 74.3587], 12)

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 19,
          subdomains: 'abcd',
          attribution: '&copy; OpenStreetMap &copy; CARTO',
          crossOrigin: true,
          errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        }).addTo(map)

        // Fallback tiles if Carto is blocked
        map.whenReady(() => {
          try {
            const layers = []
            map.eachLayer((ly) => { if (ly instanceof L.TileLayer) layers.push(ly) })
            // keep carto; osm as silent backup if needed later
            void layers
          } catch {}
        })

        mapRef.current = map
        setMapReady(true)

        // Grey pane = size measured as 0; fix after layout / fonts / sidebar
        requestAnimationFrame(() => {
          invalidate()
          setTimeout(invalidate, 80)
          setTimeout(invalidate, 300)
        })

        if (typeof ResizeObserver !== 'undefined' && mapEl.current) {
          resizeObs = new ResizeObserver(() => {
            clearTimeout(roTimer)
            roTimer = setTimeout(invalidate, 50)
          })
          resizeObs.observe(mapEl.current)
        }

        window.addEventListener('resize', invalidate)
      } catch (e) {
        console.warn('[RiderLiveMap] init failed', e)
        if (aliveRef.current) setNetError('Map failed to load. Check internet / adblock for map tiles.')
      }
    })()

    return () => {
      cancelled = true
      aliveRef.current = false
      clearTimeout(roTimer)
      try { resizeObs?.disconnect() } catch {}
      window.removeEventListener('resize', invalidate)
      try {
        Object.values(markersRef.current).forEach((m) => {
          try { mapRef.current?.removeLayer(m) } catch {}
        })
        markersRef.current = {}
        const map = mapRef.current
        mapRef.current = null
        if (map) {
          try { map._removed = true } catch {}
          try { map.scrollWheelZoom?.disable() } catch {}
          try { map.dragging?.disable() } catch {}
          try { map.off() } catch {}
          try { map.stop() } catch {}
          try { map.remove() } catch {}
        }
        if (mapEl.current) {
          try { delete mapEl.current._leaflet_id } catch {}
          try { mapEl.current.innerHTML = '' } catch {}
        }
      } catch {}
      setMapReady(false)
    }
  }, [invalidate])

  // Poll separately — does not remount the map
  useEffect(() => {
    if (!mapReady) return
    reload()
    const t = setInterval(reload, 8000)
    return () => clearInterval(t)
  }, [mapReady, reload, token])

  const focusRider = (r) => {
    if (r?.lat == null || r?.lng == null) return
    safeMapCall(mapRef.current, (map) => {
      map.setView([Number(r.lat), Number(r.lng)], 15, { animate: true })
      const m = markersRef.current[String(r.riderId)]
      try { m?.openPopup() } catch {}
    })
  }

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
        <div className="rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm bg-slate-100 dark:bg-slate-900 relative">
          <div
            ref={mapEl}
            className="w-full h-[min(70vh,640px)] min-h-[360px] z-0 bg-[#d4dadc]"
            onWheel={(e) => {
              // If map was torn down mid-gesture, swallow so React error overlay doesn't spam
              if (!mapRef.current?._mapPane) e.stopPropagation()
            }}
          />
          {!mapReady ? (
            <div className="absolute inset-0 grid place-items-center text-sm font-semibold text-slate-600 pointer-events-none">
              Loading map…
            </div>
          ) : null}
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
              <button
                type="button"
                key={r.riderId}
                onClick={() => focusRider(r)}
                className="w-full text-left p-3 space-y-1 hover:bg-[var(--color-surface-muted)] transition-colors"
              >
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
                    onClick={(e) => e.stopPropagation()}
                  >
                    Open in Maps <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
