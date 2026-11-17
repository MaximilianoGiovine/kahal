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
      body: data.body || 'Tienes un aviso nuevo',
      icon: '/icons/192',
      tag: data.tag,
      data: { url: data.url || '/app' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/app', self.location.origin).href;
  e.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Preferir una ventana de Kahal ya abierta; si no puede navegar (no la controla este worker), se abre otra.
      const client = open.find((c) => c.url.startsWith(self.location.origin));
      if (client) {
        try {
          await client.focus();
          if (client.url !== url) await client.navigate(url);
          return;
        } catch {
          // Sigue abajo.
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// El navegador puede renovar la suscripción por su cuenta: se le avisa a la API con la sesión que haya en las cookies.
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil(
    (async () => {
      const post = (path, body) =>
        fetch(path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
      let key = e.oldSubscription?.options?.applicationServerKey;
      if (!key) {
        const config = await fetch('/api/push/config', { credentials: 'include' }).then((r) => (r.ok ? r.json() : {}));
        if (!config.publicKey) return;
        const b64 = config.publicKey.replace(/-/g, '+').replace(/_/g, '/');
        key = Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
      }
      const subscription = e.newSubscription || (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      let res = await post('/api/push/subscribe', subscription.toJSON());
      // El token de acceso dura poco: se renueva una vez con la sesión recordada.
      if (res.status === 401 && (await post('/api/auth/refresh')).ok) res = await post('/api/push/subscribe', subscription.toJSON());
    })().catch(() => {}),
  );
});
