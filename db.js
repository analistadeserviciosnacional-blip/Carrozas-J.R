/**
 * ══════════════════════════════════════════════════════════
 *  CONECTOR J.R. CARROZAS — db.js  v8.0 FINAL
 *
 *  CAMBIO DEFINITIVO:
 *  gasWrite() ahora usa POST con body JSON.
 *  - Sin límite de URL → firma e imágenes funcionan
 *  - Google Apps Script con doPost() recibe el body completo
 *  - Compatible con el nuevo Code.gs v5
 * ══════════════════════════════════════════════════════════
 */

const URL_GAS = "https://script.google.com/macros/s/AKfycbwnusHdaZUJ6EayiWc8Xj655U-57HOiz58YdGmypuwMtb3xnd67EETpDlH0d_D8FAvvuA/exec";

// Los nombres de hoja deben coincidir EXACTAMENTE con las pestañas del Google Sheet.
// Si tus pestañas tienen sufijo _rows, agrégalos aquí. Si no, déjalos igual.
const SHEET_MAP = {
  // Mapeo vacío: el nombre que se usa en el código ES el nombre real de la pestaña.
  // Ejemplo si quisieras renombrar: 'carrozas': 'Carrozas'
};

function resolveSheet(name) { return SHEET_MAP[name] || name; }

// ── LECTURA via GET ─────────────────────────────────────────
async function gasGet(sheetName) {
  try {
    const url  = `${URL_GAS}?sheetName=${encodeURIComponent(resolveSheet(sheetName))}`;
    const resp = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (!resp.ok) { console.warn(`gasGet ${sheetName}: HTTP ${resp.status}`); return []; }
    const json = await resp.json();
    if (json && json.error) { console.warn(`gasGet ${sheetName}: ${json.error}`); return []; }
    return Array.isArray(json) ? json : [];
  } catch (err) {
    console.warn(`gasGet ${sheetName} error:`, err.message);
    return [];
  }
}

// ── ESCRITURA via POST (body JSON, sin límite de tamaño) ────
async function gasWrite(sheetName, payload, action = "insert", idCol = "", idValue = "") {
  const urlParams = new URLSearchParams({ sheetName: resolveSheet(sheetName), action });
  if (idCol)   urlParams.set('idCol',   idCol);
  if (idValue) urlParams.set('idValue', idValue);

  const url = `${URL_GAS}?${urlParams}`;

  try {
    const resp = await fetch(url, {
      method:   'POST',
      redirect: 'follow',
      headers:  { 'Content-Type': 'text/plain' },   // text/plain evita preflight CORS
      body:     JSON.stringify(payload),
    });

    if (!resp.ok) {
      console.error(`gasWrite HTTP ${resp.status} para ${sheetName}`);
      return { ok: false, error: `HTTP ${resp.status}` };
    }

    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); }
    catch(e) { return { ok: false, error: 'Respuesta no JSON: ' + text.substring(0, 200) }; }

    if (json.ok === false) {
      console.error(`gasWrite error en hoja ${sheetName}:`, json.error);
      return { ok: false, error: json.error || 'Error desconocido' };
    }

    return { ok: true, data: json };
  } catch(err) {
    console.error('gasWrite excepción:', err);
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
  update(payload)     { this._updatePayload = payload; return this; }

  then(resolve, reject) {
    if (this._updatePayload !== null) {
      const f = this._filters[0];
      if (!f) { resolve({ data: null, error: { message: 'update requiere .eq()' } }); return; }
      gasWrite(this._table, this._updatePayload, 'update', f.col, f.val)
        .then(res => resolve({ data: null, error: res.ok ? null : { message: res.error } }))
        .catch(err => resolve({ data: null, error: { message: err.message } }));
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
      .catch(err => resolve({ data: null, error: { message: err.message } }));
  }
}

// ── STUB REALTIME ────────────────────────────────────────────
class ChannelStub {
  on()        { return this; }
  subscribe() { return this; }
}

// ── OBJETO DB ────────────────────────────────────────────────
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
      return match.length > 0
        ? { ok: true,  data: match[0] }
        : { ok: false, error: 'Credenciales incorrectas' };
    } catch(e) { return { ok: false, error: e.message }; }
  },

  async registrarUsuario(datos) {
    return await gasWrite('usuarios', { ...datos, created_at: new Date().toISOString() }, 'insert');
  },

  async obtenerFlota() {
    try { return { ok: true,  data: await gasGet('carrozas') }; }
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

  async obtenerMantenimientos(limite = 50) {
    try {
      let data = await gasGet('mantenimientos');
      data.sort((a,b) => String(b.fecha||'').localeCompare(String(a.fecha||'')));
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  // ── GUARDAR TRASLADO ──────────────────────────────────────
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
    return await gasWrite('Traslado', fila, 'insert');
  },

  async actualizarCarroza(placa, campos) {
    return await gasWrite('carrozas', campos, 'update', 'placa', placa);
  },

  async insertar(hoja, datos) {
    return await gasWrite(hoja, datos, 'insert');
  },

  async actualizar(hoja, datos, idCol, idValue) {
    return await gasWrite(hoja, datos, 'update', idCol, idValue);
  },

  async testConexion() {
    try {
      const resp = await fetch(URL_GAS, { method: 'GET', redirect: 'follow' });
      const json = await resp.json();
      return { ok: true, mensaje: json.mensaje || JSON.stringify(json) };
    } catch(e) { return { ok: false, error: e.message }; }
  },
};

window.DB = DB;

DB.testConexion().then(r => {
  if (r.ok) console.log("🟢 API J.R. conectada:", r.mensaje);
  else      console.warn("🔴 API J.R. sin conexión:", r.error);
});
