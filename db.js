// CONFIGURACIÓN SUPABASE J.R.
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    async guardarTraslado(datos) {
        // La tabla debe llamarse 'traslados' en Supabase
        const { error } = await _supabase
            .from('Traslados') 
            .insert([{
                id_salida: 'JR-' + Date.now(),
                fecha: new Date().toLocaleDateString(),
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
                km__salida: parseInt(datos.km_salida) || 0, // Doble guion bajo del CSV corregido
                km__ingreso: parseInt(datos.km_ingreso) || 0, // Doble guion bajo del CSV corregido
                total_km: parseInt(datos.total_km) || 0,
                coordinador_en_turno: datos.coordinador,
                observaciones: datos.observaciones,
                imagen: datos.imagen,
                firma: datos.firma
            }]);
        
        return { ok: !error, error };
    }
};
