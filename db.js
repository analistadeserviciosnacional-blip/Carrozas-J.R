/**
 * ══════════════════════════════════════════════════════════
 *  CONECTOR J.R. CARROZAS — Google Apps Script Backend
 *  Emula la interfaz de Supabase para compatibilidad total
 *  con todos los archivos HTML del proyecto.
 * ══════════════════════════════════════════════════════════
 */

const URL_GAS = "https://script.google.com/macros/s/AKfycbzQXp_jVV84vyyPXDAKscC8NTdsCSDUjmaqbDcblFowhcJNYrLqH27GVpaVPPQHXzupCw/exec";

// ── MAPEO: nombre lógico → nombre real de pestaña en Sheets ─
// Ajusta si tus hojas tienen nombres distintos.
const SHEET_MAP = {
    // ── nombre usado en los HTML  →  pestaña real en Sheets ──
    'carrozas':             'carrozas_rows',
    'Traslado':             'Traslado_rows',
    'Averias':              'Averias_rows',
    'usuarios':             'usuarios_rows',
    'mantenimientos':       'mantenimientos_rows',
    'solicitud_apoyo':      'solicitud_apoyo_rows',
    'notificaciones_apoyo': 'notificaciones_apoyo_rows',
    'Llegadas':             'Llegadas_rows'
    // Si agregas más hojas en Sheets, ponlas aquí.
};
function resolveSheet(name) { return SHEET_MAP[name] || name; }

// ── CONSTRUCTOR DE QUERIES (emula interfaz Supabase) ─────
// DB.supabase.from('tabla').select().eq().order().limit() etc.
// ────────────────────────────────────────────────────────

class GASQueryBuilder {
    constructor(tableName) {
        this._table    = resolveSheet(tableName);
        this._filters  = [];   // [{ type, col, val }]
        this._ilikeF   = [];   // [{ col, pattern }]
        this._orFilter = null;
        this._orderCol = null;
        this._orderAsc = true;
        this._limitN   = null;
        this._selectF  = '*';
        this._single   = false;
        this._isUpdate = false;
        this._isInsert = false;
        this._isDelete = false;
        this._payload  = null;
    }

    // ── LECTURA ──────────────────────────────────────────
    select(cols) { this._selectF = cols || '*'; return this; }
    eq(col, val) { this._filters.push({ type: 'eq', col, val: String(val) }); return this; }
    ilike(col, pattern) { this._ilikeF.push({ col, pattern }); return this; }
    or(rawExpr)  { this._orFilter = rawExpr; return this; }
    order(col, opts) { this._orderCol = col; this._orderAsc = !(opts && opts.ascending === false); return this; }
    limit(n)     { this._limitN = n; return this; }
    single()     { this._single = true; return this; }

    // ── ESCRITURA ────────────────────────────────────────
    update(data) {
        this._isUpdate = true;
        this._payload  = data;
        return this;
    }
    insert(rows) {
        this._isInsert = true;
        this._payload  = Array.isArray(rows) ? rows[0] : rows;
        return this;
    }
    delete() {
        this._isDelete = true;
        return this;
    }

    // ── EJECUCIÓN ────────────────────────────────────────
    then(resolve, reject) {
        return this._execute().then(resolve, reject);
    }

    async _execute() {
        try {
            if (this._isDelete)          return await this._execDelete();
            if (this._isInsert)          return await this._execInsert();
            if (this._isUpdate)          return await this._execUpdate();
            return await this._execSelect();
        } catch (err) {
            console.error('[GAS]', this._table, err);
            return { data: null, error: { message: err.message || String(err) } };
        }
    }

