/**
 * CONECTOR J.R. CARROZAS — JavaScript Frontend
 */
const URL_GAS = "https://script.google.com/macros/s/AKfycbyuaHWUG03pkZfzTTYKvJXfbvXrELrfsFt5f2QzxY4adXfJ6fdNoh9dZpQtpE8FHcekOA/exec";

const SHEET_MAP = {
    'carrozas': 'carrozas_rows',
    'Traslado': 'Traslado_rows',
    'Averias': 'Averias_rows',
    'usuarios': 'usuarios_rows',
    'Llegadas': 'Llegadas_rows'
};

function resolveSheet(name) { return SHEET_MAP[name] || name; }

class GASQueryBuilder {
    constructor(tableName) {
        this._table = resolveSheet(tableName);
        this._filters = [];
        this._single = false;
    }

    select() { return this; }
    eq(col, val) { this._filters.push({ col, val: String(val) }); return this; }
    single() { this._single = true; return this; }

    async then(resolve, reject) {
        try {
            const url = `${URL_GAS}?sheetName=${encodeURIComponent(this._table)}`;
            const resp = await fetch(url, { method: 'GET', redirect: 'follow' });
            let rows = await resp.json();

            // Aplicar filtros manuales (para Login, etc)
            for (const f of this._filters) {
                rows = rows.filter(r => String(r[f.col] || '').trim().toLowerCase() === f.val.toLowerCase());
            }

            const result = this._single ? { data: rows[0] || null, error: null } : { data: rows, error: null };
            resolve(result);
        } catch (err) {
            reject({ data: null, error: err });
        }
    }
}

const DB = {
    supabase: { from: (table) => new GASQueryBuilder(table) },

    async _post(sheetName, payload, action = "insert", idCol = "", idValue = "") {
        const url = `${URL_GAS}?sheetName=${resolveSheet(sheetName)}&action=${action}&idCol=${idCol}&idValue=${idValue}`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                mode: 'no-cors', // Google Apps Script requiere no-cors para envíos simples sin preflight complejo
                body: JSON.stringify(payload)
            });
            return { ok: true }; 
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },

    async login(usuario, clave) {
        const { data, error } = await this.supabase.from('usuarios').eq('usuario', usuario).eq('password', clave);
        if (data && data.length > 0) {
            return { ok: true, data: data[0] };
        }
        return { ok: false, error: 'Credenciales inválidas' };
    },

    async registrarUsuario(datos) {
        return await this._post('usuarios', datos);
    },

    async obtenerFlota() {
        const { data } = await this.supabase.from('carrozas');
        return { data: data || [], ok: true };
    }
};

window.DB = DB;
