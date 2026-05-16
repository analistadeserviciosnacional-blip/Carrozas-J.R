/**
 * ══════════════════════════════════════════════════════════
 *  CONECTOR J.R. CARROZAS — db.js  v4.0
 * ══════════════════════════════════════════════════════════
 *
 * ✅ v4 — CORRECCIONES:
 *  1. GASQueryBuilder.update() — faltaba, registro_salida.html lo usa
 *     para actualizar el estado/km de la carroza tras guardar
 *  2. DB.guardarTraslado()     — faltaba, registro_salida.html lo llama
 *  3. Mapeo de campos al header REAL del Sheet (doble guión/doble letra):
 *       km_salida  → km__salida
 *       km_ingreso → km__ingreso
 *       telefono   → nnum_telefono
 *       coordinador→ coordinador_en_turno
 *       fallecido  → nombre_del_fallecido
 *       clinica    → clinica_hospital_o_rsd
 *       prestacion → numero_prestacion
 *  4. Mantiene todos los cambios de v3 (ilike, channel stub, etc.)
 * ══════════════════════════════════════════════════════════
 */

const URL_GAS = "https://script.google.com/macros/s/AKfycbzn7Tedk4Z1oSJdsr0Ww1r83xP4oKEXXlhz7Z4oai25OjsTg2hVaZHcUXPRLgDKU_HzaA/exec";

const SHEET_MAP = {
  'carrozas':              'carrozas_rows',
  'Traslado':              'Traslado_rows',
  'Averias':               'Averias_rows',
  'usuarios':              'usuarios_rows',
  'Llegadas':              'Llegadas_rows',
  'mantenimientos':        'mantenimientos_rows',
  'solicitud_apoyo':       'solicitud_apoyo_rows',
  'notificaciones_apoyo':  'notificaciones_apoyo_rows',
};

function resolveSheet(name) { return SHEET_MAP[name] || name; }

