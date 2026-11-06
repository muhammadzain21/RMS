// Minimal service worker — exists ONLY so Chrome offers "Install app".
// No caching: every request goes straight to the network, so nothing
// can ever serve stale files.
// v2 — EpicSpire RMS branding / safe-area
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request).catch(() => Response.error()))
})
