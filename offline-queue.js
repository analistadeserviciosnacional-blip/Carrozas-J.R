/**
 * ══════════════════════════════════════════════════════════
 *  OFFLINE-QUEUE.JS — J.R. Carrozas  v1.0
 *
 *  QUÉ HACE:
 *  Permite que registro_salida.html, registro_llegada.html,
 *  tanqueo.html, reporte_averia.html e inspeccion.html se puedan
 *  usar SIN internet. Si el guardado normal falla porque no hay
 *  señal, el registro se guarda en el celular (IndexedDB) y este
 *  archivo lo reintenta solo, en segundo plano, apenas detecta
 *  conexión — sin que el conductor tenga que hacer nada.
 *
 *  CÓMO LO HACE (para no romper nada de lo que ya funciona):
 *  Este archivo NO modifica db.js. Se carga DESPUÉS de db.js y
 *  "envuelve" (monkey-patch) solo estas funciones de DB:
 *      DB.guardarTraslado
 *      DB.actualizarTraslado   (solo pass-through, sin cola)
 *      DB.guardarLlegada
 *      DB.guardarTanqueo
 *      DB.guardarAveria
 *      DB.guardarInspeccion
 *      DB.obtenerPlacasConTrasladoActivo
 *
 *  El envoltorio SIEMPRE intenta primero el camino normal (el mismo
 *  código de siempre, con sus mismas validaciones anti-duplicado).
 *  Solo si ese intento falla por FALTA DE RED (no por un error de
 *  negocio, como "ya tiene una salida activa"), el dato se guarda
 *  localmente y se le devuelve a la pantalla una respuesta
 *  { ok:true, offline:true, ... } para que el flujo normal de
 *  "guardado exitoso" siga funcionando igual que siempre.
 *
 *  CASO ESPECIAL — Salida y Llegada encadenadas sin señal:
 *  Si un conductor hace una Salida sin señal y luego, más tarde
 *  (todavía sin señal), hace la Llegada de esa misma carroza, la
 *  Llegada queda "enganchada" a la Salida pendiente en la cola.
 *  Cuando vuelve la señal, se sincroniza primero la Salida (recibe
 *  su ID real de la hoja) y automáticamente se corrige el ID en la
 *  Llegada antes de enviarla — así no se pierde el enlace entre
 *  las dos.
 *
 *  Si por cualquier motivo IndexedDB no está disponible (algunos
 *  navegadores en modo incógnito), este archivo se desactiva solo
 *  y NO envuelve nada: la app sigue funcionando exactamente como
 *  antes de instalar este archivo.
 * ══════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.DB) {
    console.warn('⚠️ offline-queue.js: DB (db.js) no está cargado todavía — la cola offline no se activa en esta página.');
    return;
  }
  if (!('indexedDB' in window)) {
    console.warn('⚠️ offline-queue.js: este navegador no soporta IndexedDB — la cola offline no se activa.');
    return;
  }

  const DB_NAME    = 'jr_offline_queue';
  const DB_VERSION = 1;
  const STORE_COLA = 'cola';

  let _dbPromise = null;

  function abrirDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_COLA)) {
          const store = db.createObjectStore(STORE_COLA, { keyPath: 'qid', autoIncrement: true });
          store.createIndex('estado', 'estado', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    }).catch((e) => {
      console.warn('⚠️ offline-queue.js: no se pudo abrir IndexedDB, la cola offline queda desactivada:', e.message);
      _dbPromise = null;
      return null;
    });
    return _dbPromise;
  }

  async function conStore(modo, fn) {
    const db = await abrirDB();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_COLA, modo);
      const store = tx.objectStore(STORE_COLA);
      let resultado;
      Promise.resolve(fn(store))
        .then((r) => { resultado = r; })
        .catch(reject);
      tx.oncomplete = () => resolve(resultado);
      tx.onerror    = () => reject(tx.error);
    });
  }

  function reqAPromesa(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async function agregarItem(item) {
    item.creado = Date.now();
    item.estado = 'pendiente';
    return conStore('readwrite', (store) => reqAPromesa(store.add(item)));
  }

  async function obtenerTodos() {
    const items = await conStore('readonly', (store) => reqAPromesa(store.getAll()));
    return items || [];
  }

  async function actualizarItem(item) {
    return conStore('readwrite', (store) => reqAPromesa(store.put(item)));
  }

  async function borrarItem(qid) {
    return conStore('readwrite', (store) => reqAPromesa(store.delete(qid)));
  }

  // ── DETECTAR SI UN ERROR ES "SIN RED" (y no un error de negocio) ──
  function esErrorDeRed(res) {
    if (!res) return true;
    if (res.ok) return false;
    const msg = String(res.error || '').toLowerCase();
    return (
      navigator.onLine === false ||
      /failed to fetch/.test(msg) ||
      /networkerror/.test(msg) ||
      /load failed/.test(msg) ||
      /err_internet/.test(msg) ||
      /err_network/.test(msg) ||
      /err_connection/.test(msg) ||
      /tardó demasiado/.test(msg) ||
      /timeout/.test(msg) ||
      /no se pudo conectar/.test(msg)
    );
  }

  function generarOfflineId(prefijo) {
    return prefijo + '-OFFLINE-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }

  // ── FUNCIONES ORIGINALES DE db.js (sin tocar) ─────────────
  const _orig = {
    guardarTraslado:                DB.guardarTraslado.bind(DB),
    guardarLlegada:                 DB.guardarLlegada.bind(DB),
    guardarTanqueo:                 DB.guardarTanqueo.bind(DB),
    guardarAveria:                  DB.guardarAveria.bind(DB),
    guardarInspeccion:              DB.guardarInspeccion ? DB.guardarInspeccion.bind(DB) : null,
    obtenerPlacasConTrasladoActivo: DB.obtenerPlacasConTrasladoActivo.bind(DB),
    actualizar:                     DB.actualizar.bind(DB),
  };

  // ══════════════════════════════════════════════════════════
  //  ENCOLAR (guardar local cuando no hay red)
  // ══════════════════════════════════════════════════════════

  async function encolarTraslado(d) {
    const offlineId = generarOfflineId('S');
    await agregarItem({ tipo: 'traslado', payload: d, offlineId });
    actualizarBadge();
    return {
      ok: true,
      offline: true,
      id_salida: offlineId,
      data: { offline: true, mensaje: 'Guardado sin conexión — se enviará automáticamente cuando haya señal.' }
    };
  }

  async function encolarLlegada(d) {
    let dependeQid = null;
    const idSalida = String(d.id_salida || '');
    if (idSalida.startsWith('S-OFFLINE-')) {
      const items = await obtenerTodos();
      const traslado = items.find((it) => it.tipo === 'traslado' && it.offlineId === idSalida && it.estado === 'pendiente');
      if (traslado) dependeQid = traslado.qid;
    }
    await agregarItem({ tipo: 'llegada', payload: d, dependeQid });
    actualizarBadge();
    return {
      ok: true,
      offline: true,
      data: { offline: true },
      estado_carroza_despues: { ok: false },
      estado_carroza_antes: { ok: false },
      combustible_guardado_en_registro: false,
      checklist_actualizado: false,
      mensaje: 'Guardado sin conexión — se enviará automáticamente cuando haya señal.'
    };
  }

  async function encolarSimple(tipo, d) {
    await agregarItem({ tipo, payload: d });
    actualizarBadge();
    return {
      ok: true,
      offline: true,
      data: { offline: true },
      mensaje: 'Guardado sin conexión — se enviará automáticamente cuando haya señal.'
    };
  }

  // ══════════════════════════════════════════════════════════
  //  ENVOLTORIOS (wrappers) — intentan lo normal primero
  // ══════════════════════════════════════════════════════════

  DB.guardarTraslado = async function (d) {
    if (navigator.onLine === false) return encolarTraslado(d);
    const res = await _orig.guardarTraslado(d);
    if (res && res.ok) return res;
    if (esErrorDeRed(res)) return encolarTraslado(d);
    return res; // error real de negocio (ej. "ya tiene salida activa") — se muestra igual que siempre
  };

  DB.guardarLlegada = async function (d) {
    if (navigator.onLine === false) return encolarLlegada(d);
    const res = await _orig.guardarLlegada(d);
    if (res && res.ok) return res;
    if (esErrorDeRed(res)) return encolarLlegada(d);
    return res;
  };

  DB.guardarTanqueo = async function (d) {
    if (navigator.onLine === false) return encolarSimple('tanqueo', d);
    const res = await _orig.guardarTanqueo(d);
    if (res && res.ok) return res;
    if (esErrorDeRed(res)) return encolarSimple('tanqueo', d);
    return res;
  };

  DB.guardarAveria = async function (d) {
    if (navigator.onLine === false) return encolarSimple('averia', d);
    const res = await _orig.guardarAveria(d);
    if (res && res.ok) return res;
    if (esErrorDeRed(res)) return encolarSimple('averia', d);
    return res;
  };

  if (_orig.guardarInspeccion) {
    DB.guardarInspeccion = async function (d) {
      if (navigator.onLine === false) return encolarSimple('inspeccion', d);
      const res = await _orig.guardarInspeccion(d);
      if (res && res.ok) return res;
      if (esErrorDeRed(res)) return encolarSimple('inspeccion', d);
      return res;
    };
  }

  // ── Selector de placas: agrega también las Salidas guardadas
  //    localmente (aún sin sincronizar) que todavía no tienen su
  //    Llegada encolada, para que se puedan "cerrar" sin señal.
  DB.obtenerPlacasConTrasladoActivo = async function () {
    const res = await _orig.obtenerPlacasConTrasladoActivo();
    let items = [];
    try { items = await obtenerTodos(); } catch (e) { items = []; }

    const trasladosPendientes = items.filter((it) => it.tipo === 'traslado' && it.estado === 'pendiente');
    const llegadasPendientesIds = new Set(
      items.filter((it) => it.tipo === 'llegada' && it.estado === 'pendiente')
           .map((it) => String(it.payload && it.payload.id_salida || ''))
    );

    const extra = trasladosPendientes
      .filter((it) => !llegadasPendientesIds.has(it.offlineId))
      .map((it) => {
        const d = it.payload || {};
        return {
          placa:            d.placa || '',
          modelo:           '(sin conexión aún)',
          id_salida:        it.offlineId,
          km_salida:        d.km_salida || '',
          fecha:            new Date(it.creado).toLocaleDateString('es-CO'),
          hora_de_salida:   d.hora_salida || '',
          conductor:        d.conductor || '',
          motivo_de_salida: d.motivo || '',
        };
      });

    if (!extra.length) return res;

    const base = (res && res.ok && Array.isArray(res.data)) ? res.data.slice() : [];
    const placasYaListadas = new Set(base.map((t) => String(t.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()));
    extra.forEach((t) => {
      const key = String(t.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (key && !placasYaListadas.has(key)) base.push(t);
    });
    base.sort((a, b) => String(a.placa).localeCompare(String(b.placa)));
    return { ok: true, data: base };
  };

  // ══════════════════════════════════════════════════════════
  //  SINCRONIZACIÓN — se dispara solo, cuando hay señal
  // ══════════════════════════════════════════════════════════

  let _sincronizando = false;

  async function sincronizarCola() {
    if (_sincronizando) return;
    if (navigator.onLine === false) return;
    _sincronizando = true;
    try {
      const items = (await obtenerTodos())
        .filter((it) => it.estado === 'pendiente')
        .sort((a, b) => a.qid - b.qid);

      if (!items.length) return;

      const idsReales = {}; // qid del traslado -> id_salida real ya asignado en este ciclo

      for (const item of items) {
        if (navigator.onLine === false) break; // se cortó la señal a mitad de la sincronización

        try {
          if (item.tipo === 'traslado') {
            const res = await _orig.guardarTraslado(item.payload);
            if (res && res.ok) {
              const idReal = res.id_salida || (res.data && res.data.id_salida) || item.offlineId;
              idsReales[item.qid] = idReal;
              await borrarItem(item.qid);
            } else if (esErrorDeRed(res)) {
              break; // seguimos sin señal, se reintenta en el próximo ciclo
            } else {
              item.estado = 'error';
              item.error  = res.error || 'Error desconocido';
              await actualizarItem(item);
            }

          } else if (item.tipo === 'llegada') {
            const payload = Object.assign({}, item.payload);
            const idOffline = String(payload.id_salida || '');
            if (idOffline.startsWith('S-OFFLINE-')) {
              const idReal = item.dependeQid ? idsReales[item.dependeQid] : null;
              if (!idReal) continue; // la Salida de la que depende aún no se ha sincronizado
              payload.id_salida = idReal;
            }
            const res = await _orig.guardarLlegada(payload);
            if (res && res.ok) {
              await borrarItem(item.qid);
              // Cierre "cosmético" del Traslado (best-effort, igual que en
              // registro_llegada.html) — si falla, no importa: el selector de
              // placas ya excluye este id_salida por tener Llegada guardada.
              if (payload.id_salida) {
                _orig.actualizar('Traslado',
                  { km__ingreso: parseInt(payload.km_ingreso) || 0, hora_de_ingreso: payload.hora_ingreso || '' },
                  'id_salida', payload.id_salida
                ).catch(() => {});
              }
            } else if (esErrorDeRed(res)) {
              break;
            } else {
              item.estado = 'error';
              item.error  = res.error || 'Error desconocido';
              await actualizarItem(item);
            }

          } else if (item.tipo === 'tanqueo' || item.tipo === 'averia' || item.tipo === 'inspeccion') {
            const fn = item.tipo === 'tanqueo' ? _orig.guardarTanqueo
                     : item.tipo === 'averia'  ? _orig.guardarAveria
                     : _orig.guardarInspeccion;
            if (!fn) { await borrarItem(item.qid); continue; }
            const res = await fn(item.payload);
            if (res && res.ok) {
              await borrarItem(item.qid);
            } else if (esErrorDeRed(res)) {
              break;
            } else {
              item.estado = 'error';
              item.error  = res.error || 'Error desconocido';
              await actualizarItem(item);
            }
          }
        } catch (e) {
          console.warn('⚠️ offline-queue.js: excepción sincronizando item', item.qid, e.message);
          break;
        }
      }
    } finally {
      _sincronizando = false;
      actualizarBadge();
    }
  }

  window.addEventListener('online', () => sincronizarCola());
  window.addEventListener('load',   () => setTimeout(sincronizarCola, 2000));
  setInterval(sincronizarCola, 25000);

  // ══════════════════════════════════════════════════════════
  //  INDICADOR VISUAL (badge flotante) — no toca el HTML de cada
  //  página, se inyecta solo. Solo aparece si hay algo pendiente.
  // ══════════════════════════════════════════════════════════

  let _badgeEl = null;
  function crearBadge() {
    if (_badgeEl || !document.body) return;
    _badgeEl = document.createElement('div');
    _badgeEl.id = 'jr-offline-badge';
    _badgeEl.style.cssText = [
      'position:fixed', 'left:12px', 'bottom:12px', 'z-index:99999',
      'background:#1e293b', 'color:#fff', 'padding:10px 16px',
      'border-radius:999px', 'font-family:"DM Sans",sans-serif',
      'font-size:13px', 'font-weight:600', 'box-shadow:0 8px 20px rgba(0,0,0,0.25)',
      'display:none', 'align-items:center', 'gap:8px', 'cursor:pointer',
      'transition:background .2s'
    ].join(';');
    _badgeEl.addEventListener('click', () => sincronizarCola());
    document.body.appendChild(_badgeEl);
  }

  async function actualizarBadge() {
    try {
      if (!document.body) { document.addEventListener('DOMContentLoaded', actualizarBadge, { once: true }); return; }
      crearBadge();
      const items = await obtenerTodos();
      const pendientes = items.filter((it) => it.estado === 'pendiente').length;
      const conError    = items.filter((it) => it.estado === 'error').length;

      if (!pendientes && !conError) {
        _badgeEl.style.display = 'none';
        return;
      }
      _badgeEl.style.display = 'flex';
      if (conError) {
        _badgeEl.style.background = '#b91c1c';
        _badgeEl.textContent = `⚠️ ${conError} con error · toca para reintentar`;
      } else if (navigator.onLine === false) {
        _badgeEl.style.background = '#1e293b';
        _badgeEl.textContent = `📴 ${pendientes} sin enviar (sin señal)`;
      } else {
        _badgeEl.style.background = '#0369a1';
        _badgeEl.textContent = `🔄 Enviando ${pendientes} pendiente(s)...`;
      }
    } catch (e) {
      // Si algo falla mostrando el badge, no debe afectar el resto de la app.
    }
  }

  window.addEventListener('online',  actualizarBadge);
  window.addEventListener('offline', actualizarBadge);
  actualizarBadge();

  console.log('📴 offline-queue.js listo — Salida, Llegada, Tanqueo, Avería e Inspección ahora funcionan sin señal.');
})();
