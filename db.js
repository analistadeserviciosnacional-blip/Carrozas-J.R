/**
 * ══════════════════════════════════════════════════════════
 *  CONECTOR J.R. CARROZAS — db.js  v12.3
 *  + 🆕 v12.3: guardarLlegada ahora incluye id_salida en la fila,
 *    para poder rastrear qué Llegada corresponde a qué Traslado
 *    (trazabilidad / auditoría de desfaces de KM).
 *  + Repuesta la capa de compatibilidad con Supabase
 *    (DB.supabase.from(...)) — otras páginas (dashboard,
 *    panel_coordinador, panel_conductor) sí la necesitaban.
 *  + Anti-duplicados: antes de reintentar un INSERT por timeout,
 *    verifica si la fila ya quedó guardada — si ya existe, NO
 *    vuelve a insertar.
 *  + Bloqueo contra doble click en guardarTraslado/Llegada/Averia.
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
    ? (payload.id_salida !== undefined ? 'id_salida' : (payload.id !== undefined ? 'id' : null))
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
  async guardarLlegada(d) {
    return conLock('guardarLlegada', async () => {
      const fila = {
        id:             'L-' + Date.now(),
        id_salida:      d.id_salida      || '',   // 🆕 trazabilidad: enlaza con el Traslado de origen
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
        actualizarEnSegundoPlano(
          DB.actualizarCarroza(d.placa, {
            estado: 'Disponible',
            kilometraje_actual: parseInt(d.km_ingreso) || 0
          }).then((r) => { DB.invalidarCache('carrozas'); return r; }),
          'actualizarCarroza tras guardarLlegada'
        );
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

};

window.DB = DB;

// ── WARM-UP SECUENCIAL AL INICIAR ─────────────────────────
(async function() {
  try {
    const ping = await DB.testConexion();
    if (ping.ok) {
      console.log('🟢 API J.R. conectada:', ping.mensaje);
      const hojas = ['usuarios', 'carrozas', 'Traslado', 'Averias', 'mantenimientos'];
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
