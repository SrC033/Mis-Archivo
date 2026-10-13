// ============================================================
// VOLÚMENES - GRUPO GSN
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

let fuelChartInstance = null;
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
    'placaEntrega': 'Q', 'flota': 'P', 'pedidoPuma': 'I'
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
                html += '<div class="err-item"><span class="err-location">Fila ' + loc.row + '</span><span class="err-detail">Columna <strong style="color:var(--neon-teal);">' +
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
                html += '<div><span style="color:var(--txt-muted);">' + f.label + ':</span> <span style="color:var(--neon-teal);font-weight:500;">' + f.value + '</span></div>';
            });
            html += '</div>';
        }
        if (extraData.solution) {
            html += '<div style="margin-top:8px;padding:8px 12px;background:rgba(15,240,212,0.04);border-radius:var(--radius-sm);border-left:3px solid var(--neon-teal);"><span style="color:var(--neon-amber);font-weight:600;">💡 Solucion:</span><span style="color:var(--txt-primary);font-size:11px;">' + extraData.solution + '</span></div>';
        }
        if (extraData.error) {
            html += '<div style="margin-top:8px;padding:8px 12px;background:rgba(255,84,112,0.04);border-radius:var(--radius-sm);border-left:3px solid var(--neon-red);"><span style="color:var(--neon-red);font-weight:600;">❌ Error identificado:</span><span style="color:var(--txt-primary);font-size:11px;">' + extraData.error + '</span></div>';
        }
        html += '</div>';
    }

    var timeStr = lastUpdateTime ? lastUpdateTime.toLocaleString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--/--/---- --:--:--';
    html += '<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(15,240,212,0.08);font-size:9px;color:var(--txt-muted);">🔄 Datos actualizados: ' + timeStr + '</div>';

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
var activeView = 'volumes';
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
            var searchFields = [o.cliente, o.conductor, o.placaEntrega, o.pedidoPuma, o.facturaGSN, o.combustible, o.flota];
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
        'Volumen solicitado': { formula: 'Suma(Solicitado)', explanation: 'Suma total de galones solicitados por los clientes en el periodo seleccionado.' },
        'Volumen despachado': { formula: 'Suma(Despachado)', explanation: 'Suma total de galones efectivamente entregados en el periodo seleccionado.' },
        'Volumen pendiente': { formula: 'Suma(Solicitado - Despachado)', explanation: 'Suma total de galones pendientes de despachar.' },
        'Cumplimiento': { formula: 'Suma(Despachado) / Suma(Solicitado) * 100', explanation: 'Porcentaje de cumplimiento de entregas.' },
        'Volumen Total Fuel': { formula: 'Suma(Volumen)', explanation: 'Suma total de galones de Fuel Oil transportados.' },
        'Venta Total Fuel': { formula: 'Suma(SUB TOTAL VENTA)', explanation: 'Suma total de ventas de Fuel Oil.' },
        'Margen Fuel': { formula: 'Suma(MARGEN)', explanation: 'Margen total de Fuel Oil.' },
        'Viajes Fuel': { formula: 'COUNT(registros)', explanation: 'Numero total de viajes de Fuel Oil.' }
    };
    var info = kpiMap[label] || { formula: 'Sin informacion', explanation: 'Este KPI se calcula a partir de los datos de la hoja de calculo.' };
    var extraFields = [{ label: 'Valor', value: value }];
    if (pct) extraFields.push({ label: 'Porcentaje', value: pct });
    showInfoTooltip('KPI: ' + label, 'Valor actual: ' + value + (pct ? ' (' + pct + ')' : ''), '', {
        formula: info.formula, explanation: info.explanation, fields: extraFields
    });
}

