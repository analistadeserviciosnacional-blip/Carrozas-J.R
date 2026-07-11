/**
 * ══════════════════════════════════════════════════════════
 *  CONECTOR J.R. CARROZAS — db.js  v12.4
 *  + 🆕 v12.4: Módulo de Tanqueo (guardarTanqueo / obtenerTanqueos)
 *    con los campos reales del formulario (Ciudad, N° factura,
 *    Foto de la tirilla, etc.)
 *  + 🆕 v12.4: Medidor de combustible por carroza. Se asume que cada
 *    tanqueo llena el tanque (práctica normal en la flota), así que:
 *      - Al guardar un Tanqueo → combustible_galones vuelve al 100%
 *        (capacidad_galones) y se calcula el rendimiento real
 *        (km recorridos desde el tanqueo anterior ÷ galones).
 *      - Al guardar una Llegada → se descuenta del tanque el consumo
 *        estimado de ESE viaje (km del viaje ÷ rendimiento conocido
 *        de la carroza, o 25 km/gal por defecto si aún no hay historial).
 *    Así, en la salida siguiente, el conductor ve cuánto combustible
 *    le queda antes de salir.
 *  + 🆕 v12.4: obtenerEstadoCarroza(placa) — combina combustible,
 *    alerta de rendimiento (🟢/🟡/🔴) y estado del próximo cambio de
 *    aceite (usando la hoja "mantenimientos") en un solo objeto, listo
 *    para pintar un panel de estado en el formulario de salida.
 *  + Repuesta la capa de compatibilidad con Supabase
 *    (DB.supabase.from(...)) — otras páginas (dashboard,
 *    panel_coordinador, panel_conductor) sí la necesitaban.
 *  + Anti-duplicados: antes de reintentar un INSERT por timeout,
 *    verifica si la fila ya quedó guardada — si ya existe, NO
 *    vuelve a insertar.
 *  + Bloqueo contra doble click en guardarTraslado/Llegada/Averia/Tanqueo.
 *  + Guardado directo: confirma apenas la escritura principal
 *    responde OK, sin esperar a las actualizaciones secundarias.
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
//  🆕 v12.4 — COMBUSTIBLE Y RENDIMIENTO
// ══════════════════════════════════════════════════════════

// Capacidad de tanque asumida si la carroza no tiene su propia
// "capacidad_galones" registrada. Ajustable por vehículo: basta con
// escribir el valor real en la columna "capacidad_galones" de la
// hoja "carrozas" (se crea sola la primera vez que se use).
const CAPACIDAD_TANQUE_DEFAULT = 55;

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
      const pSel = String(placa).replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const rows = await gasGet('Traslado');

      const abiertos = rows.filter(function(r) {
        const pBase = String(r.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        const sinRegreso = (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '');
        return pBase === pSel && sinRegreso;
      });

      if (abiertos.length === 0) return { ok: true, data: null };

      abiertos.sort(function(a, b) { return claveOrden(b) - claveOrden(a); });
      return { ok: true, data: abiertos[0] };
    } catch (e) {
      return { ok: false, data: null, error: e.message };
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
  // 🆕 v12.4 — TANQUEO
  // ══════════════════════════════════════════════════════════

  // ── GUARDAR TANQUEO ─────────────────────────────────────────
  // d: { carroza, placa, conductor, estacion_servicio, ciudad,
  //      kilometraje, galones, valor_galon, valor_total,
  //      numero_factura, foto_tirilla (base64), observaciones, hora }
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

      const capacidad = parseFloat(carroza.capacidad_galones) || CAPACIDAD_TANQUE_DEFAULT;
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

  // ── GUARDAR TRASLADO ───────────────────────────────────────
  async guardarTraslado(d) {
    return conLock('guardarTraslado', async () => {
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
      return res;
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
  // 🆕 v12.4: además de registrar la llegada, descuenta del tanque de
  // la carroza el combustible estimado que consumió ESE viaje
  // (km del viaje ÷ rendimiento conocido de la carroza, o el valor
  // por defecto si todavía no hay historial de tanqueos).
  async guardarLlegada(d) {
    return conLock('guardarLlegada', async () => {
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
      if (res.ok) {
        DB.invalidarCache('Llegadas');
        actualizarEnSegundoPlano((async () => {
          const estadoPrevio = await DB.obtenerEstadoCarroza(d.placa);
          const rendimiento = (estadoPrevio.ok && estadoPrevio.rendimiento_ultimo_km_gal) || RENDIMIENTO_DEFAULT;
          const combustiblePrevio = estadoPrevio.ok ? estadoPrevio.combustible_galones : CAPACIDAD_TANQUE_DEFAULT;
          const totalKm = parseFloat(d.total_km) || 0;
          const consumoEstimado = totalKm / rendimiento;
          const nuevoCombustible = Math.max(0, Math.round((combustiblePrevio - consumoEstimado) * 10) / 10);

          const r = await DB.actualizarCarroza(d.placa, {
            estado: 'Disponible',
            kilometraje_actual: parseInt(d.km_ingreso) || 0,
            combustible_galones: nuevoCombustible,
          });
          DB.invalidarCache('carrozas');
          return r;
        })(), 'actualizarCarroza tras guardarLlegada');
      }
      return res;
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
      const hojas = ['usuarios', 'carrozas', 'Traslado', 'Averias', 'mantenimientos', 'Tanqueo'];
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
