// ============================================================
// CHAT CONDUCTOR v24.0
// 📦 Chunks → Apps Script · Auto-login · Cambio de conductor
// ============================================================
(function() {
    "use strict";

    // ============================================================
    // ⚙️ CONFIGURACIÓN
    // ============================================================
    const API_URL = 'https://script.google.com/macros/s/AKfycbziH8LVFWtfXSHr3QikZGSBiQcKdCgB-IJCg-PnzQ6V031kz0pXr8YndULcFkuuWEWr7g/exec';
    const CLAVE_CARPETA = 'GSN-DASHBOARD-2026';
    const POLLING_INTERVAL = 5000;

    const FALLBACK_LAT = 12.1364;
    const FALLBACK_LNG = -86.2514;
    const USAR_FALLBACK_AUTO = true;

    const CHUNK_SIZE_BYTES = 8 * 1024;
    const MAX_CHUNKS = 400;
    const REINTENTOS_CHUNK = 3;
    const PAUSA_ENTRE_CHUNKS = 30;

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

    let mensajes = [];
    let ubicacionActual = null;
    let ubicacionPermitida = false;
    let nombreConductor = "";
    let idConductor = "";
    let conductorVerificado = false;
    let pollingInterval = null;
    let archivosSeleccionados = [];
    let ultimoHash = "";
    let inicializado = false;
    let registrando = false;
    let confirmacionesEnProgreso = new Set();
    let enviandoChunks = false;
    let transferActual = null;

    function $(id) {
        const el = document.getElementById(id);
        if (!el) console.warn('⚠️ Elemento no encontrado:', id);
        return el;
    }

    // ============================================================
    // 🖥️ TERMINAL INTEGRADA (Ctrl+F12)
    // ============================================================
    const terminalOutput = document.getElementById('terminalOutput');
    const terminalPanel = document.getElementById('terminalPanel');
    const terminalInput = document.getElementById('terminalInput');
    let terminalVisible = false;

    const _originalLog = console.log;
    const _originalWarn = console.warn;
    const _originalError = console.error;

    console.log = function(...args) {
        _originalLog.apply(console, args);
        terminalEscribir('info', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    };

    console.warn = function(...args) {
        _originalWarn.apply(console, args);
        terminalEscribir('warning', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    };

    console.error = function(...args) {
        _originalError.apply(console, args);
        terminalEscribir('error', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    };

    window.addEventListener('error', function(e) {
        terminalEscribir('error', '💥 Error: ' + e.message + ' (' + e.filename + ':' + e.lineno + ')');
    });

    window.addEventListener('unhandledrejection', function(e) {
        terminalEscribir('error', '💥 Promise rechazada: ' + (e.reason && e.reason.message ? e.reason.message : e.reason));
    });

    window.toggleTerminal = function() {
        terminalVisible = !terminalVisible;
        if (terminalVisible) {
            terminalPanel.classList.add('active');
            setTimeout(() => terminalInput.focus(), 300);
        } else {
            terminalPanel.classList.remove('active');
        }
    };

    window.terminalLimpiar = function() {
        terminalOutput.innerHTML = '<div class="terminal-line terminal-info">🧹 Terminal limpiada.</div>';
    };

    window.terminalCopiar = function() {
        const texto = terminalOutput.innerText;
        navigator.clipboard.writeText(texto).then(() => {
            terminalEscribir('success', '📋 Contenido copiado');
        }).catch(() => {
            terminalEscribir('error', '❌ No se pudo copiar');
        });
    };

    function terminalEscribir(tipo, texto) {
        if (!terminalOutput) return;
        const linea = document.createElement('div');
        linea.className = 'terminal-line terminal-' + tipo;
        linea.textContent = texto;
        terminalOutput.appendChild(linea);
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
        while (terminalOutput.children.length > 500) {
            terminalOutput.removeChild(terminalOutput.firstChild);
        }
    }

    window.terminalEjecutar = function() {
        const cmd = terminalInput.value.trim();
        if (!cmd) return;
        terminalEscribir('command', '› ' + cmd);
        terminalInput.value = '';
        procesarComando(cmd.toLowerCase(), cmd);
    };

    function procesarComando(cmdLower, cmdOriginal) {
        switch (cmdLower) {
            case 'ayuda':
            case 'help':
                terminalEscribir('info', '📖 COMANDOS:');
                terminalEscribir('info', '   gps         - Probar GPS real');
                terminalEscribir('info', '   gpsforzar   - Forzar coordenadas de Managua');
                terminalEscribir('info', '   estado      - Ver estado completo');
                terminalEscribir('info', '   test        - Probar servidor');
                terminalEscribir('info', '   conductores - Listar conductores del servidor');
                terminalEscribir('info', '   mensajes    - Ver mensajes cargados');
                terminalEscribir('info', '   transfers   - Ver transfers activos');
                terminalEscribir('info', '   confirmar   - Confirmar todos los archivos');
                terminalEscribir('info', '   cambiar     - Cambiar de conductor');
                terminalEscribir('info', '   logout      - Cerrar sesión');
                terminalEscribir('info', '   enviar X    - Enviar mensaje "X"');
                terminalEscribir('info', '   limpiar     - Limpiar terminal');
                terminalEscribir('info', '   recargar    - Recargar página');
                break;

            case 'gps':
                terminalEscribir('info', '📍 Probando GPS real...');
                if (!navigator.geolocation) {
                    terminalEscribir('error', '❌ Sin API de geolocalización');
                    return;
                }
                navigator.geolocation.getCurrentPosition(
                    pos => {
                        terminalEscribir('success', '✅ GPS FUNCIONA');
                        terminalEscribir('success', '   Lat: ' + pos.coords.latitude);
                        terminalEscribir('success', '   Lng: ' + pos.coords.longitude);
                        terminalEscribir('success', '   Precisión: ' + pos.coords.accuracy + ' m');
                    },
                    err => {
                        const msgs = {1: 'PERMISO DENEGADO', 2: 'SEÑAL NO DISPONIBLE', 3: 'TIMEOUT'};
                        terminalEscribir('error', '❌ GPS ERROR ' + err.code + ': ' + (msgs[err.code] || err.message));
                    },
                    { enableHighAccuracy: false, timeout: 30000, maximumAge: 0 }
                );
                break;

            case 'gpsforzar':
            case 'forzar':
                aplicarUbicacionFallback('manual');
                break;

            case 'estado':
                terminalEscribir('info', '📊 ESTADO:');
                terminalEscribir('info', '   ID: ' + (idConductor || '(no definido)'));
                terminalEscribir('info', '   Nombre: ' + (nombreConductor || '(no definido)'));
                terminalEscribir('info', '   Verificado: ' + (conductorVerificado ? 'SÍ' : 'NO'));
                terminalEscribir('info', '   GPS: ' + (ubicacionPermitida ? 'ACTIVO' : 'INACTIVO'));
                terminalEscribir('info', '   Ubicación: ' + (ubicacionActual ? JSON.stringify(ubicacionActual) : 'null'));
                terminalEscribir('info', '   Mensajes: ' + mensajes.length);
                terminalEscribir('info', '   Enviando chunks: ' + (enviandoChunks ? 'SÍ' : 'NO'));
                terminalEscribir('info', '   Chunk size: ' + (CHUNK_SIZE_BYTES/1024) + ' KB');
                terminalEscribir('info', '   Max chunks: ' + MAX_CHUNKS);
                if (transferActual) {
                    terminalEscribir('info', '   🎬 Transfer actual:');
                    terminalEscribir('info', '      ID: ' + transferActual.transferId);
                    terminalEscribir('info', '      Archivo: ' + transferActual.nombre);
                    terminalEscribir('info', '      Progreso: ' + transferActual.enviados + '/' + transferActual.total);
                }
                terminalEscribir('info', '   Protocolo: ' + window.location.protocol);
                break;

            case 'test':
                terminalEscribir('info', '🌐 Probando servidor...');
                fetch(API_URL + '?accion=ping&key=' + CLAVE_CARPETA)
                    .then(r => r.text())
                    .then(t => terminalEscribir('success', '✅ ' + t))
                    .catch(e => terminalEscribir('error', '❌ ' + e.message));
                break;

            case 'conductores':
                terminalEscribir('info', '📋 Obteniendo conductores...');
                fetch(API_URL + '?accion=conductores_conectados&key=' + CLAVE_CARPETA)
                    .then(r => r.json())
                    .then(d => {
                        if (d.ok && d.conductores) {
                            terminalEscribir('success', '📋 Total: ' + d.conductores.length);
                            d.conductores.forEach(c => {
                                terminalEscribir('response', '   • ' + c.id + ' (' + c.nombre + ')');
                                terminalEscribir('muted', '     GPS: ' + (c.ubicacion ? 'SÍ' : 'NO') + ' | Activo: ' + (c.activo ? 'SÍ' : 'NO'));
                            });
                        } else {
                            terminalEscribir('error', '❌ ' + (d.error || 'Error'));
                        }
                    })
                    .catch(e => terminalEscribir('error', '❌ ' + e.message));
                break;

            case 'mensajes':
                terminalEscribir('info', '💬 Mensajes: ' + mensajes.length);
                mensajes.forEach((m, i) => {
                    let tieneArchivo = m.archivo ? '📎' : '💬';
                    let estadoArchivo = '';
                    if (m.archivo) {
                        if (m.archivo._guardadoEnLocal) estadoArchivo = ' 💾 (guardado local)';
                        else if (m.archivo.base64) estadoArchivo = ' ✅ (base64)';
                        else estadoArchivo = ' ⏳ (procesando)';
                    }
                    terminalEscribir('response', '   [' + i + '] ' + tieneArchivo + ' ' + m.conductor + ': ' + (m.mensaje || '(archivo)') + estadoArchivo);
                });
                break;

            case 'transfers':
                terminalEscribir('info', '🎬 Consultando transfers activos...');
                fetch(API_URL + '?accion=listar_transfers_activos&key=' + CLAVE_CARPETA +
                      '&conductor_id=' + encodeURIComponent(idConductor || ''))
                    .then(r => r.json())
                    .then(d => {
                        if (d.ok) {
                            terminalEscribir('success', '📦 Transfers activos: ' + d.total);
                            d.transfers.forEach(t => {
                                terminalEscribir('response', '   • ' + t.transfer_id);
                                terminalEscribir('muted', '     ' + t.chunks_recibidos + '/' + (t.total_chunks || '?') +
                                              ' chunks' + (t.archivo_nombre ? ' · ' + t.archivo_nombre : ''));
                            });
                        } else {
                            terminalEscribir('error', '❌ ' + (d.error || 'Error'));
                        }
                    })
                    .catch(e => terminalEscribir('error', '❌ ' + e.message));
                break;

            case 'confirmar':
                terminalEscribir('info', '✅ Confirmando todos los archivos pendientes...');
                confirmarTodosPendientes();
                break;

            case 'cambiar':
                terminalEscribir('info', '🔄 Cambiando de conductor...');
                window.cambiarConductor();
                break;

            case 'logout':
                terminalEscribir('info', '🚪 Cerrando sesión...');
                window.cerrarSesion();
                break;

            case 'limpiar':
            case 'clear':
                terminalLimpiar();
                break;

            case 'recargar':
            case 'reload':
                terminalEscribir('info', '🔄 Recargando...');
                setTimeout(() => location.reload(), 500);
                break;

            default:
                if (cmdLower.startsWith('enviar ')) {
                    const texto = cmdOriginal.substring(7);
                    terminalEscribir('info', '📤 Enviando: "' + texto + '"');
                    const input = $('mensajeInput');
                    if (input) {
                        input.value = texto;
                        enviarMensaje();
                    }
                } else if (cmdLower.startsWith('api ')) {
                    const accion = cmdOriginal.substring(4).trim();
                    terminalEscribir('info', '🌐 Llamando: ' + accion);
                    fetch(API_URL + '?accion=' + encodeURIComponent(accion) + '&key=' + CLAVE_CARPETA)
                        .then(r => r.text())
                        .then(t => terminalEscribir('success', '✅ ' + t))
                        .catch(e => terminalEscribir('error', '❌ ' + e.message));
                } else {
                    terminalEscribir('error', '❌ Comando no reconocido: "' + cmdOriginal + '"');
                    terminalEscribir('muted', '   Escribe "ayuda" para ver comandos.');
                }
        }
    }

    // ============================================================
    // UTILIDADES
    // ============================================================
    function escapeHtml(text) {
        if (!text) return "";
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    function formatearHora(fecha) {
        try {
            return new Date(fecha).toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
        } catch(e) { return '--:--'; }
    }

    function formatearFecha(fecha) {
        try {
            return new Date(fecha).toLocaleDateString('es-NI', { day: '2-digit', month: 'short' });
        } catch(e) { return ''; }
    }

    function generarId(prefix) {
        prefix = prefix || 'msg_';
        return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    }

    function mostrarToast(msg, tipo) {
        tipo = tipo || 'success';
        const old = document.querySelector('.toast-message');
        if (old) old.remove();
        const t = document.createElement('div');
        t.className = 'toast-message';
        const ic = tipo === 'success' ? 'fa-check-circle'
                 : tipo === 'error' ? 'fa-exclamation-circle'
                 : tipo === 'warning' ? 'fa-exclamation-triangle'
                 : 'fa-info-circle';
        t.innerHTML = '<i class="fas ' + ic + '"></i> ' + msg;
        if (tipo === 'error') t.style.borderLeftColor = '#ef4444';
        else if (tipo === 'warning') t.style.borderLeftColor = '#fbbf24';
        else if (tipo === 'info') t.style.borderLeftColor = '#38bdf8';
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 4000);
    }

    // ============================================================
    // 📁 TIPOS DE ARCHIVO
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

    async function comprimirImagen(file, maxWidth, calidad) {
        maxWidth = maxWidth || 1200;
        calidad = calidad || 0.75;

        return new Promise((resolve) => {
            if (!esImagen(file.name, file.type)) {
                resolve(file);
                return;
            }

            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;

                if (w > maxWidth) {
                    h = h * maxWidth / w;
                    w = maxWidth;
                }

                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);

                canvas.toBlob(blob => {
                    URL.revokeObjectURL(url);
                    const comprimida = new File([blob], file.name, { type: 'image/jpeg' });
                    console.log('🗜️ Imagen comprimida: ' +
                        (file.size/1024).toFixed(1) + ' KB → ' +
                        (comprimida.size/1024).toFixed(1) + ' KB');
                    resolve(comprimida);
                }, 'image/jpeg', calidad);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(file);
            };
            img.src = url;
        });
    }

    // ============================================================
    // API GET
    // ============================================================
    async function api(accion, params) {
        let url = API_URL +
            '?key=' + encodeURIComponent(CLAVE_CARPETA) +
            '&accion=' + encodeURIComponent(accion) +
            '&t=' + Date.now();

        if (params) {
            Object.keys(params).forEach(k => {
                if (params[k] !== null && params[k] !== undefined) {
                    let v = params[k];
                    if (typeof v === 'object') v = JSON.stringify(v);
                    url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
                }
            });
        }

        console.log('🔗 [GET] →', accion);

        const resp = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!resp.ok) throw new Error('HTTP ' + resp.status);

        const data = await resp.json();
        console.log('✅ [GET] OK:', accion);
        return data;
    }

    // ============================================================
    // 📤 API POST
    // ============================================================
    async function enviarPost(datos) {
        const url = API_URL + '?key=' + encodeURIComponent(CLAVE_CARPETA);
        const body = 'payload=' + encodeURIComponent(JSON.stringify(datos));

        console.log('📤 [POST] →', datos.accion, '| Body:', (body.length / 1024).toFixed(1) + ' KB');

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
            console.error('❌ Respuesta no es JSON:', texto.substring(0, 300));
            throw new Error('Respuesta no es JSON: ' + texto.substring(0, 100));
        }

        if (!data || !data.ok) {
            const errorMsg = (data && data.error) ? data.error : 'Error desconocido del servidor';
            console.error('❌ [POST] Error servidor:', errorMsg);
            throw new Error(errorMsg);
        }

        console.log('✅ [POST] OK:', datos.accion);
        return data;
    }

    // ============================================================
    // ✅ CONFIRMAR GUARDADO
    // ============================================================
    async function confirmarGuardado(msgId) {
        if (confirmacionesEnProgreso.has(msgId)) return;
        confirmacionesEnProgreso.add(msgId);

        try {
            const msg = mensajes.find(m => m.id === msgId);
            if (!msg || !msg.archivo) {
                confirmacionesEnProgreso.delete(msgId);
                return;
            }

            if (msg.archivo._guardadoEnLocal || msg.archivo.guardado_en_ubicacion) {
                confirmacionesEnProgreso.delete(msgId);
                return;
            }

            console.log('✅ Confirmando guardado:', msg.archivo.nombre);

            const data = await enviarPost({
                accion: 'confirmar_guardado',
                msg_id: msgId,
                conductor_id: idConductor
            });

            if (data && data.ok) {
                msg.archivo._guardadoEnLocal = true;
                console.log('✅ Confirmado');
            }
        } catch (e) {
            console.warn('⚠️ Error confirmando guardado:', e.message);
        } finally {
            confirmacionesEnProgreso.delete(msgId);
        }
    }

    function confirmarTodosPendientes() {
        let pendientes = 0;
        mensajes.forEach(msg => {
            if (msg.archivo && !msg.archivo._guardadoEnLocal && !msg.archivo.guardado_en_ubicacion) {
                pendientes++;
                confirmarGuardado(msg.id);
            }
        });
        if (pendientes > 0) {
            console.log('✅ Confirmando ' + pendientes + ' archivos');
            mostrarToast('✅ Confirmando ' + pendientes + ' archivos', 'success');
        } else {
            console.log('ℹ️ No hay archivos pendientes');
        }
    }

    // ============================================================
    // 🆘 FALLBACK DE UBICACIÓN
    // ============================================================
    function aplicarUbicacionFallback(origen) {
        ubicacionActual = {
            lat: FALLBACK_LAT,
            lng: FALLBACK_LNG,
            accuracy: 99999
        };
        ubicacionPermitida = true;

        console.warn('⚠️ GPS no disponible. Usando Managua (' + origen + ')');
        actualizarIndicadorGPS();

        if (idConductor && conductorVerificado) {
            registrarConductor();
        }
    }

    // ============================================================
    // GPS
    // ============================================================
    function obtenerUbicacionSilenciosa() {
        console.log('📍 Solicitando GPS...');

        if (window.location.protocol === 'file:') {
            console.warn('⚠️ file:// → fallback');
            aplicarUbicacionFallback('file://');
            return;
        }

        if (!navigator.geolocation) {
            console.error('❌ Sin API de geolocalización');
            if (USAR_FALLBACK_AUTO) aplicarUbicacionFallback('sin API');
            else actualizarIndicadorGPS();
            return;
        }

        let intentos = 0;
        const configs = [
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
            { enableHighAccuracy: true,  timeout: 15000, maximumAge: 0 }
        ];

        function intentar() {
            if (intentos >= configs.length) {
                console.error('❌ Se agotaron los intentos');
                if (USAR_FALLBACK_AUTO) aplicarUbicacionFallback('timeout');
                else actualizarIndicadorGPS();
                return;
            }

            const cfg = configs[intentos];
            console.log(`📍 Intento ${intentos + 1}/${configs.length}...`);
            intentos++;

            navigator.geolocation.getCurrentPosition(
                function(pos) {
                    ubicacionActual = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        accuracy: Math.round(pos.coords.accuracy)
                    };
                    ubicacionPermitida = true;
                    console.log('✅ GPS REAL obtenido:', ubicacionActual);
                    actualizarIndicadorGPS();

                    if (idConductor && conductorVerificado) {
                        registrarConductor();
                    }
                },
                function(err) {
                    console.warn(`⚠️ Intento ${intentos} falló: código ${err.code}`);

                    if (err.code === 1) {
                        console.error('❌ Permiso denegado');
                        if (USAR_FALLBACK_AUTO) aplicarUbicacionFallback('permiso');
                        else actualizarIndicadorGPS();
                        return;
                    }

                    setTimeout(intentar, 1000);
                },
                cfg
            );
        }

        intentar();
    }

    function actualizarIndicadorGPS() {
        const ind = $('gpsStatusIndicator');
        if (!ind) return;

        if (ubicacionPermitida && ubicacionActual) {
            ind.innerHTML = '<i class="fas fa-circle" style="color:#10b981;font-size:0.45rem;"></i>';
        } else {
            ind.innerHTML = '<i class="fas fa-circle" style="color:#fbbf24;font-size:0.45rem;"></i>';
        }
    }

    // ============================================================
    // MODAL ID (dinámico: primer login o cambio de conductor)
    // ============================================================
    function mostrarModalId(esCambio) {
        const modal = $('modalIdConductor');
        const input = $('inputIdConductor');
        const msj = $('mensajeVerificacion');
        const btn = $('btnIngresarConductor');
        const titulo = $('tituloModalId');
        const texto = $('textoModalId');
        if (!modal) return;

        // ✅ Texto dinámico
        if (esCambio) {
            if (titulo) titulo.textContent = '🔄 Cambiar Conductor';
            if (texto) texto.innerHTML = 'Ingresa el <strong>nuevo ID</strong> de conductor.';
        } else {
            if (titulo) titulo.textContent = '👤 Identifícate';
            if (texto) texto.innerHTML = 'Ingresa tu <strong>ID de conductor</strong>.';
        }

        modal.classList.add('active');
        if (input) { input.focus(); input.value = ''; }
        if (msj) { msj.textContent = ''; msj.className = 'mensaje-modal'; }
        if (btn) {
            btn.innerHTML = '<i class="fas fa-search"></i> Verificar';
            btn.className = 'btn-principal';
            btn.disabled = false;
        }
        const mi = $('mensajeInput');
        const be = $('btnEnviar');
        if (mi) mi.disabled = true;
        if (be) be.disabled = true;
    }

    // ============================================================
    // 🔄 CAMBIAR CONDUCTOR (al tocar el avatar)
    // ============================================================
    window.cambiarConductor = function() {
        console.log('🔄 Cambiando de conductor...');

        // Detener polling actual
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }

        // Resetear estado
        conductorVerificado = false;
        idConductor = '';
        nombreConductor = '';
        mensajes = [];
        ultimoHash = '';

        // Limpiar localStorage
        try {
            localStorage.removeItem('conductor_id');
            localStorage.removeItem('conductor_nombre');
        } catch(e) {}

        // Limpiar header
        const nh = $('nombreConductorHeader');
        if (nh) nh.textContent = '📡 Conectando...';

        // Limpiar chat
        const c = $('chatMessages');
        if (c) {
            c.innerHTML = '<div class="empty-messages"><i class="fas fa-comments"></i><p>Chat de conductores</p></div>';
        }

        // Abrir modal en modo "cambio"
        mostrarModalId(true);
    };

    // ============================================================
    // 🚪 CERRAR SESIÓN
    // ============================================================
    window.cerrarSesion = function() {
        console.log('🚪 Cerrando sesión...');

        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }

        conductorVerificado = false;
        idConductor = '';
        nombreConductor = '';
        mensajes = [];
        ultimoHash = '';

        try {
            localStorage.removeItem('conductor_id');
            localStorage.removeItem('conductor_nombre');
        } catch(e) {}

        const nh = $('nombreConductorHeader');
        if (nh) nh.textContent = '📡 Conectando...';

        const c = $('chatMessages');
        if (c) {
            c.innerHTML = '<div class="empty-messages"><i class="fas fa-comments"></i><p>Chat de conductores</p></div>';
        }

        // Mostrar modal de presentación de nuevo
        const mp = $('modalPresentacion');
        if (mp) mp.classList.add('active');
    };

    // ============================================================
    // VERIFICAR CONDUCTOR
    // ============================================================
    async function verificarConductor(id) {
        const msj = $('mensajeVerificacion');
        const btn = $('btnIngresarConductor');

        if (!id) {
            if (msj) {
                msj.textContent = '⚠️ Ingresa un ID';
                msj.className = 'mensaje-modal error';
            }
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="loading-spinner"></span>';
        }
        if (msj) {
            msj.textContent = '🔍 Buscando...';
            msj.className = 'mensaje-modal wait';
        }

        try {
            const resp = await api('conductores_conectados', {});
            let encontrado = null;

            if (resp && resp.ok && resp.conductores) {
                encontrado = resp.conductores.find(c =>
                    c.id && c.id.toUpperCase() === id.toUpperCase()
                );
                if (!encontrado) {
                    encontrado = resp.conductores.find(c =>
                        c.nombre && c.nombre.toUpperCase() === id.toUpperCase()
                    );
                }
            }

            if (encontrado) {
                idConductor = encontrado.id;
                nombreConductor = encontrado.nombre || ('Conductor ' + encontrado.id);
            } else {
                idConductor = id;
                nombreConductor = 'Conductor ' + id;
            }

            conductorVerificado = true;

            // ✅ Guardar en localStorage (recuerda al usuario)
            try {
                localStorage.setItem('conductor_id', idConductor);
                localStorage.setItem('conductor_nombre', nombreConductor);
            } catch(e) {}

            if (msj) {
                msj.textContent = '✅ ' + nombreConductor;
                msj.className = 'mensaje-modal ok';
            }
            if (btn) {
                btn.innerHTML = '<i class="fas fa-check"></i> Verificado';
                btn.className = 'btn-principal success';
            }

            setTimeout(() => {
                const modal = $('modalIdConductor');
                const mi = $('mensajeInput');
                const be = $('btnEnviar');
                const nh = $('nombreConductorHeader');
                if (modal) modal.classList.remove('active');
                if (mi) mi.disabled = false;
                if (be) be.disabled = false;
                if (nh) nh.textContent = '👤 ' + nombreConductor;

                registrarConductor();
                cargarMensajes();
                iniciarPolling();

                if (!ubicacionPermitida || !ubicacionActual) {
                    console.log('📍 Sin ubicación → fallback automático');
                    aplicarUbicacionFallback('auto al verificar');
                } else {
                    registrarConductor();
                }
            }, 600);
        } catch (e) {
            if (msj) {
                msj.textContent = '❌ ' + (e.message || e);
                msj.className = 'mensaje-modal error';
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-search"></i> Verificar';
            }
        }
    }

    // ============================================================
    // REGISTRO
    // ============================================================
    async function registrarConductor() {
        if (!idConductor || registrando) return;
        registrando = true;
        try {
            const data = await api('registrar_conductor', {
                conductor_id: idConductor,
                nombre: nombreConductor,
                chat_id: 'conductor_' + idConductor,
                ubicacion: ubicacionActual ? { lat: ubicacionActual.lat, lng: ubicacionActual.lng } : null
            });
            if (data && data.ok) {
                console.log('✅ Conductor registrado:', data.mensaje);
            }
        } catch (e) {
            console.warn('⚠️ Error registrando:', e);
        } finally {
            registrando = false;
        }
    }

    function actualizarUbicacion() {
        if (!idConductor || !ubicacionActual) return;
        api('registrar_conductor', {
            conductor_id: idConductor,
            nombre: nombreConductor,
            ubicacion: { lat: ubicacionActual.lat, lng: ubicacionActual.lng }
        }).catch(() => {});
    }

    // ============================================================
    // MENSAJES
    // ============================================================
    async function cargarMensajes() {
        if (!idConductor) return;
        try {
            const data = await api('mensajes_conductor', {
                conductor_id: idConductor,
                limite: 100
            });
            if (!data || !data.ok) return;

            const nuevos = data.mensajes || [];
            const nuevoHash = JSON.stringify(nuevos.map(m => m.id));
            if (nuevoHash === ultimoHash) return;
            ultimoHash = nuevoHash;

            mensajes = nuevos.map(msg => {
                const esDelPanel = msg.remitente === 'GPS Panel' ||
                                   msg.remitente === 'Administrador' ||
                                   msg.remitente === 'Tú';
                const esPropioConductor = msg.remitente === nombreConductor;

                return {
                    id: msg.id,
                    conductor: msg.remitente || 'Conductor',
                    mensaje: msg.mensaje || '',
                    fecha: new Date(msg.fecha || Date.now()),
                    esPropio: esPropioConductor,
                    esDelPanel: esDelPanel,
                    archivo: msg.archivo || null,
                    reaccion: msg.reaccion || '',
                    conductor_id: msg.conductor_id || idConductor
                };
            });
            renderizarMensajes();

            setTimeout(autoConfirmarArchivosVistos, 1000);

        } catch (e) {
            console.warn('⚠️ Error cargando mensajes:', e.message);
        }
    }

    function autoConfirmarArchivosVistos() {
        let confirmados = 0;

        mensajes.forEach(msg => {
            if (msg.archivo && !msg.esPropio) {
                if (!msg.archivo._guardadoEnLocal && !msg.archivo.guardado_en_ubicacion && !confirmacionesEnProgreso.has(msg.id)) {
                    confirmarGuardado(msg.id);
                    confirmados++;
                }
            }
        });

        if (confirmados > 0) {
            console.log('✅ Auto-confirmando ' + confirmados + ' archivos vistos');
        }
    }

    function iniciarPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(cargarMensajes, POLLING_INTERVAL);
    }

    // ============================================================
    // ENVIAR MENSAJE
    // ============================================================
    async function enviarMensaje() {
        const input = $('mensajeInput');
        if (!input) return;
        const texto = input.value.trim();

        if (!conductorVerificado || !idConductor) {
            mostrarModalId(false);
            return;
        }

        if (!ubicacionPermitida || !ubicacionActual) {
            aplicarUbicacionFallback('auto al enviar');
        }

        if (archivosSeleccionados.length > 0) {
            await enviarConArchivo(texto);
            input.value = '';
            return;
        }

        if (!texto) {
            mostrarToast('⚠️ Escribe un mensaje', 'warning');
            return;
        }

        const btn = $('btnEnviar');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
        }

        const msgId = generarId('msg_');
        mensajes.push({
            id: msgId,
            conductor: nombreConductor,
            mensaje: texto,
            fecha: new Date(),
            esPropio: true,
            esDelPanel: false,
            archivo: null,
            conductor_id: idConductor
        });
        input.value = '';
        renderizarMensajes();

        try {
            const data = await api('enviar_mensaje', {
                conductor_id: idConductor,
                remitente: nombreConductor,
                mensaje: texto,
                ubicacion: ubicacionActual ? {
                    lat: ubicacionActual.lat,
                    lng: ubicacionActual.lng
                } : null,
                fecha: new Date().toISOString(),
                msg_id: msgId
            });
            if (data && data.ok) {
                mostrarToast('✅ Enviado', 'success');
            } else {
                throw new Error((data && data.error) || 'Error');
            }
        } catch (e) {
            mostrarToast('❌ ' + e.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            }
        }
    }

    // ============================================================
    // 📎 ENVIAR ARCHIVO EN CHUNKS
    // ============================================================
    async function enviarConArchivo(texto) {
        let file = archivosSeleccionados[0];
        if (!file) return;

        if (enviandoChunks) {
            mostrarToast('⏳ Ya se está enviando un archivo', 'warning');
            return;
        }

        const btn = $('btnEnviar');
        const info = getTipoArchivoInfo(file.name, file.type);

        if (!esTipoPermitido(file.name, file.type)) {
            mostrarToast('❌ Tipo de archivo no permitido', 'error');
            return;
        }

        const tamañoMBOriginal = file.size / 1024 / 1024;
        const tamañoMaxMB = (MAX_CHUNKS * CHUNK_SIZE_BYTES * 0.75) / 1024 / 1024;

        if (esImagen(file.name, file.type) && tamañoMBOriginal > 0.5) {
            console.log('🗜️ Comprimiendo imagen para optimizar envío...');
            mostrarToast('🗜️ Comprimiendo imagen...', 'info');
            file = await comprimirImagen(file);
        }

        const tamañoMB = file.size / 1024 / 1024;

        if (tamañoMB > tamañoMaxMB) {
            mostrarToast('❌ Archivo muy grande: ' + tamañoMB.toFixed(1) +
                        ' MB (máx ' + tamañoMaxMB.toFixed(1) + ' MB)', 'error');
            return;
        }

        enviandoChunks = true;

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Preparando...';
        }

        try {
            console.log('📦 Convirtiendo a base64:', file.name);
            const base64 = await archivoABase64(file);
            const totalChars = base64.length;
            const numChunks = Math.ceil(totalChars / CHUNK_SIZE_BYTES);

            console.log('📦 ' + numChunks + ' chunks de ' + (CHUNK_SIZE_BYTES/1024) + ' KB');

            const msgId = generarId('msg_');
            const transferId = generarId('tx_');

            transferActual = {
                transferId: transferId,
                msgId: msgId,
                nombre: file.name,
                total: numChunks,
                enviados: 0,
                inicio: Date.now(),
                tamaño: file.size
            };

            mostrarToast('📤 Enviando ' + tamañoMB.toFixed(2) + ' MB en ' +
                        numChunks + ' chunks...', 'info');

            console.log('🎬 Transfer ID:', transferId);
            console.log('🎬 Msg ID:', msgId);

            const t0 = Date.now();
            for (let i = 0; i < numChunks; i++) {
                const inicio = i * CHUNK_SIZE_BYTES;
                const fin = Math.min(inicio + CHUNK_SIZE_BYTES, totalChars);
                const chunk = base64.substring(inicio, fin);
                const esUltimo = (i === numChunks - 1);

                let enviado = false;
                let ultimoError = null;

                for (let intento = 1; intento <= REINTENTOS_CHUNK; intento++) {
                    try {
                        const payload = {
                            accion: 'enviar_chunk',
                            transfer_id: transferId,
                            conductor_id: idConductor,
                            msg_id: msgId,
                            chunk_idx: i,
                            total_chunks: numChunks,
                            chunk_base64: chunk,
                            es_ultimo: esUltimo
                        };

                        if (i === 0) {
                            payload.nombre_conductor = nombreConductor;
                            payload.remitente = nombreConductor;
                            payload.mensaje = texto || '';
                            payload.fecha = new Date().toISOString();
                            payload.ubicacion = ubicacionActual ? {
                                lat: ubicacionActual.lat,
                                lng: ubicacionActual.lng
                            } : null;
                            payload.archivo_nombre = file.name;
                            payload.archivo_tipo = file.type || 'application/octet-stream';
                            payload.archivo_tamanio = file.size;
                            payload.archivo_clase = info.clase;
                            payload.archivo_icono = info.icono;
                            payload.archivo_color = info.color;
                        }

                        const data = await enviarPost(payload);
                        enviado = true;
                        break;

                    } catch (e) {
                        ultimoError = e;
                        console.warn('⚠️ Chunk ' + i + ' intento ' + intento + ' falló:', e.message);
                        if (intento < REINTENTOS_CHUNK) {
                            await new Promise(r => setTimeout(r, 800 * intento));
                        }
                    }
                }

                if (!enviado) {
                    throw new Error('Chunk ' + i + ' falló después de ' + REINTENTOS_CHUNK +
                                    ' intentos: ' + (ultimoError ? ultimoError.message : 'desconocido'));
                }

                transferActual.enviados = i + 1;

                const porcentaje = Math.round(((i + 1) / numChunks) * 100);
                console.log('📤 Chunk ' + (i+1) + '/' + numChunks + ' (' + porcentaje + '%)');

                if (btn) {
                    btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> ' +
                                    (i+1) + '/' + numChunks + ' (' + porcentaje + '%)';
                }

                if (i < numChunks - 1) {
                    await new Promise(r => setTimeout(r, PAUSA_ENTRE_CHUNKS));
                }
            }

            const duracion = ((Date.now() - t0) / 1000).toFixed(1);
            console.log('✅ Todos los chunks enviados en ' + duracion + 's');
            mostrarToast('✅ ' + info.clase + ' enviado (' + tamañoMB.toFixed(2) +
                        ' MB en ' + duracion + 's)', 'success');

            transferActual = null;
            limpiarArchivoSeleccionado();
            setTimeout(cargarMensajes, 1500);

        } catch (e) {
            console.error('❌ Error enviando archivo:', e);
            mostrarToast('❌ ' + e.message, 'error');

            if (transferActual && transferActual.transferId) {
                console.log('🧹 Limpiando chunks del transfer fallido...');
                try {
                    await api('limpiar_chunks_huerfanos', {});
                } catch (e2) {}
            }
            transferActual = null;
        } finally {
            enviandoChunks = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            }
        }
    }

    function limpiarArchivoSeleccionado() {
        archivosSeleccionados = [];
        const fi = $('fileInput');
        if (fi) fi.value = '';
        actualizarArchivosSeleccionados();
        const mi = $('mensajeInput');
        if (mi) mi.value = '';
    }

    // ============================================================
    // RENDER
    // ============================================================
    function renderizarMensajes() {
        const c = $('chatMessages');
        if (!c) return;

        if (mensajes.length === 0) {
            c.innerHTML = '<div class="empty-messages"><i class="fas fa-comments"></i><p>Sin mensajes</p></div>';
            return;
        }
        let html = '';
        let ultimaFecha = '';
        const ordenados = [...mensajes].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

        ordenados.forEach(msg => {
            const fechaStr = formatearFecha(msg.fecha);
            const horaStr = formatearHora(msg.fecha);

            if (fechaStr !== ultimaFecha) {
                html += '<div class="fecha-divider">' + fechaStr + '</div>';
                ultimaFecha = fechaStr;
            }

            const clase = msg.esPropio ? 'sent' : 'received';
            html += '<div class="message ' + clase + '">';

            if (!msg.esPropio) {
                const nombreMostrar = msg.esDelPanel ? '🖥️ ' + msg.conductor : msg.conductor;
                html += '<span class="nombre-emisor">' + escapeHtml(nombreMostrar) + '</span>';
            }

            if (msg.mensaje) html += '<div class="msg-text">' + escapeHtml(msg.mensaje) + '</div>';

            if (msg.archivo) {
                const archivo = msg.archivo;
                const info = getTipoArchivoInfo(archivo.nombre, archivo.tipo);
                const tamañoKB = ((archivo.tamanio || 0) / 1024).toFixed(1);
                const tamañoMB = ((archivo.tamanio || 0) / 1024 / 1024).toFixed(2);

                if (archivo.base64 && esImagen(archivo.nombre, archivo.tipo)) {
                    html += '<div class="archivo-msg imagen" onclick="abrirModalImagen(\'' + archivo.base64 + '\')">' +
                        '<img src="data:' + (archivo.tipo || 'image/png') + ';base64,' + archivo.base64 + '" alt="' + escapeHtml(archivo.nombre) + '">' +
                        '<div class="archivo-info-overlay">' +
                            '<span>' + escapeHtml(archivo.nombre) + '</span>' +
                            '<span>' + tamañoKB + ' KB</span>' +
                        '</div></div>';
                }
                else if (archivo.base64 && esVideo(archivo.nombre, archivo.tipo)) {
                    html += '<div class="archivo-msg video">' +
                        '<video controls preload="metadata" src="data:' + archivo.tipo + ';base64,' + archivo.base64 + '"></video>' +
                        '<div class="archivo-info-overlay">' +
                            '<span><i class="fas fa-video"></i> ' + escapeHtml(archivo.nombre) + '</span>' +
                            '<span>' + tamañoMB + ' MB</span>' +
                        '</div></div>';
                }
                else if (archivo.base64 && esAudio(archivo.nombre, archivo.tipo)) {
                    html += '<div class="archivo-msg audio">' +
                        '<div class="audio-icon"><i class="fas fa-music"></i></div>' +
                        '<div class="audio-body">' +
                            '<div class="audio-name">' + escapeHtml(archivo.nombre) + '</div>' +
                            '<audio controls preload="metadata" src="data:' + archivo.tipo + ';base64,' + archivo.base64 + '"></audio>' +
                        '</div></div>';
                }
                else if (archivo.base64 && (archivo.tipo === 'application/pdf' || TIPOS_PERMITIDOS[archivo.tipo] === 'pdf')) {
                    html += '<a href="data:' + archivo.tipo + ';base64,' + archivo.base64 + '" download="' + escapeHtml(archivo.nombre) + '" class="archivo-msg doc pdf" target="_blank">' +
                        '<div class="doc-icon"><i class="fas fa-file-pdf"></i></div>' +
                        '<div class="doc-body">' +
                            '<div class="doc-name">' + escapeHtml(archivo.nombre) + '</div>' +
                            '<div class="doc-detail">PDF · ' + tamañoKB + ' KB</div>' +
                        '</div>' +
                        '<i class="fas fa-download doc-download"></i>' +
                    '</a>';
                }
                else if (archivo.base64) {
                    const ext = (archivo.nombre || '').split('.').pop().toUpperCase();
                    html += '<a href="data:' + archivo.tipo + ';base64,' + archivo.base64 + '" download="' + escapeHtml(archivo.nombre) + '" class="archivo-msg doc" target="_blank">' +
                        '<div class="doc-icon" style="color:' + info.color + ';"><i class="fas ' + info.icono + '"></i></div>' +
                        '<div class="doc-body">' +
                            '<div class="doc-name">' + escapeHtml(archivo.nombre) + '</div>' +
                            '<div class="doc-detail">' + ext + ' · ' + tamañoKB + ' KB</div>' +
                        '</div>' +
                        '<i class="fas fa-download doc-download" style="color:' + info.color + ';"></i>' +
                    '</a>';
                }
                else if (archivo._guardadoEnLocal || archivo.guardado_en_ubicacion || archivo.guardado_en_disco) {
                    const ext = (archivo.nombre || '').split('.').pop().toUpperCase();
                    html += '<div class="archivo-msg doc" style="cursor:default;">' +
                        '<div class="doc-icon" style="color:' + info.color + ';"><i class="fas ' + info.icono + '"></i></div>' +
                        '<div class="doc-body">' +
                            '<div class="doc-name">' + escapeHtml(archivo.nombre) + '</div>' +
                            '<div class="doc-detail">' + ext + ' · ' + tamañoKB + ' KB · 📦 En ubicación</div>' +
                        '</div>' +
                    '</div>';
                }
                else {
                    html += '<div class="archivo-msg drive">' +
                        '<div class="doc-icon" style="color:' + info.color + ';"><i class="fas ' + info.icono + ' fa-pulse"></i></div>' +
                        '<div class="doc-body">' +
                            '<div class="doc-name">' + escapeHtml(archivo.nombre) + '</div>' +
                            '<div class="doc-detail">⏳ Procesando... · ' + tamañoKB + ' KB</div>' +
                        '</div>' +
                        '<button onclick="recargarMensajesManual()" class="btn-descarga-drive" title="Recargar">' +
                            '<i class="fas fa-sync"></i>' +
                        '</button>' +
                    '</div>';
                }
            }

            if (msg.reaccion) {
                html += '<span style="font-size:0.8rem;">' + msg.reaccion + '</span>';
            }

            html += '<span class="hora">' + horaStr + '</span></div>';
        });

        c.innerHTML = html;
        c.scrollTop = c.scrollHeight;
        const cont = $('contadorConectados');
        if (cont) cont.textContent = '1';
    }

    window.recargarMensajesManual = function() {
        console.log('🔄 Recargando mensajes manualmente...');
        ultimoHash = '';
        cargarMensajes();
        mostrarToast('🔄 Recargando...', 'info');
    };

    // ============================================================
    // MODAL IMAGEN
    // ============================================================
    window.abrirModalImagen = function(src) {
        const img = $('imagenAmpliada');
        const modal = $('modalImagen');
        if (img) img.src = 'data:image/png;base64,' + src;
        if (modal) modal.classList.add('active');
    };
    window.cerrarModalImagen = function() {
        const modal = $('modalImagen');
        if (modal) modal.classList.remove('active');
    };

    // ============================================================
    // ARCHIVOS SELECCIONADOS
    // ============================================================
    function actualizarArchivosSeleccionados() {
        const div = $('archivosSeleccionados');
        const badge = $('badgeArchivos');
        if (!div || !badge) return;

        if (archivosSeleccionados.length === 0) {
            div.style.display = 'none';
            badge.style.display = 'none';
            return;
        }

        let html = '';
        archivosSeleccionados.forEach((file, index) => {
            const info = getTipoArchivoInfo(file.name, file.type);
            const tamaño = formatearTamaño(file.size);
            const numChunks = Math.ceil(file.size * 1.33 / CHUNK_SIZE_BYTES);
            html += '<span class="tag"><i class="fas ' + info.icono + '" style="color:' + info.color + ';"></i> ' +
                escapeHtml(file.name) + ' <small>(' + tamaño + ' · ' + numChunks + ' chunks)</small>' +
                ' <span class="remove" onclick="eliminarArchivo(' + index + ')">✕</span></span>';
        });
        div.innerHTML = html;
        div.style.display = 'flex';
        badge.textContent = archivosSeleccionados.length;
        badge.style.display = 'inline';
    }

    window.eliminarArchivo = function(index) {
        archivosSeleccionados.splice(index, 1);
        actualizarArchivosSeleccionados();
    };

    window.refrescarChat = function() {
        ultimoHash = '';
        cargarMensajes();
        mostrarToast('🔄 Actualizado', 'info');
    };

    window.enviarMensaje = enviarMensaje;
    window.confirmarTodosPendientes = confirmarTodosPendientes;

    // ============================================================
    // BIND EVENTOS
    // ============================================================
    function bindEventos() {
        const btnComenzar = $('btnComenzar');
        if (btnComenzar) {
            btnComenzar.addEventListener('click', function() {
                console.log('👆 Click en Comenzar');
                const mp = $('modalPresentacion');
                if (mp) mp.classList.remove('active');
                mostrarModalId(false);   // ← false = primer login
            });
        }

        const inputId = $('inputIdConductor');
        if (inputId) {
            inputId.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    verificarConductor(this.value.trim().toUpperCase());
                }
            });
        }

        const btnIngresar = $('btnIngresarConductor');
        if (btnIngresar) {
            btnIngresar.addEventListener('click', function() {
                console.log('👆 Click en Verificar');
                const input = $('inputIdConductor');
                verificarConductor(input ? input.value.trim().toUpperCase() : '');
            });
        }

        const msgInput = $('mensajeInput');
        if (msgInput) {
            msgInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    enviarMensaje();
                }
            });
        }

        const fileInp = $('fileInput');
        if (fileInp) {
            fileInp.addEventListener('change', function() {
                const nuevos = Array.from(this.files);
                if (nuevos.length === 0) return;
                const file = nuevos[0];

                if (!esTipoPermitido(file.name, file.type)) {
                    mostrarToast('❌ Tipo de archivo no permitido', 'error');
                    this.value = '';
                    return;
                }

                const tamañoMB = file.size / 1024 / 1024;
                const tamañoMaxMB = (MAX_CHUNKS * CHUNK_SIZE_BYTES * 0.75) / 1024 / 1024;

                if (tamañoMB > tamañoMaxMB) {
                    mostrarToast('❌ El archivo excede ' + tamañoMaxMB.toFixed(1) + ' MB', 'error');
                    this.value = '';
                    return;
                }

                archivosSeleccionados = [file];
                actualizarArchivosSeleccionados();
                this.value = '';

                const info = getTipoArchivoInfo(file.name, file.type);
                const tamaño = formatearTamaño(file.size);
                const numChunks = Math.ceil(file.size * 1.33 / CHUNK_SIZE_BYTES);
                mostrarToast('📎 ' + info.clase + ' listo (' + tamaño + ' · ' + numChunks + ' chunks)', 'info');
            });
        }

        const termInput = $('terminalInput');
        if (termInput) {
            termInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    terminalEjecutar();
                }
            });
        }

        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.key === 'F12') {
                e.preventDefault();
                toggleTerminal();
            }
        });

        console.log('✅ Eventos enlazados');
    }

    // ============================================================
    // INIT (con auto-login)
    // ============================================================
    function init() {
        if (inicializado) return;
        inicializado = true;

        // ✅ AUTO-LOGIN: revisar si hay conductor guardado
        let conductorGuardado = null;
        let nombreGuardado = null;
        try {
            conductorGuardado = localStorage.getItem('conductor_id');
            nombreGuardado = localStorage.getItem('conductor_nombre');
        } catch(e) {}

        console.log('📡 Chat Conductor v24.0');
        console.log('🔗 Modo: chunks en vivo → Apps Script → Panel GPS');
        console.log('📦 Chunk size: ' + (CHUNK_SIZE_BYTES/1024) + ' KB · Máx ' + MAX_CHUNKS + ' chunks');
        console.log('📂 Protocolo:', window.location.protocol);
        console.log('💡 Ctrl+F12 para terminal');

        if (conductorGuardado && nombreGuardado) {
            console.log('✅ Auto-login detectado:', nombreGuardado);
        } else {
            console.log('ℹ️ Sin conductor guardado → login manual');
        }

        const btnComenzar = document.getElementById('btnComenzar');
        if (!btnComenzar) {
            console.error('❌ btnComenzar no existe. Reintentando...');
            setTimeout(init, 200);
            inicializado = false;
            return;
        }

        const mi = $('mensajeInput');
        const be = $('btnEnviar');
        if (mi) mi.disabled = true;
        if (be) be.disabled = true;

        bindEventos();

        // ✅ AUTO-LOGIN
        if (conductorGuardado && nombreGuardado) {
            // Ocultar modal de presentación
            const mp = $('modalPresentacion');
            if (mp) mp.classList.remove('active');

            // Restaurar sesión
            idConductor = conductorGuardado;
            nombreConductor = nombreGuardado;
            conductorVerificado = true;

            const nh = $('nombreConductorHeader');
            if (nh) nh.textContent = '👤 ' + nombreConductor;

            if (mi) mi.disabled = false;
            if (be) be.disabled = false;

            // Registrar, cargar mensajes e iniciar polling
            registrarConductor();
            cargarMensajes();
            iniciarPolling();

            mostrarToast('👋 Bienvenido ' + nombreConductor, 'success');
        } else {
            // Sin conductor guardado → mostrar modal de presentación
            console.log('ℹ️ Esperando login manual...');
        }

        setTimeout(() => {
            console.log('📍 Solicitando GPS automáticamente...');
            obtenerUbicacionSilenciosa();
        }, 500);

        setInterval(() => {
            if (idConductor && ubicacionActual) actualizarUbicacion();
        }, 60000);

        console.log('✅ Init completo');
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 100);
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(init, 100);
        });
    }

})();