// ── GET BASE ────────────────────────────────────────────────
async function gasGet(sheetName) {
  const url = `${URL_GAS}?sheetName=${encodeURIComponent(resolveSheet(sheetName))}`;
  const resp = await fetch(url, { method: 'GET', redirect: 'follow' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

// ── POST BASE ───────────────────────────────────────────────
async function gasPost(sheetName, payload, action = "insert", idCol = "", idValue = "") {
  const params = new URLSearchParams({
    sheetName: resolveSheet(sheetName),
    action,
    ...(idCol   ? { idCol }   : {}),
    ...(idValue ? { idValue } : {}),
  });
  try {
    const resp = await fetch(`${URL_GAS}?${params}`, {
      method: 'POST', mode: 'cors', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      try   { const d = await resp.json(); return { ok: d.ok !== false, data: d }; }
      catch { return { ok: true }; }
    }
    return { ok: false, error: `HTTP ${resp.status}` };
  } catch (err) {
    console.warn("⚠️ cors bloqueado, usando fallback no-cors:", err.message);
    try {
      await fetch(`${URL_GAS}?${params}`, {
        method: 'POST', mode: 'no-cors', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      });
      return { ok: true, fallback: true };
    } catch(e2) { return { ok: false, error: e2.message }; }
  }
}

// ── QUERY BUILDER ───────────────────────────────────────────
class GASQueryBuilder {
  constructor(tableName) {
    this._table   = tableName;
    this._filters = [];
    this._ilikes  = [];
    this._orders  = [];
    this._limitN  = null;
    this._single  = false;
    // Para update()
    this._updatePayload = null;
  }

  select()           { return this; }
  eq(col, val)       { this._filters.push({ col, val: String(val) }); return this; }
  ilike(col, pattern){ this._ilikes.push({ col, val: pattern.replace(/%/g,'').toLowerCase() }); return this; }
  order(col, opts={}) { this._orders.push({ col, asc: opts.ascending !== false }); return this; }
  limit(n)           { this._limitN = n; return this; }
  single()           { this._single = true; return this; }

  // ── UPDATE ──────────────────────────────────────────────
  // Uso: await DB.supabase.from('carrozas').update({ estado:'En Servicio' }).eq('placa','ABC-123')
  update(payload) {
    this._updatePayload = payload;
    return this; // devuelve this para que .eq() encadenado funcione
  }

  // then() hace que "await builder" funcione
  then(resolve, reject) {
    // Si es un UPDATE
    if (this._updatePayload !== null) {
      // Necesitamos el valor del primer filtro .eq() como idCol/idValue
      const filtro = this._filters[0];
      if (!filtro) { resolve({ data: null, error: { message: 'update requiere .eq()' } }); return; }

      gasPost(this._table, this._updatePayload, 'update', filtro.col, filtro.val)
        .then(res => resolve({ data: res.data || null, error: res.ok ? null : res.error }))
        .catch(err => resolve({ data: null, error: err }));
      return;
    }

    // GET normal
    gasGet(this._table)
      .then(rows => {
        for (const f of this._filters)
          rows = rows.filter(r => String(r[f.col]||'').trim().toLowerCase() === f.val.trim().toLowerCase());
        for (const f of this._ilikes)
          rows = rows.filter(r => String(r[f.col]||'').toLowerCase().includes(f.val));
        for (const o of this._orders)
          rows.sort((a,b) => { const va=String(a[o.col]||''), vb=String(b[o.col]||''); return o.asc?va.localeCompare(vb):vb.localeCompare(va); });
        if (this._limitN) rows = rows.slice(0, this._limitN);
        resolve(this._single
          ? { data: rows[0]||null, error: rows.length?null:{message:'No rows'} }
          : { data: rows, error: null });
      })
      .catch(err => { console.error("DB GET error:", err); resolve({ data: null, error: err }); });
  }
}

// ── STUB REALTIME ───────────────────────────────────────────
class ChannelStub {
  on()        { return this; }
  subscribe() { console.info("ℹ️ Realtime no disponible con Google Sheets."); return this; }
}

// ── OBJETO DB ───────────────────────────────────────────────
const DB = {

  supabase: {
    from(tableName) { return new GASQueryBuilder(tableName); },
    channel()       { return new ChannelStub(); },
  },

  // ── LOGIN ─────────────────────────────────────────────────
  async login(usuario, clave) {
    try {
      const rows = await gasGet('usuarios');
      const match = rows.filter(r =>
        String(r.usuario ||'').trim().toLowerCase() === usuario.trim().toLowerCase() &&
        String(r.password||'').trim()               === clave.trim()
      );
      return match.length > 0 ? { ok: true, data: match[0] } : { ok: false, error: 'Credenciales incorrectas' };
    } catch(e) { return { ok: false, error: e.message }; }
  },

  // ── REGISTRAR USUARIO ─────────────────────────────────────
  async registrarUsuario(datos) {
    return await gasPost('usuarios', { ...datos, created_at: new Date().toISOString() });
  },

  // ── FLOTA ─────────────────────────────────────────────────
  async obtenerFlota() {
    try { return { ok: true, data: await gasGet('carrozas') }; }
    catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  // ── TRASLADOS RECIENTES (dashboard) ───────────────────────
  async obtenerTrasladosRecientes(limite = 50) {
    try {
      let data = await gasGet('Traslado');
      data.sort((a,b) => String(b.fecha||'').localeCompare(String(a.fecha||'')));
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  // ── AVERÍAS (dashboard) ───────────────────────────────────
  async obtenerTodasAverias(limite = 20) {
    try {
      let data = await gasGet('Averias');
      data.sort((a,b) => String(b.created_at||b.fecha||'').localeCompare(String(a.created_at||a.fecha||'')));
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  // ── GUARDAR TRASLADO ← requerida por registro_salida.html ─
  // Mapea los campos del formulario a los headers REALES del Sheet
  // (visibles en la imagen: km__salida, nnum_telefono, etc.)
  async guardarTraslado(d) {
    const fila = {
      // id_salida se puede generar o dejar vacío (el sheet lo tiene como col A)
      id_salida:              'S-' + Date.now(),
      fecha:                  new Date().toLocaleDateString('es-CO'),
      regional:               d.regional              || '',
      conductor:              d.conductor             || '',
      nnum_telefono:          d.telefono              || '',   // ← doble n
      placa:                  d.placa                 || '',
      motivo_de_salida:       d.motivo                || '',
      nombre_del_fallecido:   d.fallecido             || '',   // ← nombre real col
      clinica_hospital_o_rsd: d.clinica               || '',   // ← nombre real col
      numero_prestacion:      d.prestacion            || '',
      origen:                 d.origen                || '',
      destino:                d.destino               || '',
      hora_de_salida:         d.hora_salida           || '',
      hora_de_ingreso:        d.hora_ingreso          || '',
      km__salida:             d.km_salida             || '',   // ← doble guión bajo
      km__ingreso:            d.km_ingreso            || '',   // ← doble guión bajo
      total_km:               d.total_km              || '',
      coordinador_en_turno:   d.coordinador           || '',   // ← nombre real col
      observaciones:          d.observaciones         || '',
      imagen1:                d.imagen1               || '',
      imagen2:                d.imagen2               || '',
      imagen3:                d.imagen3               || '',
      imagen4:                d.imagen4               || '',
      firma:                  d.firma                 || '',
    };
    return await gasPost('Traslado', fila, 'insert');
  },

  // ── ACTUALIZAR CARROZA (estado + km) ─────────────────────
  // Wrapper conveniente — también se puede usar el QueryBuilder directamente
  async actualizarCarroza(placa, campos) {
    return await gasPost('carrozas', campos, 'update', 'placa', placa);
  },

  // ── INSERTAR / ACTUALIZAR GENÉRICO ───────────────────────
  async insertar(hoja, datos)                    { return await gasPost(hoja, datos, 'insert'); },
  async actualizar(hoja, datos, idCol, idValue)  { return await gasPost(hoja, datos, 'update', idCol, idValue); },

  // ── TEST ──────────────────────────────────────────────────
  async testConexion() {
    try {
      const resp = await fetch(URL_GAS, { method: 'GET', redirect: 'follow' });
      return { ok: true, mensaje: await resp.text() };
    } catch(e) { return { ok: false, error: e.message }; }
  },
};

window.DB = DB;

DB.testConexion().then(r => {
  if (r.ok) console.log("🟢 API J.R. conectada:", r.mensaje);
  else      console.warn("🔴 API J.R. sin conexión:", r.error);
});
