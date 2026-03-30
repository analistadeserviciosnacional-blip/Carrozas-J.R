// CONFIGURACIÓN SUPABASE J.R.
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    async guardarTraslado(datos) {
        // Apuntamos a la tabla 'traslados' creada por SQL
        const { error } = await _supabase
            .from('Traslados') 
            .insert([{
                id_salida: 'JR-' + Date.now(),
                fecha: new Date().toLocaleDateString(),
                regional: datos.regional,
                conductor: datos.conductor,
                telefono: datos.telefono,
                placa: datos.placa,
                motivo_salida: datos.motivo,
                nombre_fallecido: datos.fallecido,
                clinica: datos.clinica,
                numero_prestacion: datos.prestacion,
                origen: datos.origen,
                destino: datos.destino,
                hora_salida: datos.hora_salida,
                hora_ingreso: datos.hora_ingreso,
                km_salida: parseInt(datos.km_salida) || 0,
                km_ingreso: parseInt(datos.km_ingreso) || 0,
                total_km: parseInt(datos.total_km) || 0,
                coordinador: datos.coordinador,
                observaciones: datos.observaciones,
                imagen: datos.imagen,
                firma: datos.firma
            }]);
        
        return { ok: !error, error };
    }
};
