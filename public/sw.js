// Service worker de DyL Gestor.
// - Archivos estáticos (JS/CSS/imágenes): se guardan en caché para que la app abra rápido.
// - Páginas: siempre se piden a la red; sin conexión se muestra /offline.html.
// - Datos (Supabase): nunca se guardan en caché, siempre van directo a la red.
// - Avisos al celular de Mis turnos (cuando cambia un turno publicado).
const VERSION = 'v3';
const STATIC_CACHE = `dyl-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname === '/favicon.ico'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase y otros: sin caché

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
});

// ─── Avisos al celular ──────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Mis turnos DyL';
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: data.body || 'Tu malla de turnos cambió. Toca para verla.',
        icon: '/icons/icon-192.png',
        badge: '/icons/favicon-192.png',
        tag: data.tag || 'mis-turnos',
        renotify: true,
        data: { url: data.url || '/mis-turnos' },
      }),
      // Si Mis turnos está abierta, que se recargue enseguida
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((list) => list.forEach((c) => c.postMessage({ tipo: 'mis-turnos-cambio' }))),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/mis-turnos', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const abierta = list.find((c) => new URL(c.url).pathname.startsWith('/mis-turnos'));
      if (abierta) {
        abierta.postMessage({ tipo: 'mis-turnos-cambio' });
        return abierta.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
