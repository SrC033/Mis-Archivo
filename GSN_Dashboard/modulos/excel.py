# -*- coding: utf-8 -*-

"""
Modulo de generacion de Excel para GSN Dashboard
"""

import os
from datetime import datetime


# ============================================================
# FUNCIONES AUXILIARES (exportadas)
# ============================================================

def extraer_numero(valor):
    """Extrae un numero de un string o devuelve el numero"""
    if valor is None or valor == '':
        return 0.0
    if isinstance(valor, (int, float)):
        return float(valor)
    if isinstance(valor, str):
        try:
            return float(valor.replace(',', '').strip())
        except:
            return 0.0
    return 0.0


def formato_numero_simple(valor):
    """Formatea un numero sin decimales"""
    try:
        if valor is None or valor == '':
            return '0'
        num = float(valor)
        return f"{num:,.0f}"
    except:
        return '0'


def formato_moneda(valor):
    """Formatea un valor como moneda en Cordobas"""
    try:
        if valor is None or valor == '':
            return ''
        num = float(valor)
        if num >= 0:
            return f"C$ {num:,.2f}"
        else:
            return f"-C$ {abs(num):,.2f}"
    except:
        return str(valor)


# ============================================================
# FUNCION PRINCIPAL EXPORTADA
# ============================================================

def generar_excel_html(data, ruta_excel, view_name='Dashboard'):
    """
    Funcion principal para generar Excel
    """
    # Detectar si es Fuel Oil
    if _es_fuel_oil(data, view_name):
        return _generar_excel_fuel_oil(data, ruta_excel, view_name)
    
    # Generar Excel de Volumenes
    return _generar_excel_volumenes(data, ruta_excel, view_name)


# ============================================================
# FUNCIONES INTERNAS (privadas)
# ============================================================

def _es_fuel_oil(data, view_name):
    """Detecta si los datos son de Fuel Oil"""
    if view_name.lower() in ['fuel oil', 'fuel', 'fueloil']:
        return True
    
    fuel_data = data.get('fuelData', [])
    combustible_data = data.get('combustibleData', data.get('data', []))
    
    if fuel_data and not combustible_data:
        return True
    
    if data.get('view', '').lower() in ['fuel oil', 'fuel']:
        return True
    
    rows = data.get('rows', [])
    if not combustible_data and rows and len(rows) > 0:
        headers = data.get('headers', [])
        fuel_headers = ['conductor', 'placa', 'volumen', 'producto', 'mes']
        is_fuel = any(h.lower() in fuel_headers for h in headers)
        if is_fuel:
            return True
    
    return False


def _generar_excel_fuel_oil(data, ruta_excel, view_name='Fuel Oil'):
    """Genera Excel especifico para Fuel Oil"""
    try:
        print(f"Generando Excel Fuel Oil: {ruta_excel}")
        
        fuel_data = data.get('fuelData', data.get('data', []))
        filters = data.get('filters', {})
        totals = data.get('totals', {})
        headers = data.get('headers', [])
        rows = data.get('rows', [])
        
        print(f"Fuel Oil: {len(fuel_data)} registros")
        
        if not fuel_data and rows:
            for row in rows:
                if isinstance(row, (list, tuple)):
                    item = {}
                    for i, h in enumerate(headers):
                        if i < len(row):
                            item[h.lower().replace(' ', '')] = row[i]
                    fuel_data.append(item)
        
        excel_rows = []
        excel_headers = [
            'FECHA', 'MES', 'CONDUCTOR', 'PLACA CISTERNA', 
            'PRODUCTO', 'VOLUMEN (gal)', 'COSTO UNITARIO', 
            'COSTO TOTAL', 'VENTA TOTAL', 'MARGEN', 
            'NO. CARGA', 'PEDIDO', 'FACTURA'
        ]
        
        total_volumen = 0.0
        total_costo = 0.0
        total_venta = 0.0
        total_margen = 0.0
        
        for item in fuel_data:
            if not isinstance(item, dict):
                continue
            
            volumen = extraer_numero(item.get('volumen', 0))
            costo_unitario = extraer_numero(item.get('costoPuma', 0))
            costo_total = extraer_numero(item.get('subTotalCosto', 0))
            venta = extraer_numero(item.get('subTotalVenta', 0))
            margen = extraer_numero(item.get('margen', 0))
            
            total_volumen += volumen
            total_costo += costo_total
            total_venta += venta
            total_margen += margen
            
            excel_rows.append([
                str(item.get('fecha', '')),
                str(item.get('mes', '')),
                str(item.get('conductor', '')),
                str(item.get('placaCisterna', '')),
                str(item.get('producto', 'Fuel Oil')),
                volumen,
                costo_unitario,
                costo_total,
                venta,
                margen,
                str(item.get('noCarga', '')),
                str(item.get('pedido', '')),
                str(item.get('factura', ''))
            ])
        
        if not excel_rows:
            print("No hay datos de Fuel Oil para exportar a Excel")
            return False
        
        now = datetime.now()
        mes_filtro = filters.get('month', 'Todos') if filters else 'Todos'
        if not mes_filtro or mes_filtro == 'Todos':
            mes_filtro = filters.get('period', 'Todos') if filters else 'Todos'
        periodo_display = mes_filtro.upper() if mes_filtro and mes_filtro != 'Todos' else 'TODOS LOS PERIODOS'
        
        if totals:
            total_volumen = totals.get('volumen', total_volumen)
            total_venta = totals.get('ventas', total_venta)
            total_margen = totals.get('margen', total_margen)
            total_costo = totals.get('costo', total_costo)
        
        margen_pct = (total_margen / total_venta * 100) if total_venta > 0 else 0
        
        html = _generar_html_excel_fuel(excel_rows, excel_headers, view_name, periodo_display, 
                                        total_volumen, total_costo, total_venta, total_margen, 
                                        margen_pct, now)
        
        with open(ruta_excel, 'w', encoding='utf-8') as f:
            f.write(html)
        
        print(f"Excel Fuel Oil guardado: {ruta_excel}")
        return True
        
    except Exception as e:
        print(f"Error generando Excel Fuel Oil: {e}")
        import traceback
        traceback.print_exc()
        return False


