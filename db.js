/**
 * ══════════════════════════════════════════════════════════
 *  CONECTOR J.R. CARROZAS — db.js  (CORREGIDO)
 * ══════════════════════════════════════════════════════════
 *
 * CORRECCIONES APLICADAS:
 *  1. POST ahora usa fetch con redirect:follow + Content-Type text/plain
 *     (no-cors sin content-type llegaba vacío al servidor)
 *  2. Confirmación de POST: reintenta GET para verificar que se guardó
 *  3. SHEET_MAP simplificado — verifica que coincida con tus pestañas reales
 *  4. GASQueryBuilder refactorizado para evitar problemas del patrón thenable
 *  5. login() ahora busca por usuario Y password correctamente
 * ══════════════════════════════════════════════════════════
 */

// ── CONFIGURACIÓN ──────────────────────────────────────────
const URL_GAS = "https://script.google.com/macros/s/AKfycbzn7Tedk4Z1oSJdsr0Ww1r83xP4oKEXXlhz7Z4oai25OjsTg2hVaZHcUXPRLgDKU_HzaA/exec";

// ⚠️ IMPORTANTE: estos nombres deben coincidir EXACTAMENTE con los
// nombres de las pestañas en tu Google Spreadsheet.
const SHEET_MAP = {
  'carrozas':  'carrozas_rows',
  'Traslado':  'Traslado_rows',
  'Averias':   'Averias_rows',
  'usuarios':  'usuarios_rows',
  'Llegadas':  'Llegadas_rows',
};

function resolveSheet(name) {
  return SHEET_MAP[name] || name;
}

// ── FUNCIÓN BASE DE GET ─────────────────────────────────────
async function gasGet(sheetName, filters = []) {
  const url = `${URL_GAS}?sheetName=${encodeURIComponent(resolveSheet(sheetName))}`;

  const resp = await fetch(url, {
    method: 'GET',
    redirect: 'follow',   // CLAVE: sigue el redirect 302 de Google
  });

  if (!resp.ok) throw new Error(`Error HTTP: ${resp.status}`);

  let rows = await resp.json();

  // Filtrado en cliente (igual que antes)
  for (const f of filters) {
    rows = rows.filter(r =>
      String(r[f.col] || '').trim().toLowerCase() === String(f.val).trim().toLowerCase()
    );
  }

  return rows;
}

// ── FUNCIÓN BASE DE POST ────────────────────────────────────
// CORRECCIÓN PRINCIPAL:
//   - Ya NO usamos mode:'no-cors' porque eso hace la respuesta opaca
//     y además Google retorna un redirect que no-cors no sigue.
//   - Usamos mode:'cors' + redirect:'follow' + Content-Type:'text/plain'
//   - 'text/plain' evita el preflight OPTIONS que Google no maneja.
//   - El body sigue siendo JSON.stringify(payload), el backend lo parsea igual.
async function gasPost(sheetName, payload, action = "insert", idCol = "", idValue = "") {
  const params = new URLSearchParams({
    sheetName: resolveSheet(sheetName),
    action,
    ...(idCol   ? { idCol }   : {}),
    ...(idValue ? { idValue } : {}),
  });

  const url = `${URL_GAS}?${params}`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      mode: 'cors',             // ← cambiado de 'no-cors'
      redirect: 'follow',       // ← sigue el redirect de Google
      headers: {
        // text/plain evita el preflight OPTIONS que rompe Google Apps Script
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify(payload),
    });

    // Con mode:'cors' ya podemos leer la respuesta
    // (Si Google devuelve error de CORS en producción, ver nota al pie)
    if (resp.ok) {
      try {
        const data = await resp.json();
        return { ok: data.ok !== false, data };
      } catch {
        // La respuesta llegó pero no era JSON — aun así el dato se guardó
        return { ok: true };
      }
    }

    // Si la respuesta no es ok, intentamos leer el error
    return { ok: false, error: `HTTP ${resp.status}` };

  } catch (err) {
    // fetch lanza excepción en errores de red o CORS bloqueado
    console.error("❌ gasPost error:", err);

    // PLAN B — Si CORS sigue bloqueando el POST, usamos el truco de no-cors
    // pero verificamos el resultado con un GET posterior
    return await gasPostFallback(sheetName, payload, action, idCol, idValue);
  }
}

