// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';

// Inicialización global
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    supabase: _supabase,

    // ── 1. SESIÓN Y REGISTRO ────────────────────────────
    async login(usuario, clave) {
        try {
            const { data, error } = await _supabase
                .from('usuarios')
                .select('*')
                .eq('usuario', usuario)
                .eq('password', clave)
                .single();
            if (error) throw error;
            return { data, ok: true };
        } catch (err) {
            return { data: null, ok: false, error: err.message };
        }
    },

    async registrarUsuario(datos) {
        try {
            const { error } = await _supabase
                .from('usuarios')
                .insert([datos]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    },

    // ── 2. PANEL CONDUCTOR (Mis Salidas y Averías) ──────
    async obtenerMisSalidas(nombreConductor) {
        try {
            const { data, error } = await _supabase
                .from('Traslado') // Importante: 'T' mayúscula
                .select('*')
                .ilike('conductor', `%${nombreConductor}%`)
                .order('fecha', { ascending: false })
                .limit(10);
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    },

    async obtenerMisAverias(nombreConductor) {
        try {
            const { data, error } = await _supabase
                .from('averias')
                .select('*')
                .ilike('reportado_por', `%${nombreConductor}%`)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    },

    // ── 3. GUARDAR REPORTES (Formularios) ───────────────
    async guardarTraslado(datos) {
        try {
            const { error } = await _supabase
                .from('Traslado')
                .insert([{
                    ...datos,
                    id_salida: 'JR-' + Date.now(),
                    fecha: new Date().toLocaleDateString('es-CO')
                }]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    },

    async guardarAveria(datos) {
        try {
            const { error } = await _supabase
                .from('averias')
                .insert([datos]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    },

    // ── 4. ADMIN / DASHBOARD (Flota y Global) ───────────
    async obtenerFlota() {
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
    },

    async obtenerTrasladosRecientes() {
        try {
            const { data, error } = await _supabase
                .from('Traslado')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    }
};

// Exportación para que el index.html lo vea
window.DB = DB;
