// ============================================================
// FUEL OIL - GRUPO GSN
// Dashboard modular con tabla en columna derecha
// ============================================================

// ============================================================
// DATOS GLOBALES
// ============================================================
let DATA_FUEL = [];
let lastUpdateFuelTime = null;
let isFuelView = true;
let isRendering = false;
let pendingUpdate = false;
let savedScrollTop = 0;

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

const MESES_ORDER = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

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
                html += '<div class="err-item"><span class="err-location">Fila ' + loc.row + '</span><span class="err-detail">Columna <strong style="color:var(--neon-amber);">' +
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
                html += '<div><span style="color:var(--txt-muted);">' + f.label + ':</span> <span style="color:var(--neon-amber);font-weight:500;">' + f.value + '</span></div>';
            });
            html += '</div>';
        }
        if (extraData.solution) {
            html += '<div style="margin-top:8px;padding:8px 12px;background:rgba(255,183,77,0.04);border-radius:var(--radius-sm);border-left:3px solid var(--neon-amber);"><span style="color:var(--neon-gold);font-weight:600;">💡 Solucion:</span><span style="color:var(--txt-primary);font-size:11px;">' + extraData.solution + '</span></div>';
        }
        if (extraData.error) {
            html += '<div style="margin-top:8px;padding:8px 12px;background:rgba(255,84,112,0.04);border-radius:var(--radius-sm);border-left:3px solid var(--neon-red);"><span style="color:var(--neon-red);font-weight:600;">❌ Error identificado:</span><span style="color:var(--txt-primary);font-size:11px;">' + extraData.error + '</span></div>';
        }
        html += '</div>';
    }

    var timeStr = lastUpdateFuelTime ? lastUpdateFuelTime.toLocaleString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--/--/---- --:--:--';
    html += '<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,183,77,0.08);font-size:9px;color:var(--txt-muted);">🔄 Datos actualizados: ' + timeStr + '</div>';

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
// FILTROS FUEL
// ============================================================
var fuelState = { period: 'Todos', product: 'Todos', conductor: 'Todos', placa: 'Todas', page: 1, q: '' };

function getUniqueFuelValues(data, key) {
    if (!data || !Array.isArray(data) || data.length === 0) return [];
    var values = new Set();
    data.forEach(function(item) {
        var val = t(item[key]);
        if (val && val !== '' && val !== 'null' && val !== 'undefined') values.add(val);
    });
    return Array.from(values).sort();
}

function getUniqueFuelPeriods(data) {
    var periods = new Set();
    if (data && Array.isArray(data)) {
        data.forEach(function(item) {
            var mes = t(item.mes);
            if (mes && mes !== '' && mes !== 'null' && mes !== 'undefined') periods.add(mes);
        });
    }
    return Array.from(periods).sort(function(a, b) { return MESES_ORDER.indexOf(a) - MESES_ORDER.indexOf(b); });
}

