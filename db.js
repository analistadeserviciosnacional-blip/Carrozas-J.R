// CONFIGURACIÓN SUPABASE J.R.
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    async guardarTraslado(datos) {
        const { error } = await _supabase
            .from('TrasladosJr.') // Nombre con espacio y punto
            .insert([{
                "ID Salida": 'JR-' + Date.now(),
                "Fecha": new Date().toLocaleDateString(),
                "Regional": datos.regional,
                "Conductor ": datos.conductor, // <-- TIENE ESPACIO AL FINAL EN TU CSV
                "N° Telefono ": datos.telefono, // <-- TIENE ESPACIO AL FINAL EN TU CSV
                "Placa ": datos.placa, // <-- TIENE ESPACIO AL FINAL EN TU CSV
                "Motivo De Salida ": datos.motivo, // <-- TIENE ESPACIO AL FINAL EN TU CSV
                "Nombre Del Fallecido ": datos.fallecido, // <-- TIENE ESPACIO AL FINAL EN TU CSV
                "Clinica, Hospital o Rsd": datos.clinica,
                "Numero Prestacion": datos.prestacion,
                "Origen": datos.origen,
                "Destino ": datos.destino, // <-- TIENE ESPACIO AL FINAL EN TU CSV
                "Hora De Salida": datos.hora_salida,
                "Hora De Ingreso": datos.hora_ingreso,
                "Km  Salida": parseInt(datos.km_salida) || 0, // <-- TIENE DOBLE ESPACIO
                "Km  Ingreso": parseInt(datos.km_ingreso) || 0, // <-- TIENE DOBLE ESPACIO
                "Total Km": parseInt(datos.total_km) || 0,
                "Coordinador En Turno": datos.coordinador,
                "Observaciones": datos.observaciones,
                "Imagen": datos.imagen,
                "Firma": datos.firma
            }]);
        
        return { ok: !error, error };
    }
};
