// ============================================================
// FLOTA Y RUTAS - GRUPO GSN
// Dashboard modular con tabla en columna derecha
// ============================================================

// ============================================================
// DATOS GLOBALES
// ============================================================
let DATA = [];
let DATA_FUEL = [];
let lastUpdateTime = null;
let lastUpdateFuelTime = null;
let isFuelView = false;
let isRendering = false;
let pendingUpdate = false;

let fleetChartInstance = null;
let trendChartInstance = null;

// ============================================================
// AUXILIARES
// ============================================================
const N = new Intl.NumberFormat('es-NI', { maximumFractionDigits: 0 });
const M = new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 0 });
const t = function(v) { return String(v ?? '').trim(); };
const n = function(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v === 'string') {
        var parsed = parseFloat(v.replace(/,/g, '').trim());
        return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
};
const fd = function(v) {
    if (!v) return 'Sin fecha';
    var str = String(v).trim();
    var match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        var year = parseInt(match[1]);
        if (year < 1900) return 'Fecha invalida';
        return match[3] + '/' + match[2] + '/' + match[1];
    }
    var d = new Date(str);
    if (!isNaN(d.getTime())) {
        var year = d.getFullYear();
        if (year < 1900) return 'Fecha invalida';
        var dd = String(d.getDate()).padStart(2, '0');
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        return dd + '/' + mm + '/' + year;
    }
    return str;
};
const sum = function(a, k) { return a.reduce(function(s, o) { return s + n(o[k]); }, 0); };

const COLUMN_LETTERS = {
    'fecha': 'B', 'cliente': 'C', 'combustible': 'D', 'destino': 'E',
    'solicitado': 'H', 'despachado': 'R', 'subtotalVenta': 'AC',
    'margenBruto': 'AE', 'facturaGSN': 'AD', 'conductor': 'S',
    'placaEntrega': 'Q', 'flota': 'P', 'pedidoPuma': 'I',
    'cisternaPickup': 'O'
};

const MESES_ORDER = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

function getLocation(rowIndex, fieldName) {
    var colLetter = COLUMN_LETTERS[fieldName] || '?';
    return { row: rowIndex, col: colLetter, cell: colLetter + rowIndex };
}

// ============================================================
// TOAST
// ============================================================
let toastTimeout = null;

function showToast(message, type, duration) {
    var toast = document.getElementById('toast');
    var icon = document.getElementById('toastIcon');
    var msg = document.getElementById('toastMessage');
    if (!toast) return;

    toast.className = 'toast';
    icon.textContent = type === 'success' ? '✅' : type === 'error' ? '❌' : '⏳';
    msg.textContent = message;

    if (type === 'success') toast.classList.add('success');
    else if (type === 'error') toast.classList.add('error');
    else if (type === 'loading') toast.classList.add('loading');

    toast.classList.add('show');

    if (toastTimeout) clearTimeout(toastTimeout);
    if (duration) {
        toastTimeout = setTimeout(function() { hideToast(); }, duration);
    }
}

function hideToast() {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.classList.remove('show');
    if (toastTimeout) { clearTimeout(toastTimeout); toastTimeout = null; }
}

// ============================================================
// TOOLTIP
// ============================================================
function showInfoTooltip(title, subtitle, content, extraData) {
    var tooltip = document.getElementById('infoTooltip');
    var titleEl = document.getElementById('ttTitle');
    var bodyEl = document.getElementById('ttContent');
    if (!tooltip || !titleEl || !bodyEl) return;

    titleEl.textContent = title || 'Informacion';

    var html = '';
    if (subtitle) html += '<div style="color:var(--txt-muted);font-size:12px;margin-bottom:6px;">' + subtitle + '</div>';
    if (content) html += '<div>' + content + '</div>';

    if (extraData) {
        if (extraData.locations && extraData.locations.length > 0) {
            html += '<div class="location-box"><div style="margin-bottom:4px;"><span class="loc-label" style="color:var(--neon-amber);font-weight:600;">📍 Ubicacion en la hoja de calculo</span></div><div class="error-list">';
            extraData.locations.slice(0, 15).forEach(function(loc) {
                html += '<div class="err-item"><span class="err-location">Fila ' + loc.row + '</span><span class="err-detail">Columna <strong style="color:var(--neon-sky);">' +
                    loc.col + '</strong> → ' + loc.description + '</span></div>';
            });
            if (extraData.locations.length > 15) {
                html += '<div class="err-item"><span class="err-location">...</span><span class="err-detail">+' + (extraData.locations.length - 15) + ' mas</span></div>';
            }
            html += '</div></div>';
        }

        html += '<div class="section"><div class="section-title">🔧 Detalles tecnicos</div>';
        if (extraData.formula) html += '<div class="code-block">' + extraData.formula + '</div>';
        if (extraData.explanation) html += '<div style="margin-top:4px;color:var(--txt-muted);font-size:11px;">' + extraData.explanation + '</div>';
        if (extraData.fields && extraData.fields.length > 0) {
            html += '<div style="margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;">';
            extraData.fields.forEach(function(f) {
                html += '<div><span style="color:var(--txt-muted);">' + f.label + ':</span> <span style="color:var(--neon-sky);font-weight:500;">' + f.value + '</span></div>';
            });
            html += '</div>';
        }
        if (extraData.solution) {
            html += '<div style="margin-top:8px;padding:8px 12px;background:rgba(56,189,248,0.04);border-radius:var(--radius-sm);border-left:3px solid var(--neon-sky);"><span style="color:var(--neon-amber);font-weight:600;">💡 Solucion:</span><span style="color:var(--txt-primary);font-size:11px;">' + extraData.solution + '</span></div>';
        }
        if (extraData.error) {
            html += '<div style="margin-top:8px;padding:8px 12px;background:rgba(255,84,112,0.04);border-radius:var(--radius-sm);border-left:3px solid var(--neon-red);"><span style="color:var(--neon-red);font-weight:600;">❌ Error identificado:</span><span style="color:var(--txt-primary);font-size:11px;">' + extraData.error + '</span></div>';
        }
        html += '</div>';
    }

    var timeStr = lastUpdateTime ? lastUpdateTime.toLocaleString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--/--/---- --:--:--';
    html += '<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(56,189,248,0.08);font-size:9px;color:var(--txt-muted);">🔄 Datos actualizados: ' + timeStr + '</div>';

    bodyEl.innerHTML = html;
    tooltip.classList.add('visible');
}

