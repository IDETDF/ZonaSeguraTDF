/**
 * Service Worker - PWA Simulacro de Evacuación Ushuaia (DGOT)
 * Versión v2.2.0 - Arquitectura Modular (index.html + styles.css + app.js)
 */

const CACHE_VERSION = 'dgot-evac-v3.6.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PMTILES_CACHE = `${CACHE_VERSION}-pmtiles`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './vortice.png',
  './logo.webp',
  './logo-32.png',
  './logo-192.png',
  './logo_completo.webp',
  './logo_gobierno_compacto.webp',
  './logo_gobierno.webp',
  './zona_segura.geojson',
  './puntos_llegada.geojson',
  './lib/maplibre-gl.css',
  './lib/maplibre-gl.js',
  './lib/pmtiles.js',
  './lib/turf-micro.js',
  './sprite/sprite.json',
  './sprite/sprite.png',
  './sprite/sprite@2x.json',
  './sprite/sprite@2x.png',
  './fonts/Open Sans Regular,Arial Unicode MS Regular/0-255.pbf'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      for (const asset of STATIC_ASSETS) {
        try {
          const response = await fetch(asset, { cache: 'reload' });
          if (response.ok) {
            await cache.put(asset, response);
          }
        } catch (_) {}
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== PMTILES_CACHE && key !== DYNAMIC_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Solo http/https: ignora extensiones de navegador, blobs, esquemas de datos, etc.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Telemetría y estado de Apps Script: siempre directo a la red, jamás cachear
  if (url.hostname === 'script.google.com' || url.hostname.endsWith('googleusercontent.com')) return;

  // 1. Rangos PMTiles de mapas pesados
  if (url.pathname.endsWith('.pmtiles')) {
    event.respondWith(handlePmtilesRequest(request));
    return;
  }

  // 2. Cache-First estricto para librerías cartográficas (/lib/)
  // Evita el retraso de 10m de TTL de GitHub Pages respondiendo desde caché local
  if (url.pathname.includes('/lib/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((networkResp) => {
          if (!networkResp || networkResp.status !== 200) return networkResp;
          const clone = networkResp.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone).catch(() => {}));
          return networkResp;
        });
      })
    );
    return;
  }

  // 3. Network-First para código de interfaz (garantiza ver cambios al recargar con internet)
  const isAppShellCode =
    request.mode === 'navigate' ||
    url.pathname.endsWith('index.html') ||
    url.pathname.endsWith('styles.css') ||
    url.pathname.endsWith('app.js') ||
    url.pathname.endsWith('zona_segura.geojson') ||
    url.pathname.endsWith('puntos_llegada.geojson') ||
    url.pathname.endsWith('/');

  if (isAppShellCode) {
    event.respondWith(
      fetch(request)
        .then((networkResp) => {
          const clone = networkResp.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone).catch(() => {}));
          return networkResp;
        })
        .catch(() => caches.match(request) || caches.match('./index.html'))
    );
    return;
  }

  // 4. Cache-First para sprites, fuentes PBF, imágenes e íconos
  event.respondWith(
    caches.match(request).then((cachedResp) => {
      if (cachedResp) return cachedResp;

      return fetch(request)
        .then((networkResp) => {
          if (!networkResp || networkResp.status !== 200) return networkResp;
          const clone = networkResp.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone).catch(() => {}));
          return networkResp;
        })
        .catch((err) => {
          if (url.pathname.endsWith('.pbf')) {
            return new Response(new ArrayBuffer(0), {
              status: 200,
              headers: { 'Content-Type': 'application/x-protobuf' }
            });
          }
          throw err;
        });
    })
  );
});

async function handlePmtilesRequest(request) {
  const cache = await caches.open(PMTILES_CACHE);
  const rangeHeader = request.headers.get('range');

  const rangeCacheKey = rangeHeader
    ? new Request(`${request.url}__range_${rangeHeader.replace(/\s+/g, '')}`)
    : request;

  const cachedChunk = await cache.match(rangeCacheKey);
  if (cachedChunk) {
    const buffer = await cachedChunk.arrayBuffer();
    const savedContentRange = cachedChunk.headers.get('x-saved-content-range');
    const headers = new Headers({
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.byteLength.toString(),
      'Accept-Ranges': 'bytes'
    });
    if (savedContentRange) {
      headers.set('Content-Range', savedContentRange);
    }
    return new Response(buffer, {
      status: rangeHeader ? 206 : 200,
      statusText: rangeHeader ? 'Partial Content' : 'OK',
      headers
    });
  }

  const fullFileResponse = await cache.match(request.url);
  if (fullFileResponse && rangeHeader) {
    const fullBuffer = await fullFileResponse.arrayBuffer();
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fullBuffer.byteLength - 1;
    const sliced = fullBuffer.slice(start, end + 1);

    return new Response(sliced, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': sliced.byteLength.toString(),
        'Content-Range': `bytes ${start}-${end}/${fullBuffer.byteLength}`,
        'Accept-Ranges': 'bytes'
      }
    });
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.status === 206 || networkResponse.status === 200) {
      const clonedBuffer = await networkResponse.clone().arrayBuffer();
      const contentRange = networkResponse.headers.get('Content-Range') || '';

      const syntheticResponse = new Response(clonedBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': clonedBuffer.byteLength.toString(),
          'x-saved-content-range': contentRange
        }
      });

      cache.put(rangeCacheKey, syntheticResponse);
    }
    return networkResponse;
  } catch (_) {
    return new Response(null, { status: 504, statusText: 'Offline Range Miss' });
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PRECACHE_FULL_PMTILES') {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(PMTILES_CACHE);
        const files = ['./capas_operativas.pmtiles', './fondo_satelital.pmtiles'];
        for (const fileUrl of files) {
          try {
            const resp = await fetch(fileUrl);
            if (resp.ok) {
              await cache.put(fileUrl, resp.clone());
            }
          } catch (_) {}
        }
        const allClients = await self.clients.matchAll();
        allClients.forEach((client) => client.postMessage({ type: 'PMTILES_CACHED_OK' }));
      })()
    );
  }
});