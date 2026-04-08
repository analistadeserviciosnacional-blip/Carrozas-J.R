// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
// ⚠️ REEMPLAZA ESTA LÍNEA con la clave que empieza por "eyJ..."
const supabaseKey = 'PEGA_AQUI_TU_CLAVE_ANON_PUBLIC'; 

const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    supabase: _supabase,

    // ── 1. SESIÓN Y REGISTRO ────────────────────────────
    async login(usuario, clave) {
        try {
            const { data, error } = await _supabase
                .from('usuarios')
                .select('*')
                .eq('usuario', usuario.trim())
                .eq('password', clave.trim())
                .maybeSingle();

            if (error) throw error;
            if (!data) return { data: null, ok: false, error: "Usuario o clave incorrectos" };

            return { data, ok: true };
        } catch (err) {
            console.error("Error Login:", err.message);
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
    async guardarTraslado(datos) {
        try {
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
                imagen4:              datos.imagen4       || '',
                clinica_hospital_o_rsd: datos.clinica     || '',
                numero_prestacion:      datos.prestacion  || ''
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
                .order('id_salida', { ascending: false })
                .limit(50);
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
                .order('id_salida', { ascending: false })
                .limit(10);
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

    async obtenerTodasAverias() {
        try {
            const { data, error } = await _supabase
                .from('Averias')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(20);
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    }
};

window.DB = DB;
