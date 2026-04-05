// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';

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

    // ── 2. FLOTA ────────────────────────────────────────
    // CORRECCIÓN: nombre de tabla 'carrozas' (minúsculas), consistente en todas las funciones
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

    // ── 3. TRASLADOS ─────────────────────────────────────
    // CORRECCIÓN: tabla 'Traslado' (T mayúscula, sin 's'), columna correcta 'nombre_del_fallecido'
    async guardarTraslado(datos) {
        try {
            const payload = {
                id_salida:                'JR-' + Date.now(),
                fecha:                    new Date().toLocaleDateString('es-CO'),
                regional:                 datos.regional || '',
                conductor:                datos.conductor || '',
                placa:                    datos.placa || '',
                motivo_de_salida:         datos.motivo || '',
                nombre_del_fallecido:     datos.fallecido || '',
                clinica_hospital_o_rsd:   datos.clinica || '',
                num_prestacion:           datos.prestacion || '',
                origen:                   datos.origen || '',
                destino:                  datos.destino || '',
                hora_de_salida:           datos.hora_salida || '',
                hora_ingreso:             datos.hora_ingreso || '',
                km__salida:               parseInt(datos.km_salida) || 0,
                km_ingreso:               parseInt(datos.km_ingreso) || 0,
                total_km:                 parseFloat(datos.total_km) || 0,
                coordinador_en_turno:     datos.coordinador || '',
                observaciones:            datos.observaciones || '',
                imagen1:                  datos.imagen1 || '',
                imagen2:                  datos.imagen2 || '',
                imagen3:                  datos.imagen3 || '',
                imagen4:                  datos.imagen4 || '',
                firma:                    datos.firma || ''
            };
            const { error } = await _supabase.from('Traslado').insert([payload]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
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
    },

    async obtenerMisSalidas(nombreConductor) {
        try {
            const { data, error } = await _supabase
                .from('Traslado')
                .select('*')
                .ilike('conductor', `%${nombreConductor}%`)
                .order('created_at', { ascending: false })
                .limit(10);
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    },

    // ── 4. AVERÍAS ───────────────────────────────────────
    async guardarAveria(datos) {
        try {
            const { error } = await _supabase
                .from('Averias')
                .insert([datos]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    },

    // CORRECCIÓN: función faltante que usaba dashboard.html
    async obtenerTodasAverias() {
        try {
            const { data, error } = await _supabase
                .from('Averias')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(20);
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    },

    async obtenerMisAverias(nombreConductor) {
        try {
            const { data, error } = await _supabase
                .from('Averias')
                .select('*')
                .ilike('reportado_por', `%${nombreConductor}%`)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    }
};

window.DB = DB;
