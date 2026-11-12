// Minimal service worker — exists ONLY so Chrome offers "Install app".
// Never intercept cross-origin (backend API, OSM tiles, unpkg, etc.).
// v3 — stop FetchEvent / net::ERR_FAILED console spam
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  let sameOrigin = false
  try {
    sameOrigin = new URL(e.request.url).origin === self.location.origin
  } catch {
    return
  }
  // Critical: do not call respondWith for cross-origin — browser handles API + map tiles
  if (!sameOrigin) return

  e.respondWith(
    fetch(e.request).catch(() => {
      if (e.request.mode === 'navigate') {
        return new Response(
          '<!doctype html><title>Offline</title><body style="font-family:sans-serif;padding:2rem"><h1>Offline</h1><p>Reconnect and refresh.</p></body>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      }
      return new Response('', { status: 504, statusText: 'Gateway Timeout' })
    })
  )
})
