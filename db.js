// CONFIGURACIÓN SUPABASE J.R.
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    async guardarTraslado(datos) {
        // Usamos los nombres exactos de tu CSV en MAYÚSCULAS
        const { error } = await _supabase
            .from('Traslados') 
            .insert([{
                "ID Salida": 'JR-' + Date.now(),
                "Fecha": new Date().toLocaleDateString(),
                "Regional": datos.regional,
                "Conductor ": datos.conductor, // Espacio al final
                "N° Telefono ": datos.telefono, // Espacio al final
                "Placa ": datos.placa, // Espacio al final
                "Motivo De Salida ": datos.motivo, // Espacio al final
                "Nombre Del Fallecido ": datos.fallecido, // Espacio al final
                "Clinica, Hospital o Rsd": datos.clinica,
                "Numero Prestacion": datos.prestacion,
                "Origen": datos.origen,
                "Destino ": datos.destino, // Espacio al final
                "Hora De Salida": datos.hora_salida,
                "Hora De Ingreso": datos.hora_ingreso,
                "Km  Salida": parseInt(datos.km_salida) || 0, // Doble espacio
                "Km  Ingreso": parseInt(datos.km_ingreso) || 0, // Doble espacio
                "Total Km": parseInt(datos.total_km) || 0,
                "Coordinador En Turno": datos.coordinador,
                "Observaciones": datos.observaciones,
                "Imagen": datos.imagen,
                "Firma": datos.firma
            }]);
        
        return { ok: !error, error };
    }
};
