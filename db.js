// ── CONFIGURACIÓN SUPABASE J.R. ────────────────────────
const supabaseUrl = 'https://tgvgchjkdvnjfxqdkmdw.supabase.co';
const supabaseKey = 'sb_publishable_PVXY35VXPucpHHYDhfleOw_26pNRCKM';

const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const DB = {
    supabase: _supabase,

    // ── 1. LOGIN (SIN COLUMNA ROL) ────────────────────────
    async login(usuario, clave) {
        try {
            // Limpiamos cualquier rastro de sesión anterior antes de iniciar
            this.logout();

            const { data, error } = await _supabase
                .from('usuarios')
                .select('*')
                .eq('usuario', usuario)
                .eq('password', clave)
                .single();
            
            if (error) throw error;

            // Guardamos el usuario en SessionStorage para que no se pierda al navegar
            sessionStorage.setItem('user_jr', JSON.stringify(data));
            return { data, ok: true };
        } catch (err) {
            console.error("Error en login:", err.message);
            return { data: null, ok: false, error: "Usuario o clave incorrectos" };
        }
    },

    // ── 2. LOGOUT (LIMPIEZA TOTAL) ───────────────────────
    logout() {
        sessionStorage.clear();
        localStorage.removeItem('user_jr');
    },

    // ── 3. FUNCIONES DEL DASHBOARD (ADMIN) ────────────────
    async obtenerFlota() {
        try {
            const { data, error } = await _supabase
                .from('carrozas')
                .select('*')
                .order('placa', { ascending: true });
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            console.error("Error flota:", err.message);
            return { data: [], ok: false };
        }
    },

    async obtenerTrasladosRecientes() {
        try {
            // Eliminado el .order('id') que causaba el error 400
            const { data, error } = await _supabase
                .from('Traslado')
                .select('*')
                .limit(20);
            
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            console.error("Error traslados:", err.message);
            return { data: [], ok: false };
        }
    },

    async obtenerTodasAverias() {
        try {
            const { data, error } = await _supabase
                .from('Averias')
                .select('*');
            if (error) throw error;
            return { data: data || [], ok: true };
        } catch (err) {
            console.error("Error averías:", err.message);
            return { data: [], ok: false };
        }
    },

    // ── 4. GUARDADO DE DATOS (CONDUCTOR) ──────────────────
    async registrarUsuario(datos) {
        try {
            const { data, error } = await _supabase
                .from('usuarios')
                .insert([{
                    usuario: datos.usuario,
                    password: datos.password,
                    nombre: datos.nombre,
                    telefono: datos.telefono
                }]);
            if (error) throw error;
            return { ok: true, data };
        } catch (err) {
            if (err.code === "23505") return { ok: false, error: "Cédula ya registrada" };
            return { ok: false, error: err.message };
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
                    firma: datos.firma || ""
                }]);
            return { ok: !error, error };
        } catch (err) {
            return { ok: false, error: err };
        }
    }
};

window.DB = DB;
