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
   The portal's own pages, scripts and styles open straight from the saved copy (no waiting for the network,
   which is what made opening slow on a weak connection), and are refreshed in the background every time.
   When the background copy turns out to be new, open portals show "Update available"; the next open uses it. */
const CACHE = 'acsp-v5';
const KEEP = [/^https:\/\/www\.gstatic\.com\/firebasejs\//, /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/(leaflet|html2canvas|jspdf)\//, /^https:\/\/fonts\.(googleapis|gstatic)\.com\//];

async function keepFirst(req){
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') { const c = await caches.open(CACHE); c.put(req, res.clone()); }
  return res;
}
const stamp = r => r && (r.headers.get('etag') || r.headers.get('last-modified') || r.headers.get('content-length') || '');
let told = 0;
async function tellUpdated(){
  if (Date.now() - told < 10000) return; told = Date.now();
  for (const w of await self.clients.matchAll({ type: 'window' })) w.postMessage({ type: 'acsp-updated' });
}
/** Saved copy at once; fetch a fresh one in the background. Pages are saved without ?job=… so every link opens fast. */
async function savedThenFresh(event, key){
  const c = await caches.open(CACHE);
  const hit = await c.match(key);
  const net = fetch(event.request.mode === 'navigate' ? key : event.request, { cache: 'no-cache' }).then(async res => {
    if (res.ok && res.type === 'basic') {
      await c.put(key, res.clone());
      if (hit && stamp(hit) !== stamp(res) && /\.(js|css)$|\/$|\.html$|^[^.]*$/.test(new URL(key.url || key).pathname)) tellUpdated();
    }
    return res;
  });
  if (hit) { event.waitUntil(net.catch(() => {})); return hit; }
  return net;
}
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (KEEP.some(r => r.test(req.url))) return event.respondWith(keepFirst(req));
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js' || url.pathname === '/privacy' || url.pathname === '/privacy.html') return;
  if (/^\/(js|css|assets)\//.test(url.pathname) || url.pathname.endsWith('.webmanifest'))
    return event.respondWith(savedThenFresh(event, new Request(url.origin + url.pathname)));
  if (req.mode === 'navigate') return event.respondWith(savedThenFresh(event, new Request(url.origin + url.pathname)));
});
// A page that opened before this service worker was running lists its files, so the next open is instant too.
self.addEventListener('message', event => {
  if (event.data?.type !== 'acsp-warm') return;
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (const u of (event.data.urls || []).slice(0, 40)) {
      const url = new URL(u, self.location.origin); if (url.origin !== self.location.origin || url.pathname === '/sw.js') continue;
      const key = new Request(url.origin + url.pathname);
      if (!(await c.match(key))) await fetch(key, { cache: 'no-cache' }).then(r => r.ok && r.type === 'basic' && c.put(key, r)).catch(() => {});
    }
  })());
});
// "Update" in a portal: fetch fresh copies of everything saved before the page reloads.
self.addEventListener('message', event => {
  if (event.data?.type !== 'acsp-refresh') return;
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all((await c.keys()).filter(r => new URL(r.url).origin === self.location.origin)
      .map(r => fetch(r.url, { cache: 'no-store' }).then(res => res.ok && c.put(r, res)).catch(() => {})));
    event.ports?.[0]?.postMessage('done');
  })());
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