def _generar_excel_volumenes(data, ruta_excel, view_name='Dashboard'):
    """Genera Excel para Volumenes"""
    try:
        print(f"Generando Excel de Volumenes: {ruta_excel}")
        
        combustible_data = data.get('combustibleData', data.get('data', []))
        fuel_data = data.get('fuelData', [])
        filters = data.get('filters', {})
        totals = data.get('totals', {})
        headers = data.get('headers', [])
        rows = data.get('rows', [])
        
        excel_rows = []
        excel_headers = [
            'FECHA', 'CLIENTE', 'COMBUSTIBLE', 'SOLICITADO', 
            'DESPACHADO', 'PENDIENTE', 'CUMPLIMIENTO', 
            'VENTA', 'MARGEN', 'FLOTA', 'CONDUCTOR', 'PEDIDO PUMA'
        ]
        
        if combustible_data and len(combustible_data) > 0:
            for item in combustible_data:
                if not isinstance(item, dict):
                    continue
                
                solicitado = extraer_numero(item.get('solicitado', 0))
                despachado = extraer_numero(item.get('despachado', 0))
                pendiente = max(solicitado - despachado, 0)
                cumplimiento = (despachado / solicitado * 100) if solicitado > 0 else 0
                venta = extraer_numero(item.get('subtotalVenta', item.get('venta', 0)))
                margen = extraer_numero(item.get('margenBruto', item.get('margen', 0)))
                
                excel_rows.append([
                    str(item.get('fecha', '')),
                    str(item.get('cliente', '')),
                    str(item.get('combustible', '')),
                    solicitado,
                    despachado,
                    pendiente,
                    f"{cumplimiento:.1f}%",
                    venta,
                    margen,
                    str(item.get('flota', '')),
                    str(item.get('conductor', '')),
                    str(item.get('pedidoPuma', ''))
                ])
        
        if fuel_data and len(fuel_data) > 0:
            if excel_rows:
                excel_rows.append(['--- FUEL OIL ---', '', '', '', '', '', '', '', '', '', '', ''])
            
            for item in fuel_data:
                if not isinstance(item, dict):
                    continue
                
                excel_rows.append([
                    str(item.get('fecha', '')),
                    str(item.get('conductor', '')),
                    str(item.get('producto', 'Fuel Oil')),
                    extraer_numero(item.get('volumen', 0)),
                    '',
                    '',
                    '',
                    extraer_numero(item.get('subTotalVenta', 0)),
                    extraer_numero(item.get('margen', 0)),
                    str(item.get('placaCisterna', '')),
                    '',
                    str(item.get('pedido', ''))
                ])
        
        if not excel_rows and rows:
            for row in rows:
                if isinstance(row, (list, tuple)):
                    excel_rows.append(row)
        
        if not excel_rows:
            print("No hay datos para exportar a Excel")
            return False
        
        now = datetime.now()
        mes_filtro = filters.get('month', 'Todos') if filters else 'Todos'
        if not mes_filtro or mes_filtro == 'Todos':
            mes_filtro = filters.get('period', 'Todos') if filters else 'Todos'
        periodo_display = mes_filtro.upper() if mes_filtro and mes_filtro != 'Todos' else 'TODOS LOS PERIODOS'
        
        total_solicitado = totals.get('solicitado', 0)
        total_despachado = totals.get('despachado', 0)
        total_venta = totals.get('ventas', 0)
        total_margen = totals.get('margen', 0)
        
        html = _generar_html_excel_volumenes(excel_rows, excel_headers, view_name, periodo_display,
                                              total_solicitado, total_despachado, total_venta, total_margen, now)
        
        with open(ruta_excel, 'w', encoding='utf-8') as f:
            f.write(html)
        
        print(f"Excel guardado: {ruta_excel}")
        return True
        
    except Exception as e:
        print(f"Error generando Excel: {e}")
        import traceback
        traceback.print_exc()
        return False


