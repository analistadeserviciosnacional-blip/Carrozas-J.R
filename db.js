const URL_GAS = "PEGA_AQUI_TU_URL_DE_IMPLEMENTACION"; //https://script.google.com/macros/s/AKfycbyL9ulGDwwh0kIYyxqFOmDYkmNu9EDnJTgbVrZq1ZnAhwRjAQq6CxCVu1PtTvZpfNFL2Q/exec

const DB = {
    supabase: {
        from: (tableName) => {
            const sheet = tableName; 
            return {
                select: async function() {
                    try {
                        const response = await fetch(`${URL_GAS}?sheetName=${sheet}`);
                        const data = await response.json();
                        return {
                            data: data, error: null,
                            eq: function(col, val) { this.data = this.data.filter(item => String(item[col]).toLowerCase() === String(val).toLowerCase()); return this; },
                            order: function() { return this; },
                            limit: function(n) { this.data = this.data.slice(0, n); return this; },
                            ilike: function(col, val) { 
                                const s = val.replace(/%/g, "").toLowerCase();
                                this.data = this.data.filter(item => String(item[col]).toLowerCase().includes(s)); return this; 
                            },
                            single: async function() { return { data: this.data[0] || null, error: null }; },
                            then: function(cb) { return Promise.resolve(cb({ data: this.data, error: null })); }
                        };
                    } catch (e) { return { data: [], error: e }; }
                },
                insert: async function(records) {
                    try {
                        for (const row of records) {
                            await fetch(`${URL_GAS}?sheetName=${sheet}`, { method: 'POST', body: JSON.stringify(row) });
                        }
                        return { data: records, error: null };
                    } catch (e) { return { error: e }; }
                },
                update: function(updateData) {
                    return {
                        eq: async function(idCol, idVal) {
                            try {
                                await fetch(`${URL_GAS}?sheetName=${sheet}&action=update&idCol=${idCol}&idValue=${idVal}`, {
                                    method: 'POST', body: JSON.stringify(updateData)
                                });
                                return { error: null };
                            } catch (e) { return { error: e }; }
                        }
                    };
                }
            };
        },
        channel: () => ({ on: () => ({ subscribe: () => {} }) })
    },
    async login(u, p) {
        const res = await this.supabase.from('usuarios').select('*');
        const user = res.data.find(row => String(row.usuario).trim() === String(u).trim() && String(row.password).trim() === String(p).trim());
        return user ? { ok: true, data: user } : { ok: false };
    }
};
window.DB = DB;