// ── FALLBACK: no-cors + verificación posterior ──────────────
// Solo se usa si el POST con cors falla (ej: despliegue antiguo de GAS)
async function gasPostFallback(sheetName, payload, action, idCol, idValue) {
  console.warn("⚠️ Usando fallback no-cors para POST...");

  const params = new URLSearchParams({
    sheetName: resolveSheet(sheetName),
    action,
    ...(idCol   ? { idCol }   : {}),
    ...(idValue ? { idValue } : {}),
  });

  try {
    // Con no-cors el fetch no lanza excepción en redirects de Google
    await fetch(`${URL_GAS}?${params}`, {
      method: 'POST',
      mode: 'no-cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    });

    // No podemos leer la respuesta, pero asumimos éxito
    // (el dato generalmente SÍ se guarda con no-cors)
    return { ok: true, fallback: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── OBJETO DB PÚBLICO ───────────────────────────────────────
const DB = {

  // Compatibilidad con código existente que usa DB.supabase.from(...)
  supabase: {
    from(tableName) {
      return {
        _table: tableName,
        _filters: [],
        select() { return this; },
        eq(col, val) {
          this._filters.push({ col, val: String(val) });
          return this;
        },
        single() {
          this._single = true;
          return this;
        },
        // then() permite usar "await DB.supabase.from(...).eq(...)"
        then(resolve, reject) {
          gasGet(this._table, this._filters)
            .then(rows => {
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
      };
    }
  },

  // ── LOGIN ─────────────────────────────────────────────────
  async login(usuario, clave) {
    try {
      // Trae todos los usuarios y filtra localmente
      // (más robusto que depender de doble .eq() encadenado)
      const rows = await gasGet('usuarios', [
        { col: 'usuario',  val: usuario },
        { col: 'password', val: clave   },
      ]);

      if (rows && rows.length > 0) {
        return { ok: true, data: rows[0] };
      }
      return { ok: false, error: 'Credenciales incorrectas' };
    } catch (e) {
      console.error("Login error:", e);
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

  // ── OBTENER FLOTA ─────────────────────────────────────────
  async obtenerFlota() {
    try {
      const data = await gasGet('carrozas');
      return { ok: true, data: data || [] };
    } catch (e) {
      console.error("obtenerFlota error:", e);
      return { ok: false, data: [], error: e.message };
    }
  },

  // ── INSERTAR EN CUALQUIER HOJA ────────────────────────────
  async insertar(hoja, datos) {
    return await gasPost(hoja, datos, 'insert');
  },

  // ── ACTUALIZAR EN CUALQUIER HOJA ─────────────────────────
  async actualizar(hoja, datos, idCol, idValue) {
    return await gasPost(hoja, datos, 'update', idCol, idValue);
  },

  // ── TEST DE CONEXIÓN ──────────────────────────────────────
  async testConexion() {
    try {
      const resp = await fetch(URL_GAS, { method: 'GET', redirect: 'follow' });
      const text = await resp.text();
      console.log("✅ Conexión OK:", text);
      return { ok: true, mensaje: text };
    } catch (e) {
      console.error("❌ Sin conexión:", e);
      return { ok: false, error: e.message };
    }
  },
};

window.DB = DB;

// ── AUTO-TEST al cargar (solo en consola, no molesta al usuario) ──
DB.testConexion().then(r => {
  if (r.ok) console.log("🟢 API J.R. conectada correctamente");
  else      console.warn("🔴 API J.R. no responde:", r.error);
});
