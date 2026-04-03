// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';

const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    supabase: _supabase,

    // ── SECCIÓN: TRASLADOS ──────────────────────────────────
    async guardarTraslado(datos) {
        try {
            const { error } = await _supabase
                .from('Traslado')
                .insert([{
                    id_salida:              'JR-' + Date.now(),
                    fecha:                  new Date().toLocaleDateString('es-CO'),
                    regional:               datos.regional,
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
                .from('Traslado')
                .select('*')
                .order('fecha', { ascending: false }) 
                .limit(10);
            return { data: data || [], error };
        } catch (err) {
            return { data: [], error: err };
        }
    },

    // ── SECCIÓN: AVERÍAS ────────────────────────────────────
    async obtenerTodasAverias() {
        try {
            const { data, error } = await _supabase
                .from('Averias')
                .select('*')
                // Cambiado 'identificador' por 'id' que es el estándar de Supabase
                .order('id', { ascending: false })
                .limit(50);
            return { data: data || [], error };
        } catch (err) {
            return { data: [], error: err };
        }
    },

    // ── SECCIÓN: CARROZAS (FLOTA) ───────────────────────────
    async guardarCarroza(datos) {
        try {
            const { error } = await _supabase
                .from('carrozas') 
                .insert([{
                    placa:                  datos.placa,
                    modelo:                 datos.modelo,
                    anio:                   parseInt(datos.anio) || 0,
                    estado:                 datos.estado,
                    conductor_asignado:     datos.conductor_asignado,
                    // Sincronizado con la columna real 'kilometraje_actual'
                    kilometraje_actual:     parseInt(datos.kilometraje) || 0,
                    ultimo_mantenimiento:   datos.ultimo_mantenimiento,
                    proximo_mantenimiento:  datos.proximo_mantenimiento,
                    observaciones:          datos.observaciones,
                    fecha_registro:         new Date().toLocaleDateString('es-CO')
                }]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    },

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
    }
};

// Exportación global
window._supabase = _supabase;
window.DB = DB;
