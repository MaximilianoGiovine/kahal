// Service worker mínimo: habilita la instalación como app y muestra
// una página sin conexión. No cachea datos de la API.
const OFFLINE = '/offline.html';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open('kahal-v1').then((c) => c.add(OFFLINE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});

// Notificaciones push. iOS revoca el permiso si un push no muestra una notificación.
self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    // Mensaje ilegible: se muestra el aviso genérico.
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'Kahal', {
      body: data.body || 'Tenés un aviso nuevo',
      icon: '/icons/192',
      tag: data.tag,
      data: { url: data.url || '/app' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/app';
  e.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = open[0];
      if (!client) return self.clients.openWindow(url);
      await client.focus();
      if ('navigate' in client) await client.navigate(url).catch(() => {});
    })(),
  );
});