function hideInfoTooltip() {
    var el = document.getElementById('infoTooltip');
    if (el) el.classList.remove('visible');
}

document.addEventListener('click', function(e) {
    var tooltip = document.getElementById('infoTooltip');
    if (!tooltip || !tooltip.classList.contains('visible')) return;
    if (!tooltip.contains(e.target) &&
        !e.target.closest('.kpi-item') &&
        !e.target.closest('.panel') &&
        !e.target.closest('.alert') &&
        !e.target.closest('.source-badge')) {
        hideInfoTooltip();
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') hideInfoTooltip();
});

// ============================================================
// FILTROS
// ============================================================
var state = { period: 'Todos', client: 'Todos', fuel: 'Todos', fleet: 'Todas', q: '', page: 1 };
var activeView = 'fleet';
var savedScrollTop = 0;

function getUniqueValues(data, key) {
    if (!data || !Array.isArray(data) || data.length === 0) return [];
    var values = new Set();
    data.forEach(function(item) {
        var val = t(item[key]);
        if (val && val !== '' && val !== 'null' && val !== 'undefined') values.add(val);
    });
    return Array.from(values).sort();
}

function getUniquePeriods(data, dataFuel) {
    var periods = new Set();
    if (data && Array.isArray(data)) {
        data.forEach(function(item) {
            var mes = t(item.mes);
            if (mes && mes !== '' && mes !== 'null' && mes !== 'undefined') periods.add(mes);
        });
    }
    if (dataFuel && Array.isArray(dataFuel)) {
        dataFuel.forEach(function(item) {
            var mes = t(item.mes);
            if (mes && mes !== '' && mes !== 'null' && mes !== 'undefined') periods.add(mes);
        });
    }
    return Array.from(periods).sort(function(a, b) { return MESES_ORDER.indexOf(a) - MESES_ORDER.indexOf(b); });
}

function fill(id, vals, all) {
    var e = document.getElementById(id);
    if (!e) return;
    var currentVal = e.value;
    var options = all ? [all] : [];
    vals.forEach(function(v) {
        if (v && v !== '' && v !== 'null' && v !== 'undefined') options.push(v);
    });
    e.innerHTML = options.map(function(v) { return '<option value="' + v + '">' + v + '</option>'; }).join('');
    if (currentVal && Array.from(e.options).some(function(o) { return o.value === currentVal; })) {
        e.value = currentVal;
    } else if (options.length > 0) {
        e.selectedIndex = 0;
    }
}

function refillFilters() {
    var current = { ...state };
    if (DATA && DATA.length > 0) {
        var periodos = getUniquePeriods(DATA, DATA_FUEL);
        var clientes = getUniqueValues(DATA, 'cliente');
        var combustibles = getUniqueValues(DATA, 'combustible');
        var flotas = getUniqueValues(DATA, 'flota');

        fill('period', periodos, 'Todos');
        fill('client', clientes, 'Todos');
        fill('fuel', combustibles, 'Todos');
        fill('fleet', flotas, 'Todas');

        ['period', 'client', 'fuel', 'fleet'].forEach(function(id) {
            var e = document.getElementById(id);
            if (e && current[id] && Array.from(e.options).some(function(x) { return x.value === current[id]; })) {
                e.value = current[id];
            } else if (e && e.options.length > 0) {
                e.selectedIndex = 0;
                state[id] = e.value;
            }
        });
    }
}

function filtered() {
    if (isFuelView) return filteredFuel();
    return DATA.filter(function(o) {
        if (state.period !== 'Todos') {
            var mesRegistro = t(o.mes).toLowerCase();
            var mesFiltro = state.period.toLowerCase();
            if (mesRegistro !== mesFiltro && !mesRegistro.includes(mesFiltro)) return false;
        }
        if (state.client !== 'Todos') {
            if (t(o.cliente) !== state.client) return false;
        }
        if (state.fuel !== 'Todos') {
            if (t(o.combustible) !== state.fuel) return false;
        }
        if (state.fleet !== 'Todas') {
            if (t(o.flota) !== state.fleet) return false;
        }
        if (state.q) {
            var searchFields = [o.cliente, o.conductor, o.placaEntrega, o.pedidoPuma, o.facturaGSN, o.combustible, o.flota, o.cisternaPickup];
            var match = searchFields.some(function(v) { return v && String(v).toLowerCase().includes(state.q); });
            if (!match) return false;
        }
        return true;
    });
}

function filteredFuel() {
    var data = DATA_FUEL;
    if (!data || data.length === 0) return [];
    if (state.period !== 'Todos') {
        data = data.filter(function(o) {
            var mes = t(o.mes).toUpperCase();
            return mes === state.period.toUpperCase() || mes.includes(state.period.toUpperCase());
        });
    }
    return data;
}

var groupBy = function(a, key) {
    var m = {};
    a.forEach(function(o) {
        var label = t(o[key]) || 'Sin registrar';
        if (!m[label]) m[label] = [];
        m[label].push(o);
    });
    return Object.entries(m);
};

function getSourceBadgeHTML() {
    var timeStr = lastUpdateTime ? lastUpdateTime.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
    return '<span class="source-badge" onclick="event.stopPropagation();showInfoTooltip(\'Fuente de datos\', \'Google Sheets\', \'Los datos se obtienen automaticamente desde Google Sheets.\', { fields: [{ label: \'Ultima actualizacion\', value: \'' + timeStr + '\' }] })">Google Sheets · ' + timeStr + '</span>';
}

function getFuelSourceBadgeHTML() {
    var timeStr = lastUpdateFuelTime ? lastUpdateFuelTime.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
    return '<span class="source-badge" style="border-color:rgba(255,183,77,0.3);color:var(--neon-amber);background:rgba(255,183,77,0.06);" onclick="event.stopPropagation();showInfoTooltip(\'Fuente de datos Fuel Oil\', \'Google Sheets\', \'Los datos de Fuel Oil se obtienen del archivo FUEL OIL 2026.xlsx.\', { fields: [{ label: \'Ultima actualizacion\', value: \'' + timeStr + '\' }] })">Fuel Oil · ' + timeStr + '</span>';
}

function showKPIInfo(label, value, pct) {
    var kpiMap = {
        'Placas utilizadas': { formula: 'COUNT(DISTINCT Placa)', explanation: 'Numero unico de placas que realizaron entregas en el periodo.' },
        'Viajes registrados': { formula: 'COUNT(registros)', explanation: 'Numero total de viajes/entregas registrados.' },
        'Galones transportados': { formula: 'Suma(Despachado)', explanation: 'Suma total de galones despachados en el periodo.' },
        'Conductores': { formula: 'COUNT(DISTINCT Conductor)', explanation: 'Numero unico de conductores que realizaron entregas.' },
        'Promedio por viaje': { formula: 'Galones / Viajes', explanation: 'Promedio de galones transportados por viaje.' },
        'Promedio por placa': { formula: 'Galones / Placas', explanation: 'Promedio de galones transportados por placa.' },
        'Placas Fuel': { formula: 'COUNT(DISTINCT Placa Cisterna)', explanation: 'Numero unico de placas en viajes Fuel Oil.' },
        'Volumen Fuel': { formula: 'Suma(Volumen)', explanation: 'Volumen total de Fuel Oil transportado.' }
    };
    var info = kpiMap[label] || { formula: 'Sin informacion', explanation: 'Este KPI se calcula a partir de los datos de la hoja de calculo.' };
    var extraFields = [{ label: 'Valor', value: value }];
    if (pct) extraFields.push({ label: 'Porcentaje', value: pct });
    showInfoTooltip('KPI: ' + label, 'Valor actual: ' + value + (pct ? ' (' + pct + ')' : ''), '', {
        formula: info.formula, explanation: info.explanation, fields: extraFields
    });
}

// ============================================================
// GRÁFICAS
// ============================================================
function renderCharts(a, fuelData) {
    // Top placas por volumen
    var groups = groupBy(a, 'placaEntrega').map(function(item) {
        return {
            placa: item[0] || 'Sin placa',
            gallons: sum(item[1], 'despachado'),
            trips: item[1].length
        };
    }).sort(function(x, y) { return y.gallons - x.gallons; });

    var topPlacas = groups.slice(0, 8);

    var ctx1 = document.getElementById('fleetChart');
    if (ctx1) {
        if (fleetChartInstance) fleetChartInstance.destroy();

        var colors = topPlacas.map(function(p, i) {
            var hue = 190 + i * 10;
            return 'hsla(' + hue + ', 85%, 60%, 0.85)';
        });
        var borders = topPlacas.map(function(p, i) {
            var hue = 190 + i * 10;
            return 'hsla(' + hue + ', 85%, 65%, 1)';
        });

        fleetChartInstance = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: topPlacas.map(function(p) { return p.placa; }),
                datasets: [{
                    label: 'Galones',
                    data: topPlacas.map(function(p) { return p.gallons; }),
                    backgroundColor: colors,
                    borderColor: borders,
                    borderWidth: 1.5,
                    borderRadius: 5,
                    barPercentage: 0.65
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(4,18,30,0.96)',
                        titleColor: '#edf9ff',
                        bodyColor: '#8bb8d0',
                        borderColor: 'rgba(56,189,248,0.3)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                var p = topPlacas[context.dataIndex];
                                return ['Galones: ' + N.format(context.parsed.x), 'Viajes: ' + p.trips];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(56,189,248,0.05)', drawTicks: false },
                        ticks: {
                            color: '#8bb8d0',
                            font: { size: 7, family: 'Inter' },
                            callback: function(v) { return N.format(v); }
                        },
                        beginAtZero: true
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: '#8bb8d0', font: { size: 8, family: 'Inter' } }
                    }
                },
                interaction: { intersect: false, mode: 'index' }
            }
        });
    }

    // Radar actividad
    var ctx2 = document.getElementById('trendChart');
    if (ctx2) {
        var activePlacas = groups.filter(function(g) { return g.trips >= 2; }).slice(0, 7);

        if (trendChartInstance) trendChartInstance.destroy();

        var maxTrips = Math.max.apply(null, activePlacas.map(function(p) { return p.trips; }).concat([1]));

        trendChartInstance = new Chart(ctx2, {
            type: 'radar',
            data: {
                labels: activePlacas.map(function(p) { return p.placa; }),
                datasets: [{
                    label: 'Viajes',
                    data: activePlacas.map(function(p) { return p.trips; }),
                    backgroundColor: 'rgba(56,189,248,0.15)',
                    borderColor: '#38bdf8',
                    pointBackgroundColor: '#818cf8',
                    pointBorderColor: '#04121e',
                    pointBorderWidth: 2,
                    pointRadius: 3.5,
                    pointHoverRadius: 6,
                    borderWidth: 2
                }, {
                    label: 'Galones (x100)',
                    data: activePlacas.map(function(p) { return p.gallons / 100; }),
                    backgroundColor: 'rgba(129,140,248,0.08)',
                    borderColor: '#818cf8',
                    pointBackgroundColor: '#06b6d4',
                    pointBorderColor: '#04121e',
                    pointBorderWidth: 2,
                    pointRadius: 2.5,
                    pointHoverRadius: 5,
                    borderWidth: 1.5,
                    borderDash: [3, 3]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#edf9ff',
                            font: { size: 7, family: 'Inter' },
                            padding: 6,
                            usePointStyle: true,
                            pointStyleWidth: 6,
                            boxWidth: 6
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(4,18,30,0.96)',
                        titleColor: '#edf9ff',
                        bodyColor: '#8bb8d0',
                        borderColor: 'rgba(56,189,248,0.3)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                if (context.dataset.label === 'Viajes') {
                                    return 'Viajes: ' + context.parsed.r;
                                }
                                return 'Galones: ' + N.format(context.parsed.r * 100);
                            }
                        }
                    }
                },
                scales: {
                    r: {
                        angleLines: { color: 'rgba(56,189,248,0.1)' },
                        grid: { color: 'rgba(56,189,248,0.08)' },
                        pointLabels: {
                            color: '#8bb8d0',
                            font: { size: 7, family: 'Inter' }
                        },
                        ticks: {
                            color: '#8bb8d0',
                            font: { size: 6, family: 'Inter' },
                            backdropColor: 'transparent',
                            stepSize: Math.max(1, Math.ceil(maxTrips / 4))
                        },
                        suggestedMin: 0,
                        suggestedMax: maxTrips + 1
                    }
                },
                interaction: { intersect: false, mode: 'index' }
            }
        });
    }
}

