/* Service worker shared by the three portals.
   - Shows alerts for new notifications while a portal is open in the background.
   - With the optional Cloud Function and a VAPID key, also receives push messages while every portal is closed.
   - Opens the right portal and request when an alert is tapped. */
const params = new URL(self.location).searchParams;
if (params.get('messagingSenderId')) {
  importScripts(
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'
  );
  firebase.initializeApp({
    apiKey: params.get('apiKey'), projectId: params.get('projectId'),
    messagingSenderId: params.get('messagingSenderId'), appId: params.get('appId')
  });
  firebase.messaging();   // Firebase shows push messages sent by the Cloud Function on its own.
}

/* ---------- faster loading ----------
   Libraries with a version in their address (Firebase, map, fonts) never change: keep them on the device.
   The portal's own pages, scripts and styles: always try the network first (so updates show at once),
   and fall back to the saved copy if the network is slow or offline. */
const CACHE = 'acsp-v3';
const KEEP = [/^https:\/\/www\.gstatic\.com\/firebasejs\//, /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\//, /^https:\/\/fonts\.(googleapis|gstatic)\.com\//];

async function keepFirst(req){
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') { const c = await caches.open(CACHE); c.put(req, res.clone()); }
  return res;
}
async function networkFirst(req, waitMs){
  const c = await caches.open(CACHE);
  const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; });
  const timer = new Promise(r => setTimeout(r, waitMs));
  try {
    const first = await Promise.race([net, timer.then(() => null)]);
    if (first) return first;
    return (await c.match(req, {ignoreSearch: req.mode === 'navigate'})) || await net;
  } catch (e) {
    const saved = await c.match(req, {ignoreSearch: req.mode === 'navigate'});
    if (saved) return saved;
    throw e;
  }
}
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (KEEP.some(r => r.test(req.url))) return event.respondWith(keepFirst(req));
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;
  if (/^\/(js|css|assets)\//.test(url.pathname) || url.pathname.endsWith('.webmanifest')) return event.respondWith(networkFirst(req, 2500));
  if (req.mode === 'navigate') return event.respondWith(networkFirst(req, 3500));
});

// Save the Firebase libraries as soon as the service worker installs, so even the second visit skips them.
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const PRECACHE = [FB + 'firebase-app.js', FB + 'firebase-auth.js', FB + 'firebase-firestore.js'];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(c => Promise.all(PRECACHE.map(u =>
    caches.match(u).then(hit => hit || fetch(u, {mode: 'cors'}).then(r => r.ok && c.put(u, r))).catch(() => {})))));
});
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('notificationclick', event => {
  const data = event.notification.data || {};
  if (data.FCM_MSG) return;                 // Firebase handles taps on its own push messages.
  event.notification.close();
  const url = new URL(data.url || './', self.location.href).href;
  const page = u => new URL(u).pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (page(w.url) === page(url)) { w.postMessage({ type: 'open', url }); return w.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