    // ── SELECT ───────────────────────────────────────────
    async _execSelect() {
        const url = `${URL_GAS}?sheetName=${encodeURIComponent(this._table)}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        let rows = await resp.json();
        if (!Array.isArray(rows)) rows = [];

        // eq filters
        for (const f of this._filters) {
            rows = rows.filter(r => String(r[f.col] ?? '').trim() === f.val.trim());
        }

        // ilike filters (SQL LIKE case-insensitive, % wildcard)
        for (const f of this._ilikeF) {
            const pat = f.pattern.toLowerCase().replace(/%/g, '');
            rows = rows.filter(r => String(r[f.col] ?? '').toLowerCase().includes(pat));
        }

        // or filter — supports: "alcance.eq.nacional,regional_solicitante.eq.VALUE"
        if (this._orFilter) {
            const parts = this._orFilter.split(',').map(p => p.trim());
            rows = rows.filter(r => parts.some(p => {
                const m = p.match(/^(\w+)\.eq\.(.+)$/);
                if (m) return String(r[m[1]] ?? '') === m[2];
                return false;
            }));
        }

        // order
        if (this._orderCol) {
            const col = this._orderCol;
            const asc = this._orderAsc;
            rows.sort((a, b) => {
                const va = a[col] ?? '';
                const vb = b[col] ?? '';
                const na = parseFloat(va);
                const nb = parseFloat(vb);
                if (!isNaN(na) && !isNaN(nb)) return asc ? na - nb : nb - na;
                return asc
                    ? String(va).localeCompare(String(vb))
                    : String(vb).localeCompare(String(va));
            });
        }

        // limit
        if (this._limitN) rows = rows.slice(0, this._limitN);

        // single
        if (this._single) {
            return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'No rows' } };
        }

        return { data: rows, error: null };
    }

    // ── INSERT ───────────────────────────────────────────
    async _execInsert() {
        const payload = { ...this._payload };

        // Auto-generar id si no existe (para tablas que lo necesitan)
        if (!payload.id) payload.id = 'JR-' + Date.now() + '-' + Math.random().toString(36).slice(2,6);
        if (!payload.created_at) payload.created_at = new Date().toISOString();

        await fetch(`${URL_GAS}?sheetName=${encodeURIComponent(this._table)}`, {
            method: 'POST',
            mode:   'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body:   JSON.stringify(payload)
        });
        // no-cors → no podemos leer la respuesta; asumimos éxito
        return { data: payload, error: null };
    }

    // ── UPDATE ───────────────────────────────────────────
    async _execUpdate() {
        if (this._filters.length === 0) {
            throw new Error('UPDATE sin filtro eq() es peligroso — operación cancelada');
        }

        // GAS necesita saber qué columna / valor identifican la fila
        const idFilter = this._filters[0];   // primer .eq() = identificador
        const updatePayload = {
            ...this._payload,
            _action:  'update',
            _idCol:   idFilter.col,
            _idValue: idFilter.val
        };

        await fetch(`${URL_GAS}?sheetName=${encodeURIComponent(this._table)}&action=update&idCol=${encodeURIComponent(idFilter.col)}&idValue=${encodeURIComponent(idFilter.val)}`, {
            method: 'POST',
            mode:   'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body:   JSON.stringify(updatePayload)
        });
        return { data: this._payload, error: null };
    }

    // ── DELETE ───────────────────────────────────────────
    async _execDelete() {
        if (this._filters.length === 0) {
            throw new Error('DELETE sin filtro eq() es peligroso — operación cancelada');
        }
        const idFilter = this._filters[0];
        const deletePayload = {
            _action:  'delete',
            _idCol:   idFilter.col,
            _idValue: idFilter.val
        };

        await fetch(`${URL_GAS}?sheetName=${encodeURIComponent(this._table)}&action=delete&idCol=${encodeURIComponent(idFilter.col)}&idValue=${encodeURIComponent(idFilter.val)}`, {
            method: 'POST',
            mode:   'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body:   JSON.stringify(deletePayload)
        });
        return { data: null, error: null };
    }
}

// ── CLIENTE SUPABASE STUB ────────────────────────────────
// Implementa channel().on().subscribe() como no-op
// (Realtime no aplica con GAS; los paneles lo usan pero no es crítico)

class GASSupabaseClient {
    from(tableName) {
        return new GASQueryBuilder(tableName);
    }

    // Realtime stub — sin funcionalidad real con GAS, pero no rompe el código
    channel(name) {
        return {
            on: (_ev, _opts, _cb) => ({ subscribe: () => {} }),
        };
    }
}

// ── OBJETO DB GLOBAL ─────────────────────────────────────

const DB = {

    // Exponemos el cliente compatible con Supabase
    supabase: new GASSupabaseClient(),

    // ── INTERNOS ─────────────────────────────────────────
    async _fetchRows(sheetName) {
        const sheet = resolveSheet(sheetName);
        const resp = await fetch(`${URL_GAS}?sheetName=${encodeURIComponent(sheet)}`);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        return Array.isArray(data) ? data : [];
    },

    async _post(sheetName, payload, action, idCol, idValue) {
        const sheet = resolveSheet(sheetName);
        const params = new URLSearchParams({ sheetName: sheet });
        if (action)  params.set('action',  action);
        if (idCol)   params.set('idCol',   idCol);
        if (idValue) params.set('idValue', idValue);

        await fetch(`${URL_GAS}?${params}`, {
            method: 'POST',
            mode:   'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body:   JSON.stringify(payload)
        });
        return { ok: true };
    },

    // ── 1. SESIÓN ─────────────────────────────────────────
    async login(usuario, clave) {
        try {
            const users = await this._fetchRows('usuarios_rows');
            if (!users.length) return { data: null, ok: false, error: 'Sin usuarios' };

            const user = users.find(u =>
                String(u.usuario   || '').trim().toLowerCase() === String(usuario || '').trim().toLowerCase() &&
                String(u.password  || '').trim()               === String(clave   || '').trim()
            );

            if (user) {
                return {
                    ok: true,
                    data: {
                        ...user,
                        nombre: user.nombre || user.usuario,
                        rol:    (user.rol || 'conductor').toLowerCase().trim()
                    }
                };
            }
            return { data: null, ok: false, error: 'Credenciales incorrectas' };
        } catch (e) {
            return { data: null, ok: false, error: e.message };
        }
    },

    async registrarUsuario(datos) {
        return await this._post('usuarios_rows', {
            ...datos,
            created_at: new Date().toISOString()
        });
    },

    // ── 2. FLOTA ──────────────────────────────────────────
    async obtenerFlota() {
        try {
            const data = await this._fetchRows('carrozas_rows');
            return { data: data || [], ok: true };
        } catch (e) {
            return { data: [], ok: false, error: e.message };
        }
    },

    // ── 3. TRASLADOS ──────────────────────────────────────
    async guardarTraslado(datos) {
        const payload = {
            id_salida:               'JR-' + Date.now(),
            fecha:                   new Date().toLocaleDateString('es-CO'),
            regional:                datos.regional         || '',
            conductor:               datos.conductor        || '',
            nnum_telefono:           datos.telefono         || '',
            placa:                   datos.placa            || '',
            motivo_de_salida:        datos.motivo           || '',
            nombre_del_fallecido:    datos.fallecido        || '',
            clinica_hospital_o_rsd:  datos.clinica          || '',
            numero_prestacion:       datos.prestacion       || '',
            origen:                  datos.origen           || '',
            destino:                 datos.destino          || '',
            hora_de_salida:          datos.hora_salida      || '',
            hora_de_ingreso:         datos.hora_ingreso     || '',
            km__salida:              datos.km_salida        || '',
            km__ingreso:             datos.km_ingreso       || '',
            total_km:                datos.total_km         || '',
            coordinador_en_turno:    datos.coordinador      || '',
            observaciones:           datos.observaciones    || '',
            imagen1:                 datos.imagen1          || '',
            firma:                   datos.firma            || ''
        };
        return await this._post('Traslado_rows', payload);
    },

    async obtenerTrasladosRecientes() {
        try {
            const data = await this._fetchRows('Traslado_rows');
            return { data: [...data].reverse().slice(0, 50), ok: true };
        } catch (e) {
            return { data: [], ok: false };
        }
    },

    async obtenerMisSalidas(nombreConductor) {
        try {
            const data = await this._fetchRows('Traslado_rows');
            const nombre = (nombreConductor || '').toLowerCase();
            const filtrados = data.filter(d =>
                String(d.conductor || '').toLowerCase().includes(nombre)
            );
            return { data: filtrados.reverse().slice(0, 10), ok: true };
        } catch (e) {
            return { data: [], ok: false };
        }
    },

    // ── 4. LLEGADAS ───────────────────────────────────────
    async guardarLlegada(datos) {
        const payload = {
            id_llegada:      'LG-' + Date.now(),
            fecha:           new Date().toLocaleDateString('es-CO'),
            placa:           datos.placa            || '',
            km_ingreso:      datos.km_ingreso       || '',
            hora_ingreso:    datos.hora_ingreso     || '',
            estado_entrega:  datos.estado_entrega   || '',
            observaciones:   datos.observaciones    || '',
            conductor:       datos.conductor        || '',
            regional:        datos.regional         || '',
            created_at:      new Date().toISOString()
        };
        return await this._post('Llegadas_rows', payload);
    },

    // ── 5. AVERÍAS ────────────────────────────────────────
    async guardarAveria(datos) {
        return await this._post('Averias_rows', {
            ...datos,
            created_at: new Date().toISOString()
        });
    },

    async obtenerTodasAverias() {
        try {
            const data = await this._fetchRows('Averias_rows');
            return { data: [...data].reverse(), ok: true };
        } catch (e) {
            return { data: [], ok: false };
        }
    }
};

window.DB = DB;
