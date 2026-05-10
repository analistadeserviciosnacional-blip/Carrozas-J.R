/**
 * CONECTOR DE BASE DE DATOS - GOOGLE SHEETS
 * Proyecto: Carrozas J.R
 */

const URL_GAS = "https://script.google.com/macros/s/AKfycbzQXp_jVV84vyyPXDAKscC8NTdsCSDUjmaqbDcblFowhcJNYrLqH27GVpaVPPQHXzupCw/exec";

const DB = {
    // Función interna para peticiones GET
    async fetchRows(sheetName) {
        try {
            const response = await fetch(`${URL_GAS}?sheetName=${sheetName}`);
            return await response.json();
        } catch (e) {
            console.error("Error en fetchRows:", e);
            return [];
        }
    },

    // ── 1. SESIÓN Y REGISTRO ────────────────────────────
    async login(usuario, clave) {
        try {
            const users = await this.fetchRows('usuarios_rows');
            
            // Convertimos todo a String antes de comparar para evitar el error de .toLowerCase()
            const user = users.find(u => 
                String(u.usuario || "").toLowerCase() === String(usuario || "").toLowerCase() && 
                String(u.password || "") === String(clave || "")
            );

            if (user) {
                return { data: user, ok: true };
            } else {
                return { data: null, ok: false, error: "Usuario o contraseña incorrectos" };
            }
        } catch (err) {
            return { data: null, ok: false, error: "Error de conexión con el servidor" };
        }
    },

    async registrarUsuario(datos) {
        try {
            await fetch(`${URL_GAS}?sheetName=usuarios_rows`, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify(datos)
            });
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    },

    // ── 2. FLOTA ────────────────────────────────────────
    async obtenerFlota() {
        const data = await this.fetchRows('carrozas_rows');
        return { data: data || [], ok: true };
    },

    // ── 3. TRASLADOS ─────────────────────────────────────
    async guardarTraslado(datos) {
        try {
            const payload = {
                id_salida:            'JR-' + Date.now(),
                fecha:                new Date().toLocaleDateString('es-CO'),
                regional:             datos.regional      || '',
                conductor:            datos.conductor     || '',
                nnum_telefono:        datos.telefono      || '',
                placa:                datos.placa         || '',
                motivo_de_salida:     datos.motivo        || '',
                nombre_del_fallecido: datos.fallecido     || '',
                clinica_hospital_o_rsd: datos.clinica     || '',
                numero_prestacion:    datos.prestacion    || '',
                origen:               datos.origen        || '',
                destino:              datos.destino       || '',
                hora_de_salida:       datos.hora_salida   || '',
                hora_de_ingreso:      datos.hora_ingreso  || '',
                km_salida:            datos.km_salida     || '',
                km_ingreso:           datos.km_ingreso    || '',
                total_km:             datos.total_km      || '',
                coordinador_en_turno: datos.coordinador   || '',
                observaciones:        datos.observaciones || '',
                imagen1:              datos.imagen1       || '',
                firma:                datos.firma         || ''
            };

            await fetch(`${URL_GAS}?sheetName=Traslado_rows`, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify(payload)
            });
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    },

    async obtenerTrasladosRecientes() {
        const data = await this.fetchRows('Traslado_rows');
        return { data: data.reverse().slice(0, 50), ok: true };
    },

    async obtenerMisSalidas(nombreConductor) {
        const data = await this.fetchRows('Traslado_rows');
        const filtrados = data.filter(d => 
            String(d.conductor || "").toLowerCase().includes(String(nombreConductor).toLowerCase())
        );
        return { data: filtrados.reverse().slice(0, 10), ok: true };
    },

    // ── 4. AVERÍAS ───────────────────────────────────────
    async guardarAveria(datos) {
        try {
            await fetch(`${URL_GAS}?sheetName=Averias_rows`, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify(datos)
            });
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    },

    async obtenerTodasAverias() {
        const data = await this.fetchRows('Averias_rows');
        return { data: data.reverse(), ok: true };
    }
};

window.DB = DB;
