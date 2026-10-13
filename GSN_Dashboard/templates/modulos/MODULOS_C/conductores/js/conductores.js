// ============================================================
// CHAT DE CONDUCTORES - VERSIÓN v21.1
// SOLO IMÁGENES - AUTO-LIMPIEZA AL ENVIAR
// ============================================================
(function() {
    "use strict";

    const API_URL = 'https://script.google.com/macros/s/AKfycbwxj3BUUHL8_SRQaWqWWKrTKxBY-darbBE6qv0A3KFhZOXm7CQdWgiK-fPTfyP-q_dyOg/exec';
    const CLAVE_CARPETA = 'GSN-DASHBOARD-2026';
    const STORAGE_KEY = 'conductor_data_local';
    const MENSAJES_KEY = 'conductor_mensajes_local';
    const LIMPIEZA_KEY = 'conductor_limpieza_';
    const ULTIMO_ID_KEY = 'conductor_ultimo_id_';
    const MAX_FILE_SIZE_KB = 512000; // 500 MB
    const FILE_CACHE_PREFIX = 'file_';
    const CHUNK_SIZE = 500000;
    const MAX_SMALL_FILE_KB = 1024;

    let ubicacionActual = null;
    let ubicacionPermitida = false;
    let nombreConductor = "";
    let idConductor = "";
    let conductorVerificado = false;
    let conectadoAMadre = false;
    let chatIdUnico = "conductor_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    let pollingInterval = null;
    let listaConductoresFlota = [];
    let archivosSeleccionados = [];
    let callbackCounter = 0;
    let reconectando = false;
    let mensajes = [];
    let mensajesPendientes = [];
    let reenvioInterval = null;
    let yaInicializado = false;
    let mensajesEnviadosIds = new Set();
    let subidaEnProgreso = false;
    let descargandoDrive = {};
    let tiempoUltimaLimpieza = 0;
    let ultimoMsgIdRecibido = '';
    let redirigiendo = false;
    let servidorCentralActivo = false;
    let subidaPorChunks = {};
    let chunkEstado = {};

    const messagesContainer = document.getElementById('chatMessages');
    const mensajeInput = document.getElementById('mensajeInput');
    const btnEnviar = document.getElementById('btnEnviar');
    const contadorConectados = document.getElementById('contadorConectados');
    const nombreHeader = document.getElementById('nombreConductorHeader');
    const fileInput = document.getElementById('fileInput');
    const archivosSeleccionadosDiv = document.getElementById('archivosSeleccionados');
    const badgeArchivos = document.getElementById('badgeArchivos');
    const modalImagen = document.getElementById('modalImagen');
    const imagenAmpliada = document.getElementById('imagenAmpliada');
    const uploadProgress = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const avatarStatus = document.getElementById('avatarStatus');
    const avatarDot = document.getElementById('avatarDot');
    const avatarClick = document.getElementById('avatarClick');
    const modalPresentacion = document.getElementById('modalPresentacion');
    const modalId = document.getElementById('modalIdConductor');
    const inputId = document.getElementById('inputIdConductor');
    const btnIngresar = document.getElementById('btnIngresarConductor');
    const mensajeVerificacion = document.getElementById('mensajeVerificacion');

    const serverDot = document.getElementById('serverDot');
    const serverStatusText = document.getElementById('serverStatusText');
    const totalConductoresStatus = document.getElementById('totalConductoresStatus');

    // ============================================================
    // DETECTAR ORIGEN
    // ============================================================
    function detectarOrigen() {
        if (window.location.protocol === 'file:') {
            console.warn('⚠️ Ejecutando desde file:// - Se recomienda usar un servidor local');
            return 'file';
        }
        return 'http';
    }
    const ORIGEN = detectarOrigen();

    // ============================================================
    // LOG
    // ============================================================
    function log(msg, type) {
        console.log((type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '📌') + ' [CONDUCTOR] ' + msg);
    }

    function escapeHtml(text) {
        if (!text) return "";
        var div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================================
    // GESTIÓN DE ÚLTIMO ID RECIBIDO
    // ============================================================
    function guardarUltimoIdRecibido() {
        try {
            if (!idConductor) return;
            const key = ULTIMO_ID_KEY + idConductor;
            if (ultimoMsgIdRecibido) {
                localStorage.setItem(key, ultimoMsgIdRecibido);
                log('💾 Último ID guardado: ' + ultimoMsgIdRecibido);
            }
        } catch(e) {
            log('⚠️ Error guardando último ID: ' + e.message);
        }
    }

    function cargarUltimoIdRecibido() {
        try {
            if (!idConductor) return;
            const key = ULTIMO_ID_KEY + idConductor;
            const valor = localStorage.getItem(key);
            if (valor) {
                ultimoMsgIdRecibido = valor;
                log('📂 Último ID cargado: ' + ultimoMsgIdRecibido);
                return true;
            }
            ultimoMsgIdRecibido = '';
            return false;
        } catch(e) {
            ultimoMsgIdRecibido = '';
            return false;
        }
    }

    function resetearUltimoIdRecibido() {
        try {
            if (!idConductor) return;
            const key = ULTIMO_ID_KEY + idConductor;
            localStorage.removeItem(key);
            ultimoMsgIdRecibido = '';
            log('🔄 Último ID reseteado');
        } catch(e) {
            ultimoMsgIdRecibido = '';
        }
    }

    // ============================================================
    // GESTIÓN DE LIMPIEZA
    // ============================================================
    function guardarTiempoLimpieza() {
        try {
            const key = LIMPIEZA_KEY + idConductor;
            tiempoUltimaLimpieza = Date.now();
            localStorage.setItem(key, String(tiempoUltimaLimpieza));
            resetearUltimoIdRecibido();
            log('🧹 Tiempo de limpieza guardado: ' + new Date(tiempoUltimaLimpieza).toLocaleString());
        } catch(e) {
            log('⚠️ Error guardando tiempo de limpieza: ' + e.message);
        }
    }

    function cargarTiempoLimpieza() {
        try {
            const key = LIMPIEZA_KEY + idConductor;
            const valor = localStorage.getItem(key);
            if (valor) {
                tiempoUltimaLimpieza = parseInt(valor, 10);
                log('📂 Tiempo de limpieza cargado: ' + new Date(tiempoUltimaLimpieza).toLocaleString());
                return true;
            }
            tiempoUltimaLimpieza = 0;
            return false;
        } catch(e) {
            tiempoUltimaLimpieza = 0;
            return false;
        }
    }

    // ============================================================
    // ALMACENAMIENTO LOCAL - CON CONTROL DE TAMAÑO
    // ============================================================
    function guardarMensajesLocales() {
        try {
            const mensajesParaGuardar = mensajes.map(msg => {
                const copia = { ...msg };
                if (copia.archivo && copia.archivo.base64) {
                    const tamaño = copia.archivo.base64.length * 0.75;
                    if (tamaño > 300 * 1024) {
                        copia.archivo.base64 = null;
                        copia.archivo._noStorage = true;
                    }
                }
                return copia;
            });
            localStorage.setItem(MENSAJES_KEY, JSON.stringify(mensajesParaGuardar));
        } catch (e) {
            if (e.name === 'QuotaExceededError' || (e.message && e.message.includes('quota'))) {
                console.warn('⚠️ [CONDUCTOR] Quota excedida, limpiando caché...');
                limpiarCacheCompleta();
                try {
                    const mensajesSinArchivos = mensajes.map(msg => {
                        const copia = { ...msg };
                        if (copia.archivo) {
                            copia.archivo.base64 = null;
                            copia.archivo._noStorage = true;
                        }
                        return copia;
                    });
                    localStorage.setItem(MENSAJES_KEY, JSON.stringify(mensajesSinArchivos));
                } catch(e2) {}
            }
        }
    }

    function cargarMensajesLocales() {
        try {
            const raw = localStorage.getItem(MENSAJES_KEY);
            if (raw) {
                const mensajesCargados = JSON.parse(raw);
                mensajesCargados.forEach(msg => {
                    if (msg.archivo && msg.archivo._noStorage && msg.id) {
                        const cached = obtenerBase64Cache(msg.id);
                        if (cached) {
                            msg.archivo.base64 = cached;
                            msg.archivo._noStorage = false;
                        }
                    }
                    if (msg.id) mensajesEnviadosIds.add(msg.id);
                });
                mensajes = mensajesCargados;
                mensajesPendientes = mensajes.filter(m => m.estado === 'pendiente' && m.esPropio === true);
                log('📂 Mensajes locales cargados: ' + mensajes.length);
                return true;
            }
            mensajes = [];
            mensajesPendientes = [];
            return false;
        } catch(e) {
            log('⚠️ Error cargando mensajes locales: ' + e.message);
            mensajes = [];
            mensajesPendientes = [];
            return false;
        }
    }

    function limpiarCacheCompleta() {
        try {
            const keys = Object.keys(localStorage);
            let eliminados = 0;
            keys.forEach(key => {
                if (key.startsWith(FILE_CACHE_PREFIX)) {
                    localStorage.removeItem(key);
                    eliminados++;
                }
                if (key === MENSAJES_KEY) {
                    localStorage.removeItem(key);
                    eliminados++;
                }
            });
            log('🧹 Cache limpiada: ' + eliminados + ' elementos eliminados');
        } catch(e) {
            log('⚠️ Error limpiando cache: ' + e.message);
        }
    }

    function guardarDatosLocales() {
        try {
            const datos = {
                idConductor: idConductor,
                nombreConductor: nombreConductor,
                conductorVerificado: conductorVerificado,
                chatIdUnico: chatIdUnico,
                servidorCentralActivo: servidorCentralActivo
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
        } catch (e) {
            log('⚠️ Error guardando datos locales: ' + e.message);
        }
    }

    function cargarDatosLocales() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const datos = JSON.parse(raw);
            if (datos.idConductor && datos.nombreConductor) {
                idConductor = datos.idConductor;
                nombreConductor = datos.nombreConductor;
                conductorVerificado = datos.conductorVerificado || true;
                chatIdUnico = datos.chatIdUnico || chatIdUnico;
                servidorCentralActivo = datos.servidorCentralActivo || false;
                cargarTiempoLimpieza();
                cargarUltimoIdRecibido();
                log('📂 Datos locales cargados para: ' + nombreConductor);
                return true;
            }
            return false;
        } catch(e) {
            log('⚠️ Error cargando datos locales: ' + e.message);
            return false;
        }
    }

    // ============================================================
    // UTILIDADES - SOLO IMÁGENES
    // ============================================================
    function esSoloImagen(nombre, tipo) {
        const ext = nombre ? nombre.toLowerCase().split('.').pop() : '';
        const mime = tipo || '';
        // Solo permitir imágenes
        return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|heic|heif|avif)$/i.test(nombre) || mime.startsWith('image/');
    }

    function getTipoArchivoInfo(nombre, tipo) {
        const ext = nombre ? nombre.toLowerCase().split('.').pop() : '';
        const mime = tipo || '';
        
        if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|heic|heif|avif)$/i.test(nombre) || mime.startsWith('image/')) {
            return { icono: 'fa-image', clase: 'imagen', color: '#10b981' };
        }
        // Solo imágenes, pero mantenemos otros tipos para compatibilidad
        return { icono: 'fa-image', clase: 'imagen', color: '#10b981' };
    }

    function esImagen(nombre, tipo) {
        const ext = nombre ? nombre.toLowerCase().split('.').pop() : '';
        const mime = tipo || '';
        return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|heic|heif|avif)$/i.test(nombre) || mime.startsWith('image/');
    }

    function esVideo(nombre, tipo) { return false; } // Deshabilitado
    function esAudio(nombre, tipo) { return false; } // Deshabilitado

    function sanitizarNombreArchivo(nombre) {
        return nombre.replace(/[^a-zA-Z0-9.\-_]/g, '_').replace(/_+/g, '_');
    }

    function archivoABase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const base64 = e.target.result.split(',')[1] || e.target.result;
                resolve(base64);
            };
            reader.onerror = function(e) {
                reject(e);
            };
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
            reader.onerror = function(e) {
                reject(e);
            };
            reader.readAsDataURL(chunk);
        });
    }

    function formatearHora(fecha) {
        if (!fecha) return "--:--";
        try {
            const d = new Date(fecha);
            if (isNaN(d.getTime())) return "--:--";
            return d.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
        } catch(e) {
            return "--:--";
        }
    }

    function formatearFecha(fecha) {
        if (!fecha) return "Fecha desconocida";
        try {
            const d = new Date(fecha);
            if (isNaN(d.getTime())) return "Fecha desconocida";
            return d.toLocaleDateString('es-NI', { day: '2-digit', month: 'short' });
        } catch(e) {
            return "Fecha desconocida";
        }
    }

    function mostrarToast(mensaje, tipo) {
        tipo = tipo || 'success';
        const old = document.querySelector('.toast-message');
        if (old) old.remove();
        const toast = document.createElement('div');
        toast.className = 'toast-message';
        const icon = tipo === 'success' ? 'fa-check-circle' : (tipo === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
        toast.innerHTML = `<i class="fas ${icon}"></i> ${mensaje}`;
        if (tipo === 'error') toast.style.borderLeftColor = '#ef4444';
        else if (tipo === 'info') toast.style.borderLeftColor = '#fbbf24';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ============================================================
    // LIMPIAR BARRA DE ENVÍO (Mensaje + Archivos)
    // ============================================================
    function limpiarBarraEnvio() {
        mensajeInput.value = '';
        archivosSeleccionados = [];
        if (fileInput) fileInput.value = '';
        actualizarArchivosSeleccionados();
        if (uploadProgress) uploadProgress.classList.remove('active');
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '';
        log('🧹 Barra de envío limpiada');
    }

    // ============================================================
    // JSONP - LLAMADA AL PUENTE
    // ============================================================
    function llamarServidor(accion, datos) {
        return new Promise((resolve, reject) => {
            const callbackName = 'jsonp_callback_' + (++callbackCounter) + '_' + Date.now();
            let url = API_URL + '?accion=' + encodeURIComponent(accion) + '&key=' + encodeURIComponent(CLAVE_CARPETA) + '&callback=' + callbackName;
            
            if (!datos) datos = {};
            datos.tipo = 'conductor';
            datos.chat_id = chatIdUnico;
            datos.key = CLAVE_CARPETA;
            
            if (datos) {
                Object.keys(datos).forEach(key => {
                    if (datos[key] !== null && datos[key] !== undefined) {
                        let valor = datos[key];
                        if (typeof valor === 'object') valor = JSON.stringify(valor);
                        url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(valor);
                    }
                });
            }
            
            log('📡 JSONP llamando al puente: ' + accion);
            const script = document.createElement('script');
            let timeoutId = null;
            let resolved = false;
            
            function cleanup() {
                if (timeoutId) clearTimeout(timeoutId);
                if (script.parentNode) script.parentNode.removeChild(script);
                delete window[callbackName];
            }
            
            timeoutId = setTimeout(function() {
                if (!resolved) { 
                    resolved = true; 
                    cleanup(); 
                    reject(new Error('Timeout')); 
                }
            }, 300000);
            
            window[callbackName] = function(data) {
                if (!resolved) { 
                    resolved = true; 
                    cleanup(); 
                    resolve(data); 
                }
            };
            
            script.onerror = function() {
                if (!resolved) { 
                    resolved = true; 
                    cleanup(); 
                    reject(new Error('Error de red')); 
                }
            };
            
            script.src = url;
            document.head.appendChild(script);
        });
    }

    // ============================================================
    // ENVIAR POST
    // ============================================================
    function enviarPost(datos) {
        return new Promise((resolve, reject) => {
            datos.tipo = 'conductor';
            datos.chat_id = chatIdUnico;
            datos.key = CLAVE_CARPETA;
            
            if (!datos.accion) {
                datos.accion = 'enviar_mensaje';
            }
            
            const url = API_URL + '?key=' + encodeURIComponent(CLAVE_CARPETA);
            const body = 'payload=' + encodeURIComponent(JSON.stringify(datos));
            
            log('📡 Enviando POST al puente: ' + datos.accion);
            
            fetch(url, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                body: body
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.text();
            })
            .then(texto => {
                try {
                    const data = JSON.parse(texto);
                    if (data && data.ok) {
                        resolve(data);
                    } else {
                        reject(new Error(data?.error || 'Error en el puente'));
                    }
                } catch (e) {
                    log('⚠️ Respuesta no es JSON válido, intentando JSONP...');
                    llamarServidor(datos.accion || 'enviar_mensaje', datos)
                        .then(resolve)
                        .catch(reject);
                }
            })
            .catch(err => {
                log('⚠️ POST falló, intentando JSONP...');
                llamarServidor(datos.accion || 'enviar_mensaje', datos)
                    .then(resolve)
                    .catch(reject);
            });
        });
    }

    // ============================================================
    // ENVIAR CHUNK
    // ============================================================
    function enviarChunk(datos) {
        return new Promise((resolve, reject) => {
            datos.tipo = 'conductor';
            datos.chat_id = chatIdUnico;
            datos.key = CLAVE_CARPETA;
            datos.accion = 'subir_chunk_archivo';
            
            const url = API_URL + '?key=' + encodeURIComponent(CLAVE_CARPETA);
            const body = 'payload=' + encodeURIComponent(JSON.stringify(datos));
            
            log('📡 Enviando chunk ' + datos.chunk_index + ' de ' + datos.total_chunks);
            
            fetch(url, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                body: body
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.text();
            })
            .then(texto => {
                try {
                    const data = JSON.parse(texto);
                    if (data && data.ok) {
                        resolve(data);
                    } else {
                        reject(new Error(data?.error || 'Error en el puente'));
                    }
                } catch (e) {
                    reject(new Error('Error procesando chunk: ' + e.message));
                }
            })
            .catch(err => {
                reject(err);
            });
        });
    }

    // ============================================================
    // CACHE DE ARCHIVOS
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
            if (tamaño > 300 * 1024) {
                log('⚠️ Archivo grande (' + (tamaño/1024).toFixed(1) + 'KB), no se guarda en cache local');
                return;
            }
            localStorage.setItem(cacheKey, base64);
        } catch(e) {
            if (e.name === 'QuotaExceededError' || (e.message && e.message.includes('quota'))) {
                log('⚠️ Cache lleno, limpiando...');
                limpiarCacheCompleta();
                try {
                    const cacheKey = FILE_CACHE_PREFIX + msgId;
                    localStorage.setItem(cacheKey, base64);
                } catch(e2) {}
            }
        }
    }

    function eliminarCacheArchivo(msgId) {
        try {
            const cacheKey = FILE_CACHE_PREFIX + msgId;
            localStorage.removeItem(cacheKey);
        } catch(e) {}
    }

    // ============================================================
    // ENVIAR REACCIÓN
    // ============================================================
    function enviarReaccion(msgId, remitente) {
        if (!conectadoAMadre || !idConductor) {
            mostrarToast('❌ No conectado', 'error');
            return;
        }

        log('👍 Enviando reacción a mensaje: ' + msgId + ' de: ' + remitente);
        
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
        mensajes[mensajeIndex].reaccionDe = idConductor;
        guardarMensajesLocales();
        renderizarMensajes();

        const datos = {
            accion: 'enviar_reaccion',
            conductor_id: idConductor,
            remitente: nombreConductor || "Conductor",
            msg_id: msgId,
            reaccion: '👍',
            timestamp: new Date().toISOString()
        };

        enviarPost(datos)
            .then(data => {
                if (data && data.ok) {
                    log('✅ Reacción enviada correctamente');
                    mostrarToast('👍 Reacción enviada', 'success');
                } else {
                    mostrarToast('⚠️ Reacción en cola de reenvío', 'info');
                }
            })
            .catch(e => {
                log('⚠️ Error enviando reacción: ' + e.message);
                mostrarToast('⚠️ Reacción en cola de reenvío', 'info');
            });
    }

    // ============================================================
    // SUBIR ARCHIVO POR PARTES - SOLO IMÁGENES
    // ============================================================
    async function subirArchivoPorPartes(file, conductorId, mensajeTexto) {
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const msgId = 'msg_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
        const info = getTipoArchivoInfo(file.name, file.type);
        
        log('📤 [IMAGEN] Iniciando subida: ' + file.name);
        log('📤 [IMAGEN] Tamaño: ' + (file.size / 1024 / 1024).toFixed(2) + ' MB');
        log('📤 [IMAGEN] Chunks: ' + totalChunks + ' de ' + (CHUNK_SIZE/1024) + ' KB cada uno');
        
        try {
            const iniciarData = {
                accion: 'iniciar_subida_archivo',
                conductor_id: conductorId,
                msg_id: msgId,
                nombre: file.name,
                tipo: file.type || 'image/png',
                tamanio: file.size,
                total_chunks: totalChunks,
                archivo_grande: true,
                key: CLAVE_CARPETA
            };
            
            const iniciarResp = await enviarPost(iniciarData);
            if (!iniciarResp || !iniciarResp.ok) {
                mostrarToast('❌ Error iniciando subida', 'error');
                return null;
            }
            
            let progreso = 0;
            let chunkEnviados = 0;
            let errores = 0;
            const maxErrores = 5;
            
            for (let i = 0; i < totalChunks; i++) {
                let intentos = 0;
                let enviado = false;
                
                while (!enviado && intentos < 3) {
                    try {
                        const start = i * CHUNK_SIZE;
                        const end = Math.min(start + CHUNK_SIZE, file.size);
                        const chunk = file.slice(start, end);
                        
                        const base64Chunk = await leerChunkBase64(chunk);
                        
                        const chunkData = {
                            accion: 'subir_chunk_archivo',
                            msg_id: msgId,
                            chunk_index: i,
                            chunk_data: base64Chunk,
                            total_chunks: totalChunks,
                            conductor_id: conductorId,
                            key: CLAVE_CARPETA
                        };
                        
                        const chunkResp = await enviarChunk(chunkData);
                        if (chunkResp && chunkResp.ok) {
                            enviado = true;
                            chunkEnviados++;
                            break;
                        } else {
                            intentos++;
                            log('⚠️ [IMAGEN] Reintento ' + intentos + ' para chunk ' + (i+1));
                            await new Promise(r => setTimeout(r, 1000 * intentos));
                        }
                    } catch (e) {
                        intentos++;
                        log('⚠️ [IMAGEN] Error chunk ' + (i+1) + ': ' + e.message);
                        await new Promise(r => setTimeout(r, 1000 * intentos));
                    }
                }
                
                if (!enviado) {
                    errores++;
                    log('❌ [IMAGEN] Chunk ' + (i+1) + ' falló después de 3 intentos');
                    if (errores > maxErrores) {
                        mostrarToast('❌ Demasiados errores en la subida', 'error');
                        return null;
                    }
                }
                
                progreso = (chunkEnviados / totalChunks) * 100;
                
                if (progressBar) {
                    progressBar.style.width = progreso + '%';
                }
                if (progressText) {
                    progressText.textContent = Math.round(progreso) + '%';
                }
                if (uploadProgress) {
                    uploadProgress.classList.add('active');
                }
                
                if (i % 10 === 0 || i === totalChunks - 1) {
                    const mbSubidos = (chunkEnviados * CHUNK_SIZE / 1024 / 1024).toFixed(1);
                    log('📤 [IMAGEN] Progreso: ' + progreso.toFixed(1) + '% (' + chunkEnviados + '/' + totalChunks + ' chunks) - ' + mbSubidos + ' MB');
                }
            }
            
            if (chunkEnviados < totalChunks) {
                mostrarToast('⚠️ Subida incompleta: ' + chunkEnviados + '/' + totalChunks + ' chunks', 'warning');
                return null;
            }
            
            const completarData = {
                accion: 'completar_subida_archivo',
                msg_id: msgId,
                conductor_id: conductorId,
                mensaje: mensajeTexto || '',
                archivo_nombre: file.name,
                archivo_tipo: file.type || 'image/png',
                archivo_tamanio: file.size,
                archivo_icono: info.icono,
                archivo_color: info.color,
                archivo_clase: info.clase,
                archivo_grande: true,
                key: CLAVE_CARPETA
            };
            
            const completarResp = await enviarPost(completarData);
            if (completarResp && completarResp.ok) {
                log('✅ [IMAGEN] Imagen subida correctamente: ' + file.name);
                return { ok: true, msgId: msgId, completarResp: completarResp };
            } else {
                mostrarToast('⚠️ Error completando subida', 'warning');
                return null;
            }
        } catch (error) {
            log('❌ [IMAGEN] Error: ' + error.message);
            mostrarToast('❌ Error: ' + error.message, 'error');
            return null;
        }
    }

    // ============================================================
    // ACTUALIZAR ESTADO
    // ============================================================
    function actualizarEstadoIcono(estado, nombre) {
        if (nombre) {
            nombreHeader.textContent = nombre;
        }
        avatarStatus.classList.remove('estado-desconectado', 'estado-conectando', 'estado-conectado');
        avatarDot.className = 'avatar-status-dot ' + estado;
        switch(estado) {
            case 'desconectado':
                avatarStatus.classList.add('estado-desconectado');
                break;
            case 'conectando':
                avatarStatus.classList.add('estado-conectando');
                break;
            case 'conectado':
                avatarStatus.classList.add('estado-conectado');
                break;
            default:
                avatarStatus.classList.add('estado-desconectado');
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
                conectadoAMadre = true;
            } else if (tipo === 'off') {
                serverDot.classList.add('off');
                conectadoAMadre = false;
            } else if (tipo === 'wait') {
                serverDot.classList.add('wait');
                conectadoAMadre = false;
            } else if (tipo === 'redirigiendo') {
                serverDot.classList.add('wait');
                conectadoAMadre = false;
            }
        }
    }

    // ============================================================
    // REDIRECCIÓN A UBICACIÓN
    // ============================================================
    function redirigirAUbicacion(mensaje) {
        if (redirigiendo) return;
        redirigiendo = true;
        
        log('🔄 Redirigiendo a ubicación: ' + mensaje);
        setServerStatus('🔄 Conectando a ubicación...', 'redirigiendo');
        mostrarToast('🔄 Conectando al servidor central...', 'info');
        
        llamarServidor('conectar_a_ubicacion', {
            conductor_id: idConductor,
            nombre: nombreConductor,
            chat_id: chatIdUnico,
            ubicacion: ubicacionActual ? JSON.stringify(ubicacionActual) : null
        })
        .then(function(data) {
            if (data && data.ok) {
                log('✅ Redirección exitosa a ubicación');
                servidorCentralActivo = true;
                guardarDatosLocales();
                setServerStatus('✅ Conectado a ubicación', 'on');
                mostrarToast('✅ Conectado al servidor central', 'success');
                
                iniciarEscuchaConductores();
                cargarMensajesDelServidor();
                redirigiendo = false;
            } else {
                log('⚠️ Redirección falló, reintentando...');
                setTimeout(function() {
                    redirigiendo = false;
                    redirigirAUbicacion('Reintentando...');
                }, 5000);
            }
        })
        .catch(function(e) {
            log('⚠️ Error en redirección: ' + e.message);
            setTimeout(function() {
                redirigiendo = false;
                redirigirAUbicacion('Reintentando...');
            }, 5000);
        });
    }

    // ============================================================
    // DESCARGAR ARCHIVO DESDE DRIVE - SOLO IMÁGENES
    // ============================================================
    async function descargarYMostrarDrive(msgId) {
        if (descargandoDrive[msgId]) {
            return;
        }
        descargandoDrive[msgId] = true;
        
        try {
            const msg = mensajes.find(m => m.id === msgId);
            if (!msg || !msg.archivo || !msg.archivo.fileId) {
                mostrarToast('❌ Archivo no encontrado', 'error');
                descargandoDrive[msgId] = false;
                return;
            }
            
            if (msg.archivo._eliminado) {
                mostrarToast('ℹ️ Archivo ya fue eliminado del servidor', 'info');
                descargandoDrive[msgId] = false;
                return;
            }
            
            mostrarToast('📥 Descargando imagen...', 'info');
            
            const data = await llamarServidor('descargar_archivo_drive', {
                file_id: msg.archivo.fileId,
                msg_id: msgId,
                conductor_id: idConductor
            });
            
            if (data && data.ok && data.base64) {
                const tamaño = data.base64.length * 0.75;
                if (tamaño < 300 * 1024) {
                    guardarBase64Cache(msgId, data.base64);
                }
                
                const msgIdx = mensajes.findIndex(m => m.id === msgId);
                if (msgIdx !== -1) {
                    mensajes[msgIdx].archivo.base64 = data.base64;
                    mensajes[msgIdx].archivo.descargado = true;
                    mensajes[msgIdx].archivo._driveFile = false;
                    mensajes[msgIdx].archivo._pendienteDescarga = false;
                    if (data.eliminado) {
                        mensajes[msgIdx].archivo._eliminado = true;
                        delete mensajes[msgIdx].archivo.fileId;
                    }
                    guardarMensajesLocales();
                    renderizarMensajes();
                }
                
                if (data.eliminado) {
                    mostrarToast('📥 Imagen descargada y eliminada del servidor', 'success');
                } else {
                    mostrarToast('✅ Imagen descargada', 'success');
                }
            } else {
                mostrarToast('❌ Error descargando imagen', 'error');
            }
        } catch (e) {
            log('❌ Error descargando: ' + e.message);
            mostrarToast('❌ Error descargando imagen', 'error');
        }
        
        descargandoDrive[msgId] = false;
    }

    // ============================================================
    // CAMBIAR USUARIO
    // ============================================================
    function cambiarUsuario() {
        conductorVerificado = false;
        idConductor = "";
        nombreConductor = "";
        mensajes = [];
        mensajesPendientes = [];
        mensajesEnviadosIds = new Set();
        tiempoUltimaLimpieza = 0;
        ultimoMsgIdRecibido = '';
        servidorCentralActivo = false;
        if (reenvioInterval) { clearInterval(reenvioInterval); reenvioInterval = null; }
        guardarMensajesLocales();
        renderizarMensajes();
        nombreHeader.textContent = 'Conductor';
        mensajeInput.disabled = true;
        btnEnviar.disabled = true;
        actualizarEstadoIcono('desconectado', 'Conductor');
        modalId.classList.add('active');
        inputId.value = '';
        inputId.focus();
        mensajeVerificacion.textContent = '';
        mensajeVerificacion.className = 'mensaje-modal';
        btnIngresar.innerHTML = '<i class="fas fa-search"></i> Verificar';
        btnIngresar.className = 'btn-principal';
        btnIngresar.disabled = false;
        log('🔄 Cambiando de usuario...');
        mostrarToast('🔄 Cambia tu usuario', 'info');
        localStorage.removeItem(STORAGE_KEY);
        const limpiezaKey = LIMPIEZA_KEY + idConductor;
        localStorage.removeItem(limpiezaKey);
        const ultimoIdKey = ULTIMO_ID_KEY + idConductor;
        localStorage.removeItem(ultimoIdKey);
        redirigiendo = false;
    }

    avatarClick.addEventListener('click', cambiarUsuario);

    // ============================================================
    // CONDUCTORES
    // ============================================================
    async function obtenerConductoresFlota() {
        if (!conectadoAMadre) return [];
        try {
            const data = await llamarServidor('conductores_conectados');
            if (data.ok && data.conductores) {
                listaConductoresFlota = data.conductores;
                if (totalConductoresStatus) {
                    totalConductoresStatus.textContent = data.total || data.conductores.length;
                }
                if (contadorConectados) {
                    contadorConectados.textContent = data.conductores.length;
                }
                return listaConductoresFlota;
            }
            return [];
        } catch(e) { log('❌ Error: ' + e.message); return []; }
    }

    // ============================================================
    // VERIFICAR CONDUCTOR
    // ============================================================
    async function verificarConductor(id) {
        if (!conectadoAMadre) {
            mostrarMensajeVerificacion('⚠️ Conéctate al puente primero', 'error');
            return false;
        }
        btnIngresar.disabled = true;
        btnIngresar.innerHTML = '<span class="loading-spinner"></span>';
        mostrarMensajeVerificacion('🔍 Buscando en el puente...', 'wait');
        try {
            await obtenerConductoresFlota();
            var conductorEncontrado = null;
            for (var i = 0; i < listaConductoresFlota.length; i++) {
                var c = listaConductoresFlota[i];
                if (c.id && c.id.toUpperCase() === id.toUpperCase()) { conductorEncontrado = c; break; }
                if (c.nombre && c.nombre.toUpperCase() === id.toUpperCase()) { conductorEncontrado = c; break; }
            }
            
            if (conductorEncontrado) {
                idConductor = conductorEncontrado.id;
                nombreConductor = conductorEncontrado.nombre || "Conductor " + id;
                conductorVerificado = true;
                localStorage.setItem("conductor_id", idConductor);
                localStorage.setItem("conductor_nombre", nombreConductor);
                mostrarMensajeVerificacion('✅ ' + nombreConductor, 'ok');
                btnIngresar.innerHTML = '<i class="fas fa-check"></i>';
                btnIngresar.className = 'btn-principal success';
                
                registrarConductorEnServidor();
                cargarTiempoLimpieza();
                cargarUltimoIdRecibido();
                
                log('🔄 Conductor verificado, redirigiendo a ubicación...');
                mostrarMensajeVerificacion('🔄 Conectando al servidor central...', 'wait');
                
                llamarServidor('registrar_conductor', {
                    conductor_id: idConductor,
                    nombre: nombreConductor,
                    chat_id: chatIdUnico,
                    ubicacion: ubicacionActual ? JSON.stringify(ubicacionActual) : null,
                    redirigir_a_ubicacion: true
                })
                .then(function(data) {
                    if (data && data.ok) {
                        log('✅ Registro en puente exitoso, redirigiendo a ubicación');
                        redirigirAUbicacion('Conectando al servidor central...');
                    } else {
                        log('⚠️ Error en registro, reintentando...');
                        setTimeout(function() {
                            verificarConductor(id);
                        }, 3000);
                    }
                })
                .catch(function(e) {
                    log('⚠️ Error en registro: ' + e.message);
                    setTimeout(function() {
                        verificarConductor(id);
                    }, 3000);
                });
                
                setTimeout(function() {
                    modalId.classList.remove('active');
                    mensajeInput.disabled = false;
                    btnEnviar.disabled = false;
                    nombreHeader.textContent = nombreConductor;
                    actualizarEstadoIcono('conectado', nombreConductor);
                    cargarMensajesLocales();
                    renderizarMensajes();
                    guardarDatosLocales();
                }, 600);
                return true;
            } else {
                idConductor = id.toUpperCase();
                nombreConductor = "Conductor " + idConductor;
                conductorVerificado = true;
                localStorage.setItem("conductor_id", idConductor);
                localStorage.setItem("conductor_nombre", nombreConductor);
                
                registrarConductorEnServidor();
                cargarTiempoLimpieza();
                cargarUltimoIdRecibido();
                
                mostrarMensajeVerificacion('✅ Nuevo: ' + nombreConductor, 'ok');
                btnIngresar.innerHTML = '<i class="fas fa-check"></i>';
                btnIngresar.className = 'btn-principal success';
                
                log('🔄 Nuevo conductor, redirigiendo a ubicación...');
                redirigirAUbicacion('Conectando al servidor central...');
                
                setTimeout(function() {
                    modalId.classList.remove('active');
                    mensajeInput.disabled = false;
                    btnEnviar.disabled = false;
                    nombreHeader.textContent = nombreConductor;
                    actualizarEstadoIcono('conectado', nombreConductor);
                    cargarMensajesLocales();
                    renderizarMensajes();
                    guardarDatosLocales();
                }, 600);
                return true;
            }
        } catch(e) {
            mostrarMensajeVerificacion('❌ Error: ' + e.message, 'error');
            return false;
        } finally {
            if (!conductorVerificado) {
                btnIngresar.disabled = false;
                if (btnIngresar.innerHTML.indexOf('Verificado') === -1) {
                    btnIngresar.innerHTML = '<i class="fas fa-search"></i> Verificar';
                    btnIngresar.className = 'btn-principal';
                }
            }
        }
    }

    function mostrarMensajeVerificacion(texto, tipo) {
        mensajeVerificacion.textContent = texto;
        mensajeVerificacion.className = 'mensaje-modal ' + (tipo || '');
    }

    function registrarConductorEnServidor() {
        if (!idConductor || !nombreConductor) return;
        llamarServidor('registrar_conductor', {
            conductor_id: idConductor,
            nombre: nombreConductor,
            chat_id: chatIdUnico,
            ubicacion: ubicacionActual ? JSON.stringify(ubicacionActual) : null,
            tipo: 'conductor'
        }).then(function(result) {
            if (result && result.ok) {
                guardarDatosLocales();
                log('✅ Conductor registrado en el puente');
            }
        }).catch(function(e) {
            log('⚠️ Error registrando: ' + e.message);
        });
    }

    // ============================================================
    // CONEXIÓN
    // ============================================================
    function conectarConMadre() {
        if (reconectando) return;
        reconectando = true;
        actualizarEstadoIcono('conectando', nombreConductor || 'Conductor');
        setServerStatus('Conectando al puente...', 'wait');
        log('🔌 Conectando al puente...');
        
        llamarServidor('ping')
        .then(function(data) {
            conectadoAMadre = true;
            reconectando = false;
            setServerStatus('✅ Conectado al puente', 'on');
            const idGuardado = localStorage.getItem("conductor_id");
            const nombreGuardado = localStorage.getItem("conductor_nombre");
            
            if (idGuardado && nombreGuardado) {
                idConductor = idGuardado;
                nombreConductor = nombreGuardado;
                conductorVerificado = true;
                mensajeInput.disabled = false;
                btnEnviar.disabled = false;
                nombreHeader.textContent = nombreConductor;
                actualizarEstadoIcono('conectado', nombreConductor);
                registrarConductorEnServidor();
                cargarTiempoLimpieza();
                cargarUltimoIdRecibido();
                cargarMensajesLocales();
                renderizarMensajes();
                guardarDatosLocales();
                
                if (!servidorCentralActivo) {
                    log('🔄 Intentando redirigir a ubicación...');
                    redirigirAUbicacion('Conectando al servidor central...');
                } else {
                    iniciarEscuchaConductores();
                    cargarMensajesDelServidor();
                }
                
                log('✅ Conectado al puente como: ' + nombreConductor);
                mostrarToast('✅ Conectado al puente como ' + nombreConductor, 'success');
            } else {
                if (ubicacionPermitida) {
                    actualizarEstadoIcono('desconectado', 'Conductor');
                    mostrarModalIdConductor();
                } else {
                    actualizarEstadoIcono('desconectado', 'Conductor');
                }
                iniciarEscuchaConductores();
            }
        })
        .catch(function(err) {
            conectadoAMadre = false;
            reconectando = false;
            setServerStatus('❌ Error de conexión al puente', 'off');
            actualizarEstadoIcono('desconectado', nombreConductor || 'Conductor');
            log('❌ Error de conexión al puente: ' + err.message);
            mostrarToast('❌ Sin conexión al puente', 'error');
            setTimeout(function() {
                if (!conectadoAMadre && !reconectando) {
                    conectarConMadre();
                }
            }, 5000);
        });
    }

    // ============================================================
    // ESCUCHAR CONDUCTORES
    // ============================================================
    function iniciarEscuchaConductores() {
        if (pollingInterval) clearInterval(pollingInterval);
        if (!conectadoAMadre || !idConductor) return;
        
        pollingInterval = setInterval(function() {
            obtenerConductoresFlota();
            if (servidorCentralActivo) {
                cargarMensajesDelServidor();
            }
        }, 8000);
    }

    // ============================================================
    // RECIBIR MENSAJES DEL SERVIDOR
    // ============================================================
    async function cargarMensajesDelServidor() {
        if (!conectadoAMadre || !idConductor) return;
        
        try {
            const params = {
                conductor_id: idConductor,
                limite: 50
            };
            
            if (ultimoMsgIdRecibido) {
                params.ultimo_msg_id = ultimoMsgIdRecibido;
            }
            
            if (tiempoUltimaLimpieza > 0) {
                params.desde_timestamp = tiempoUltimaLimpieza;
            }
            
            const data = await llamarServidor('mensajes_conductor', params);
            
            if (data.ok && data.mensajes && data.mensajes.length > 0) {
                let mensajesServidor = data.mensajes;
                let nuevosMensajes = [];
                let mensajesActualizados = false;
                
                if (data.ultimo_msg_id) {
                    ultimoMsgIdRecibido = data.ultimo_msg_id;
                    guardarUltimoIdRecibido();
                }
                
                mensajesServidor.forEach(msgServidor => {
                    const existente = mensajes.find(m => m.id === msgServidor.id);
                    
                    if (!existente) {
                        if (mensajesEnviadosIds.has(msgServidor.id)) {
                            return;
                        }
                        
                        let fechaValida = new Date(msgServidor.fecha);
                        if (isNaN(fechaValida.getTime())) {
                            fechaValida = new Date();
                            msgServidor.fecha = fechaValida.toISOString();
                        }
                        
                        const esPropio = msgServidor.remitente === idConductor || 
                                        msgServidor.remitente === nombreConductor ||
                                        msgServidor.remitente === 'Tú';
                        
                        if (msgServidor.archivo && msgServidor.archivo.fileId) {
                            msgServidor.archivo._driveFile = true;
                            msgServidor.archivo._pendienteDescarga = true;
                            if (msgServidor.archivo._eliminado) {
                                msgServidor.archivo._pendienteDescarga = false;
                            } else {
                                const cached = obtenerBase64Cache(msgServidor.id);
                                if (cached) {
                                    msgServidor.archivo.base64 = cached;
                                    msgServidor.archivo._pendienteDescarga = false;
                                    msgServidor.archivo._driveFile = false;
                                }
                            }
                        } else if (msgServidor.archivo && msgServidor.archivo.base64) {
                            guardarBase64Cache(msgServidor.id, msgServidor.archivo.base64);
                            msgServidor.archivo.descargado = true;
                        }
                        
                        if (msgServidor.reaccion) {
                            msgServidor.tieneReaccion = true;
                            msgServidor.reaccion = msgServidor.reaccion;
                            msgServidor.reaccionDe = msgServidor.reaccionDe || msgServidor.remitente;
                        }
                        
                        if (esPropio) {
                            msgServidor.esPropio = true;
                            msgServidor.estado = 'confirmado';
                        } else {
                            msgServidor.esPropio = false;
                        }
                        
                        if (msgServidor.mensaje || msgServidor.archivo) {
                            nuevosMensajes.push(msgServidor);
                            mensajesActualizados = true;
                        }
                    } else {
                        if (existente.estado === 'pendiente' && msgServidor.ack_recibido) {
                            existente.estado = 'confirmado';
                            mensajesActualizados = true;
                        }
                        if (msgServidor.reaccion && !existente.reaccion) {
                            existente.reaccion = msgServidor.reaccion;
                            existente.reaccionDe = msgServidor.reaccionDe || msgServidor.remitente;
                            mensajesActualizados = true;
                        }
                        if (msgServidor.archivo && msgServidor.archivo._eliminado && existente.archivo) {
                            existente.archivo._eliminado = true;
                            existente.archivo._pendienteDescarga = false;
                            mensajesActualizados = true;
                        }
                    }
                });
                
                if (nuevosMensajes.length > 0) {
                    mensajes = mensajes.concat(nuevosMensajes);
                    mensajes.sort((a, b) => {
                        const dateA = new Date(a.fecha);
                        const dateB = new Date(b.fecha);
                        if (isNaN(dateA.getTime())) return 1;
                        if (isNaN(dateB.getTime())) return -1;
                        return dateA - dateB;
                    });
                    guardarMensajesLocales();
                    renderizarMensajes();
                    log('📨 ' + nuevosMensajes.length + ' mensajes nuevos');
                    
                    nuevosMensajes.forEach(msg => {
                        if (!msg.esPropio) {
                            setTimeout(() => {
                                llamarServidor('ack_mensaje', {
                                    msg_id: msg.id,
                                    conductor_id: idConductor,
                                    timestamp: new Date().toISOString()
                                }).catch(e => log('⚠️ Error enviando ACK: ' + e.message));
                            }, 1000);
                        }
                        
                        if (msg.archivo && msg.archivo.fileId && msg.archivo._pendienteDescarga && !msg.archivo._eliminado) {
                            const esImg = esImagen(msg.archivo.nombre, msg.archivo.tipo);
                            if (esImg) {
                                setTimeout(() => descargarYMostrarDrive(msg.id), 500);
                            }
                        }
                    });
                    
                    if (nuevosMensajes.length > 0) {
                        mostrarToast('📨 ' + nuevosMensajes.length + ' mensajes nuevos', 'info');
                    }
                } else if (mensajesActualizados) {
                    guardarMensajesLocales();
                    renderizarMensajes();
                }
            }
        } catch (e) {
            log('⚠️ Error cargando mensajes: ' + e.message);
        }
    }

    // ============================================================
    // REENVÍO MANUAL
    // ============================================================
    function reenviarPendientesInterno() {
        if (!conectadoAMadre || !idConductor) return;
        
        mensajesPendientes = mensajesPendientes.filter(m => m.estado === 'pendiente' && !mensajesEnviadosIds.has(m.id));
        
        if (mensajesPendientes.length === 0) return;
        
        log('🔄 Reenviando ' + mensajesPendientes.length + ' mensajes pendientes...');
        
        var pendientes = mensajesPendientes.slice();
        
        pendientes.forEach(function(msg) {
            if (msg.id) mensajesEnviadosIds.add(msg.id);
            
            if (msg.intentos && msg.intentos > 5) {
                log('⚠️ Mensaje ' + msg.id + ' superó 5 intentos');
                msg.estado = 'error';
                guardarMensajesLocales();
                renderizarMensajes();
                mensajesPendientes = mensajesPendientes.filter(m => m.id !== msg.id);
                return;
            }
            
            msg.intentos = (msg.intentos || 0) + 1;
            
            const datosEnvio = {
                accion: 'enviar_mensaje',
                conductor_id: idConductor,
                remitente: nombreConductor || "Conductor",
                mensaje: msg.mensaje || '',
                ubicacion: msg.ubicacion ? JSON.stringify(msg.ubicacion) : null,
                fecha: msg.fecha || new Date().toISOString(),
                msg_id: msg.id,
                reenvio: true,
                requiere_ack: true
            };
            
            if (msg.archivo && msg.base64) {
                datosEnvio.archivo_base64 = msg.base64;
                datosEnvio.archivo_nombre = msg.archivo.nombre;
                datosEnvio.archivo_tipo = msg.archivo.tipo;
                datosEnvio.archivo_tamanio = msg.archivo.tamanio;
                datosEnvio.archivo_icono = msg.archivo.icono;
                datosEnvio.archivo_color = msg.archivo.color;
                datosEnvio.archivo_clase = msg.archivo.clase;
            } else if (msg.archivo && msg.archivo.fileId) {
                datosEnvio.archivo_file_id = msg.archivo.fileId;
                datosEnvio.archivo_nombre = msg.archivo.nombre;
                datosEnvio.archivo_tipo = msg.archivo.tipo;
                datosEnvio.archivo_tamanio = msg.archivo.tamanio;
                datosEnvio.archivo_icono = msg.archivo.icono;
                datosEnvio.archivo_color = msg.archivo.color;
                datosEnvio.archivo_clase = msg.archivo.clase;
            }
            
            enviarPost(datosEnvio)
                .then(function(data) {
                    if (data && data.ok) {
                        log('✅ Mensaje reenviado: ' + msg.id);
                        const idx = mensajesPendientes.findIndex(m => m.id === msg.id);
                        if (idx !== -1) {
                            mensajesPendientes.splice(idx, 1);
                            const msgIdx = mensajes.findIndex(m => m.id === msg.id);
                            if (msgIdx !== -1) {
                                mensajes[msgIdx].estado = 'confirmado';
                                guardarMensajesLocales();
                                renderizarMensajes();
                            }
                        }
                    }
                })
                .catch(function(err) {
                    log('⚠️ Reenvío falló: ' + err.message);
                });
        });
    }

    window.reenviarPendientes = function() {
        if (mensajesPendientes.length === 0) {
            mostrarToast('⚠️ No hay mensajes pendientes', 'warning');
            return;
        }
        mostrarToast('🔄 Reenviando ' + mensajesPendientes.length + ' mensajes...', 'info');
        reenviarPendientesInterno();
    };

    // ============================================================
    // RENDERIZAR MENSAJES - SOLO IMÁGENES
    // ============================================================
    function renderizarMensajes() {
        if (!mensajes || mensajes.length === 0) {
            messagesContainer.innerHTML = `<div class="empty-messages"><i class="fas fa-comments"></i><p>No hay mensajes</p></div>`;
            return;
        }
        
        let html = '';
        let ultimaFecha = '';
        const mensajesOrdenados = [...mensajes].sort((a, b) => {
            const dateA = new Date(a.fecha);
            const dateB = new Date(b.fecha);
            if (isNaN(dateA.getTime())) return 1;
            if (isNaN(dateB.getTime())) return -1;
            return dateA - dateB;
        });
        
        mensajesOrdenados.forEach((msg) => {
            let fechaMsg = new Date(msg.fecha);
            if (isNaN(fechaMsg.getTime())) {
                fechaMsg = new Date();
            }
            const fechaStr = formatearFecha(fechaMsg);
            const horaStr = formatearHora(fechaMsg);
            
            const esEnviado = msg.remitente === nombreConductor || msg.remitente === 'Tú' || msg.esPropio === true;
            const clase = esEnviado ? 'sent' : 'received';
            const nombreEmisor = esEnviado ? 'Tú' : (msg.remitente || 'Conductor');
            
            let estadoClase = '';
            let estadoTexto = '';
            let estadoIcono = '';
            
            if (esEnviado) {
                if (msg.estado === 'pendiente') {
                    estadoClase = 'pendiente';
                    estadoTexto = '⏳ Enviando...';
                    estadoIcono = '<i class="fas fa-clock"></i>';
                } else if (msg.estado === 'confirmado') {
                    estadoClase = 'confirmado';
                    estadoTexto = '✅ Entregado';
                    estadoIcono = '<i class="fas fa-check-circle"></i>';
                } else if (msg.estado === 'error') {
                    estadoClase = 'error-envio';
                    estadoTexto = '❌ Error';
                    estadoIcono = '<i class="fas fa-exclamation-circle"></i>';
                }
            }
            
            if (fechaStr !== ultimaFecha) {
                html += `<div class="fecha-divider">${fechaStr}</div>`;
                ultimaFecha = fechaStr;
            }
            
            const tieneReaccion = msg.reaccion && msg.reaccion === '👍';
            const reaccionDe = msg.reaccionDe || '';
            const esMiReaccion = reaccionDe === idConductor || reaccionDe === nombreConductor;
            
            html += `<div class="message ${clase} ${estadoClase}" data-msg-id="${msg.id}" data-remitente="${escapeHtml(msg.remitente || '')}">`;
            if (!esEnviado) {
                html += `<span class="nombre-emisor">${escapeHtml(nombreEmisor)}</span>`;
            }
            
            if (msg.mensaje) {
                html += `<div class="msg-text">${escapeHtml(msg.mensaje)}</div>`;
            }
            
            // ============================================================
            // RENDERIZADO DE IMÁGENES SOLO
            // ============================================================
            if (msg.archivo) {
                const archivo = msg.archivo;
                const info = getTipoArchivoInfo(archivo.nombre, archivo.tipo);
                const tamañoMB = (archivo.tamanio / 1024 / 1024).toFixed(2);
                const tamañoKB = (archivo.tamanio / 1024).toFixed(1);
                
                if (archivo._eliminado) {
                    html += `<div class="archivo-msg eliminado" style="opacity:0.6;border-color:rgba(239,68,68,0.3);padding:8px 12px;border-radius:10px;border:1px solid rgba(239,68,68,0.2);display:flex;align-items:center;gap:10px;margin:4px 0;">
                        <i class="fas ${info.icono}" style="color:#f87171;font-size:20px;"></i>
                        <div>
                            <div style="font-size:0.6rem;color:#e2e8f0;">${escapeHtml(archivo.nombre)}</div>
                            <div style="font-size:0.4rem;color:#f87171;"><i class="fas fa-trash-alt"></i> Eliminado del servidor</div>
                        </div>
                    </div>`;
                } else if (esImagen(archivo.nombre, archivo.tipo) && archivo.base64) {
                    html += `<div class="archivo-msg imagen" style="max-width:260px;margin:4px 0;border-radius:10px;overflow:hidden;cursor:pointer;position:relative;background:#0a1628;" onclick="abrirModalImagen('${archivo.base64}')">
                        <img src="data:${archivo.tipo || 'image/png'};base64,${archivo.base64}" 
                             alt="${escapeHtml(archivo.nombre)}" 
                             loading="lazy"
                             style="width:100%;max-width:260px;max-height:280px;height:auto;object-fit:contain;display:block;border-radius:10px;">
                        <div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.6);border-radius:20px;padding:2px 8px;font-size:0.4rem;color:rgba(255,255,255,0.6);display:flex;align-items:center;gap:4px;">
                            <i class="fas fa-expand"></i> ${tamañoKB} KB
                        </div>
                    </div>`;
                } else if (archivo._driveFile && !archivo._eliminado) {
                    html += `<div class="archivo-msg drive" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(96,165,250,0.05);border-radius:10px;border:1px solid rgba(96,165,250,0.1);max-width:260px;margin:4px 0;animation:pulseDrive 2s ease-in-out infinite;">
                        <div style="width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;background:rgba(96,165,250,0.1);font-size:0.9rem;color:#60a5fa;flex-shrink:0;">
                            <i class="fas ${info.icono}"></i>
                        </div>
                        <div style="flex:1;min-width:0;overflow:hidden;">
                            <div style="font-size:0.55rem;font-weight:500;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(archivo.nombre)}</div>
                            <div style="font-size:0.4rem;color:#94a3b8;"><i class="fas fa-cloud"></i> Drive ${tamañoKB} KB</div>
                        </div>
                        <button onclick="event.stopPropagation(); descargarYMostrarDrive('${msg.id}')" style="background:rgba(96,165,250,0.08);border:none;color:#60a5fa;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:0.55rem;transition:all 0.2s;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>`;
                }
            }
            
            if (tieneReaccion) {
                html += `<span class="reaccion-msg" title="${esMiReaccion ? 'Tu reacción' : 'Reacción de ' + reaccionDe}">👍</span>`;
            }
            
            if (!esEnviado && conectadoAMadre) {
                html += `<button class="btn-reaccionar" onclick="event.stopPropagation(); enviarReaccion('${msg.id}', '${escapeHtml(msg.remitente || '')}')" title="Responder con 👍">
                    👍
                </button>`;
            }
            
            if (estadoTexto) {
                html += `<span class="estado-msg ${estadoClase}">${estadoIcono} ${estadoTexto}</span>`;
            }
            
            html += `<span class="hora">${horaStr}</span>`;
            html += `</div>`;
        });
        messagesContainer.innerHTML = html;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // ============================================================
    // DESCARGAR ARCHIVO LOCAL - SOLO IMÁGENES
    // ============================================================
    function descargarArchivoLocal(dataUrl, nombre) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = nombre;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        mostrarToast('📥 Descargando ' + nombre, 'success');
    }

    // ============================================================
    // LIMPIAR TODOS LOS MENSAJES
    // ============================================================
    window.limpiarMensajesPropios = function() {
        if (!mensajes || mensajes.length === 0) {
            mostrarToast('⚠️ No hay mensajes para limpiar', 'warning');
            return;
        }
        
        if (!confirm('🗑️ ¿Eliminar TODOS los mensajes de tu chat?\n\n' +
                     'Total a eliminar: ' + mensajes.length + ' mensajes\n\n' +
                     '⚠️ Esto borrará el historial visualmente en TU dispositivo.')) {
            return;
        }
        
        guardarTiempoLimpieza();
        resetearUltimoIdRecibido();
        
        if (conectadoAMadre && idConductor) {
            llamarServidor('limpiar_todos_mensajes', {
                conductor_id: idConductor
            }).catch(e => log('⚠️ Error limpiando servidor: ' + e.message));
        }
        
        mensajes = [];
        mensajesPendientes = [];
        mensajesEnviadosIds.clear();
        
        try {
            localStorage.removeItem(MENSAJES_KEY);
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(FILE_CACHE_PREFIX)) {
                    localStorage.removeItem(key);
                }
            });
        } catch(e) {
            log('⚠️ Error limpiando localStorage: ' + e.message);
        }
        
        renderizarMensajes();
        mostrarToast('🗑️ Historial limpiado correctamente', 'success');
        log('🗑️ Todos los mensajes locales y caché eliminados. Timestamp: ' + new Date(tiempoUltimaLimpieza).toLocaleString());
    };

    // ============================================================
    // UBICACIÓN
    // ============================================================
    function activarUbicacion() {
        const statusUbicacion = document.getElementById('statusUbicacion');
        const btnPermitir = document.getElementById('btnPermitirUbicacion');
        statusUbicacion.style.color = '#fbbf24';
        statusUbicacion.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Obteniendo...';
        btnPermitir.disabled = true;
        if (!navigator.geolocation) {
            statusUbicacion.style.color = '#f87171';
            statusUbicacion.innerHTML = '❌ GPS no soportado';
            btnPermitir.disabled = false;
            btnPermitir.innerHTML = '<i class="fas fa-sync-alt"></i> Reintentar';
            return;
        }
        navigator.geolocation.getCurrentPosition(
            function(pos) {
                ubicacionActual = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                ubicacionPermitida = true;
                statusUbicacion.style.color = '#38bdf8';
                statusUbicacion.innerHTML = '<i class="fas fa-check-circle"></i> GPS activo';
                btnPermitir.innerHTML = '<i class="fas fa-check"></i> Activado';
                btnPermitir.className = 'btn-principal success';
                actualizarUbicacionServidor();
                setTimeout(function() {
                    document.getElementById('modalPermisoUbicacion').classList.remove('active');
                    conectarConMadre();
                }, 600);
            },
            function(err) {
                let msg = err.code === 1 ? 'Permiso denegado' : err.code === 2 ? 'Señal no disponible' : 'Tiempo agotado';
                statusUbicacion.style.color = '#f87171';
                statusUbicacion.innerHTML = '❌ ' + msg;
                btnPermitir.disabled = false;
                btnPermitir.innerHTML = '<i class="fas fa-sync-alt"></i> Reintentar';
                btnPermitir.className = 'btn-principal danger';
            },
            { enableHighAccuracy: true, timeout: 15000 }
        );
    }
    document.getElementById('btnPermitirUbicacion').addEventListener('click', activarUbicacion);

    function actualizarUbicacionServidor() {
        if (!conectadoAMadre || !ubicacionActual || !idConductor) return;
        llamarServidor('actualizar_ubicacion', {
            conductor_id: idConductor,
            lat: ubicacionActual.lat,
            lng: ubicacionActual.lng
        }).catch(e => log('⚠️ Error actualizando ubicación: ' + e.message));
    }

    // ============================================================
    // ENVIAR MENSAJE CON IMAGEN - SOLO IMÁGENES
    // ============================================================
    async function enviarMensajeConArchivo(texto, file) {
        if (!conectadoAMadre || !idConductor) {
            mostrarToast('❌ No conectado al puente', 'error');
            return;
        }
        
        // VALIDAR: SOLO IMÁGENES
        if (!esSoloImagen(file.name, file.type)) {
            mostrarToast('❌ Solo se permiten imágenes (JPG, PNG, GIF, WEBP, etc.)', 'error');
            archivosSeleccionados = [];
            if (fileInput) fileInput.value = '';
            actualizarArchivosSeleccionados();
            return;
        }
        
        if (subidaEnProgreso) {
            mostrarToast('⏳ Espera a que termine la subida actual', 'warning');
            return;
        }
        
        const tamañoKB = file.size / 1024;
        const tamañoMB = file.size / 1024 / 1024;
        
        if (tamañoKB > MAX_FILE_SIZE_KB) {
            const msg = '❌ La imagen excede ' + (MAX_FILE_SIZE_KB/1024) + 'MB (tiene ' + tamañoMB.toFixed(1) + 'MB)';
            mostrarToast(msg, 'error');
            log('❌ Imagen demasiado grande: ' + file.name);
            return;
        }
        
        const nombreLimpio = sanitizarNombreArchivo(file.name);
        if (nombreLimpio !== file.name) {
            log('⚠️ Nombre sanitizado: ' + file.name + ' → ' + nombreLimpio);
            try {
                const newFile = new File([file], nombreLimpio, { type: file.type });
                file = newFile;
            } catch(e) {}
        }
        
        subidaEnProgreso = true;
        
        if (uploadProgress) uploadProgress.classList.add('active');
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
        
        try {
            const info = getTipoArchivoInfo(file.name, file.type);
            const msgId = 'msg_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
            
            // PARA IMÁGENES GRANDES: SUBIR POR PARTES
            if (tamañoKB > MAX_SMALL_FILE_KB) {
                log('📤 [IMAGEN GRANDE] Subiendo: ' + file.name + ' (' + tamañoMB.toFixed(2) + ' MB)');
                
                const nuevoMensaje = {
                    id: msgId,
                    remitente: nombreConductor || 'Tú',
                    mensaje: texto || '',
                    fecha: new Date().toISOString(),
                    esPropio: true,
                    ubicacion: ubicacionActual || null,
                    archivo: {
                        nombre: file.name,
                        tipo: file.type || 'image/png',
                        tamanio: file.size,
                        icono: info.icono,
                        color: info.color,
                        clase: info.clase,
                        _subiendo: true,
                        _progreso: 0
                    },
                    estado: 'pendiente',
                    intentos: 0
                };
                
                mensajesEnviadosIds.add(msgId);
                mensajes.push(nuevoMensaje);
                mensajesPendientes.push(nuevoMensaje);
                guardarMensajesLocales();
                renderizarMensajes();
                
                btnEnviar.disabled = true;
                btnEnviar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
                
                mostrarToast('📤 Subiendo imagen de ' + tamañoMB.toFixed(1) + ' MB...', 'info');
                
                const resultado = await subirArchivoPorPartes(file, idConductor, texto);
                
                if (resultado && resultado.ok) {
                    log('✅ [IMAGEN] Imagen subida correctamente');
                    mostrarToast('✅ Imagen enviada correctamente', 'success');
                    
                    // LIMPIAR BARRA DE ENVÍO
                    limpiarBarraEnvio();
                    
                    const idx = mensajesPendientes.findIndex(m => m.id === msgId);
                    if (idx !== -1) {
                        mensajesPendientes.splice(idx, 1);
                        const msgIdx = mensajes.findIndex(m => m.id === msgId);
                        if (msgIdx !== -1) {
                            if (resultado.completarResp && resultado.completarResp.fileId) {
                                mensajes[msgIdx].archivo.fileId = resultado.completarResp.fileId;
                                mensajes[msgIdx].archivo._driveFile = true;
                                mensajes[msgIdx].archivo._subiendo = false;
                                mensajes[msgIdx].archivo._pendienteDescarga = true;
                                delete mensajes[msgIdx].archivo.base64;
                            }
                            mensajes[msgIdx].estado = 'confirmado';
                            guardarMensajesLocales();
                            renderizarMensajes();
                        }
                    }
                } else {
                    mostrarToast('⚠️ Error al subir la imagen', 'warning');
                    const msgIdx = mensajes.findIndex(m => m.id === msgId);
                    if (msgIdx !== -1) {
                        mensajes[msgIdx].estado = 'error';
                        mensajes[msgIdx].archivo._subiendo = false;
                        guardarMensajesLocales();
                        renderizarMensajes();
                    }
                }
                
                btnEnviar.disabled = false;
                btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i>';
                if (uploadProgress) uploadProgress.classList.remove('active');
                if (progressBar) progressBar.style.width = '0%';
                if (progressText) progressText.textContent = '';
                subidaEnProgreso = false;
                return;
            }
            
            // IMÁGENES PEQUEÑAS (<1MB): ENVÍO DIRECTO
            log('📤 Imagen pequeña, enviando directo: ' + file.name + ' (' + tamañoKB.toFixed(1) + 'KB)');
            
            const base64 = await archivoABase64(file);
            guardarBase64Cache(msgId, base64);
            
            const nuevoMensaje = {
                id: msgId,
                remitente: nombreConductor || 'Tú',
                mensaje: texto || '',
                fecha: new Date().toISOString(),
                esPropio: true,
                ubicacion: ubicacionActual || null,
                archivo: {
                    nombre: file.name,
                    tipo: file.type || 'image/png',
                    tamanio: file.size,
                    icono: info.icono,
                    color: info.color,
                    clase: info.clase,
                    base64: base64,
                    descargado: true,
                    pendiente: false
                },
                estado: 'pendiente',
                intentos: 0
            };
            
            mensajesEnviadosIds.add(msgId);
            mensajes.push(nuevoMensaje);
            mensajesPendientes.push(nuevoMensaje);
            guardarMensajesLocales();
            renderizarMensajes();
            
            btnEnviar.disabled = true;
            btnEnviar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
            
            const datosPost = {
                accion: 'enviar_mensaje',
                conductor_id: idConductor,
                remitente: nombreConductor || "Conductor",
                mensaje: texto || '',
                ubicacion: ubicacionActual ? JSON.stringify(ubicacionActual) : null,
                fecha: new Date().toISOString(),
                archivo_nombre: file.name,
                archivo_tipo: file.type || 'image/png',
                archivo_tamanio: file.size,
                archivo_base64: base64,
                archivo_icono: info.icono,
                archivo_color: info.color,
                archivo_clase: info.clase,
                msg_id: msgId,
                requiere_ack: true
            };
            
            try {
                const data = await enviarPost(datosPost);
                if (data && data.ok) {
                    log('✅ Mensaje enviado correctamente');
                    mostrarToast('✅ Imagen entregada', 'success');
                    
                    // LIMPIAR BARRA DE ENVÍO
                    limpiarBarraEnvio();
                    
                    const idx = mensajesPendientes.findIndex(m => m.id === msgId);
                    if (idx !== -1) {
                        mensajesPendientes.splice(idx, 1);
                        const msgIdx = mensajes.findIndex(m => m.id === msgId);
                        if (msgIdx !== -1) {
                            mensajes[msgIdx].estado = 'confirmado';
                            guardarMensajesLocales();
                            renderizarMensajes();
                        }
                    }
                } else {
                    log('⚠️ Mensaje pendiente de confirmación');
                    mostrarToast('⚠️ Imagen en cola de reenvío', 'info');
                }
            } catch (error) {
                log('⚠️ Error al enviar: ' + error.message);
                mostrarToast('⚠️ Imagen en cola de reenvío', 'info');
            }
            
            btnEnviar.disabled = false;
            btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i>';
            if (uploadProgress) uploadProgress.classList.remove('active');
            if (progressBar) progressBar.style.width = '0%';
            if (progressText) progressText.textContent = '';
            subidaEnProgreso = false;
            
        } catch (error) {
            log('❌ Error: ' + error.message);
            mostrarToast('❌ Error al procesar imagen: ' + error.message, 'error');
            btnEnviar.disabled = false;
            btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i>';
            if (uploadProgress) uploadProgress.classList.remove('active');
            if (progressBar) progressBar.style.width = '0%';
            if (progressText) progressText.textContent = '';
            subidaEnProgreso = false;
        }
    }

    // ============================================================
    // ENVIAR MENSAJE (TEXTO)
    // ============================================================
    function enviarMensajeServidor(texto) {
        if (!conectadoAMadre || !idConductor) { mostrarToast('❌ No conectado al puente', 'error'); return; }
        if (!texto) { mostrarToast('⚠️ Escribe un mensaje', 'warning'); return; }
        
        const msgId = 'msg_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
        
        const nuevoMensaje = {
            id: msgId,
            remitente: nombreConductor || 'Tú',
            mensaje: texto,
            fecha: new Date().toISOString(),
            esPropio: true,
            ubicacion: ubicacionActual || null,
            estado: 'pendiente',
            intentos: 0
        };
        
        mensajesEnviadosIds.add(msgId);
        mensajes.push(nuevoMensaje);
        mensajesPendientes.push(nuevoMensaje);
        guardarMensajesLocales();
        renderizarMensajes();
        
        btnEnviar.disabled = true;
        btnEnviar.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';
        
        const datos = {
            accion: 'enviar_mensaje',
            conductor_id: idConductor,
            remitente: nombreConductor || "Conductor",
            mensaje: texto,
            ubicacion: ubicacionActual ? JSON.stringify(ubicacionActual) : null,
            fecha: new Date().toISOString(),
            msg_id: msgId,
            requiere_ack: true
        };
        
        enviarPost(datos)
            .then(data => {
                if (data && data.ok) {
                    // LIMPIAR BARRA DE ENVÍO
                    limpiarBarraEnvio();
                    mostrarToast('✅ Mensaje enviado', 'success');
                    log('✅ Mensaje enviado: ' + texto.substring(0, 30));
                    const idx = mensajesPendientes.findIndex(m => m.id === msgId);
                    if (idx !== -1) {
                        mensajesPendientes.splice(idx, 1);
                        const msgIdx = mensajes.findIndex(m => m.id === msgId);
                        if (msgIdx !== -1) {
                            mensajes[msgIdx].estado = 'confirmado';
                            guardarMensajesLocales();
                            renderizarMensajes();
                        }
                    }
                } else {
                    mostrarToast('⚠️ Mensaje en cola de reenvío', 'info');
                }
            })
            .catch(e => { 
                mostrarToast('⚠️ Mensaje en cola de reenvío', 'info');
                log('⚠️ Error enviando: ' + e.message);
            })
            .finally(() => { 
                btnEnviar.disabled = false; 
                btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i>'; 
            });
    }

    // ============================================================
    // ENVIAR MENSAJE PRINCIPAL
    // ============================================================
    window.enviarMensaje = function() {
        const texto = mensajeInput.value.trim();
        if (!conductorVerificado || !idConductor) { mostrarModalIdConductor(); return; }
        if (!ubicacionPermitida || !ubicacionActual) { document.getElementById('modalPermisoUbicacion').classList.add('active'); return; }
        
        if (archivosSeleccionados.length > 0) {
            const file = archivosSeleccionados[0];
            enviarMensajeConArchivo(texto, file);
            return;
        }
        
        enviarMensajeServidor(texto);
    };

    // ============================================================
    // EXPONER FUNCIONES GLOBALES
    // ============================================================
    window.enviarReaccion = enviarReaccion;
    window.descargarYMostrarDrive = descargarYMostrarDrive;

    function mostrarModalIdConductor() {
        modalId.classList.add('active');
        inputId.focus();
    }

    // ============================================================
    // IMAGEN DE PRUEBA
    // ============================================================
    window.enviarImagenPrueba = function() {
        if (!conductorVerificado || !idConductor) {
            mostrarToast('⚠️ Identifícate primero', 'warning');
            return;
        }
        if (!ubicacionPermitida || !ubicacionActual) {
            document.getElementById('modalPermisoUbicacion').classList.add('active');
            return;
        }
        
        mostrarToast('📸 Generando imagen de prueba...', 'info');
        
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        
        const grad = ctx.createLinearGradient(0, 0, 400, 400);
        grad.addColorStop(0, '#0a1628');
        grad.addColorStop(1, '#1a3a5a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 400, 400);
        
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 4;
        ctx.strokeRect(10, 10, 380, 380);
        
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 48px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📡', 200, 140);
        
        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 32px Inter, sans-serif';
        ctx.fillText('GSN', 200, 220);
        
        ctx.fillStyle = '#94a3b8';
        ctx.font = '20px Inter, sans-serif';
        ctx.fillText('Prueba ' + new Date().toLocaleTimeString(), 200, 280);
        
        ctx.fillStyle = 'rgba(56,189,248,0.08)';
        ctx.font = '14px Inter, sans-serif';
        ctx.fillText('ID: ' + idConductor, 200, 330);
        
        canvas.toBlob(async (blob) => {
            if (!blob) {
                mostrarToast('❌ Error generando imagen', 'error');
                return;
            }
            const file = new File([blob], 'test_GSN_' + Date.now() + '.png', { type: 'image/png' });
            log('📸 Imagen de prueba generada: ' + (file.size/1024).toFixed(1) + 'KB');
            archivosSeleccionados = [file];
            actualizarArchivosSeleccionados();
            await enviarMensajeConArchivo('📸 Imagen de prueba GSN', file);
        }, 'image/png', 0.9);
    };

    // ============================================================
    // ARCHIVOS - SELECCIÓN (SOLO IMÁGENES)
    // ============================================================
    function actualizarArchivosSeleccionados() {
        if (archivosSeleccionados.length === 0) {
            archivosSeleccionadosDiv.style.display = 'none';
            badgeArchivos.style.display = 'none';
            uploadProgress.classList.remove('active');
            if (progressText) progressText.textContent = '';
            return;
        }
        let html = '';
        archivosSeleccionados.forEach((file, index) => {
            const tamanio = (file.size / 1024).toFixed(1) + ' KB';
            const info = getTipoArchivoInfo(file.name, file.type);
            const isOverLimit = file.size > MAX_FILE_SIZE_KB * 1024;
            const esImg = esSoloImagen(file.name, file.type);
            html += `<span class="tag-archivo" style="${!esImg ? 'border-color:rgba(239,68,68,0.3);color:#f87171;' : ''} ${isOverLimit ? 'border-color:rgba(239,68,68,0.3);color:#f87171;' : ''}">
                <i class="fas ${info.icono}" style="color:${!esImg ? '#f87171' : isOverLimit ? '#f87171' : info.color};"></i>
                ${escapeHtml(file.name)} (${(file.size/1024/1024).toFixed(1)+' MB'})
                ${!esImg ? ' ❌ Solo imágenes' : ''}
                ${isOverLimit ? ' ⚠️' : ''}
                <span class="remove" onclick="eliminarArchivoSeleccionado(${index})">✕</span>
            </span>`;
        });
        archivosSeleccionadosDiv.innerHTML = html;
        archivosSeleccionadosDiv.style.display = 'flex';
        badgeArchivos.textContent = archivosSeleccionados.length;
        badgeArchivos.style.display = 'inline';
    }

    window.eliminarArchivoSeleccionado = function(index) {
        archivosSeleccionados.splice(index, 1);
        actualizarArchivosSeleccionados();
        if (archivosSeleccionados.length === 0) fileInput.value = '';
    };

    window.abrirExploradorArchivos = function() {
        if (!conductorVerificado || !idConductor) {
            mostrarToast('⚠️ Identifícate primero', 'warning');
            return;
        }
        if (subidaEnProgreso) {
            mostrarToast('⏳ Espera a que termine la subida actual', 'warning');
            return;
        }
        // Configurar para solo imágenes
        if (fileInput) {
            fileInput.accept = 'image/*';
            fileInput.click();
        }
    };

    fileInput.addEventListener('change', function() {
        var nuevosArchivos = Array.from(this.files);
        if (nuevosArchivos.length === 0) return;
        if (archivosSeleccionados.length + nuevosArchivos.length > 1) {
            mostrarToast('⚠️ Solo 1 archivo por mensaje', 'warning');
            this.value = '';
            return;
        }
        const file = nuevosArchivos[0];
        
        // VALIDAR: SOLO IMÁGENES
        if (!esSoloImagen(file.name, file.type)) {
            mostrarToast('❌ Solo se permiten imágenes (JPG, PNG, GIF, WEBP, etc.)', 'error');
            this.value = '';
            return;
        }
        
        const tamañoKB = file.size / 1024;
        const tamañoMB = file.size / 1024 / 1024;
        if (tamañoKB > MAX_FILE_SIZE_KB) {
            mostrarToast('⚠️ La imagen excede ' + (MAX_FILE_SIZE_KB/1024) + 'MB (' + tamañoMB.toFixed(1) + 'MB)', 'error');
            this.value = '';
            return;
        }
        archivosSeleccionados = archivosSeleccionados.concat(nuevosArchivos);
        actualizarArchivosSeleccionados();
        this.value = '';
        if (tamañoMB > 10) {
            mostrarToast('📸 Imagen de ' + tamañoMB.toFixed(1) + 'MB seleccionada', 'info');
        } else {
            mostrarToast('📸 Imagen lista para enviar', 'info');
        }
    });

    // ============================================================
    // IMAGEN MODAL
    // ============================================================
    window.abrirModalImagen = function(src) {
        imagenAmpliada.src = src;
        modalImagen.classList.add('active');
        document.body.style.overflow = 'hidden';
    };
    window.cerrarModalImagen = function() {
        modalImagen.classList.remove('active');
        document.body.style.overflow = '';
    };

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { cerrarModalImagen(); }
    });

    // ============================================================
    // EVENTOS
    // ============================================================
    document.getElementById('btnComenzar').addEventListener('click', function() {
        modalPresentacion.classList.remove('active');
        document.getElementById('modalPermisoUbicacion').classList.add('active');
    });
    inputId.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); verificarConductor(inputId.value.trim().toUpperCase()); }
    });
    btnIngresar.addEventListener('click', function() {
        verificarConductor(inputId.value.trim().toUpperCase());
    });
    mensajeInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); window.enviarMensaje(); }
    });

    // ============================================================
    // INICIALIZACIÓN
    // ============================================================
    function inicializar() {
        if (yaInicializado) return;
        yaInicializado = true;
        
        log('🚀 Inicializando Conductor v21.1 - Solo imágenes');
        log('📡 Puente: ' + API_URL);
        log('📌 Modo: cliente_conductor - SOLO IMÁGENES');
        log('📌 Origen:', ORIGEN);
        log('📌 Chunk size: ' + (CHUNK_SIZE/1024) + ' KB');
        log('📌 Máximo: ' + (MAX_FILE_SIZE_KB/1024) + ' MB');
        
        mensajeInput.disabled = true;
        btnEnviar.disabled = true;
        
        const datosCargados = cargarDatosLocales();
        const idGuardado = localStorage.getItem("conductor_id");
        const nombreGuardado = localStorage.getItem("conductor_nombre");
        
        if (idGuardado && nombreGuardado) {
            nombreHeader.textContent = nombreGuardado;
            if (datosCargados && conductorVerificado) {
                mensajeInput.disabled = false;
                btnEnviar.disabled = false;
                nombreHeader.textContent = nombreConductor;
                actualizarEstadoIcono('conectado', nombreConductor);
                cargarTiempoLimpieza();
                cargarUltimoIdRecibido();
                cargarMensajesLocales();
                renderizarMensajes();
                cargarMensajesDelServidor();
            }
        }
        
        actualizarEstadoIcono('desconectado', nombreGuardado || 'Conductor');
        setServerStatus('Inicializando...', 'wait');
        setTimeout(function() { conectarConMadre(); }, 1500);
        
        setInterval(function() {
            if (!conectadoAMadre && !reconectando) {
                conectarConMadre();
            }
        }, 30000);
        
        setInterval(function() {
            if (conectadoAMadre && ubicacionActual && ubicacionPermitida && idConductor) {
                actualizarUbicacionServidor();
            }
            if (conductorVerificado && idConductor) {
                guardarDatosLocales();
                guardarMensajesLocales();
                guardarUltimoIdRecibido();
            }
        }, 60000);
        
        setInterval(function() {
            limpiarCacheCompleta();
        }, 3600000);
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else { inicializar(); }
    
})();