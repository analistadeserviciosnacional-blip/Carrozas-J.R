/**
 * ══════════════════════════════════════════════════════════
 *  CONECTOR J.R. CARROZAS — db.js
 * ══════════════════════════════════════════════════════════
 */

// REEMPLAZA ESTA URL con la que obtengas al implementar (Nueva Versión)
const URL_GAS = "https://script.google.com/macros/s/AKfycbzn7Tedk4Z1oSJdsr0Ww1r83xP4oKEXXlhz7Z4oai25OjsTg2hVaZHcUXPRLgDKU_HzaA/exec";

const SHEET_MAP = {
    'carrozas':             'carrozas_rows',
    'Traslado':             'Traslado_rows',
    'Averias':              'Averias_rows',
    'usuarios':             'usuarios_rows',
    'Llegadas':             'Llegadas_rows'
};

function resolveSheet(name) { return SHEET_MAP[name] || name; }

class GASQueryBuilder {
    constructor(tableName) {
        this._table    = resolveSheet(tableName);
        this._filters  = [];
        this._single   = false;
    }

    select() { return this; }
    eq(col, val) { this._filters.push({ col, val: String(val) }); return this; }
    single() { this._single = true; return this; }

    async then(resolve, reject) {
        try {
            const url = `${URL_GAS}?sheetName=${encodeURIComponent(this._table)}`;
            // 'redirect: follow' es CLAVE para evitar el error de CORS en Google
            const resp = await fetch(url, { method: 'GET', redirect: 'follow' });
            if (!resp.ok) throw new Error("Error en servidor");
            
            let rows = await resp.json();

            // Filtrado manual (Emulación Supabase)
            for (const f of this._filters) {
                rows = rows.filter(r => String(r[f.col] || '').trim() === f.val.trim());
            }

            if (this._single) {
                resolve({ data: rows[0] || null, error: rows.length ? null : { message: 'No rows' } });
            } else {
                resolve({ data: rows, error: null });
            }
        } catch (err) {
            console.error("Error DB:", err);
            resolve({ data: null, error: err });
        }
    }
}

const DB = {
    supabase: {
        from: (tableName) => new GASQueryBuilder(tableName)
    },

    async _post(sheetName, payload, action = "insert", idCol = "", idValue = "") {
        const url = `${URL_GAS}?sheetName=${encodeURIComponent(resolveSheet(sheetName))}&action=${action}&idCol=${idCol}&idValue=${idValue}`;
        try {
            // El modo 'no-cors' permite enviar datos sin que Google bloquee el pre-vuelo
            await fetch(url, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify(payload)
            });
            return { ok: true };
        } catch (e) {
            console.error("Error Post:", e);
            return { ok: false, error: e.message };
        }
    },

    async login(usuario, clave) {
        const { data, error } = await this.supabase.from('usuarios').eq('usuario', usuario).eq('password', clave);
        if (data && data.length > 0) {
            return { ok: true, data: data[0] };
        }
        return { ok: false, error: 'Usuario o contraseña incorrectos' };
    },

    async registrarUsuario(datos) {
        return await this._post('usuarios', {
            ...datos,
            created_at: new Date().toISOString()
        });
    },

    async obtenerFlota() {
        const { data, error } = await this.supabase.from('carrozas');
        return { data: data || [], ok: !error };
    }
};

window.DB = DB;