// ============================================================
// RENDER KPIs
// ============================================================
function renderKPIs(a, fuelData) {
    var groups = groupBy(a, 'placaEntrega');
    var totalGalones = sum(a, 'despachado');
    var totalViajes = a.length;
    var placasUnicas = groups.length;
    var conductoresUnicos = new Set(a.map(function(o) { return t(o.conductor); }).filter(Boolean)).size;
    var promedioViaje = totalViajes ? totalGalones / totalViajes : 0;

    var generalKpis = [
        { label: 'Placas utilizadas', value: N.format(placasUnicas), pct: null, icon: '🚛' },
        { label: 'Viajes registrados', value: N.format(totalViajes), pct: null, icon: '📋' },
        { label: 'Galones transportados', value: N.format(totalGalones), pct: null, icon: '⛽' },
        { label: 'Conductores', value: N.format(conductoresUnicos), pct: null, icon: '👤' }
    ];

    var fuelPlacas = groupBy(fuelData, 'placaCisterna').length;
    var fuelVolumen = fuelData.reduce(function(s, o) { return s + n(o.volumen); }, 0);
    var fuelViajes = fuelData.length;
    var promedioPlaca = placasUnicas ? totalGalones / placasUnicas : 0;

    var fleetKpis = [
        { label: 'Promedio por viaje', value: N.format(promedioViaje) + ' gal', pct: null, icon: '📊' },
        { label: 'Promedio por placa', value: N.format(promedioPlaca) + ' gal', pct: null, icon: '🚛' },
        { label: 'Placas Fuel', value: N.format(fuelPlacas), pct: null, icon: '🛢️' },
        { label: 'Volumen Fuel', value: N.format(fuelVolumen) + ' gal', pct: null, icon: '⛽' }
    ];

    var fleetGrid = document.getElementById('fleetKpisGrid');
    var generalGrid = document.getElementById('generalKpisGrid');

    if (fleetGrid) {
        fleetGrid.innerHTML = fleetKpis.map(function(k) {
            var pctHtml = k.pct ? '<span class="value-pct">' + k.pct + '</span>' : '';
            return '<div class="kpi-item fleet-item" onclick="showKPIInfo(\'' + k.label + '\', \'' + k.value + '\', \'' + (k.pct || '') + '\')">' +
                '<span class="kpi-icon">' + k.icon + '</span>' +
                '<div class="kpi-value"><span class="value-main">' + k.value + '</span>' + pctHtml + '</div>' +
                '<span class="kpi-label">' + k.label + '</span></div>';
        }).join('');
    }

    if (generalGrid) {
        generalGrid.innerHTML = generalKpis.map(function(k) {
            var pctHtml = k.pct ? '<span class="value-pct">' + k.pct + '</span>' : '';
            return '<div class="kpi-item" onclick="showKPIInfo(\'' + k.label + '\', \'' + k.value + '\', \'' + (k.pct || '') + '\')">' +
                '<span class="kpi-icon">' + k.icon + '</span>' +
                '<div class="kpi-value"><span class="value-main">' + k.value + '</span>' + pctHtml + '</div>' +
                '<span class="kpi-label">' + k.label + '</span></div>';
        }).join('');
    }
}

