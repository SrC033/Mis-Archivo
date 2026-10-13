// ============================================================
// UBICACIÓN - SERVIDOR CENTRAL v23.0 · FUTURISTA
// GPS + Chat Conductores · GSN
// 🟡 NO LEÍDOS INTELIGENTES · Persistencia en localStorage
// ============================================================
(function() {
    "use strict";

    // ============================================================
    // CONFIGURACIÓN
    // ============================================================
    const API_URL = 'https://script.google.com/macros/s/AKfycbxqqZpyF61BlsXeD24tlLqpxthp7-6i7XkPrpPTudAPlelIZruZxpgHwzNq77jBE_kkkA/exec';
    const CLAVE_CARPETA = 'GSN-DASHBOARD-2026';
    const STORAGE_KEY = 'conductores_registrados';
    const ULTIMO_ID_KEY = 'ultimo_id_';
    const ULTIMO_VISTO_KEY = 'ultimo_visto_';
    const MAX_FILE_SIZE_KB = 512000;
    const FILE_CACHE_PREFIX = 'file_';
    const CHUNK_SIZE = 500000;
    const MAX_SMALL_FILE_KB = 1024;
    const POLLING_INTERVAL = 8000;
    const TIEMPO_ACTIVO = 300000;

    // ============================================================
    // ESTADO GLOBAL
    // ============================================================
    let conectado = false;
    let conductoresData = [];
    let conductoresRegistrados = [];
    let mensajesPorConductor = {};
    let conductorSeleccionado = null;
    let marcadores = {};
    let rutasConductores = {};
    let rutasActivas = false;
    let rutasLayer = null;
    let mensajesNoLeidos = {};                          // { "CON-001": true }
    let ultimoMensajeVistoPorConductor = {};            // { "CON-001": "msg_xyz" }
    let ultimoMsgIdPorConductor = {};
    let pollingInterval = null;
    let mapa = null;
    let markersLayer = null;
    let reintentos = 0;
    let maxReintentos = 5;
    let archivosSeleccionadosChat = [];
    let fileInputChat = null;
    let mensajesEnviadosIds = new Set();
    let cargandoMensajes = {};
    let subidaEnProgreso = false;
    let descargandoDrive = {};
    let chatActualizado = false;

    const NICARAGUA_CENTER = [12.8654, -85.2072];
    const NICARAGUA_BOUNDS = [[10.7, -87.7], [15.0, -83.1]];
    const ZOOM_DEFAULT = 7;

    // ============================================================
    // REFERENCIAS DOM
    // ============================================================
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatBtnEnviar = document.getElementById('chatBtnEnviar');
    const btnSubirArchivo = document.getElementById('btnSubirArchivoChat');
    const chatContador = document.getElementById('chatContador');
    const conductorSelector = document.getElementById('conductorSelector');
    const statusDotLocal = document.getElementById('statusDotLocal');
    const statusTextLocal = document.getElementById('statusTextLocal');
    const totalConductoresStatus = document.getElementById('totalConductoresStatus');
    const totalConductoresActivos = document.getElementById('totalConductoresActivos');
    const serverDot = document.getElementById('serverDot');
    const serverStatusText = document.getElementById('serverStatusText');
    const archivosSeleccionadosChatDiv = document.getElementById('archivosSeleccionadosChat');
    const badgeArchivosChat = document.getElementById('badgeArchivosChat');
    const uploadProgressChat = document.getElementById('uploadProgressChat');
    const progressBarChat = document.getElementById('progressBarChat');
    const progressTextChat = document.getElementById('progressTextChat');
    const vehiculosLista = document.getElementById('vehiculosLista');
    const modalImagen = document.getElementById('modalImagen');
    const imagenAmpliada = document.getElementById('imagenAmpliada');

    // ============================================================
    // FILE INPUT OCULTO
    // ============================================================
    fileInputChat = document.createElement('input');
    fileInputChat.type = 'file';
    fileInputChat.accept = 'image/*';
    fileInputChat.style.display = 'none';
    document.body.appendChild(fileInputChat);

    // ============================================================
    // LOGGER
    // ============================================================
    const LOG_PREFIX = '📍 [GPS]';
    const log = {
        info: (...a) => console.log(LOG_PREFIX, ...a),
        warn: (...a) => console.warn(LOG_PREFIX, ...a),
        error: (...a) => console.error(LOG_PREFIX, ...a)
    };

    function detectarOrigen() {
        if (window.location.protocol === 'file:') {
            log.warn('Ejecutando desde file:// - Se recomienda usar un servidor local');
            return 'file';
        }
        return 'http';
    }
    const ORIGEN = detectarOrigen();

    // ============================================================
    // GESTIÓN DE ÚLTIMO ID (para polling incremental)
    // ============================================================
    function guardarUltimoId(conductorId) {
        try {
            const key = ULTIMO_ID_KEY + conductorId;
            const id = ultimoMsgIdPorConductor[conductorId] || '';
            if (id) localStorage.setItem(key, id);
        } catch(e) {}
    }

    function cargarUltimoId(conductorId) {
        try {
            const key = ULTIMO_ID_KEY + conductorId;
            const valor = localStorage.getItem(key);
            if (valor) {
                ultimoMsgIdPorConductor[conductorId] = valor;
                return true;
            }
            ultimoMsgIdPorConductor[conductorId] = '';
            return false;
        } catch(e) {
            ultimoMsgIdPorConductor[conductorId] = '';
            return false;
        }
    }

    function resetearUltimoId(conductorId) {
        ultimoMsgIdPorConductor[conductorId] = '';
        const key = ULTIMO_ID_KEY + conductorId;
        try { localStorage.removeItem(key); } catch(e) {}
    }

    // ============================================================
    // 🟡 ÚLTIMO MENSAJE VISTO POR CONDUCTOR (persistente)
    // ============================================================
    function guardarUltimoVisto(conductorId, msgId) {
        try {
            ultimoMensajeVistoPorConductor[conductorId] = msgId;
            localStorage.setItem(ULTIMO_VISTO_KEY + conductorId, msgId);
        } catch(e) {}
    }

    function cargarUltimoVisto(conductorId) {
        try {
            const key = ULTIMO_VISTO_KEY + conductorId;
            const valor = localStorage.getItem(key);
            if (valor) {
                ultimoMensajeVistoPorConductor[conductorId] = valor;
                return valor;
            }
            ultimoMensajeVistoPorConductor[conductorId] = '';
            return '';
        } catch(e) {
            ultimoMensajeVistoPorConductor[conductorId] = '';
            return '';
        }
    }

    function limpiarUltimoVisto(conductorId) {
        ultimoMensajeVistoPorConductor[conductorId] = '';
        try {
            localStorage.removeItem(ULTIMO_VISTO_KEY + conductorId);
        } catch(e) {}
    }

    // ============================================================
    // TIPOS DE ARCHIVO
    // ============================================================
    function esSoloImagen(nombre, tipo) {
        const mime = tipo || '';
        return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|heic|heif|avif)$/i.test(nombre || '') || mime.startsWith('image/');
    }

    function getTipoArchivoInfo(nombre, tipo) {
        return { icono: 'fa-image', clase: 'imagen', color: '#ffb74d' };
    }

    function esImagen(nombre, tipo) {
        return esSoloImagen(nombre, tipo);
    }

    function sanitizarNombreArchivo(nombre) {
        return nombre.replace(/[^a-zA-Z0-9.\-_]/g, '_').replace(/_+/g, '_');
    }

    // ============================================================
    // LECTURA DE ARCHIVOS
    // ============================================================
    function archivoABase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const base64 = e.target.result.split(',')[1] || e.target.result;
                resolve(base64);
            };
            reader.onerror = function(e) { reject(e); };
            reader.readAsDataURL(file);
        });
    }

    function leerChunkBase64(chunk) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const base64 = e.target.result.split(',')[1] || e.target.result;
                resolve(base64);
            };
            reader.onerror = function(e) { reject(e); };
            reader.readAsDataURL(chunk);
        });
    }

    // ============================================================
    // FECHAS
    // ============================================================
    function formatearHora(fecha) {
        if (!fecha) return "--:--";
        try {
            const d = new Date(fecha);
            if (isNaN(d.getTime())) return "--:--";
            return d.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
        } catch(e) { return "--:--"; }
    }

    function formatearFecha(fecha) {
        if (!fecha) return "Fecha desconocida";
        try {
            const d = new Date(fecha);
            if (isNaN(d.getTime())) return "Fecha desconocida";
            return d.toLocaleDateString('es-NI', { day: '2-digit', month: 'short' });
        } catch(e) { return "Fecha desconocida"; }
    }

    // ============================================================
    // ESCAPE HTML
    // ============================================================
    function escapeHtml(text) {
        if (!text) return "";
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================================
    // LIMPIAR BARRA DE ENVÍO
    // ============================================================
    function limpiarBarraEnvioChat() {
        if (chatInput) {
            chatInput.value = '';
            chatInput.style.height = 'auto';
        }
        archivosSeleccionadosChat = [];
        if (fileInputChat) fileInputChat.value = '';
        actualizarArchivosSeleccionadosChat();
        if (uploadProgressChat) uploadProgressChat.classList.remove('active');
        if (progressBarChat) progressBarChat.style.width = '0%';
        if (progressTextChat) progressTextChat.textContent = '';
        log.info('Barra de envío limpiada');
    }

    // ============================================================
    // API - fetch directo
    // ============================================================
    async function jsonpRequest(accion, datos) {
        let url = API_URL + '?key=' + encodeURIComponent(CLAVE_CARPETA) + '&accion=' + encodeURIComponent(accion) + '&t=' + Date.now();

        if (datos) {
            Object.keys(datos).forEach(k => {
                if (datos[k] !== null && datos[k] !== undefined) {
                    let v = datos[k];
                    if (typeof v === 'object') v = JSON.stringify(v);
                    url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
                }
            });
        }

        log.info('🔗 fetch →', accion);

        const resp = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!resp.ok) throw new Error('HTTP ' + resp.status);

        const data = await resp.json();
        log.info('✅ OK:', accion);
        return data;
    }

    async function enviarPost(datos) {
        let url = API_URL + '?key=' + encodeURIComponent(CLAVE_CARPETA) + '&t=' + Date.now();
        Object.keys(datos).forEach(k => {
            if (datos[k] !== null && datos[k] !== undefined) {
                let v = datos[k];
                if (typeof v === 'object') v = JSON.stringify(v);
                url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
            }
        });

        const resp = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (data && data.ok) return data;
        throw new Error(data?.error || 'Error en el servidor');
    }

    async function enviarChunk(datos) {
        return enviarPost(datos);
    }

    // ============================================================
    // STATUS
    // ============================================================
    function setStatusLocal(texto, tipo) {
        if (statusTextLocal) {
            statusTextLocal.textContent = texto;
            statusTextLocal.className = 'status-text';
        }
        if (statusDotLocal) {
            statusDotLocal.className = 'status-dot';
            if (tipo === 'conectado') {
                statusDotLocal.classList.add('on');
                if (statusTextLocal) statusTextLocal.classList.add('conectado');
            } else if (tipo === 'error') {
                statusDotLocal.classList.add('error');
                if (statusTextLocal) statusTextLocal.classList.add('error');
            } else {
                statusDotLocal.classList.add('off');
            }
        }
    }

    function setServerStatus(texto, tipo) {
        if (serverStatusText) {
            serverStatusText.textContent = texto;
            serverStatusText.className = 'server-text';
        }
        if (serverDot) {
            serverDot.className = 'server-dot';
            if (tipo === 'on') {
                serverDot.classList.add('on');
                conectado = true;
            } else if (tipo === 'off') {
                serverDot.classList.add('off');
                conectado = false;
            } else if (tipo === 'wait') {
                serverDot.classList.add('wait');
                conectado = false;
            }
        }
    }

    // ============================================================
    // TOAST
    // ============================================================
    function mostrarToast(mensaje, tipo) {
        tipo = tipo || 'success';
        const old = document.querySelector('.toast-message');
        if (old) old.remove();
        const toast = document.createElement('div');
        toast.className = 'toast-message';
        const icon = tipo === 'success' ? 'fa-check-circle'
            : tipo === 'error' ? 'fa-exclamation-circle'
            : tipo === 'warning' ? 'fa-exclamation-triangle'
            : 'fa-info-circle';
        toast.innerHTML = `<i class="fas ${icon}"></i> <span>${mensaje}</span>`;
        if (tipo === 'error') toast.style.borderLeftColor = '#ff5470';
        else if (tipo === 'warning') toast.style.borderLeftColor = '#ffb74d';
        else if (tipo === 'info') toast.style.borderLeftColor = '#4df0ff';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    // ============================================================
    // GESTIÓN DE CONDUCTORES
    // ============================================================
    function cargarConductoresLocales() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                conductoresRegistrados = JSON.parse(data);
            } else {
                conductoresRegistrados = [
                    { id: 'CON-001', nombre: 'Juan Pérez', fecha_registro: new Date().toISOString() },
                    { id: 'CON-002', nombre: 'María Gómez', fecha_registro: new Date().toISOString() },
                    { id: 'CON-003', nombre: 'Carlos López', fecha_registro: new Date().toISOString() }
                ];
                guardarConductoresLocales();
            }
            actualizarTotalConductores();
            return conductoresRegistrados;
        } catch (e) {
            conductoresRegistrados = [];
            return [];
        }
    }

    function guardarConductoresLocales() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(conductoresRegistrados));
            actualizarTotalConductores();
        } catch (e) {}
    }

    function actualizarTotalConductores() {
        const total = conductoresRegistrados.length;
        const totalModal = document.getElementById('totalConductoresModal');
        if (totalModal) totalModal.textContent = total;
        const fechaModal = document.getElementById('ultimaActualizacionModal');
        if (fechaModal) fechaModal.textContent = 'Última actualización: ' + new Date().toLocaleTimeString();
        if (totalConductoresStatus) totalConductoresStatus.textContent = conductoresData.length;
        if (totalConductoresActivos) totalConductoresActivos.textContent = conductoresData.length;
    }

    function getConductorById(id) {
        return conductoresRegistrados.find(c => c.id === id);
    }

    function getConductorByNombre(nombre) {
        return conductoresRegistrados.find(c => c.nombre.toLowerCase() === nombre.toLowerCase());
    }

    function generarIdConductor() {
        const nums = conductoresRegistrados.map(c => {
            const num = parseInt(c.id.replace('CON-', ''));
            return isNaN(num) ? 0 : num;
        });
        const max = nums.length > 0 ? Math.max(...nums) : 0;
        return 'CON-' + String(max + 1).padStart(3, '0');
    }

    // ============================================================
    // CACHÉ DE ARCHIVOS
    // ============================================================
    function obtenerBase64Cache(msgId) {
        try {
            const cacheKey = FILE_CACHE_PREFIX + msgId;
            return localStorage.getItem(cacheKey);
        } catch(e) { return null; }
    }

    function guardarBase64Cache(msgId, base64) {
        try {
            const cacheKey = FILE_CACHE_PREFIX + msgId;
            const tamaño = base64 ? base64.length * 0.75 : 0;
            if (tamaño > 300 * 1024) return;
            localStorage.setItem(cacheKey, base64);
        } catch(e) {}
    }

    // ============================================================
    // MODAL CONDUCTORES
    // ============================================================
    window.abrirModalConductores = function() {
        const modal = document.getElementById('modalConductores');
        if (modal) modal.classList.add('show');
        renderizarListaConductoresModal();
        const input = document.getElementById('inputNuevoConductor');
        if (input) input.focus();
    };

    window.cerrarModalConductores = function() {
        const modal = document.getElementById('modalConductores');
        if (modal) modal.classList.remove('show');
    };

    window.agregarConductor = function() {
        const inputNombre = document.getElementById('inputNuevoConductor');
        const inputId = document.getElementById('inputNuevoConductorId');
        if (!inputNombre) return;
        const nombre = inputNombre.value.trim();
        const idPersonalizado = inputId ? inputId.value.trim().toUpperCase() : '';

        if (!nombre) {
            mostrarToast('⚠️ Ingresa el nombre del conductor', 'warning');
            inputNombre.focus();
            return;
        }
        if (getConductorByNombre(nombre)) {
            mostrarToast('⚠️ Ya existe un conductor con ese nombre', 'warning');
            inputNombre.focus();
            return;
        }

        let id = idPersonalizado;
        if (!id) {
            id = generarIdConductor();
        } else if (getConductorById(id)) {
            mostrarToast('⚠️ Ese ID ya está en uso', 'warning');
            if (inputId) inputId.focus();
            return;
        }

        const nuevoConductor = {
            id: id,
            nombre: nombre,
            fecha_registro: new Date().toISOString()
        };

        conductoresRegistrados.push(nuevoConductor);
        guardarConductoresLocales();
        renderizarListaConductoresModal();
        renderizarListaConductores();
        actualizarSelectorConductores();

        inputNombre.value = '';
        if (inputId) inputId.value = '';
        inputNombre.focus();

        mostrarToast('✅ Conductor agregado: ' + nombre + ' (' + id + ')', 'success');

        if (conectado) {
            jsonpRequest('registrar_conductor', {
                conductor_id: id,
                nombre: nombre,
                chat_id: 'conductor_' + id
            }).catch(e => log.warn('Error registrando:', e));
        }
    };

    window.eliminarConductor = function(id) {
        if (!confirm('¿Eliminar al conductor ' + id + ' permanentemente?')) return;
        const conductor = getConductorById(id);
        if (!conductor) return;

        conductoresRegistrados = conductoresRegistrados.filter(c => c.id !== id);
        guardarConductoresLocales();

        delete mensajesPorConductor[id];
        delete ultimoMsgIdPorConductor[id];
        delete mensajesNoLeidos[id];
        delete ultimoMensajeVistoPorConductor[id];
        resetearUltimoId(id);
        limpiarUltimoVisto(id);

        if (conductorSeleccionado === id) {
            conductorSeleccionado = null;
            chatInput.disabled = true;
            chatBtnEnviar.disabled = true;
            btnSubirArchivo.disabled = true;
            const nombreSpan = document.getElementById('chatConductorNombre');
            if (nombreSpan) nombreSpan.textContent = 'Selecciona un conductor';
            chatMessages.innerHTML = '<div class="chat-empty"><i class="fas fa-comment-dots"></i> <p>Selecciona un conductor para ver sus mensajes</p></div>';
        }

        renderizarListaConductoresModal();
        renderizarListaConductores();
        actualizarSelectorConductores();
        actualizarMarcadores();
        actualizarContadores();

        mostrarToast('🗑️ Conductor eliminado: ' + conductor.nombre, 'info');
    };

    function renderizarListaConductoresModal() {
        const container = document.getElementById('listaConductoresModal');
        if (!container) return;

        if (conductoresRegistrados.length === 0) {
            container.innerHTML = `
                <div class="empty-conductores-modal">
                    <i class="fas fa-users-slash"></i>
                    <p>No hay conductores registrados. Agrega uno arriba.</p>
                </div>`;
            return;
        }

        let html = `
            <table class="tabla-conductores-modal">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nombre</th>
                        <th>Mensajes</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>`;

        conductoresRegistrados.forEach(conductor => {
            const msgs = mensajesPorConductor[conductor.id] ? mensajesPorConductor[conductor.id].length : 0;
            const estaActivo = conductoresData.some(c => c.id === conductor.id && c.ubicacion && c.activo === true);
            const estadoClass = estaActivo ? 'online' : 'offline';
            const estadoText = estaActivo ? '🟢 Conectado' : '⚪ Inactivo';

            html += `
                <tr>
                    <td><code style="color:var(--neon-purple);font-size:0.5rem;">${escapeHtml(conductor.id)}</code></td>
                    <td><strong>${escapeHtml(conductor.nombre)}</strong></td>
                    <td><span class="badge-msgs-modal">${msgs}</span></td>
                    <td><span class="estado-dot ${estadoClass}"></span> ${estadoText}</td>
                    <td>
                        <button class="btn-editar-conductor" onclick="seleccionarConductor('${conductor.id}'); cerrarModalConductores();">
                            <i class="fas fa-comment"></i> Chat
                        </button>
                        <button class="btn-eliminar-conductor" onclick="eliminarConductor('${conductor.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>`;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
        actualizarTotalConductores();
    }

    // ============================================================
    // RUTAS
    // ============================================================
    function calcularDistancia(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    function inicializarRuta(conductorId, lat, lng) {
        if (!rutasConductores[conductorId]) {
            rutasConductores[conductorId] = { puntos: [{lat, lng}], polyline: null };
        } else {
            rutasConductores[conductorId].puntos = [{lat, lng}];
        }
        actualizarRutaEnMapa(conductorId);
    }

    function agregarPuntoRuta(conductorId, lat, lng) {
        if (!rutasConductores[conductorId]) {
            rutasConductores[conductorId] = { puntos: [], polyline: null };
        }
        const puntos = rutasConductores[conductorId].puntos;
        const ultimo = puntos[puntos.length - 1];
        if (ultimo) {
            const dist = calcularDistancia(ultimo.lat, ultimo.lng, lat, lng);
            if (dist < 0.01) return;
        }
        puntos.push({lat, lng});
        actualizarRutaEnMapa(conductorId);
    }

    function actualizarRutaEnMapa(conductorId) {
        if (!rutasLayer || !rutasConductores[conductorId]) return;
        const data = rutasConductores[conductorId];
        if (data.puntos.length < 2) return;

        const latlngs = data.puntos.map(p => [p.lat, p.lng]);

        if (data.polyline) rutasLayer.removeLayer(data.polyline);

        data.polyline = L.polyline(latlngs, {
            color: '#ffb74d',
            weight: 3,
            opacity: 0.75,
            dashArray: '5, 8',
            smoothFactor: 1
        }).addTo(rutasLayer);

        if (data.puntos.length > 2) {
            if (data.markerInicio) rutasLayer.removeLayer(data.markerInicio);
            if (data.markerFin) rutasLayer.removeLayer(data.markerFin);

            const inicio = data.puntos[0];
            const fin = data.puntos[data.puntos.length - 1];

            data.markerInicio = L.circleMarker([inicio.lat, inicio.lng], {
                radius: 4, color: '#5affa0', fillColor: '#5affa0', fillOpacity: 0.9
            }).addTo(rutasLayer);

            data.markerFin = L.circleMarker([fin.lat, fin.lng], {
                radius: 6, color: '#ffb74d', fillColor: '#ffb74d', fillOpacity: 0.95
            }).addTo(rutasLayer);
        }
    }

    function mostrarRutas() {
        if (!rutasLayer) rutasLayer = L.layerGroup().addTo(mapa);
        Object.keys(rutasConductores).forEach(cid => actualizarRutaEnMapa(cid));
    }

    function ocultarRutas() {
        if (rutasLayer) rutasLayer.clearLayers();
    }

    window.toggleRutas = function() {
        rutasActivas = !rutasActivas;
        const btn = document.getElementById('btnRutasText');
        if (btn) {
            if (rutasActivas) {
                btn.textContent = 'Ocultar Rutas';
                mostrarRutas();
            } else {
                btn.textContent = 'Mostrar Rutas';
                ocultarRutas();
            }
        }
    };

    // ============================================================
    // MAPA
    // ============================================================
    function inicializarMapa() {
        if (mapa) { mapa.remove(); mapa = null; }
        mapa = L.map('mapaGps', {
            center: NICARAGUA_CENTER,
            zoom: ZOOM_DEFAULT,
            maxBounds: NICARAGUA_BOUNDS,
            zoomControl: true
        });

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; Esri',
            maxZoom: 19,
            minZoom: 6
        }).addTo(mapa);

        markersLayer = L.layerGroup().addTo(mapa);
        rutasLayer = L.layerGroup().addTo(mapa);

        mapa.on('click', function() { if (mapa) mapa.closePopup(); });
    }

    // ============================================================
    // MARCADORES
    // ============================================================
    function actualizarMarcadores() {
        if (!mapa || !markersLayer) return;
        markersLayer.clearLayers();
        marcadores = {};

        conductoresData.forEach(conductor => {
            if (!conductor.ubicacion) return;
            if (!conductor.activo) return;
            const registrado = getConductorById(conductor.id);
            if (!registrado) return;

            const tieneNoLeidos = mensajesNoLeidos[conductor.id] === true;

            // 🟡 Marcador AMARILLO si hay no leídos
            const colorPrincipal = tieneNoLeidos ? '#ffb74d' : 'rgba(15,240,212,0.95)';
            const colorSombra = tieneNoLeidos ? 'rgba(255,183,77,0.8)' : 'rgba(15,240,212,0.7)';

            const markerIconActivo = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background:${colorPrincipal};width:18px;height:18px;border-radius:50%;border:2px solid #fff;box-shadow:0 4px 20px ${colorSombra};animation:pulseDot 1.5s infinite;"></div>`,
                iconSize: [22,22],
                iconAnchor: [11,11]
            });

            const marker = L.marker([conductor.ubicacion.lat, conductor.ubicacion.lng], {
                icon: markerIconActivo, riseOnHover: true
            });
            const msgs = mensajesPorConductor[conductor.id] ? mensajesPorConductor[conductor.id].length : 0;
            const tieneRuta = rutasConductores[conductor.id] && rutasConductores[conductor.id].puntos.length > 1;

            const badgeEstado = tieneNoLeidos
                ? '<span style="background:rgba(255,183,77,0.2);color:#ffb74d;padding:2px 8px;border-radius:20px;font-size:0.5rem;font-weight:600;">🟡 Sin leer</span>'
                : '<span style="background:rgba(90,255,160,0.15);color:#5affa0;padding:2px 8px;border-radius:20px;font-size:0.5rem;font-weight:600;">🟢 Activo</span>';

            marker.bindPopup(`
                <div style="font-family:var(--font);min-width:180px;">
                    <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(15,240,212,0.15);padding-bottom:6px;margin-bottom:6px;">
                        <strong style="color:#0ff0d4;font-size:0.8rem;">${escapeHtml(registrado.nombre || conductor.id)}</strong>
                        ${badgeEstado}
                    </div>
                    <div style="font-size:0.6rem;color:#8bb8d0;display:flex;flex-direction:column;gap:3px;">
                        <div><i class="fas fa-id-card" style="width:14px;color:#0ff0d4;"></i> ${escapeHtml(conductor.id)}</div>
                        <div><i class="fas fa-comment" style="width:14px;color:#4df0ff;"></i> ${msgs} mensajes</div>
                        ${tieneRuta ? `<div><i class="fas fa-route" style="width:14px;color:#ffb74d;"></i> ${rutasConductores[conductor.id].puntos.length} puntos</div>` : ''}
                        <div><i class="fas fa-clock" style="width:14px;color:#b56eff;"></i> ${new Date(conductor.ultima_actividad).toLocaleString()}</div>
                    </div>
                    <button onclick="seleccionarConductor('${conductor.id}')" style="background:rgba(15,240,212,0.1);border:1px solid rgba(15,240,212,0.2);color:#0ff0d4;padding:4px 12px;border-radius:20px;cursor:pointer;font-size:0.55rem;margin-top:8px;font-family:var(--font);font-weight:600;width:100%;">
                        <i class="fas fa-comment"></i> Ver Chat
                    </button>
                </div>
            `);
            marker.on('click', function() { seleccionarConductor(conductor.id); });
            markersLayer.addLayer(marker);
            marcadores[conductor.id] = marker;
        });
    }

    // ============================================================
    // LISTA CONDUCTORES
    // ============================================================
    function renderizarListaConductores() {
        if (!vehiculosLista) return;

        const conductoresFiltrados = conductoresData.filter(c =>
            getConductorById(c.id) && c.activo === true && c.ubicacion
        );

        if (conductoresFiltrados.length === 0) {
            vehiculosLista.innerHTML = `<div class="empty-state-gps"><i class="fas fa-users"></i><p>No hay conductores conectados</p></div>`;
            const countEl = document.getElementById('listaCount');
            if (countEl) countEl.textContent = '0';
            return;
        }

        let html = '';
        conductoresFiltrados.forEach(conductor => {
            const registrado = getConductorById(conductor.id);
            const msgs = mensajesPorConductor[conductor.id] ? mensajesPorConductor[conductor.id].length : 0;
            const activeClass = conductorSeleccionado === conductor.id ? 'active' : '';
            const noLeidoClass = mensajesNoLeidos[conductor.id] ? 'no-leido' : '';
            const tiempo = new Date(conductor.ultima_actividad);
            const tiempoStr = tiempo.toLocaleString();

            let ubic = conductor.ubicacion || { lat: 'N/A', lng: 'N/A' };
            if (typeof ubic === 'string') {
                try { ubic = JSON.parse(ubic); } catch(e) { ubic = { lat: 'N/A', lng: 'N/A' }; }
            }
            let latDisplay = 'N/A';
            let lngDisplay = 'N/A';
            if (ubic && ubic.lat !== undefined && ubic.lat !== null && ubic.lat !== 'N/A') {
                const latNum = parseFloat(ubic.lat);
                const lngNum = parseFloat(ubic.lng);
                if (!isNaN(latNum) && !isNaN(lngNum)) {
                    latDisplay = latNum.toFixed(4);
                    lngDisplay = lngNum.toFixed(4);
                }
            }

            const tieneRuta = rutasConductores[conductor.id] && rutasConductores[conductor.id].puntos.length > 1;

            html += `
                <div class="vehiculo-card-gps ${activeClass} ${noLeidoClass}" onclick="seleccionarConductor('${conductor.id}')">
                    <div class="vehiculo-header">
                        <span class="vehiculo-placa"><i class="fas fa-user-circle"></i> ${escapeHtml(registrado ? registrado.nombre : conductor.id)}</span>
                        <span class="vehiculo-estado estado-activo">🟢 Conectado</span>
                    </div>
                    <div class="vehiculo-info">
                        <span><i class="fas fa-id-card"></i> ${escapeHtml(conductor.id)}</span>
                        <span><i class="fas fa-comment"></i> ${msgs} mensajes</span>
                        <span><i class="fas fa-location-dot"></i> ${latDisplay !== 'N/A' ? latDisplay + ', ' + lngDisplay : 'N/A'}</span>
                        ${tieneRuta ? `<span class="badge-ruta"><i class="fas fa-route"></i> ${rutasConductores[conductor.id].puntos.length}</span>` : ''}
                    </div>
                    <div class="vehiculo-ultima">
                        <span><i class="fas fa-clock"></i> ${tiempoStr}</span>
                        ${noLeidoClass ? '<span style="color:#ffb74d;font-size:0.45rem;font-weight:700;"><i class="fas fa-circle"></i> NUEVO</span>' : `<span class="badge-mensajes">📩 ${msgs}</span>`}
                    </div>
                </div>`;
        });
        vehiculosLista.innerHTML = html;
        const countEl = document.getElementById('listaCount');
        if (countEl) countEl.textContent = conductoresFiltrados.length;
    }

    function actualizarContadores() {
        const conductoresFiltrados = conductoresData.filter(c => getConductorById(c.id) && c.activo === true && c.ubicacion);
        const count = conductoresFiltrados.length;
        const vehiculosCount = document.getElementById('vehiculosCount');
        if (vehiculosCount) vehiculosCount.textContent = count + ' conductores';
        if (chatContador) chatContador.textContent = count;
        if (totalConductoresStatus) totalConductoresStatus.textContent = count;
        if (totalConductoresActivos) totalConductoresActivos.textContent = count;
    }

    // ============================================================
    // SELECCIONAR CONDUCTOR
    // ============================================================
    window.seleccionarConductor = function(conductorId) {
        const cambioDeConductor = conductorSeleccionado !== conductorId;

        conductorSeleccionado = conductorId;
        // 🟡 Al seleccionar, quitar la marca de no leído
        mensajesNoLeidos[conductorId] = false;

        const conductor = conductoresData.find(c => c.id === conductorId);
        const registrado = getConductorById(conductorId);

        const nombreSpan = document.getElementById('chatConductorNombre');
        if (nombreSpan) {
            nombreSpan.textContent = registrado ? registrado.nombre || conductorId : 'Selecciona un conductor';
        }

        if (cambioDeConductor && chatMessages) {
            chatMessages.innerHTML = '<div class="chat-empty"><i class="fas fa-spinner fa-pulse"></i> <p>Cargando mensajes...</p></div>';
        }

        if (registrado) {
            chatInput.disabled = false;
            chatBtnEnviar.disabled = false;
            btnSubirArchivo.disabled = false;
        } else {
            chatInput.disabled = true;
            chatBtnEnviar.disabled = true;
            btnSubirArchivo.disabled = true;
        }

        // ✅ Marcar el ÚLTIMO mensaje del chat como visto
        const mensajesActuales = mensajesPorConductor[conductorId] || [];
        if (mensajesActuales.length > 0) {
            const ultimoMsg = mensajesActuales[mensajesActuales.length - 1];
            guardarUltimoVisto(conductorId, ultimoMsg.id);
            log.info('📖 Marcado como visto: ' + ultimoMsg.id + ' en ' + conductorId);
        }

        actualizarSelectorConductores();
        renderizarListaConductores();
        actualizarMarcadores();

        cargarMensajesConductor(conductorId);

        if (conductor && conductor.ubicacion && mapa) {
            mapa.setView([conductor.ubicacion.lat, conductor.ubicacion.lng], 12, { animate: true });
            if (marcadores[conductorId]) marcadores[conductorId].openPopup();
        }
    };

    // ============================================================
    // SELECTOR (CHIPS)
    // ============================================================
    function actualizarSelectorConductores() {
        if (!conductorSelector) return;
        let html = '<span class="label-conductores">📋</span>';
        const conductoresFiltrados = conductoresData.filter(c => getConductorById(c.id) && c.activo === true && c.ubicacion);

        conductoresFiltrados.forEach(c => {
            const registrado = getConductorById(c.id);
            const active = c.id === conductorSeleccionado ? 'active' : '';
            const msgs = mensajesPorConductor[c.id] ? mensajesPorConductor[c.id].length : 0;
            const noLeido = mensajesNoLeidos[c.id] ? 'no-leido' : '';
            html += `<button class="tag-conductor ${active} ${noLeido}"
                data-conductor="${c.id}"
                onclick="seleccionarConductor('${c.id}')"
                title="${escapeHtml(registrado ? registrado.nombre : c.id)}">
                <i class="fas fa-user-circle"></i>
                ${escapeHtml(registrado ? registrado.nombre : c.id)}
                <span class="badge-msgs">${msgs}</span>
            </button>`;
        });

        conductorSelector.innerHTML = html;
    }

    // ============================================================
    // CARGA DE CONDUCTORES
    // ============================================================
    async function cargarConductoresChat() {
        try {
            const data = await jsonpRequest('conductores_conectados', {});

            if (data.ok && data.conductores) {
                const ubicacionesAnteriores = {};
                conductoresData.forEach(c => {
                    if (c.ubicacion) {
                        ubicacionesAnteriores[c.id] = { lat: c.ubicacion.lat, lng: c.ubicacion.lng };
                    }
                });

                conductoresData = data.conductores || [];

                let conductoresAgregados = 0;
                conductoresData.forEach(c => {
                    if (!getConductorById(c.id)) {
                        conductoresRegistrados.push({
                            id: c.id,
                            nombre: c.nombre || 'Conductor ' + c.id,
                            fecha_registro: new Date().toISOString()
                        });
                        conductoresAgregados++;
                    } else {
                        const local = getConductorById(c.id);
                        if (local && c.nombre && local.nombre !== c.nombre) local.nombre = c.nombre;
                    }
                });
                if (conductoresAgregados > 0) guardarConductoresLocales();

                const ahora = Date.now();
                conductoresData.forEach(c => {
                    const ultima = c.ultima_actividad ? new Date(c.ultima_actividad).getTime() : 0;
                    c.activo = (ahora - ultima) < TIEMPO_ACTIVO && c.ubicacion !== null;

                    if (c.ubicacion) {
                        const anterior = ubicacionesAnteriores[c.id];
                        if (anterior) {
                            const distancia = calcularDistancia(anterior.lat, anterior.lng, c.ubicacion.lat, c.ubicacion.lng);
                            if (distancia > 0.02) agregarPuntoRuta(c.id, c.ubicacion.lat, c.ubicacion.lng);
                        } else {
                            inicializarRuta(c.id, c.ubicacion.lat, c.ubicacion.lng);
                        }
                    }
                });

                renderizarListaConductores();
                actualizarMarcadores();
                actualizarContadores();
                actualizarSelectorConductores();

                if (conductorSeleccionado) {
                    const existe = conductoresData.some(c => c.id === conductorSeleccionado && c.activo === true);
                    if (!existe) {
                        conductorSeleccionado = null;
                        const nombreSpan = document.getElementById('chatConductorNombre');
                        if (nombreSpan) nombreSpan.textContent = 'Selecciona un conductor';
                        chatInput.disabled = true;
                        chatBtnEnviar.disabled = true;
                        btnSubirArchivo.disabled = true;
                        chatMessages.innerHTML = '<div class="chat-empty"><i class="fas fa-comment-dots"></i> <p>Selecciona un conductor para ver sus mensajes</p></div>';
                    }
                }

                const conductoresFiltrados = conductoresData.filter(c => getConductorById(c.id) && c.activo === true && c.ubicacion);
                if (conductoresFiltrados.length > 0 && !conductorSeleccionado) {
                    seleccionarConductor(conductoresFiltrados[0].id);
                }

                setStatusLocal('✅ Conectado (' + conductoresFiltrados.length + ' activos)', 'conectado');
                setServerStatus('✅ Conectado al puente', 'on');
                conectado = true;
                reintentos = 0;
            } else {
                setStatusLocal('⚠️ Error al cargar', 'error');
                setServerStatus('⚠️ Error', 'off');
                reintentarConexion();
            }
        } catch (error) {
            setStatusLocal('❌ ' + error.message, 'error');
            setServerStatus('❌ Error de conexión', 'off');
            reintentarConexion();
        }
    }

    function reintentarConexion() {
        if (reintentos < maxReintentos) {
            reintentos++;
            const delay = 5000 * reintentos;
            setTimeout(() => cargarConductoresChat(), delay);
        } else {
            setStatusLocal('❌ Sin conexión', 'error');
            setServerStatus('❌ Servidor no disponible', 'off');
        }
    }

    // ============================================================
    // 🟡 CARGA DE MENSAJES (detecta NO LEÍDOS correctamente)
    // ============================================================
    async function cargarMensajesConductor(conductorId) {
        if (!conductorId) return;
        if (cargandoMensajes[conductorId]) return;
        cargandoMensajes[conductorId] = true;

        try {
            const params = {
                conductor_id: conductorId,
                limite: 100
            };

            const data = await jsonpRequest('mensajes_conductor', params);

            if (data.ok) {
                const mensajesServidor = data.mensajes || [];

                // ✅ REEMPLAZAR mensajes (NO acumular)
                mensajesPorConductor[conductorId] = mensajesServidor.map(msg => {
                    let fechaValida = new Date(msg.fecha);
                    if (isNaN(fechaValida.getTime())) msg.fecha = new Date().toISOString();

                    if (msg.archivo && msg.archivo.fileId) {
                        if (msg.archivo._eliminado) {
                            msg.archivo._pendienteDescarga = false;
                        } else {
                            msg.archivo._driveFile = true;
                            msg.archivo._pendienteDescarga = true;
                            const cached = obtenerBase64Cache(msg.id);
                            if (cached) {
                                msg.archivo.base64 = cached;
                                msg.archivo._pendienteDescarga = false;
                                msg.archivo._driveFile = false;
                            }
                        }
                    }
                    return msg;
                });

                if (data.ultimo_msg_id) {
                    ultimoMsgIdPorConductor[conductorId] = data.ultimo_msg_id;
                    guardarUltimoId(conductorId);
                }

                // ====================================================
                // 🟡 DETECTAR MENSAJES NO VISTOS
                // ====================================================
                const ultimoVisto = ultimoMensajeVistoPorConductor[conductorId] || '';

                let idxUltimoVisto = -1;
                if (ultimoVisto) {
                    idxUltimoVisto = mensajesServidor.findIndex(m => m.id === ultimoVisto);
                }

                // Mensajes NUEVOS = los que están DESPUÉS del último visto
                const mensajesNuevos = idxUltimoVisto >= 0
                    ? mensajesServidor.slice(idxUltimoVisto + 1)
                    : mensajesServidor;

                // Si ES el conductor seleccionado → marcar como leído automáticamente
                if (conductorId === conductorSeleccionado) {
                    renderizarChatSilencioso(conductorId);
                    mensajesNoLeidos[conductorId] = false;

                    // ✅ Actualizar "último visto" con el último mensaje
                    if (mensajesServidor.length > 0) {
                        const ultimo = mensajesServidor[mensajesServidor.length - 1];
                        guardarUltimoVisto(conductorId, ultimo.id);
                    }
                } else {
                    // Si NO está seleccionado → marcar amarillo solo si hay nuevos
                    const yaEstabaNoLeido = mensajesNoLeidos[conductorId] === true;
                    const hayNoLeidos = mensajesNuevos.length > 0;

                    if (hayNoLeidos) {
                        mensajesNoLeidos[conductorId] = true;

                        if (!yaEstabaNoLeido) {
                            const registrado = getConductorById(conductorId);
                            const nombre = registrado ? registrado.nombre : conductorId;
                            mostrarToast('📬 ' + nombre + ' tiene ' + mensajesNuevos.length + ' mensaje(s) nuevo(s)', 'warning');
                            log.info('🟡 ' + mensajesNuevos.length + ' mensajes nuevos en ' + conductorId);
                        }
                    } else {
                        mensajesNoLeidos[conductorId] = false;
                    }
                }

                // Actualizar UI
                actualizarSelectorConductores();
                renderizarListaConductores();
                actualizarMarcadores();

                // Descargar imágenes pendientes
                mensajesPorConductor[conductorId].forEach(msg => {
                    if (msg.archivo && msg.archivo.fileId && msg.archivo._pendienteDescarga && !msg.archivo._eliminado) {
                        if (esImagen(msg.archivo.nombre, msg.archivo.tipo)) {
                            setTimeout(() => descargarYMostrarDrive(msg.id, conductorId), 500);
                        }
                    }
                });
            }
        } catch (error) {
            log.warn('Error cargando mensajes:', error);
        } finally {
            cargandoMensajes[conductorId] = false;
        }
    }

    // ============================================================
    // RENDERIZAR CHAT
    // ============================================================
    function renderizarChatSilencioso(conductorId) {
        const mensajes = mensajesPorConductor[conductorId] || [];

        const mensajesFiltrados = mensajes.filter(msg => {
            if (msg.conductor_id && msg.conductor_id !== conductorId) return false;
            if (msg.mensaje && msg.mensaje.trim() !== '') return true;
            if (msg.archivo) return true;
            if (msg.reaccion) return true;
            return false;
        });

        if (mensajesFiltrados.length === 0) {
            chatMessages.innerHTML = `<div class="chat-empty"><i class="fas fa-comment-dots"></i> <p>No hay mensajes para este conductor</p></div>`;
            chatActualizado = true;
            return;
        }

        let html = '';
        let ultimaFecha = '';
        const mensajesOrdenados = [...mensajesFiltrados].sort((a, b) => {
            const dateA = new Date(a.fecha);
            const dateB = new Date(b.fecha);
            if (isNaN(dateA.getTime())) return 1;
            if (isNaN(dateB.getTime())) return -1;
            return dateA - dateB;
        });

        mensajesOrdenados.forEach(msg => {
            let fechaMsg = new Date(msg.fecha);
            if (isNaN(fechaMsg.getTime())) fechaMsg = new Date();
            const fechaStr = formatearFecha(fechaMsg);
            const horaStr = formatearHora(fechaMsg);

            if (fechaStr !== ultimaFecha) {
                html += `<div class="fecha-divider">${fechaStr}</div>`;
                ultimaFecha = fechaStr;
            }

            const esPropio = msg.remitente === 'GPS Panel' ||
                            msg.remitente === 'Administrador' ||
                            msg.remitente === 'Tú' ||
                            msg.esPropio === true;

            const clase = esPropio ? 'sent' : 'received';
            const nombreDisplay = msg.remitente || 'Conductor';
            const mostrarNombre = !esPropio && nombreDisplay && nombreDisplay !== 'Conductor' && nombreDisplay !== conductorId;

            const tieneReaccion = msg.reaccion && msg.reaccion === '👍';

            html += `<div class="chat-msg ${clase}" data-msg-id="${msg.id}" data-remitente="${escapeHtml(msg.remitente || '')}">`;

            if (mostrarNombre) html += `<span class="nombre">${escapeHtml(nombreDisplay)}</span>`;

            if (msg.mensaje && msg.mensaje.trim() !== '') {
                html += `<div class="msg-text">${escapeHtml(msg.mensaje)}</div>`;
            }

            if (msg.archivo) {
                const archivo = msg.archivo;
                const info = getTipoArchivoInfo(archivo.nombre, archivo.tipo);
                const tamañoKB = (archivo.tamanio / 1024).toFixed(1);
                const esImagenArchivo = esImagen(archivo.nombre, archivo.tipo);

                if (archivo._eliminado) {
                    html += `<div class="archivo-msg eliminado" style="opacity:0.6;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,84,112,0.2);display:flex;align-items:center;gap:10px;margin:4px 0;">
                        <i class="fas ${info.icono}" style="color:#ff5470;font-size:20px;"></i>
                        <div>
                            <div style="font-size:0.6rem;color:#edf9ff;">${escapeHtml(archivo.nombre)}</div>
                            <div style="font-size:0.4rem;color:#ff5470;"><i class="fas fa-trash-alt"></i> Eliminado</div>
                        </div>
                    </div>`;
                } else if (esImagenArchivo && archivo.base64) {
                    html += `<div class="archivo-msg imagen" style="max-width:260px;margin:4px 0;border-radius:10px;overflow:hidden;cursor:pointer;position:relative;background:#0a1628;" onclick="abrirModalImagen('${archivo.base64}')">
                        <img src="data:${archivo.tipo || 'image/png'};base64,${archivo.base64}"
                             alt="${escapeHtml(archivo.nombre)}"
                             loading="lazy">
                        <div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.7);border-radius:20px;padding:2px 8px;font-size:0.4rem;color:rgba(255,255,255,0.9);">
                            <i class="fas fa-expand"></i> ${tamañoKB} KB
                        </div>
                    </div>`;
                } else if (archivo._driveFile && !archivo._eliminado) {
                    html += `<div class="archivo-msg drive" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,183,77,0.05);border-radius:10px;border:1px solid rgba(255,183,77,0.15);max-width:260px;margin:4px 0;">
                        <div style="width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;background:rgba(255,183,77,0.1);font-size:0.9rem;color:#ffb74d;">
                            <i class="fas ${info.icono}"></i>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:0.55rem;color:#edf9ff;">${escapeHtml(archivo.nombre)}</div>
                            <div style="font-size:0.4rem;color:#8bb8d0;">Drive ${tamañoKB} KB</div>
                        </div>
                        <button onclick="event.stopPropagation(); descargarYMostrarDrive('${msg.id}', '${conductorId}')" style="background:rgba(255,183,77,0.1);border:none;color:#ffb74d;width:28px;height:28px;border-radius:50%;cursor:pointer;">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>`;
                }
            }

            if (tieneReaccion) {
                html += `<span class="reaccion-msg">👍</span>`;
            }

            if (!esPropio && conectado) {
                html += `<button class="btn-reaccionar" onclick="event.stopPropagation(); enviarReaccion('${msg.id}', '${escapeHtml(msg.remitente || '')}')" title="Responder con 👍">👍</button>`;
            }

            html += `<span class="hora">${horaStr}</span>`;
            html += `</div>`;
        });

        chatMessages.innerHTML = html;

        requestAnimationFrame(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });

        chatActualizado = true;
    }

    // ============================================================
    // ENVIAR REACCIÓN
    // ============================================================
    function enviarReaccion(msgId, remitente) {
        if (!conectado || !conductorSeleccionado) {
            mostrarToast('❌ No conectado', 'error');
            return;
        }

        const mensajes = mensajesPorConductor[conductorSeleccionado] || [];
        const mensajeIndex = mensajes.findIndex(m => m.id === msgId);
        if (mensajeIndex === -1) {
            mostrarToast('⚠️ Mensaje no encontrado', 'warning');
            return;
        }

        if (mensajes[mensajeIndex].reaccion) {
            mostrarToast('⚠️ Ya reaccionaste a este mensaje', 'warning');
            return;
        }

        mensajes[mensajeIndex].reaccion = '👍';
        mensajes[mensajeIndex].reaccionDe = 'GPS Panel';
        mensajesPorConductor[conductorSeleccionado] = mensajes;
        renderizarChatSilencioso(conductorSeleccionado);

        jsonpRequest('enviar_reaccion', {
            conductor_id: conductorSeleccionado,
            remitente: 'GPS Panel',
            msg_id: msgId,
            reaccion: '👍'
        })
            .then(data => {
                if (data && data.ok) mostrarToast('👍 Reacción enviada', 'success');
            })
            .catch(e => mostrarToast('⚠️ Error enviando reacción', 'warning'));
    }

    // ============================================================
    // SUBIR ARCHIVO POR PARTES
    // ============================================================
    async function subirArchivoPorPartes(file, conductorId, mensajeTexto) {
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const msgId = 'msg_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);

        log.info('Subiendo:', file.name, '| Chunks:', totalChunks);

        try {
            const iniciarResp = await jsonpRequest('iniciar_subida_archivo', {
                conductor_id: conductorId,
                msg_id: msgId,
                nombre: file.name,
                tipo: file.type || 'image/png',
                tamanio: file.size,
                total_chunks: totalChunks
            });

            if (!iniciarResp || !iniciarResp.ok) {
                mostrarToast('❌ Error iniciando subida', 'error');
                return null;
            }

            let chunkEnviados = 0;

            for (let i = 0; i < totalChunks; i++) {
                let intentos = 0;
                let enviado = false;

                while (!enviado && intentos < 3) {
                    try {
                        const start = i * CHUNK_SIZE;
                        const end = Math.min(start + CHUNK_SIZE, file.size);
                        const chunk = file.slice(start, end);
                        const base64Chunk = await leerChunkBase64(chunk);

                        const chunkResp = await enviarChunk({
                            accion: 'subir_chunk_archivo',
                            msg_id: msgId,
                            chunk_index: i,
                            chunk_data: base64Chunk,
                            total_chunks: totalChunks
                        });

                        if (chunkResp && chunkResp.ok) {
                            enviado = true;
                            chunkEnviados++;
                            break;
                        } else {
                            intentos++;
                            await new Promise(r => setTimeout(r, 1000 * intentos));
                        }
                    } catch (e) {
                        intentos++;
                        await new Promise(r => setTimeout(r, 1000 * intentos));
                    }
                }
            }

            if (chunkEnviados < totalChunks) {
                mostrarToast('⚠️ Subida incompleta', 'warning');
                return null;
            }

            const completarResp = await jsonpRequest('completar_subida_archivo', {
                msg_id: msgId,
                conductor_id: conductorId,
                mensaje: mensajeTexto || '',
                archivo_nombre: file.name,
                archivo_tipo: file.type || 'image/png',
                archivo_tamanio: file.size
            });

            if (completarResp && completarResp.ok) {
                return { ok: true, msgId: msgId, completarResp: completarResp };
            }
            return null;
        } catch (error) {
            log.error('Error subiendo:', error);
            return null;
        }
    }

    // ============================================================
    // ENVIAR MENSAJE CON IMAGEN
    // ============================================================
    async function enviarMensajeConArchivo(texto, file) {
        if (!conectado || !conductorSeleccionado) {
            mostrarToast('❌ No conectado', 'error');
            return;
        }

        if (!esSoloImagen(file.name, file.type)) {
            mostrarToast('❌ Solo se permiten imágenes', 'error');
            archivosSeleccionadosChat = [];
            if (fileInputChat) fileInputChat.value = '';
            actualizarArchivosSeleccionadosChat();
            return;
        }

        if (subidaEnProgreso) {
            mostrarToast('⏳ Espera a que termine la subida', 'warning');
            return;
        }

        const tamañoKB = file.size / 1024;

        if (tamañoKB > MAX_FILE_SIZE_KB) {
            mostrarToast('❌ La imagen excede ' + (MAX_FILE_SIZE_KB/1024) + 'MB', 'error');
            return;
        }

        const nombreLimpio = sanitizarNombreArchivo(file.name);
        let fileToSend = file;
        if (nombreLimpio !== file.name) {
            try { fileToSend = new File([file], nombreLimpio, { type: file.type }); } catch(e) {}
        }

        subidaEnProgreso = true;
        if (uploadProgressChat) uploadProgressChat.classList.add('active');

        try {
            const info = getTipoArchivoInfo(fileToSend.name, fileToSend.type);
            const msgId = 'msg_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);

            if (tamañoKB > MAX_SMALL_FILE_KB) {
                chatBtnEnviar.disabled = true;
                chatBtnEnviar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';

                const resultado = await subirArchivoPorPartes(fileToSend, conductorSeleccionado, texto);

                if (resultado && resultado.ok) {
                    mostrarToast('✅ Imagen enviada', 'success');
                    limpiarBarraEnvioChat();
                    setTimeout(() => cargarMensajesConductor(conductorSeleccionado), 1500);
                } else {
                    mostrarToast('⚠️ Error al subir', 'warning');
                }

                chatBtnEnviar.disabled = false;
                chatBtnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i>';
                subidaEnProgreso = false;
                if (uploadProgressChat) uploadProgressChat.classList.remove('active');
                return;
            }

            const base64 = await archivoABase64(fileToSend);
            guardarBase64Cache(msgId, base64);

            chatBtnEnviar.disabled = true;
            chatBtnEnviar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';

            const data = await enviarPost({
                accion: 'enviar_mensaje',
                conductor_id: conductorSeleccionado,
                remitente: 'GPS Panel',
                mensaje: texto || '',
                fecha: new Date().toISOString(),
                archivo_nombre: fileToSend.name,
                archivo_tipo: fileToSend.type || 'image/png',
                archivo_tamanio: fileToSend.size,
                archivo_base64: base64,
                msg_id: msgId
            });

            if (data && data.ok) {
                mostrarToast('✅ Imagen enviada', 'success');
                limpiarBarraEnvioChat();
                setTimeout(() => cargarMensajesConductor(conductorSeleccionado), 1500);
            }

            chatBtnEnviar.disabled = false;
            chatBtnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i>';
            subidaEnProgreso = false;
            if (uploadProgressChat) uploadProgressChat.classList.remove('active');

        } catch (error) {
            log.error('Error:', error);
            mostrarToast('❌ Error: ' + error.message, 'error');
            chatBtnEnviar.disabled = false;
            chatBtnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i>';
            subidaEnProgreso = false;
            if (uploadProgressChat) uploadProgressChat.classList.remove('active');
        }
    }

    // ============================================================
    // DESCARGAR DESDE DRIVE
    // ============================================================
    async function descargarYMostrarDrive(msgId, conductorId) {
        if (descargandoDrive[msgId]) return;
        descargandoDrive[msgId] = true;

        try {
            const mensajes = mensajesPorConductor[conductorId] || [];
            const msg = mensajes.find(m => m.id === msgId);
            if (!msg || !msg.archivo || !msg.archivo.fileId) {
                descargandoDrive[msgId] = false;
                return;
            }

            const data = await jsonpRequest('descargar_archivo_drive', {
                file_id: msg.archivo.fileId,
                msg_id: msgId,
                conductor_id: conductorId
            });

            if (data && data.ok && data.base64) {
                const tamaño = data.base64.length * 0.75;
                if (tamaño < 300 * 1024) guardarBase64Cache(msgId, data.base64);

                const msgIdx = mensajes.findIndex(m => m.id === msgId);
                if (msgIdx !== -1) {
                    mensajes[msgIdx].archivo.base64 = data.base64;
                    mensajes[msgIdx].archivo._driveFile = false;
                    mensajes[msgIdx].archivo._pendienteDescarga = false;
                    mensajesPorConductor[conductorId] = mensajes;
                    if (conductorId === conductorSeleccionado) renderizarChatSilencioso(conductorId);
                }
            }
        } catch (e) {
            log.warn('Error descargando:', e);
        }
        descargandoDrive[msgId] = false;
    }

    // ============================================================
    // ENVIAR MENSAJE (SOLO TEXTO)
    // ============================================================
    window.enviarMensajeChatMadre = function() {
        const texto = chatInput.value.trim();

        if (!conductorSeleccionado) {
            mostrarToast('❌ Selecciona un conductor', 'error');
            return;
        }

        if (!texto && archivosSeleccionadosChat.length === 0) {
            mostrarToast('⚠️ Escribe un mensaje', 'warning');
            return;
        }

        if (archivosSeleccionadosChat.length > 0) {
            enviarMensajeConArchivo(texto, archivosSeleccionadosChat[0]);
            return;
        }

        chatBtnEnviar.disabled = true;
        chatBtnEnviar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';

        const msgId = 'msg_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);

        const nuevoMensaje = {
            id: msgId,
            remitente: 'GPS Panel',
            mensaje: texto,
            fecha: new Date().toISOString(),
            esPropio: true,
            conductor_id: conductorSeleccionado
        };

        mensajesEnviadosIds.add(msgId);
        if (!mensajesPorConductor[conductorSeleccionado]) mensajesPorConductor[conductorSeleccionado] = [];
        mensajesPorConductor[conductorSeleccionado].push(nuevoMensaje);
        renderizarChatSilencioso(conductorSeleccionado);

        // ✅ Marcar como visto el mensaje que acabamos de enviar
        guardarUltimoVisto(conductorSeleccionado, msgId);

        actualizarSelectorConductores();
        renderizarListaConductores();

        jsonpRequest('enviar_mensaje', {
            conductor_id: conductorSeleccionado,
            remitente: 'GPS Panel',
            mensaje: texto,
            fecha: new Date().toISOString(),
            msg_id: msgId
        })
        .then(data => {
            if (data && data.ok) {
                limpiarBarraEnvioChat();
                mostrarToast('✅ Mensaje enviado', 'success');
                setTimeout(() => cargarMensajesConductor(conductorSeleccionado), 1500);
            }
        })
        .catch(e => {
            mostrarToast('⚠️ Mensaje en cola', 'info');
        })
        .finally(() => {
            chatBtnEnviar.disabled = false;
            chatBtnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i>';
        });
    };

    // ============================================================
    // UI ARCHIVOS SELECCIONADOS
    // ============================================================
    function actualizarArchivosSeleccionadosChat() {
        if (archivosSeleccionadosChat.length === 0) {
            if (archivosSeleccionadosChatDiv) archivosSeleccionadosChatDiv.style.display = 'none';
            if (badgeArchivosChat) badgeArchivosChat.style.display = 'none';
            if (uploadProgressChat) uploadProgressChat.classList.remove('active');
            if (progressTextChat) progressTextChat.textContent = '';
            return;
        }
        let html = '';
        archivosSeleccionadosChat.forEach((file, index) => {
            const info = getTipoArchivoInfo(file.name, file.type);
            html += `<span class="tag-archivo">
                <i class="fas ${info.icono}"></i>
                ${escapeHtml(file.name)} (${(file.size/1024/1024).toFixed(1)+' MB'})
                <span class="remove" onclick="eliminarArchivoSeleccionadoChat(${index})">✕</span>
            </span>`;
        });
        if (archivosSeleccionadosChatDiv) {
            archivosSeleccionadosChatDiv.innerHTML = html;
            archivosSeleccionadosChatDiv.style.display = 'flex';
        }
        if (badgeArchivosChat) {
            badgeArchivosChat.textContent = archivosSeleccionadosChat.length;
            badgeArchivosChat.style.display = 'inline';
        }
    }

    window.eliminarArchivoSeleccionadoChat = function(index) {
        archivosSeleccionadosChat.splice(index, 1);
        actualizarArchivosSeleccionadosChat();
        if (archivosSeleccionadosChat.length === 0 && fileInputChat) fileInputChat.value = '';
    };

    window.abrirExploradorArchivosChat = function() {
        if (!conductorSeleccionado) {
            mostrarToast('⚠️ Selecciona un conductor', 'warning');
            return;
        }
        if (subidaEnProgreso) {
            mostrarToast('⏳ Espera a que termine la subida', 'warning');
            return;
        }
        if (fileInputChat) {
            fileInputChat.accept = 'image/*';
            fileInputChat.click();
        }
    };

    if (fileInputChat) {
        fileInputChat.addEventListener('change', function() {
            var nuevosArchivos = Array.from(this.files);
            if (nuevosArchivos.length === 0) return;
            if (archivosSeleccionadosChat.length + nuevosArchivos.length > 1) {
                mostrarToast('⚠️ Solo 1 archivo por mensaje', 'warning');
                this.value = '';
                return;
            }
            const file = nuevosArchivos[0];

            if (!esSoloImagen(file.name, file.type)) {
                mostrarToast('❌ Solo se permiten imágenes', 'error');
                this.value = '';
                return;
            }

            archivosSeleccionadosChat = archivosSeleccionadosChat.concat(nuevosArchivos);
            actualizarArchivosSeleccionadosChat();
            this.value = '';
            mostrarToast('📸 Imagen lista para enviar', 'info');
        });
    }

    // ============================================================
    // MODAL IMAGEN
    // ============================================================
    window.abrirModalImagen = function(src) {
        if (imagenAmpliada) imagenAmpliada.src = src;
        if (modalImagen) {
            modalImagen.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    };

    window.cerrarModalImagen = function() {
        if (modalImagen) {
            modalImagen.classList.remove('active');
            document.body.style.overflow = '';
        }
    };

    window.enviarReaccion = enviarReaccion;
    window.descargarYMostrarDrive = descargarYMostrarDrive;

    // ============================================================
    // LIMPIAR MENSAJES
    // ============================================================
    window.limpiarTodosMensajesMadre = function() {
        if (!conductorSeleccionado) {
            mostrarToast('❌ Selecciona un conductor', 'error');
            return;
        }

        const msgs = mensajesPorConductor[conductorSeleccionado] || [];
        if (msgs.length === 0) {
            mostrarToast('⚠️ No hay mensajes', 'warning');
            return;
        }

        if (!confirm('🗑️ ¿Eliminar TODOS los mensajes de ' + conductorSeleccionado + '?')) return;

        mensajesPorConductor[conductorSeleccionado] = [];
        resetearUltimoId(conductorSeleccionado);
        limpiarUltimoVisto(conductorSeleccionado);
        mensajesNoLeidos[conductorSeleccionado] = false;
        mensajesEnviadosIds = new Set();

        if (conectado) {
            jsonpRequest('limpiar_todos_mensajes', {
                conductor_id: conductorSeleccionado
            }).catch(e => {});
        }

        renderizarChatSilencioso(conductorSeleccionado);
        actualizarSelectorConductores();
        renderizarListaConductores();

        mostrarToast('🗑️ Mensajes eliminados', 'success');
    };

    // ============================================================
    // VER UBICACIÓN
    // ============================================================
    window.verUbicacionConductor = function(conductorId) {
        const conductor = conductoresData.find(c => c.id === conductorId);
        if (!conductor || !conductor.ubicacion) {
            mostrarToast('❌ Ubicación no disponible', 'error');
            return;
        }

        const modal = document.getElementById('modalUbicacion');
        const registrado = getConductorById(conductorId);
        const nombreEl = document.getElementById('modalConductorNombre');
        if (nombreEl) nombreEl.textContent = registrado ? registrado.nombre : conductorId;
        const idEl = document.getElementById('modalConductorId');
        if (idEl) idEl.textContent = conductor.id;
        const fechaEl = document.getElementById('modalFecha');
        if (fechaEl) fechaEl.textContent = new Date(conductor.ultima_actividad || Date.now()).toLocaleString();
        const msgs = mensajesPorConductor[conductor.id] ? mensajesPorConductor[conductor.id].length : 0;
        const msgsEl = document.getElementById('modalMensajesCount');
        if (msgsEl) msgsEl.textContent = msgs + ' mensajes';
        const coordsEl = document.getElementById('modalCoordenadas');
        if (coordsEl) coordsEl.textContent = `${conductor.ubicacion.lat.toFixed(5)}, ${conductor.ubicacion.lng.toFixed(5)}`;
        const mapLink = document.getElementById('modalMapLink');
        if (mapLink) mapLink.href = `https://www.google.com/maps?q=${conductor.ubicacion.lat},${conductor.ubicacion.lng}`;
        if (modal) modal.classList.add('show');
    };

    window.cerrarModalUbicacion = function() {
        const modal = document.getElementById('modalUbicacion');
        if (modal) modal.classList.remove('show');
    };

    window.cerrarModalConfirmacion = function() {
        const modal = document.getElementById('modalConfirmacion');
        if (modal) modal.classList.remove('show');
    };

    window.confirmarEliminar = function() {
        window.cerrarModalConfirmacion();
    };

    // ============================================================
    // MAPA - FUNCIONES GLOBALES
    // ============================================================
    window.centrarMapa = function() {
        if (mapa) {
            if (conductorSeleccionado) {
                const conductor = conductoresData.find(c => c.id === conductorSeleccionado);
                if (conductor && conductor.ubicacion) {
                    mapa.setView([conductor.ubicacion.lat, conductor.ubicacion.lng], 12, { animate: true });
                    return;
                }
            }
            mapa.setView(NICARAGUA_CENTER, ZOOM_DEFAULT, { animate: true });
            mostrarToast('Mapa centrado', 'info');
        }
    };

    window.actualizarUbicaciones = function() {
        mostrarToast('🔄 Actualizando...', 'info');
        cargarConductoresChat();
        setTimeout(() => mostrarToast('✅ Actualizado', 'success'), 2000);
    };

    window.cargarConductoresChat = cargarConductoresChat;

    window.refrescarChatMadre = function() {
        cargarConductoresChat();
        if (conductorSeleccionado) cargarMensajesConductor(conductorSeleccionado);
    };

    // ============================================================
    // POLLING
    // ============================================================
    function iniciarEscuchaChat() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(() => {
            cargarConductoresChat();
            // Cargar mensajes de TODOS los conductores activos para detectar no leídos
            const conductoresFiltrados = conductoresData.filter(c =>
                getConductorById(c.id) && c.activo === true && c.ubicacion
            );
            conductoresFiltrados.forEach(c => {
                cargarMensajesConductor(c.id);
            });
        }, POLLING_INTERVAL);
    }

    // ============================================================
    // EVENTOS
    // ============================================================
    if (chatInput) {
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.enviarMensajeChatMadre();
            }
        });
    }

    // ============================================================
    // INICIALIZACIÓN
    // ============================================================
    function inicializar() {
        log.info('Inicializando v23.0 · No leídos inteligentes');
        log.info('Puente:', API_URL);
        log.info('Origen:', ORIGEN);
        log.info('Polling:', (POLLING_INTERVAL/1000) + 's');

        cargarConductoresLocales();

        // ✅ Precargar el "último visto" de todos los conductores
        conductoresRegistrados.forEach(c => {
            cargarUltimoVisto(c.id);
        });

        if (chatInput) chatInput.disabled = true;
        if (chatBtnEnviar) chatBtnEnviar.disabled = true;
        if (btnSubirArchivo) btnSubirArchivo.disabled = true;

        inicializarMapa();

        setTimeout(function() {
            cargarConductoresChat();
            iniciarEscuchaChat();
        }, 1000);

        log.info('Inicializado con ' + conductoresRegistrados.length + ' conductores');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        inicializar();
    }

    window.addEventListener('beforeunload', function() {
        if (pollingInterval) clearInterval(pollingInterval);
    });

})();