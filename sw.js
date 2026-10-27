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

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

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