def _generar_html_excel_fuel(excel_rows, excel_headers, view_name, periodo_display,
                             total_volumen, total_costo, total_venta, total_margen, 
                             margen_pct, now):
    """Genera HTML para Excel de Fuel Oil"""
    html = f'''<html xmlns:o="urn:schemas-microsoft-com:office:office" 
                  xmlns:x="urn:schemas-microsoft-com:office:excel" 
                  xmlns="http://www.w3.org/TR/REC-html40">
    <head>
        <meta charset="UTF-8">
        <!--[if gte mso 9]>
        <xml>
            <x:ExcelWorkbook>
                <x:ExcelWorksheets>
                    <x:ExcelWorksheet>
                        <x:Name>Fuel Oil</x:Name>
                        <x:WorksheetOptions>
                            <x:DisplayGridlines/>
                        </x:WorksheetOptions>
                    </x:ExcelWorksheet>
                </x:ExcelWorksheets>
            </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
            body {{ font-family: 'Segoe UI', Arial, sans-serif; }}
            th {{ background: #0d2a3c; color: #ffffff; padding: 6px 10px; border: 1px solid #1a4a6a; font-weight: bold; }}
            td {{ padding: 4px 8px; border: 1px solid #dce4ec; }}
            .header {{ background: #0a1a2b; color: #fff; padding: 10px 15px; font-size: 16pt; font-weight: bold; }}
            .header span {{ color: #f4a016; }}
            .sub {{ color: #f4a016; font-size: 10pt; }}
            .meta {{ color: #6a9ab0; font-size: 8pt; }}
            .text-right {{ text-align: right; }}
            .text-left {{ text-align: left; }}
            .text-center {{ text-align: center; }}
            .totals {{ background: #0d2a3c; color: #ffffff; font-weight: bold; }}
            .totals td {{ border-color: #1a4a6a; }}
            .footer {{ color: #6a9ab0; font-size: 8pt; margin-top: 10px; }}
            .neg {{ color: #ff0000; }}
            .pos {{ color: #00aa00; }}
        </style>
    </head>
    <body>
        <div class="header">GSN · <span>Reporte {view_name}</span></div>
        <div class="sub">Control de Distribucion Fuel Oil – {periodo_display}</div>
        <div class="meta">Generado: {now.strftime('%d/%m/%Y %H:%M')} · Registros: {len(excel_rows)}</div>
        <br>
        <table>
            <thead>
                <tr>'''
    
    for h in excel_headers:
        html += f'<th>{h}</th>'
    
    html += '</tr></thead><tbody>'
    
    for row in excel_rows:
        html += '<tr>'
        for i, cell in enumerate(row):
            if isinstance(cell, (int, float)):
                if i == 5:  # Volumen
                    html += f'<td class="text-right">{cell:,.2f}</td>'
                elif i in [6, 7, 8, 9]:  # Costo Unitario, Costo Total, Venta Total, Margen
                    html += f'<td class="text-right">C$ {cell:,.2f}</td>'
                else:
                    html += f'<td class="text-right">{cell:,.2f}</td>'
            else:
                html += f'<td>{cell}</td>'
        html += '</tr>'
    
    html += f'''
            <tr class="totals">
                <td colspan="4" style="text-align:right;font-weight:bold;">TOTALES</td>
                <td></td>
                <td class="text-right">{formato_numero_simple(total_volumen)}</td>
                <td></td>
                <td class="text-right">{formato_moneda(total_costo)}</td>
                <td class="text-right">{formato_moneda(total_venta)}</td>
                <td class="text-right">{formato_moneda(total_margen)}</td>
                <td colspan="3"></td>
            </tr>'''
    
    html += f'''
        </tbody>
    </table>
    <br>
    <div class="footer">
        <b>Resumen Fuel Oil:</b> 
        Volumen: {formato_numero_simple(total_volumen)} gal · 
        Costo: {formato_moneda(total_costo)} · 
        Ventas: {formato_moneda(total_venta)} · 
        Margen: {formato_moneda(total_margen)} ({margen_pct:.2f}%) · 
        Viajes: {len(excel_rows)}
        <br>
        <b>Productos:</b> {', '.join(set([str(r[4]) for r in excel_rows if len(r) > 4 and r[4]])) if len(excel_rows) > 0 and len(excel_rows[0]) > 4 else 'N/A'}
        <br>
        Total registros: {len(excel_rows)} · GSN Fuel Oil Control
    </div>
    </body></html>'''
    
    return html


