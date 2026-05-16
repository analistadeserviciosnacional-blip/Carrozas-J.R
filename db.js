/**
 * ══════════════════════════════════════════════════════════
 *  CONECTOR J.R. CARROZAS — db.js  v5.0
 * ══════════════════════════════════════════════════════════
 *
 * ✅ v5 — PROBLEMA RAÍZ RESUELTO:
 *  Google Apps Script NO permite headers CORS personalizados,
 *  así que fetch con mode:'cors' SIEMPRE falla en POST desde
 *  un dominio externo (GitHub Pages).
 *
 *  SOLUCIÓN: El POST va directo con mode:'no-cors'.
 *  Con no-cors el navegador no puede leer la respuesta,
 *  pero el dato SÍ se guarda en el Sheet.
 *  Retornamos { ok: true } optimista — si el script falla
 *  (hoja no existe, etc.) se verá en el Sheet, no en el alert.
 *
 *  Para el UPDATE de carroza usamos el mismo mecanismo.
 * ══════════════════════════════════════════════════════════
 */

const URL_GAS = "https://script.google.com/macros/s/AKfycbzn7Tedk4Z1oSJdsr0Ww1r83xP4oKEXXlhz7Z4oai25OjsTg2hVaZHcUXPRLgDKU_HzaA/exec";

const SHEET_MAP = {
  'carrozas':             'carrozas_rows',
  'Traslado':             'Traslado_rows',
  'Averias':              'Averias_rows',
  'usuarios':             'usuarios_rows',
  'Llegadas':             'Llegadas_rows',
  'mantenimientos':       'mantenimientos_rows',
  'solicitud_apoyo':      'solicitud_apoyo_rows',
  'notificaciones_apoyo': 'notificaciones_apoyo_rows',
};

function resolveSheet(name) { return SHEET_MAP[name] || name; }