// ============================================================
// RENDER PANEL UNIFICADO
// ============================================================
function renderUnifiedPanel(a, fuelData) {
    var sourceBadge = getSourceBadgeHTML();
    var fuelSourceBadge = getFuelSourceBadgeHTML();

    var groups = groupBy(a, 'placaEntrega').map(function(item) {
        return {
            k: item[0] || 'Sin placa',
            gallons: sum(item[1], 'despachado'),
            trips: item[1].length
        };
    }).sort(function(x, y) { return y.gallons - x.gallons; });

    var fuelPlacas = [];
    if (fuelData && fuelData.length > 0) {
        fuelPlacas = groupBy(fuelData, 'placaCisterna').map(function(item) {
            return {
                placa: item[0] || 'Sin placa',
                volumen: sum(item[1], 'volumen'),
                viajes: item[1].length
            };
        }).sort(function(x, y) { return y.volumen - x.volumen; });
    }

    var fulfillEl = document.getElementById('fulfill');
    if (fulfillEl) {
        var fuelHtml = '';
        if (fuelPlacas.length > 0) {
            fuelHtml = fuelPlacas.slice(0, 4).map(function(x) {
                return '<div class="product-item fuel-item"><div class="p-name">🛢️ ' + x.placa +
                    '</div><div class="p-value"><b>' + N.format(x.volumen) + '</b> gal · ' + x.viajes + ' viajes</div></div>';
            }).join('');
        } else {
            fuelHtml = '<div style="color:var(--txt-muted);font-size:10px;padding:4px 0;">Sin datos Fuel Oil</div>';
        }

        var placasHtml = groups.slice(0, 4).map(function(x) {
            return '<div class="product-item"><div class="p-name">🚛 ' + x.k +
                '</div><div class="p-value"><b>' + N.format(x.gallons) + '</b> gal · ' + x.trips + ' viajes</div></div>';
        }).join('');

        fulfillEl.innerHTML =
            '<div class="title"><div><h2>🚛 Flota · Placas destacadas</h2><small>Fuel Oil · Combustible</small></div><div>' +
            fuelSourceBadge + ' ' + sourceBadge + '</div></div>' +
            '<div class="fulfill-body" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
            '<div><div class="section-title" style="color:var(--neon-amber);border-bottom-color:rgba(255,183,77,0.15);">🛢️ Fuel Oil · Placas</div>' +
            '<div class="product-grid">' + fuelHtml + '</div></div>' +
            '<div><div class="section-title" style="color:var(--neon-sky);border-bottom-color:rgba(56,189,248,0.15);">🚛 Combustible · Placas</div>' +
            '<div class="product-grid">' + placasHtml + '</div></div>' +
            '</div>';
    }

    // Alerts
    var allAlertItems = [];

    var noPlacaOps = a.filter(function(o) { return !t(o.placaEntrega) && !t(o.cisternaPickup); });
    var noPlacaLocations = noPlacaOps.map(function(o) {
        var loc = getLocation(o._rowIndex || 0, 'placaEntrega');
        return { row: loc.row, col: loc.col, description: 'Cliente: ' + t(o.cliente) + ' | Pedido: ' + t(o.pedidoPuma) };
    });

    var noDriverOps = a.filter(function(o) { return !t(o.conductor); });
    var noDriverLocations = noDriverOps.map(function(o) {
        var loc = getLocation(o._rowIndex || 0, 'conductor');
        return { row: loc.row, col: loc.col, description: 'Cliente: ' + t(o.cliente) + ' | Placa: ' + t(o.placaEntrega || o.cisternaPickup || '') };
    });

    if (noPlacaOps.length > 0) {
        allAlertItems.push({
            label: '🚛 Sin placa', value: noPlacaOps.length,
            detail: 'Operaciones sin placa registrada',
            locations: noPlacaLocations,
            fields: [{ label: 'Total operaciones', value: a.length }],
            solution: 'Registrar la placa en "PLACA ENTREGA" o "NO PLACA CISTERNA PICK UP".',
            isFuel: false, isFleet: true
        });
    }

    if (noDriverOps.length > 0) {
        allAlertItems.push({
            label: '👤 Sin conductor', value: noDriverOps.length,
            detail: 'Operaciones sin conductor registrado',
            locations: noDriverLocations,
            fields: [{ label: 'Total operaciones', value: a.length }],
            solution: 'Completar el nombre del conductor en "NOMBRE CONDUCTOR".',
            isFuel: false, isFleet: true
        });
    }

    if (fuelData && fuelData.length > 0) {
        var fuelNoPlaca = fuelData.filter(function(o) { return !t(o.placaCisterna); });
        if (fuelNoPlaca.length > 0) {
            var locations = fuelNoPlaca.map(function(o) {
                return { row: o._rowIndex || 0, col: 'PLACA CISTERNA', description: 'Conductor: ' + t(o.conductor) };
            });
            allAlertItems.push({
                label: '🚛 Sin placa (Fuel)', value: fuelNoPlaca.length,
                detail: 'Viajes Fuel Oil sin placa',
                locations: locations,
                isFuel: true, isFleet: true
            });
        }
    }

    var alertsEl = document.getElementById('alerts');
    if (alertsEl) {
        var html = '<div class="title"><h2>⚠️ Alertas de Flota</h2><div>' + fuelSourceBadge + ' ' + sourceBadge + '</div></div>';
        html += '<div class="alerts-scroll">';

        var fuelItems = allAlertItems.filter(function(x) { return x.isFuel; });
        if (fuelItems.length > 0) {
            html += '<div style="font-size:8px;color:var(--neon-amber);font-weight:700;text-transform:uppercase;letter-spacing:1.2px;margin:4px 0 5px 0;"><span class="footer-dot orange"></span> Fuel Oil (' + fuelItems.length + ')</div>';
            html += fuelItems.map(function(x) {
                return '<div class="alert fuel-alert" data-alert="' + x.label + '" data-value="' + x.value +
                    '" data-locations=\'' + JSON.stringify(x.locations || []) + '\'><i>🛢️</i>' +
                    '<div style="flex:1;"><b>' + x.label + '</b><span class="source-tag fuel-tag">🛢️ Fuel</span>' +
                    '<span>' + x.detail + '</span></div>' +
                    '<span class="alert-badge fuel-badge">' + x.value + ' casos</span></div>';
            }).join('');
        }

        var fleetItems = allAlertItems.filter(function(x) { return !x.isFuel && x.isFleet; });
        if (fuelItems.length > 0 && fleetItems.length > 0) {
            html += '<div class="alert-divider"><span class="divider-icon">🚛</span><span class="divider-text">Flota General</span><span class="divider-line"></span></div>';
        }
        if (fleetItems.length > 0) {
            if (fuelItems.length === 0) {
                html += '<div style="font-size:8px;color:var(--neon-sky);font-weight:700;text-transform:uppercase;letter-spacing:1.2px;margin:4px 0 5px 0;"><span class="footer-dot sky"></span> Flota (' + fleetItems.length + ')</div>';
            }
            html += fleetItems.map(function(x) {
                var icon = x.label.includes('placa') ? '🚛' : '👤';
                return '<div class="alert fleet-alert" data-alert="' + x.label + '" data-value="' + x.value +
                    '" data-locations=\'' + JSON.stringify(x.locations || []) + '\'><i>' + icon + '</i>' +
                    '<div style="flex:1;"><b>' + x.label + '</b><span class="source-tag general-tag">📊 General</span>' +
                    '<span>' + x.detail + '</span></div>' +
                    '<span class="alert-badge fleet-badge">' + x.value + ' casos</span></div>';
            }).join('');
        }

        if (allAlertItems.length === 0) {
            html += '<div style="padding:24px;text-align:center;color:var(--neon-green);">✅ Sin alertas para el período seleccionado</div>';
        }

        html += '</div>';
        html += '<div class="alerts-footer"><span class="footer-dot orange"></span> Fuel Oil<span class="footer-sep">·</span><span class="footer-dot sky"></span> Flota<span class="footer-sep">·</span>Haz clic para detalles</div>';
        alertsEl.innerHTML = html;
    }

    document.querySelectorAll('#alerts .alert').forEach(function(el) {
        el.onclick = function() {
            var label = this.dataset.alert;
            var value = parseInt(this.dataset.value) || 0;
            var locations = JSON.parse(this.dataset.locations || '[]');
            var alertData = allAlertItems.find(function(x) { return x.label === label; });
            showInfoTooltip('Alerta: ' + label, value + ' casos identificados',
                'Hay <span class="highlight">' + value + '</span> operaciones con ' + label.toLowerCase() + '.',
                { locations: locations.slice(0, 15), error: alertData?.detail || 'Informacion pendiente',
                  solution: alertData?.solution || 'Revisar los datos en la hoja de calculo.',
                  fields: alertData?.fields || [] });
        };
    });
}

