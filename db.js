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
    // Columnas reales de la tabla Traslado (verificadas en Supabase):
    // id_salida, fecha, regional, conductor, nnum_telefono, placa,
    // motivo_de_salida, nombre_del_fallecido, clínica_hospital_o_rsd, numero_prestación,
    // origen, destino, hora_de_salida, hora_de_ingreso, km__salida, km__ingreso,
    // total_km, coordinador_en_turno, observaciones, firma, imagen1...
    async guardarTraslado(datos) {
        try {
            // Construimos el payload solo con columnas ASCII seguras.
            // Las columnas con tildes (clínica_hospital_o_rsd, numero_prestación)
            // se añaden dinámicamente para evitar error de schema cache.
            const payload = {
                id_salida:            'JR-' + Date.now(),
                fecha:                new Date().toLocaleDateString('es-CO'),
                regional:             datos.regional      || '',
                conductor:            datos.conductor     || '',
                nnum_telefono:        datos.telefono      || '',
                placa:                datos.placa         || '',
                motivo_de_salida:     datos.motivo        || '',
                nombre_del_fallecido: datos.fallecido     || '',
                origen:               datos.origen        || '',
                destino:              datos.destino       || '',
                hora_de_salida:       datos.hora_salida   || '',
                hora_de_ingreso:      datos.hora_ingreso  || '',
                km__salida:           datos.km_salida     || '',
                km__ingreso:          datos.km_ingreso    || '',
                total_km:             datos.total_km      || '',
                coordinador_en_turno: datos.coordinador   || '',
                observaciones:        datos.observaciones || '',
                firma:                datos.firma         || '',
                imagen1:              datos.imagen1       || '',
                imagen2:              datos.imagen2       || '',
                imagen3:              datos.imagen3       || '',
                imagen4:              datos.imagen4       || ''
            };
            payload['clinica_hospital_o_rsd'] = datos.clinica    || '';
            payload['numero_prestacion']      = datos.prestacion || '';
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
                .ilike('conductor', '%' + nombreConductor + '%')
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
                .ilike('reportado_por', '%' + nombreConductor + '%')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    }
};

window.DB = DB;
