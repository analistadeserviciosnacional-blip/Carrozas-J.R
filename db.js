/**
 * ══════════════════════════════════════════════════════════
 *  CONECTOR J.R. CARROZAS — db.js  v3.0 (COMPLETO)
 * ══════════════════════════════════════════════════════════
 *
 * ✅ CORRECCIONES:
 *  1. gasPost: usa cors + text/plain (evita preflight OPTIONS)
 *  2. GASQueryBuilder: soporte para .ilike() — búsqueda parcial
 *  3. DB.obtenerTrasladosRecientes() — necesaria en dashboard.html
 *  4. DB.obtenerTodasAverias()       — necesaria en dashboard.html
 *  5. DB.supabase.channel()          — stub seguro (no-op) para
 *     panel_conductor.html que usa realtime de Supabase.
 *     Con Google Sheets no hay realtime; el canal simplemente
 *     no hace nada y el resto del panel funciona normal.
 * ══════════════════════════════════════════════════════════
 */

// ── CONFIGURACIÓN ──────────────────────────────────────────
const URL_GAS = "https://script.google.com/macros/s/AKfycbzn7Tedk4Z1oSJdsr0Ww1r83xP4oKEXXlhz7Z4oai25OjsTg2hVaZHcUXPRLgDKU_HzaA/exec";

// ⚠️ Estos nombres deben coincidir EXACTAMENTE con las pestañas
// de tu Google Spreadsheet.
const SHEET_MAP = {
  'carrozas': 'carrozas_rows',
  'Traslado': 'Traslado_rows',
  'Averias':  'Averias_rows',
  'usuarios': 'usuarios_rows',
  'Llegadas': 'Llegadas_rows',
};

function resolveSheet(name) {
  return SHEET_MAP[name] || name;
}

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
      method:   'POST',
      mode:     'cors',
      redirect: 'follow',
      headers:  { 'Content-Type': 'text/plain' },
      body:     JSON.stringify(payload),
    });
    if (resp.ok) {
      try   { const d = await resp.json(); return { ok: d.ok !== false, data: d }; }
      catch { return { ok: true }; }
    }
    return { ok: false, error: `HTTP ${resp.status}` };
  } catch (err) {
    // Fallback no-cors: el dato se guarda pero no podemos leer la respuesta
    console.warn("⚠️ cors bloqueado, usando no-cors fallback:", err.message);
    try {
      await fetch(`${URL_GAS}?${params}`, {
        method:   'POST',
        mode:     'no-cors',
        redirect: 'follow',
        headers:  { 'Content-Type': 'text/plain' },
        body:     JSON.stringify(payload),
      });
      return { ok: true, fallback: true };
    } catch(e2) {
      return { ok: false, error: e2.message };
    }
  }
}

// ── QUERY BUILDER (imita API de Supabase) ──────────────────
class GASQueryBuilder {
  constructor(tableName) {
    this._table   = tableName;
    this._filters = [];
    this._ilikes  = [];
    this._orders  = [];
    this._limitN  = null;
    this._single  = false;
  }

  select(cols) { return this; }
  eq(col, val) { this._filters.push({ col, val: String(val) }); return this; }

  // ilike('conductor', '%Juan%') → busca filas donde conductor contenga "juan"
  ilike(col, pattern) {
    const limpio = pattern.replace(/%/g, '').toLowerCase();
    this._ilikes.push({ col, val: limpio });
    return this;
  }

  order(col, opts = {}) {
    this._orders.push({ col, asc: opts.ascending !== false });
    return this;
  }

  limit(n)  { this._limitN = n; return this; }
  single()  { this._single = true; return this; }