// ============================================================
// RENDER TABLA
// ============================================================
function renderTable(a, ps) {
    var groups = groupBy(a, 'placaEntrega').map(function(item) {
        var k = item[0], v = item[1];
        var latest = v.reduce(function(latest, o) {
            var d = new Date(o.fecha);
            return d > latest ? d : latest;
        }, new Date(0));
        return {
            k: k || 'Sin placa',
            trips: v.length,
            gallons: sum(v, 'despachado'),
            driver: t(v.find(function(o) { return t(o.conductor); })?.conductor || ''),
            fleet: t(v.find(function(o) { return t(o.flota); })?.flota || ''),
            lastDate: latest,
            clients: Array.from(new Set(v.map(function(o) { return t(o.cliente); }).filter(Boolean)))
        };
    }).sort(function(x, y) { return y.gallons - x.gallons; });

    var wrapper = document.getElementById('tableWrapper');
    var tbody = document.getElementById('rows');
    if (!tbody) return;

    if (wrapper) savedScrollTop = wrapper.scrollTop;

    var pages = Math.max(1, Math.ceil(groups.length / ps));
    state.page = Math.min(state.page, pages);
    var rows = groups.slice((state.page - 1) * ps, state.page * ps);

    var html = rows.map(function(x) {
        var avg = x.trips ? x.gallons / x.trips : 0;
        var clients = x.clients.slice(0, 3).join(', ') + (x.clients.length > 3 ? ' +' + (x.clients.length - 3) : '');
        return '<tr><td><b>' + x.k + '</b></td>' +
            '<td>' + x.fleet + '</td>' +
            '<td>' + x.driver + '</td>' +
            '<td>' + x.trips + '</td>' +
            '<td>' + N.format(x.gallons) + '</td>' +
            '<td>' + N.format(avg) + '</td>' +
            '<td>' + fd(x.lastDate) + '</td>' +
            '<td><small>' + clients + '</small></td></tr>';
    }).join('');

    tbody.innerHTML = html;

    var countEl = document.getElementById('count');
    if (countEl) countEl.textContent = N.format(groups.length) + ' placas encontradas';

    var showingEl = document.getElementById('showing');
    if (showingEl) showingEl.textContent = 'Mostrando ' + (groups.length ? (state.page - 1) * ps + 1 : 0) + '–' + Math.min(state.page * ps, groups.length) + ' de ' + groups.length;

    var pageEl = document.getElementById('page');
    if (pageEl) pageEl.textContent = state.page + ' / ' + pages;

    if (wrapper && savedScrollTop > 0 && savedScrollTop < wrapper.scrollHeight) {
        wrapper.scrollTop = savedScrollTop;
    }
}

