// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
// Clave 'anon public' extraída de tu panel de configuración
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRndmdjaGprZHZuamZ4cWRrbWR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTI1MjksImV4cCI6MjA5MDQ2ODUyOX0.HAOgrHOmMhRb4m6WFrqBuXnYQgXjxedDzxF0i84_SnQ'; 

const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    supabase: _supabase,

    // ── 1. SESIÓN (LOGIN RESISTENTE) ─────────────────────
    async login(usuario, clave) {
        try {
            // Buscamos solo por el nombre de usuario para evitar el error 400 con la 'ñ'
            const { data, error } = await _supabase
                .from('usuarios')
                .select('*')
                .eq('usuario', usuario.trim())
                .maybeSingle();

            if (error) {
                console.error("Error en base de datos:", error.message);
                return { data: null, ok: false, error: "Error de conexión (400)" };
            }

            if (!data) {
                return { data: null, ok: false, error: "Usuario no encontrado" };
            }

            // Verificamos la contraseña internamente
            if (data.contraseña === clave.trim()) {
                return { data, ok: true };
            } else {
                return { data: null, ok: false, error: "Contraseña incorrecta" };
            }
        } catch (err) {
            return { data: null, ok: false, error: "Error inesperado" };
        }
    },

    // ── 2. SOLICITUD DE APOYO (CORRECCIÓN ERROR 404) ─────
    async obtenerSolicitudesApoyo() {
        try {
            // Se usa 'solicitud_apoyo' en singular según tu base de datos
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

    // ── 4. AVERÍAS ───────────────────────────────────────
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
