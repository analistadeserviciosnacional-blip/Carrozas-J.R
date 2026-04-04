<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>J.R. — Panel Conductor</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <style>
        :root { --azul: #001a70; --celeste: #e3f2fd; --blanco: #ffffff; --rojo: #ef4444; --verde: #10b981; }
        body { background: var(--celeste); font-family: 'DM Sans', sans-serif; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; }

        header { width: 100%; max-width: 600px; background: var(--blanco); padding: 20px; border-radius: 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.03); box-sizing: border-box; }
        .logo-small { color: var(--azul); font-weight: bold; font-size: 18px; }
        .btn-salir { background: #fee2e2; color: var(--rojo); padding: 8px 15px; border-radius: 10px; font-size: 12px; font-weight: bold; border: none; cursor: pointer; }

        .welcome-box { width: 100%; max-width: 600px; text-align: center; margin-bottom: 25px; }
        .welcome-box h1 { color: var(--azul); font-size: 24px; margin: 0; }

        .menu-conductor { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; width: 100%; max-width: 600px; margin-bottom: 25px; }
        .card-condu { background: var(--blanco); padding: 25px 10px; border-radius: 25px; text-align: center; text-decoration: none; box-shadow: 0 4px 12px rgba(0,0,0,0.04); transition: 0.3s; border: 1px solid transparent; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .card-condu:active { transform: scale(0.95); background: #f0f7ff; border-color: var(--azul); }
        .card-condu i { font-size: 35px; display: block; margin-bottom: 10px; font-style: normal; }
        .card-condu span { color: var(--azul); font-weight: bold; text-transform: uppercase; font-size: 11px; }

        .monitor-mini { width: 100%; max-width: 600px; background: var(--blanco); border-radius: 25px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); box-sizing: border-box; margin-bottom: 20px; }
        .monitor-mini h2 { font-size: 15px; color: var(--azul); margin-top: 0; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; text-transform: uppercase; }
        
        .btn-ver-todo { background: var(--celeste); color: var(--azul); font-size: 10px; padding: 5px 10px; border-radius: 8px; text-decoration: none; font-weight: bold; }

        table { width: 100%; border-collapse: collapse; }
        td { padding: 12px 5px; font-size: 13px; border-bottom: 1px solid #f1f5f9; color: #334155; }
        .status-pill { font-weight: bold; font-size: 10px; padding: 4px 8px; border-radius: 8px; }
        .pill-disponible { color: #10b981; background: #ecfdf5; }
        .pill-taller { color: var(--rojo); background: #fef2f2; }
        .pill-ruta { color: #3b82f6; background: #eff6ff; }
        .falla-pill { color: var(--rojo); font-weight: bold; font-size: 10px; background: #fef2f2; padding: 4px 8px; border-radius: 8px; }
        .servicio-pill { color: var(--azul); font-weight: bold; font-size: 10px; background: #e0e7ff; padding: 4px 8px; border-radius: 8px; }
    </style>
</head>
<body>

    <header>
        <div class="logo-small">J.R. MOVILIDAD</div>
        <button onclick="cerrarSesion()" class="btn-salir">SALIR</button>
    </header>

    <div class="welcome-box">
        <h1 id="txt-conductor">Hola...</h1>
        <p style="color: #64748b; font-size: 14px;">Panel de Servicios y Reportes</p>
    </div>

    <div class="menu-conductor">
        <a href="registro_salida.html" class="card-condu">
            <i>🚚</i>
            <span>Nueva Salida</span>
        </a>

        <a href="reporte_averia.html" class="card-condu">
            <i>⚠️</i>
            <span>Reportar Avería</span>
        </a>
    </div>

    <div class="monitor-mini">
        <h2>
            Mis Salidas Recientes
            <span style="font-size: 10px; color: gray;">Últimas 3</span>
        </h2>
        <table>
            <tbody id="tabla-salidas">
                <tr><td colspan="3" style="text-align: center; color: #94a3b8;">Cargando salidas...</td></tr>
            </tbody>
        </table>
    </div>

    <div class="monitor-mini">
        <h2>
            Mis Averías Reportadas
            <a href="mis_averias.html" class="btn-ver-todo">VER TODO</a>
        </h2>
        <table>
            <tbody id="tabla-averias">
                <tr><td colspan="3" style="text-align: center; color: #94a3b8;">Cargando reportes...</td></tr>
            </tbody>
        </table>
    </div>

    <div class="monitor-mini">
        <h2>Estado de Flota (Real)</h2>
        <table>
            <tbody id="tabla-monitor">
                <tr><td colspan="3" style="text-align: center; color: #94a3b8;">Cargando flota...</td></tr>
            </tbody>
        </table>
    </div>

    <script src="db.js"></script>
    <script>
        // 1. Verificación de Seguridad y Sesión
        window.onload = async () => {
            // Buscamos en ambos almacenamientos por si acaso
            const sesionRaw = sessionStorage.getItem('user_jr') || localStorage.getItem('usuario_data');
            
            if (!sesionRaw) {
                console.warn("Sesión no encontrada, redirigiendo...");
                window.location.href = "index.html";
                return;
            }

            try {
                const user = JSON.parse(sesionRaw);
                const nombreCompleto = user.nombre || "Conductor";
                
                // Actualizar UI
                document.getElementById('txt-conductor').innerText = "Hola, " + nombreCompleto;

                // Cargar Datos
                await Promise.all([
                    cargarSalidasRecientes(nombreCompleto),
                    cargarResumenAverias(nombreCompleto),
                    cargarMonitorFlota()
                ]);
            } catch (e) {
                console.error("Error al procesar sesión:", e);
                window.location.href = "index.html";
            }
        };

        // 2. Cargar Salidas desde la tabla 'Traslado'
        async function cargarSalidasRecientes(nombre) {
            const { data, error } = await DB.supabase
                .from('Traslado') // Nombre exacto con T mayúscula
                .select('placa, motivo_de_salida, destino, fecha')
                .ilike('conductor', `%${nombre}%`)
                .order('fecha', { ascending: false }) // Columna fecha
                .limit(3);

            const tabla = document.getElementById('tabla-salidas');
            
            if (error) {
                console.error("Error en Salidas:", error.message);
                tabla.innerHTML = '<tr><td colspan="3" style="text-align: center; color: red;">Error de conexión</td></tr>';
                return;
            }

            if (!data || data.length === 0) {
                tabla.innerHTML = '<tr><td colspan="3" style="text-align: center; font-size: 11px;">Sin salidas registradas.</td></tr>';
                return;
            }

            tabla.innerHTML = data.map(s => `
                <tr>
                    <td><b>${s.placa || 'S/P'}</b><br><small>${s.destino || 'Local'}</small></td>
                    <td style="font-size: 11px;">${s.fecha || '---'}</td>
                    <td style="text-align: right;"><span class="servicio-pill">${(s.motivo_de_salida || 'SERVICIO').toUpperCase()}</span></td>
                </tr>
            `).join('');
        }

        // 3. Cargar Averías desde la tabla 'averias'
        async function cargarResumenAverias(nombre) {
            const primerNombre = nombre.split(' ')[0]; // Búsqueda más flexible
            const { data, error } = await DB.supabase
                .from('averias')
                .select('placa_vehiculo, tipo_falla, created_at')
                .ilike('reportado_por', `%${primerNombre}%`)
                .order('created_at', { ascending: false })
                .limit(3);

            const tabla = document.getElementById('tabla-averias');
            
            if (error || !data || data.length === 0) {
                tabla.innerHTML = '<tr><td colspan="3" style="text-align: center; font-size: 11px;">No hay reportes recientes.</td></tr>';
                return;
            }

            tabla.innerHTML = data.map(av => `
                <tr>
                    <td><b>${av.placa_vehiculo}</b></td>
                    <td style="font-size: 11px;">${new Date(av.created_at).toLocaleDateString()}</td>
                    <td style="text-align: right;"><span class="falla-pill">${av.tipo_falla.toUpperCase()}</span></td>
                </tr>
            `).join('');
        }

        // 4. Monitor de Flota (Carrozas)
        async function cargarMonitorFlota() {
            const { data, error } = await DB.supabase
                .from('carrozas')
                .select('placa, kilometraje_actual, estado')
                .order('placa', { ascending: true });

            const tabla = document.getElementById('tabla-monitor');
            
            if (error || !data) {
                tabla.innerHTML = '<tr><td colspan="3" style="text-align: center;">Error de flota</td></tr>';
                return;
            }

            tabla.innerHTML = data.map(c => {
                let clasePill = 'pill-disponible';
                if (c.estado === 'En Taller') clasePill = 'pill-taller';
                if (c.estado === 'En Ruta') clasePill = 'pill-ruta';

                return `
                    <tr>
                        <td><b>${c.placa}</b></td>
                        <td style="font-size: 11px; color: gray;">${Number(c.kilometraje_actual || 0).toLocaleString()} KM</td>
                        <td style="text-align: right;">
                            <span class="status-pill ${clasePill}">● ${c.estado.toUpperCase()}</span>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // 5. Cerrar Sesión
        function cerrarSesion() {
            DB.logout();
            window.location.href = "index.html";
        }
    </script>
</body>
</html>