// ============================================================
// EXPORTACIÓN
// ============================================================
function obtenerDatosExportacion() {
    var a = filtered();
    var headers = ['Placa', 'Flota', 'Conductor', 'Viajes', 'Galones', 'Promedio/viaje', 'Última operación', 'Clientes'];

    var groups = groupBy(a, 'placaEntrega').map(function(item) {
        var k = item[0], v = item[1];
        var latest = v.reduce(function(latest, o) {
            var d = new Date(o.fecha);
            return d > latest ? d : latest;
        }, new Date(0));
        return [
            k || 'Sin placa',
            t(v.find(function(o) { return t(o.flota); })?.flota || ''),
            t(v.find(function(o) { return t(o.conductor); })?.conductor || ''),
            v.length,
            sum(v, 'despachado'),
            v.length ? sum(v, 'despachado') / v.length : 0,
            fd(latest),
            Array.from(new Set(v.map(function(o) { return t(o.cliente); }).filter(Boolean))).join(', ')
        ];
    }).sort(function(x, y) { return y[4] - x[4]; });

    var totalGalones = sum(a, 'despachado');

    return {
        view: 'Flota y Rutas',
        headers: headers,
        rows: groups.slice(0, 500),
        totalRows: groups.length,
        filters: { period: state.period, client: state.client, fuel: state.fuel, fleet: state.fleet },
        totals: {
            placas: groups.length,
            viajes: a.length,
            galones: totalGalones,
            promedioViaje: a.length ? totalGalones / a.length : 0
        }
    };
}

