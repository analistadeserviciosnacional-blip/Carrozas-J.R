// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';

const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    supabase: _supabase,

    // ── 1. LOGIN (AJUSTADO A TUS TABLAS ACTUALES) ─────────
    async login(usuario, clave) {
        try {
            // Validamos solo con usuario y password porque 'rol' no existe en tu DB
            const { data, error } = await _supabase
                .from('usuarios')
                .select('*')
                .eq('usuario', usuario)
                .eq('password', clave)
                .single();
            
            if (error) throw error;
            return { data, ok: true };
        } catch (err) {
            console.error("Error en login:", err.message);
            return { data: null, ok: false, error: "Usuario o clave incorrectos" };
        }
    },

    // ── 2. REGISTRO DE USUARIOS ────────────────────────────
    async registrarUsuario(datos) {
        try {
            const { data, error } = await _supabase
                .from('usuarios')
                .insert([{
                    usuario: datos.usuario,
                    password: datos.password,
                    nombre: datos.nombre,
                    telefono: datos.telefono
                    // No incluimos 'rol' para evitar el error "column does not exist"
                }]);

            if (error) throw error;
            return { ok: true, data };
        } catch (err) {
            // Error de clave duplicada (Cédula ya registrada)
            if (err.code === "23505") {
                return { ok: false, error: "Esta cédula ya está registrada" };
            }
            return { ok: false, error: err.message };
        }
    },

    // ── 3. FUNCIONES DEL DASHBOARD (FLOTA Y TRASLADOS) ─────
    async obtenerFlota() {
        try {
            const { data, error } = await _supabase
                .from('carrozas')
                .select('*')
                .order('placa', { ascending: true });
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            console.error("Error cargando flota:", err);
            return { data: [], ok: false };
        }
    },

    async obtenerTrasladosRecientes() {
        try {
            const { data, error } = await _supabase
                .from('Traslado')
                .select('*')
                .order('id', { ascending: false })
                .limit(10);
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            console.error("Error cargando traslados:", err);
            return { data: [], ok: false };
        }
    },

    async obtenerTodasAverias() {
        try {
            const { data, error } = await _supabase
                .from('Averias')
                .select('*')
                .order('id', { ascending: false });
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            console.error("Error cargando averías:", err);
            return { data: [], ok: false };
        }
    },

    // ── 4. GUARDADO DE DATOS ───────────────────────────────
    async guardarTraslado(datos) {
        try {
            const { error } = await _supabase
                .from('Traslado')
                .insert([{
                    id_salida: 'JR-' + Date.now(),
                    fecha: new Date().toLocaleDateString('es-CO'),
                    regional: datos.regional,
                    conductor: datos.conductor,
                    nnum_telefono: datos.telefono,
                    placa: datos.placa,
                    motivo_de_salida: datos.motivo,
                    nombre_del_fallecido: datos.fallecido,
                    clinica_hospital_o_rsd: datos.clinica,
                    numero_prestacion: datos.prestacion,
                    origen: datos.origen,
                    destino: datos.destino,
                    hora_de_salida: datos.hora_salida,
                    hora_de_ingreso: datos.hora_ingreso,
                    km__salida: parseInt(datos.km_salida) || 0,
                    km__ingreso: parseInt(datos.km_ingreso) || 0,
                    total_km: parseInt(datos.total_km) || 0,
                    coordinador_en_turno: datos.coordinador,
                    observaciones: datos.observaciones,
                    firma: datos.firma || ""
                }]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    }
};

// Exponer el objeto DB globalmente para los otros scripts
window.DB = DB;
