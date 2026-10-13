// ============================================================
// MAIN - GRUPO GSN
// Dashboard Principal - JavaScript
// ============================================================

// ============================================================
// DATOS GLOBALES
// ============================================================
let DATA_GLOBAL = [];
let DATA_FUEL_GLOBAL = [];
let lastUpdateTime = null;
let lastUpdateFuelTime = null;
let lastUpdateSource = 'Google Sheets';

// ============================================================
// LOADER FUTURISTA AL CAMBIAR DE MÓDULO
// ============================================================
let loaderSafetyTimeout = null;

function showFrameLoader() {
    var loader = document.getElementById('frameLoader');
    if (loader) loader.classList.add('active');

    // Seguridad: si algo falla, ocultar el loader a los 8s máx
    if (loaderSafetyTimeout) clearTimeout(loaderSafetyTimeout);
    loaderSafetyTimeout = setTimeout(function() {
        hideFrameLoader();
    }, 8000);
}

function hideFrameLoader() {
    var loader = document.getElementById('frameLoader');
    if (loader) loader.classList.remove('active');

    if (loaderSafetyTimeout) {
        clearTimeout(loaderSafetyTimeout);
        loaderSafetyTimeout = null;
    }
}

// ============================================================
// ESCUCHAR MENSAJES
// ============================================================
window.addEventListener('message', function(event) {
    const data = event.data;
    if (!data || !data.type) return;

    console.log('📨 Recibido:', data.type);

    if (data.type === 'DATOS_ACTUALIZADOS') {
        DATA_GLOBAL = data.data || [];
        DATA_FUEL_GLOBAL = data.fuelData || [];
        lastUpdateTime = data.lastUpdate || new Date();
        lastUpdateFuelTime = data.lastUpdateFuel || new Date();
        lastUpdateSource = data.source || 'Google Sheets';

        console.log('📊 Datos actualizados:', {
            mayoreo: DATA_GLOBAL.length,
            fuel: DATA_FUEL_GLOBAL.length
        });

        actualizarBarraEstado();
        enviarDatosAModulos();
    }

    if (data.type === 'ACTUALIZADOR_READY') {
        console.log('🔄 Actualizador listo');
        const frame = document.getElementById('actualizadorFrame');
        if (frame && frame.contentWindow) {
            frame.contentWindow.postMessage({ type: 'SOLICITAR_DATOS' }, '*');
        }
    }
});

// ============================================================
// NOTIFICAR AL ACTUALIZADOR
// ============================================================
function notifyActualizador(data) {
    const actualizador = document.getElementById('actualizadorFrame');
    if (actualizador && actualizador.contentWindow) {
        try {
            actualizador.contentWindow.postMessage(data, '*');
            return true;
        } catch (e) {
            return false;
        }
    }
    return false;
}

// ============================================================
// ENVIAR DATOS A MODULOS
// ============================================================
function enviarDatosAModulos() {
    const moduloFrame = document.getElementById('moduloFrame');
    if (moduloFrame && moduloFrame.contentWindow) {
        try {
            const datosCompletos = construirDatosCompletos();
            moduloFrame.contentWindow.postMessage({
                type: 'DATOS_ACTUALIZADOS',
                data: DATA_GLOBAL,
                fuelData: DATA_FUEL_GLOBAL,
                datosCompletos: datosCompletos,
                lastUpdate: lastUpdateTime,
                lastUpdateFuel: lastUpdateFuelTime,
                source: lastUpdateSource
            }, '*');
            console.log('📤 Datos enviados al módulo');
        } catch (e) {
            console.warn('Error enviando datos:', e);
        }
    }
}

