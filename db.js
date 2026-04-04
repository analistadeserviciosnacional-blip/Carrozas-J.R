// CONFIGURACIÓN SUPABASE
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    supabase: _supabase,

    // --- AUTENTICACIÓN ---
    async login(u, p) {
        const { data, error } = await _supabase.from('usuarios').select('*').eq('usuario', u).eq('password', p).single();
        return { data, ok: !error, error };
    },
    async registrarUsuario(d) {
        const { error } = await _supabase.from('usuarios').insert([d]);
        return { ok: !error, error };
    },

    // --- TRASLADOS (SALIDAS Y LLEGADAS) ---
    async obtenerMisSalidas(nombre) {
        const { data, error } = await _supabase.from('Traslado').select('*').ilike('conductor', `%${nombre}%`).order('created_at', { ascending: false });
        return { data: data || [], ok: !error };
    },
    async guardarTraslado(d) {
        const { error } = await _supabase.from('Traslado').insert([{ ...d, id_salida: 'JR-'+Date.now() }]);
        return { ok: !error, error };
    },

    // --- AVERÍAS ---
    async obtenerMisAverias(nombre) {
        const { data, error } = await _supabase.from('averias').select('*').ilike('reportado_por', `%${nombre}%`).order('created_at', { ascending: false });
        return { data: data || [], ok: !error };
    },
    async guardarAveria(d) {
        const { error } = await _supabase.from('averias').insert([d]);
        return { ok: !error, error };
    },

    // --- FLOTA Y TALLER ---
    async obtenerFlota() {
        const { data, error } = await _supabase.from('carrozas').select('*').order('placa', { ascending: true });
        return { data: data || [], ok: !error };
    },
    async actualizarEstadoVehiculo(placa, nuevoEstado, nuevoKm) {
        const { error } = await _supabase.from('carrozas').update({ estado: nuevoEstado, kilometraje_actual: nuevoKm }).eq('placa', placa);
        return { ok: !error, error };
    }
};
window.DB = DB; // Hace que DB sea accesible desde cualquier HTML
