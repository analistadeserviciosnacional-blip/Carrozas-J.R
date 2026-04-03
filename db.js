// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';

// Inicialización del cliente
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    supabase: _supabase,

    // ── SECCIÓN: TRASLADOS (SALIDAS Y LLEGADAS) ────────────────
    async guardarTraslado(datos) {
        try {
            const { error } = await _supabase
                .from('Traslado') // TABLA CON T MAYÚSCULA
                .insert([{
                    id_salida:              'JR-' + Date.now(),
                    fecha:                  new Date().toLocaleDateString('es-CO'),
                    created_at:             new Date().toISOString(),
                    regional:               datos.regional || 'Pereira',
                    conductor:              datos.conductor,
                    nnum_telefono:          datos.telefono,
                    placa:                  datos.placa,
                    motivo_de_salida:       datos.motivo,
                    nombre_del_fallecido:   datos.fallecido,
                    clinica_hospital_o_rsd: datos.clinica,
                    numero_prestacion:      datos.prestacion,
                    origen:                 datos.origen,
                    destino:                datos.destino,
                    hora_de_salida:         datos.hora_salida,
                    hora_de_ingreso:        datos.hora_ingreso || null,
                    km__salida:             parseInt(datos.km_salida)  || 0,
                    km__ingreso:            parseInt(datos.km_ingreso) || 0,
                    total_km:               parseInt(datos.total_km)   || 0,
                    coordinador_en_turno:   datos.coordinador,
                    observaciones:          datos.observaciones,
                    imagen1:                datos.imagen1 || "",
                    imagen2:                datos.imagen2 || "",
                    imagen3:                datos.imagen3 || "",
                    imagen4:                datos.imagen4 || "",
                    firma:                  datos.firma || ""
                }]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    },

    async obtenerTrasladosRecientes() {
        try {
            const { data, error } = await _supabase
                .from('Traslado') // TABLA CON T MAYÚSCULA
                .select('*')
                .order('created_at', { ascending: false }) 
                .limit(10);
            return { data: data || [], error };
        } catch (err) {
            return { data: [], error: err };
        }
    },

    // ── SECCIÓN: AVERÍAS ──────────────────────────────────────
    async guardarAveria(datos) {
        try {
            const { error } = await _supabase
                .from('Averias')
                .insert([{
                    identificador:        Date.now(),
                    reportado_por:        datos.reportado_por,
                    regional:             datos.regional,
                    placa_vehiculo:       datos.placa,
                    tipo_vehiculo:        datos.vehiculo,
                    tipo_falla:           datos.tipo_falla,
                    descripcion_sintomas: datos.sintomas,
                    observaciones:        datos.observaciones,
                    imagen1:              datos.imagen1 || "",
                    imagen2:              datos.imagen2 || "",
                    imagen3:              datos.imagen3 || "",
                    imagen4:              datos.imagen4 || ""
                }]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    },

    async obtenerAveriasPendientes() {
        try {
            const { data, error } = await _supabase
                .from('Averias')
                .select('*')
                .order('id', { ascending: false })
                .limit(10);
            return { data: data || [], error };
        } catch (err) {
            return { data: [], error: err };
        }
    },

    // ── SECCIÓN: CARROZAS (ESTADO DE LA FLOTA) ───────────────
    async obtenerFlota() {
        try {
            const { data, error } = await _supabase
                .from('carrozas') // TABLA EN MINÚSCULAS SEGÚN TU SUPABASE
                .select('*')
                .order('placa', { ascending: true });
            return { data: data || [], error };
        } catch (err) {
            console.error("Error flota:", err);
            return { data: [], error: err };
        }
    }
};

window.DB = DB;
