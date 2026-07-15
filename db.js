/**
 * ══════════════════════════════════════════════════════════
 *  CONECTOR J.R. CARROZAS — db.js  v12.7
 *
 *  🆕 CAMBIOS v12.7 (anti-duplicados en SALIDA y LLEGADA):
 *
 *  Problema detectado: en la hoja "Traslado" aparecieron dos filas
 *  con el MISMO id_salida (S-1783983171345, placa HWT 515) y además
 *  una tercera fila casi idéntica con id_salida distinto pero mismos
 *  datos (misma placa, conductor, hora de salida y motivo), 55
 *  segundos después. Como una de esas filas quedó sin
 *  hora_de_ingreso, el selector de "Registro de Llegada" seguía
 *  marcando la placa como "servicio sin cerrar" días después, aunque
 *  la carroza ya había regresado y vuelto a salir varias veces.
 *
 *  Causa: no existía ninguna verificación — ni por placa activa ni
 *  por contenido — antes de insertar una Salida nueva. Un reintento
 *  del conductor (por creer que el primer guardado falló) terminaba
 *  creando una segunda fila de Salida para el mismo viaje real.
 *
 *  Corrección — 2 guardas nuevas antes de CADA guardado:
 *
 *   1) guardarTraslado(d):
 *      GUARDA 1 — No permite abrir una Salida nueva para una placa
 *      que YA tiene una Salida activa (sin Llegada registrada). Se
 *      responde con { ok:false, duplicado:true, tipo:'salida_activa',
 *      existente:{...} } y un mensaje claro con el id_salida y la
 *      hora del viaje que sigue abierto, para que el formulario lo
 *      muestre al usuario en vez de crear un registro nuevo.
 *
 *      GUARDA 2 — Si los datos del formulario (placa + conductor +
 *      fecha + hora_salida + motivo) coinciden EXACTO con un
 *      Traslado ya existente (esté abierto o cerrado), se asume que
 *      es un doble envío del mismo formulario y NO se inserta una
 *      fila nueva — se reutiliza el id_salida existente
 *      ({ ok:true, data:{yaGuardado:true}, id_salida, duplicado:true }).
 *
 *   2) guardarLlegada(d):
 *      Si ya existe una Llegada guardada con el mismo id_salida, NO
 *      se vuelve a insertar (evita duplicar el cierre de un mismo
 *      Traslado por un reintento manual de "Finalizar Servicio" tras
 *      un timeout que sí había llegado a guardar en el servidor).
 *      Responde { ok:true, data:{yaGuardado:true}, duplicado:true }.
 *
 *  Estas verificaciones siempre leen la hoja SIN caché (se invalida
 *  antes de consultar), para no dar falsos negativos por datos
 *  desactualizados en memoria.
 *
 *  (Se conserva íntegro todo lo demás de v12.6 — nada de lo que ya
 *   funcionaba fue tocado.)
 *
 *  ── Historial v12.6 ──
 *  + guardarTanqueo(d) ahora sí envía FORMA_PAGO y TIPO_COMBUSTIBLE
 *    al backend (antes se descartaban en silencio).
 *
 *  ── Historial v12.5 ──
 *  + obtenerPlacasConTrasladoActivo(): nueva fuente de verdad para el
 *    selector "Elija placa..." del formulario de Llegada, construida
 *    directamente desde la hoja "Traslado" (filas sin hora_de_ingreso
 *    y sin Llegada ya guardada para ese id_salida), en vez de depender
 *    del campo estado de la hoja "carrozas".
 *  + guardarLlegada() ahora ESPERA (await) la actualización de
 *    kilometraje_actual / combustible_galones de la carroza antes de
 *    responder, y deja un error explícito en consola si falla (antes
 *    era fire-and-forget y podía fallar en silencio, descuadrando el
 *    Total KM del siguiente Traslado).
 *
 *  ── Historial v12.4 ──
 *  + Módulo de Tanqueo (guardarTanqueo / obtenerTanqueos) con los
 *    campos reales del formulario (Ciudad, N° factura, Foto de la
 *    tirilla, etc.)
 *  + Medidor de combustible por carroza. Se asume que cada tanqueo
 *    llena el tanque, así que:
 *      - Al guardar un Tanqueo → combustible_galones vuelve al 100%
 *        (capacidad_galones) y se calcula el rendimiento real
 *        (km recorridos desde el tanqueo anterior ÷ galones).
 *      - Al guardar una Llegada → se descuenta del tanque el consumo
 *        estimado de ESE viaje (km del viaje ÷ rendimiento conocido
 *        de la carroza, o 25 km/gal por defecto si aún no hay
 *        historial).
 *  + obtenerEstadoCarroza(placa) — combina combustible, alerta de
 *    rendimiento (🟢/🟡/🔴) y estado del próximo cambio de aceite
 *    (usando la hoja "mantenimientos") en un solo objeto.
 *  + Repuesta la capa de compatibilidad con Supabase
 *    (DB.supabase.from(...)) — otras páginas (dashboard,
 *    panel_coordinador, panel_conductor) sí la necesitaban.
 *  + Anti-duplicados: antes de reintentar un INSERT por timeout,
 *    verifica si la fila ya quedó guardada — si ya existe, NO
 *    vuelve a insertar.
 *  + Bloqueo contra doble click en guardarTraslado/Llegada/Averia/Tanqueo.
 *  + Guardado directo: confirma apenas la escritura principal
 *    responde OK, sin esperar a las actualizaciones secundarias
 *    que no afectan la corrección del dato (p.ej. cierre del
 *    Traslado, que ahora tiene su propio respaldo por Llegadas).
 *  + Caché en memoria con TTL para lecturas
 *  + Deduplicación de lecturas en vuelo
 *  + Timeout largo en escrituras + 1 reintento automático
 *  + Warm-up secuencial al cargar
 * ══════════════════════════════════════════════════════════
 */

const URL_GAS = "https://script.google.com/macros/s/AKfycby3-BtZUU8OrRr9eU3cneGdF4fTvsPOtXshrQn0zmxUtLP5AjgF_qSnulTiQD_eFznZUg/exec";

const SHEET_MAP = {
  'carrozas':             'carrozas',
  'Traslado':             'Traslado',
  'Averias':              'Averias',
  'usuarios':             'usuarios',
  'Llegadas':             'Llegadas',
  'mantenimientos':       'mantenimientos',
  'solicitud_apoyo':      'solicitud_apoyo',
  'notificaciones_apoyo': 'notificaciones_apoyo',
  'config':               'config',
  'Tanqueo':              'Tanqueo',
  'Inspeccion_Vehiculo':  'Inspeccion_Vehiculo',
};

function resolveSheet(name) { return SHEET_MAP[name] || name; }

function fechaHoy() {
  const h = new Date();
  return h.getDate().toString().padStart(2,'0') + '/' +
         (h.getMonth()+1).toString().padStart(2,'0') + '/' +
         h.getFullYear();
}

// ── CLAVE DE ORDEN CRONOLÓGICO REAL ───────────────────────
// Convierte fecha "DD/MM/AAAA" (+ hora opcional "HH:MM") en un
// número AAAAMMDDHHMM comparable. Antes se ordenaba con
// localeCompare sobre el texto tal cual, lo cual es incorrecto
// para fechas en formato DD/MM (p.ej. "12/01/2026" ordenaba
// como más reciente que "05/07/2026" por comparación de texto).
function claveOrden(registro) {
  const f = String((registro && registro.fecha) || '').trim();
  const partes = f.split('/');
  let aaaammdd = '00000000';
  if (partes.length === 3) {
    const dd = partes[0].padStart(2, '0');
    const mm = partes[1].padStart(2, '0');
    const aaaa = partes[2].length === 4 ? partes[2] : ('20' + partes[2]).slice(-4);
    aaaammdd = aaaa + mm + dd;
  }
  const hora = String((registro && (registro.hora_de_salida || registro.hora_ingreso || '')) || '').replace(':', '').padStart(4, '0');
  return parseInt(aaaammdd + hora, 10) || 0;
}

