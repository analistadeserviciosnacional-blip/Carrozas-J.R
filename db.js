// db.js - CONECTOR UNIFICADO J.R. (GOOGLE SHEETS)
const URL_GAS = "https://script.google.com/macros/s/AKfycbzQXp_jVV84vyyPXDAKscC8NTdsCSDUjmaqbDcblFowhcJNYrLqH27GVpaVPPQHXzupCw/exec";

const DB = {
    // Simulación de Supabase para no tener que editar todos los HTML
    supabase: {
        from: (table) => ({
            select: async (query) => {
                const sheet = table === 'carrozas' ? 'carrozas_rows' : 
                              table === 'Traslado' ? 'Traslado_rows' : 
                              table === 'usuarios' ? 'usuarios_rows' : 
                              table === 'Averias' ? 'Averias_rows' : 
                              table === 'mantenimientos' ? 'mantenimientos_rows' : 
                              table === 'solicitud_apoyo' ? 'solicitud_apoyo_rows' : table + '_rows';
                
                try {
                    const res = await fetch(`${URL_GAS}?sheetName=${sheet}`);
                    const data = await res.json();
                    return { data, error: null };
                } catch (e) { return { data: [], error: e }; }
            },
            insert: async (arrData) => {
                const sheet = table + '_rows';
                try {
                    for (let row of arrData) {
                        await fetch(`${URL_GAS}?sheetName=${sheet}`, {
                            method: 'POST',
                            body: JSON.stringify(row)
                        });
                    }
                    return { error: null };
                } catch (e) { return { error: e }; }
            },
            update: (updateData) => ({
                eq: async (col, val) => {
                    const sheet = table + '_rows';
                    // El script de Google usará la primera columna como ID para el update
                    try {
                        await fetch(`${URL_GAS}?sheetName=${sheet}&action=update`, {
                            method: 'POST',
                            body: JSON.stringify(updateData)
                        });
                        return { error: null };
                    } catch (e) { return { error: e }; }
                }
            }),
            order: function() { return this; },
            limit: function() { return this; },
            ilike: function() { return this; },
            eq: function() { return this; },
            channel: () => ({ on: () => ({ subscribe: () => {} }) }) // Mock para Realtime
        })
    },

    // Funciones directas usadas en los formularios
    async login(u, p) {
        const res = await this.supabase.from('usuarios').select();
        const user = res.data.find(row => row.usuario === u && row.password === p);
        return user ? { ok: true, data: user } : { ok: false };
    },

    async obtenerFlota() {
        return await this.supabase.from('carrozas').select();
    },

    async registrarUsuario(datos) {
        return await this.supabase.from('usuarios').insert([datos]);
    },

    async guardarTraslado(datos) {
        return await this.supabase.from('Traslado').insert([datos]);
    },

    async obtenerTrasladosRecientes() {
        return await this.supabase.from('Traslado').select();
    },

    async guardarAveria(datos) {
        return await this.supabase.from('Averias').insert([datos]);
    }
};

window.DB = DB;
