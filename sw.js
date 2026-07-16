// sw.js - Service Worker Oficial J.R. v7.0
// FIX: se excluyen del Service Worker las peticiones hacia la API de
// Google Apps Script (script.google.com / script.googleusercontent.com).
// Antes, el listener de 'fetch' interceptaba TODO, incluidas esas llamadas,
// lo que causaba timeouts/cuelgues en db.js que no ocurrían al probar
// la URL directamente en una pestaña (porque ahí no hay SW de por medio).
//
// 🆕 v7.0 — se agregan al caché las pantallas de campo (Salida, Llegada,
// Tanqueo, Avería, Inspección, Panel del conductor) y el nuevo
// offline-queue.js, para que la app se pueda ABRIR sin señal y el
// conductor pueda diligenciar los formularios. El GUARDADO de esos
// formularios sin señal lo resuelve offline-queue.js (cola local que se
// sincroniza sola al recuperar conexión) — este archivo solo se encarga
// de que la pantalla cargue.

const CACHE_NAME = 'jr-carrozas-v7';
// Lista de archivos para funcionar offline
// He quitado el icon-192.png temporalmente para que no te dé el error 404
const urlsToCache = [
  './',
  './index.html',
  './panel_coordinador.html',
  './panel_conductor.html',
  './panel_automotor.html',
  './solicitud_apoyo.html',
  './crear_apoyo.html',
  './registro_salida.html',
  './registro_llegada.html',
  './tanqueo.html',
  './reporte_averia.html',
  './inspeccion.html',
  './db.js',
  './offline-queue.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11'
];

// Dominios que NUNCA deben pasar por el Service Worker (API en vivo).
// Si algún día cambias de backend, agrega aquí el nuevo dominio.
const DOMINIOS_EXCLUIDOS = [
  'script.google.com',
  'script.googleusercontent.com',
];

// Instalación: Guarda los archivos en caché
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Registrando caché...');
        // Usamos un bucle para que si un archivo falla (404), los demás sí se guarden
        return Promise.all(
          urlsToCache.map(url => {
            return cache.add(url).catch(err => console.warn(`⚠️ No se pudo cachear: ${url}`));
          })
        );
      })
  );
});

// Activación: Limpia cachés antiguos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🧹 Borrando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Estrategia: Primero Red, si falla, busca en Caché
// PERO: si la petición es hacia un dominio excluido (la API de Google
// Apps Script), la dejamos pasar de largo SIN interceptar, para que
// viaje exactamente igual que si el Service Worker no existiera.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  const esDominioExcluido = DOMINIOS_EXCLUIDOS.some(d => url.hostname === d || url.hostname.endsWith('.' + d));
  if (esDominioExcluido) {
    return; // No se llama a respondWith(): el navegador maneja el fetch normalmente
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