// ============================================================
// GRÁFICAS (mini)
// ============================================================
function renderCharts(a, fuelData) {
    // Distribución por combustible
    var fuels = groupBy(a, 'combustible').map(function(item) {
        return { label: item[0], value: sum(item[1], 'despachado') };
    }).sort(function(x, y) { return y.value - x.value; });

    if (fuelData && fuelData.length > 0) {
        var fuelOilTotal = sum(fuelData, 'volumen');
        if (fuelOilTotal > 0) fuels.push({ label: 'Fuel Oil', value: fuelOilTotal });
    }

    var colors = ['#0ff0d4', '#4df0ff', '#ffb74d', '#ff5470', '#5affa0', '#b56eff', '#ff5fd2', '#8bb8d0'];

    var ctx1 = document.getElementById('fuelChart');
    if (ctx1) {
        if (fuelChartInstance) fuelChartInstance.destroy();
        fuelChartInstance = new Chart(ctx1, {
            type: 'doughnut',
            data: {
                labels: fuels.map(function(f) { return f.label; }),
                datasets: [{
                    data: fuels.map(function(f) { return f.value; }),
                    backgroundColor: colors.slice(0, fuels.length),
                    borderColor: 'rgba(4,18,30,0.9)',
                    borderWidth: 2,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#edf9ff',
                            font: { size: 8, family: 'Inter' },
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
                        borderColor: 'rgba(15,240,212,0.3)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 8,
                        callbacks: {
                            label: function(context) {
                                var total = context.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                                var pct = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                                return context.label + ': ' + N.format(context.parsed) + ' gal (' + pct + '%)';
                            }
                        }
                    }
                }
            }
        });
    }

    // Tendencia diaria
    var ctx2 = document.getElementById('trendChart');
    if (ctx2) {
        var dailyData = {};
        a.forEach(function(o) {
            var fecha = t(o.fecha);
            if (fecha) {
                if (!dailyData[fecha]) dailyData[fecha] = 0;
                dailyData[fecha] += n(o.despachado);
            }
        });

        var sortedDates = Object.keys(dailyData).sort();
        var recentDates = sortedDates.slice(-15);
        var recentValues = recentDates.map(function(d) { return dailyData[d]; });

        if (trendChartInstance) trendChartInstance.destroy();

        var gradient = ctx2.getContext('2d').createLinearGradient(0, 0, 0, 120);
        gradient.addColorStop(0, 'rgba(15,240,212,0.8)');
        gradient.addColorStop(0.5, 'rgba(15,240,212,0.3)');
        gradient.addColorStop(1, 'rgba(15,240,212,0.02)');

        trendChartInstance = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: recentDates.map(function(d) {
                    var parts = String(d).split('-');
                    return parts.length === 3 ? parts[2] + '/' + parts[1] : d;
                }),
                datasets: [{
                    data: recentValues,
                    borderColor: '#0ff0d4',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#4df0ff',
                    pointBorderColor: '#04121e',
                    pointBorderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(4,18,30,0.96)',
                        titleColor: '#edf9ff',
                        bodyColor: '#8bb8d0',
                        borderColor: 'rgba(15,240,212,0.3)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 8,
                        callbacks: {
                            label: function(context) {
                                return 'Despachado: ' + N.format(context.parsed.y) + ' gal';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(15,240,212,0.05)', drawTicks: false },
                        ticks: { color: '#8bb8d0', font: { size: 7, family: 'Inter' }, maxRotation: 30 }
                    },
                    y: {
                        grid: { color: 'rgba(15,240,212,0.04)', drawTicks: false },
                        ticks: { color: '#8bb8d0', font: { size: 7, family: 'Inter' }, callback: function(v) { return N.format(v); } },
                        beginAtZero: true
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
    // Fuel Oil KPIs
    var totalVolumenFuel = fuelData.reduce(function(s, o) { return s + n(o.volumen); }, 0);
    var totalVentaFuel = fuelData.reduce(function(s, o) { return s + n(o.subTotalVenta); }, 0);
    var totalMargenFuel = fuelData.reduce(function(s, o) { return s + n(o.margen); }, 0);
    var margenPctFuel = totalVentaFuel ? (totalMargenFuel / totalVentaFuel * 100) : 0;
    var viajesFuel = fuelData.length;

    var fuelKpis = [
        { label: 'Volumen Total Fuel', value: N.format(totalVolumenFuel) + ' gal', pct: null, icon: '🛢️' },
        { label: 'Venta Total Fuel', value: M.format(totalVentaFuel), pct: null, icon: '💰' },
        { label: 'Margen Fuel', value: M.format(totalMargenFuel), pct: margenPctFuel.toFixed(1) + '%', icon: '📈' },
        { label: 'Viajes Fuel', value: N.format(viajesFuel), pct: null, icon: '📋' }
    ];

    // General KPIs
    var rq = sum(a, 'solicitado');
    var ds = sum(a, 'despachado');
    var pd = Math.max(rq - ds, 0);
    var cumplimiento = rq ? (ds / rq * 100) : 0;

    var generalKpis = [
        { label: 'Volumen solicitado', value: N.format(rq) + ' gal', pct: null, icon: '📦' },
        { label: 'Volumen despachado', value: N.format(ds) + ' gal', pct: cumplimiento.toFixed(1) + '%', icon: '✅' },
        { label: 'Volumen pendiente', value: N.format(pd) + ' gal', pct: null, icon: '⏳' },
        { label: 'Cumplimiento', value: cumplimiento.toFixed(1) + '%', pct: null, icon: '🎯' }
    ];

    var fuelGrid = document.getElementById('fuelKpisGrid');
    var generalGrid = document.getElementById('generalKpisGrid');

    if (fuelGrid) {
        fuelGrid.innerHTML = fuelKpis.map(function(k) {
            var pctHtml = k.pct ? '<span class="value-pct">' + k.pct + '</span>' : '';
            return '<div class="kpi-item fuel-item" onclick="showKPIInfo(\'' + k.label + '\', \'' + k.value + '\', \'' + (k.pct || '') + '\')">' +
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
// RENDER PANEL UNIFICADO (Fulfill + Alerts)
// ============================================================
function renderUnifiedPanel(a, fuelData, rq, ds, pd) {
    var sourceBadge = getSourceBadgeHTML();
    var fuelSourceBadge = getFuelSourceBadgeHTML();

    // Fulfill
    var fuels = groupBy(a, 'combustible').map(function(item) {
        return { k: item[0], rq: sum(item[1], 'solicitado'), ds: sum(item[1], 'despachado') };
    }).sort(function(x, y) { return y.ds - x.ds; });

    var byProducto = [];
    if (fuelData && fuelData.length > 0) {
        byProducto = groupBy(fuelData, 'producto').map(function(item) {
            return { producto: item[0] || 'Fuel Oil', volumen: sum(item[1], 'volumen'), venta: sum(item[1], 'subTotalVenta') };
        }).sort(function(x, y) { return y.volumen - x.volumen; });
    }

    var fulfillEl = document.getElementById('fulfill');
    if (fulfillEl) {
        var fuelHtml = '';
        if (byProducto.length > 0) {
            fuelHtml = byProducto.slice(0, 4).map(function(x) {
                return '<div class="product-item fuel-item"><div class="p-name">🛢️ ' + x.producto +
                    '</div><div class="p-value"><b>' + N.format(x.volumen) + '</b> gal · ' + M.format(x.venta) + '</div></div>';
            }).join('');
        } else {
            fuelHtml = '<div style="color:var(--txt-muted);font-size:10px;padding:4px 0;">Sin productos Fuel Oil</div>';
        }

        var combustibleHtml = fuels.slice(0, 4).map(function(x) {
            return '<div class="product-item"><div class="p-name">⛽ ' + x.k +
                '</div><div class="p-value"><b>' + N.format(x.ds) + '</b> de ' + N.format(x.rq) + ' gal</div></div>';
        }).join('');

        fulfillEl.innerHTML =
            '<div class="title"><div><h2>📊 Volumen por combustible</h2><small>Fuel Oil · Combustible</small></div><div>' +
            fuelSourceBadge + ' ' + sourceBadge + '</div></div>' +
            '<div class="fulfill-body" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
            '<div><div class="section-title" style="color:var(--neon-amber);border-bottom-color:rgba(255,183,77,0.15);">🛢️ Fuel Oil</div>' +
            '<div class="product-grid">' + fuelHtml + '</div></div>' +
            '<div><div style="background:rgba(255,255,255,0.02);border-radius:var(--radius-sm);padding:10px;border:1px solid rgba(255,255,255,0.03);">' +
            '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--txt-muted);margin-bottom:5px;letter-spacing:0.3px;"><span>Cumplimiento</span><span style="color:var(--neon-teal);font-weight:600;">' +
            (rq ? (ds / rq * 100).toFixed(1) : '0.0') + '%</span></div>' +
            '<div style="height:7px;background:#0a1f2e;border-radius:6px;overflow:hidden;box-shadow:inset 0 1px 4px rgba(0,0,0,0.4);"><i style="display:block;height:100%;width:' +
            Math.min(rq ? (ds / rq * 100) : 0, 100) + '%;background:linear-gradient(90deg, #5affa0, #0ff0d4);border-radius:6px;transition:width 0.9s var(--transition-smooth);box-shadow:0 0 12px rgba(15,240,212,0.4);"></i></div>' +
            '<div class="stats-row" style="margin-top:10px;">' +
            '<div class="stat-item"><b>' + N.format(ds) + '</b><span>Despachado</span></div>' +
            '<div class="stat-item"><b>' + N.format(pd) + '</b><span>Pendiente</span></div>' +
            '<div class="stat-item"><b>' + a.filter(function(o) { return n(o.solicitado) > n(o.despachado); }).length + '</b><span>Parciales</span></div>' +
            '</div>' +
            '<div style="margin-top:8px;border-top:1px solid rgba(15,240,212,0.06);padding-top:8px;">' +
            '<div class="section-title">⛽ Combustible</div>' +
            '<div class="product-grid">' + combustibleHtml + '</div></div></div></div>' +
            '</div>';
    }

    // Alerts
    var allAlertItems = [];

    var partialOps = a.filter(function(o) { return n(o.solicitado) > n(o.despachado); });
    var partialLocations = partialOps.map(function(o) {
        var loc = getLocation(o._rowIndex || 0, 'despachado');
        return { row: loc.row, col: loc.col, description: 'Solicitado: ' + N.format(n(o.solicitado)) + ' | Despachado: ' + N.format(n(o.despachado)) + ' | Cliente: ' + t(o.cliente) };
    });

    if (partialOps.length > 0) {
        allAlertItems.push({
            label: '⚠️ Operaciones parciales', value: partialOps.length,
            detail: 'Volumen pendiente de despachar: ' + N.format(pd) + ' gal',
            locations: partialLocations,
            formula: 'Suma(Solicitado) - Suma(Despachado)',
            explanation: 'Cada operacion parcial tiene un saldo pendiente que debe ser despachado.',
            fields: [
                { label: 'Total solicitado', value: N.format(rq) + ' gal' },
                { label: 'Total despachado', value: N.format(ds) + ' gal' },
                { label: 'Pendiente total', value: N.format(pd) + ' gal' }
            ],
            solution: 'Priorizar las operaciones con mayor volumen pendiente.',
            isFuel: false
        });
    }

    var noDriverOps = a.filter(function(o) { return !t(o.conductor); });
    if (noDriverOps.length > 0) {
        var noDriverLocations = noDriverOps.map(function(o) {
            var loc = getLocation(o._rowIndex || 0, 'conductor');
            return { row: loc.row, col: loc.col, description: 'Cliente: ' + t(o.cliente) + ' | Placa: ' + t(o.placaEntrega || '') };
        });
        allAlertItems.push({
            label: '👤 Sin conductor', value: noDriverOps.length,
            detail: 'Operaciones sin conductor registrado', locations: noDriverLocations,
            solution: 'Completar el nombre del conductor.', isFuel: false
        });
    }

    if (fuelData && fuelData.length > 0) {
        var fuelNoConductor = fuelData.filter(function(o) { return !t(o.conductor); });
        if (fuelNoConductor.length > 0) {
            var locations = fuelNoConductor.map(function(o) {
                return { row: o._rowIndex || 0, col: 'CONDUCTOR', description: 'Placa: ' + t(o.placaCisterna || '') };
            });
            allAlertItems.push({
                label: '👤 Sin conductor (Fuel)', value: fuelNoConductor.length,
                detail: 'Viajes Fuel Oil sin conductor', locations: locations, isFuel: true
            });
        }
    }

    var alertsEl = document.getElementById('alerts');
    if (alertsEl) {
        var html = '<div class="title"><h2>⚠️ Alertas de Volumen</h2><div>' + fuelSourceBadge + ' ' + sourceBadge + '</div></div>';
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

        var generalItems = allAlertItems.filter(function(x) { return !x.isFuel; });
        if (fuelItems.length > 0 && generalItems.length > 0) {
            html += '<div class="alert-divider"><span class="divider-icon">⛽</span><span class="divider-text">Combustible</span><span class="divider-line"></span></div>';
        }
        if (generalItems.length > 0) {
            html += generalItems.map(function(x) {
                return '<div class="alert" data-alert="' + x.label + '" data-value="' + x.value +
                    '" data-locations=\'' + JSON.stringify(x.locations || []) + '\'><i>⚠️</i>' +
                    '<div style="flex:1;"><b>' + x.label + '</b><span class="source-tag general-tag">📊 General</span>' +
                    '<span>' + x.detail + '</span></div>' +
                    '<span class="alert-badge">' + x.value + ' casos</span></div>';
            }).join('');
        }

        if (allAlertItems.length === 0) {
            html += '<div style="padding:24px;text-align:center;color:var(--neon-green);">✅ Sin alertas para el período seleccionado</div>';
        }

        html += '</div>';
        html += '<div class="alerts-footer"><span class="footer-dot orange"></span> Fuel Oil<span class="footer-sep">·</span><span class="footer-dot teal"></span> Combustible<span class="footer-sep">·</span>Haz clic para detalles</div>';
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
    var wrapper = document.getElementById('tableWrapper');
    var tbody = document.getElementById('rows');
    if (!tbody) return;

    if (wrapper) savedScrollTop = wrapper.scrollTop;

    var pages = Math.max(1, Math.ceil(a.length / ps));
    state.page = Math.min(state.page, pages);
    var rows = a.slice((state.page - 1) * ps, state.page * ps);

    var html = rows.map(function(o) {
        var pct = n(o.solicitado) ? (n(o.despachado) / n(o.solicitado) * 100) : 0;
        return '<tr><td>' + fd(o.fecha) + '</td>' +
            '<td><b>' + t(o.cliente) + '</b><small>' + t(o.destino || '') + '</small></td>' +
            '<td><span class="pill">' + t(o.combustible) + '</span></td>' +
            '<td>' + N.format(n(o.solicitado)) + '</td>' +
            '<td>' + N.format(n(o.despachado)) + '</td>' +
            '<td>' + N.format(Math.max(n(o.solicitado) - n(o.despachado), 0)) + '</td>' +
            '<td>' + pct.toFixed(1) + '%</td></tr>';
    }).join('');

    tbody.innerHTML = html;

    var countEl = document.getElementById('count');
    if (countEl) countEl.textContent = N.format(a.length) + ' registros encontrados';

    var showingEl = document.getElementById('showing');
    if (showingEl) showingEl.textContent = 'Mostrando ' + (a.length ? (state.page - 1) * ps + 1 : 0) + '–' + Math.min(state.page * ps, a.length) + ' de ' + a.length;

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
    var a = filtered().sort(function(x, y) { return String(y.fecha ?? '').localeCompare(String(x.fecha ?? '')); });
    var headers = ['Fecha', 'Cliente', 'Combustible', 'Solicitado', 'Despachado', 'Pendiente', 'Cumplimiento', 'Pedido PUMA'];

    var rows = a.slice(0, 500).map(function(o) {
        var pct = n(o.solicitado) ? (n(o.despachado) / n(o.solicitado) * 100) : 0;
        return [fd(o.fecha), t(o.cliente), t(o.combustible), n(o.solicitado), n(o.despachado),
                Math.max(n(o.solicitado) - n(o.despachado), 0), pct.toFixed(1) + '%', t(o.pedidoPuma)];
    });

    var rq = sum(a, 'solicitado');
    var ds = sum(a, 'despachado');
    var pd = Math.max(rq - ds, 0);

    return {
        view: 'Volumenes', headers: headers, rows: rows, totalRows: a.length,
        filters: { period: state.period, client: state.client, fuel: state.fuel, fleet: state.fleet },
        totals: { solicitado: rq, despachado: ds, pendiente: pd, cumplimiento: rq ? (ds / rq * 100) : 0 }
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
        link.download = 'GSN_Volumenes_' + fechaStr + '.xls';
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
        link.download = 'GSN_Volumenes_' + fechaStr + '.pdf';
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
        document.getElementById('viewTitle').textContent = 'Control de Volúmenes';
        document.getElementById('viewSubtitle').textContent = 'Solicitado, despachado y pendiente por combustible';

        var a = filtered().sort(function(x, y) { return String(y.fecha ?? '').localeCompare(String(x.fecha ?? '')); });
        var fuelData = filteredFuel();
        var rq = sum(a, 'solicitado');
        var ds = sum(a, 'despachado');
        var pd = Math.max(rq - ds, 0);

        renderKPIs(a, fuelData);
        renderCharts(a, fuelData);
        renderUnifiedPanel(a, fuelData, rq, ds, pd);
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
        window.parent.postMessage({ type: 'REQUEST_DATOS', view: 'volumes' }, '*');
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

console.log('✅ Módulo Volúmenes cargado · Tabla en columna derecha · Estilo Futurista');