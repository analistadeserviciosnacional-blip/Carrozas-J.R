// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';

// Inicialización del cliente de Supabase
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    // ✅ Expuesto para consultas directas si es necesario
    supabase: _supabase,

    // ── SECCIÓN: TRASLADOS (SALIDAS) ──────────────────────────

    /**
     * Guarda un nuevo reporte de traslado en la tabla 'Traslado'
     */
    async guardarTraslado(datos) {
        try {
            const { error } = await _supabase
                .from('Traslado')
                .insert([{
                    id_salida:              'JR-' + Date.now(),
                    fecha:                  new Date().toLocaleDateString('es-CO'), // Formato legible para el mensaje
                    created_at:             new Date().toISOString(), // Para ordenamiento técnico
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
                    hora_de_ingreso:        datos.hora_ingreso,
                    km__salida:             parseInt(datos.km_salida)  || 0,
                    km__ingreso:            parseInt(datos.km_ingreso) || 0,
                    total_km:               parseInt(datos.total_km)   || 0,
                    coordinador_en_turno:   datos.coordinador, // Aquí se guarda el "Coordinador"
                    observaciones:          datos.observaciones,
                    imagen1:                datos.imagen1 || "",
                    imagen2:                datos.imagen2 || "",
                    imagen3:                datos.imagen3 || "",
                    imagen4:                datos.imagen4 || "",
                    firma:                  datos.firma || ""
                }]);
            return { ok: !error, error };
        } catch (err) {
            console.error("Error en guardarTraslado:", err);
            return { ok: false, error: err };
        }
    },

    /**
     * Obtiene los últimos traslados para el Dashboard ordenados por creación
     */
    async obtenerTrasladosRecientes() {
        try {
            const { data, error } = await _supabase
                .from('Traslado')
                .select('*')
                .order('created_at', { ascending: false }) 
                .limit(10);
            return { data, error };
        } catch (err) {
            return { data: null, error: err };
        }
    },

    // ── SECCIÓN: AVERÍAS (REPORTES DE CONDUCTOR) ──────────────

    /**
     * Guarda un reporte de falla mecánica en la tabla 'Averias'
     */
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

    /**
     * Busca averías para un conductor específico
     */
    async obtenerAveriasPorConductor(nombre) {
        try {
            const busqueda = nombre.trim().split(' ')[0];
            const { data, error } = await _supabase
                .from('Averias')
                .select('*')
                .ilike('reportado_por', `%${busqueda}%`)
                .order('id', { ascending: false })
                .limit(20);
            return { data, error };
        } catch (err) {
            return { data: null, error: err };
        }
    },

    // ── SECCIÓN: CARROZAS (ESTADO DE LA FLOTA) ───────────────

    /**
     * Registra o actualiza un vehículo en la tabla 'Carrozas'
     */
    async guardarCarroza(datos) {
        try {
            const { error } = await _supabase
                .from('Carrozas')
                .upsert([{
                    placa:                  datos.placa,
                    modelo:                 datos.modelo,
                    anio:                   parseInt(datos.anio) || 0,
                    estado:                 datos.estado || 'Disponible',
                    conductor_asignado:     datos.conductor_asignado,
                    kilometraje:            parseInt(datos.kilometraje) || 0,
                    ultimo_mantenimiento:   datos.ultimo_mantenimiento,
                    proximo_mantenimiento:  datos.proximo_mantenimiento,
                    observaciones:          datos.observaciones,
                    fecha_actualizacion:    new Date().toISOString()
                }]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    },

    /**
     * Obtiene la lista completa de vehículos para el monitor
     */
    async obtenerFlota() {
        try {
            const { data, error } = await _supabase
                .from('Carrozas')
                .select('*')
                .order('placa', { ascending: true });
            return { data, error };
        } catch (err) {
            return { data: null, error: err };
        }
    }
};

// Exponer a nivel global
window._supabase = _supabase;
window.DB = DB;
