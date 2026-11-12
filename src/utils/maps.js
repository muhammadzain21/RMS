/** Resolve Google Maps browser key (Maps JavaScript API). */
export function resolveGoogleMapsApiKey(settingsKey = '') {
  try {
    const fromEnv = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim()
    if (fromEnv) return fromEnv
  } catch {}
  try {
    const fromWindow = String(window.__GOOGLE_MAPS_API_KEY || '').trim()
    if (fromWindow) return fromWindow
  } catch {}
  try {
    const fromLs = String(localStorage.getItem('google_maps_api_key') || '').trim()
    if (fromLs) return fromLs
  } catch {}
  return String(settingsKey || '').trim()
}

let googleMapsPromise = null

/** Load Google Maps JS API once. Rejects if key missing or script fails. */
export function loadGoogleMaps(apiKey) {
  const key = String(apiKey || '').trim()
  if (!key) return Promise.reject(new Error('Google Maps API key not set'))
  if (typeof window !== 'undefined' && window.google?.maps?.Map) {
    return Promise.resolve(window.google.maps)
  }
  if (googleMapsPromise) return googleMapsPromise

  googleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-maps]')
    if (existing) {
      const done = () => {
        if (window.google?.maps?.Map) resolve(window.google.maps)
        else reject(new Error('Google Maps failed to load'))
      }
      if (window.google?.maps?.Map) return done()
      existing.addEventListener('load', done, { once: true })
      existing.addEventListener('error', () => reject(new Error('Google Maps script error')), { once: true })
      return
    }
    const cb = `__rmsGmapsInit_${Date.now()}`
    window[cb] = () => {
      try { delete window[cb] } catch {}
      if (window.google?.maps?.Map) resolve(window.google.maps)
      else reject(new Error('Google Maps unavailable after load'))
    }
    const script = document.createElement('script')
    script.dataset.googleMaps = '1'
    script.async = true
    script.defer = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${cb}`
    script.onerror = () => {
      googleMapsPromise = null
      reject(new Error('Google Maps network/script error'))
    }
    document.head.appendChild(script)
  }).catch((err) => {
    googleMapsPromise = null
    throw err
  })

  return googleMapsPromise
}

let leafletPromise = null

export function loadLeaflet() {
  if (typeof window !== 'undefined' && window.L) return Promise.resolve(window.L)
  if (leafletPromise) return leafletPromise
  leafletPromise = new Promise((resolve, reject) => {
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
      existing.addEventListener('load', () => resolve(window.L), { once: true })
      existing.addEventListener('error', reject, { once: true })
      if (window.L) resolve(window.L)
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
  return leafletPromise
}

export function hardenLeaflet(L) {
  if (!L || L.__rmsHardened) return
  L.__rmsHardened = true
  try {
    delete L.Icon.Default.prototype._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })
  } catch {}
  try {
    const origGetPos = L.DomUtil.getPosition
    L.DomUtil.getPosition = function (el) {
      if (!el) return new L.Point(0, 0)
      try { return origGetPos.call(this, el) } catch { return new L.Point(0, 0) }
    }
  } catch {}
  try {
    const Proto = L.Map?.prototype
    if (Proto && !Proto.__rmsSafeZoom) {
      Proto.__rmsSafeZoom = true
      const orig = Proto.setZoomAround
      Proto.setZoomAround = function (...args) {
        try {
          if (!this || !this._mapPane || this._removed) return this
          return orig.apply(this, args)
        } catch { return this }
      }
    }
  } catch {}
}
