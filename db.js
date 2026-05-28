/**
 * ══════════════════════════════════════════════════════════
 *  CONECTOR J.R. CARROZAS — db.js  v10.4 (CON EDICIÓN)
 *  + actualizarTraslado() para modo edición / anti-duplicados
 * ══════════════════════════════════════════════════════════
 */

const URL_GAS = "https://script.google.com/macros/s/AKfycby3-BtZUU8OrRr9eU3cneGdF4fTvsPOtXshrQn0zmxUtLP5AjgF_qSnulTiQD_eFznZUg/exec";

const SHEET_MAP = {
  'carrozas':             'carrozas',
  'Traslado':             'Traslado',
  'Averias':              'Averias',
  'usuarios':             'usuarios',
  'Llegadas':             'Llegadas',
  'mantenimientos':       'mantenimientos',
  'solicitud_apoyo':      'solicitud_apoyo',
  'notificaciones_apoyo': 'notificaciones_apoyo',
  'config':               'config',
};

function resolveSheet(name) { return SHEET_MAP[name] || name; }

function fechaHoy() {
  const h = new Date();
  return h.getDate().toString().padStart(2,'0') + '/' +
         (h.getMonth()+1).toString().padStart(2,'0') + '/' +
         h.getFullYear();
}

async function gasGet(sheetName) {
  try {
    const url  = `${URL_GAS}?sheetName=${encodeURIComponent(resolveSheet(sheetName))}`;
    const resp = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (!resp.ok) { console.warn(`gasGet ${sheetName}: HTTP ${resp.status}`); return []; }
    const json = await resp.json();
    if (json && json.error) { console.warn(`gasGet ${sheetName}: ${json.error}`); return []; }
    return Array.isArray(json) ? json : [];
  } catch (err) {
    console.warn(`gasGet ${sheetName} error:`, err.message);
    return [];
  }
}

async function gasWrite(sheetName, payload, action = "insert", idCol = "", idValue = "") {
  const urlParams = new URLSearchParams({ sheetName: resolveSheet(sheetName), action });
  if (idCol)   urlParams.set('idCol',   idCol);
  if (idValue) urlParams.set('idValue', idValue);
  const url = `${URL_GAS}?${urlParams}`;
  try {
    const resp = await fetch(url, {
      method:   'POST',
      redirect: 'follow',
      headers:  { 'Content-Type': 'text/plain' },
      body:     JSON.stringify(payload),
    });
    if (!resp.ok) { console.error(`gasWrite HTTP ${resp.status}`); return { ok: false, error: `HTTP ${resp.status}` }; }
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); }
    catch(e) { return { ok: false, error: 'Respuesta no JSON: ' + text.substring(0, 200) }; }
    if (json.ok === false) { console.error(`gasWrite error:`, json.error); return { ok: false, error: json.error || 'Error desconocido' }; }
    return { ok: true, data: json };
  } catch(err) {
    console.error('gasWrite excepción:', err);
    return { ok: false, error: err.message };
  }
}

class GASQueryBuilder {
  constructor(t) {
    this._table         = t;
    this._filters       = [];
    this._isNullFilters = [];
    this._ilikes        = [];
    this._orders        = [];
    this._limitN        = null;
    this._single        = false;
    this._updatePayload = null;
    this._insertPayload = null;
  }

  select()            { return this; }
  eq(col, val)        { this._filters.push({ col, val: String(val) }); return this; }
  is(col, val) {
    if (val === null || val === undefined || val === '') {
      this._isNullFilters.push({ col });
    }
    return this;
  }
  ilike(col, pattern) { this._ilikes.push({ col, val: pattern.replace(/%/g,'').toLowerCase() }); return this; }
  order(col, opts={}) { this._orders.push({ col, asc: opts.ascending !== false }); return this; }
  limit(n)            { this._limitN = n; return this; }
  single()            { this._single = true; return this; }
  update(payload)     { this._updatePayload = payload; return this; }
  insert(payload) {
    this._insertPayload = Array.isArray(payload) ? payload[0] : payload;
    return this;
  }

