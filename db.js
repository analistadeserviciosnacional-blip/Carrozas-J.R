// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
// Asegúrate de que esta sea la "anon public" key
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';

// 1. Inicialización del cliente
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// 2. Objeto DB con todas las funciones
const DB = {
    supabase: _supabase,

    // ── SECCIÓN: AUTENTICACIÓN (Para que cargue el Login) ──
    async login(usuario, clave) {
        try {
            const { data, error } = await _supabase
                .from('usuarios')
                .select('*')
                .eq('usuario', usuario)
                .eq('clave', clave)
                .single();
            
            if (error) throw error;
            return { data, ok: true };
        } catch (err) {
            console.error("Error en login:", err.message);
            return { data: null, ok: false, error: err };
        }
    },

    // ── SECCIÓN: CARROZAS (Para que carguen las placas) ──
    async obtenerFlota() {
        try {
            const { data, error } = await _supabase
                .from('carrozas')
                .select('*')
                .order('placa', { ascending: true });
            
            if (error) throw error;
            return { data: data || [], error: null };
        } catch (err) {
            console.error("Error cargando flota:", err);
            return { data: [], error: err };
        }
    },

    // ── SECCIÓN: AVERÍAS ────────────────────────────────────
    async guardarAveria(datos) {
        try {
            const { error } = await _supabase
                .from('Averias')
                .insert([{
                    reportado_por: datos.reportado_por,
                    regional: datos.regional,
                    placa_vehiculo: datos.placa_vehiculo,
                    tipo_vehiculo: datos.tipo_vehiculo,
                    tipo_falla: datos.tipo_falla,
                    descripcion_sintomas: datos.descripcion_sintomas,
                    observaciones: datos.observaciones || "",
                    imagen1: datos.imagen1 || "",
                    imagen2: datos.imagen2 || "",
                    imagen3: datos.imagen3 || "",
                    imagen4: datos.imagen4 || "",
                    created_at: new Date().toISOString()
                }]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    },

    // ── SECCIÓN: TRASLADOS ──────────────────────────────────
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

// 3. Exportación global
window.DB = DB;