// ============================================================
// CONSTRUIR DATOS COMPLETOS
// ============================================================
function construirDatosCompletos() {
    let headers = [];
    let rows = [];

    if (DATA_GLOBAL && DATA_GLOBAL.length > 0) {
        const allKeys = new Set();
        DATA_GLOBAL.forEach(item => {
            Object.keys(item).forEach(key => {
                if (key !== 'id' && key !== '_periodo' && !key.startsWith('_')) {
                    allKeys.add(key);
                }
            });
        });

        const headerOrder = ['fecha', 'mes', 'cliente', 'combustible', 'solicitado', 'despachado',
            'pedidoPuma', 'facturaPuma', 'cisternaPickup', 'flota', 'placaEntrega',
            'conductor', 'remision', 'costosTotales', 'subtotalVenta', 'facturaGSN',
            'margenBruto', 'sobrante', 'observaciones'
        ];

        const sortedKeys = [];
        headerOrder.forEach(h => {
            if (allKeys.has(h)) {
                sortedKeys.push(h);
                allKeys.delete(h);
            }
        });
        sortedKeys.push(...Array.from(allKeys));

        headers = sortedKeys;

        DATA_GLOBAL.forEach(item => {
            const row = [];
            headers.forEach(h => {
                let val = item[h];
                if (val === undefined || val === null) val = '';
                if (typeof val === 'number') val = Math.round(val * 100) / 100;
                row.push(val);
            });
            rows.push(row);
        });
    }

    if (DATA_FUEL_GLOBAL && DATA_FUEL_GLOBAL.length > 0) {
        const fuelHeaders = ['fecha', 'mes', 'conductor', 'placaCisterna', 'producto',
            'volumen', 'costoPuma', 'subTotalCosto', 'subTotalVenta',
            'margen', 'noCarga', 'pedido', 'factura'
        ];

        const fuelRows = [];
        DATA_FUEL_GLOBAL.forEach(item => {
            const row = [];
            fuelHeaders.forEach(h => {
                let val = item[h];
                if (val === undefined || val === null) val = '';
                if (typeof val === 'number') val = Math.round(val * 100) / 100;
                row.push(val);
            });
            fuelRows.push(row);
        });

        const separatorRow = [];
        for (let i = 0; i < headers.length; i++) {
            separatorRow.push(i === 0 ? '--- FUEL OIL ---' : '');
        }
        rows.push(separatorRow);

        fuelRows.forEach(fuelRow => {
            const mappedRow = [];
            headers.forEach(h => {
                const idx = fuelHeaders.indexOf(h);
                if (idx !== -1 && idx < fuelRow.length) mappedRow.push(fuelRow[idx]);
                else if (h === 'producto') mappedRow.push('Fuel Oil');
                else if (h === 'conductor') {
                    const condIdx = fuelHeaders.indexOf('conductor');
                    mappedRow.push(condIdx !== -1 && condIdx < fuelRow.length ? fuelRow[condIdx] : '');
                } else if (h === 'fecha') {
                    const fechaIdx = fuelHeaders.indexOf('fecha');
                    mappedRow.push(fechaIdx !== -1 && fechaIdx < fuelRow.length ? fuelRow[fechaIdx] : '');
                } else if (h === 'subtotalVenta') {
                    const ventaIdx = fuelHeaders.indexOf('subTotalVenta');
                    mappedRow.push(ventaIdx !== -1 && ventaIdx < fuelRow.length ? fuelRow[ventaIdx] : 0);
                } else if (h === 'margenBruto') {
                    const margenIdx = fuelHeaders.indexOf('margen');
                    mappedRow.push(margenIdx !== -1 && margenIdx < fuelRow.length ? fuelRow[margenIdx] : 0);
                } else if (h === 'despachado') {
                    const volIdx = fuelHeaders.indexOf('volumen');
                    mappedRow.push(volIdx !== -1 && volIdx < fuelRow.length ? fuelRow[volIdx] : 0);
                } else {
                    mappedRow.push('');
                }
            });
            rows.push(mappedRow);
        });
    }

    const totals = { solicitado: 0, despachado: 0, ventas: 0, margen: 0, volumen: 0 };
    const idxSolicitado = headers.indexOf('solicitado');
    const idxDespachado = headers.indexOf('despachado');
    const idxVenta = headers.indexOf('subtotalVenta');
    const idxMargen = headers.indexOf('margenBruto');
    const idxVolumen = headers.indexOf('volumen');

    rows.forEach(row => {
        if (row[0] === '--- FUEL OIL ---') return;
        if (idxSolicitado !== -1 && typeof row[idxSolicitado] === 'number') totals.solicitado += row[idxSolicitado];
        if (idxDespachado !== -1 && typeof row[idxDespachado] === 'number') totals.despachado += row[idxDespachado];
        if (idxVenta !== -1 && typeof row[idxVenta] === 'number') totals.ventas += row[idxVenta];
        if (idxMargen !== -1 && typeof row[idxMargen] === 'number') totals.margen += row[idxMargen];
        if (idxVolumen !== -1 && typeof row[idxVolumen] === 'number') totals.volumen += row[idxVolumen];
    });

    return {
        headers, rows, columns: headers,
        view: 'Dashboard',
        filters: { month: 'Todos', period: 'Todos' },
        totals,
        data: DATA_GLOBAL,
        combustibleData: DATA_GLOBAL,
        fuelData: DATA_FUEL_GLOBAL,
        rawData: rows,
        title: 'GSN - Control de Distribución'
    };
}