  then(resolve, reject) {
    if (this._insertPayload !== null) {
      gasWrite(this._table, this._insertPayload, 'insert')
        .then(res => resolve({ data: null, error: res.ok ? null : { message: res.error } }))
        .catch(err => resolve({ data: null, error: { message: err.message } }));
      return;
    }
    if (this._updatePayload !== null) {
      const f = this._filters[0];
      if (!f) { resolve({ data: null, error: { message: 'update requiere .eq()' } }); return; }
      gasWrite(this._table, this._updatePayload, 'update', f.col, f.val)
        .then(res => resolve({ data: null, error: res.ok ? null : { message: res.error } }))
        .catch(err => resolve({ data: null, error: { message: err.message } }));
      return;
    }
    gasGet(this._table)
      .then(rows => {
        for (const f of this._filters)
          rows = rows.filter(r => String(r[f.col]||'').trim().toLowerCase() === f.val.trim().toLowerCase());
        for (const f of this._isNullFilters)
          rows = rows.filter(r => r[f.col] === null || r[f.col] === undefined || String(r[f.col]).trim() === '');
        for (const f of this._ilikes)
          rows = rows.filter(r => String(r[f.col]||'').toLowerCase().includes(f.val));
        for (const o of this._orders)
          rows.sort((a,b) => { const va=String(a[o.col]||''), vb=String(b[o.col]||''); return o.asc ? va.localeCompare(vb) : vb.localeCompare(va); });
        if (this._limitN) rows = rows.slice(0, this._limitN);
        resolve(this._single
          ? { data: rows[0]||null, error: rows.length ? null : { message: 'No rows' } }
          : { data: rows, error: null });
      })
      .catch(err => resolve({ data: null, error: { message: err.message } }));
  }
}

class ChannelStub { on() { return this; } subscribe() { return this; } }

