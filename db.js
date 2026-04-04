// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';

const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    supabase: _supabase,

    // ── LOGIN ─────────────────────
    async login(usuario, clave) {
        try {
            const { data, error } = await _supabase
                .from('usuarios')
                .select('*')
                .eq('usuario', usuario)
                .eq('password', clave) // Tu columna se llama password
                .single();
            
            if (error) throw error;
            return { data, ok: true };
        } catch (err) {
            console.error("Error en login:", err.message);
            return { data: null, ok: false, error: err };
        }
    },

    // ── REGISTRO ─────────────────────
    async registrarUsuario(datos) {
        try {
            // Verificamos que no falten datos esenciales
            if(!datos.usuario || !datos.password) throw new Error("Faltan datos");

            const { data, error } = await _supabase
                .from('usuarios')
                .insert([{
                    usuario: datos.usuario,       // Cédula/User
                    password: datos.password,    // Clave
                    nombre: datos.nombre,
                    telefono: datos.telefono
                }]);

            if (error) throw error;
            return { ok: true, data };
        } catch (err) {
            console.error("Error en registro:", err.message);
            return { ok: false, error: err };
        }
    }
};

window.DB = DB;