function exportarExcel() {
    var dataToSend = obtenerDatosExportacion();
    showToast('Generando Excel...', 'loading');

    fetch('/api/export/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend)
    })
    .then(function(response) {
        if (!response.ok) return response.json().then(function(err) { throw new Error(err.error || 'Error al generar Excel'); });
        return response.blob();
    })
    .then(function(blob) {
        var url = window.URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        var now = new Date();
        var fechaStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + '_' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
        link.download = 'GSN_FlotaRutas_' + fechaStr + '.xls';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        showToast('✅ Excel exportado correctamente', 'success', 3000);
    })
    .catch(function(error) {
        console.error('Error exportando Excel:', error);
        showToast('❌ Error: ' + error.message, 'error', 4000);
    });
}

function exportarPDF() {
    var dataToSend = obtenerDatosExportacion();
    showToast('Generando PDF...', 'loading');

    fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend)
    })
    .then(function(response) {
        if (!response.ok) return response.json().then(function(err) { throw new Error(err.error || 'Error al generar PDF'); });
        return response.blob();
    })
    .then(function(blob) {
        var url = window.URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        var now = new Date();
        var fechaStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + '_' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
        link.download = 'GSN_FlotaRutas_' + fechaStr + '.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        showToast('✅ PDF exportado correctamente', 'success', 3000);
    })
    .catch(function(error) {
        console.error('Error exportando PDF:', error);
        showToast('❌ Error: ' + error.message, 'error', 4000);
    });
}

