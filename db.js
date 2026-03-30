// CONFIGURACIÓN SUPABASE J.R.
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    async guardarTraslado(datos) {
        // Nombre exacto de la tabla en tu Supabase
        const { error } = await _supabase
            .from('TrasladosJr.') 
            .insert([{
                "ID Salida": 'JR-' + Date.now(),
                "Fecha": new Date().toLocaleDateString(),
                "Regional": datos.regional,
                "Conductor": datos.conductor,
                "N° Telefono": datos.telefono,
                "Placa": datos.placa,
                "Motivo De Salida": datos.motivo,
                "Nombre Del Fallecido": datos.fallecido,
                "Clinica, Hospital o Rsd": datos.clinica,
                "Numero Prestacion": datos.prestacion,
                "Origen": datos.origen,
                "Destino": datos.destino,
                "Hora De Salida": datos.hora_salida,
                "Hora De Ingreso": datos.hora_ingreso,
                "Km Salida": parseInt(datos.km_salida) || 0,
                "Km Ingreso": parseInt(datos.km_ingreso) || 0,
                "Total Km": parseInt(datos.total_km) || 0,
                "Coordinador En Turno": datos.coordinador,
                "Observaciones": datos.observaciones,
                "Imagen": datos.imagen,
                "Firma": datos.firma
            }]);
        
        return { ok: !error, error };
    }
};
