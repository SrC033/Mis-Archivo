// ============================================================
// UBICACIÓN - SERVIDOR CENTRAL v31.1
// GPS + Chat Conductores · GSN
// 🟡 NO LEÍDOS · POST DIRECTO hasta 50 MB
// 📥 LEE ARCHIVOS desde UBICACIÓN (tu PC) · Sin Drive
// 🎬 v31.1: Punto de conexión en el header (verde/rojo/ámbar)
// ============================================================
(function() {
    "use strict";

    // ============================================================
    // CONFIGURACIÓN
    // ============================================================
    const API_URL = 'https://script.google.com/macros/s/AKfycbziH8LVFWtfXSHr3QikZGSBiQcKdCgB-IJCg-PnzQ6V031kz0pXr8YndULcFkuuWEWr7g/exec';
    const CLAVE_CARPETA = 'GSN-DASHBOARD-2026';
    const STORAGE_KEY = 'conductores_registrados';
    const ULTIMO_ID_KEY = 'ultimo_id_';
    const ULTIMO_VISTO_KEY = 'ultimo_visto_';
    const FILE_CACHE_PREFIX = 'file_';
    const DESCARGADOS_KEY = 'archivos_descargados_lista';
    const CACHE_MAX_MB = 4;

    const API_LOCAL = (window.location.origin && window.location.origin !== 'null')
        ? window.location.origin + '/api'
        : 'http://127.0.0.1:5500/api';
    let API_LOCAL_DISPONIBLE = false;

    const MAX_FILE_SIZE_KB = 102400;
    const MAX_SMALL_FILE_KB = 51200;

    const POLLING_INTERVAL = 8000;
    const POLLING_TRANSFER = 400;
    const TIEMPO_ACTIVO = 300000;

    // ============================================================
    // TIPOS DE ARCHIVO PERMITIDOS
    // ============================================================
    const TIPOS_PERMITIDOS = {
        'image/jpeg': 'imagen', 'image/jpg': 'imagen', 'image/png': 'imagen',
        'image/gif': 'imagen', 'image/webp': 'imagen', 'image/svg+xml': 'imagen',
        'image/bmp': 'imagen', 'image/heic': 'imagen', 'image/heif': 'imagen',
        'video/mp4': 'video', 'video/webm': 'video', 'video/quicktime': 'video',
        'video/x-msvideo': 'video', 'video/x-matroska': 'video',
        'audio/mpeg': 'audio', 'audio/mp3': 'audio', 'audio/wav': 'audio',
        'audio/ogg': 'audio', 'audio/m4a': 'audio', 'audio/aac': 'audio',
        'audio/webm': 'audio',
        'application/pdf': 'pdf',
        'application/msword': 'documento',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'documento',
        'application/vnd.ms-excel': 'excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
        'application/vnd.ms-powerpoint': 'powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'powerpoint',
        'application/zip': 'zip',
        'application/x-rar-compressed': 'rar',
        'text/plain': 'documento'
    };

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
    let mensajesNoLeidos = {};
    let ultimoMensajeVistoPorConductor = {};
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
    let chatActualizado = false;
    let descargasEnProgreso = new Set();
    let descargasRecientes = [];
    let panelDescargas = null;

    const descargasActivas = {};
    const transfersEnProgreso = {};

    const NICARAGUA_CENTER = [12.8654, -85.2072];
    const NICARAGUA_BOUNDS = [[10.7, -87.7], [15.0, -83.1]];
    const ZOOM_DEFAULT = 7;

    // ============================================================
    // REFERENCIAS DOM (las que SÍ existen)
    // ============================================================
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatBtnEnviar = document.getElementById('chatBtnEnviar');
    const btnSubirArchivo = document.getElementById('btnSubirArchivoChat');
    const chatContador = document.getElementById('chatContador');
    const conductorSelector = document.getElementById('conductorSelector');
    const totalConductoresStatus = document.getElementById('totalConductoresStatus');
    const totalConductoresActivos = document.getElementById('totalConductoresActivos');
    const vehiculosLista = document.getElementById('vehiculosLista');
    const modalImagen = document.getElementById('modalImagen');
    const imagenAmpliada = document.getElementById('imagenAmpliada');
    const headerStatusDot = document.getElementById('headerStatusDot');

    // ✅ Ya NO referenciamos: serverStatusText, serverDot, statusTextLocal, statusDotLocal
    //    porque esos elementos fueron eliminados del HTML

    // ============================================================
    // FILE INPUT OCULTO
    // ============================================================
    fileInputChat = document.createElement('input');
    fileInputChat.type = 'file';
    fileInputChat.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt';
    fileInputChat.style.display = 'none';
    document.body.appendChild(fileInputChat);

    // ============================================================
    // PANEL DE NOTIFICACIONES
    // ============================================================
    function crearPanelDescargas() {
        if (panelDescargas) return;
        panelDescargas = document.createElement('div');
        panelDescargas.id = 'panelDescargasGPS';
        panelDescargas.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-width: 380px;
            pointer-events: none;
            font-family: var(--font, 'Inter', sans-serif);
        `;
        document.body.appendChild(panelDescargas);
    }

    function notificarDescarga(tipo, mensaje, duracion) {
        crearPanelDescargas();
        duracion = duracion || 5000;

        const colores = {
            'iniciando': { bg: 'rgba(96,165,250,0.15)', border: '#60a5fa', icono: 'fa-download', texto: '#60a5fa' },
            'completado': { bg: 'rgba(90,255,160,0.15)', border: '#5affa0', icono: 'fa-check-circle', texto: '#5affa0' },
            'error': { bg: 'rgba(255,84,112,0.15)', border: '#ff5470', icono: 'fa-exclamation-circle', texto: '#ff5470' },
            'info': { bg: 'rgba(15,240,212,0.15)', border: '#0ff0d4', icono: 'fa-info-circle', texto: '#0ff0d4' }
        };

        const c = colores[tipo] || colores.info;

        const notif = document.createElement('div');
        notif.style.cssText = `
            background: ${c.bg};
            border: 1px solid ${c.border};
            border-left: 4px solid ${c.border};
            border-radius: 12px;
            padding: 12px 16px;
            color: #edf9ff;
            font-size: 0.75rem;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            backdrop-filter: blur(10px);
            pointer-events: auto;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideInRight 0.3s ease-out;
        `;
        notif.innerHTML = `
            <i class="fas ${c.icono}" style="color:${c.texto};font-size:1.1rem;flex-shrink:0;"></i>
            <div style="flex:1;line-height:1.4;">${mensaje}</div>
        `;

        panelDescargas.appendChild(notif);

        if (duracion > 0) {
            setTimeout(() => {
                notif.style.opacity = '0';
                notif.style.transform = 'translateX(100px)';
                setTimeout(() => notif.remove(), 300);
            }, duracion);
        }

        while (panelDescargas.children.length > 5) {
            panelDescargas.removeChild(panelDescargas.firstChild);
        }
    }

    // ============================================================
    // 🎬 MODAL DE DESCARGA CON ANIMACIÓN
    // ============================================================
    function crearModalDescarga() {
        let modal = document.getElementById('modalDescargaGPS');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'modalDescargaGPS';
        modal.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(10,22,40,0.85);
            backdrop-filter: blur(8px);
            z-index: 99998;
            display: none;
            align-items: center;
            justify-content: center;
            font-family: var(--font, 'Inter', sans-serif);
        `;
        modal.innerHTML = `
            <div id="modalDescargaBox" style="
                background: linear-gradient(135deg, rgba(15,30,50,0.98), rgba(10,22,40,0.98));
                border: 1px solid rgba(15,240,212,0.25);
                border-radius: 20px;
                padding: 28px 32px;
                max-width: 440px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(15,240,212,0.1);
                animation: modalDescargaIn 0.3s ease-out;
                position: relative;
                overflow: hidden;
            ">
                <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#0ff0d4,#60a5fa,#b56eff);background-size:200% 100%;animation:shimmer 2s linear infinite;"></div>
                <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
                    <div id="modalDescargaIcono" style="width:48px;height:48px;border-radius:12px;background:rgba(15,240,212,0.12);color:#0ff0d4;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;animation:pulseIcon 1.5s ease-in-out infinite;">
                        <i class="fas fa-download"></i>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div id="modalDescargaTitulo" style="color:#edf9ff;font-size:0.95rem;font-weight:700;margin-bottom:2px;">Descargando...</div>
                        <div id="modalDescargaSubtitulo" style="color:#8bb8d0;font-size:0.7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Preparando archivo</div>
                    </div>
                </div>

                <div style="margin-bottom:16px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                        <span id="modalDescargaEstado" style="color:#0ff0d4;font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Iniciando</span>
                        <span id="modalDescargaPorcentaje" style="color:#edf9ff;font-size:0.7rem;font-weight:700;font-variant-numeric:tabular-nums;">0%</span>
                    </div>
                    <div style="height:8px;background:rgba(15,240,212,0.08);border-radius:20px;overflow:hidden;position:relative;">
                        <div id="modalDescargaBarra" style="height:100%;width:0%;background:linear-gradient(90deg,#0ff0d4,#60a5fa);border-radius:20px;transition:width 0.3s ease-out;box-shadow:0 0 12px rgba(15,240,212,0.6);"></div>
                    </div>
                </div>

                <div id="modalDescargaDetalles" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.6rem;color:#8bb8d0;">
                    <div style="background:rgba(15,240,212,0.04);padding:8px 10px;border-radius:8px;border:1px solid rgba(15,240,212,0.1);">
                        <div style="color:#0ff0d4;font-size:0.55rem;margin-bottom:2px;">📦 Chunks</div>
                        <div id="modalDescargaChunks" style="color:#edf9ff;font-weight:600;">0 / 0</div>
                    </div>
                    <div style="background:rgba(15,240,212,0.04);padding:8px 10px;border-radius:8px;border:1px solid rgba(15,240,212,0.1);">
                        <div style="color:#0ff0d4;font-size:0.55rem;margin-bottom:2px;">📊 Recibido</div>
                        <div id="modalDescargaBytes" style="color:#edf9ff;font-weight:600;">0 KB</div>
                    </div>
                    <div style="background:rgba(15,240,212,0.04);padding:8px 10px;border-radius:8px;border:1px solid rgba(15,240,212,0.1);">
                        <div style="color:#0ff0d4;font-size:0.55rem;margin-bottom:2px;">⏱️ Tiempo</div>
                        <div id="modalDescargaTiempo" style="color:#edf9ff;font-weight:600;">0.0s</div>
                    </div>
                    <div style="background:rgba(15,240,212,0.04);padding:8px 10px;border-radius:8px;border:1px solid rgba(15,240,212,0.1);">
                        <div style="color:#0ff0d4;font-size:0.55rem;margin-bottom:2px;">⚡ Velocidad</div>
                        <div id="modalDescargaVelocidad" style="color:#edf9ff;font-weight:600;">0 KB/s</div>
                    </div>
                </div>

                <div id="modalDescargaMensaje" style="margin-top:16px;padding:10px 12px;background:rgba(15,240,212,0.06);border-radius:8px;border-left:3px solid #0ff0d4;color:#8bb8d0;font-size:0.65rem;line-height:1.5;display:none;"></div>
            </div>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    function mostrarModalDescarga(msgId, nombre, tamañoBytes, tipo) {
        const modal = crearModalDescarga();
        modal.style.display = 'flex';

        const info = getTipoArchivoInfo(nombre, tipo);

        document.getElementById('modalDescargaTitulo').textContent = 'Descargando ' + info.clase;
        document.getElementById('modalDescargaSubtitulo').textContent = nombre;
        document.getElementById('modalDescargaIcono').innerHTML = `<i class="fas ${info.icono} fa-pulse"></i>`;
        document.getElementById('modalDescargaIcono').style.color = info.color;
        document.getElementById('modalDescargaIcono').style.background = info.color + '22';
        document.getElementById('modalDescargaIcono').style.animation = 'pulseIcon 1.5s ease-in-out infinite';
        document.getElementById('modalDescargaEstado').textContent = 'Iniciando';
        document.getElementById('modalDescargaPorcentaje').textContent = '0%';
        document.getElementById('modalDescargaBarra').style.width = '0%';
        document.getElementById('modalDescargaChunks').textContent = '0 / 0';
        document.getElementById('modalDescargaBytes').textContent = '0 KB';
        document.getElementById('modalDescargaTiempo').textContent = '0.0s';
        document.getElementById('modalDescargaVelocidad').textContent = '0 KB/s';
        const msjEl = document.getElementById('modalDescargaMensaje');
        msjEl.style.display = 'none';
        msjEl.textContent = '';
    }

    function actualizarModalDescarga(datos) {
        const modal = document.getElementById('modalDescargaGPS');
        if (!modal || modal.style.display === 'none') return;

        if (datos.titulo) document.getElementById('modalDescargaTitulo').textContent = datos.titulo;
        if (datos.subtitulo) document.getElementById('modalDescargaSubtitulo').textContent = datos.subtitulo;
        if (datos.estado) document.getElementById('modalDescargaEstado').textContent = datos.estado;
        if (datos.porcentaje !== undefined) {
            document.getElementById('modalDescargaPorcentaje').textContent = datos.porcentaje + '%';
            document.getElementById('modalDescargaBarra').style.width = datos.porcentaje + '%';
        }
        if (datos.chunks) document.getElementById('modalDescargaChunks').textContent = datos.chunks;
        if (datos.bytes) document.getElementById('modalDescargaBytes').textContent = datos.bytes;
        if (datos.tiempo) document.getElementById('modalDescargaTiempo').textContent = datos.tiempo;
        if (datos.velocidad) document.getElementById('modalDescargaVelocidad').textContent = datos.velocidad;
        if (datos.mensaje) {
            const msjEl = document.getElementById('modalDescargaMensaje');
            msjEl.style.display = 'block';
            msjEl.textContent = datos.mensaje;
        }
        if (datos.icono) {
            document.getElementById('modalDescargaIcono').innerHTML = `<i class="fas ${datos.icono}"></i>`;
        }
        if (datos.iconoColor) {
            const iconoEl = document.getElementById('modalDescargaIcono');
            iconoEl.style.color = datos.iconoColor;
            iconoEl.style.background = datos.iconoColor + '22';
        }
        if (datos.iconoAnimacion !== undefined) {
            document.getElementById('modalDescargaIcono').style.animation = datos.iconoAnimacion;
        }
    }

    function cerrarModalDescarga() {
        const modal = document.getElementById('modalDescargaGPS');
        if (modal) {
            modal.style.opacity = '0';
            modal.style.transition = 'opacity 0.3s';
            setTimeout(() => {
                modal.style.display = 'none';
                modal.style.opacity = '1';
            }, 300);
        }
    }

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
            log.warn('Ejecutando desde file://');
            return 'file';
        }
        return 'http';
    }
    const ORIGEN = detectarOrigen();

    // ============================================================
    // DETECTAR API LOCAL
    // ============================================================
    async function detectarApiLocal() {
        try {
            const resp = await fetch(API_LOCAL + '/status', {
                method: 'GET',
                cache: 'no-store'
            });
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.status === 'running') {
                    API_LOCAL_DISPONIBLE = true;
                    log.info('✅ API LOCAL detectada (puerto 5500)');
                    return true;
                }
            }
        } catch (e) {
            log.warn('⚠️ API local no disponible:', e.message);
        }
        API_LOCAL_DISPONIBLE = false;
        return false;
    }

    function getUrlArchivoUbicacion(conductorId, msgId) {
        if (!API_LOCAL_DISPONIBLE) return null;
        return API_LOCAL + '/archivo/' +
               encodeURIComponent(conductorId) + '/' +
               encodeURIComponent(msgId);
    }

    async function verificarArchivoEnDisco(msgId, conductorId) {
        if (!API_LOCAL_DISPONIBLE) return false;
        try {
            const resp = await fetch(API_LOCAL + '/archivo/verificar/' +
                encodeURIComponent(conductorId) + '/' + encodeURIComponent(msgId));
            if (resp.ok) {
                const data = await resp.json();
                return data && data.existe === true;
            }
        } catch (e) {}
        return false;
    }

    async function leerArchivoDelDisco(msgId, conductorId) {
        if (!API_LOCAL_DISPONIBLE) return null;
        try {
            const resp = await fetch(API_LOCAL + '/archivo/' +
                encodeURIComponent(conductorId) + '/' +
                encodeURIComponent(msgId) + '?formato=base64');
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.ok && data.base64) {
                    return data.base64;
                }
            }
        } catch (e) {}
        return null;
    }

    // ============================================================
    // CACHÉ EN LOCALSTORAGE
    // ============================================================
    function yaFueDescargado(msgId) {
        try {
            const descargados = JSON.parse(localStorage.getItem(DESCARGADOS_KEY) || '{}');
            return descargados[msgId] === true;
        } catch(e) { return false; }
    }

    function marcarComoDescargado(msgId) {
        try {
            const descargados = JSON.parse(localStorage.getItem(DESCARGADOS_KEY) || '{}');
            descargados[msgId] = true;
            const keys = Object.keys(descargados);
            if (keys.length > 500) {
                const nuevas = {};
                keys.slice(-500).forEach(k => nuevas[k] = true);
                localStorage.setItem(DESCARGADOS_KEY, JSON.stringify(nuevas));
            } else {
                localStorage.setItem(DESCARGADOS_KEY, JSON.stringify(descargados));
            }
        } catch(e) {}
    }

    function obtenerBase64Cache(msgId) {
        try {
            return localStorage.getItem(FILE_CACHE_PREFIX + msgId);
        } catch(e) { return null; }
    }

    function guardarBase64Cache(msgId, base64) {
        if (!base64) return;
        try {
            const tamañoBytes = base64.length * 0.75;
            const tamañoMB = tamañoBytes / 1024 / 1024;

            if (tamañoMB > 2) {
                log.info('📦 Archivo grande (' + tamañoMB.toFixed(2) + ' MB), no se cachea localmente');
                return;
            }

            let totalCache = 0;
            const cacheKeys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(FILE_CACHE_PREFIX)) {
                    const v = localStorage.getItem(k) || '';
                    totalCache += v.length;
                    cacheKeys.push({ key: k, size: v.length });
                }
            }

            if (totalCache + base64.length > CACHE_MAX_MB * 1024 * 1024) {
                log.warn('⚠️ Caché local llena (' + (totalCache/1024/1024).toFixed(1) + ' MB), limpiando...');
                cacheKeys.sort((a, b) => a.size - b.size);
                let eliminados = 0;
                for (const entry of cacheKeys) {
                    if (totalCache + base64.length <= CACHE_MAX_MB * 1024 * 1024) break;
                    localStorage.removeItem(entry.key);
                    totalCache -= entry.size;
                    eliminados++;
                }
                log.info('🧹 ' + eliminados + ' entradas eliminadas de caché');
            }

            localStorage.setItem(FILE_CACHE_PREFIX + msgId, base64);
        } catch(e) {
            log.warn('⚠️ No se pudo guardar en caché:', e.message);
        }
    }

    // ============================================================
    // GESTIÓN DE ÚLTIMO ID
    // ============================================================
    function guardarUltimoId(conductorId) {
        try {
            const id = ultimoMsgIdPorConductor[conductorId] || '';
            if (id) localStorage.setItem(ULTIMO_ID_KEY + conductorId, id);
        } catch(e) {}
    }

    function cargarUltimoId(conductorId) {
        try {
            const valor = localStorage.getItem(ULTIMO_ID_KEY + conductorId);
            ultimoMsgIdPorConductor[conductorId] = valor || '';
            return !!valor;
        } catch(e) {
            ultimoMsgIdPorConductor[conductorId] = '';
            return false;
        }
    }

    function resetearUltimoId(conductorId) {
        ultimoMsgIdPorConductor[conductorId] = '';
        try { localStorage.removeItem(ULTIMO_ID_KEY + conductorId); } catch(e) {}
    }

    function guardarUltimoVisto(conductorId, msgId) {
        try {
            ultimoMensajeVistoPorConductor[conductorId] = msgId;
            localStorage.setItem(ULTIMO_VISTO_KEY + conductorId, msgId);
        } catch(e) {}
    }

    function cargarUltimoVisto(conductorId) {
        try {
            const valor = localStorage.getItem(ULTIMO_VISTO_KEY + conductorId);
            ultimoMensajeVistoPorConductor[conductorId] = valor || '';
            return valor || '';
        } catch(e) {
            ultimoMensajeVistoPorConductor[conductorId] = '';
            return '';
        }
    }

    function limpiarUltimoVisto(conductorId) {
        ultimoMensajeVistoPorConductor[conductorId] = '';
        try { localStorage.removeItem(ULTIMO_VISTO_KEY + conductorId); } catch(e) {}
    }

    // ============================================================
    // TIPOS DE ARCHIVO
    // ============================================================
    function esTipoPermitido(nombre, tipo) {
        if (TIPOS_PERMITIDOS[tipo]) return true;
        const ext = (nombre || '').toLowerCase().split('.').pop();
        return /^(jpg|jpeg|png|gif|webp|svg|bmp|heic|heif|avif|mp4|webm|mov|avi|mkv|mp3|wav|ogg|m4a|aac|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt)$/i.test(ext);
    }

    function getTipoArchivoInfo(nombre, tipo) {
        const clase = TIPOS_PERMITIDOS[tipo] || 'documento';
        const m = {
            'imagen':      { icono: 'fa-image',           color: '#10b981', clase: 'imagen' },
            'video':       { icono: 'fa-video',           color: '#a78bfa', clase: 'video' },
            'audio':       { icono: 'fa-music',           color: '#fbbf24', clase: 'audio' },
            'pdf':         { icono: 'fa-file-pdf',        color: '#f87171', clase: 'pdf' },
            'documento':   { icono: 'fa-file-alt',        color: '#38bdf8', clase: 'documento' },
            'excel':       { icono: 'fa-file-excel',      color: '#10b981', clase: 'excel' },
            'powerpoint':  { icono: 'fa-file-powerpoint', color: '#f97316', clase: 'powerpoint' },
            'zip':         { icono: 'fa-file-archive',    color: '#94a3b8', clase: 'zip' },
            'rar':         { icono: 'fa-file-archive',    color: '#94a3b8', clase: 'rar' }
        };
        return m[clase] || m['documento'];
    }

    function esImagen(nombre, tipo) {
        return (TIPOS_PERMITIDOS[tipo] === 'imagen') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|heic|heif|avif)$/i.test(nombre || '');
    }

    function esVideo(nombre, tipo) {
        return (TIPOS_PERMITIDOS[tipo] === 'video') || /\.(mp4|webm|mov|avi|mkv)$/i.test(nombre || '');
    }

    function esAudio(nombre, tipo) {
        return (TIPOS_PERMITIDOS[tipo] === 'audio') || /\.(mp3|wav|ogg|m4a|aac)$/i.test(nombre || '');
    }

    function formatearTamaño(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }

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

    function escapeHtml(text) {
        if (!text) return "";
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

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
    }

    // ============================================================
    // API GET (APPS SCRIPT)
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

        const resp = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!resp.ok) throw new Error('HTTP ' + resp.status);

        const data = await resp.json();
        return data;
    }

    async function enviarPost(datos) {
        const url = API_URL + '?key=' + encodeURIComponent(CLAVE_CARPETA);
        const body = 'payload=' + encodeURIComponent(JSON.stringify(datos));

        log.info('📤 [POST-APPSCRIPT] →', datos.accion, '| Body:', (body.length / 1024).toFixed(1) + ' KB');

        const resp = await fetch(url, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: body
        });

        if (!resp.ok) throw new Error('HTTP ' + resp.status);

        const texto = await resp.text();
        let data;
        try {
            data = JSON.parse(texto);
        } catch (e) {
            log.error('❌ Respuesta no es JSON:', texto.substring(0, 300));
            throw new Error('Respuesta no es JSON: ' + texto.substring(0, 100));
        }

        if (!data || !data.ok) {
            const errorMsg = (data && data.error) ? data.error : 'Error desconocido del servidor';
            log.error('❌ [POST-APPSCRIPT] Error servidor:', errorMsg);
            throw new Error(errorMsg);
        }

        return data;
    }

    // ============================================================
    // ✅ STATUS - PUNTO EN EL HEADER (verde/rojo/ámbar)
    // ============================================================
    function setStatusLocal(texto, tipo) {
        // Ya no hay barra de status local, pero mantenemos la función
        // para no romper llamadas existentes. Solo loguea.
        log.info('📊 Status local:', texto, '|', tipo);
    }

    function setServerStatus(texto, tipo) {
        // ✅ Actualizar punto del header
        if (headerStatusDot) {
            headerStatusDot.classList.remove('on', 'off', 'wait');
            if (tipo === 'on') {
                headerStatusDot.classList.add('on');
                headerStatusDot.title = '✅ ' + (texto || 'Conectado al servidor');
                conectado = true;
            } else if (tipo === 'off') {
                headerStatusDot.classList.add('off');
                headerStatusDot.title = '❌ ' + (texto || 'Desconectado del servidor');
                conectado = false;
            } else if (tipo === 'wait') {
                headerStatusDot.classList.add('wait');
                headerStatusDot.title = '⏳ ' + (texto || 'Conectando...');
                conectado = false;
            }
        }
        log.info('📡 Server status:', texto, '|', tipo);
    }

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
                conductoresRegistrados = [];
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
        const contenedor = document.getElementById('mapaGps');
        if (!contenedor) {
            log.warn('⚠️ Contenedor #mapaGps no encontrado');
            return;
        }
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

    window.seleccionarConductor = function(conductorId) {
        const cambioDeConductor = conductorSeleccionado !== conductorId;

        conductorSeleccionado = conductorId;
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

        const mensajesActuales = mensajesPorConductor[conductorId] || [];
        if (mensajesActuales.length > 0) {
            const ultimoMsg = mensajesActuales[mensajesActuales.length - 1];
            guardarUltimoVisto(conductorId, ultimoMsg.id);
        }

        actualizarSelectorConductores();
        renderizarListaConductores();
        actualizarMarcadores();

        cargarMensajesConductor(conductorId);

        verificarTransfersActivos();

        if (conductor && conductor.ubicacion && mapa) {
            mapa.setView([conductor.ubicacion.lat, conductor.ubicacion.lng], 12, { animate: true });
            if (marcadores[conductorId]) marcadores[conductorId].openPopup();
        }
    };

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

            if (!data.ok || !data.conductores) {
                setServerStatus('Error al cargar', 'off');
                reintentarConexion();
                return;
            }

            const conductores = data.conductores;

            const ubicacionesAnteriores = {};
            conductoresData.forEach(c => {
                if (c.ubicacion) {
                    ubicacionesAnteriores[c.id] = { lat: c.ubicacion.lat, lng: c.ubicacion.lng };
                }
            });

            conductoresData = conductores;

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

            // ✅ Punto verde en el header
            setServerStatus('Conectado a Apps Script (' + conductoresFiltrados.length + ' activos)', 'on');
            conectado = true;
            reintentos = 0;

        } catch (error) {
            setServerStatus('Error de conexión', 'off');
            reintentarConexion();
        }
    }

    function reintentarConexion() {
        if (reintentos < maxReintentos) {
            reintentos++;
            const delay = 5000 * reintentos;
            setTimeout(() => cargarConductoresChat(), delay);
        } else {
            setServerStatus('Servidor no disponible', 'off');
        }
    }

    // ============================================================
    // VERIFICAR TRANSFERS ACTIVOS
    // ============================================================
    async function verificarTransfersActivos() {
        if (!conectado || !conductorSeleccionado) return;

        try {
            const data = await jsonpRequest('listar_transfers_activos', {
                conductor_id: conductorSeleccionado
            });

            if (!data.ok || !data.transfers || data.transfers.length === 0) return;

            log.info('📦 Transfers activos para ' + conductorSeleccionado + ':', data.transfers.length);

            for (const transfer of data.transfers) {
                if (descargasEnProgreso.has(transfer.transfer_id)) continue;
                if (transfer.chunks_recibidos < 2) continue;

                descargarChunksReales(transfer);
            }
        } catch (e) {
            log.warn('Error verificando transfers:', e.message);
        }
    }

    // ============================================================
    // DESCARGA REAL DE CHUNKS CON ANIMACIÓN
    // ============================================================
    async function descargarChunksReales(transfer) {
        const transferId = transfer.transfer_id;
        const msgId = transfer.msg_id || ('msg_' + transferId);
        const conductorId = transfer.conductor_id;

        if (descargasEnProgreso.has(transferId)) return;
        descargasEnProgreso.add(transferId);

        const estado = {
            transferId: transferId,
            msgId: msgId,
            progreso: 0,
            nombre: transfer.archivo_nombre || 'archivo',
            tipo: transfer.archivo_tipo || 'application/octet-stream',
            chunksRecibidos: 0,
            totalChunks: transfer.total_chunks || 0,
            bytesRecibidos: 0,
            bytesTotal: transfer.archivo_tamanio || 0,
            inicio: Date.now(),
            chunks: [],
            chunksDescargados: new Set()
        };

        transfersEnProgreso[transferId] = estado;

        log.info('🎬 Iniciando descarga real:', transferId, '·', estado.nombre);

        mostrarModalDescarga(msgId, estado.nombre, estado.bytesTotal, estado.tipo);
        notificarDescarga('iniciando',
            '📥 Descargando <b>' + escapeHtml(estado.nombre) + '</b><br>' +
            '<small style="color:#8bb8d0;">' + transfer.chunks_recibidos + ' chunks ya en servidor</small>',
            4000);

        let sinCambios = 0;
        let ultimoCount = 0;
        const MAX_SIN_CAMBIOS = 20;
        const MAX_ITERACIONES = 300;
        let iteraciones = 0;

        while (sinCambios < MAX_SIN_CAMBIOS && iteraciones < MAX_ITERACIONES) {
            iteraciones++;

            const modal = document.getElementById('modalDescargaGPS');
            if (!modal || modal.style.display === 'none') {
                log.info('⏹️ Modal cerrado, deteniendo descarga');
                break;
            }

            try {
                const data = await jsonpRequest('obtener_chunks_transfer', {
                    transfer_id: transferId
                });

                if (!data.ok) {
                    await new Promise(r => setTimeout(r, POLLING_TRANSFER));
                    sinCambios++;
                    continue;
                }

                const chunks = data.chunks || [];
                const totalEsperado = data.total_chunks || chunks.length;

                let nuevos = 0;
                for (const chunk of chunks) {
                    if (!estado.chunksDescargados.has(chunk.idx)) {
                        estado.chunksDescargados.add(chunk.idx);
                        estado.chunks.push(chunk);
                        estado.chunksRecibidos++;
                        estado.bytesRecibidos += chunk.tamaño;
                        nuevos++;

                        log.info('📦 Chunk ' + chunk.idx + ' descargado (' +
                                 (chunk.tamaño/1024).toFixed(1) + ' KB)');
                    }
                }

                const porcentaje = totalEsperado > 0
                    ? Math.round((estado.chunksRecibidos / totalEsperado) * 100)
                    : 0;
                const elapsed = (Date.now() - estado.inicio) / 1000;
                const velocidad = elapsed > 0 ? estado.bytesRecibidos / elapsed : 0;

                actualizarModalDescarga({
                    estado: data.completo ? 'Ensamblando...' : 'Descargando chunks',
                    porcentaje: porcentaje,
                    chunks: estado.chunksRecibidos + ' / ' + totalEsperado,
                    bytes: formatearTamaño(estado.bytesRecibidos) + ' / ' + formatearTamaño(estado.bytesTotal),
                    tiempo: elapsed.toFixed(1) + 's',
                    velocidad: formatearTamaño(velocidad) + '/s',
                    mensaje: data.completo
                        ? '🔧 Ensamblando archivo final...'
                        : '📦 Recibiendo chunk ' + estado.chunksRecibidos + ' de ' + totalEsperado + '...'
                });

                if (data.completo) {
                    log.info('✅ Transfer completo (' + estado.chunksRecibidos + '/' + totalEsperado + ')');
                    break;
                }

                if (chunks.length === ultimoCount && nuevos === 0) {
                    sinCambios++;
                } else {
                    sinCambios = 0;
                    ultimoCount = chunks.length;
                }

            } catch (e) {
                log.warn('Error consultando chunks:', e.message);
                sinCambios++;
            }

            await new Promise(r => setTimeout(r, POLLING_TRANSFER));
        }

        const elapsedTotal = ((Date.now() - estado.inicio) / 1000).toFixed(1);

        estado.chunks.sort((a, b) => a.idx - b.idx);

        const todosPresentes = estado.totalChunks > 0
            ? estado.chunksRecibidos >= estado.totalChunks
            : true;

        if (!todosPresentes) {
            log.warn('⚠️ Faltan chunks: ' + estado.chunksRecibidos + '/' + estado.totalChunks);
            actualizarModalDescarga({
                estado: 'Incompleto',
                mensaje: '⚠️ Faltan chunks (' + estado.chunksRecibidos + '/' + estado.totalChunks + ')',
                icono: 'fa-exclamation-triangle',
                iconoColor: '#fbbf24',
                iconoAnimacion: 'none'
            });
            await new Promise(r => setTimeout(r, 2000));
            cerrarModalDescarga();
            descargasEnProgreso.delete(transferId);
            delete transfersEnProgreso[transferId];
            return;
        }

        actualizarModalDescarga({
            estado: 'Ensamblando',
            porcentaje: 100,
            chunks: estado.chunksRecibidos + ' / ' + estado.chunksRecibidos,
            mensaje: '🔧 Ensamblando ' + estado.chunksRecibidos + ' chunks...',
            icono: 'fa-cog',
            iconoColor: '#fbbf24',
            iconoAnimacion: 'spin 1s linear infinite'
        });

        let base64Completo = '';
        for (const chunk of estado.chunks) {
            base64Completo += chunk.contenido;
        }

        log.info('✅ Base64 ensamblado: ' + (base64Completo.length / 1024).toFixed(1) + ' KB');

        if (base64Completo.length > 0) {
            guardarBase64Cache(msgId, base64Completo);
            marcarComoDescargado(msgId);
        }

        await new Promise(r => setTimeout(r, 600));

        actualizarModalDescarga({
            estado: '¡Completado!',
            porcentaje: 100,
            tiempo: elapsedTotal + 's',
            mensaje: '✅ Archivo ensamblado. Mostrando...',
            icono: 'fa-check-circle',
            iconoColor: '#5affa0',
            iconoAnimacion: 'none'
        });

        notificarDescarga('completado',
            '✅ <b>' + escapeHtml(estado.nombre) + '</b><br>' +
            '<small>' + formatearTamaño(estado.bytesRecibidos) + ' en ' + elapsedTotal + 's</small>',
            6000);

        descargasRecientes.unshift({
            nombre: estado.nombre,
            conductor: conductorSeleccionado,
            tamaño: estado.bytesRecibidos,
            guardadoEn: 'base64',
            fecha: new Date()
        });
        if (descargasRecientes.length > 20) descargasRecientes.pop();

        await new Promise(r => setTimeout(r, 1000));
        cerrarModalDescarga();

        descargasEnProgreso.delete(transferId);
        delete transfersEnProgreso[transferId];

        setTimeout(() => {
            if (conductorSeleccionado === conductorId) {
                cargarMensajesConductor(conductorId);
            }
        }, 800);
    }

    // ============================================================
    // CARGA DE MENSAJES
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

            if (!data.ok) {
                cargandoMensajes[conductorId] = false;
                return;
            }

            const mensajesServidor = data.mensajes || [];
            const mensajesProcesados = [];

            for (const msg of mensajesServidor) {
                let fechaValida = new Date(msg.fecha);
                if (isNaN(fechaValida.getTime())) msg.fecha = new Date().toISOString();

                if (msg.archivo) {
                    const tieneBase64 = !!msg.archivo.base64;
                    const base64KB = tieneBase64 ? (msg.archivo.base64.length / 1024).toFixed(1) : '0';
                    const ensambladoDe = msg.archivo._ensambladoDeChunks || 0;

                    if (msg.archivo.base64) {
                        log.info('📎 Mensaje con archivo ensamblado:',
                            msg.archivo.nombre, '(' + base64KB + ' KB, ' + ensambladoDe + ' chunks)');

                        const cachedLS = obtenerBase64Cache(msg.id);
                        if (!cachedLS) {
                            guardarBase64Cache(msg.id, msg.archivo.base64);
                        }
                        marcarComoDescargado(msg.id);
                    }
                    else if (msg.archivo.guardado_en_ubicacion || msg.archivo.guardado_en_disco) {
                        const existe = await verificarArchivoEnDisco(msg.id, conductorId);
                        if (existe) {
                            msg.archivo._enUbicacion = true;
                            msg.archivo.url_ubicacion = getUrlArchivoUbicacion(conductorId, msg.id);
                            const cachedLS = obtenerBase64Cache(msg.id);
                            if (cachedLS) {
                                msg.archivo.base64 = cachedLS;
                            } else if ((esImagen(msg.archivo.nombre, msg.archivo.tipo) ||
                                        esAudio(msg.archivo.nombre, msg.archivo.tipo)) &&
                                       (msg.archivo.tamanio || 0) < 300 * 1024) {
                                const base64 = await leerArchivoDelDisco(msg.id, conductorId);
                                if (base64) {
                                    msg.archivo.base64 = base64;
                                    guardarBase64Cache(msg.id, base64);
                                }
                            }
                        }
                    }
                    else {
                        if (API_LOCAL_DISPONIBLE) {
                            const existe = await verificarArchivoEnDisco(msg.id, conductorId);
                            if (existe) {
                                msg.archivo._enUbicacion = true;
                                msg.archivo.url_ubicacion = getUrlArchivoUbicacion(conductorId, msg.id);
                            }
                        }
                    }
                }
                mensajesProcesados.push(msg);
            }

            mensajesPorConductor[conductorId] = mensajesProcesados;

            if (data.ultimo_msg_id) {
                ultimoMsgIdPorConductor[conductorId] = data.ultimo_msg_id;
                guardarUltimoId(conductorId);
            }

            const ultimoVisto = ultimoMensajeVistoPorConductor[conductorId] || '';
            let idxUltimoVisto = -1;
            if (ultimoVisto) {
                idxUltimoVisto = mensajesServidor.findIndex(m => m.id === ultimoVisto);
            }
            const mensajesNuevos = idxUltimoVisto >= 0
                ? mensajesServidor.slice(idxUltimoVisto + 1)
                : mensajesServidor;

            if (conductorId === conductorSeleccionado) {
                renderizarChatSilencioso(conductorId);
                mensajesNoLeidos[conductorId] = false;
                if (mensajesServidor.length > 0) {
                    const ultimo = mensajesServidor[mensajesServidor.length - 1];
                    guardarUltimoVisto(conductorId, ultimo.id);
                }
            } else {
                const yaEstabaNoLeido = mensajesNoLeidos[conductorId] === true;
                const hayNoLeidos = mensajesNuevos.length > 0;
                if (hayNoLeidos) {
                    mensajesNoLeidos[conductorId] = true;
                    if (!yaEstabaNoLeido) {
                        const registrado = getConductorById(conductorId);
                        const nombre = registrado ? registrado.nombre : conductorId;
                        mostrarToast('📬 ' + nombre + ' tiene ' + mensajesNuevos.length + ' mensaje(s) nuevo(s)', 'warning');
                    }
                } else {
                    mensajesNoLeidos[conductorId] = false;
                }
            }

            actualizarSelectorConductores();
            renderizarListaConductores();
            actualizarMarcadores();

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
                const info = archivo.icono
                    ? { icono: archivo.icono, color: archivo.color || '#38bdf8', clase: archivo.clase || 'documento' }
                    : getTipoArchivoInfo(archivo.nombre, archivo.tipo);
                const tamañoKB = ((archivo.tamanio || 0) / 1024).toFixed(1);
                const tamañoMB = ((archivo.tamanio || 0) / 1024 / 1024).toFixed(2);

                const urlUbicacion = archivo.url_ubicacion ||
                    getUrlArchivoUbicacion(conductorId, msg.id);

                if (archivo._eliminado) {
                    html += `<div class="archivo-msg eliminado" style="opacity:0.6;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,84,112,0.2);display:flex;align-items:center;gap:10px;margin:4px 0;">
                        <i class="fas ${info.icono}" style="color:#ff5470;font-size:20px;"></i>
                        <div>
                            <div style="font-size:0.6rem;color:#edf9ff;">${escapeHtml(archivo.nombre)}</div>
                            <div style="font-size:0.4rem;color:#ff5470;"><i class="fas fa-trash-alt"></i> Eliminado</div>
                        </div>
                    </div>`;
                }
                else if (esImagen(archivo.nombre, archivo.tipo) && (urlUbicacion || archivo.base64)) {
                    const src = urlUbicacion || ('data:' + (archivo.tipo || 'image/png') + ';base64,' + archivo.base64);
                    html += `<div class="archivo-msg imagen" style="max-width:260px;margin:4px 0;border-radius:10px;overflow:hidden;cursor:pointer;position:relative;background:#0a1628;animation:fadeInUp 0.5s ease-out;" onclick="abrirModalImagenUrl('${src}')">
                        <img src="${src}" alt="${escapeHtml(archivo.nombre)}" loading="lazy" style="width:100%;display:block;max-height:220px;object-fit:cover;">
                        <div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.7);border-radius:20px;padding:2px 8px;font-size:0.4rem;color:rgba(255,255,255,0.9);">
                            <i class="fas fa-expand"></i> ${tamañoKB} KB
                        </div>
                    </div>`;
                }
                else if (esVideo(archivo.nombre, archivo.tipo) && (urlUbicacion || archivo.base64)) {
                    const src = urlUbicacion || ('data:' + archivo.tipo + ';base64,' + archivo.base64);
                    html += `<div class="archivo-msg video" style="max-width:280px;margin:4px 0;border-radius:10px;overflow:hidden;background:#000;animation:fadeInUp 0.5s ease-out;">
                        <video controls preload="metadata" style="width:100%;display:block;border-radius:10px;max-height:260px;">
                            <source src="${src}" type="${archivo.tipo}">
                        </video>
                        <div style="padding:4px 8px;font-size:0.4rem;color:rgba(255,255,255,0.6);background:rgba(0,0,0,0.3);">
                            <i class="fas fa-video"></i> ${escapeHtml(archivo.nombre)} · ${tamañoMB} MB
                        </div>
                    </div>`;
                }
                else if (esAudio(archivo.nombre, archivo.tipo) && (urlUbicacion || archivo.base64)) {
                    const src = urlUbicacion || ('data:' + archivo.tipo + ';base64,' + archivo.base64);
                    html += `<div class="archivo-msg audio" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(251,191,36,0.06);border-radius:10px;border:1px solid rgba(251,191,36,0.15);max-width:280px;margin:4px 0;animation:fadeInUp 0.5s ease-out;">
                        <div style="width:36px;height:36px;border-radius:50%;background:rgba(251,191,36,0.15);color:#fbbf24;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">
                            <i class="fas fa-music"></i>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:0.55rem;color:#edf9ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px;">${escapeHtml(archivo.nombre)}</div>
                            <audio controls preload="metadata" style="width:100%;height:28px;">
                                <source src="${src}" type="${archivo.tipo}">
                            </audio>
                        </div>
                    </div>`;
                }
                else if (archivo.tipo === 'application/pdf' && (urlUbicacion || archivo.base64)) {
                    const src = urlUbicacion || ('data:application/pdf;base64,' + archivo.base64);
                    html += `<a href="${src}" download="${escapeHtml(archivo.nombre)}" class="archivo-msg doc pdf" target="_blank" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(248,113,113,0.05);border-radius:10px;border:1px solid rgba(248,113,113,0.15);max-width:280px;margin:4px 0;text-decoration:none;cursor:pointer;animation:fadeInUp 0.5s ease-out;">
                        <div style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:rgba(248,113,113,0.15);color:#f87171;font-size:1.1rem;">
                            <i class="fas fa-file-pdf"></i>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:0.55rem;color:#edf9ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(archivo.nombre)}</div>
                            <div style="font-size:0.4rem;color:#8bb8d0;">PDF · ${tamañoKB} KB</div>
                        </div>
                        <i class="fas fa-download" style="color:#f87171;font-size:0.9rem;"></i>
                    </a>`;
                }
                else if (urlUbicacion || archivo.base64) {
                    const src = urlUbicacion || ('data:' + archivo.tipo + ';base64,' + archivo.base64);
                    const ext = (archivo.nombre || '').split('.').pop().toUpperCase();
                    html += `<a href="${src}" download="${escapeHtml(archivo.nombre)}" class="archivo-msg doc" target="_blank" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(56,189,248,0.05);border-radius:10px;border:1px solid rgba(56,189,248,0.15);max-width:280px;margin:4px 0;text-decoration:none;cursor:pointer;animation:fadeInUp 0.5s ease-out;">
                        <div style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:${info.color}22;color:${info.color};font-size:1.1rem;">
                            <i class="fas ${info.icono}"></i>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:0.55rem;color:#edf9ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(archivo.nombre)}</div>
                            <div style="font-size:0.4rem;color:#8bb8d0;">${ext} · ${tamañoKB} KB</div>
                        </div>
                        <i class="fas fa-download" style="color:${info.color};font-size:0.9rem;"></i>
                    </a>`;
                }
                else {
                    html += `<div class="archivo-msg drive" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(96,165,250,0.05);border-radius:10px;border:1px solid rgba(96,165,250,0.15);max-width:280px;margin:4px 0;">
                        <div style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:rgba(96,165,250,0.15);color:#60a5fa;font-size:1rem;">
                            <i class="fas ${info.icono} fa-pulse"></i>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:0.55rem;color:#edf9ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(archivo.nombre)}</div>
                            <div style="font-size:0.4rem;color:#8bb8d0;">⏳ Ensamblando... · ${tamañoKB} KB</div>
                        </div>
                        <button onclick="event.stopPropagation(); verificarTransfersActivos()" style="background:rgba(96,165,250,0.15);border:none;color:#60a5fa;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;" title="Verificar chunks">
                            <i class="fas fa-sync"></i>
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

    async function enviarMensajeConArchivo(texto, file) {
        if (!conectado || !conductorSeleccionado) {
            mostrarToast('❌ No conectado', 'error');
            return;
        }

        if (!esTipoPermitido(file.name, file.type)) {
            mostrarToast('❌ Tipo de archivo no permitido', 'error');
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
        const tamañoMB = file.size / 1024 / 1024;
        const info = getTipoArchivoInfo(file.name, file.type);

        if (tamañoKB > MAX_FILE_SIZE_KB) {
            mostrarToast('❌ El archivo excede ' + (MAX_FILE_SIZE_KB/1024) + ' MB', 'error');
            return;
        }

        subidaEnProgreso = true;
        if (uploadProgressChat) uploadProgressChat.classList.add('active');
        if (progressBarChat) progressBarChat.style.width = '0%';
        if (progressTextChat) progressTextChat.textContent = '0%';

        try {
            const base64 = await archivoABase64(file);
            const msgId = 'msg_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
            guardarBase64Cache(msgId, base64);

            chatBtnEnviar.disabled = true;
            chatBtnEnviar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';

            const data = await enviarPost({
                accion: 'enviar_mensaje',
                conductor_id: conductorSeleccionado,
                remitente: 'GPS Panel',
                mensaje: texto || '',
                fecha: new Date().toISOString(),
                archivo_nombre: file.name,
                archivo_tipo: file.type || 'application/octet-stream',
                archivo_tamanio: file.size,
                archivo_base64: base64,
                archivo_clase: info.clase,
                archivo_icono: info.icono,
                archivo_color: info.color,
                msg_id: msgId
            });

            if (data && data.ok) {
                mostrarToast('✅ ' + info.clase + ' enviado', 'success');
                limpiarBarraEnvioChat();
                setTimeout(() => cargarMensajesConductor(conductorSeleccionado), 1500);
            }

            chatBtnEnviar.disabled = false;
            chatBtnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i>';
        } catch (error) {
            log.error('Error:', error);
            mostrarToast('❌ Error: ' + error.message, 'error');
            chatBtnEnviar.disabled = false;
            chatBtnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i>';
        } finally {
            subidaEnProgreso = false;
            if (uploadProgressChat) uploadProgressChat.classList.remove('active');
            if (progressBarChat) progressBarChat.style.width = '0%';
            if (progressTextChat) progressTextChat.textContent = '';
        }
    }

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
            const tamaño = formatearTamaño(file.size);
            html += `<span class="tag-archivo">
                <i class="fas ${info.icono}" style="color:${info.color};"></i>
                ${escapeHtml(file.name)} <small>(${tamaño})</small>
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

            if (!esTipoPermitido(file.name, file.type)) {
                mostrarToast('❌ Tipo de archivo no permitido', 'error');
                this.value = '';
                return;
            }

            const tamañoKB = file.size / 1024;
            if (tamañoKB > MAX_FILE_SIZE_KB) {
                mostrarToast('❌ El archivo excede ' + (MAX_FILE_SIZE_KB/1024) + ' MB', 'error');
                this.value = '';
                return;
            }

            archivosSeleccionadosChat = archivosSeleccionadosChat.concat(nuevosArchivos);
            actualizarArchivosSeleccionadosChat();
            this.value = '';

            const info = getTipoArchivoInfo(file.name, file.type);
            const tamaño = formatearTamaño(file.size);
            mostrarToast('📎 ' + info.clase + ' listo (' + tamaño + ')', 'info');
        });
    }

    // ============================================================
    // MODAL IMAGEN
    // ============================================================
    window.abrirModalImagen = function(src) {
        if (imagenAmpliada) imagenAmpliada.src = 'data:image/png;base64,' + src;
        if (modalImagen) {
            modalImagen.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    };

    window.abrirModalImagenUrl = function(url) {
        if (imagenAmpliada) imagenAmpliada.src = url;
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
    window.verificarTransfersActivos = verificarTransfersActivos;

    window.refrescarChatMadre = function() {
        cargarConductoresChat();
        if (conductorSeleccionado) cargarMensajesConductor(conductorSeleccionado);
    };

    window.recargarMensajesManual = function() {
        console.log('🔄 Recargando mensajes manualmente...');
        if (conductorSeleccionado) {
            cargarMensajesConductor(conductorSeleccionado);
        }
        mostrarToast('🔄 Recargando...', 'info');
    };

    window.verHistorialDescargas = function() {
        if (descargasRecientes.length === 0) {
            mostrarToast('📭 No hay descargas recientes', 'info');
            return;
        }
        log.info('📋 Historial:');
        descargasRecientes.forEach((d, i) => {
            log.info(`  ${i+1}. ${d.nombre} (${d.conductor}) - ${formatearTamaño(d.tamaño)} → ${d.guardadoEn}`);
        });
    };

    window.diagnosticoMensajes = function() {
        const cid = conductorSeleccionado || Object.keys(mensajesPorConductor)[0];
        if (!cid) {
            console.log('❌ No hay conductor seleccionado');
            return;
        }
        console.log('🔍 DIAGNÓSTICO de', cid);
        const msgs = mensajesPorConductor[cid] || [];
        console.log('Total mensajes:', msgs.length);
        msgs.forEach((m, i) => {
            if (m.archivo) {
                console.log('[' + i + ']', {
                    id: m.id,
                    nombre: m.archivo.nombre,
                    base64_kb: m.archivo.base64 ? (m.archivo.base64.length/1024).toFixed(1) : 'NO',
                    ensamblado_de: m.archivo._ensambladoDeChunks || 0
                });
            }
        });
    };

    window.limpiarCacheLocal = function() {
        let eliminados = 0;
        let bytesLiberados = 0;
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && (k.startsWith(FILE_CACHE_PREFIX) || k.startsWith(DESCARGADOS_KEY))) {
                bytesLiberados += (localStorage.getItem(k) || '').length;
                localStorage.removeItem(k);
                eliminados++;
            }
        }
        console.log('🧹 Caché limpiada:', eliminados, 'entradas,',
                    (bytesLiberados/1024/1024).toFixed(2), 'MB liberados');
        mostrarToast('🧹 Caché limpiada (' + eliminados + ' entradas)', 'success');
    };

    window.verTransfersActivos = function() {
        console.log('🎬 Transfers en progreso (locales):');
        Object.keys(transfersEnProgreso).forEach(tid => {
            const t = transfersEnProgreso[tid];
            console.log('   •', tid, '→', t.chunksRecibidos + '/' + t.totalChunks,
                        'chunks ·', formatearTamaño(t.bytesRecibidos));
        });
        const count = Object.keys(transfersEnProgreso).length;
        if (count === 0) {
            console.log('   (ninguno)');
        }
        mostrarToast('🎬 ' + count + ' transfers en progreso', 'info');
    };

    // ============================================================
    // POLLING
    // ============================================================
    function iniciarEscuchaChat() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(() => {
            cargarConductoresChat();
            verificarTransfersActivos();

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
    async function inicializar() {
        log.info('═══════════════════════════════════════════');
        log.info('Inicializando v31.1');
        log.info('📡 Apps Script: FUENTE PRINCIPAL');
        log.info('🎬 Descarga REAL de chunks en vivo');
        log.info('🟢 Punto de conexión en el header');
        log.info('Origen:', ORIGEN);
        log.info('Polling general:', (POLLING_INTERVAL/1000) + 's');
        log.info('Polling transfers:', (POLLING_TRANSFER) + 'ms');
        log.info('═══════════════════════════════════════════');

        cargarConductoresLocales();

        conductoresRegistrados.forEach(c => {
            cargarUltimoVisto(c.id);
        });

        if (chatInput) chatInput.disabled = true;
        if (chatBtnEnviar) chatBtnEnviar.disabled = true;
        if (btnSubirArchivo) btnSubirArchivo.disabled = true;

        // ✅ Punto en estado "conectando" (ámbar)
        setServerStatus('Conectando...', 'wait');

        inicializarMapa();
        crearPanelDescargas();
        crearModalDescarga();

        await detectarApiLocal();

        setTimeout(function() {
            cargarConductoresChat();
            iniciarEscuchaChat();
        }, 500);

        log.info('✅ Inicializado con ' + conductoresRegistrados.length + ' conductores');
        log.info('💡 Comandos:');
        log.info('   • verTransfersActivos() - Ver descargas en progreso');
        log.info('   • verificarTransfersActivos() - Forzar chequeo');
        log.info('   • diagnosticoMensajes() - Ver estado de archivos');
        log.info('   • limpiarCacheLocal() - Limpiar caché');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        inicializar();
    }

    window.addEventListener('beforeunload', function() {
        if (pollingInterval) clearInterval(pollingInterval);
    });

    // ============================================================
    // CSS ANIMACIONES
    // ============================================================
    if (!document.getElementById('notifCSS')) {
        const style = document.createElement('style');
        style.id = 'notifCSS';
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes modalDescargaIn {
                from { transform: scale(0.85) translateY(20px); opacity: 0; }
                to { transform: scale(1) translateY(0); opacity: 1; }
            }
            @keyframes fadeInUp {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes shimmer {
                0% { background-position: -200% 0; }
                100% { background-position: 200% 0; }
            }
            @keyframes pulseIcon {
                0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(15,240,212,0.4); }
                50% { transform: scale(1.05); box-shadow: 0 0 0 8px rgba(15,240,212,0); }
            }
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

})();