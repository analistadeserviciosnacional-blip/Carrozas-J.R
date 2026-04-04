// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';

// Inicialización del cliente
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    supabase: _supabase,

    // ── 1. SISTEMA DE SESIÓN ────────────────────────────
    async login(usuario, clave) {
        try {
            this.logout(); // Limpia rastros anteriores
            const { data, error } = await _supabase
                .from('usuarios')
                .select('*')
                .eq('usuario', usuario)
                .eq('password', clave)
                .single();
            
            if (error) throw error;

            // Guardamos en ambos para que todos tus .html lo encuentren
            const sessionData = JSON.stringify(data);
            sessionStorage.setItem('user_jr', sessionData);
            localStorage.setItem('usuario_data', sessionData);
            
            return { data, ok: true };
        } catch (err) {
            console.error("Error login:", err.message);
            return { data: null, ok: false, error: "Usuario o clave incorrectos" };
        }
    },

    logout() {
        sessionStorage.clear();
        localStorage.clear();
    },

    // ── 2. CONSULTAS PARA EL CONDUCTOR ──────────────────
    async obtenerMisSalidas(nombreConductor) {
        try {
            const { data, error } = await _supabase
                .from('Traslado') // Nombre exacto en tu DB
                .select('placa, motivo_de_salida, destino, fecha')
                .ilike('conductor', `%${nombreConductor}%`)
                .order('fecha', { ascending: false })
                .limit(5);
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    },

    async obtenerMisAverias(nombreConductor) {
        try {
            const { data, error } = await _supabase
                .from('averias') // Minúscula según capturas
                .select('*')
                .ilike('reportado_por', `%${nombreConductor}%`)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    },

    // ── 3. CONSULTAS PARA EL ADMIN / MONITOR ────────────
    async obtenerFlota() {
        try {
            const { data, error } = await _supabase
                .from('carrozas')
                .select('*')
                .order('placa', { ascending: true });
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    },

    async obtenerTrasladosRecientes() {
        try {
            const { data, error } = await _supabase
                .from('Traslado')
                .select('*')
                .order('fecha', { ascending: false }) 
                .limit(20);
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            return { data: [], ok: false };
        }
    },

    // ── 4. REGISTRO DE DATOS ────────────────────────────
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
                    firma: datos.firma || ""
                }]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    },

    async guardarAveria(datos) {
        try {
            const { error } = await _supabase
                .from('averias')
                .insert([datos]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    }
};

window.DB = DB;