// ============================================================
// RENDER PRINCIPAL
// ============================================================
function render() {
    if (isRendering) { pendingUpdate = true; return; }
    isRendering = true;

    try {
        document.getElementById('viewTitle').textContent = 'Flota y Rutas';
        document.getElementById('viewSubtitle').textContent = 'Utilización de placas, conductores y tipos de flota';

        var a = filtered();
        var fuelData = filteredFuel();

        renderKPIs(a, fuelData);
        renderCharts(a, fuelData);
        renderUnifiedPanel(a, fuelData);
        renderTable(a, 100);
    } catch (error) {
        console.error('Error de vista', activeView, error);
        var viewTitle = document.getElementById('viewTitle');
        if (viewTitle) viewTitle.textContent = 'No se pudo cargar esta vista';
        var viewSubtitle = document.getElementById('viewSubtitle');
        if (viewSubtitle) viewSubtitle.textContent = 'Puede cambiar a otro menú o volver a intentarlo';
    }

    isRendering = false;
    if (pendingUpdate) { pendingUpdate = false; render(); }
}

// ============================================================
// EVENTOS
// ============================================================
['period', 'client', 'fuel', 'fleet'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
        el.onchange = function(e) {
            state[id] = e.target.value;
            state.page = 1;
            render();
        };
    }
});

var searchEl = document.getElementById('search');
if (searchEl) {
    searchEl.oninput = function(e) {
        state.q = e.target.value.toLowerCase();
        state.page = 1;
        render();
    };
}

var prevBtn = document.getElementById('prev');
if (prevBtn) {
    prevBtn.onclick = function() { if (state.page > 1) { state.page--; render(); } };
}

var nextBtn = document.getElementById('next');
if (nextBtn) {
    nextBtn.onclick = function() { state.page++; render(); };
}

// ============================================================
// MENSAJES DEL INDEX
// ============================================================
window.addEventListener('message', function(event) {
    var data = event.data;
    if (!data) return;

    if (data.type === 'DATOS_ACTUALIZADOS') {
        DATA = data.data || [];
        DATA_FUEL = data.fuelData || [];
        lastUpdateTime = data.lastUpdate ? new Date(data.lastUpdate) : new Date();
        lastUpdateFuelTime = data.lastUpdateFuel ? new Date(data.lastUpdateFuel) : new Date();

        refillFilters();
        render();

        if (window.parent && window.parent.actualizarEstadoGlobal) {
            var now = new Date();
            window.parent.actualizarEstadoGlobal(
                {
                    time: lastUpdateTime.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    date: lastUpdateTime.toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                    registros: DATA.length || '0'
                },
                {
                    time: lastUpdateFuelTime.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    date: lastUpdateFuelTime.toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                    registros: DATA_FUEL.length || '0'
                }
            );
        }
    }

    if (data.type === 'requestStatus') {
        var now = new Date();
        if (window.parent && window.parent.actualizarEstadoGlobal) {
            window.parent.actualizarEstadoGlobal(
                {
                    time: lastUpdateTime ? lastUpdateTime.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : now.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    date: lastUpdateTime ? lastUpdateTime.toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' }) : now.toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                    registros: DATA.length || '0'
                },
                {
                    time: lastUpdateFuelTime ? lastUpdateFuelTime.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : now.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    date: lastUpdateFuelTime ? lastUpdateFuelTime.toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' }) : now.toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                    registros: DATA_FUEL.length || '0'
                }
            );
        }
    }
});

// ============================================================
// SOLICITAR DATOS
// ============================================================
function solicitarDatos() {
    if (window.parent && window.parent.postMessage) {
        window.parent.postMessage({ type: 'REQUEST_DATOS', view: 'fleet' }, '*');
    }
}

window.showInfoTooltip = showInfoTooltip;
window.hideInfoTooltip = hideInfoTooltip;
window.render = render;
window.showKPIInfo = showKPIInfo;
window.solicitarDatos = solicitarDatos;
window.exportarExcel = exportarExcel;
window.exportarPDF = exportarPDF;
window.showToast = showToast;
window.hideToast = hideToast;

setTimeout(function() { solicitarDatos(); }, 500);

console.log('✅ Módulo Flota y Rutas cargado · Tabla en columna derecha · Estilo Futurista');