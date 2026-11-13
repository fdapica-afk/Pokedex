/* Service worker: permite usar la Pokédex sin conexión y la actualiza sola */
const VERSION = 'v3.1.1';
const SHELL = 'pdx-shell-' + VERSION;
const LIBS = 'pdx-libs-v1';
const IMGS = 'pdx-img-v1';
const MAX_IMGS = 900;
const SHELL_FILES = ['./', 'index.html', 'pokedex-data.json?v=2026-11-12', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('pdx-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Página principal: primero la red (para recibir actualizaciones), si no hay conexión, la copia guardada
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => {
      const copy = r.clone(); caches.open(SHELL).then(c => c.put('index.html', copy)); return r;
    }).catch(() => caches.match('index.html', { ignoreSearch: true })));
    return;
  }

  // Archivos propios (datos, iconos...): copia guardada y se refresca en segundo plano
  if (url.origin === location.origin) {
    if (url.pathname.includes('migracion-')) return;
    e.respondWith(caches.open(SHELL).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // Librerías de Firebase (versión fija): se guardan para siempre
  if (url.hostname === 'www.gstatic.com') {
    e.respondWith(caches.open(LIBS).then(async c => (await c.match(req)) || fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }

  // Imágenes de Pokémon: se guardan al verlas
  if (url.hostname === 'raw.githubusercontent.com') {
    e.respondWith(caches.open(IMGS).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); trim(IMGS, MAX_IMGS); }
        return r;
      } catch { return new Response('', { status: 504 }); }
    }));
  }
});
