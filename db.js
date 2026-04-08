// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
// ✅ CLAVE CORREGIDA: Usando la clave Anon Public (Legacy) de tus ajustes
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRndmdjaGprZHZuamZ4cWRrbWR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTI1MjksImV4cCI6MjA5MDQ2ODUyOX0.HAOgrHOmMhRb4m6WFrqBuXnYQgXjxedDzxF0i84_SnQ'; 

const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    supabase: _supabase,

    // ── 1. SESIÓN (LOGIN RESISTENTE) ─────────────────────
    async login(usuario, clave) {
        try {
            // Buscamos solo por el nombre de usuario para evitar conflictos con la 'ñ' en la URL
            const { data, error } = await _supabase
                .from('usuarios')
                .select('*')
                .eq('usuario', usuario.trim())
                .maybeSingle();

            if (error) {
                console.error("Error de base de datos:", error.message);
                return { data: null, ok: false, error: "Error de conexión (400)" };
            }

            if (!data) {
                return { data: null, ok: false, error: "Usuario no encontrado" };
            }

            // Verificamos la contraseña internamente comparando los datos obtenidos
            // En tu tabla la columna se llama 'contraseña'
            if (data.contraseña === clave.trim()) {
                return { data, ok: true };
            } else {
                return { data: null, ok: false, error: "Contraseña incorrecta" };
            }
        } catch (err) {
            return { data: null, ok: false, error: "Error inesperado" };
        }
    },

    // ── 2. PANEL COORDINADOR: SOLICITUDES (ERROR 404 FIJADO) ──
    async obtenerSolicitudesApoyo() {
        try {
            // CORRECCIÓN: 'solicitud_apoyo' en singular según tu Editor de Tablas
            const { data, error } = await _supabase
                .from('solicitud_apoyo') 
                .select('*')
                .order('id', { ascending: false });
            
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            console.error("Error 404 - Tabla no encontrada:", err.message);
            return { data: [], ok: false };
        }
    },

    // ── 3. PANEL COORDINADOR: VISIÓN GLOBAL ──────────────
    async obtenerTodosLosTraslados() {
        try {
            const { data, error } = await _supabase
                .from('Traslado')
                .select('*')
                .order('id_salida', { ascending: false });
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    },

    async obtenerTodasLasAverias() {
        try {
            const { data, error } = await _supabase
                .from('Averias')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    },

    // ── 4. FUNCIONES PARA CONDUCTORES ─────────────────────
    async obtenerMisSalidas(nombreConductor) {
        try {
            const { data, error } = await _supabase
                .from('Traslado')
                .select('*')
                .ilike('conductor', `%${nombreConductor}%`)
                .order('id_salida', { ascending: false })
                .limit(10);
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    },

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
                origen: datos.origen || '',
                destino: datos.destino || '',
                hora_de_salida: datos.hora_salida || '',
                hora_de_ingreso: datos.hora_ingreso || '',
                km__salida: datos.km_salida || '',
                km__ingreso: datos.km_ingreso || '',
                total_km: datos.total_km || '',
                coordinador_en_turno: datos.coordinador || '',
                observaciones: datos.observaciones || '',
                firma: datos.firma || '',
                imagen1: datos.imagen1 || '',
                imagen2: datos.imagen2 || '',
                imagen3: datos.imagen3 || '',
                imagen4: datos.imagen4 || '',
                clinica_hospital_o_rsd: datos.clinica || '',
                numero_prestacion: datos.prestacion || ''
            };
            const { error } = await _supabase.from('Traslado').insert([payload]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    },

    // ── 5. ESTADO DE LA FLOTA ────────────────────────────
    async obtenerEstadoFlota() {
        try {
            const { data, error } = await _supabase
                .from('carrozas')
                .select('*')
                .order('placa', { ascending: true });
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    }
};

window.DB = DB;