// ============================================================
// ACTUALIZAR BARRA DE ESTADO
// ============================================================
function actualizarBarraEstado() {
    const fuelTime = lastUpdateFuelTime ? new Date(lastUpdateFuelTime) : new Date();
    const mayoreoTime = lastUpdateTime ? new Date(lastUpdateTime) : new Date();

    const fTime = document.getElementById('statusFuelTime');
    const fDate = document.getElementById('statusFuelDate');
    const fReg = document.getElementById('statusFuelRegistros');
    const fVol = document.getElementById('statusFuelVolumen');

    if (fTime) fTime.textContent = fuelTime.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (fDate) fDate.textContent = fuelTime.toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (fReg) fReg.textContent = DATA_FUEL_GLOBAL.length || '0';
    if (fVol) fVol.textContent = DATA_FUEL_GLOBAL.reduce((sum, item) => sum + (parseFloat(item.volumen) || 0), 0).toLocaleString() || '0';

    const cTime = document.getElementById('statusMayoreoTime');
    const cDate = document.getElementById('statusMayoreoDate');
    const cReg = document.getElementById('statusMayoreoRegistros');
    const cVol = document.getElementById('statusMayoreoVolumen');

    if (cTime) cTime.textContent = mayoreoTime.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (cDate) cDate.textContent = mayoreoTime.toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (cReg) cReg.textContent = DATA_GLOBAL.length || '0';
    if (cVol) cVol.textContent = DATA_GLOBAL.reduce((sum, item) => sum + (parseFloat(item.despachado) || 0), 0).toLocaleString() || '0';
}

// ============================================================
// ASISTENTE
// ============================================================
const openAssistantBtn = document.getElementById('openAssistantMenu');
const asistenteFrame = document.getElementById('asistenteFrame');
let assistantActive = false;

function toggleAsistente() {
    assistantActive = !assistantActive;
    
    if (assistantActive) {
        openAssistantBtn.classList.add('active');
        asistenteFrame.classList.add('active');
        sendToAssistant({ type: 'SET_PORT', port: 5500 });
        sendToAssistant({ type: 'TOGGLE_ASISTENTE' });
        notifyActualizador({ type: 'ASISTENTE_OPEN' });
        console.log('🤖 Asistente ABIERTO');
    } else {
        openAssistantBtn.classList.remove('active');
        asistenteFrame.classList.remove('active');
        sendToAssistant({ type: 'CLOSE_ASISTENTE' });
        notifyActualizador({ type: 'ASISTENTE_CLOSE' });
        console.log('🤖 Asistente CERRADO');
    }
}

function sendToAssistant(data) {
    if (asistenteFrame && asistenteFrame.contentWindow) {
        try {
            asistenteFrame.contentWindow.postMessage(data, '*');
            return true;
        } catch (e) { return false; }
    }
    return false;
}

openAssistantBtn.addEventListener('click', toggleAsistente);

