const CACHE_NAME = 'carrozas-jr-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Instalar el Service Worker y almacenar en caché recursos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activar el Service Worker y limpiar cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia de Red Primero con Respaldo en Caché para Acceso Corporativo en línea
self.addEventListener('fetch', (event) => {
  // Solo interceptar peticiones de nuestro mismo origen o URL principal
  if (event.request.mode === 'navigate' || event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match(event.request).then((response) => {
            return response || caches.match('./index.html');
          });
        })
    );
  } else {
    // Para recursos como imágenes y estilos, Caché primero con actualización
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request);
      })
    );
  }
});