function fillFuel(id, vals, all) {
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

function refillFuelFilters() {
    var current = { ...fuelState };
    if (DATA_FUEL && DATA_FUEL.length > 0) {
        var periodos = getUniqueFuelPeriods(DATA_FUEL);
        var productos = getUniqueFuelValues(DATA_FUEL, 'producto');
        var conductores = getUniqueFuelValues(DATA_FUEL, 'conductor');
        var placas = getUniqueFuelValues(DATA_FUEL, 'placaCisterna');

        fillFuel('periodFuel', periodos, 'Todos');
        fillFuel('productFuel', productos, 'Todos');
        fillFuel('conductorFuel', conductores, 'Todos');
        fillFuel('placaFuel', placas, 'Todas');

        var map = {
            'periodFuel': 'period',
            'productFuel': 'product',
            'conductorFuel': 'conductor',
            'placaFuel': 'placa'
        };

        ['periodFuel', 'productFuel', 'conductorFuel', 'placaFuel'].forEach(function(id) {
            var e = document.getElementById(id);
            var key = map[id] || id;
            if (e && current[key] !== undefined && Array.from(e.options).some(function(x) { return x.value === current[key]; })) {
                e.value = current[key];
            } else if (e && e.options.length > 0) {
                e.selectedIndex = 0;
                fuelState[key] = e.value;
            }
        });
    }
}

function filteredFuel() {
    var data = DATA_FUEL;
    if (!data || data.length === 0) return [];

    if (fuelState.period && fuelState.period !== 'Todos') {
        data = data.filter(function(o) {
            var mes = t(o.mes).toUpperCase();
            return mes === fuelState.period.toUpperCase();
        });
    }

    if (fuelState.product && fuelState.product !== 'Todos') {
        data = data.filter(function(o) {
            return t(o.producto).toUpperCase() === fuelState.product.toUpperCase();
        });
    }

    if (fuelState.conductor && fuelState.conductor !== 'Todos') {
        data = data.filter(function(o) {
            return t(o.conductor).toUpperCase() === fuelState.conductor.toUpperCase();
        });
    }

    if (fuelState.placa && fuelState.placa !== 'Todas') {
        data = data.filter(function(o) {
            return t(o.placaCisterna).toUpperCase() === fuelState.placa.toUpperCase();
        });
    }

    if (fuelState.q) {
        var q = fuelState.q.toLowerCase();
        data = data.filter(function(o) {
            var searchFields = [t(o.conductor), t(o.placaCisterna), t(o.producto), t(o.pedido), t(o.factura)];
            return searchFields.some(function(v) { return v && String(v).toLowerCase().includes(q); });
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

function getFuelSourceBadgeHTML() {
    var timeStr = lastUpdateFuelTime ? lastUpdateFuelTime.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
    return '<span class="source-badge" onclick="event.stopPropagation();showInfoTooltip(\'Fuente de datos Fuel Oil\', \'Google Sheets\', \'Los datos de Fuel Oil se obtienen del archivo FUEL OIL 2026.xlsx.\', { fields: [{ label: \'Ultima actualizacion\', value: \'' + timeStr + '\' }] })">Fuel Oil · ' + timeStr + '</span>';
}

function showKPIInfo(label, value, pct) {
    var kpiMap = {
        'Volumen Total': { formula: 'Suma(Volumen)', explanation: 'Suma total de galones de Fuel Oil transportados.' },
        'Venta Total': { formula: 'Suma(SUB TOTAL VENTA)', explanation: 'Suma total de ventas de Fuel Oil.' },
        'Margen': { formula: 'Suma(MARGEN)', explanation: 'Suma total del margen de Fuel Oil.' },
        'Viajes': { formula: 'COUNT(registros)', explanation: 'Numero total de viajes registrados.' },
        'Costo Total': { formula: 'Suma(SUB TOTAL COSTO)', explanation: 'Suma total del costo de Fuel Oil.' },
        'Costo Promedio': { formula: 'Costo Total / Volumen', explanation: 'Costo promedio por galon.' },
        'Venta Promedio': { formula: 'Venta Total / Volumen', explanation: 'Precio de venta promedio por galon.' },
        'Conductores': { formula: 'COUNT(DISTINCT Conductor)', explanation: 'Numero unico de conductores.' }
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
function renderCharts(a) {
    // Distribución por producto
    var byProducto = groupBy(a, 'producto').map(function(item) {
        return {
            producto: item[0] || 'Fuel Oil',
            volumen: sum(item[1], 'volumen'),
            margen: sum(item[1], 'margen'),
            viajes: item[1].length
        };
    }).sort(function(x, y) { return y.volumen - x.volumen; });

    var topProductos = byProducto.slice(0, 8);

    var ctx1 = document.getElementById('fuelChart');
    if (ctx1) {
        if (fuelChartInstance) fuelChartInstance.destroy();

        var colors = topProductos.map(function(p, i) {
            var hue = 30 + i * 18;
            return 'hsla(' + hue + ', 90%, 60%, 0.85)';
        });
        var borders = topProductos.map(function(p, i) {
            var hue = 30 + i * 18;
            return 'hsla(' + hue + ', 90%, 62%, 1)';
        });

        fuelChartInstance = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: topProductos.map(function(p) { return p.producto; }),
                datasets: [{
                    label: 'Volumen (gal)',
                    data: topProductos.map(function(p) { return p.volumen; }),
                    backgroundColor: colors,
                    borderColor: borders,
                    borderWidth: 1.5,
                    borderRadius: 4,
                    barPercentage: 0.6,
                    yAxisID: 'y'
                }, {
                    label: 'Margen (C$)',
                    data: topProductos.map(function(p) { return p.margen; }),
                    type: 'line',
                    borderColor: '#ff5fd2',
                    backgroundColor: 'rgba(255,95,210,0.1)',
                    borderWidth: 2.2,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#ff5fd2',
                    pointBorderColor: '#04121e',
                    pointBorderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    yAxisID: 'y1',
                    order: 0
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
                        borderColor: 'rgba(255,183,77,0.3)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                var p = topProductos[context.dataIndex];
                                if (context.dataset.label === 'Volumen (gal)') {
                                    return ['Volumen: ' + N.format(context.parsed.y) + ' gal', 'Viajes: ' + p.viajes];
                                }
                                return 'Margen: ' + M.format(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,183,77,0.05)', drawTicks: false },
                        ticks: { color: '#8bb8d0', font: { size: 7, family: 'Inter' }, maxRotation: 30, minRotation: 10 }
                    },
                    y: {
                        position: 'left',
                        grid: { color: 'rgba(255,183,77,0.04)', drawTicks: false },
                        ticks: {
                            color: '#8bb8d0',
                            font: { size: 7, family: 'Inter' },
                            callback: function(v) { return N.format(v); }
                        },
                        beginAtZero: true
                    },
                    y1: {
                        position: 'right',
                        grid: { display: false },
                        ticks: {
                            color: '#ff5fd2',
                            font: { size: 7, family: 'Inter' },
                            callback: function(v) { return M.format(v); }
                        },
                        beginAtZero: true
                    }
                },
                interaction: { intersect: false, mode: 'index' }
            }
        });
    }

    // Tendencia mensual (Polar)
    var ctx2 = document.getElementById('trendChart');
    if (ctx2) {
        var monthlyData = {};
        a.forEach(function(o) {
            var mes = t(o.mes) || 'Sin mes';
            if (!monthlyData[mes]) monthlyData[mes] = 0;
            monthlyData[mes] += n(o.volumen);
        });

        var mesesOrdenados = MESES_ORDER.filter(function(m) { return monthlyData[m] !== undefined; });
        var valores = mesesOrdenados.map(function(m) { return monthlyData[m]; });

        if (trendChartInstance) trendChartInstance.destroy();

        var colorsPolar = mesesOrdenados.map(function(_, i) {
            var hue = 30 + i * 15;
            return 'hsla(' + hue + ', 85%, 60%, 0.75)';
        });

        trendChartInstance = new Chart(ctx2, {
            type: 'polarArea',
            data: {
                labels: mesesOrdenados,
                datasets: [{
                    data: valores,
                    backgroundColor: colorsPolar,
                    borderColor: 'rgba(4,18,30,0.9)',
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
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
                        borderColor: 'rgba(255,183,77,0.3)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                var total = context.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                                var pct = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                                return context.label + ': ' + N.format(context.parsed) + ' gal (' + pct + '%)';
                            }
                        }
                    }
                },
                scales: {
                    r: {
                        grid: { color: 'rgba(255,183,77,0.08)' },
                        ticks: {
                            color: '#8bb8d0',
                            font: { size: 6, family: 'Inter' },
                            backdropColor: 'transparent',
                            callback: function(v) { return N.format(v); }
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

// ============================================================
// RENDER KPIs
// ============================================================
function renderKPIs(a) {
    var totalVolumen = sum(a, 'volumen');
    var totalCosto = sum(a, 'subTotalCosto');
    var totalVenta = sum(a, 'subTotalVenta');
    var totalMargen = sum(a, 'margen');
    var margenPct = totalVenta ? (totalMargen / totalVenta * 100) : 0;
    var totalViajes = a.length;
    var conductores = new Set(a.map(function(o) { return t(o.conductor); }).filter(Boolean)).size;

    var costoProm = totalVolumen ? totalCosto / totalVolumen : 0;
    var ventaProm = totalVolumen ? totalVenta / totalVolumen : 0;

    var generalKpis = [
        { label: 'Volumen Total', value: N.format(totalVolumen) + ' gal', pct: null, icon: '🛢️' },
        { label: 'Costo Total', value: M.format(totalCosto), pct: null, icon: '💸' },
        { label: 'Venta Total', value: M.format(totalVenta), pct: null, icon: '💰' },
        { label: 'Margen', value: M.format(totalMargen), pct: margenPct.toFixed(1) + '%', icon: '📈' }
    ];

    var fuelKpis = [
        { label: 'Viajes', value: N.format(totalViajes), pct: null, icon: '📋' },
        { label: 'Conductores', value: N.format(conductores), pct: null, icon: '👤' },
        { label: 'Costo Promedio', value: 'C$ ' + costoProm.toFixed(2), pct: null, icon: '📊' },
        { label: 'Venta Promedio', value: 'C$ ' + ventaProm.toFixed(2), pct: null, icon: '💵' }
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
// RENDER PANEL UNIFICADO
// ============================================================
function renderUnifiedPanel(a) {
    var sourceBadge = getFuelSourceBadgeHTML();

    var byProducto = groupBy(a, 'producto').map(function(item) {
        return {
            producto: item[0] || 'Fuel Oil',
            volumen: sum(item[1], 'volumen'),
            venta: sum(item[1], 'subTotalVenta'),
            margen: sum(item[1], 'margen')
        };
    }).sort(function(x, y) { return y.volumen - x.volumen; });

    var fulfillEl = document.getElementById('fulfill');
    if (fulfillEl) {
        var productosHtml = byProducto.slice(0, 6).map(function(x) {
            var pct = x.venta ? (x.margen / x.venta * 100) : 0;
            return '<div class="product-item fuel-item"><div class="p-name">🛢️ ' + x.producto +
                '</div><div class="p-value"><b>' + N.format(x.volumen) + '</b> gal · ' + M.format(x.venta) +
                ' <span style="color:' + (x.margen < 0 ? 'var(--neon-red)' : 'var(--neon-green)') + ';">(' + pct.toFixed(1) + '%)</span></div></div>';
        }).join('');

        var top3 = byProducto.slice(0, 3);
        var topHtml = top3.map(function(x, i) {
            var icons = ['🥇', '🥈', '🥉'];
            return '<div class="stat-item"><b>' + icons[i] + '</b><span>' + x.producto.substring(0, 12) + '</span></div>';
        }).join('');

        fulfillEl.innerHTML =
            '<div class="title"><div><h2>🛢️ Distribución · Productos</h2><small>Top por volumen · Margen</small></div><div>' +
            sourceBadge + '</div></div>' +
            '<div class="fulfill-body">' +
            '<div class="section-title">📦 Productos por volumen</div>' +
            '<div class="product-grid">' + productosHtml + '</div>' +
            '</div>';
    }

    // Alerts
    var allAlertItems = [];

    var fuelNegMargen = a.filter(function(o) { return n(o.margen) < 0; });
    if (fuelNegMargen.length > 0) {
        var locations = fuelNegMargen.map(function(o) {
            return { row: o._rowIndex || 0, col: 'MARGEN', description: 'Margen: ' + M.format(n(o.margen)) + ' | Producto: ' + t(o.producto) + ' | Conductor: ' + t(o.conductor) };
        });
        allAlertItems.push({
            label: '💰 Margen negativo', value: fuelNegMargen.length,
            detail: 'Operaciones con margen negativo',
            locations: locations,
            formula: 'Margen = Venta - Costo',
            explanation: 'El margen negativo indica que el costo supera al precio de venta.',
            solution: 'Revisar precios de compra (COSTO PUMA) y precios de venta.',
            isFuel: true
        });
    }

    var fuelNoConductor = a.filter(function(o) { return !t(o.conductor); });
    if (fuelNoConductor.length > 0) {
        var locations = fuelNoConductor.map(function(o) {
            return { row: o._rowIndex || 0, col: 'CONDUCTOR', description: 'Placa: ' + t(o.placaCisterna) + ' | Producto: ' + t(o.producto) };
        });
        allAlertItems.push({
            label: '👤 Sin conductor', value: fuelNoConductor.length,
            detail: 'Operaciones sin conductor registrado',
            locations: locations,
            solution: 'Completar el nombre del conductor en la columna CONDUCTOR.',
            isFuel: true
        });
    }

    var fuelNoPlaca = a.filter(function(o) { return !t(o.placaCisterna); });
    if (fuelNoPlaca.length > 0) {
        var locations = fuelNoPlaca.map(function(o) {
            return { row: o._rowIndex || 0, col: 'PLACA CISTERNA', description: 'Conductor: ' + t(o.conductor) + ' | Producto: ' + t(o.producto) };
        });
        allAlertItems.push({
            label: '🚛 Sin placa', value: fuelNoPlaca.length,
            detail: 'Operaciones sin placa de cisterna',
            locations: locations,
            solution: 'Completar la placa en la columna PLACA CISTERNA.',
            isFuel: true
        });
    }

    var alertsEl = document.getElementById('alerts');
    if (alertsEl) {
        var html = '<div class="title"><h2>⚠️ Alertas Fuel Oil</h2><div>' + sourceBadge + '</div></div>';
        html += '<div class="alerts-scroll">';

        if (allAlertItems.length > 0) {
            html += allAlertItems.map(function(x) {
                return '<div class="alert fuel-alert" data-alert="' + x.label + '" data-value="' + x.value +
                    '" data-locations=\'' + JSON.stringify(x.locations || []) + '\'><i>🛢️</i>' +
                    '<div style="flex:1;"><b>' + x.label + '</b><span class="source-tag fuel-tag">🛢️ Fuel</span>' +
                    '<span>' + x.detail + '</span></div>' +
                    '<span class="alert-badge fuel-badge">' + x.value + ' casos</span></div>';
            }).join('');
        } else {
            html += '<div style="padding:24px;text-align:center;color:var(--neon-green);">✅ Sin alertas para el período seleccionado</div>';
        }

        html += '</div>';
        html += '<div class="alerts-footer"><span class="footer-dot orange"></span> Fuel Oil · Haz clic para detalles</div>';
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

    var sortedRows = a.slice().sort(function(x, y) {
        return String(y.fecha || '').localeCompare(String(x.fecha || ''));
    });

    var pages = Math.max(1, Math.ceil(sortedRows.length / ps));
    fuelState.page = Math.min(fuelState.page, pages);
    var rows = sortedRows.slice((fuelState.page - 1) * ps, fuelState.page * ps);

    var html = rows.map(function(o) {
        return '<tr><td>' + fd(o.fecha) + '</td>' +
            '<td><span class="pill">' + (t(o.mes) || 'Sin mes') + '</span></td>' +
            '<td><b>' + t(o.conductor) + '</b></td>' +
            '<td><span class="pill">' + t(o.placaCisterna) + '</span></td>' +
            '<td><span class="fuel-product-pill">' + (t(o.producto) || 'Fuel Oil') + '</span></td>' +
            '<td>' + N.format(n(o.volumen)) + '</td>' +
            '<td>C$ ' + n(o.costoPuma).toFixed(2) + '</td>' +
            '<td>' + M.format(n(o.subTotalCosto)) + '</td>' +
            '<td>' + M.format(n(o.subTotalVenta)) + '</td>' +
            '<td class="' + (n(o.margen) < 0 ? 'neg' : 'pos') + '">' + M.format(n(o.margen)) + '</td></tr>';
    }).join('');

    tbody.innerHTML = html;

    var countEl = document.getElementById('count');
    if (countEl) countEl.textContent = N.format(sortedRows.length) + ' registros encontrados';

    var showingEl = document.getElementById('showing');
    if (showingEl) showingEl.textContent = 'Mostrando ' + (sortedRows.length ? (fuelState.page - 1) * ps + 1 : 0) + '–' + Math.min(fuelState.page * ps, sortedRows.length) + ' de ' + sortedRows.length;

    var pageEl = document.getElementById('page');
    if (pageEl) pageEl.textContent = fuelState.page + ' / ' + pages;

    if (wrapper && savedScrollTop > 0 && savedScrollTop < wrapper.scrollHeight) {
        wrapper.scrollTop = savedScrollTop;
    }
}

// ============================================================
// EXPORTACIÓN
// ============================================================
function obtenerDatosExportacionFuel() {
    var a = filteredFuel();
    var headers = ['Fecha', 'Mes', 'Conductor', 'Placa', 'Producto', 'Volumen', 'Costo Unitario', 'Costo Total', 'Venta Total', 'Margen'];

    var rows = a.slice(0, 500).map(function(o) {
        return [fd(o.fecha), t(o.mes) || 'Sin mes', t(o.conductor) || 'Sin conductor',
                t(o.placaCisterna) || 'Sin placa', t(o.producto) || 'Fuel Oil',
                n(o.volumen), n(o.costoPuma), n(o.subTotalCosto), n(o.subTotalVenta), n(o.margen)];
    });

    var totalVolumen = sum(a, 'volumen');
    var totalCosto = sum(a, 'subTotalCosto');
    var totalVenta = sum(a, 'subTotalVenta');
    var totalMargen = sum(a, 'margen');

    return {
        view: 'Fuel Oil', headers: headers, rows: rows, totalRows: a.length,
        filters: { period: fuelState.period, product: fuelState.product, conductor: fuelState.conductor, placa: fuelState.placa },
        totals: { volumen: totalVolumen, ventas: totalVenta, margen: totalMargen, costo: totalCosto, viajes: a.length },
        fuelData: a.slice(0, 500).map(function(o) {
            return {
                fecha: o.fecha || '', mes: o.mes || '', conductor: o.conductor || '',
                placaCisterna: o.placaCisterna || '', producto: o.producto || 'Fuel Oil',
                volumen: n(o.volumen), costoPuma: n(o.costoPuma), subTotalCosto: n(o.subTotalCosto),
                subTotalVenta: n(o.subTotalVenta), margen: n(o.margen),
                noCarga: o.noCarga || '', pedido: o.pedido || '', factura: o.factura || ''
            };
        })
    };
}

function exportarExcelFuel() {
    var dataToSend = obtenerDatosExportacionFuel();
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
        link.download = 'GSN_Fuel_Oil_' + fechaStr + '.xls';
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

function exportarPDFFuel() {
    var dataToSend = obtenerDatosExportacionFuel();
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
        link.download = 'GSN_Fuel_Oil_Reporte_' + fechaStr + '.pdf';
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
        isFuelView = true;
        refillFuelFilters();

        var a = filteredFuel();

        document.getElementById('viewTitle').textContent = '🛢️ Fuel Oil';
        document.getElementById('viewSubtitle').textContent = 'Control de distribución de Fuel Oil · Datos de PUMA';

        if (!a || a.length === 0) {
            renderKPIs([]);
            renderUnifiedPanel([]);
            renderTable([], 100);
        } else {
            renderKPIs(a);
            renderCharts(a);
            renderUnifiedPanel(a);
            renderTable(a, 100);
        }
    } catch (error) {
        console.error('Error de vista Fuel Oil:', error);
        var viewTitle = document.getElementById('viewTitle');
        if (viewTitle) viewTitle.textContent = '🛢️ Fuel Oil - Error';
        var viewSubtitle = document.getElementById('viewSubtitle');
        if (viewSubtitle) viewSubtitle.textContent = 'No se pudo cargar la vista';
    }

    isRendering = false;
    if (pendingUpdate) { pendingUpdate = false; render(); }
}

// ============================================================
// EVENTOS
// ============================================================
var filterMap = {
    'periodFuel': 'period',
    'productFuel': 'product',
    'conductorFuel': 'conductor',
    'placaFuel': 'placa'
};

['periodFuel', 'productFuel', 'conductorFuel', 'placaFuel'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
        el.onchange = function(e) {
            var key = filterMap[id] || id;
            fuelState[key] = e.target.value;
            fuelState.page = 1;
            savedScrollTop = 0;
            render();
        };
    }
});

var searchEl = document.getElementById('search');
if (searchEl) {
    searchEl.oninput = function(e) {
        fuelState.q = e.target.value.toLowerCase();
        fuelState.page = 1;
        render();
    };
}

var prevBtn = document.getElementById('prev');
if (prevBtn) {
    prevBtn.onclick = function() { if (fuelState.page > 1) { fuelState.page--; render(); } };
}

var nextBtn = document.getElementById('next');
if (nextBtn) {
    nextBtn.onclick = function() { fuelState.page++; render(); };
}

// ============================================================
// MENSAJES DEL INDEX
// ============================================================
window.addEventListener('message', function(event) {
    var data = event.data;
    if (!data) return;

    if (data.type === 'DATOS_ACTUALIZADOS') {
        DATA_FUEL = data.fuelData || [];
        lastUpdateFuelTime = data.lastUpdateFuel ? new Date(data.lastUpdateFuel) : new Date();

        refillFuelFilters();
        render();

        if (window.parent && window.parent.actualizarEstadoGlobal) {
            var now = new Date();
            window.parent.actualizarEstadoGlobal(null, {
                time: lastUpdateFuelTime.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                date: lastUpdateFuelTime.toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                registros: DATA_FUEL.length || '0'
            });
        }
    }

    if (data.type === 'requestStatus') {
        var now = new Date();
        if (window.parent && window.parent.actualizarEstadoGlobal) {
            window.parent.actualizarEstadoGlobal(null, {
                time: lastUpdateFuelTime ? lastUpdateFuelTime.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : now.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                date: lastUpdateFuelTime ? lastUpdateFuelTime.toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' }) : now.toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                registros: DATA_FUEL.length || '0'
            });
        }
    }
});

// ============================================================
// SOLICITAR DATOS
// ============================================================
function solicitarDatos() {
    if (window.parent && window.parent.postMessage) {
        window.parent.postMessage({ type: 'REQUEST_DATOS', view: 'fuel' }, '*');
    }
}

window.showInfoTooltip = showInfoTooltip;
window.hideInfoTooltip = hideInfoTooltip;
window.render = render;
window.showKPIInfo = showKPIInfo;
window.solicitarDatos = solicitarDatos;
window.exportarExcelFuel = exportarExcelFuel;
window.exportarPDFFuel = exportarPDFFuel;
window.showToast = showToast;
window.hideToast = hideToast;

setTimeout(function() { solicitarDatos(); }, 500);

console.log('✅ Módulo Fuel Oil cargado · Tabla en columna derecha · Estilo Futurista');