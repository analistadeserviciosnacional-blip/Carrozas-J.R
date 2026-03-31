// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {

    // ── TRASLADOS ──────────────────────────────────────────
    async guardarTraslado(datos) {
        const { error } = await _supabase
            .from('Traslado')
            .insert([{
                id_salida:              'JR-' + Date.now(),
                fecha:                  new Date().toLocaleDateString(),
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
                imagen1:                datos.imagen1,
                imagen2:                datos.imagen2,
                imagen3:                datos.imagen3,
                imagen4:                datos.imagen4,
                firma:                  datos.firma
            }]);

        return { ok: !error, error };
    },

    // ── AVERÍAS ─────────────────────────────────────────────
    // Columnas reales en Supabase:
    // id | reportado_por | regional | placa_vehiculo |
    // tipo_vehiculo | tipo_falla | descripcion_sintomas | observaciones |
    // imagen1 | imagen2 | imagen3 | imagen4
    async guardarAveria(datos) {
        const { error } = await _supabase
            .from('Averias')
            .insert([{
                reportado_por:        datos.reportado_por,
                regional:             datos.regional,
                placa_vehiculo:       datos.placa,        // ✅ nombre real en Supabase
                tipo_vehiculo:        datos.vehiculo,     // ✅ nombre real en Supabase
                tipo_falla:           datos.tipo_falla,
                descripcion_sintomas: datos.sintomas,     // ✅ nombre real en Supabase
                observaciones:        datos.observaciones,
                foto1:              datos.imagen1,
                foto2:              datos.imagen2,
                foto3:              datos.imagen3,
                foto4:              datos.imagen4
            }]);

        return { ok: !error, error };
    },

    // ── CARROZAS ───────────────────────────────────────────
    async guardarCarroza(datos) {
        const { error } = await _supabase
            .from('Carrozas')
            .insert([{
                placa:                  datos.placa,
                modelo:                 datos.modelo,
                anio:                   parseInt(datos.anio) || 0,
                estado:                 datos.estado,
                conductor_asignado:     datos.conductor_asignado,
                kilometraje:            parseInt(datos.kilometraje) || 0,
                ultimo_mantenimiento:   datos.ultimo_mantenimiento,
                proximo_mantenimiento:  datos.proximo_mantenimiento,
                observaciones:          datos.observaciones,
                fecha_registro:         new Date().toLocaleDateString()
            }]);

        return { ok: !error, error };
    }

};
