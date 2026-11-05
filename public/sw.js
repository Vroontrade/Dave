// FINANCIAL RESET service worker: app-shell offline beschikbaar. Je gegevens staan in localStorage, niet in deze cache.
// Eén cache per versie (map), zodat de versie van Dave en die van zijn vriendin elkaars cache nooit wissen.
const SCOPE = self.registration.scope
const CACHE = 'finance-v3:' + SCOPE
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon-192.png'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && (k.endsWith(':' + SCOPE) || k === 'finance-v2')).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin && !url.hostname.includes('fonts.')) return
  // Netwerk eerst (altijd de nieuwste versie), cache als terugval wanneer je offline bent.
  e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow('./#dashboard'))))
})
