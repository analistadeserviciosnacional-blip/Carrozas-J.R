// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRndmdjaGprZHZuamZ4cWRrbWR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTI1MjksImV4cCI6MjA5MDQ2ODUyOX0.HAOgrHOmMhRb4m6WFrqBuXnYQgXjxedDzxF0i84_SnQ'; 

const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    supabase: _supabase,

    // ── 1. SESIÓN (LOGIN RESISTENTE A ERRORES) ───────────
    async login(usuario, clave) {
        try {
            console.log("Iniciando sesión para:", usuario);
            
            // Buscamos solo por usuario para evitar problemas de codificación con la 'ñ'
            const { data, error } = await _supabase
                .from('usuarios')
                .select('*')
                .eq('usuario', usuario.trim())
                .maybeSingle();

            if (error) {
                console.error("Error 400 - Verifica nombres de columnas:", error.message);
                return { data: null, ok: false, error: "Error de comunicación con el servidor" };
            }

            if (!data) {
                return { data: null, ok: false, error: "El usuario no existe" };
            }

            // Comparamos la clave aquí para evitar errores de caracteres especiales
            // Probamos con 'contraseña' y con 'password' por si acaso
            const claveEnDB = data.contraseña || data.password;

            if (claveEnDB == clave.trim()) {
                console.log("Acceso concedido para:", data.nombre);
                return { data, ok: true };
            } else {
                return { data: null, ok: false, error: "La clave es incorrecta" };
            }
        } catch (err) {
            return { data: null, ok: false, error: "Error inesperado en el sistema" };
        }
    },

    // ── 2. SOLICITUD DE APOYO (CORRECCIÓN ERROR 404) ─────
    async obtenerSolicitudesApoyo() {
        try {
            const { data, error } = await _supabase
                .from('solicitud_apoyo') 
                .select('*')
                .order('id', { ascending: false });
            
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            console.error("Error en tabla solicitud_apoyo:", err.message);
            return { data: [], ok: false };
        }
    },

    // ── 3. TRASLADOS ─────────────────────────────────────
    async guardarTraslado(datos) {
        try {
            const { error } = await _supabase.from('Traslado').insert([datos]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    },

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

    async obtenerTodosLosTraslados() {
        try {
            const { data, error } = await _supabase
                .from('Traslado')
                .select('*')
                .order('id_salida', { ascending: false });
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    },

    // ── 4. AVERÍAS ───────────────────────────────────────
    async guardarAveria(datos) {
        try {
            const { error } = await _supabase.from('Averias').insert([datos]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    },

    async obtenerTodasLasAverias() {
        try {
            const { data, error } = await _supabase
                .from('Averias')
                .select('*')
                .order('created_at', { ascending: false });
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    },

    // ── 5. FLOTA ─────────────────────────────────────────
    async obtenerEstadoFlota() {
        try {
            const { data, error } = await _supabase
                .from('carrozas')
                .select('*')
                .order('placa', { ascending: true });
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    }
};

window.DB = DB;