  then(resolve, reject) {
    gasGet(this._table)
      .then(rows => {
        for (const f of this._filters) {
          rows = rows.filter(r =>
            String(r[f.col] || '').trim().toLowerCase() === f.val.trim().toLowerCase()
          );
        }
        for (const f of this._ilikes) {
          rows = rows.filter(r =>
            String(r[f.col] || '').toLowerCase().includes(f.val)
          );
        }
        for (const o of this._orders) {
          rows.sort((a, b) => {
            const va = String(a[o.col] || '');
            const vb = String(b[o.col] || '');
            return o.asc ? va.localeCompare(vb) : vb.localeCompare(va);
          });
        }
        if (this._limitN) rows = rows.slice(0, this._limitN);

        if (this._single) {
          resolve({ data: rows[0] || null, error: rows.length ? null : { message: 'No rows' } });
        } else {
          resolve({ data: rows, error: null });
        }
      })
      .catch(err => {
        console.error("DB GET error:", err);
        resolve({ data: null, error: err });
      });
  }
}

// ── STUB DE REALTIME (no-op) ────────────────────────────────
// panel_conductor.html llama DB.supabase.channel().on(...).subscribe()
// Google Sheets no tiene realtime. Este stub evita el error JS sin
// romper el panel. Las notificaciones push en tiempo real no funcionan
// con esta arquitectura (requeriría polling o migrar a Supabase/Firebase).
class ChannelStub {
  on()        { return this; }
  subscribe() {
    console.info("ℹ️ Realtime no disponible con Google Sheets backend.");
    return this;
  }
}

// ── OBJETO DB PÚBLICO ───────────────────────────────────────
const DB = {

  supabase: {
    from(tableName) { return new GASQueryBuilder(tableName); },
    channel(name)   { return new ChannelStub(); },
  },

  // ── LOGIN ─────────────────────────────────────────────────
  async login(usuario, clave) {
    try {
      const rows = await gasGet('usuarios');
      const match = rows.filter(r =>
        String(r.usuario  || '').trim().toLowerCase() === usuario.trim().toLowerCase() &&
        String(r.password || '').trim()               === clave.trim()
      );
      if (match.length > 0) return { ok: true, data: match[0] };
      return { ok: false, error: 'Credenciales incorrectas' };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  },

  // ── REGISTRAR USUARIO ─────────────────────────────────────
  async registrarUsuario(datos) {
    return await gasPost('usuarios', {
      ...datos,
      created_at: new Date().toISOString(),
    });
  },

  // ── FLOTA ─────────────────────────────────────────────────
  async obtenerFlota() {
    try {
      const data = await gasGet('carrozas');
      return { ok: true, data: data || [] };
    } catch(e) {
      return { ok: false, data: [], error: e.message };
    }
  },

  // ── TRASLADOS RECIENTES ← requerida por dashboard.html ────
  async obtenerTrasladosRecientes(limite = 50) {
    try {
      let data = await gasGet('Traslado');
      data.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) {
      console.error("obtenerTrasladosRecientes:", e);
      return { ok: false, data: [], error: e.message };
    }
  },

  // ── TODAS LAS AVERÍAS ← requerida por dashboard.html ──────
  async obtenerTodasAverias(limite = 20) {
    try {
      let data = await gasGet('Averias');
      data.sort((a, b) =>
        String(b.created_at || b.fecha || '').localeCompare(String(a.created_at || a.fecha || ''))
      );
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) {
      console.error("obtenerTodasAverias:", e);
      return { ok: false, data: [], error: e.message };
    }
  },

  // ── INSERTAR ──────────────────────────────────────────────
  async insertar(hoja, datos) {
    return await gasPost(hoja, datos, 'insert');
  },

  // ── ACTUALIZAR ────────────────────────────────────────────
  async actualizar(hoja, datos, idCol, idValue) {
    return await gasPost(hoja, datos, 'update', idCol, idValue);
  },

  // ── TEST DE CONEXIÓN ──────────────────────────────────────
  async testConexion() {
    try {
      const resp = await fetch(URL_GAS, { method: 'GET', redirect: 'follow' });
      const text = await resp.text();
      return { ok: true, mensaje: text };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  },
};

window.DB = DB;

DB.testConexion().then(r => {
  if (r.ok) console.log("🟢 API J.R. conectada:", r.mensaje);
  else      console.warn("🔴 API J.R. sin conexión:", r.error);
});
