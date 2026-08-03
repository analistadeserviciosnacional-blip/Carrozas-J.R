/**
 * ══════════════════════════════════════════════════════════
 *  CONECTOR J.R. CARROZAS — db.js  v12.13
 *
 *  🆕 CAMBIOS v12.13 (Tanqueo — nivel observado + alerta de innecesario):
 *
 *  El formulario de Tanqueo ahora manda 3 campos nuevos, que se
 *  guardan tal cual en la hoja "Tanqueo":
 *
 *    - NIVEL_OBSERVADO      → nivel de combustible que la persona vio
 *                             a simple vista ANTES de tanquear
 *                             (Vacío/Reserva, 1/4, Medio, 3/4, Lleno).
 *    - POSIBLE_INNECESARIO  → "SI" / "NO". Lo calcula el propio
 *                             formulario: se marca "SI" cuando, al
 *                             momento de tanquear, el sistema calcula
 *                             que a la carroza le queda más del 80%
 *                             de combustible (no se ha consumido ni
 *                             el 20% mínimo esperado), o cuando el
 *                             nivel observado fue "3/4" o "Lleno".
 *    - MOTIVO_INNECESARIO   → texto plano explicando cuál de esas
 *                             condiciones se cumplió (puede venir
 *                             vacío si POSIBLE_INNECESARIO = "NO").
 *
 *  ⚠️ IMPORTANTE: para que estos 3 valores queden guardados hay que
 *  agregar las columnas NIVEL_OBSERVADO, POSIBLE_INNECESARIO y
 *  MOTIVO_INNECESARIO en la hoja de cálculo "Tanqueo" (incluso vacías,
 *  con solo el encabezado). Si la columna no existe en la hoja, el
 *  backend (Apps Script) simplemente ignora ese valor al insertar.
 *
 *  No se toca la lógica de combustible/rendimiento existente — estos
 *  3 campos son puramente informativos, para poder filtrar después
 *  en el historial o en un reporte los tanqueos marcados como
 *  posiblemente innecesarios.
 *
 *  (Se conserva íntegro todo lo demás de v12.12 — nada de lo que ya
 *   funcionaba fue tocado.)
 *
 *  ── Historial v12.11 (Notificaciones por regional — corrección) ──
 *
 *  La hoja "notificaciones_apoyo" traía el campo `alcance` guardado
 *  de dos formas distintas según qué parte del código insertó la
 *  fila:
 *    - a veces la palabra literal "regional"
 *    - a veces el NOMBRE de una regional (ej. "Pereira"), por un bug
 *      histórico en el código que la creaba
 *  Esto hacía que el filtrado en las pantallas (panel_coordinador,
 *  etc.) fuera frágil: según cómo estuviera escrito el filtro, una
 *  regional podía no ver sus propias notificaciones, o (peor) ver
 *  las de otra regional.
 *
 *  Se agregan 3 métodos centralizados y usados desde ahora en TODAS
 *  las pantallas que necesiten notificaciones, para que exista un
 *  solo lugar con la lógica de filtrado (y no uno distinto por
 *  pantalla):
 *
 *    - DB.obtenerNotificaciones(regional, opts)
 *        Lee, de forma tolerante con el dato heredado, SOLO las
 *        notificaciones de la regional indicada (+ las de alcance
 *        global/nacional/todas). Nunca cruza regionales entre sí.
 *    - DB.crearNotificacion(d)
 *        Crea notificaciones SIEMPRE en el formato correcto
 *        (alcance:'regional' + regional:d.regional), para que el
 *        dato sucio deje de crecer hacia adelante.
 *    - DB.marcarNotificacionLeida(id)
 *        Marca una notificación puntual como leída.
 *
 *  ── Historial v12.10 (Averías Recientes — corrección de fuente) ──
 *
 *  Antes, el panel de "Averías Recientes" del dashboard leía de la
 *  hoja "Averias" (los reportes creados desde el formulario de
 *  Avería), pero esa hoja no reflejaba el estado real y actualizado
 *  del parque automotor, así que el panel aparecía vacío.
 *
 *  Se agrega obtenerAveriasDesdeFlota(), que lee la hoja "carrozas" y
 *  toma todas las filas cuyo campo estado_parque_automotor indique
 *  una novedad (cualquier valor que no sea "Disponible"/"Operativo"/
 *  vacío — ver ESTADOS_SIN_NOVEDAD). El detalle de cada novedad
 *  (descripción, taller, fecha) se toma de las columnas historial_*
 *  que ya vienen en esa MISMA fila de "carrozas":
 *      - historial_novedad_completa → detalle de la última novedad
 *      - historial_taller_nombre    → taller donde está/estuvo
 *      - historial_fecha            → fecha de esa actualización
 *      - sede_parque_automotor      → sede donde está la carroza
 *      - dias_en_taller_parque      → días que lleva en taller
 *
 *  dashboard.html llama a DB.obtenerAveriasDesdeFlota() en vez de
 *  DB.obtenerTodasAverias() para pintar "Averías Recientes".
 *  DB.obtenerTodasAverias() se conserva intacta (sigue leyendo de la
 *  hoja "Averias") por si otra pantalla la sigue usando.
 *
 *  ── Historial v12.8 (alimentar Checklist_Salida desde Llegadas) ──
 *
 *  Ahora, al guardar una Llegada, el sistema busca automáticamente
 *  el registro de "Checklist_Salida" de esa misma placa que quedó
 *  pendiente (sin HORA_ENTRADA) y le completa:
 *      - HORA_ENTRADA   = hora_ingreso de la Llegada
 *      - KM_ENTRADA     = km_ingreso de la Llegada
 *      - KM_RECORRIDOS  = total_km de la Llegada
 *
 *  No se le pide nada nuevo al conductor: el formulario de "Registro
 *  de Llegada" sigue funcionando exactamente igual que antes; esta
 *  actualización ocurre puertas adentro, dentro de guardarLlegada().
 *
 *  Cómo se enlaza: se busca por PLACA el Checklist_Salida más
 *  reciente (por FECHA + HORA_SALIDA) que tenga HORA_ENTRADA vacío —
 *  el mismo patrón que ya se usaba para detectar Traslados abiertos.
 *  Si por algún motivo no se encuentra, o falla la escritura, NO se
 *  bloquea el guardado de la Llegada (que ya se guardó exitosamente
 *  antes de intentar esto) — solo se deja advertencia en consola y
 *  en el resultado (`checklist_actualizado: false`) para que la
 *  pantalla lo pueda mostrar como aviso no crítico.
 *
 *  Nueva hoja registrada en SHEET_MAP: 'Checklist_Salida'.
 *
 *  ── Historial v12.7 (anti-duplicados en SALIDA y LLEGADA) ──
 *
 *  Problema detectado: en la hoja "Traslado" aparecieron dos filas
 *  con el MISMO id_salida (S-1783983171345, placa HWT 515) y además
 *  una tercera fila casi idéntica con id_salida distinto pero mismos
 *  datos (misma placa, conductor, hora de salida y motivo), 55
 *  segundos después. Como una de esas filas quedó sin
 *  hora_de_ingreso, el selector de "Registro de Llegada" seguía
 *  marcando la placa como "servicio sin cerrar" días después, aunque
 *  la carroza ya había regresado y vuelto a salir varias veces.
 *
 *  Causa: no existía ninguna verificación — ni por placa activa ni
 *  por contenido — antes de insertar una Salida nueva. Un reintento
 *  del conductor (por creer que el primer guardado falló) terminaba
 *  creando una segunda fila de Salida para el mismo viaje real.
 *
 *  Corrección — 2 guardas nuevas antes de CADA guardado:
 *
 *   1) guardarTraslado(d):
 *      GUARDA 1 — No permite abrir una Salida nueva para una placa
 *      que YA tiene una Salida activa (sin Llegada registrada). Se
 *      responde con { ok:false, duplicado:true, tipo:'salida_activa',
 *      existente:{...} } y un mensaje claro con el id_salida y la
 *      hora del viaje que sigue abierto, para que el formulario lo
 *      muestre al usuario en vez de crear un registro nuevo.
 *
 *      GUARDA 2 — Si los datos del formulario (placa + conductor +
 *      fecha + hora_salida + motivo) coinciden EXACTO con un
 *      Traslado ya existente (esté abierto o cerrado), se asume que
 *      es un doble envío del mismo formulario y NO se inserta una
 *      fila nueva — se reutiliza el id_salida existente
 *      ({ ok:true, data:{yaGuardado:true}, id_salida, duplicado:true }).
 *
 *   2) guardarLlegada(d):
 *      Si ya existe una Llegada guardada con el mismo id_salida, NO
 *      se vuelve a insertar (evita duplicar el cierre de un mismo
 *      Traslado por un reintento manual de "Finalizar Servicio" tras
 *      un timeout que sí había llegado a guardar en el servidor).
 *      Responde { ok:true, data:{yaGuardado:true}, duplicado:true }.
 *
 *  Estas verificaciones siempre leen la hoja SIN caché (se invalida
 *  antes de consultar), para no dar falsos negativos por datos
 *  desactualizados en memoria.
 *
 *  ── Historial v12.6 ──
 *  + guardarTanqueo(d) ahora sí envía FORMA_PAGO y TIPO_COMBUSTIBLE
 *    al backend (antes se descartaban en silencio).
 *
 *  ── Historial v12.5 ──
 *  + obtenerPlacasConTrasladoActivo(): nueva fuente de verdad para el
 *    selector "Elija placa..." del formulario de Llegada, construida
 *    directamente desde la hoja "Traslado" (filas sin hora_de_ingreso
 *    y sin Llegada ya guardada para ese id_salida), en vez de depender
 *    del campo estado de la hoja "carrozas".
 *  + guardarLlegada() ahora ESPERA (await) la actualización de
 *    kilometraje_actual / combustible_galones de la carroza antes de
 *    responder, y deja un error explícito en consola si falla (antes
 *    era fire-and-forget y podía fallar en silencio, descuadrando el
 *    Total KM del siguiente Traslado).
 *
 *  ── Historial v12.4 ──
 *  + Módulo de Tanqueo (guardarTanqueo / obtenerTanqueos) con los
 *    campos reales del formulario (Ciudad, N° factura, Foto de la
 *    tirilla, etc.)
 *  + Medidor de combustible por carroza. Se asume que cada tanqueo
 *    llena el tanque, así que:
 *      - Al guardar un Tanqueo → combustible_galones vuelve al 100%
 *        (capacidad_galones) y se calcula el rendimiento real
 *        (km recorridos desde el tanqueo anterior ÷ galones).
 *      - Al guardar una Llegada → se descuenta del tanque el consumo
 *        estimado de ESE viaje (km del viaje ÷ rendimiento conocido
 *        de la carroza, o 25 km/gal por defecto si aún no hay
 *        historial).
 *  + obtenerEstadoCarroza(placa) — combina combustible, alerta de
 *    rendimiento (🟢/🟡/🔴) y estado del próximo cambio de aceite
 *    (usando la hoja "mantenimientos") en un solo objeto.
 *  + Repuesta la capa de compatibilidad con Supabase
 *    (DB.supabase.from(...)) — otras páginas (dashboard,
 *    panel_coordinador, panel_conductor) sí la necesitaban.
 *  + Anti-duplicados: antes de reintentar un INSERT por timeout,
 *    verifica si la fila ya quedó guardada — si ya existe, NO
 *    vuelve a insertar.
 *  + Bloqueo contra doble click en guardarTraslado/Llegada/Averia/Tanqueo.
 *  + Guardado directo: confirma apenas la escritura principal
 *    responde OK, sin esperar a las actualizaciones secundarias
 *    que no afectan la corrección del dato (p.ej. cierre del
 *    Traslado, que ahora tiene su propio respaldo por Llegadas).
 *  + Caché en memoria con TTL para lecturas
 *  + Deduplicación de lecturas en vuelo
 *  + Timeout largo en escrituras + 1 reintento automático
 *  + Warm-up secuencial al cargar
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
  'Tanqueo':              'Tanqueo',
  'Inspeccion_Vehiculo':  'Inspeccion_Vehiculo',
  'Checklist_Salida':     'Checklist_Salida',
};

function resolveSheet(name) { return SHEET_MAP[name] || name; }

function fechaHoy() {
  const h = new Date();
  return h.getDate().toString().padStart(2,'0') + '/' +
         (h.getMonth()+1).toString().padStart(2,'0') + '/' +
         h.getFullYear();
}

// ── NORMALIZADOR DE TEXTO GENÉRICO (usado para comparar placas y
//    nombres de columna sin depender de mayúsculas, tildes o
//    guiones/espacios) ──────────────────────────────────────────
function normTexto(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}
function normClave(s) {
  return normTexto(s).replace(/[^a-z0-9]/g, '');
}

// ── CLAVE DE ORDEN CRONOLÓGICO REAL ───────────────────────
// Convierte fecha "DD/MM/AAAA" (+ hora opcional "HH:MM") en un
// número AAAAMMDDHHMM comparable. Antes se ordenaba con
// localeCompare sobre el texto tal cual, lo cual es incorrecto
// para fechas en formato DD/MM (p.ej. "12/01/2026" ordenaba
// como más reciente que "05/07/2026" por comparación de texto).
function claveOrden(registro) {
  const f = String((registro && registro.fecha) || '').trim();
  const partes = f.split('/');
  let aaaammdd = '00000000';
  if (partes.length === 3) {
    const dd = partes[0].padStart(2, '0');
    const mm = partes[1].padStart(2, '0');
    const aaaa = partes[2].length === 4 ? partes[2] : ('20' + partes[2]).slice(-4);
    aaaammdd = aaaa + mm + dd;
  }
  const hora = String((registro && (registro.hora_de_salida || registro.hora_ingreso || '')) || '').replace(':', '').padStart(4, '0');
  return parseInt(aaaammdd + hora, 10) || 0;
}

// ── MISMA IDEA, PERO PARA LA HOJA "Tanqueo" (encabezados en MAYÚSCULA) ──
function claveOrdenTanqueo(registro) {
  const f = String((registro && registro.FECHA) || '').trim();
  const partes = f.split('/');
  let aaaammdd = '00000000';
  if (partes.length === 3) {
    const dd = partes[0].padStart(2, '0');
    const mm = partes[1].padStart(2, '0');
    const aaaa = partes[2].length === 4 ? partes[2] : ('20' + partes[2]).slice(-4);
    aaaammdd = aaaa + mm + dd;
  }
  const hora = String((registro && registro.HORA) || '').replace(':', '').padStart(4, '0');
  return parseInt(aaaammdd + hora, 10) || 0;
}

// 🆕 v12.8 — MISMA IDEA, PERO PARA LA HOJA "Checklist_Salida"
// (encabezados en MAYÚSCULA, y la columna de hora de salida se llama
// HORA_SALIDA en vez de HORA como en Tanqueo).
function claveOrdenChecklist(registro) {
  const f = String((registro && registro.FECHA) || '').trim();
  const partes = f.split('/');
  let aaaammdd = '00000000';
  if (partes.length === 3) {
    const dd = partes[0].padStart(2, '0');
    const mm = partes[1].padStart(2, '0');
    const aaaa = partes[2].length === 4 ? partes[2] : ('20' + partes[2]).slice(-4);
    aaaammdd = aaaa + mm + dd;
  }
  const hora = String((registro && registro.HORA_SALIDA) || '').replace(':', '').padStart(4, '0');
  return parseInt(aaaammdd + hora, 10) || 0;
}

// ── TIMEOUT HELPER ─────────────────────────────────────────
function fetchConTimeout(url, opciones, ms) {
  if (ms === undefined) ms = 15000;
  if (opciones === undefined) opciones = {};
  const controller = new AbortController();
  const timer = setTimeout(function() {
    controller.abort(new Error('TIMEOUT_' + ms + 'ms'));
  }, ms);
  return fetch(url, Object.assign({}, opciones, { signal: controller.signal }))
    .catch(function(err) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        const e = new Error('El servidor tardó demasiado en responder (más de ' + Math.round(ms/1000) + 's). Verifica tu conexión e intenta nuevamente.');
        e.isTimeout = true;
        throw e;
      }
      throw err;
    })
    .finally(function() { clearTimeout(timer); });
}

// ── CACHÉ EN MEMORIA (solo lecturas) ──────────────────────
const _cache    = {};      // { sheetName: { data, ts } }
const _inflight = {};      // { sheetName: Promise }
const CACHE_TTL = 60000;   // 60 segundos

async function gasGet(sheetName) {
  const key = resolveSheet(sheetName);

  const cached = _cache[key];
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return cached.data;
  }

  if (_inflight[key]) return _inflight[key];

  _inflight[key] = (async () => {
    try {
      const url  = `${URL_GAS}?sheetName=${encodeURIComponent(key)}`;
      const resp = await fetchConTimeout(url, { method: 'GET', redirect: 'follow' }, 15000);
      if (!resp.ok) { console.warn(`gasGet ${sheetName}: HTTP ${resp.status}`); return []; }
      const json = await resp.json();
      if (json && json.error) { console.warn(`gasGet ${sheetName}: ${json.error}`); return []; }
      const data = Array.isArray(json) ? json : [];
      _cache[key] = { data, ts: Date.now() };
      return data;
    } catch (err) {
      console.warn(`gasGet ${sheetName} error (${err.name}):`, err.message);
      return [];
    } finally {
      delete _inflight[key];
    }
  })();

  return _inflight[key];
}

// ── VERIFICAR SI UNA FILA YA QUEDÓ GUARDADA ───────────────
async function existeFila(sheetName, col, val) {
  if (!col || val === undefined || val === null || val === '') return false;
  try {
    const key = resolveSheet(sheetName);
    delete _cache[key];
    delete _inflight[key];
    const rows = await gasGet(sheetName);
    return rows.some(function(r) { return String(r[col] || '') === String(val); });
  } catch (e) {
    return false;
  }
}

// ── ESCRITURA con timeout largo ───────────────────────────
async function gasWriteIntento(sheetName, payload, action, idCol, idValue, ms) {
  const urlParams = new URLSearchParams({ sheetName: resolveSheet(sheetName), action });
  if (idCol)   urlParams.set('idCol',   idCol);
  if (idValue) urlParams.set('idValue', idValue);
  const url = `${URL_GAS}?${urlParams}`;

  const resp = await fetchConTimeout(url, {
    method:  'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain' },
    body:    JSON.stringify(payload),
  }, ms);

  if (!resp.ok) { return { ok: false, error: `HTTP ${resp.status}` }; }
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); }
  catch(e) { return { ok: false, error: 'Respuesta no JSON: ' + text.substring(0, 200) }; }
  if (json.ok === false) { return { ok: false, error: json.error || 'Error desconocido' }; }
  return { ok: true, data: json };
}

// ── ESCRITURA con anti-duplicado + 1 reintento automático ─
async function gasWrite(sheetName, payload, action, idCol, idValue) {
  if (action   === undefined) action   = 'insert';
  if (idCol    === undefined) idCol    = '';
  if (idValue  === undefined) idValue  = '';

  const checkCol = (action === 'insert')
    ? (payload.id_salida !== undefined ? 'id_salida' : (payload.id !== undefined ? 'id' : (payload.ID !== undefined ? 'ID' : null)))
    : null;
  const checkVal = checkCol ? payload[checkCol] : null;

  try {
    return await gasWriteIntento(sheetName, payload, action, idCol, idValue, 60000);
  } catch (err) {
    if (!err.isTimeout) {
      console.error('gasWrite excepción:', err);
      return { ok: false, error: err.message };
    }

    console.warn(`gasWrite ${sheetName}: timeout en intento 1.`);

    if (checkCol) {
      const yaExiste = await existeFila(sheetName, checkCol, checkVal);
      if (yaExiste) {
        console.log(`gasWrite ${sheetName}: la fila ya se había guardado, no se reinserta.`);
        return { ok: true, data: { yaGuardado: true } };
      }
    }

    console.warn(`gasWrite ${sheetName}: reintentando con más tiempo…`);
    try {
      const res2 = await gasWriteIntento(sheetName, payload, action, idCol, idValue, 90000);
      return res2;
    } catch (err2) {
      if (err2.isTimeout && checkCol) {
        const yaExiste2 = await existeFila(sheetName, checkCol, checkVal);
        if (yaExiste2) {
          console.log(`gasWrite ${sheetName}: la fila ya se había guardado (2do intento), no se reinserta.`);
          return { ok: true, data: { yaGuardado: true } };
        }
      }
      console.error('gasWrite excepción (reintento):', err2);
      return { ok: false, error: err2.message };
    }
  }
}

// ── ACTUALIZACIÓN SECUNDARIA EN SEGUNDO PLANO ─────────────
// (Solo para procesos que NO son fuente de verdad para el próximo
// servicio, p.ej. el cierre "cosmético" del Traslado — el KM real
// de la carroza ya no depende de esto, ver guardarLlegada v12.5.)
function actualizarEnSegundoPlano(promesa, etiqueta) {
  promesa
    .then(function(res) {
      if (!res.ok) console.warn(`(${etiqueta}) falló en segundo plano:`, res.error);
    })
    .catch(function(err) {
      console.warn(`(${etiqueta}) excepción en segundo plano:`, err.message);
    });
}

// ── BLOQUEO CONTRA DOBLE CLICK ────────────────────────────
const _locks = {};
async function conLock(nombre, fn) {
  if (_locks[nombre]) {
    return { ok: false, error: 'Ya hay un guardado en curso, espera a que termine.' };
  }
  _locks[nombre] = true;
  try {
    return await fn();
  } finally {
    delete _locks[nombre];
  }
}

// ══════════════════════════════════════════════════════════
// 🆕 v12.7 — GUARDAS ANTI-DUPLICADO (SALIDA Y LLEGADA)
// ══════════════════════════════════════════════════════════
// Estas funciones siempre invalidan la caché antes de leer, para no
// dar un falso "no existe" por datos desactualizados en memoria.

// Busca si la placa YA tiene una Salida activa (sin hora_de_ingreso EN
// LA HOJA TRASLADO Y SIN UNA LLEGADA YA GUARDADA). Se usa para impedir
// abrir una segunda Salida mientras la anterior sigue abierta.
//
// 🆕 v12.12 — CORRECCIÓN CRÍTICA: antes esta función solo miraba el
// campo hora_de_ingreso de la propia hoja "Traslado". Pero
// guardarLlegada() nunca escribía de vuelta ese campo en "Traslado"
// (solo guardaba la Llegada en su propia hoja) — así que un servicio
// con su Llegada ya registrada correctamente en "Llegadas" seguía
// apareciendo como "SERVICIO SIN CERRAR" en Registro de Salida para
// siempre, bloqueando cualquier nueva salida de esa carroza.
// Ahora se cruza contra "Llegadas" (igual que ya hacía
// obtenerPlacasConTrasladoActivo) — si existe una Llegada para ese
// id_salida, el traslado NO se considera abierto, sin importar lo
// que diga el campo hora_de_ingreso de "Traslado".
async function buscarTrasladoAbiertoPorPlaca(placa) {
  const pSel = String(placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!pSel) return null;
  DB.invalidarCache('Traslado');
  DB.invalidarCache('Llegadas');
  const [rows, llegadas] = await Promise.all([gasGet('Traslado'), gasGet('Llegadas')]);

  const idsConLlegada = new Set(
    llegadas.map(function(l) { return String(l.id_salida || '').trim(); }).filter(Boolean)
  );

  const abiertos = rows.filter(function(r) {
    const pBase = String(r.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const sinRegresoEnTraslado = (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '');
    const yaTieneLlegada = r.id_salida && idsConLlegada.has(String(r.id_salida).trim());
    return pBase === pSel && sinRegresoEnTraslado && !yaTieneLlegada;
  });
  if (!abiertos.length) return null;
  abiertos.sort(function(a, b) { return claveOrden(b) - claveOrden(a); });
  return abiertos[0];
}

// Busca si YA existe un Traslado con exactamente los mismos datos
// (misma placa + conductor + fecha + hora de salida + motivo), sin
// importar si sigue abierto o ya se cerró. Esto detecta el caso de
// un doble envío del formulario de Salida (p.ej. el conductor cree
// que falló y presiona "Guardar" de nuevo): la segunda vez genera
// un id_salida distinto (por ser Date.now()) pero el contenido es
// idéntico — antes esto producía dos filas de Salida para el mismo
// viaje real, descuadrando el kilometraje y el combustible.
async function buscarTrasladoDuplicadoPorContenido(d) {
  DB.invalidarCache('Traslado');
  const rows = await gasGet('Traslado');
  const pSel = String(d.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const norm = function(s) { return String(s || '').trim().toLowerCase(); };
  return rows.find(function(r) {
    return String(r.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pSel &&
           norm(r.conductor)        === norm(d.conductor) &&
           norm(r.fecha)            === norm(fechaHoy()) &&
           norm(r.hora_de_salida)   === norm(d.hora_salida) &&
           norm(r.motivo_de_salida) === norm(d.motivo);
  }) || null;
}

// Busca si YA existe una Llegada guardada para este id_salida — evita
// duplicar el cierre de un mismo Traslado (p.ej. reintento manual de
// "Finalizar Servicio" tras un timeout que sí alcanzó a guardar en
// el servidor, o un doble click que sorteó el bloqueo de la sesión).
async function buscarLlegadaPorIdSalida(idSalida) {
  if (!idSalida) return null;
  DB.invalidarCache('Llegadas');
  const rows = await gasGet('Llegadas');
  return rows.find(function(r) { return String(r.id_salida || '').trim() === String(idSalida).trim(); }) || null;
}

// ══════════════════════════════════════════════════════════
// 🆕 v12.8 — ENLACE CON Checklist_Salida
// ══════════════════════════════════════════════════════════
// Busca el Checklist_Salida más reciente de esta placa que todavía NO
// tenga HORA_ENTRADA (es decir, "pendiente de llegada"). Es la misma
// idea que buscarTrasladoAbiertoPorPlaca, aplicada a esta hoja, para
// poder completar HORA_ENTRADA / KM_ENTRADA / KM_RECORRIDOS al cerrar
// el servicio en "Registro de Llegada" sin pedirle nada nuevo al
// conductor.
async function buscarChecklistAbiertoPorPlaca(placa) {
  const pSel = String(placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!pSel) return null;
  DB.invalidarCache('Checklist_Salida');
  const rows = await gasGet('Checklist_Salida');
  const abiertos = rows.filter(function(r) {
    const pBase = String(r.PLACA || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const sinEntrada = (r.HORA_ENTRADA === undefined || r.HORA_ENTRADA === null || String(r.HORA_ENTRADA).trim() === '');
    return pBase === pSel && sinEntrada;
  });
  if (!abiertos.length) return null;
  abiertos.sort(function(a, b) { return claveOrdenChecklist(b) - claveOrdenChecklist(a); });
  return abiertos[0];
}

// ══════════════════════════════════════════════════════════
// 🆕 v12.10 — AVERÍAS RECIENTES DESDE "carrozas"
// ══════════════════════════════════════════════════════════
const ESTADOS_SIN_NOVEDAD = ['disponible', 'operativo', 'operativa', 'ok', 'activo', 'activa', 'bien', ''];

// ══════════════════════════════════════════════════════════
//  COMBUSTIBLE Y RENDIMIENTO
// ══════════════════════════════════════════════════════════

const CAPACIDAD_TANQUE_DEFAULT = 55;

const CAPACIDAD_POR_MODELO = [
  { patron: /ssangyong|rodius|stavic/i,              galones: 21.1, fuente: 'SsangYong Rodius/Stavic — tanque 80 L (Wikipedia/ficha oficial)' },
  { patron: /chevrolet\s*hhr|\bhhr\b/i,               galones: 16.1, fuente: 'Chevrolet HHR — tanque 61 L (fichas técnicas oficiales)' },
  { patron: /chevrolet\s*(van\s*)?n[34]00|^\s*n400\b/i, galones: 13.2, fuente: 'Chevrolet N300/N400 — tanque 50 L' },
  { patron: /\bdfsk\b/i,                              galones: 10.6, fuente: 'DFSK C35/C37 — tanque 10.6 gal (ficha DFSK Colombia)' },
  { patron: /chery/i,                                 galones: 9.2,  fuente: 'Chery QQ/Yoya — tanque 35 L' },
  { patron: /suzuki\s*ertiga|ertiga/i,                galones: 11.9, fuente: 'Suzuki Ertiga — tanque 45 L (ficha oficial)' },
  { patron: /volkswagen|saveiro/i,                    galones: 14.5, fuente: 'Volkswagen Saveiro — tanque 55 L (ficha oficial VW)' },
  { patron: /peugeot\s*partner|partner/i,             galones: 15.9, fuente: 'Peugeot Partner — tanque ~60 L (estimado)' },
  { patron: /chevrolet\s*luv|\bluv\b/i,               galones: 15.3, fuente: 'Chevrolet LUV (pickup) — tanque ~58 L (estimado)' },
  { patron: /toyota\s*hilux|hilux/i,                  galones: 18.5, fuente: 'Toyota Hilux — tanque ~70 L (estimado, gen. 1997-2005)' },
  { patron: /nissan\s*np ?300|np ?300/i,               galones: 21.1, fuente: 'Nissan NP300 — tanque 80 L (ficha oficial)' },
  { patron: /nissan\s*frontier|frontier/i,            galones: 21.1, fuente: 'Nissan Frontier — tanque ~80 L (estimado, mismo chasis que NP300)' },
  { patron: /mazda\s*5\b/i,                           galones: 15.9, fuente: 'Mazda 5 — tanque ~60 L (estimado)' },
  { patron: /mazda\s*b\b|b22cs7/i,                    galones: 15.9, fuente: 'Mazda B (pickup) — tanque ~60 L (estimado)' },
  { patron: /\brodeo\b/i,                             galones: 18.5, fuente: 'Isuzu Rodeo — tanque ~70 L (estimado)' },
];

function capacidadPorModelo(modelo) {
  const m = String(modelo || '');
  for (const regla of CAPACIDAD_POR_MODELO) {
    if (regla.patron.test(m)) return { galones: regla.galones, fuente: regla.fuente };
  }
  return null;
}

const RENDIMIENTO_DEFAULT = 25;

function nivelRendimiento(kmPorGalon) {
  const v = Number(kmPorGalon) || 0;
  if (v <= 0) return { nivel: 'sin_datos', emoji: '⚪', texto: 'Sin datos suficientes todavía' };
  if (v > 25)  return { nivel: 'verde',    emoji: '🟢', texto: 'Rendimiento normal' };
  if (v >= 20) return { nivel: 'amarillo', emoji: '🟡', texto: 'Consumo medio — vigilar' };
  return          { nivel: 'rojo',     emoji: '🔴', texto: 'Consumo alto — posible fuga, mala conducción, falla mecánica o robo de combustible' };
}

function nivelTanque(porcentaje) {
  const p = Number(porcentaje) || 0;
  if (p > 50) return '🟢';
  if (p > 20) return '🟡';
  return '🔴';
}

// ══════════════════════════════════════════════════════════
//  CAPA DE COMPATIBILIDAD ESTILO SUPABASE
// ══════════════════════════════════════════════════════════
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
  order(col, opts)    { if (!opts) opts = {}; this._orders.push({ col, asc: opts.ascending !== false }); return this; }
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
        .then(function(res) { resolve({ data: null, error: res.ok ? null : { message: res.error } }); })
        .catch(function(err) { resolve({ data: null, error: { message: err.message } }); });
      return;
    }
    if (this._updatePayload !== null) {
      const f = this._filters[0];
      if (!f) { resolve({ data: null, error: { message: 'update requiere .eq()' } }); return; }
      gasWrite(this._table, this._updatePayload, 'update', f.col, f.val)
        .then(function(res) { resolve({ data: null, error: res.ok ? null : { message: res.error } }); })
        .catch(function(err) { resolve({ data: null, error: { message: err.message } }); });
      return;
    }
    const self = this;
    gasGet(this._table)
      .then(function(rows) {
        for (const f of self._filters)
          rows = rows.filter(function(r) { return String(r[f.col]||'').trim().toLowerCase() === f.val.trim().toLowerCase(); });
        for (const f of self._isNullFilters)
          rows = rows.filter(function(r) { return r[f.col] === null || r[f.col] === undefined || String(r[f.col]).trim() === ''; });
        for (const f of self._ilikes)
          rows = rows.filter(function(r) { return String(r[f.col]||'').toLowerCase().includes(f.val); });
        for (const o of self._orders)
          rows.sort(function(a,b) { const va=String(a[o.col]||''), vb=String(b[o.col]||''); return o.asc ? va.localeCompare(vb) : vb.localeCompare(va); });
        if (self._limitN) rows = rows.slice(0, self._limitN);
        resolve(self._single
          ? { data: rows[0]||null, error: rows.length ? null : { message: 'No rows' } }
          : { data: rows, error: null });
      })
      .catch(function(err) { resolve({ data: null, error: { message: err.message } }); });
  }
}

class ChannelStub { on() { return this; } subscribe() { return this; } }

const DB = {

  supabase: {
    from(t)   { return new GASQueryBuilder(t); },
    channel() { return new ChannelStub(); },
  },

  // ── CACHÉ: INVALIDAR UNA HOJA ──────────────────────────────
  invalidarCache(sheetName) {
    const key = resolveSheet(sheetName);
    delete _cache[key];
  },

  // ── CACHÉ: PRECARGAR HOJAS ────────────────────────────────
  async prefetch() {
    const hojas = Array.from(arguments);
    await Promise.all(hojas.map(function(h) { return gasGet(h); }));
  },

  // ── LOGIN ──────────────────────────────────────────────────
  async login(usuario, clave) {
    try {
      const rows  = await gasGet('usuarios');
      const match = rows.filter(function(r) {
        return String(r.usuario ||'').trim().toLowerCase() === usuario.trim().toLowerCase() &&
               String(r.password||'').trim()               === clave.trim();
      });
      return match.length > 0
        ? { ok: true,  data: match[0] }
        : { ok: false, error: 'Credenciales incorrectas' };
    } catch(e) { return { ok: false, error: e.message }; }
  },

  async registrarUsuario(datos) {
    return await gasWrite('usuarios', Object.assign({}, datos, { created_at: new Date().toISOString() }), 'insert');
  },

  async obtenerFlota() {
    try { return { ok: true, data: await gasGet('carrozas') }; }
    catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerTrasladosRecientes(limite) {
    if (limite === undefined) limite = 50;
    try {
      let data = await gasGet('Traslado');
      data.sort(function(a,b) { return claveOrden(b) - claveOrden(a); });
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerTrasladoActivoPorPlaca(placa) {
    try {
      if (!placa) return { ok: true, data: null };
      const activo = await buscarTrasladoAbiertoPorPlaca(placa);
      return { ok: true, data: activo };
    } catch (e) {
      return { ok: false, data: null, error: e.message };
    }
  },

  async obtenerPlacasConTrasladoActivo() {
    try {
      const [traslados, llegadas, flota] = await Promise.all([
        gasGet('Traslado'), gasGet('Llegadas'), gasGet('carrozas')
      ]);

      const idsConLlegada = new Set(
        llegadas.map(function(l) { return String(l.id_salida || '').trim(); }).filter(Boolean)
      );

      const abiertos = traslados.filter(function(r) {
        const sinRegreso = (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '');
        const yaTieneLlegada = r.id_salida && idsConLlegada.has(String(r.id_salida).trim());
        return sinRegreso && !yaTieneLlegada;
      });

      const porPlaca = {};
      abiertos.forEach(function(r) {
        const pBase = String(r.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        if (!pBase) return;
        if (!porPlaca[pBase] || claveOrden(r) > claveOrden(porPlaca[pBase])) {
          porPlaca[pBase] = r;
        }
      });

      const resultado = Object.keys(porPlaca).map(function(pBase) {
        const t = porPlaca[pBase];
        const carroza = flota.find(function(c) {
          return String(c.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pBase;
        });
        return {
          placa:            t.placa || '',
          modelo:           carroza ? (carroza.modelo || '') : '',
          id_salida:        t.id_salida || '',
          km_salida:        t.km__salida || t.km_salida || '',
          fecha:            t.fecha || '',
          hora_de_salida:   t.hora_de_salida || '',
          conductor:        t.conductor || '',
          motivo_de_salida: t.motivo_de_salida || '',
          regional:         t.regional || '',
        };
      });

      resultado.sort(function(a, b) { return String(a.placa).localeCompare(String(b.placa)); });
      return { ok: true, data: resultado };
    } catch (e) {
      return { ok: false, data: [], error: e.message };
    }
  },

  async obtenerTodasAverias(limite) {
    if (limite === undefined) limite = 20;
    try {
      let data = await gasGet('Averias');
      data.sort(function(a,b) { return String(b.created_at||b.fecha||'').localeCompare(String(a.created_at||a.fecha||'')); });
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerAveriasDesdeFlota(limite) {
    if (limite === undefined) limite = 20;
    try {
      const flota = await gasGet('carrozas');

      const conNovedad = flota.filter(function(c) {
        const estado = normClave(c.estado_parque_automotor);
        return estado && !ESTADOS_SIN_NOVEDAD.includes(estado);
      });

      const resultado = conNovedad.map(function(c) {
        return {
          placa_vehiculo:   c.placa || '',
          modelo:           c.modelo || '',
          tipo_falla:       c.estado_parque_automotor || '---',
          regional:         c.sede_parque_automotor || c.sede_asignada || '',
          reportado_por:    c.historial_taller_nombre || '',
          observaciones:    c.historial_novedad_completa || '',
          fecha:            c.historial_fecha || '',
          dias_en_taller:   c.dias_en_taller_parque || '',
        };
      });

      resultado.sort(function(a, b) { return String(b.fecha || '').localeCompare(String(a.fecha || '')); });

      return { ok: true, data: resultado.slice(0, limite) };
    } catch (e) {
      return { ok: false, data: [], error: e.message };
    }
  },

  async obtenerMantenimientos(limite) {
    if (limite === undefined) limite = 50;
    try {
      let data = await gasGet('mantenimientos');
      data.sort(function(a,b) { return String(b.fecha||'').localeCompare(String(a.fecha||'')); });
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  // ══════════════════════════════════════════════════════════
  // TANQUEO
  // ══════════════════════════════════════════════════════════
  async guardarTanqueo(d) {
    return conLock('guardarTanqueo', async () => {
      try {
        const pSel = String(d.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

        const historico = await gasGet('Tanqueo');
        const anteriores = historico
          .filter(r => String(r.PLACA || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pSel)
          .sort((a, b) => claveOrdenTanqueo(b) - claveOrdenTanqueo(a));
        const anterior = anteriores[0] || null;

        const kmActual = parseFloat(d.kilometraje) || 0;
        const galones  = parseFloat(d.galones) || 0;
        let kmRecorridos = '';
        let rendimiento  = '';
        let alertaTexto  = '';

        if (anterior && parseFloat(anterior.KILOMETRAJE) > 0 && kmActual > parseFloat(anterior.KILOMETRAJE)) {
          kmRecorridos = kmActual - parseFloat(anterior.KILOMETRAJE);
          if (galones > 0) {
            rendimiento = Math.round((kmRecorridos / galones) * 10) / 10;
            alertaTexto = nivelRendimiento(rendimiento).texto;
          }
        }

        const fila = {
          ID:                   '',
          FECHA:                fechaHoy(),
          HORA:                 d.hora || new Date().toTimeString().slice(0, 5),
          CARROZA:              d.carroza || '',
          PLACA:                d.placa || '',
          CONDUCTOR:            d.conductor || '',
          NIVEL_OBSERVADO:      d.nivel_observado || '',        // 🆕 v12.13
          ESTACION_SERVICIO:    d.estacion_servicio || '',
          CIUDAD:               d.ciudad || '',
          KILOMETRAJE:          kmActual,
          GALONES:              galones,
          VALOR_GALON:          d.valor_galon || '',
          VALOR_TOTAL:          d.valor_total || '',
          NUMERO_FACTURA:       d.numero_factura || '',
          FOTO_TIRILLA:         d.foto_tirilla || '',
          OBSERVACIONES:        d.observaciones || '',
          KM_RECORRIDOS:        kmRecorridos,
          RENDIMIENTO_KM_GALON: rendimiento,
          ALERTA_RENDIMIENTO:   alertaTexto,
          FORMA_PAGO:           d.forma_pago || '',
          TIPO_COMBUSTIBLE:     d.tipo_combustible || '',
          REGIONAL:             d.regional || '',
          POSIBLE_INNECESARIO:  d.posible_innecesario || 'NO',  // 🆕 v12.13 — "SI" / "NO"
          MOTIVO_INNECESARIO:   d.motivo_innecesario  || '',    // 🆕 v12.13
        };

        const res = await gasWrite('Tanqueo', fila, 'insert');

        if (res.ok) {
          DB.invalidarCache('Tanqueo');

          // 🆕 v12.13 — Si el propio formulario marcó el tanqueo como
          // posiblemente innecesario, se avisa también a la regional
          // por notificación (igual que ya se hace con las averías),
          // para que el coordinador lo vea sin tener que revisar el
          // historial manualmente.
          if (d.posible_innecesario === 'SI') {
            actualizarEnSegundoPlano(
              DB.crearNotificacion({
                tipo: 'tanqueo_innecesario',
                titulo: '⛽ Posible tanqueo innecesario — ' + (d.placa || ''),
                cuerpo: (d.motivo_innecesario || 'El tanqueo se registró con el tanque todavía en buen nivel.') +
                        ' Conductor: ' + (d.conductor || 's/d') + '.',
                regional: d.regional || '',
                remitente: d.conductor || '',
                placa: d.placa || '',
              }),
              'crearNotificacion tras guardarTanqueo (posible innecesario)'
            );
          }

          actualizarEnSegundoPlano((async () => {
            const estado = await DB.obtenerEstadoCarroza(d.placa);
            const capacidad = (estado.ok && estado.capacidad_galones) || CAPACIDAD_TANQUE_DEFAULT;
            const r = await DB.actualizarCarroza(d.placa, {
              kilometraje_actual:        kmActual,
              combustible_galones:       capacidad,
              ultimo_rendimiento_km_gal: rendimiento || '',
            });
            DB.invalidarCache('carrozas');
            return r;
          })(), 'actualizarCarroza tras guardarTanqueo');
        }

        return Object.assign({}, res, {
          km_recorridos: kmRecorridos,
          rendimiento_km_galon: rendimiento,
          alerta_rendimiento: rendimiento ? nivelRendimiento(rendimiento) : null,
        });
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
  },

  async obtenerTanqueos(limite) {
    if (limite === undefined) limite = 50;
    try {
      let data = await gasGet('Tanqueo');
      data.sort((a, b) => claveOrdenTanqueo(b) - claveOrdenTanqueo(a));
      return { ok: true, data: data.slice(0, limite) };
    } catch (e) { return { ok: false, data: [], error: e.message }; }
  },

  // 🆕 v12.13 — Tanqueos marcados como posiblemente innecesarios,
  // para pantallas de reporte/auditoría (ej. panel_coordinador).
  async obtenerTanqueosInnecesarios(limite) {
    if (limite === undefined) limite = 50;
    try {
      let data = await gasGet('Tanqueo');
      data = data.filter(r => String(r.POSIBLE_INNECESARIO || '').trim().toUpperCase() === 'SI');
      data.sort((a, b) => claveOrdenTanqueo(b) - claveOrdenTanqueo(a));
      return { ok: true, data: data.slice(0, limite) };
    } catch (e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerEstadoCarroza(placa) {
    try {
      const [flota, mants] = await Promise.all([gasGet('carrozas'), gasGet('mantenimientos')]);
      const pSel = String(placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const carroza = flota.find(r => String(r.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pSel);
      if (!carroza) return { ok: false, error: 'Carroza no encontrada' };

      const capacidadFila = parseFloat(carroza.capacidad_galones) || 0;
      const matchModelo = capacidadFila > 0 ? null : capacidadPorModelo(carroza.modelo);
      const capacidad = capacidadFila > 0 ? capacidadFila
        : (matchModelo ? matchModelo.galones : CAPACIDAD_TANQUE_DEFAULT);
      const combustible = (carroza.combustible_galones !== undefined && String(carroza.combustible_galones).trim() !== '')
        ? parseFloat(carroza.combustible_galones)
        : capacidad;
      const porcentaje = Math.max(0, Math.min(100, Math.round((combustible / capacidad) * 100)));

      const rendimientoUltimo = parseFloat(carroza.ultimo_rendimiento_km_gal) || 0;
      const alertaRendimiento = nivelRendimiento(rendimientoUltimo);

      const ordenesAceite = mants
        .filter(m => String(m.placa || '').toUpperCase() === String(carroza.placa || '').toUpperCase()
                  && /aceite/i.test(m.tipo_servicio || '')
                  && Number(m.km_proximo_cambio) > 0)
        .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));

      const kmActual = Number(carroza.kilometraje_actual) || 0;
      let estadoAceite = { texto: 'Sin registro de cambio de aceite', emoji: '⚪', faltan: null };
      if (ordenesAceite.length) {
        const proximoCambioKm = Number(ordenesAceite[0].km_proximo_cambio);
        const faltan = proximoCambioKm - kmActual;
        if (faltan <= 0)        estadoAceite = { texto: `Cambio de aceite VENCIDO (hace ${Math.abs(faltan)} km)`, emoji: '🔴', faltan };
        else if (faltan <= 500) estadoAceite = { texto: `Próximo cambio de aceite en ${faltan} km`, emoji: '🟡', faltan };
        else                    estadoAceite = { texto: `Aceite al día (${faltan} km restantes)`, emoji: '🟢', faltan };
      }

      return {
        ok: true,
        placa: carroza.placa,
        combustible_galones: Math.round(combustible * 10) / 10,
        capacidad_galones: capacidad,
        capacidad_origen: capacidadFila > 0 ? 'registrada en carrozas' : (matchModelo ? matchModelo.fuente : 'default genérico (55 gal) — modelo no identificado'),
        porcentaje_combustible: porcentaje,
        nivel_combustible: nivelTanque(porcentaje),
        rendimiento_ultimo_km_gal: rendimientoUltimo || null,
        alerta_rendimiento: alertaRendimiento,
        kilometraje_actual: kmActual,
        estado_aceite: estadoAceite,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // ── GUARDAR TRASLADO (SALIDA) ──────────────────────────────
  async guardarTraslado(d) {
    return conLock('guardarTraslado', async () => {

      try {
        const abierto = await buscarTrasladoAbiertoPorPlaca(d.placa);
        if (abierto) {
          return {
            ok: false,
            duplicado: true,
            tipo: 'salida_activa',
            existente: abierto,
            error: `La carroza ${d.placa} ya tiene una salida activa sin cerrar ` +
                   `(${abierto.id_salida}, del ${abierto.fecha} a las ${abierto.hora_de_salida}, ` +
                   `conductor ${abierto.conductor || 's/d'}). Registra su Llegada antes de abrir una nueva salida.`
          };
        }
      } catch (e) {
        console.warn('No se pudo verificar si había una salida activa previa (se continúa igual):', e.message);
      }

      try {
        const duplicado = await buscarTrasladoDuplicadoPorContenido(d);
        if (duplicado) {
          console.warn('Salida duplicada detectada por contenido — se reutiliza el id_salida existente:', duplicado.id_salida);
          return { ok: true, data: { yaGuardado: true }, id_salida: duplicado.id_salida, duplicado: true };
        }
      } catch (e) {
        console.warn('No se pudo verificar duplicado de salida por contenido (se continúa igual):', e.message);
      }

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
        DB.invalidarCache('Traslado');
        actualizarEnSegundoPlano(
          DB.actualizarCarroza(d.placa, {
            estado: 'En Servicio',
            kilometraje_actual: parseInt(d.km_salida) || 0
          }).then((r) => { DB.invalidarCache('carrozas'); return r; }),
          'actualizarCarroza tras guardarTraslado'
        );
      }
      return res.ok ? Object.assign({}, res, { id_salida: fila.id_salida }) : res;
    });
  },

  // ── ACTUALIZAR TRASLADO ────────────────────────────────────
  async actualizarTraslado(idSalida, d) {
    return conLock('actualizarTraslado', async () => {
      try {
        const campos = {
          regional:               d.regional      || '',
          conductor:              d.conductor     || '',
          nnum_telefono:          d.nnum_telefono || '',
          placa:                  d.placa         || '',
          motivo_de_salida:       d.motivo        || '',
          nombre_del_fallecido:   d.fallecido     || '',
          clinica_hospital_o_rsd: d.clinica       || '',
          numero_prestacion:      d.prestacion    || '',
          origen:                 d.origen        || '',
          destino:                d.destino       || '',
          hora_de_salida:         d.hora_salida   || '',
          km__salida:             d.km_salida     || '',
          coordinador_en_turno:   d.coordinador   || '',
          observaciones:          d.observaciones || '',
          imagen1:                d.imagen1       || '',
          imagen2:                d.imagen2       || '',
          imagen3:                d.imagen3       || '',
          imagen4:                d.imagen4       || '',
          firma:                  d.firma         || '',
          kit_carretera:          d.kit_carretera || '',
        };
        const res = await gasWrite('Traslado', campos, 'update', 'id_salida', idSalida);
        if (res.ok) {
          DB.invalidarCache('Traslado');
          actualizarEnSegundoPlano(
            DB.actualizarCarroza(d.placa, {
              kilometraje_actual: parseInt(d.km_salida) || 0
            }).then((r) => { DB.invalidarCache('carrozas'); return r; }),
            'actualizarCarroza tras actualizarTraslado'
          );
        }
        return res;
      } catch(e) {
        return { ok: false, error: e.message };
      }
    });
  },

  // ── VERIFICAR DUPLICADO ────────────────────────────────────
  async verificarDuplicadoSalida(placa) {
    try {
      const hoy  = fechaHoy();
      const rows = await gasGet('Traslado');
      const activos = rows.filter(function(r) {
        return String(r.placa||'').trim().toUpperCase() === placa.trim().toUpperCase() &&
               String(r.fecha||'').trim()               === hoy &&
               (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '');
      });
      if (activos.length === 0) return { existe: false, id_salida: null, detalle: null };
      activos.sort(function(a,b) { return String(b.hora_de_salida||'').localeCompare(String(a.hora_de_salida||'')); });
      const reg = activos[0];
      return { existe: true, id_salida: reg.id_salida || null, detalle: reg };
    } catch(e) {
      return { existe: false, id_salida: null, detalle: null };
    }
  },

  // ── GUARDAR LLEGADA ────────────────────────────────────────
  async guardarLlegada(d) {
    return conLock('guardarLlegada', async () => {

      if (d.id_salida) {
        try {
          const existente = await buscarLlegadaPorIdSalida(d.id_salida);
          if (existente) {
            console.warn('Llegada duplicada detectada — ya existe un registro para este id_salida:', existente.id);
            return {
              ok: true,
              data: { yaGuardado: true },
              duplicado: true,
              existente: existente,
              estado_carroza_despues: { ok: false },
              estado_carroza_antes: { ok: false },
              combustible_guardado_en_registro: false,
              checklist_actualizado: false,
            };
          }
        } catch (e) {
          console.warn('No se pudo verificar Llegada duplicada (se continúa igual):', e.message);
        }
      }

      const fila = {
        id:             'L-' + Date.now(),
        id_salida:      d.id_salida      || '',
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
      if (!res.ok) return res;

      DB.invalidarCache('Llegadas');

      let estadoDespues              = { ok: false };
      let estadoPrevio               = { ok: false };
      let rendimientoUsado           = RENDIMIENTO_DEFAULT;
      let carrozaActualizadaOk       = false;
      let combustibleGuardadoEnRegistro = false;

      try {
        estadoPrevio = await DB.obtenerEstadoCarroza(d.placa);
        rendimientoUsado = (estadoPrevio.ok && estadoPrevio.rendimiento_ultimo_km_gal) || RENDIMIENTO_DEFAULT;
        const combustiblePrevio = estadoPrevio.ok ? estadoPrevio.combustible_galones : CAPACIDAD_TANQUE_DEFAULT;
        const totalKm           = parseFloat(d.total_km) || 0;
        const consumoEstimado   = totalKm / rendimientoUsado;
        const nuevoCombustible  = Math.max(0, Math.round((combustiblePrevio - consumoEstimado) * 10) / 10);
        const kmLlegadaNum      = parseInt(d.km_ingreso) || 0;

        const upd = await DB.actualizarCarroza(d.placa, {
          estado:               'Disponible',
          kilometraje_actual:   kmLlegadaNum,
          combustible_galones:  nuevoCombustible,
        });

        carrozaActualizadaOk = !!upd.ok;

        if (upd.ok) {
          DB.invalidarCache('carrozas');
          estadoDespues = await DB.obtenerEstadoCarroza(d.placa);
        } else {
          console.error(
            `❌ La carroza ${d.placa} NO quedó actualizada (km_ingreso=${kmLlegadaNum}) tras guardar la Llegada. ` +
            `El próximo Traslado de esta placa puede arrancar con un KM de salida incorrecto. Revisar manualmente. Error: ${upd.error}`
          );
        }
      } catch (e) {
        console.error('Error actualizando carroza tras guardarLlegada:', e.message);
      }

      try {
        const consumidoGal = (estadoPrevio.ok && estadoDespues && estadoDespues.ok)
          ? Math.round((estadoPrevio.combustible_galones - estadoDespues.combustible_galones) * 10) / 10
          : '';

        const camposCombustible = {
          combustible_antes_porcentaje:    estadoPrevio.ok ? estadoPrevio.porcentaje_combustible : '',
          combustible_antes_galones:       estadoPrevio.ok ? estadoPrevio.combustible_galones     : '',
          combustible_despues_porcentaje:  (estadoDespues && estadoDespues.ok) ? estadoDespues.porcentaje_combustible : '',
          combustible_despues_galones:     (estadoDespues && estadoDespues.ok) ? estadoDespues.combustible_galones   : '',
          combustible_consumido_galones:   consumidoGal,
          capacidad_galones_carroza:       estadoPrevio.ok ? estadoPrevio.capacidad_galones : '',
          rendimiento_usado_km_gal:        rendimientoUsado,
          carroza_actualizada:             carrozaActualizadaOk ? 'SI' : 'NO — revisar manualmente',
        };

        const resCombustible = await gasWrite('Llegadas', camposCombustible, 'update', 'id', fila.id);
        combustibleGuardadoEnRegistro = !!resCombustible.ok;
        if (!resCombustible.ok) {
          console.warn('⚠️ No se pudo anexar el estado de combustible al registro de Llegada ' + fila.id + ':', resCombustible.error);
        } else {
          DB.invalidarCache('Llegadas');
        }
      } catch (e) {
        console.warn('⚠️ Error anexando combustible al registro de Llegada:', e.message);
      }

      // 🆕 v12.12 — Actualizar también la propia hoja "Traslado" con
      // hora_de_ingreso / km__ingreso / total_km. Antes esto NUNCA se
      // escribía de vuelta en "Traslado" (solo se guardaba la Llegada
      // en su propia hoja), así que el Traslado original quedaba
      // "abierto" para siempre a ojos de cualquier pantalla que leyera
      // directamente esa hoja — incluida la propia guarda anti-doble-
      // salida (buscarTrasladoAbiertoPorPlaca), que por eso seguía
      // bloqueando nuevas salidas de una carroza cuya Llegada YA
      // estaba correctamente registrada. No es crítico si falla (la
      // guarda ya cruza contra "Llegadas" de todas formas), así que
      // no bloquea el resto del flujo si algo sale mal.
      let trasladoActualizado = false;
      if (d.id_salida) {
        try {
          const resTraslado = await gasWrite('Traslado', {
            hora_de_ingreso: d.hora_ingreso || '',
            km__ingreso:     d.km_ingreso   || '',
            total_km:        d.total_km     || '',
          }, 'update', 'id_salida', d.id_salida);
          trasladoActualizado = !!resTraslado.ok;
          if (resTraslado.ok) {
            DB.invalidarCache('Traslado');
          } else {
            console.warn('⚠️ No se pudo actualizar hora_de_ingreso en Traslado (' + d.id_salida + '):', resTraslado.error);
          }
        } catch (e) {
          console.warn('⚠️ Error actualizando Traslado tras guardarLlegada:', e.message);
        }
      }

      let checklistActualizado = false;
      try {
        const checklistAbierto = await buscarChecklistAbiertoPorPlaca(d.placa);
        if (checklistAbierto && checklistAbierto.ID) {
          const resChk = await gasWrite('Checklist_Salida', {
            HORA_ENTRADA:  d.hora_ingreso || '',
            KM_ENTRADA:    d.km_ingreso   || '',
            KM_RECORRIDOS: d.total_km     || '',
          }, 'update', 'ID', checklistAbierto.ID);
          checklistActualizado = !!resChk.ok;
          if (resChk.ok) {
            DB.invalidarCache('Checklist_Salida');
          } else {
            console.warn('⚠️ No se pudo actualizar Checklist_Salida (' + checklistAbierto.ID + ') de la placa ' + d.placa + ':', resChk.error);
          }
        } else {
          console.warn('⚠️ No se encontró un Checklist_Salida pendiente para la placa ' + d.placa + ' — no se actualizó HORA_ENTRADA/KM_ENTRADA/KM_RECORRIDOS.');
        }
      } catch (e) {
        console.warn('⚠️ Error actualizando Checklist_Salida tras guardarLlegada:', e.message);
      }

      // ── 🆕 v12.11 — Si esta Llegada cierra un servicio que tenía una
      //    notificación de "cierre_pendiente" abierta, la marca como
      //    leída automáticamente (ya no hace falta que el coordinador
      //    la descarte a mano — la campana se limpia sola).
      try {
        if (d.id_salida) {
          const notis = await gasGet('notificaciones_apoyo');
          const pendientes = notis.filter(function(n) {
            return String(n.tipo || '') === 'cierre_pendiente' &&
                   String(n.id_salida_ref || '').trim() === String(d.id_salida).trim() &&
                   !(n.leido === true || n.leido === 'TRUE' || n.leido === 'true');
          });
          for (const n of pendientes) {
            await DB.marcarNotificacionLeida(n.id);
          }
        }
      } catch (e) {
        console.warn('⚠️ No se pudieron marcar como leídas las notificaciones de cierre para', d.id_salida, ':', e.message);
      }

      return Object.assign({}, res, {
        estado_carroza_despues: estadoDespues,
        estado_carroza_antes: estadoPrevio,
        combustible_guardado_en_registro: combustibleGuardadoEnRegistro,
        checklist_actualizado: checklistActualizado,
        traslado_actualizado: trasladoActualizado,
      });
    });
  },

  // ── GUARDAR AVERÍA ─────────────────────────────────────────
  async guardarAveria(d) {
    return conLock('guardarAveria', async () => {
      const fila = {
        id:                   'AV-' + Date.now(),
        reportado_por:        d.reportado_por       || '',
        regional:             d.regional            || '',
        placa_vehiculo:       d.placa_vehiculo      || '',
        tipo_vehiculo:        d.tipo_vehiculo       || '',
        tipo_falla:           d.tipo_falla          || '',
        descripcion_sintomas: d.descripcion_sintomas|| '',
        observaciones:        d.observaciones       || '',
        imagen1:              d.imagen1             || '',
        imagen2:              d.imagen2             || '',
        imagen3:              d.imagen3             || '',
        imagen4:              d.imagen4             || '',
        created_at:           new Date().toISOString(),
      };
      const res = await gasWrite('Averias', fila, 'insert');
      if (res.ok) {
        DB.invalidarCache('Averias');
        const h        = new Date();
        const fechaISO = h.getFullYear() + '-' +
                         (h.getMonth()+1).toString().padStart(2,'0') + '-' +
                         h.getDate().toString().padStart(2,'0');
        const filaMant = {
          id:                   'M-' + Date.now(),
          fecha:                fechaISO,
          placa:                d.placa_vehiculo,
          tipo_servicio:        'Avería — ' + (d.tipo_falla || 'Falla mecánica'),
          kilometraje_servicio: 0,
          costo:                0,
          taller:               'Por asignar',
          responsable:          d.reportado_por,
          observaciones:        '🚨 ORDEN POR AVERÍA\nSíntomas: ' + d.descripcion_sintomas + '\nReportado por: ' + d.reportado_por,
          km_proximo_cambio:    0,
          estado_orden:         'pendiente',
        };

        actualizarEnSegundoPlano(
          DB.actualizarCarroza(d.placa_vehiculo, { estado: 'En Taller' })
            .then((r) => { DB.invalidarCache('carrozas'); return r; }),
          'actualizarCarroza tras guardarAveria'
        );
        actualizarEnSegundoPlano(
          gasWrite('mantenimientos', filaMant, 'insert')
            .then((r) => { DB.invalidarCache('mantenimientos'); return r; }),
          'crear orden de mantenimiento tras guardarAveria'
        );

        // 🆕 v12.11 — Notificar a la regional de esta avería.
        actualizarEnSegundoPlano(
          DB.crearNotificacion({
            tipo: 'averia_reportada',
            titulo: '⚠️ Avería reportada — ' + (d.placa_vehiculo || ''),
            cuerpo: (d.tipo_falla || 'Falla mecánica') + ' reportada por ' + (d.reportado_por || 'un conductor') + '.',
            regional: d.regional || '',
            remitente: d.reportado_por || '',
            placa: d.placa_vehiculo || '',
          }),
          'crearNotificacion tras guardarAveria'
        );
      }
      return res;
    });
  },

  async actualizarCarroza(placa, campos) {
    return await gasWrite('carrozas', campos, 'update', 'placa', placa);
  },

  async inicializarCapacidadesTanque() {
    try {
      const flota = await gasGet('carrozas');
      const resumen = { actualizadas: [], yaTenian: [], sinModeloIdentificado: [], errores: [] };

      for (const carroza of flota) {
        const placa = carroza.placa;
        if (!placa) continue;

        const yaTiene = parseFloat(carroza.capacidad_galones) > 0;
        if (yaTiene) {
          resumen.yaTenian.push(placa);
          continue;
        }

        const match = capacidadPorModelo(carroza.modelo);
        const galones = match ? match.galones : CAPACIDAD_TANQUE_DEFAULT;

        try {
          const res = await DB.actualizarCarroza(placa, { capacidad_galones: galones });
          if (res.ok) {
            resumen.actualizadas.push({ placa, modelo: carroza.modelo, galones, fuente: match ? match.fuente : 'default genérico' });
            if (!match) resumen.sinModeloIdentificado.push({ placa, modelo: carroza.modelo });
          } else {
            resumen.errores.push({ placa, error: res.error });
          }
        } catch (e) {
          resumen.errores.push({ placa, error: e.message });
        }
      }

      DB.invalidarCache('carrozas');
      console.log(
        `✅ Capacidad de tanque inicializada: ${resumen.actualizadas.length} carrozas actualizadas, ` +
        `${resumen.yaTenian.length} ya tenían valor, ${resumen.errores.length} con error.`
      );
      if (resumen.sinModeloIdentificado.length) {
        console.warn('⚠️ Estas placas quedaron con el default genérico (55 gal) por no reconocer el modelo — revisar si se quiere ajustar a mano:', resumen.sinModeloIdentificado);
      }
      return { ok: true, resumen };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // ══════════════════════════════════════════════════════════
  // 🆕 v12.12 — REPARAR TRASLADOS "ABIERTOS" QUE YA TIENEN LLEGADA
  // ══════════════════════════════════════════════════════════
  // Antes de esta versión, guardarLlegada() nunca escribía de vuelta
  // hora_de_ingreso/km__ingreso/total_km en la hoja "Traslado" — por
  // lo que cualquier servicio cerrado ANTES de este parche quedó con
  // su Traslado marcado como "abierto" para siempre, aunque su
  // Llegada esté correctamente guardada en la hoja "Llegadas".
  //
  // Esta función recorre "Traslado", detecta esas filas huérfanas
  // (hora_de_ingreso vacía + SÍ existe una Llegada con ese id_salida)
  // y las completa con los datos de esa Llegada. Es seguro ejecutarla
  // varias veces: una fila ya reparada (con hora_de_ingreso llena) no
  // se vuelve a tocar.
  //
  // Cómo ejecutarla una sola vez (por ejemplo desde la consola del
  // navegador en cualquier pantalla que cargue db.js):
  //     await DB.repararTrasladosCerrados()
  async repararTrasladosCerrados() {
    try {
      DB.invalidarCache('Traslado');
      DB.invalidarCache('Llegadas');
      const [traslados, llegadas] = await Promise.all([gasGet('Traslado'), gasGet('Llegadas')]);

      const llegadaPorIdSalida = {};
      llegadas.forEach(function(l) {
        const id = String(l.id_salida || '').trim();
        if (id) llegadaPorIdSalida[id] = l;
      });

      const huerfanos = traslados.filter(function(r) {
        const sinRegreso = (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '');
        const idSalida = String(r.id_salida || '').trim();
        return sinRegreso && idSalida && llegadaPorIdSalida[idSalida];
      });

      const resumen = { reparados: [], errores: [] };

      for (const traslado of huerfanos) {
        const idSalida = String(traslado.id_salida).trim();
        const llegada = llegadaPorIdSalida[idSalida];
        try {
          const res = await gasWrite('Traslado', {
            hora_de_ingreso: llegada.hora_ingreso || '',
            km__ingreso:     llegada.km_ingreso   || '',
            total_km:        llegada.total_km     || '',
          }, 'update', 'id_salida', idSalida);
          if (res.ok) {
            resumen.reparados.push({ id_salida: idSalida, placa: traslado.placa });
          } else {
            resumen.errores.push({ id_salida: idSalida, placa: traslado.placa, error: res.error });
          }
        } catch (e) {
          resumen.errores.push({ id_salida: idSalida, placa: traslado.placa, error: e.message });
        }
      }

      DB.invalidarCache('Traslado');
      console.log(
        `✅ Reparación de Traslados completada: ${resumen.reparados.length} filas reparadas, ` +
        `${resumen.errores.length} con error.`
      );
      if (resumen.errores.length) {
        console.warn('⚠️ Estas no se pudieron reparar automáticamente — revisar a mano:', resumen.errores);
      }
      return { ok: true, resumen };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async insertar(hoja, datos) {
    const res = await gasWrite(hoja, datos, 'insert');
    if (res.ok) this.invalidarCache(hoja);
    return res;
  },

  async actualizar(hoja, datos, idCol, idValue) {
    const res = await gasWrite(hoja, datos, 'update', idCol, idValue);
    if (res.ok) this.invalidarCache(hoja);
    return res;
  },

  async testConexion() {
    try {
      const resp = await fetchConTimeout(URL_GAS, { method: 'GET', redirect: 'follow' }, 10000);
      const json = await resp.json();
      return { ok: true, mensaje: json.mensaje || JSON.stringify(json) };
    } catch(e) { return { ok: false, error: e.message }; }
  },

  async obtenerLogo() {
    try {
      const rows = await gasGet('config');
      const fila = rows.find(function(r) { return String(r.clave||'').trim() === 'logo_app'; });
      return { ok: true, logo: (fila && fila.valor && fila.valor.length > 10) ? fila.valor : null };
    } catch(e) { return { ok: false, logo: null, error: e.message }; }
  },

  async guardarLogo(base64) {
    try {
      const rows   = await gasGet('config');
      const existe = rows.find(function(r) { return String(r.clave||'').trim() === 'logo_app'; });
      let res;
      if (existe) res = await gasWrite('config', { valor: base64 }, 'update', 'clave', 'logo_app');
      else        res = await gasWrite('config', { clave: 'logo_app', valor: base64 }, 'insert');
      if (res.ok) this.invalidarCache('config');
      return res;
    } catch(e) { return { ok: false, error: e.message }; }
  },

  async eliminarLogo() {
    const res = await gasWrite('config', { valor: '' }, 'update', 'clave', 'logo_app');
    if (res.ok) this.invalidarCache('config');
    return res;
  },

  // ── GUARDAR INSPECCIÓN VEHICULAR ───────────────────────────
  async guardarInspeccion(datos) {
    return conLock('guardarInspeccion', async () => {
      try {
        const payload = Object.assign({}, datos);
        if (payload.ID && String(payload.ID).length > 8) {
          payload.ID = '';
        }
        const res = await gasWrite('Inspeccion_Vehiculo', payload, 'insert');
        if (res.ok) {
          this.invalidarCache('Inspeccion_Vehiculo');
          if (datos.ESTADO_INSPECCION === 'NO OPERATIVO') {
            actualizarEnSegundoPlano(
              this.actualizarCarroza(datos.PLACA, { estado: 'En Taller' })
                .then(r => { this.invalidarCache('carrozas'); return r; }),
              'actualizarCarroza tras inspeccion NO OPERATIVO'
            );
          } else if (datos.KILOMETRAJE) {
            actualizarEnSegundoPlano(
              this.actualizarCarroza(datos.PLACA, {
                kilometraje_actual: parseInt(datos.KILOMETRAJE) || 0
              }).then(r => { this.invalidarCache('carrozas'); return r; }),
              'actualizarCarroza km tras inspeccion'
            );
          }
        }
        return res;
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
  },

  // ── VERIFICAR INSPECCIÓN HECHA HOY ────────────────────────
  async verificarInspeccionHoy(placa) {
    try {
      const url = `${URL_GAS}?action=checkInspeccionHoy&placa=${encodeURIComponent(placa)}`;
      const resp = await fetchConTimeout(url, { method: 'GET', redirect: 'follow' }, 12000);
      if (!resp.ok) return { existe: false };
      const json = await resp.json();
      return json;
    } catch (e) {
      console.warn('verificarInspeccionHoy error:', e.message);
      return { existe: false };
    }
  },

  // ══════════════════════════════════════════════════════════
  // 🆕 v12.11 — NOTIFICACIONES POR REGIONAL (multi-tenant real)
  // ══════════════════════════════════════════════════════════
  //
  // LEER — solo trae las notificaciones de LA REGIONAL indicada
  // (+ las de alcance global/nacional/todas). Tolerante con el dato
  // heredado: acepta tanto alcance='regional'+regional=X (formato
  // correcto) como alcance=X directamente (bug histórico), pero
  // SIEMPRE exige que la regional coincida exactamente con la que
  // se está consultando — nunca cruza regionales entre sí.
  //
  // opts: { soloNoLeidas: true/false, tipo: 'cierre_pendiente' (opcional) }
  async obtenerNotificaciones(regional, opts) {
    opts = opts || {};
    try {
      const regionalNorm = normTexto(regional);
      if (!regionalNorm) return { ok: true, data: [] };

      const rows = await gasGet('notificaciones_apoyo');

      let filtradas = rows.filter(function(r) {
        const alcanceNorm  = normTexto(r.alcance);
        const regCampoNorm = normTexto(r.regional);

        const esGlobal = alcanceNorm === 'global' || alcanceNorm === 'todas' || alcanceNorm === 'nacional' || alcanceNorm === 'general';

        // Formato correcto: alcance='regional' + regional=miRegional
        const formatoNuevo = alcanceNorm === 'regional' && regCampoNorm === regionalNorm;

        // Formato heredado con bug: alcance trae el NOMBRE de la
        // regional directamente. Solo cuenta si coincide EXACTO con
        // la regional que se está consultando.
        const formatoViejo = alcanceNorm === regionalNorm;

        // Respaldo adicional: si por cualquier motivo `alcance` viene
        // vacío o con un valor no reconocido, se usa directamente el
        // campo `regional` de la fila (nunca deja pasar algo de otra
        // regional distinta a la solicitada).
        const porCampoRegional = !alcanceNorm && regCampoNorm === regionalNorm;

        return esGlobal || formatoNuevo || formatoViejo || porCampoRegional;
      });

      if (opts.tipo) {
        const tipoNorm = normTexto(opts.tipo);
        filtradas = filtradas.filter(function(r) { return normTexto(r.tipo) === tipoNorm; });
      }

      if (opts.soloNoLeidas) {
        filtradas = filtradas.filter(function(r) {
          const leido = r.leido;
          return !(leido === true || leido === 'TRUE' || leido === 'true' || leido === 1 || leido === '1');
        });
      }

      filtradas.sort(function(a, b) {
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      });

      return { ok: true, data: filtradas };
    } catch (e) {
      return { ok: false, data: [], error: e.message };
    }
  },

  // CREAR — siempre en el formato correcto (alcance:'regional').
  // d: { tipo, titulo, cuerpo, regional, solicitud_id, remitente,
  //      placa, id_salida_ref, conductor, hora_salida, fecha_salida }
  async crearNotificacion(d) {
    if (!d || !d.regional) {
      return { ok: false, error: 'crearNotificacion requiere el campo "regional" del destinatario' };
    }
    const fila = {
      id:             (d.tipo || 'NOT') + '-' + (d.placa ? String(d.placa).replace(/\s+/g, '') + '-' : '') + Date.now(),
      tipo:           d.tipo || '',
      titulo:         d.titulo || '',
      cuerpo:         d.cuerpo || '',
      regional:       d.regional,
      alcance:        'regional',
      leido:          false,
      solicitud_id:   d.solicitud_id || '',
      remitente:      d.remitente || '',
      created_at:     new Date().toISOString(),
      placa:          d.placa || '',
      id_salida_ref:  d.id_salida_ref || '',
      conductor:      d.conductor || '',
      hora_salida:    d.hora_salida || '',
      fecha_salida:   d.fecha_salida || '',
    };
    const res = await gasWrite('notificaciones_apoyo', fila, 'insert');
    if (res.ok) DB.invalidarCache('notificaciones_apoyo');
    return res;
  },

  // MARCAR COMO LEÍDA
  async marcarNotificacionLeida(id) {
    if (!id) return { ok: false, error: 'marcarNotificacionLeida requiere un id' };
    const res = await gasWrite('notificaciones_apoyo', { leido: true }, 'update', 'id', id);
    if (res.ok) DB.invalidarCache('notificaciones_apoyo');
    return res;
  },

};

window.DB = DB;

// ── WARM-UP SECUENCIAL AL INICIAR ─────────────────────────
(async function() {
  try {
    const ping = await DB.testConexion();
    if (ping.ok) {
      console.log('🟢 API J.R. conectada:', ping.mensaje);
      const hojas = ['usuarios', 'carrozas', 'Traslado', 'Averias', 'mantenimientos', 'Tanqueo', 'Llegadas', 'notificaciones_apoyo'];
      for (let i = 0; i < hojas.length; i++) {
        await gasGet(hojas[i]);
        await new Promise(function(r) { setTimeout(r, 300); });
      }
      console.log('✅ Caché precargado correctamente');
    } else {
      console.warn('🔴 API J.R. sin conexión:', ping.error);
    }
  } catch(e) {
    console.warn('🔴 Error en warm-up:', e.message);
  }
})();