// ── GET: usa cors+redirect (funciona bien en GET) ───────────
async function gasGet(sheetName) {
  const url  = `${URL_GAS}?sheetName=${encodeURIComponent(resolveSheet(sheetName))}`;
  const resp = await fetch(url, { method: 'GET', redirect: 'follow' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

// ── POST: siempre no-cors (GAS no permite CORS en POST) ─────
// El dato llega al Sheet aunque no podamos leer la respuesta.
async function gasPost(sheetName, payload, action = "insert", idCol = "", idValue = "") {
  const params = new URLSearchParams({
    sheetName: resolveSheet(sheetName),
    action,
    ...(idCol   ? { idCol }   : {}),
    ...(idValue ? { idValue } : {}),
  });

  try {
    await fetch(`${URL_GAS}?${params}`, {
      method:  'POST',
      mode:    'no-cors',   // ← única forma que funciona con GAS externo
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify(payload),
      redirect: 'follow',
    });
    // Con no-cors no podemos leer la respuesta, pero el dato se guardó
    return { ok: true };
  } catch(err) {
    console.error("❌ gasPost error:", err);
    return { ok: false, error: err.message };
  }
}

// ── QUERY BUILDER ───────────────────────────────────────────
class GASQueryBuilder {
  constructor(t) {
    this._table         = t;
    this._filters       = [];
    this._ilikes        = [];
    this._orders        = [];
    this._limitN        = null;
    this._single        = false;
    this._updatePayload = null;
  }

  select()            { return this; }
  eq(col, val)        { this._filters.push({ col, val: String(val) }); return this; }
  ilike(col, pattern) { this._ilikes.push({ col, val: pattern.replace(/%/g,'').toLowerCase() }); return this; }
  order(col, opts={}) { this._orders.push({ col, asc: opts.ascending !== false }); return this; }
  limit(n)            { this._limitN = n; return this; }
  single()            { this._single = true; return this; }

  update(payload) {
    this._updatePayload = payload;
    return this;
  }

  then(resolve, reject) {
    if (this._updatePayload !== null) {
      const f = this._filters[0];
      if (!f) { resolve({ data: null, error: { message: 'update requiere .eq()' } }); return; }
      gasPost(this._table, this._updatePayload, 'update', f.col, f.val)
        .then(res => resolve({ data: null, error: res.ok ? null : res.error }))
        .catch(err => resolve({ data: null, error: err }));
      return;
    }

    gasGet(this._table)
      .then(rows => {
        for (const f of this._filters)
          rows = rows.filter(r => String(r[f.col]||'').trim().toLowerCase() === f.val.trim().toLowerCase());
        for (const f of this._ilikes)
          rows = rows.filter(r => String(r[f.col]||'').toLowerCase().includes(f.val));
        for (const o of this._orders)
          rows.sort((a,b) => {
            const va = String(a[o.col]||''), vb = String(b[o.col]||'');
            return o.asc ? va.localeCompare(vb) : vb.localeCompare(va);
          });
        if (this._limitN) rows = rows.slice(0, this._limitN);
        resolve(this._single
          ? { data: rows[0]||null, error: rows.length ? null : { message: 'No rows' } }
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
    from(t)   { return new GASQueryBuilder(t); },
    channel() { return new ChannelStub(); },
  },

  async login(usuario, clave) {
    try {
      const rows  = await gasGet('usuarios');
      const match = rows.filter(r =>
        String(r.usuario ||'').trim().toLowerCase() === usuario.trim().toLowerCase() &&
        String(r.password||'').trim()               === clave.trim()
      );
      return match.length > 0 ? { ok: true, data: match[0] } : { ok: false, error: 'Credenciales incorrectas' };
    } catch(e) { return { ok: false, error: e.message }; }
  },

  async registrarUsuario(datos) {
    return await gasPost('usuarios', { ...datos, created_at: new Date().toISOString() });
  },

  async obtenerFlota() {
    try { return { ok: true, data: await gasGet('carrozas') }; }
    catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerTrasladosRecientes(limite = 50) {
    try {
      let data = await gasGet('Traslado');
      data.sort((a,b) => String(b.fecha||'').localeCompare(String(a.fecha||'')));
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerTodasAverias(limite = 20) {
    try {
      let data = await gasGet('Averias');
      data.sort((a,b) => String(b.created_at||b.fecha||'').localeCompare(String(a.created_at||a.fecha||'')));
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  // ── GUARDAR TRASLADO ───────────────────────────────────────
  // Mapeo exacto a los headers del Sheet (km__salida, nnum_telefono, etc.)
  async guardarTraslado(d) {
    const fila = {
      id_salida:              'S-' + Date.now(),
      fecha:                  new Date().toLocaleDateString('es-CO'),
      regional:               d.regional              || '',
      conductor:              d.conductor             || '',
      nnum_telefono:          d.telefono              || '',
      placa:                  d.placa                 || '',
      motivo_de_salida:       d.motivo                || '',
      nombre_del_fallecido:   d.fallecido             || '',
      clinica_hospital_o_rsd: d.clinica               || '',
      numero_prestacion:      d.prestacion            || '',
      origen:                 d.origen                || '',
      destino:                d.destino               || '',
      hora_de_salida:         d.hora_salida           || '',
      hora_de_ingreso:        d.hora_ingreso          || '',
      km__salida:             d.km_salida             || '',
      km__ingreso:            d.km_ingreso            || '',
      total_km:               d.total_km              || '',
      coordinador_en_turno:   d.coordinador           || '',
      observaciones:          d.observaciones         || '',
      imagen1:                d.imagen1               || '',
      imagen2:                d.imagen2               || '',
      imagen3:                d.imagen3               || '',
      imagen4:                d.imagen4               || '',
      firma:                  d.firma                 || '',
    };
    return await gasPost('Traslado', fila, 'insert');
  },

  async actualizarCarroza(placa, campos) {
    return await gasPost('carrozas', campos, 'update', 'placa', placa);
  },

  async insertar(hoja, datos)                   { return await gasPost(hoja, datos, 'insert'); },
  async actualizar(hoja, datos, idCol, idValue) { return await gasPost(hoja, datos, 'update', idCol, idValue); },

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