// ── MISMA IDEA, PERO PARA LA HOJA "Tanqueo" (encabezados en MAYÚSCULA) ──
function claveOrdenTanqueo(registro) {
  const f = String((registro && registro.FECHA) || '').trim();
  const partes = f.split('/');
  let aaaammdd = '00000000';
  if (partes.length === 3) {
    const dd = partes[0].padStart(2, '0');
    const mm = partes[1].padStart(2, '0');
    const aaaa = partes[2].length === 4 ? partes[2] : ('20' + partes[2]).slice(-4);
    aaaammdd = aaaa + mm + dd;
  }
  const hora = String((registro && registro.HORA) || '').replace(':', '').padStart(4, '0');
  return parseInt(aaaammdd + hora, 10) || 0;
}

// ── TIMEOUT HELPER ─────────────────────────────────────────
function fetchConTimeout(url, opciones, ms) {
  if (ms === undefined) ms = 15000;
  if (opciones === undefined) opciones = {};
  const controller = new AbortController();
  const timer = setTimeout(function() {
    controller.abort(new Error('TIMEOUT_' + ms + 'ms'));
  }, ms);
  return fetch(url, Object.assign({}, opciones, { signal: controller.signal }))
    .catch(function(err) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        const e = new Error('El servidor tardó demasiado en responder (más de ' + Math.round(ms/1000) + 's). Verifica tu conexión e intenta nuevamente.');
        e.isTimeout = true;
        throw e;
      }
      throw err;
    })
    .finally(function() { clearTimeout(timer); });
}

// ── CACHÉ EN MEMORIA (solo lecturas) ──────────────────────
const _cache    = {};      // { sheetName: { data, ts } }
const _inflight = {};      // { sheetName: Promise }
const CACHE_TTL = 60000;   // 60 segundos

async function gasGet(sheetName) {
  const key = resolveSheet(sheetName);

  const cached = _cache[key];
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return cached.data;
  }

  if (_inflight[key]) return _inflight[key];

  _inflight[key] = (async () => {
    try {
      const url  = `${URL_GAS}?sheetName=${encodeURIComponent(key)}`;
      const resp = await fetchConTimeout(url, { method: 'GET', redirect: 'follow' }, 15000);
      if (!resp.ok) { console.warn(`gasGet ${sheetName}: HTTP ${resp.status}`); return []; }
      const json = await resp.json();
      if (json && json.error) { console.warn(`gasGet ${sheetName}: ${json.error}`); return []; }
      const data = Array.isArray(json) ? json : [];
      _cache[key] = { data, ts: Date.now() };
      return data;
    } catch (err) {
      console.warn(`gasGet ${sheetName} error (${err.name}):`, err.message);
      return [];
    } finally {
      delete _inflight[key];
    }
  })();

  return _inflight[key];
}

// ── VERIFICAR SI UNA FILA YA QUEDÓ GUARDADA ───────────────
async function existeFila(sheetName, col, val) {
  if (!col || val === undefined || val === null || val === '') return false;
  try {
    const key = resolveSheet(sheetName);
    delete _cache[key];
    delete _inflight[key];
    const rows = await gasGet(sheetName);
    return rows.some(function(r) { return String(r[col] || '') === String(val); });
  } catch (e) {
    return false;
  }
}

// ── ESCRITURA con timeout largo ───────────────────────────
async function gasWriteIntento(sheetName, payload, action, idCol, idValue, ms) {
  const urlParams = new URLSearchParams({ sheetName: resolveSheet(sheetName), action });
  if (idCol)   urlParams.set('idCol',   idCol);
  if (idValue) urlParams.set('idValue', idValue);
  const url = `${URL_GAS}?${urlParams}`;

  const resp = await fetchConTimeout(url, {
    method:  'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain' },
    body:    JSON.stringify(payload),
  }, ms);

  if (!resp.ok) { return { ok: false, error: `HTTP ${resp.status}` }; }
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); }
  catch(e) { return { ok: false, error: 'Respuesta no JSON: ' + text.substring(0, 200) }; }
  if (json.ok === false) { return { ok: false, error: json.error || 'Error desconocido' }; }
  return { ok: true, data: json };
}

// ── ESCRITURA con anti-duplicado + 1 reintento automático ─
async function gasWrite(sheetName, payload, action, idCol, idValue) {
  if (action   === undefined) action   = 'insert';
  if (idCol    === undefined) idCol    = '';
  if (idValue  === undefined) idValue  = '';

  const checkCol = (action === 'insert')
    ? (payload.id_salida !== undefined ? 'id_salida' : (payload.id !== undefined ? 'id' : (payload.ID !== undefined ? 'ID' : null)))
    : null;
  const checkVal = checkCol ? payload[checkCol] : null;

  try {
    return await gasWriteIntento(sheetName, payload, action, idCol, idValue, 60000);
  } catch (err) {
    if (!err.isTimeout) {
      console.error('gasWrite excepción:', err);
      return { ok: false, error: err.message };
    }

    console.warn(`gasWrite ${sheetName}: timeout en intento 1.`);

    if (checkCol) {
      const yaExiste = await existeFila(sheetName, checkCol, checkVal);
      if (yaExiste) {
        console.log(`gasWrite ${sheetName}: la fila ya se había guardado, no se reinserta.`);
        return { ok: true, data: { yaGuardado: true } };
      }
    }

    console.warn(`gasWrite ${sheetName}: reintentando con más tiempo…`);
    try {
      const res2 = await gasWriteIntento(sheetName, payload, action, idCol, idValue, 90000);
      return res2;
    } catch (err2) {
      if (err2.isTimeout && checkCol) {
        const yaExiste2 = await existeFila(sheetName, checkCol, checkVal);
        if (yaExiste2) {
          console.log(`gasWrite ${sheetName}: la fila ya se había guardado (2do intento), no se reinserta.`);
          return { ok: true, data: { yaGuardado: true } };
        }
      }
      console.error('gasWrite excepción (reintento):', err2);
      return { ok: false, error: err2.message };
    }
  }
}

// ── ACTUALIZACIÓN SECUNDARIA EN SEGUNDO PLANO ─────────────
// (Solo para procesos que NO son fuente de verdad para el próximo
// servicio, p.ej. el cierre "cosmético" del Traslado — el KM real
// de la carroza ya no depende de esto, ver guardarLlegada v12.5.)
function actualizarEnSegundoPlano(promesa, etiqueta) {
  promesa
    .then(function(res) {
      if (!res.ok) console.warn(`(${etiqueta}) falló en segundo plano:`, res.error);
    })
    .catch(function(err) {
      console.warn(`(${etiqueta}) excepción en segundo plano:`, err.message);
    });
}

// ── BLOQUEO CONTRA DOBLE CLICK ────────────────────────────
const _locks = {};
async function conLock(nombre, fn) {
  if (_locks[nombre]) {
    return { ok: false, error: 'Ya hay un guardado en curso, espera a que termine.' };
  }
  _locks[nombre] = true;
  try {
    return await fn();
  } finally {
    delete _locks[nombre];
  }
}

// ══════════════════════════════════════════════════════════
// 🆕 v12.7 — GUARDAS ANTI-DUPLICADO (SALIDA Y LLEGADA)
// ══════════════════════════════════════════════════════════
// Estas funciones siempre invalidan la caché antes de leer, para no
// dar un falso "no existe" por datos desactualizados en memoria.

