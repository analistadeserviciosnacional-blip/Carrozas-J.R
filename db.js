// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';

// Inicialización
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    supabase: _supabase,

    // ── 1. SESIÓN ──
    async login(usuario, clave) {
        const { data, error } = await _supabase
            .from('usuarios')
            .select('*')
            .eq('usuario', usuario)
            .eq('password', clave)
            .single();
        return { data, ok: !error, error };
    },

    async registrarUsuario(datos) {
        const { error } = await _supabase.from('usuarios').insert([datos]);
        return { ok: !error, error };
    },

    // ── 2. TRASLADOS (Módulo Salidas/Llegadas) ──
    async obtenerMisSalidas(nombreConductor) {
        const { data, error } = await _supabase
            .from('Traslado') // Verifica que en Supabase sea con 'T' mayúscula
            .select('*')
            .ilike('conductor', `%${nombreConductor}%`)
            .order('created_at', { ascending: false });
        return { data: data || [], ok: !error };
    },

    async guardarTraslado(datos) {
        const { error } = await _supabase.from('Traslado').insert([{
            ...datos,
            id_salida: 'JR-' + Date.now(),
            created_at: new Date().toISOString()
        }]);
        return { ok: !error, error };
    },

    // ── 3. AVERÍAS ──
    async obtenerMisAverias(nombreConductor) {
        const { data, error } = await _supabase
            .from('averias')
            .select('*')
            .ilike('reportado_por', `%${nombreConductor}%`)
            .order('created_at', { ascending: false });
        return { data: data || [], ok: !error };
    },

    async guardarAveria(datos) {
        const { error } = await _supabase.from('averias').insert([datos]);
        return { ok: !error, error };
    },

    // ── 4. FLOTA (Gestión de Carrozas) ──
    async obtenerFlota() {
        const { data, error } = await _supabase
            .from('carrozas')
            .select('*')
            .order('placa', { ascending: true });
        return { data: data || [], ok: !error };
    },

    async actualizarEstadoVehiculo(placa, nuevoEstado, nuevoKm) {
        const { error } = await _supabase
            .from('carrozas')
            .update({ estado: nuevoEstado, kilometraje_actual: nuevoKm })
            .eq('placa', placa);
        return { ok: !error, error };
    }
};

window.DB = DB;