window.addEventListener('message', function(event) {
    const data = event.data;
    if (!data || !data.type) return;

    if (data.type === 'ASISTENTE_OPEN') {
        if (!assistantActive) {
            assistantActive = true;
            openAssistantBtn.classList.add('active');
            asistenteFrame.classList.add('active');
            notifyActualizador({ type: 'ASISTENTE_OPEN' });
        }
    }

    if (data.type === 'ASISTENTE_CLOSE') {
        if (assistantActive) {
            assistantActive = false;
            openAssistantBtn.classList.remove('active');
            asistenteFrame.classList.remove('active');
            notifyActualizador({ type: 'ASISTENTE_CLOSE' });
        }
    }

    if (data.type === 'REQUEST_DATOS') enviarDatosAModulos();
});

// ============================================================
// CARGAR MODULO - CON LOADER FUTURISTA
// main.html está en: templates/modulos/main.html
// Los módulos están en: templates/modulos/MODULOS_C/<VISTA>/
// ============================================================
const moduloFrame = document.getElementById('moduloFrame');

function cargarModulo(view) {
    const pages = {
        'summary':    'MODULOS_C/DASHBOARD/resumen_ejecutivo.html',
        'volumes':    'MODULOS_C/VOLUMENES/volumenes.html',
        'profit':     'MODULOS_C/RENTABILIDAD/rentabilidad.html',
        'deliveries': 'MODULOS_C/ENTREGAS/entregas.html',
        'fleet':      'MODULOS_C/FLOTA Y RUTA/flota_y_rutas.html',
        'fuel':       'MODULOS_C/FUEL OIL/fuel_oil.html',
        'location':   'MODULOS_C/ubicacion/ubicacion.html'
    };
    if (pages[view]) {
        console.log('📂 Cargando módulo:', pages[view]);
        showFrameLoader();

        // Reset onload anterior
        moduloFrame.onload = null;

        moduloFrame.src = pages[view];

        moduloFrame.onload = function() {
            // Pequeño delay para asegurar que el módulo se pinte antes de ocultar el loader
            setTimeout(function() {
                hideFrameLoader();
                enviarDatosAModulos();
            }, 300);
        };
    } else {
        console.warn('⚠️ Vista no encontrada:', view);
    }
}

// ============================================================
// EVENTOS DEL MENU
// ============================================================
document.querySelectorAll('.bottom-menu .menu-item:not(.ia-item)').forEach(function(btn) {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.bottom-menu .menu-item').forEach(function(b) { b.classList.remove('active'); });
        if (!this.classList.contains('ia-item')) this.classList.add('active');
        if (this.dataset.view) cargarModulo(this.dataset.view);
    });
});

// ============================================================
// MENSAJES DE MODULOS
// ============================================================
window.addEventListener('message', function(event) {
    const data = event.data;
    if (!data || !data.type) return;

    if (data.type === 'REQUEST_DATOS') enviarDatosAModulos();

    if (data.type === 'CAMBIAR_MODULO') {
        if (data.view) {
            cargarModulo(data.view);
            document.querySelectorAll('.bottom-menu .menu-item:not(.ia-item)').forEach(function(b) { b.classList.remove('active'); });
            const btn = document.querySelector('.bottom-menu .menu-item[data-view="' + data.view + '"]');
            if (btn) btn.classList.add('active');
        }
    }

    if (data.type === 'SOLICITAR_DATOS_COMPLETOS') {
        const datosCompletos = construirDatosCompletos();
        if (event.source) {
            event.source.postMessage({
                type: 'DATOS_COMPLETOS_RESPONSE',
                datosCompletos,
                data: DATA_GLOBAL,
                fuelData: DATA_FUEL_GLOBAL
            }, '*');
        }
    }
});

// ============================================================
// INICIALIZACIÓN
// ============================================================
setTimeout(function() {
    sendToAssistant({ type: 'TOGGLE_AUDIO', active: true });
    console.log('🎯 Dashboard listo');

    setTimeout(function() {
        const actualizador = document.getElementById('actualizadorFrame');
        if (actualizador && actualizador.contentWindow) {
            actualizador.contentWindow.postMessage({ type: 'SOLICITAR_DATOS' }, '*');
        }
    }, 2000);
}, 500);

window.addEventListener('beforeunload', function() {
    if (assistantActive) {
        try { notifyActualizador({ type: 'ASISTENTE_CLOSE' }); } catch(e) {}
    }
});