def _generar_html_excel_volumenes(excel_rows, excel_headers, view_name, periodo_display,
                                   total_solicitado, total_despachado, total_venta, total_margen, now):
    """Genera HTML para Excel de Volumenes"""
    html = f'''<html xmlns:o="urn:schemas-microsoft-com:office:office" 
                  xmlns:x="urn:schemas-microsoft-com:office:excel" 
                  xmlns="http://www.w3.org/TR/REC-html40">
    <head>
        <meta charset="UTF-8">
        <!--[if gte mso 9]>
        <xml>
            <x:ExcelWorkbook>
                <x:ExcelWorksheets>
                    <x:ExcelWorksheet>
                        <x:Name>Reporte</x:Name>
                        <x:WorksheetOptions>
                            <x:DisplayGridlines/>
                        </x:WorksheetOptions>
                    </x:ExcelWorksheet>
                </x:ExcelWorksheets>
            </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
            body {{ font-family: 'Segoe UI', Arial, sans-serif; }}
            th {{ background: #0d2a3c; color: #ffffff; padding: 6px 10px; border: 1px solid #1a4a6a; font-weight: bold; }}
            td {{ padding: 4px 8px; border: 1px solid #dce4ec; }}
            .header {{ background: #0a1a2b; color: #fff; padding: 10px 15px; font-size: 16pt; font-weight: bold; }}
            .header span {{ color: #12b8a6; }}
            .sub {{ color: #8ab0c8; font-size: 10pt; }}
            .meta {{ color: #6a9ab0; font-size: 8pt; }}
            .text-right {{ text-align: right; }}
            .text-left {{ text-align: left; }}
            .text-center {{ text-align: center; }}
            .totals {{ background: #0d2a3c; color: #ffffff; font-weight: bold; }}
            .totals td {{ border-color: #1a4a6a; }}
            .footer {{ color: #6a9ab0; font-size: 8pt; margin-top: 10px; }}
            .separator {{ background: #f4a016; color: #ffffff; font-weight: bold; text-align: center; }}
        </style>
    </head>
    <body>
        <div class="header">GSN · <span>Reporte {view_name}</span></div>
        <div class="sub">Control de Distribucion – {periodo_display}</div>
        <div class="meta">Generado: {now.strftime('%d/%m/%Y %H:%M')} · Registros: {len(excel_rows)}</div>
        <br>
        <table>
            <thead>
                <tr>'''
    
    for h in excel_headers:
        html += f'<th>{h}</th>'
    
    html += '</tr></thead><tbody>'
    
    for row in excel_rows:
        html += '<tr>'
        for i, cell in enumerate(row):
            if isinstance(cell, str) and cell == '--- FUEL OIL ---':
                html += f'<td colspan="{len(excel_headers)}" class="separator">--- FUEL OIL ---</td>'
                break
            
            if isinstance(cell, (int, float)):
                html += f'<td class="text-right">{cell:,.2f}</td>'
            elif isinstance(cell, str) and cell.endswith('%'):
                html += f'<td class="text-center">{cell}</td>'
            else:
                html += f'<td>{cell}</td>'
        html += '</tr>'
    
    html += f'''
            <tr class="totals">
                <td colspan="3" style="text-align:right;font-weight:bold;">TOTALES</td>
                <td class="text-right">{formato_numero_simple(total_solicitado)}</td>
                <td class="text-right">{formato_numero_simple(total_despachado)}</td>
                <td class="text-right">{formato_numero_simple(total_solicitado - total_despachado)}</td>
                <td></td>
                <td class="text-right">{formato_moneda(total_venta)}</td>
                <td class="text-right">{formato_moneda(total_margen)}</td>
                <td colspan="3"></td>
            </tr>'''
    
    html += f'''
        </tbody>
    </table>
    <br>
    <div class="footer">
        <b>Resumen:</b> 
        Solic: {formato_numero_simple(total_solicitado)} gal · 
        Desp: {formato_numero_simple(total_despachado)} gal · 
        Ventas: {formato_moneda(total_venta)} · 
        Margen: {formato_moneda(total_margen)}
        <br>
        <b>Tipos de combustible:</b> {', '.join(set([str(r[2]) for r in excel_rows if len(r) > 2 and r[2] and r[2] != '--- FUEL OIL ---'])) if len(excel_rows) > 0 and len(excel_rows[0]) > 2 else 'N/A'}
        <br>
        Total registros: {len(excel_rows)} · GSN Control de Distribucion
    </div>
    </body></html>'''
    
    return html


# ============================================================
# EXPORTAR FUNCIONES PUBLICAS
# ============================================================

__all__ = ['generar_excel_html', 'extraer_numero', 'formato_numero_simple', 'formato_moneda']