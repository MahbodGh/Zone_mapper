// Minimal service worker: enables installability + basic offline shell caching.
const CACHE = 'zone-mapper-v1'
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Network-first for API and map tiles (always fresh); cache-first for the app shell.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return
  // never cache API calls or map/tile requests
  if (url.pathname.startsWith('/api') || url.hostname.includes('tile') ||
      url.hostname.includes('arcgisonline') || url.hostname.includes('google') ||
      url.hostname.includes('photon') || url.hostname.includes('openstreetmap')) {
    return
  }
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {})
        return res
      }).catch(() => cached)
    )
  )
})
