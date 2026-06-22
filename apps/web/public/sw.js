// Service worker mínimo y CONSERVADOR: habilita la instalación como PWA y cachea SOLO los estáticos
// inmutables de Next (/_next/static). Nunca intercepta HTML ni la API → no hay riesgo de contenido o
// datos obsoletos. El resto de peticiones pasan directas a la red.
const CACHE = 'lawzora-static-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // jamás POST/PUT (API)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // solo mismo origen
  if (!url.pathname.startsWith('/_next/static/')) return; // solo estáticos inmutables

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
