// db.js actualizado para manejar Administrador y Conductor
const DB = {
    // ... (supabaseUrl y Key se mantienen igual)

    async login(usuario, clave, rolEsperado) { // Añadimos rolEsperado
        try {
            const { data, error } = await _supabase
                .from('usuarios')
                .select('*')
                .eq('usuario', usuario)
                .eq('password', clave)
                .eq('rol', rolEsperado) // Validamos que el rol coincida con el botón seleccionado
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
                    rol: 'conductor' // Por defecto se registran como conductores
                }]);

            if (error) throw error;
            return { ok: true, data };
        } catch (err) {
            // Manejo específico del error de duplicado que te salió
            if (err.code === "23505") {
                return { ok: false, error: "Esta cédula ya está registrada" };
            }
            return { ok: false, error: err.message };
        }
    }
};
