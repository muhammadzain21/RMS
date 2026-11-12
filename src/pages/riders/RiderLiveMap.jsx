import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { MapPinned, RefreshCw, Bike, ExternalLink } from 'lucide-react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import PageHero from '../../components/ui/PageHero.jsx'
import {
  hardenLeaflet,
  loadGoogleMaps,
  loadLeaflet,
  resolveGoogleMapsApiKey,
} from '../../utils/maps.js'

const API = () => (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
const DEFAULT_CENTER = { lat: 31.5204, lng: 74.3587 }

function riderColor(r) {
  if (r?.stale) return '#d97706'
  if (r?.status === 'on_delivery') return '#059669'
  return '#2563eb'
}

/** Restaurant / manager live map — Google Maps when keyed, Esri/Leaflet otherwise. */
export default function RiderLiveMap() {
  const { token } = useAuth()
  const { state } = useData()
  const mapEl = useRef(null)
  const engineRef = useRef(null) // { type: 'google'|'leaflet', map, markers: {}, mapsApi? }
  const aliveRef = useRef(true)
  const tokenRef = useRef(token)
  const ridersRef = useRef([])
  const [riders, setRiders] = useState([])
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState('')
  const [netError, setNetError] = useState('')
  const [mapReady, setMapReady] = useState(false)
  const [mapProvider, setMapProvider] = useState('')
  const lastToastAt = useRef(0)

  tokenRef.current = token
  ridersRef.current = riders

  const apiKey = resolveGoogleMapsApiKey(state?.settings?.googleMapsApiKey)

  const destroyEngine = useCallback(() => {
    const eng = engineRef.current
    engineRef.current = null
    if (!eng) return
    try {
      Object.values(eng.markers || {}).forEach((m) => {
        try {
          if (eng.type === 'google') m.setMap(null)
          else eng.map?.removeLayer?.(m)
        } catch {}
      })
    } catch {}
    if (eng.type === 'leaflet' && eng.map) {
      try { eng.map._removed = true } catch {}
      try { eng.map.scrollWheelZoom?.disable() } catch {}
      try { eng.map.off() } catch {}
      try { eng.map.stop() } catch {}
      try { eng.map.remove() } catch {}
    }
    if (mapEl.current) {
      try { delete mapEl.current._leaflet_id } catch {}
      try { mapEl.current.innerHTML = '' } catch {}
    }
  }, [])

  const paintGoogle = useCallback((list) => {
    const eng = engineRef.current
    if (!eng || eng.type !== 'google' || !eng.map || !aliveRef.current) return
    const gmaps = eng.mapsApi
    const ids = new Set()
    const bounds = new gmaps.LatLngBounds()
    let n = 0
    for (const r of list || []) {
      if (r.lat == null || r.lng == null) continue
      const id = String(r.riderId)
      ids.add(id)
      const pos = { lat: Number(r.lat), lng: Number(r.lng) }
      if (Number.isNaN(pos.lat) || Number.isNaN(pos.lng)) continue
      n += 1
      bounds.extend(pos)
      const title = `${r.riderName || 'Rider'}${r.status === 'on_delivery' ? ' · delivery' : ''}${r.stale ? ' · stale' : ''}`
      const html = `<div style="font:12px/1.4 system-ui,sans-serif"><b>${r.riderName || 'Rider'}</b><br/>${r.status}${r.orderLabel ? `<br/>Order: ${r.orderLabel}` : ''}${r.customerAddress ? `<br/>${r.customerAddress}` : ''}<br/><small>${r.ageSeconds != null ? `${r.ageSeconds}s ago` : ''}</small></div>`
      if (eng.markers[id]) {
        eng.markers[id].setPosition(pos)
        eng.markers[id].setTitle(title)
        eng.markers[id].__info?.setContent(html)
      } else {
        const marker = new gmaps.Marker({
          position: pos,
          map: eng.map,
          title,
          icon: {
            path: gmaps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: riderColor(r),
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
        })
        const info = new gmaps.InfoWindow({ content: html })
        marker.addListener('click', () => info.open({ map: eng.map, anchor: marker }))
        marker.__info = info
        eng.markers[id] = marker
      }
    }
    Object.keys(eng.markers).forEach((id) => {
      if (!ids.has(id)) {
        try { eng.markers[id].setMap(null) } catch {}
        delete eng.markers[id]
      }
    })
    try {
      if (n === 1) {
        eng.map.setCenter(bounds.getCenter())
        eng.map.setZoom(Math.max(eng.map.getZoom() || 12, 14))
      } else if (n > 1) {
        eng.map.fitBounds(bounds, 48)
      }
    } catch {}
  }, [])

  const paintLeaflet = useCallback((list) => {
    const eng = engineRef.current
    const L = window.L
    if (!eng || eng.type !== 'leaflet' || !eng.map || !L || !aliveRef.current) return
    const map = eng.map
    if (!map._loaded || !map._mapPane) return
    const ids = new Set()
    const latLngs = []
    for (const r of list || []) {
      if (r.lat == null || r.lng == null) continue
      const id = String(r.riderId)
      const latlng = [Number(r.lat), Number(r.lng)]
      if (Number.isNaN(latlng[0]) || Number.isNaN(latlng[1])) continue
      ids.add(id)
      latLngs.push(latlng)
      const popup = `<b>${r.riderName || 'Rider'}</b><br/>${r.status}${r.orderLabel ? `<br/>Order: ${r.orderLabel}` : ''}${r.customerAddress ? `<br/>${r.customerAddress}` : ''}<br/><small>${r.ageSeconds != null ? `${r.ageSeconds}s ago` : ''}</small>`
      const label = `${r.riderName || 'Rider'}${r.status === 'on_delivery' ? ' · delivery' : ''}${r.stale ? ' · stale' : ''}`
      if (eng.markers[id]) {
        eng.markers[id].setLatLng(latlng)
        eng.markers[id].setPopupContent(popup)
        eng.markers[id].setTooltipContent(label)
      } else {
        const m = L.circleMarker(latlng, {
          radius: 9,
          color: '#fff',
          weight: 2,
          fillColor: riderColor(r),
          fillOpacity: 1,
        }).addTo(map)
        m.bindPopup(popup)
        m.bindTooltip(label, { permanent: false })
        eng.markers[id] = m
      }
    }
    Object.keys(eng.markers).forEach((id) => {
      if (!ids.has(id)) {
        try { map.removeLayer(eng.markers[id]) } catch {}
        delete eng.markers[id]
      }
    })
    try {
      if (latLngs.length === 1) map.setView(latLngs[0], Math.max(map.getZoom(), 14), { animate: false })
      else if (latLngs.length > 1) map.fitBounds(L.latLngBounds(latLngs).pad(0.25), { animate: false, maxZoom: 15 })
      map.invalidateSize({ animate: false })
    } catch {}
  }, [])

  const paint = useCallback((list) => {
    try {
      if (engineRef.current?.type === 'google') paintGoogle(list)
      else paintLeaflet(list)
    } catch (e) {
      console.warn('[RiderLiveMap] paint', e)
    }
  }, [paintGoogle, paintLeaflet])

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

  // Init map once (prefer Google when key present)
  useEffect(() => {
    aliveRef.current = true
    let cancelled = false
    let resizeObs = null
    let roTimer = null

    const invalidateLeaflet = () => {
      try { engineRef.current?.type === 'leaflet' && engineRef.current.map?.invalidateSize?.({ animate: false }) } catch {}
    }

    ;(async () => {
      if (!mapEl.current) return
      try {
        if (apiKey) {
          try {
            const gmaps = await loadGoogleMaps(apiKey)
            if (cancelled || !mapEl.current || !aliveRef.current) return
            destroyEngine()
            const map = new gmaps.Map(mapEl.current, {
              center: DEFAULT_CENTER,
              zoom: 12,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: true,
              zoomControl: true,
              clickableIcons: false,
              gestureHandling: 'greedy',
            })
            engineRef.current = { type: 'google', map, markers: {}, mapsApi: gmaps }
            setMapProvider('Google Maps')
            setMapReady(true)
            paint(ridersRef.current)
            return
          } catch (e) {
            console.warn('[RiderLiveMap] Google Maps unavailable, using street tiles', e)
          }
        }

        const L = await loadLeaflet()
        if (cancelled || !mapEl.current || !aliveRef.current) return
        hardenLeaflet(L)
        destroyEngine()
        if (mapEl.current._leaflet_id) {
          try { delete mapEl.current._leaflet_id } catch {}
          mapEl.current.innerHTML = ''
        }
        const map = L.map(mapEl.current, {
          zoomControl: true,
          scrollWheelZoom: true,
          fadeAnimation: false,
          markerZoomAnimation: false,
        }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 12)

        // Esri World Street Map — looks closer to Google than grey Carto/OSM light
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 19,
          attribution: 'Tiles &copy; Esri',
        }).addTo(map)

        engineRef.current = { type: 'leaflet', map, markers: {} }
        setMapProvider(apiKey ? 'Street map (Google key failed)' : 'Street map')
        setMapReady(true)
        requestAnimationFrame(() => {
          invalidateLeaflet()
          setTimeout(invalidateLeaflet, 80)
          setTimeout(invalidateLeaflet, 300)
        })
        if (typeof ResizeObserver !== 'undefined' && mapEl.current) {
          resizeObs = new ResizeObserver(() => {
            clearTimeout(roTimer)
            roTimer = setTimeout(invalidateLeaflet, 50)
          })
          resizeObs.observe(mapEl.current)
        }
        window.addEventListener('resize', invalidateLeaflet)
        paint(ridersRef.current)
      } catch (e) {
        console.warn('[RiderLiveMap] init failed', e)
        if (aliveRef.current) setNetError('Map failed to load. Check internet, API key, or adblock.')
      }
    })()

    return () => {
      cancelled = true
      aliveRef.current = false
      clearTimeout(roTimer)
      try { resizeObs?.disconnect() } catch {}
      window.removeEventListener('resize', invalidateLeaflet)
      destroyEngine()
      setMapReady(false)
    }
  }, [apiKey, destroyEngine, paint])

  useEffect(() => {
    if (!mapReady) return
    reload()
    const t = setInterval(reload, 8000)
    return () => clearInterval(t)
  }, [mapReady, reload, token])

  const focusRider = (r) => {
    if (r?.lat == null || r?.lng == null) return
    const eng = engineRef.current
    if (!eng) return
    try {
      if (eng.type === 'google') {
        eng.map.setCenter({ lat: Number(r.lat), lng: Number(r.lng) })
        eng.map.setZoom(15)
        const m = eng.markers[String(r.riderId)]
        if (m?.__info) m.__info.open({ map: eng.map, anchor: m })
      } else if (eng.map?._mapPane) {
        eng.map.setView([Number(r.lat), Number(r.lng)], 15, { animate: true })
        try { eng.markers[String(r.riderId)]?.openPopup() } catch {}
      }
    } catch {}
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

      {!apiKey ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 dark:bg-sky-900/20 px-4 py-3 text-sm font-medium text-sky-900 dark:text-sky-100">
          Add a <b>Google Maps API key</b> in Settings → System (or <code className="text-xs">VITE_GOOGLE_MAPS_API_KEY</code>) for the full Google map. Street tiles are used until then.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm bg-slate-200 dark:bg-slate-900 relative">
          <div
            ref={mapEl}
            className="w-full h-[min(70vh,640px)] min-h-[360px] z-0"
            onWheel={(e) => {
              if (engineRef.current?.type === 'leaflet' && !engineRef.current.map?._mapPane) e.stopPropagation()
            }}
          />
          {!mapReady ? (
            <div className="absolute inset-0 grid place-items-center text-sm font-semibold text-slate-600 pointer-events-none">
              Loading map…
            </div>
          ) : mapProvider ? (
            <div className="absolute left-3 bottom-3 z-[500] rounded-md bg-white/90 dark:bg-slate-900/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 shadow">
              {mapProvider}
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
