// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';

const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    supabase: _supabase,

    // ── SECCIÓN: USUARIOS (LOGIN Y REGISTRO) ───────────────
    
    async login(usuario, clave, rolEsperado) {
        try {
            const { data, error } = await _supabase
                .from('usuarios')
                .select('*')
                .eq('usuario', usuario)
                .eq('password', clave)
                .eq('rol', rolEsperado) // Valida el rol (admin/conductor)
                .single();
            
            if (error) throw error;
            return { data, ok: true };
        } catch (err) {
            console.error("Error en login:", err.message);
            return { data: null, ok: false, error: "Credenciales incorrectas para este perfil" };
        }
    },

    async registrarUsuario(datos) {
        try {
            const { data, error } = await _supabase
                .from('usuarios')
                .insert([{
                    usuario: datos.usuario,
                    password: datos.password,
                    nombre: datos.nombre,
                    telefono: datos.telefono,
                    rol: 'conductor' // Registro por defecto
                }]);

            if (error) throw error;
            return { ok: true, data };
        } catch (err) {
            if (err.code === "23505") {
                return { ok: false, error: "Esta cédula ya está registrada" };
            }
            return { ok: false, error: err.message };
        }
    },

    // ── SECCIÓN: CARROZAS (FLOTA) ───────────────────────────

    async obtenerFlota() {
        try {
            const { data, error } = await _supabase
                .from('carrozas')
                .select('*')
                .order('placa', { ascending: true });
            
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            console.error("Error cargando flota:", err);
            return { data: [], ok: false };
        }
    },

    // ── SECCIÓN: TRASLADOS ──────────────────────────────────

    async obtenerTrasladosRecientes() {
        try {
            const { data, error } = await _supabase
                .from('Traslado')
                .select('*')
                .order('id', { ascending: false })
                .limit(10);
            
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            console.error("Error traslados:", err);
            return { data: [], ok: false };
        }
    },

    async guardarTraslado(datos) {
        try {
            const { error } = await _supabase
                .from('Traslado')
                .insert([{
                    id_salida: 'JR-' + Date.now(),
                    fecha: new Date().toLocaleDateString('es-CO'),
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
                    km__salida: parseInt(datos.km_salida) || 0,
                    km__ingreso: parseInt(datos.km_ingreso) || 0,
                    total_km: parseInt(datos.total_km) || 0,
                    coordinador_en_turno: datos.coordinador,
                    observaciones: datos.observaciones,
                    imagen1: datos.imagen1 || "",
                    imagen2: datos.imagen2 || "",
                    imagen3: datos.imagen3 || "",
                    imagen4: datos.imagen4 || "",
                    firma: datos.firma || ""
                }]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    },

    // ── SECCIÓN: AVERÍAS ────────────────────────────────────

    async obtenerTodasAverias() {
        try {
            const { data, error } = await _supabase
                .from('Averias')
                .select('*')
                .order('id', { ascending: false })
                .limit(50);
            
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            console.error("Error averías:", err);
            return { data: [], ok: false };
        }
    }
};

// Exponer globalmente
window.DB = DB;
