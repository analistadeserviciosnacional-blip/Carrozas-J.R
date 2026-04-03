// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';

// Inicialización del cliente
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    supabase: _supabase,

    // ── SECCIÓN: TRASLADOS (SALIDAS) ──────────────────────────
    async guardarTraslado(datos) {
        try {
            const { data, error } = await _supabase
                .from('Traslado') // Verifica que en Supabase sea 'Traslado' con T mayúscula
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
                    coordinador_en_turno:   datos.coordinador, // Ajustado según tu instrucción
                    observaciones:          datos.observaciones,
                    imagen1:                datos.imagen1 || "",
                    imagen2:                datos.imagen2 || "",
                    imagen3:                datos.imagen3 || "",
                    imagen4:                datos.imagen4 || "",
                    firma:                  datos.firma || ""
                }]);

            if (error) throw error;
            return { ok: true, data };
        } catch (err) {
            console.error("Error crítico en guardarTraslado:", err);
            alert("Error al guardar: " + (err.message || "Revisa la conexión"));
            return { ok: false, error: err };
        }
    },

    async obtenerTrasladosRecientes() {
        try {
            const { data, error } = await _supabase
                .from('Traslado')
                .select('*')
                .order('created_at', { ascending: false }) 
                .limit(10);
            
            if (error) throw error;
            return { data, error: null };
        } catch (err) {
            console.error("Error al obtener traslados:", err);
            return { data: [], error: err };
        }
    },

    // ── SECCIÓN: AVERÍAS (REPORTES) ──────────────────────────
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

            if (error) throw error;
            return { ok: true };
        } catch (err) {
            console.error("Error en guardarAveria:", err);
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
            
            if (error) throw error;
            return { data, error: null };
        } catch (err) {
            return { data: [], error: err };
        }
    },

    // ── SECCIÓN: CARROZAS (ESTADO DE LA FLOTA) ───────────────
    async obtenerFlota() {
        try {
            const { data, error } = await _supabase
                .from('carrozas') // Cambiado a minúscula según tu captura de Supabase
                .select('*')
                .order('placa', { ascending: true });

            if (error) throw error;
            return { data, error: null };
        } catch (err) {
            console.error("Error al obtener flota:", err);
            return { data: [], error: err };
        }
    }
};

// Exponer a nivel global
window._supabase = _supabase;
window.DB = DB;
