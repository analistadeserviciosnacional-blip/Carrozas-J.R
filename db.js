/**
 * CONECTOR DE BASE DE DATOS - GOOGLE SHEETS
 * Proyecto: Carrozas J.R (Versión Final Corregida)
 */

const URL_GAS = "https://script.google.com/macros/s/AKfycbzQXp_jVV84vyyPXDAKscC8NTdsCSDUjmaqbDcblFowhcJNYrLqH27GVpaVPPQHXzupCw/exec";

const DB = {
    // Función interna para peticiones GET (Lectura)
    async fetchRows(sheetName) {
        try {
            const response = await fetch(`${URL_GAS}?sheetName=${sheetName}`);
            if (!response.ok) throw new Error("Error en respuesta de red");
            const data = await response.json();
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.error("Error en fetchRows (" + sheetName + "):", e);
            return [];
        }
    },

    // ── 1. SESIÓN Y REGISTRO ────────────────────────────
    async login(usuario, clave) {
        try {
            // Obtenemos los usuarios del Excel
            const users = await this.fetchRows('usuarios_rows');
            
            if (users.length === 0) {
                return { data: null, ok: false, error: "No se pudo cargar la base de usuarios" };
            }

            // Buscamos el usuario ignorando mayúsculas/minúsculas y quitando espacios
            const user = users.find(u => 
                String(u.usuario || "").trim().toLowerCase() === String(usuario || "").trim().toLowerCase() && 
                String(u.password || "").trim() === String(clave || "").trim()
            );

            if (user) {
                // Aseguramos que el objeto tenga las propiedades mínimas que espera el Dashboard
                const userData = {
                    ...user,
                    nombre: user.nombre || user.usuario,
                    rol: (user.rol || "conductor").toLowerCase().trim()
                };
                return { data: userData, ok: true };
            } else {
                return { data: null, ok: false, error: "Usuario o contraseña incorrectos" };
            }
        } catch (err) {
            console.error("Error en Login:", err);
            return { data: null, ok: false, error: "Error de conexión con el servidor" };
        }
    },

    async registrarUsuario(datos) {
        try {
            await fetch(`${URL_GAS}?sheetName=usuarios_rows`, {
                method: 'POST',
                mode: 'no-cors', // Google Apps Script requiere no-cors
                cache: 'no-cache',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datos)
            });
            // Con no-cors no podemos leer la respuesta, pero si no hay catch, asumimos éxito
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    },

    // ── 2. FLOTA ────────────────────────────────────────
    async obtenerFlota() {
        try {
            const data = await this.fetchRows('carrozas_rows');
            return { data: data || [], ok: true };
        } catch (e) {
            return { data: [], ok: false };
        }
    },

    // ── 3. TRASLADOS (Salidas) ───────────────────────────
    async guardarTraslado(datos) {
        try {
            const payload = {
                id_salida: 'JR-' + Date.now(),
                fecha: new Date().toLocaleDateString('es-CO'),
                regional: datos.regional || '',
                conductor: datos.conductor || '',
                nnum_telefono: datos.telefono || '',
                placa: datos.placa || '',
                motivo_de_salida: datos.motivo || '',
                nombre_del_fallecido: datos.fallecido || '',
                clinica_hospital_o_rsd: datos.clinica || '',
                numero_prestacion: datos.prestacion || '',
                origen: datos.origen || '',
                destino: datos.destino || '',
                hora_de_salida: datos.hora_salida || '',
                hora_de_ingreso: datos.hora_ingreso || '',
                km_salida: datos.km_salida || '',
                km_ingreso: datos.km_ingreso || '',
                total_km: datos.total_km || '',
                coordinador_en_turno: datos.coordinador || '',
                observaciones: datos.observaciones || '',
                imagen1: datos.imagen1 || '', // Base64 de la imagen
                firma: datos.firma || ''      // Base64 de la firma
            };

            await fetch(`${URL_GAS}?sheetName=Traslado_rows`, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify(payload)
            });
            return { ok: true };
        } catch (err) {
            console.error("Error guardando traslado:", err);
            return { ok: false, error: err.message };
        }
    },

    async obtenerTrasladosRecientes() {
        const data = await this.fetchRows('Traslado_rows');
        // Invertimos el array para ver lo más reciente primero y limitamos a 50
        const sorted = [...data].reverse();
        return { data: sorted.slice(0, 50), ok: true };
    },

    async obtenerMisSalidas(nombreConductor) {
        try {
            const data = await this.fetchRows('Traslado_rows');
            const filtrados = data.filter(d => 
                String(d.conductor || "").toLowerCase().includes(String(nombreConductor || "").toLowerCase())
            );
            return { data: filtrados.reverse().slice(0, 10), ok: true };
        } catch (e) {
            return { data: [], ok: false };
        }
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
        return { data: [...data].reverse(), ok: true };
    }
};

// Exportamos para uso global en la App
window.DB = DB;