const DB = {
  _isSavingAveria: false,

  supabase: {
    from(t)   { return new GASQueryBuilder(t); },
    channel() { return new ChannelStub(); },
  },

  async login(usuario, clave) {
    try {
      const rows  = await gasGet('usuarios');
      const match = rows.filter(r =>
        String(r.usuario ||'').trim().toLowerCase() === usuario.trim().toLowerCase() &&
        String(r.password||'').trim()               === clave.trim()
      );
      return match.length > 0
        ? { ok: true,  data: match[0] }
        : { ok: false, error: 'Credenciales incorrectas' };
    } catch(e) { return { ok: false, error: e.message }; }
  },

  async registrarUsuario(datos) {
    return await gasWrite('usuarios', { ...datos, created_at: new Date().toISOString() }, 'insert');
  },

  async obtenerFlota() {
    try { return { ok: true, data: await gasGet('carrozas') }; }
    catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerTrasladosRecientes(limite = 50) {
    try {
      let data = await gasGet('Traslado');
      data.sort((a,b) => String(b.fecha||'').localeCompare(String(a.fecha||'')));
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerTodasAverias(limite = 20) {
    try {
      let data = await gasGet('Averias');
      data.sort((a,b) => String(b.created_at||b.fecha||'').localeCompare(String(a.created_at||a.fecha||'')));
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerMantenimientos(limite = 50) {
    try {
      let data = await gasGet('mantenimientos');
      data.sort((a,b) => String(b.fecha||'').localeCompare(String(a.fecha||'')));
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  // ── GUARDAR TRASLADO (INSERT) ──────────────────────────────
  async guardarTraslado(d) {
    const fila = {
      id_salida:              'S-' + Date.now(),
      fecha:                  fechaHoy(),
      regional:               d.regional              || '',
      conductor:              d.conductor             || '',
      nnum_telefono:          d.nnum_telefono         || '',
      placa:                  d.placa                 || '',
      motivo_de_salida:       d.motivo                || '',
      nombre_del_fallecido:   d.fallecido             || '',
      clinica_hospital_o_rsd: d.clinica               || '',
      numero_prestacion:      d.prestacion            || '',
      origen:                 d.origen                || '',
      destino:                d.destino               || '',
      hora_de_salida:         d.hora_salida           || '',
      hora_de_ingreso:        '',
      km__salida:             d.km_salida             || '',
      km__ingreso:            '',
      total_km:               '',
      coordinador_en_turno:   d.coordinador           || '',
      observaciones:          d.observaciones         || '',
      imagen1:                d.imagen1               || '',
      firma:                  d.firma                 || '',
      imagen2:                d.imagen2               || '',
      imagen3:                d.imagen3               || '',
      imagen4:                d.imagen4               || '',
      kit_carretera:          d.kit_carretera         || '',
    };
    const res = await gasWrite('Traslado', fila, 'insert');
    if (res.ok) {
      await this.actualizarCarroza(d.placa, {
        estado: 'En Servicio',
        kilometraje_actual: parseInt(d.km_salida) || 0
      });
    }
    return res;
  },

  // ── ACTUALIZAR TRASLADO (UPDATE / MODO EDICIÓN) ────────────
  // Busca la fila por id_salida y sobreescribe los campos editables.
  // Los campos hora_de_ingreso, km__ingreso y total_km NO se tocan
  // para no romper el registro de llegada si ya fue completado.
  async actualizarTraslado(idSalida, d) {
    try {
      const campos = {
        regional:               d.regional     || '',
        conductor:              d.conductor    || '',
        nnum_telefono:          d.nnum_telefono|| '',
        placa:                  d.placa        || '',
        motivo_de_salida:       d.motivo       || '',
        nombre_del_fallecido:   d.fallecido    || '',
        clinica_hospital_o_rsd: d.clinica      || '',
        numero_prestacion:      d.prestacion   || '',
        origen:                 d.origen       || '',
        destino:                d.destino      || '',
        hora_de_salida:         d.hora_salida  || '',
        km__salida:             d.km_salida    || '',
        coordinador_en_turno:   d.coordinador  || '',
        observaciones:          d.observaciones|| '',
        imagen1:                d.imagen1      || '',
        imagen2:                d.imagen2      || '',
        imagen3:                d.imagen3      || '',
        imagen4:                d.imagen4      || '',
        firma:                  d.firma        || '',
        kit_carretera:          d.kit_carretera|| '',
      };
      // Usa id_salida como clave de búsqueda (la columna que identifica la fila)
      const res = await gasWrite('Traslado', campos, 'update', 'id_salida', idSalida);
      if (res.ok) {
        // También actualiza el kilometraje en la carroza
        await this.actualizarCarroza(d.placa, {
          kilometraje_actual: parseInt(d.km_salida) || 0
        });
      }
      return res;
    } catch(e) {
      return { ok: false, error: e.message };
    }
  },

  // ── VERIFICAR DUPLICADO ────────────────────────────────────
  // Revisa si ya existe un traslado activo (sin hora_de_ingreso)
  // para la placa indicada en el día de hoy.
  // Retorna: { existe: bool, id_salida: string|null, detalle: objeto|null }
  async verificarDuplicadoSalida(placa) {
    try {
      const hoy  = fechaHoy();                         // "DD/MM/YYYY"
      const rows = await gasGet('Traslado');

      const activos = rows.filter(r =>
        String(r.placa    ||'').trim().toUpperCase() === placa.trim().toUpperCase() &&
        String(r.fecha    ||'').trim()               === hoy &&
        (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '')
      );

      if (activos.length === 0) return { existe: false, id_salida: null, detalle: null };

      // Toma el más reciente si hay más de uno
      activos.sort((a,b) => String(b.hora_de_salida||'').localeCompare(String(a.hora_de_salida||'')));
      const reg = activos[0];
      return {
        existe:    true,
        id_salida: reg.id_salida || null,
        detalle:   reg,
      };
    } catch(e) {
      return { existe: false, id_salida: null, detalle: null };
    }
  },

  // ── GUARDAR LLEGADA ────────────────────────────────────────
  async guardarLlegada(d) {
    const fila = {
      id:             'L-' + Date.now(),
      fecha:          fechaHoy(),
      hora_ingreso:   d.hora_ingreso   || '',
      placa:          d.placa          || '',
      km_ingreso:     d.km_ingreso     || '',
      total_km:       d.total_km       || '',
      estado_entrega: d.estado_entrega || '',
      observaciones:  d.observaciones  || '',
      recibido_por:   d.recibido_por   || '',
      created_at:     new Date().toISOString(),
    };
    const res = await gasWrite('Llegadas', fila, 'insert');
    if (res.ok) {
      await this.actualizarCarroza(d.placa, {
        estado: 'Disponible',
        kilometraje_actual: parseInt(d.km_ingreso) || 0
      });
    }
    return res;
  },

  // ── GUARDAR AVERÍA ─────────────────────────────────────────
  async guardarAveria(d) {
    if (this._isSavingAveria) return { ok: false, error: 'Ya hay un proceso en curso' };
    this._isSavingAveria = true;
    try {
      const fila = {
        id:                   'AV-' + Date.now(),
        reportado_por:        d.reportado_por        || '',
        regional:             d.regional             || '',
        placa_vehiculo:       d.placa_vehiculo        || '',
        tipo_vehiculo:        d.tipo_vehiculo         || '',
        tipo_falla:           d.tipo_falla            || '',
        descripcion_sintomas: d.descripcion_sintomas  || '',
        observaciones:        d.observaciones         || '',
        imagen1:              d.imagen1               || '',
        imagen2:              d.imagen2               || '',
        imagen3:              d.imagen3               || '',
        imagen4:              d.imagen4               || '',
        created_at:           new Date().toISOString(),
      };
      const res = await gasWrite('Averias', fila, 'insert');
      if (res.ok) {
        await this.actualizarCarroza(d.placa_vehiculo, { estado: 'En Taller' });
        const h        = new Date();
        const fechaISO = h.getFullYear() + '-' + (h.getMonth()+1).toString().padStart(2,'0') + '-' + h.getDate().toString().padStart(2,'0');
        const filaMant = {
          fecha:               fechaISO,
          placa:               d.placa_vehiculo,
          tipo_servicio:       'Avería — ' + (d.tipo_falla || 'Falla mecánica'),
          kilometraje_servicio: 0,
          costo:               0,
          taller:              'Por asignar',
          responsable:         d.reportado_por,
          observaciones:       `🚨 ORDEN POR AVERÍA\nSíntomas: ${d.descripcion_sintomas}\nReportado por: ${d.reportado_por}`,
          km_proximo_cambio:   0,
          estado_orden:        'pendiente'
        };
        await gasWrite('mantenimientos', filaMant, 'insert');
      }
      return res;
    } catch(e) {
      return { ok: false, error: e.message };
    } finally {
      this._isSavingAveria = false;
    }
  },

  async actualizarCarroza(placa, campos) {
    return await gasWrite('carrozas', campos, 'update', 'placa', placa);
  },

  async insertar(hoja, datos) {
    return await gasWrite(hoja, datos, 'insert');
  },

  async actualizar(hoja, datos, idCol, idValue) {
    return await gasWrite(hoja, datos, 'update', idCol, idValue);
  },

  async testConexion() {
    try {
      const resp = await fetch(URL_GAS, { method: 'GET', redirect: 'follow' });
      const json = await resp.json();
      return { ok: true, mensaje: json.mensaje || JSON.stringify(json) };
    } catch(e) { return { ok: false, error: e.message }; }
  },

  async obtenerLogo() {
    try {
      const rows = await gasGet('config');
      const fila = rows.find(r => String(r.clave||'').trim() === 'logo_app');
      return { ok: true, logo: (fila && fila.valor && fila.valor.length > 10) ? fila.valor : null };
    } catch(e) { return { ok: false, logo: null, error: e.message }; }
  },

  async guardarLogo(base64) {
    try {
      const rows   = await gasGet('config');
      const existe = rows.find(r => String(r.clave||'').trim() === 'logo_app');
      if (existe) return await gasWrite('config', { valor: base64 }, 'update', 'clave', 'logo_app');
      else        return await gasWrite('config', { clave: 'logo_app', valor: base64 }, 'insert');
    } catch(e) { return { ok: false, error: e.message }; }
  },

  async eliminarLogo() {
    return await gasWrite('config', { valor: '' }, 'update', 'clave', 'logo_app');
  },

};

window.DB = DB;

DB.testConexion().then(r => {
  if (r.ok) console.log("🟢 API J.R. conectada:", r.mensaje);
  else      console.warn("🔴 API J.R. sin conexión:", r.error);
});