// Busca si la placa YA tiene una Salida activa (sin hora_de_ingreso)
// en la hoja "Traslado". Se usa para impedir abrir una segunda
// Salida mientras la anterior sigue abierta.
async function buscarTrasladoAbiertoPorPlaca(placa) {
  const pSel = String(placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!pSel) return null;
  DB.invalidarCache('Traslado');
  const rows = await gasGet('Traslado');
  const abiertos = rows.filter(function(r) {
    const pBase = String(r.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const sinRegreso = (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '');
    return pBase === pSel && sinRegreso;
  });
  if (!abiertos.length) return null;
  abiertos.sort(function(a, b) { return claveOrden(b) - claveOrden(a); });
  return abiertos[0];
}

// Busca si YA existe un Traslado con exactamente los mismos datos
// (misma placa + conductor + fecha + hora de salida + motivo), sin
// importar si sigue abierto o ya se cerró. Esto detecta el caso de
// un doble envío del formulario de Salida (p.ej. el conductor cree
// que falló y presiona "Guardar" de nuevo): la segunda vez genera
// un id_salida distinto (por ser Date.now()) pero el contenido es
// idéntico — antes esto producía dos filas de Salida para el mismo
// viaje real, descuadrando el kilometraje y el combustible.
async function buscarTrasladoDuplicadoPorContenido(d) {
  DB.invalidarCache('Traslado');
  const rows = await gasGet('Traslado');
  const pSel = String(d.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const norm = function(s) { return String(s || '').trim().toLowerCase(); };
  return rows.find(function(r) {
    return String(r.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pSel &&
           norm(r.conductor)        === norm(d.conductor) &&
           norm(r.fecha)            === norm(fechaHoy()) &&
           norm(r.hora_de_salida)   === norm(d.hora_salida) &&
           norm(r.motivo_de_salida) === norm(d.motivo);
  }) || null;
}

// Busca si YA existe una Llegada guardada para este id_salida — evita
// duplicar el cierre de un mismo Traslado (p.ej. reintento manual de
// "Finalizar Servicio" tras un timeout que sí alcanzó a guardar en
// el servidor, o un doble click que sorteó el bloqueo de la sesión).
async function buscarLlegadaPorIdSalida(idSalida) {
  if (!idSalida) return null;
  DB.invalidarCache('Llegadas');
  const rows = await gasGet('Llegadas');
  return rows.find(function(r) { return String(r.id_salida || '').trim() === String(idSalida).trim(); }) || null;
}

// ══════════════════════════════════════════════════════════
//  COMBUSTIBLE Y RENDIMIENTO
// ══════════════════════════════════════════════════════════

// Capacidad de tanque asumida si la carroza no tiene su propia
// "capacidad_galones" registrada. Ajustable por vehículo: basta con
// escribir el valor real en la columna "capacidad_galones" de la
// hoja "carrozas" (se crea sola la primera vez que se use).
const CAPACIDAD_TANQUE_DEFAULT = 55;

// ── 🆕 TABLA DE CAPACIDAD DE TANQUE POR MODELO (en galones) ──────────
// Antes TODAS las carrozas usaban el mismo default (55 gal) sin importar
// si eran un Chery Yoya (tanque real ~9 gal) o una Van N400 (~13 gal),
// lo que dañaba el % de combustible mostrado en el cierre de cada
// servicio. Esta tabla se investigó contra fichas técnicas oficiales /
// fuentes especializadas por modelo, y se aplica por coincidencia de
// palabra clave contra el campo "modelo" de la hoja carrozas (sin
// distinguir mayúsculas/minúsculas). Las reglas se evalúan en orden —
// la primera coincidencia gana — así que las más específicas van primero.
//
// ⚠️ Los valores marcados "estimado" no tienen ficha oficial exacta
// confirmada; son la mejor referencia disponible para ese tipo de
// vehículo. Se puede ajustar cualquiera de estos valores editando
// directamente la columna capacidad_galones de la fila en la hoja
// carrozas — una vez escrita a mano, esa fila deja de usar esta tabla.
const CAPACIDAD_POR_MODELO = [
  { patron: /ssangyong|rodius|stavic/i,              galones: 21.1, fuente: 'SsangYong Rodius/Stavic — tanque 80 L (Wikipedia/ficha oficial)' },
  { patron: /chevrolet\s*hhr|\bhhr\b/i,               galones: 16.1, fuente: 'Chevrolet HHR — tanque 61 L (fichas técnicas oficiales)' },
  { patron: /chevrolet\s*(van\s*)?n[34]00|^\s*n400\b/i, galones: 13.2, fuente: 'Chevrolet N300/N400 — tanque 50 L' },
  { patron: /\bdfsk\b/i,                              galones: 10.6, fuente: 'DFSK C35/C37 — tanque 10.6 gal (ficha DFSK Colombia)' },
  { patron: /chery/i,                                 galones: 9.2,  fuente: 'Chery QQ/Yoya — tanque 35 L' },
  { patron: /suzuki\s*ertiga|ertiga/i,                galones: 11.9, fuente: 'Suzuki Ertiga — tanque 45 L (ficha oficial)' },
  { patron: /volkswagen|saveiro/i,                    galones: 14.5, fuente: 'Volkswagen Saveiro — tanque 55 L (ficha oficial VW)' },
  { patron: /peugeot\s*partner|partner/i,             galones: 15.9, fuente: 'Peugeot Partner — tanque ~60 L (estimado)' },
  { patron: /chevrolet\s*luv|\bluv\b/i,               galones: 15.3, fuente: 'Chevrolet LUV (pickup) — tanque ~58 L (estimado)' },
  { patron: /toyota\s*hilux|hilux/i,                  galones: 18.5, fuente: 'Toyota Hilux — tanque ~70 L (estimado, gen. 1997-2005)' },
  { patron: /nissan\s*np ?300|np ?300/i,               galones: 21.1, fuente: 'Nissan NP300 — tanque 80 L (ficha oficial)' },
  { patron: /nissan\s*frontier|frontier/i,            galones: 21.1, fuente: 'Nissan Frontier — tanque ~80 L (estimado, mismo chasis que NP300)' },
  { patron: /mazda\s*5\b/i,                           galones: 15.9, fuente: 'Mazda 5 — tanque ~60 L (estimado)' },
  { patron: /mazda\s*b\b|b22cs7/i,                    galones: 15.9, fuente: 'Mazda B (pickup) — tanque ~60 L (estimado)' },
  { patron: /\brodeo\b/i,                             galones: 18.5, fuente: 'Isuzu Rodeo — tanque ~70 L (estimado)' },
];

// Devuelve { galones, fuente } si el modelo coincide con alguna regla
// conocida, o null si no hay coincidencia (se usará CAPACIDAD_TANQUE_DEFAULT).
function capacidadPorModelo(modelo) {
  const m = String(modelo || '');
  for (const regla of CAPACIDAD_POR_MODELO) {
    if (regla.patron.test(m)) return { galones: regla.galones, fuente: regla.fuente };
  }
  return null;
}

// Rendimiento (km/galón) que se asume ANTES de tener un primer
// tanqueo histórico para calcular el real.
const RENDIMIENTO_DEFAULT = 25;

// Semáforo de rendimiento, según lo pedido:
//   🟢 > 25 km/galón   → normal
//   🟡 20–25 km/galón  → medio, vigilar
//   🔴 < 20 km/galón   → alto consumo (posible fuga, mala conducción,
//                        problema mecánico o robo de combustible)
function nivelRendimiento(kmPorGalon) {
  const v = Number(kmPorGalon) || 0;
  if (v <= 0) return { nivel: 'sin_datos', emoji: '⚪', texto: 'Sin datos suficientes todavía' };
  if (v > 25)  return { nivel: 'verde',    emoji: '🟢', texto: 'Rendimiento normal' };
  if (v >= 20) return { nivel: 'amarillo', emoji: '🟡', texto: 'Consumo medio — vigilar' };
  return          { nivel: 'rojo',     emoji: '🔴', texto: 'Consumo alto — posible fuga, mala conducción, falla mecánica o robo de combustible' };
}

function nivelTanque(porcentaje) {
  const p = Number(porcentaje) || 0;
  if (p > 50) return '🟢';
  if (p > 20) return '🟡';
  return '🔴';
}

// ══════════════════════════════════════════════════════════
//  CAPA DE COMPATIBILIDAD ESTILO SUPABASE
//  (algunas pantallas como dashboard/panel_coordinador/
//   panel_conductor usan DB.supabase.from(...) en vez de
//   los métodos directos — esto evita que se rompan)
// ══════════════════════════════════════════════════════════
class GASQueryBuilder {
  constructor(t) {
    this._table         = t;
    this._filters       = [];
    this._isNullFilters = [];
    this._ilikes        = [];
    this._orders        = [];
    this._limitN        = null;
    this._single        = false;
    this._updatePayload = null;
    this._insertPayload = null;
  }

  select()            { return this; }
  eq(col, val)        { this._filters.push({ col, val: String(val) }); return this; }
  is(col, val) {
    if (val === null || val === undefined || val === '') {
      this._isNullFilters.push({ col });
    }
    return this;
  }
  ilike(col, pattern) { this._ilikes.push({ col, val: pattern.replace(/%/g,'').toLowerCase() }); return this; }
  order(col, opts)    { if (!opts) opts = {}; this._orders.push({ col, asc: opts.ascending !== false }); return this; }
  limit(n)            { this._limitN = n; return this; }
  single()            { this._single = true; return this; }
  update(payload)     { this._updatePayload = payload; return this; }
  insert(payload) {
    this._insertPayload = Array.isArray(payload) ? payload[0] : payload;
    return this;
  }

  then(resolve, reject) {
    if (this._insertPayload !== null) {
      gasWrite(this._table, this._insertPayload, 'insert')
        .then(function(res) { resolve({ data: null, error: res.ok ? null : { message: res.error } }); })
        .catch(function(err) { resolve({ data: null, error: { message: err.message } }); });
      return;
    }
    if (this._updatePayload !== null) {
      const f = this._filters[0];
      if (!f) { resolve({ data: null, error: { message: 'update requiere .eq()' } }); return; }
      gasWrite(this._table, this._updatePayload, 'update', f.col, f.val)
        .then(function(res) { resolve({ data: null, error: res.ok ? null : { message: res.error } }); })
        .catch(function(err) { resolve({ data: null, error: { message: err.message } }); });
      return;
    }
    const self = this;
    gasGet(this._table)
      .then(function(rows) {
        for (const f of self._filters)
          rows = rows.filter(function(r) { return String(r[f.col]||'').trim().toLowerCase() === f.val.trim().toLowerCase(); });
        for (const f of self._isNullFilters)
          rows = rows.filter(function(r) { return r[f.col] === null || r[f.col] === undefined || String(r[f.col]).trim() === ''; });
        for (const f of self._ilikes)
          rows = rows.filter(function(r) { return String(r[f.col]||'').toLowerCase().includes(f.val); });
        for (const o of self._orders)
          rows.sort(function(a,b) { const va=String(a[o.col]||''), vb=String(b[o.col]||''); return o.asc ? va.localeCompare(vb) : vb.localeCompare(va); });
        if (self._limitN) rows = rows.slice(0, self._limitN);
        resolve(self._single
          ? { data: rows[0]||null, error: rows.length ? null : { message: 'No rows' } }
          : { data: rows, error: null });
      })
      .catch(function(err) { resolve({ data: null, error: { message: err.message } }); });
  }
}

class ChannelStub { on() { return this; } subscribe() { return this; } }

const DB = {

  supabase: {
    from(t)   { return new GASQueryBuilder(t); },
    channel() { return new ChannelStub(); },
  },

  // ── CACHÉ: INVALIDAR UNA HOJA ──────────────────────────────
  invalidarCache(sheetName) {
    const key = resolveSheet(sheetName);
    delete _cache[key];
  },

  // ── CACHÉ: PRECARGAR HOJAS ────────────────────────────────
  async prefetch() {
    const hojas = Array.from(arguments);
    await Promise.all(hojas.map(function(h) { return gasGet(h); }));
  },

  // ── LOGIN ──────────────────────────────────────────────────
  async login(usuario, clave) {
    try {
      const rows  = await gasGet('usuarios');
      const match = rows.filter(function(r) {
        return String(r.usuario ||'').trim().toLowerCase() === usuario.trim().toLowerCase() &&
               String(r.password||'').trim()               === clave.trim();
      });
      return match.length > 0
        ? { ok: true,  data: match[0] }
        : { ok: false, error: 'Credenciales incorrectas' };
    } catch(e) { return { ok: false, error: e.message }; }
  },

  async registrarUsuario(datos) {
    return await gasWrite('usuarios', Object.assign({}, datos, { created_at: new Date().toISOString() }), 'insert');
  },

  async obtenerFlota() {
    try { return { ok: true, data: await gasGet('carrozas') }; }
    catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerTrasladosRecientes(limite) {
    if (limite === undefined) limite = 50;
    try {
      let data = await gasGet('Traslado');
      data.sort(function(a,b) { return claveOrden(b) - claveOrden(a); });
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  // ── BUSCAR EL TRASLADO ACTIVO (AÚN NO REGRESA) DE UNA PLACA ─
  // No depende de límites de filas ni de un orden de texto: trae
  // TODA la hoja, filtra por placa + sin hora_de_ingreso, y ordena
  // por fecha/hora real (no alfabética) para tomar el más reciente.
  async obtenerTrasladoActivoPorPlaca(placa) {
    try {
      if (!placa) return { ok: true, data: null };
      const activo = await buscarTrasladoAbiertoPorPlaca(placa);
      return { ok: true, data: activo };
    } catch (e) {
      return { ok: false, data: null, error: e.message };
    }
  },

  // ══════════════════════════════════════════════════════════
  // 🆕 v12.5 — PLACAS CON TRASLADO ACTIVO (fuente real del selector)
  // ══════════════════════════════════════════════════════════
  // Devuelve solo las placas que en este momento están "en la calle":
  // tienen un registro en la hoja Traslado con hora_de_ingreso vacía
  // (todavía no regresaron) Y que además NO tengan ya una Llegada
  // guardada para ese id_salida (por si el cierre automático del
  // Traslado falló tras sus reintentos y quedó "abierto" por error,
  // aunque la Llegada sí exista).
  //
  // Esto reemplaza la dependencia del campo "estado" de la hoja
  // carrozas para poblar el selector de placas en Registro de
  // Llegada: ese campo puede desincronizarse, mientras que la hoja
  // Traslado es la fuente operativa real de "quién salió y no ha
  // vuelto".
  async obtenerPlacasConTrasladoActivo() {
    try {
      const [traslados, llegadas, flota] = await Promise.all([
        gasGet('Traslado'), gasGet('Llegadas'), gasGet('carrozas')
      ]);

      const idsConLlegada = new Set(
        llegadas.map(function(l) { return String(l.id_salida || '').trim(); }).filter(Boolean)
      );

      const abiertos = traslados.filter(function(r) {
        const sinRegreso = (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '');
        const yaTieneLlegada = r.id_salida && idsConLlegada.has(String(r.id_salida).trim());
        return sinRegreso && !yaTieneLlegada;
      });

      // Si una misma placa tuviera más de un Traslado abierto (dato
      // sucio / caso raro), se toma el más reciente por fecha/hora real.
      const porPlaca = {};
      abiertos.forEach(function(r) {
        const pBase = String(r.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        if (!pBase) return;
        if (!porPlaca[pBase] || claveOrden(r) > claveOrden(porPlaca[pBase])) {
          porPlaca[pBase] = r;
        }
      });

      const resultado = Object.keys(porPlaca).map(function(pBase) {
        const t = porPlaca[pBase];
        const carroza = flota.find(function(c) {
          return String(c.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pBase;
        });
        return {
          placa:            t.placa || '',
          modelo:           carroza ? (carroza.modelo || '') : '',
          id_salida:        t.id_salida || '',
          km_salida:        t.km__salida || t.km_salida || '',
          fecha:            t.fecha || '',
          hora_de_salida:   t.hora_de_salida || '',
          conductor:        t.conductor || '',
          motivo_de_salida: t.motivo_de_salida || '',
        };
      });

      resultado.sort(function(a, b) { return String(a.placa).localeCompare(String(b.placa)); });
      return { ok: true, data: resultado };
    } catch (e) {
      return { ok: false, data: [], error: e.message };
    }
  },

  async obtenerTodasAverias(limite) {
    if (limite === undefined) limite = 20;
    try {
      let data = await gasGet('Averias');
      data.sort(function(a,b) { return String(b.created_at||b.fecha||'').localeCompare(String(a.created_at||a.fecha||'')); });
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerMantenimientos(limite) {
    if (limite === undefined) limite = 50;
    try {
      let data = await gasGet('mantenimientos');
      data.sort(function(a,b) { return String(b.fecha||'').localeCompare(String(a.fecha||'')); });
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  // ══════════════════════════════════════════════════════════
  // TANQUEO
  // ══════════════════════════════════════════════════════════

  // ── GUARDAR TANQUEO ─────────────────────────────────────────
  // d: { carroza, placa, conductor, estacion_servicio, ciudad,
  //      kilometraje, galones, valor_galon, valor_total,
  //      numero_factura, foto_tirilla (base64), observaciones, hora,
  //      forma_pago, tipo_combustible }
  async guardarTanqueo(d) {
    return conLock('guardarTanqueo', async () => {
      try {
        const pSel = String(d.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

        // 1) Buscar el tanqueo anterior de esta misma placa, para poder
        //    calcular el rendimiento REAL (km recorridos ÷ galones cargados).
        const historico = await gasGet('Tanqueo');
        const anteriores = historico
          .filter(r => String(r.PLACA || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pSel)
          .sort((a, b) => claveOrdenTanqueo(b) - claveOrdenTanqueo(a));
        const anterior = anteriores[0] || null;

        const kmActual = parseFloat(d.kilometraje) || 0;
        const galones  = parseFloat(d.galones) || 0;
        let kmRecorridos = '';
        let rendimiento  = '';
        let alertaTexto  = '';

        if (anterior && parseFloat(anterior.KILOMETRAJE) > 0 && kmActual > parseFloat(anterior.KILOMETRAJE)) {
          kmRecorridos = kmActual - parseFloat(anterior.KILOMETRAJE);
          if (galones > 0) {
            rendimiento = Math.round((kmRecorridos / galones) * 10) / 10;
            alertaTexto = nivelRendimiento(rendimiento).texto;
          }
        }

        const fila = {
          ID:                   '', // Code.gs asigna el consecutivo TQ-00001
          FECHA:                fechaHoy(),
          HORA:                 d.hora || new Date().toTimeString().slice(0, 5),
          CARROZA:              d.carroza || '',
          PLACA:                d.placa || '',
          CONDUCTOR:            d.conductor || '',
          ESTACION_SERVICIO:    d.estacion_servicio || '',
          CIUDAD:               d.ciudad || '',
          KILOMETRAJE:          kmActual,
          GALONES:              galones,
          VALOR_GALON:          d.valor_galon || '',
          VALOR_TOTAL:          d.valor_total || '',
          NUMERO_FACTURA:       d.numero_factura || '',
          FOTO_TIRILLA:         d.foto_tirilla || '',
          OBSERVACIONES:        d.observaciones || '',
          KM_RECORRIDOS:        kmRecorridos,
          RENDIMIENTO_KM_GALON: rendimiento,
          ALERTA_RENDIMIENTO:   alertaTexto,
          // 🆕 v12.6 — antes faltaban estos dos campos y se descartaban
          // en silencio, dejando siempre vacías las columnas FORMA_PAGO
          // y TIPO_COMBUSTIBLE de la hoja "Tanqueo".
          FORMA_PAGO:           d.forma_pago || '',
          TIPO_COMBUSTIBLE:     d.tipo_combustible || '',
        };

        const res = await gasWrite('Tanqueo', fila, 'insert');

        if (res.ok) {
          DB.invalidarCache('Tanqueo');

          // 2) Se asume que cada tanqueo llena el tanque → el medidor
          //    de esa carroza vuelve al 100% de su capacidad, y se
          //    guarda el rendimiento recién calculado para usarlo
          //    en el descuento de las próximas llegadas.
          actualizarEnSegundoPlano((async () => {
            const estado = await DB.obtenerEstadoCarroza(d.placa);
            const capacidad = (estado.ok && estado.capacidad_galones) || CAPACIDAD_TANQUE_DEFAULT;
            const r = await DB.actualizarCarroza(d.placa, {
              kilometraje_actual:        kmActual,
              combustible_galones:       capacidad,
              ultimo_rendimiento_km_gal: rendimiento || '',
            });
            DB.invalidarCache('carrozas');
            return r;
          })(), 'actualizarCarroza tras guardarTanqueo');
        }

        return Object.assign({}, res, {
          km_recorridos: kmRecorridos,
          rendimiento_km_galon: rendimiento,
          alerta_rendimiento: rendimiento ? nivelRendimiento(rendimiento) : null,
        });
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
  },

  async obtenerTanqueos(limite) {
    if (limite === undefined) limite = 50;
    try {
      let data = await gasGet('Tanqueo');
      data.sort((a, b) => claveOrdenTanqueo(b) - claveOrdenTanqueo(a));
      return { ok: true, data: data.slice(0, limite) };
    } catch (e) { return { ok: false, data: [], error: e.message }; }
  },

  // ── ESTADO ACTUAL DE UNA CARROZA (combustible + aceite + rendimiento) ──
  // Pensado para pintar un panel de estado tanto en el formulario de
  // Tanqueo como en el de Salida (Traslado), para que el conductor vea
  // de un vistazo cómo está la carroza antes de salir.
  async obtenerEstadoCarroza(placa) {
    try {
      const [flota, mants] = await Promise.all([gasGet('carrozas'), gasGet('mantenimientos')]);
      const pSel = String(placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const carroza = flota.find(r => String(r.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pSel);
      if (!carroza) return { ok: false, error: 'Carroza no encontrada' };

      // 🆕 Si la fila no tiene capacidad_galones escrita a mano, se busca
      // en la tabla CAPACIDAD_POR_MODELO por el campo "modelo" de la
      // carroza; solo si tampoco hay coincidencia se usa el default plano.
      const capacidadFila = parseFloat(carroza.capacidad_galones) || 0;
      const matchModelo = capacidadFila > 0 ? null : capacidadPorModelo(carroza.modelo);
      const capacidad = capacidadFila > 0 ? capacidadFila
        : (matchModelo ? matchModelo.galones : CAPACIDAD_TANQUE_DEFAULT);
      // Si nunca se ha registrado combustible para esta carroza, asumimos
      // que arranca llena (mejor que asumir 0 y disparar falsas alarmas).
      const combustible = (carroza.combustible_galones !== undefined && String(carroza.combustible_galones).trim() !== '')
        ? parseFloat(carroza.combustible_galones)
        : capacidad;
      const porcentaje = Math.max(0, Math.min(100, Math.round((combustible / capacidad) * 100)));

      const rendimientoUltimo = parseFloat(carroza.ultimo_rendimiento_km_gal) || 0;
      const alertaRendimiento = nivelRendimiento(rendimientoUltimo);

      // Próximo cambio de aceite: última orden de mantenimiento tipo
      // "aceite" para esta placa que tenga un km_proximo_cambio registrado.
      const ordenesAceite = mants
        .filter(m => String(m.placa || '').toUpperCase() === String(carroza.placa || '').toUpperCase()
                  && /aceite/i.test(m.tipo_servicio || '')
                  && Number(m.km_proximo_cambio) > 0)
        .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));

      const kmActual = Number(carroza.kilometraje_actual) || 0;
      let estadoAceite = { texto: 'Sin registro de cambio de aceite', emoji: '⚪', faltan: null };
      if (ordenesAceite.length) {
        const proximoCambioKm = Number(ordenesAceite[0].km_proximo_cambio);
        const faltan = proximoCambioKm - kmActual;
        if (faltan <= 0)        estadoAceite = { texto: `Cambio de aceite VENCIDO (hace ${Math.abs(faltan)} km)`, emoji: '🔴', faltan };
        else if (faltan <= 500) estadoAceite = { texto: `Próximo cambio de aceite en ${faltan} km`, emoji: '🟡', faltan };
        else                    estadoAceite = { texto: `Aceite al día (${faltan} km restantes)`, emoji: '🟢', faltan };
      }

      return {
        ok: true,
        placa: carroza.placa,
        combustible_galones: Math.round(combustible * 10) / 10,
        capacidad_galones: capacidad,
        capacidad_origen: capacidadFila > 0 ? 'registrada en carrozas' : (matchModelo ? matchModelo.fuente : 'default genérico (55 gal) — modelo no identificado'),
        porcentaje_combustible: porcentaje,
        nivel_combustible: nivelTanque(porcentaje),
        rendimiento_ultimo_km_gal: rendimientoUltimo || null,
        alerta_rendimiento: alertaRendimiento,
        kilometraje_actual: kmActual,
        estado_aceite: estadoAceite,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // ── GUARDAR TRASLADO (SALIDA) ──────────────────────────────
  // 🆕 v12.7: dos guardas anti-duplicado ANTES de insertar. Ver el
  // changelog al inicio del archivo para el detalle de cada una.
  async guardarTraslado(d) {
    return conLock('guardarTraslado', async () => {

      // GUARDA 1 — ¿esta placa ya tiene una Salida activa (sin cerrar)?
      try {
        const abierto = await buscarTrasladoAbiertoPorPlaca(d.placa);
        if (abierto) {
          return {
            ok: false,
            duplicado: true,
            tipo: 'salida_activa',
            existente: abierto,
            error: `La carroza ${d.placa} ya tiene una salida activa sin cerrar ` +
                   `(${abierto.id_salida}, del ${abierto.fecha} a las ${abierto.hora_de_salida}, ` +
                   `conductor ${abierto.conductor || 's/d'}). Registra su Llegada antes de abrir una nueva salida.`
          };
        }
      } catch (e) {
        console.warn('No se pudo verificar si había una salida activa previa (se continúa igual):', e.message);
      }

      // GUARDA 2 — ¿esta MISMA Salida ya se guardó (doble envío del formulario)?
      try {
        const duplicado = await buscarTrasladoDuplicadoPorContenido(d);
        if (duplicado) {
          console.warn('Salida duplicada detectada por contenido — se reutiliza el id_salida existente:', duplicado.id_salida);
          return { ok: true, data: { yaGuardado: true }, id_salida: duplicado.id_salida, duplicado: true };
        }
      } catch (e) {
        console.warn('No se pudo verificar duplicado de salida por contenido (se continúa igual):', e.message);
      }

      const fila = {
        id_salida:              'S-' + Date.now(),
        fecha:                  fechaHoy(),
        regional:               d.regional              || '',
        conductor:              d.conductor             || '',
        nnum_telefono:          d.nnum_telefono         || '',
        placa:                  d.placa                 || '',
        motivo_de_salida:       d.motivo                || '',
        nombre_del_fallecido:   d.fallecido             || '',
        clinica_hospital_o_rsd: d.clinica               || '',
        numero_prestacion:      d.prestacion            || '',
        origen:                 d.origen                || '',
        destino:                d.destino               || '',
        hora_de_salida:         d.hora_salida           || '',
        hora_de_ingreso:        '',
        km__salida:             d.km_salida             || '',
        km__ingreso:            '',
        total_km:               '',
        coordinador_en_turno:   d.coordinador           || '',
        observaciones:          d.observaciones         || '',
        imagen1:                d.imagen1               || '',
        firma:                  d.firma                 || '',
        imagen2:                d.imagen2               || '',
        imagen3:                d.imagen3               || '',
        imagen4:                d.imagen4               || '',
        kit_carretera:          d.kit_carretera         || '',
      };
      const res = await gasWrite('Traslado', fila, 'insert');
      if (res.ok) {
        DB.invalidarCache('Traslado');
        actualizarEnSegundoPlano(
          DB.actualizarCarroza(d.placa, {
            estado: 'En Servicio',
            kilometraje_actual: parseInt(d.km_salida) || 0
          }).then((r) => { DB.invalidarCache('carrozas'); return r; }),
          'actualizarCarroza tras guardarTraslado'
        );
      }
      return res.ok ? Object.assign({}, res, { id_salida: fila.id_salida }) : res;
    });
  },

  // ── ACTUALIZAR TRASLADO ────────────────────────────────────
  async actualizarTraslado(idSalida, d) {
    return conLock('actualizarTraslado', async () => {
      try {
        const campos = {
          regional:               d.regional      || '',
          conductor:              d.conductor     || '',
          nnum_telefono:          d.nnum_telefono || '',
          placa:                  d.placa         || '',
          motivo_de_salida:       d.motivo        || '',
          nombre_del_fallecido:   d.fallecido     || '',
          clinica_hospital_o_rsd: d.clinica       || '',
          numero_prestacion:      d.prestacion    || '',
          origen:                 d.origen        || '',
          destino:                d.destino       || '',
          hora_de_salida:         d.hora_salida   || '',
          km__salida:             d.km_salida     || '',
          coordinador_en_turno:   d.coordinador   || '',
          observaciones:          d.observaciones || '',
          imagen1:                d.imagen1       || '',
          imagen2:                d.imagen2       || '',
          imagen3:                d.imagen3       || '',
          imagen4:                d.imagen4       || '',
          firma:                  d.firma         || '',
          kit_carretera:          d.kit_carretera || '',
        };
        const res = await gasWrite('Traslado', campos, 'update', 'id_salida', idSalida);
        if (res.ok) {
          DB.invalidarCache('Traslado');
          actualizarEnSegundoPlano(
            DB.actualizarCarroza(d.placa, {
              kilometraje_actual: parseInt(d.km_salida) || 0
            }).then((r) => { DB.invalidarCache('carrozas'); return r; }),
            'actualizarCarroza tras actualizarTraslado'
          );
        }
        return res;
      } catch(e) {
        return { ok: false, error: e.message };
      }
    });
  },

  // ── VERIFICAR DUPLICADO ────────────────────────────────────
  async verificarDuplicadoSalida(placa) {
    try {
      const hoy  = fechaHoy();
      const rows = await gasGet('Traslado');
      const activos = rows.filter(function(r) {
        return String(r.placa||'').trim().toUpperCase() === placa.trim().toUpperCase() &&
               String(r.fecha||'').trim()               === hoy &&
               (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '');
      });
      if (activos.length === 0) return { existe: false, id_salida: null, detalle: null };
      activos.sort(function(a,b) { return String(b.hora_de_salida||'').localeCompare(String(a.hora_de_salida||'')); });
      const reg = activos[0];
      return { existe: true, id_salida: reg.id_salida || null, detalle: reg };
    } catch(e) {
      return { existe: false, id_salida: null, detalle: null };
    }
  },

  // ── GUARDAR LLEGADA ────────────────────────────────────────
  // 🆕 v12.7: antes de insertar, verifica si YA existe una Llegada
  // guardada para este id_salida — si es así, no vuelve a insertar
  // (evita duplicar el cierre de un mismo Traslado). Ver changelog.
  //
  // 🆕 v12.5: Además de registrar la llegada, se ESPERA (await) la
  // actualización de kilometraje_actual y combustible de la carroza
  // antes de responder. El kilometraje_actual es la fuente de verdad
  // que usará el SIGUIENTE Traslado (salida) como KM de salida —
  // por eso ya no puede quedar como una escritura "de segundo plano"
  // sin garantía: si fallara en silencio, el próximo servicio
  // arrancaría con un KM de salida incorrecto y el Total KM del
  // reporte quedaría descuadrado (el error reportado).
  //
  // Se descuenta del tanque el combustible estimado que consumió ESE
  // viaje (km del viaje ÷ rendimiento conocido de la carroza, o el
  // valor por defecto si todavía no hay historial de tanqueos).
  async guardarLlegada(d) {
    return conLock('guardarLlegada', async () => {

      // GUARDA — ¿ya existe una Llegada para este id_salida?
      if (d.id_salida) {
        try {
          const existente = await buscarLlegadaPorIdSalida(d.id_salida);
          if (existente) {
            console.warn('Llegada duplicada detectada — ya existe un registro para este id_salida:', existente.id);
            return {
              ok: true,
              data: { yaGuardado: true },
              duplicado: true,
              existente: existente,
              estado_carroza_despues: { ok: false },
              estado_carroza_antes: { ok: false },
              combustible_guardado_en_registro: false,
            };
          }
        } catch (e) {
          console.warn('No se pudo verificar Llegada duplicada (se continúa igual):', e.message);
        }
      }

      const fila = {
        id:             'L-' + Date.now(),
        id_salida:      d.id_salida      || '',   // trazabilidad: enlaza con el Traslado de origen
        fecha:          fechaHoy(),
        hora_ingreso:   d.hora_ingreso   || '',
        placa:          d.placa          || '',
        km_ingreso:     d.km_ingreso     || '',
        total_km:       d.total_km       || '',
        estado_entrega: d.estado_entrega || '',
        observaciones:  d.observaciones  || '',
        recibido_por:   d.recibido_por   || '',
        created_at:     new Date().toISOString(),
      };
      const res = await gasWrite('Llegadas', fila, 'insert');
      if (!res.ok) return res;

      DB.invalidarCache('Llegadas');

      // ── ACTUALIZACIÓN DE KM/COMBUSTIBLE — AHORA SE ESPERA ──
      let estadoDespues              = { ok: false };
      let estadoPrevio               = { ok: false };
      let rendimientoUsado           = RENDIMIENTO_DEFAULT;
      let carrozaActualizadaOk       = false;
      let combustibleGuardadoEnRegistro = false;

      try {
        estadoPrevio = await DB.obtenerEstadoCarroza(d.placa);
        rendimientoUsado = (estadoPrevio.ok && estadoPrevio.rendimiento_ultimo_km_gal) || RENDIMIENTO_DEFAULT;
        const combustiblePrevio = estadoPrevio.ok ? estadoPrevio.combustible_galones : CAPACIDAD_TANQUE_DEFAULT;
        const totalKm           = parseFloat(d.total_km) || 0;
        const consumoEstimado   = totalKm / rendimientoUsado;
        const nuevoCombustible  = Math.max(0, Math.round((combustiblePrevio - consumoEstimado) * 10) / 10);
        const kmLlegadaNum      = parseInt(d.km_ingreso) || 0;

        const upd = await DB.actualizarCarroza(d.placa, {
          estado:               'Disponible',
          kilometraje_actual:   kmLlegadaNum,
          combustible_galones:  nuevoCombustible,
        });

        carrozaActualizadaOk = !!upd.ok;

        if (upd.ok) {
          DB.invalidarCache('carrozas');
          estadoDespues = await DB.obtenerEstadoCarroza(d.placa);
        } else {
          console.error(
            `❌ La carroza ${d.placa} NO quedó actualizada (km_ingreso=${kmLlegadaNum}) tras guardar la Llegada. ` +
            `El próximo Traslado de esta placa puede arrancar con un KM de salida incorrecto. Revisar manualmente. Error: ${upd.error}`
          );
        }
      } catch (e) {
        console.error('Error actualizando carroza tras guardarLlegada:', e.message);
      }

      // ── 🆕 ANEXAR AL PROPIO REGISTRO DE LLEGADA EL ESTADO DE
      //    COMBUSTIBLE (antes / después / consumido / rendimiento usado) ──
      // Esto queda guardado en la hoja "Llegadas" como una segunda
      // escritura (update por id), para que el cierre de combustible de
      // cada servicio sea auditable después — se puede abrir la hoja o
      // el registro y comparar el % con el que salió vs. el % con el
      // que se cerró, y así verificar si el consumo reportado es real.
      try {
        const consumidoGal = (estadoPrevio.ok && estadoDespues && estadoDespues.ok)
          ? Math.round((estadoPrevio.combustible_galones - estadoDespues.combustible_galones) * 10) / 10
          : '';

        const camposCombustible = {
          combustible_antes_porcentaje:    estadoPrevio.ok ? estadoPrevio.porcentaje_combustible : '',
          combustible_antes_galones:       estadoPrevio.ok ? estadoPrevio.combustible_galones     : '',
          combustible_despues_porcentaje:  (estadoDespues && estadoDespues.ok) ? estadoDespues.porcentaje_combustible : '',
          combustible_despues_galones:     (estadoDespues && estadoDespues.ok) ? estadoDespues.combustible_galones   : '',
          combustible_consumido_galones:   consumidoGal,
          capacidad_galones_carroza:       estadoPrevio.ok ? estadoPrevio.capacidad_galones : '',
          rendimiento_usado_km_gal:        rendimientoUsado,
          carroza_actualizada:             carrozaActualizadaOk ? 'SI' : 'NO — revisar manualmente',
        };

        const resCombustible = await gasWrite('Llegadas', camposCombustible, 'update', 'id', fila.id);
        combustibleGuardadoEnRegistro = !!resCombustible.ok;
        if (!resCombustible.ok) {
          console.warn('⚠️ No se pudo anexar el estado de combustible al registro de Llegada ' + fila.id + ':', resCombustible.error);
        } else {
          DB.invalidarCache('Llegadas');
        }
      } catch (e) {
        console.warn('⚠️ Error anexando combustible al registro de Llegada:', e.message);
      }

      return Object.assign({}, res, {
        estado_carroza_despues: estadoDespues,
        estado_carroza_antes: estadoPrevio,
        combustible_guardado_en_registro: combustibleGuardadoEnRegistro,
      });
    });
  },

  // ── GUARDAR AVERÍA ─────────────────────────────────────────
  async guardarAveria(d) {
    return conLock('guardarAveria', async () => {
      const fila = {
        id:                   'AV-' + Date.now(),
        reportado_por:        d.reportado_por       || '',
        regional:             d.regional            || '',
        placa_vehiculo:       d.placa_vehiculo      || '',
        tipo_vehiculo:        d.tipo_vehiculo       || '',
        tipo_falla:           d.tipo_falla          || '',
        descripcion_sintomas: d.descripcion_sintomas|| '',
        observaciones:        d.observaciones       || '',
        imagen1:              d.imagen1             || '',
        imagen2:              d.imagen2             || '',
        imagen3:              d.imagen3             || '',
        imagen4:              d.imagen4             || '',
        created_at:           new Date().toISOString(),
      };
      const res = await gasWrite('Averias', fila, 'insert');
      if (res.ok) {
        DB.invalidarCache('Averias');
        const h        = new Date();
        const fechaISO = h.getFullYear() + '-' +
                         (h.getMonth()+1).toString().padStart(2,'0') + '-' +
                         h.getDate().toString().padStart(2,'0');
        const filaMant = {
          id:                   'M-' + Date.now(),
          fecha:                fechaISO,
          placa:                d.placa_vehiculo,
          tipo_servicio:        'Avería — ' + (d.tipo_falla || 'Falla mecánica'),
          kilometraje_servicio: 0,
          costo:                0,
          taller:               'Por asignar',
          responsable:          d.reportado_por,
          observaciones:        '🚨 ORDEN POR AVERÍA\nSíntomas: ' + d.descripcion_sintomas + '\nReportado por: ' + d.reportado_por,
          km_proximo_cambio:    0,
          estado_orden:         'pendiente',
        };

        actualizarEnSegundoPlano(
          DB.actualizarCarroza(d.placa_vehiculo, { estado: 'En Taller' })
            .then((r) => { DB.invalidarCache('carrozas'); return r; }),
          'actualizarCarroza tras guardarAveria'
        );
        actualizarEnSegundoPlano(
          gasWrite('mantenimientos', filaMant, 'insert')
            .then((r) => { DB.invalidarCache('mantenimientos'); return r; }),
          'crear orden de mantenimiento tras guardarAveria'
        );
      }
      return res;
    });
  },

  async actualizarCarroza(placa, campos) {
    return await gasWrite('carrozas', campos, 'update', 'placa', placa);
  },

  // ══════════════════════════════════════════════════════════
  // 🆕 INICIALIZAR capacidad_galones EN TODA LA FLOTA (una sola vez)
  // ══════════════════════════════════════════════════════════
  // Recorre la hoja "carrozas" y, para cada placa que NO tenga ya un
  // valor en capacidad_galones, escribe la capacidad real investigada
  // en CAPACIDAD_POR_MODELO (o el default de 55 gal si el modelo no
  // se pudo identificar). Es seguro ejecutarlo varias veces: las filas
  // que ya tengan un valor (sea porque ya se corrió antes, o porque se
  // editó a mano) NO se tocan.
  //
  // Cómo ejecutarlo una sola vez (por ejemplo desde la consola del
  // navegador en cualquier pantalla que cargue db.js):
  //     await DB.inicializarCapacidadesTanque()
  //
  // Devuelve un resumen: cuántas se actualizaron, cuántas ya tenían
  // valor, y cuántas quedaron con el default por no identificar el
  // modelo (para poder revisarlas y corregirlas a mano si se quiere).
  async inicializarCapacidadesTanque() {
    try {
      const flota = await gasGet('carrozas');
      const resumen = { actualizadas: [], yaTenian: [], sinModeloIdentificado: [], errores: [] };

      for (const carroza of flota) {
        const placa = carroza.placa;
        if (!placa) continue;

        const yaTiene = parseFloat(carroza.capacidad_galones) > 0;
        if (yaTiene) {
          resumen.yaTenian.push(placa);
          continue;
        }

        const match = capacidadPorModelo(carroza.modelo);
        const galones = match ? match.galones : CAPACIDAD_TANQUE_DEFAULT;

        try {
          const res = await DB.actualizarCarroza(placa, { capacidad_galones: galones });
          if (res.ok) {
            resumen.actualizadas.push({ placa, modelo: carroza.modelo, galones, fuente: match ? match.fuente : 'default genérico' });
            if (!match) resumen.sinModeloIdentificado.push({ placa, modelo: carroza.modelo });
          } else {
            resumen.errores.push({ placa, error: res.error });
          }
        } catch (e) {
          resumen.errores.push({ placa, error: e.message });
        }
      }

      DB.invalidarCache('carrozas');
      console.log(
        `✅ Capacidad de tanque inicializada: ${resumen.actualizadas.length} carrozas actualizadas, ` +
        `${resumen.yaTenian.length} ya tenían valor, ${resumen.errores.length} con error.`
      );
      if (resumen.sinModeloIdentificado.length) {
        console.warn('⚠️ Estas placas quedaron con el default genérico (55 gal) por no reconocer el modelo — revisar si se quiere ajustar a mano:', resumen.sinModeloIdentificado);
      }
      return { ok: true, resumen };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async insertar(hoja, datos) {
    const res = await gasWrite(hoja, datos, 'insert');
    if (res.ok) this.invalidarCache(hoja);
    return res;
  },

  async actualizar(hoja, datos, idCol, idValue) {
    const res = await gasWrite(hoja, datos, 'update', idCol, idValue);
    if (res.ok) this.invalidarCache(hoja);
    return res;
  },

  async testConexion() {
    try {
      const resp = await fetchConTimeout(URL_GAS, { method: 'GET', redirect: 'follow' }, 10000);
      const json = await resp.json();
      return { ok: true, mensaje: json.mensaje || JSON.stringify(json) };
    } catch(e) { return { ok: false, error: e.message }; }
  },

  async obtenerLogo() {
    try {
      const rows = await gasGet('config');
      const fila = rows.find(function(r) { return String(r.clave||'').trim() === 'logo_app'; });
      return { ok: true, logo: (fila && fila.valor && fila.valor.length > 10) ? fila.valor : null };
    } catch(e) { return { ok: false, logo: null, error: e.message }; }
  },

  async guardarLogo(base64) {
    try {
      const rows   = await gasGet('config');
      const existe = rows.find(function(r) { return String(r.clave||'').trim() === 'logo_app'; });
      let res;
      if (existe) res = await gasWrite('config', { valor: base64 }, 'update', 'clave', 'logo_app');
      else        res = await gasWrite('config', { clave: 'logo_app', valor: base64 }, 'insert');
      if (res.ok) this.invalidarCache('config');
      return res;
    } catch(e) { return { ok: false, error: e.message }; }
  },

  async eliminarLogo() {
    const res = await gasWrite('config', { valor: '' }, 'update', 'clave', 'logo_app');
    if (res.ok) this.invalidarCache('config');
    return res;
  },

  // ── GUARDAR INSPECCIÓN VEHICULAR ───────────────────────────
  // Guarda la inspección completa en la hoja "Inspeccion_Vehiculo".
  // El backend (Code.gs v10.7+) auto-crea la hoja con sus ~80 columnas
  // la primera vez que se usa. El ID lo asigna Code.gs automáticamente
  // (prefijo INSP-) si el payload lleva ID vacío o numérico.
  async guardarInspeccion(datos) {
    return conLock('guardarInspeccion', async () => {
      try {
        // Normalizamos el ID: si viene como timestamp numérico lo borramos
        // para que Code.gs asigne el consecutivo INSP-XXXXX correcto.
        const payload = Object.assign({}, datos);
        if (payload.ID && String(payload.ID).length > 8) {
          // Es un timestamp de Date.now() — lo descartamos
          payload.ID = '';
        }
        const res = await gasWrite('Inspeccion_Vehiculo', payload, 'insert');
        if (res.ok) {
          this.invalidarCache('Inspeccion_Vehiculo');
          // Si el estado de inspección es NO OPERATIVO → marcar carroza En Taller
          if (datos.ESTADO_INSPECCION === 'NO OPERATIVO') {
            actualizarEnSegundoPlano(
              this.actualizarCarroza(datos.PLACA, { estado: 'En Taller' })
                .then(r => { this.invalidarCache('carrozas'); return r; }),
              'actualizarCarroza tras inspeccion NO OPERATIVO'
            );
          } else if (datos.KILOMETRAJE) {
            // Actualizar km de la carroza con el reportado en la inspección
            actualizarEnSegundoPlano(
              this.actualizarCarroza(datos.PLACA, {
                kilometraje_actual: parseInt(datos.KILOMETRAJE) || 0
              }).then(r => { this.invalidarCache('carrozas'); return r; }),
              'actualizarCarroza km tras inspeccion'
            );
          }
        }
        return res;
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
  },

  // ── VERIFICAR INSPECCIÓN HECHA HOY ────────────────────────
  // Consulta el endpoint especial del GAS (action=checkInspeccionHoy)
  // que revisa si ya existe una inspección OK para esta placa hoy.
  // inspeccion.html puede usar esto para mostrar modo CONFIRMACIÓN.
  async verificarInspeccionHoy(placa) {
    try {
      const url = `${URL_GAS}?action=checkInspeccionHoy&placa=${encodeURIComponent(placa)}`;
      const resp = await fetchConTimeout(url, { method: 'GET', redirect: 'follow' }, 12000);
      if (!resp.ok) return { existe: false };
      const json = await resp.json();
      return json;
    } catch (e) {
      console.warn('verificarInspeccionHoy error:', e.message);
      return { existe: false };
    }
  },

};

window.DB = DB;

// ── WARM-UP SECUENCIAL AL INICIAR ─────────────────────────
(async function() {
  try {
    const ping = await DB.testConexion();
    if (ping.ok) {
      console.log('🟢 API J.R. conectada:', ping.mensaje);
      const hojas = ['usuarios', 'carrozas', 'Traslado', 'Averias', 'mantenimientos', 'Tanqueo', 'Llegadas'];
      for (let i = 0; i < hojas.length; i++) {
        await gasGet(hojas[i]);
        await new Promise(function(r) { setTimeout(r, 300); });
      }
      console.log('✅ Caché precargado correctamente');
    } else {
      console.warn('🔴 API J.R. sin conexión:', ping.error);
    }
  } catch(e) {
    console.warn('🔴 Error en warm-up:', e.message);
  }
})();
