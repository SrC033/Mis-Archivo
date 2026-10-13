#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ALMACÉN DE UBICACIÓN v4.0
=========================

Servidor HTTP + Polling a Apps Script.

DOS MODOS DE OPERACIÓN:

  MODO A - Recibir (con túnel):
    Apps Script → HTTPS → Cloudflare/ngrok → Este servidor
    Requiere: túnel activo + ALMACEN_URL configurada en Apps Script

  MODO B - Polling (sin túnel):
    Este servidor → HTTP → Apps Script (cada 5s)
    Pregunta por archivos pendientes y los baja.
    NO requiere túnel.

Ambos modos conviven. El modo B siempre está activo.
El modo A se activa si alguien envía archivos al puerto 5600.
"""

import os
import sys
import json
import time
import base64
import threading
import traceback
import requests
from datetime import datetime
from urllib.parse import quote
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# ============================================================
# CONFIGURACIÓN
# ============================================================

# 🆕 URL DE APPS SCRIPT (para polling)
API_URL = 'https://script.google.com/macros/s/AKfycbxnDe8kYvrXLyOcpqqgHvTuLo2pv1gbmtO8KYF5NtpZp0-IP0DTSlbZiCswAn9fxEx5cw/exec'
CLAVE_CARPETA = 'GSN-DASHBOARD-2026'

# Servidor HTTP local
ALMACEN_PORT = 5600
ALMACEN_HOST = '0.0.0.0'
CLAVE_API = 'GSN-ALMACEN-2026'

# Polling (modo B - sin túnel)
POLLING_ACTIVO = True
POLLING_INTERVALO = 5      # segundos entre consultas
POLLING_LIMITE = 50        # mensajes por consulta
POLLING_TIMEOUT = 30       # timeout HTTP

# ============================================================
# RUTAS DEL ALMACÉN
# ============================================================
def get_almacen_base_path():
    if getattr(sys, 'frozen', False):
        base = os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    rutas_posibles = [
        os.path.join(base, 'templates', 'datos_modulos', 'ubicacion'),
        os.path.join(base, 'datos_modulos', 'ubicacion'),
        os.path.join(base, 'ubicacion'),
        os.path.join(os.path.dirname(base), 'templates', 'datos_modulos', 'ubicacion'),
    ]

    for ruta in rutas_posibles:
        if os.path.exists(ruta):
            return ruta

    ruta_default = rutas_posibles[0]
    try:
        os.makedirs(ruta_default, exist_ok=True)
    except Exception as e:
        print(f"[ALMACEN] Error creando carpeta base: {e}")
    return ruta_default

ALMACEN_PATH = get_almacen_base_path()

def get_conductores_chat_path():
    carpeta = os.path.join(ALMACEN_PATH, 'conductores_chat')
    os.makedirs(carpeta, exist_ok=True)
    return carpeta

def get_conductor_path(conductor_id):
    carpeta = os.path.join(get_conductores_chat_path(), conductor_id)
    os.makedirs(carpeta, exist_ok=True)
    return carpeta

def get_archivos_path(conductor_id):
    carpeta = os.path.join(get_conductor_path(conductor_id), 'archivos')
    os.makedirs(carpeta, exist_ok=True)
    return carpeta

def get_archivo_path(conductor_id, msg_id, nombre_original):
    ext = ''
    if nombre_original and '.' in nombre_original:
        ext = '.' + nombre_original.rsplit('.', 1)[-1]
    return os.path.join(get_archivos_path(conductor_id), msg_id + ext)

def get_mensajes_json_path(conductor_id):
    return os.path.join(get_conductor_path(conductor_id), 'mensajes.json')

def get_ubicacion_json_path(conductor_id):
    return os.path.join(get_conductor_path(conductor_id), 'ubicacion.json')

def get_conductores_json_path():
    return os.path.join(ALMACEN_PATH, 'conductores.json')

# ============================================================
# LOGS
# ============================================================
def log_info(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [ALMACEN] {msg}")

def log_ok(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [ALMACEN OK] {msg}")

def log_error(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [ALMACEN ERROR] {msg}")

def log_poll(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [POLLING] {msg}")

# ============================================================
# UTILIDADES JSON
# ============================================================
def leer_json(ruta, default=None):
    if default is None:
        default = []
    try:
        if os.path.exists(ruta):
            with open(ruta, 'r', encoding='utf-8') as f:
                return json.load(f)
        return default
    except Exception as e:
        log_error(f"Error leyendo {ruta}: {e}")
        return default

def guardar_json(ruta, data):
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        log_error(f"Error guardando {ruta}: {e}")
        return False

# ============================================================
# 🔄 COMUNICACIÓN CON APPS SCRIPT (para polling)
# ============================================================
def llamar_apps_script_get(accion, params=None):
    """GET a Apps Script"""
    try:
        url = f"{API_URL}?key={quote(CLAVE_CARPETA)}&accion={quote(accion)}&t={int(time.time()*1000)}"
        if params:
            for k, v in params.items():
                if isinstance(v, (dict, list)):
                    v = json.dumps(v)
                url += f"&{quote(str(k))}={quote(str(v))}"

        resp = requests.get(url, timeout=POLLING_TIMEOUT)
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception as e:
        log_error(f"Error GET {accion}: {e}")
        return None

def llamar_apps_script_post(datos):
    """POST a Apps Script"""
    try:
        url = f"{API_URL}?key={quote(CLAVE_CARPETA)}"
        payload = 'payload=' + quote(json.dumps(datos))
        resp = requests.post(
            url,
            data=payload,
            headers={'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
            timeout=POLLING_TIMEOUT
        )
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception as e:
        log_error(f"Error POST: {e}")
        return None

def confirmar_guardado_a_apps_script(conductor_id, msg_id):
    """Avisa a Apps Script que ya guardamos el archivo en disco"""
    try:
        data = llamar_apps_script_post({
            'accion': 'confirmar_guardado',
            'msg_id': msg_id,
            'conductor_id': conductor_id
        })
        if data and data.get('ok'):
            log_ok(f"✅ Confirmado a Apps Script: {msg_id} (liberado {data.get('liberado_kb', 0)} KB)")
            return True
        return False
    except Exception as e:
        log_error(f"Error confirmando: {e}")
        return False

# ============================================================
# 📥 GUARDAR ARCHIVO EN DISCO (usado por polling y por endpoint HTTP)
# ============================================================
def guardar_archivo_en_disco(conductor_id, msg, archivo_base64=None):
    """
    Guarda un archivo en disco desde el mensaje.
    Si archivo_base64 es None, lo toma del msg.archivo.base64
    Retorna True si se guardó.
    """
    try:
        msg_id = msg.get('id')
        archivo = msg.get('archivo', {})

        if not msg_id:
            return False

        # ¿Ya está en disco?
        ruta_archivo = get_archivo_path(conductor_id, msg_id, archivo.get('nombre', 'archivo'))
        if os.path.exists(ruta_archivo):
            log_info(f"⏭️ Ya existe en disco: {archivo.get('nombre')}")
            # Confirmar a Apps Script por si no se hizo antes
            confirmar_guardado_a_apps_script(conductor_id, msg_id)
            return True

        # ¿Viene base64?
        if archivo_base64 is None:
            archivo_base64 = archivo.get('base64')

        if not archivo_base64:
            # No hay base64 → quizá tiene fileId de Drive (ya no se usa)
            return False

        # Decodificar y guardar
        bytes_archivo = base64.b64decode(archivo_base64)
        ruta = get_archivo_path(conductor_id, msg_id, archivo.get('nombre', 'archivo'))

        with open(ruta, 'wb') as f:
            f.write(bytes_archivo)

        tamaño_mb = len(bytes_archivo) / 1024 / 1024
        log_ok(f"💾 Guardado: {archivo.get('nombre')} ({tamaño_mb:.2f} MB)")

        # Guardar/actualizar mensaje en mensajes.json local
        guardar_mensaje_local(conductor_id, msg, ruta)

        # Confirmar a Apps Script
        confirmar_guardado_a_apps_script(conductor_id, msg_id)

        return True

    except Exception as e:
        log_error(f"Error guardando archivo: {e}")
        traceback.print_exc()
        return False

def guardar_mensaje_local(conductor_id, msg, ruta_archivo=None):
    """Guarda el mensaje en mensajes.json local"""
    try:
        mensajes = leer_json(get_mensajes_json_path(conductor_id), [])

        # ¿Ya existe?
        if any(m.get('id') == msg.get('id') for m in mensajes):
            return True

        msg_local = dict(msg)
        if ruta_archivo and msg_local.get('archivo'):
            # Reemplazar base64 por ruta en disco
            msg_local['archivo'].pop('base64', None)
            msg_local['archivo']['guardado_en_disco'] = True
            msg_local['archivo']['ruta_disco'] = ruta_archivo

        mensajes.append(msg_local)
        guardar_json(get_mensajes_json_path(conductor_id), mensajes)

        # Actualizar conductores.json
        conductores = leer_json(get_conductores_json_path(), [])
        cid = msg.get('conductor_id') or conductor_id
        encontrado = False
        for c in conductores:
            if c.get('id') == cid:
                c['ultima_actividad'] = datetime.now().isoformat()
                c['activo'] = True
                encontrado = True
                break

        if not encontrado:
            conductores.append({
                'id': cid,
                'nombre': msg.get('remitente', f'Conductor {cid}'),
                'fecha_registro': datetime.now().isoformat(),
                'ultima_actividad': datetime.now().isoformat(),
                'activo': True
            })
        guardar_json(get_conductores_json_path(), conductores)

        return True
    except Exception as e:
        log_error(f"Error guardando mensaje local: {e}")
        return False

# ============================================================
# 🔄 POLLING A APPS SCRIPT (Modo B - sin túnel)
# ============================================================
_hilo_polling = None
_detener_polling = False
_stats_polling = {
    'consultas': 0,
    'archivos_guardados': 0,
    'ultima_consulta': None,
    'errores': 0
}

def procesar_pendientes():
    """Consulta Apps Script por archivos pendientes y los descarga"""
    global _stats_polling

    try:
        # 1. Obtener conductores
        data = llamar_apps_script_get('conductores_conectados')
        if not data or not data.get('ok'):
            _stats_polling['errores'] += 1
            return

        conductores = data.get('conductores', [])
        if not conductores:
            return

        # 2. Por cada conductor, revisar mensajes
        for conductor in conductores:
            conductor_id = conductor.get('id')
            if not conductor_id:
                continue

            mensajes_data = llamar_apps_script_get('mensajes_conductor', {
                'conductor_id': conductor_id,
                'limite': POLLING_LIMITE
            })

            if not mensajes_data or not mensajes_data.get('ok'):
                continue

            mensajes = mensajes_data.get('mensajes', [])

            # 3. Por cada mensaje, ver si tiene archivo pendiente
            for msg in mensajes:
                archivo = msg.get('archivo')
                if not archivo:
                    continue

                # ¿Tiene base64 pendiente?
                tiene_base64 = archivo.get('base64')
                pendiente = archivo.get('_pendienteGuardarLocal') or archivo.get('_pendienteDescarga')

                if not tiene_base64:
                    continue

                # ¿Ya está en disco?
                msg_id = msg.get('id')
                ruta_existente = get_archivo_path(conductor_id, msg_id, archivo.get('nombre', 'archivo'))
                if os.path.exists(ruta_existente):
                    confirmar_guardado_a_apps_script(conductor_id, msg_id)
                    continue

                # Descargar y guardar
                log_poll(f"📥 Pendiente: {archivo.get('nombre')} ({conductor_id})")
                if guardar_archivo_en_disco(conductor_id, msg):
                    _stats_polling['archivos_guardados'] += 1

    except Exception as e:
        log_error(f"Error en procesar_pendientes: {e}")
        _stats_polling['errores'] += 1

def loop_polling():
    """Loop principal de polling (corre en hilo separado)"""
    global _detener_polling, _stats_polling

    log_poll(f"🔄 Iniciando polling cada {POLLING_INTERVALO}s")
    log_poll(f"   API: {API_URL[:60]}...")

    while not _detener_polling:
        try:
            _stats_polling['consultas'] += 1
            _stats_polling['ultima_consulta'] = datetime.now().isoformat()

            procesar_pendientes()

        except Exception as e:
            log_error(f"Error en loop: {e}")
            _stats_polling['errores'] += 1

        # Esperar (interrumpible)
        for _ in range(POLLING_INTERVALO):
            if _detener_polling:
                break
            time.sleep(1)

    log_poll("🛑 Polling detenido")

def iniciar_polling():
    """Inicia el polling en un hilo separado"""
    global _hilo_polling, _detener_polling

    if _hilo_polling and _hilo_polling.is_alive():
        log_poll("⚠️ Polling ya está corriendo")
        return _hilo_polling

    _detener_polling = False
    _hilo_polling = threading.Thread(
        target=loop_polling,
        daemon=True,
        name='AlmacenPolling'
    )
    _hilo_polling.start()

    log_ok("✅ Polling a Apps Script INICIADO")
    return _hilo_polling

def detener_polling():
    """Detiene el polling"""
    global _detener_polling
    _detener_polling = True
    if _hilo_polling:
        _hilo_polling.join(timeout=10)

def verificar_conexion():
    """Verifica que Apps Script esté accesible"""
    log_info("🔍 Verificando conexión a Apps Script...")
    data = llamar_apps_script_get('ping')
    if data and data.get('ok'):
        log_ok(f"✅ Apps Script responde: {data.get('mensaje', 'OK')}")
        return True
    else:
        log_error("❌ Apps Script no responde")
        return False

# ============================================================
# FLASK APP (Modo A - recibir de Apps Script vía túnel)
# ============================================================
app = Flask(__name__)
CORS(app)

def verificar_clave():
    try:
        clave = request.args.get('key')
        if not clave and request.is_json:
            clave = request.json.get('key')
        return clave == CLAVE_API
    except Exception:
        return False

# ============================================================
# RUTA RAÍZ
# ============================================================
@app.route('/')
def index():
    return jsonify({
        'servicio': 'Almacén de Ubicación GSN',
        'version': '4.0',
        'status': 'running',
        'path_almacen': ALMACEN_PATH,
        'puerto': ALMACEN_PORT,
        'apps_script_url': API_URL[:60] + '...',
        'polling_activo': POLLING_ACTIVO,
        'polling_stats': _stats_polling,
        'timestamp': datetime.now().isoformat()
    })

# ============================================================
# STATUS
# ============================================================
@app.route('/almacen/status')
def status():
    try:
        conductores = leer_json(get_conductores_json_path(), [])
        info_conductores = []

        for c in conductores:
            cid = c.get('id', '')
            archivos_dir = get_archivos_path(cid)
            archivos = os.listdir(archivos_dir) if os.path.exists(archivos_dir) else []
            mensajes = leer_json(get_mensajes_json_path(cid), [])

            info_conductores.append({
                'id': cid,
                'nombre': c.get('nombre', ''),
                'archivos_en_disco': len(archivos),
                'mensajes': len(mensajes),
                'carpeta': archivos_dir
            })

        return jsonify({
            'status': 'running',
            'version': '4.0',
            'path_almacen': ALMACEN_PATH,
            'conductores_total': len(conductores),
            'conductores': info_conductores,
            'polling': {
                'activo': POLLING_ACTIVO,
                'intervalo': POLLING_INTERVALO,
                'stats': _stats_polling
            },
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        log_error(f"Error en /status: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

# ============================================================
# 📥 GUARDAR ARCHIVO (Apps Script → aquí → disco)
# ============================================================
@app.route('/almacen/archivo/guardar', methods=['POST'])
def guardar_archivo_endpoint():
    """Recibe un archivo en base64 desde Apps Script vía túnel."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'ok': False, 'error': 'No se recibieron datos'}), 400

        if not verificar_clave():
            log_error(f"Clave inválida desde {request.remote_addr}")
            return jsonify({'ok': False, 'error': 'Clave inválida'}), 401

        conductor_id = data.get('conductor_id')
        msg_id = data.get('msg_id')
        archivo_base64 = data.get('archivo_base64')

        if not conductor_id or not msg_id or not archivo_base64:
            return jsonify({'ok': False, 'error': 'Faltan campos'}), 400

        archivo_nombre = data.get('archivo_nombre', 'archivo')
        archivo_tipo = data.get('archivo_tipo', 'application/octet-stream')

        # Guardar archivo físico
        bytes_archivo = base64.b64decode(archivo_base64)
        ruta_archivo = get_archivo_path(conductor_id, msg_id, archivo_nombre)

        with open(ruta_archivo, 'wb') as f:
            f.write(bytes_archivo)

        tamaño_mb = len(bytes_archivo) / 1024 / 1024
        log_ok(f"💾 [TÚNEL] {conductor_id}/{archivo_nombre} ({tamaño_mb:.2f} MB)")

        # Guardar mensaje local
        msg = {
            'id': msg_id,
            'conductor_id': conductor_id,
            'remitente': data.get('remitente', 'Conductor'),
            'mensaje': data.get('mensaje', ''),
            'fecha': data.get('fecha', datetime.now().isoformat()),
            'archivo': {
                'nombre': archivo_nombre,
                'tipo': archivo_tipo,
                'tamanio': len(bytes_archivo),
                'clase': data.get('archivo_clase', 'documento'),
                'icono': data.get('archivo_icono', 'fa-file'),
                'color': data.get('archivo_color', '#38bdf8')
            }
        }
        guardar_mensaje_local(conductor_id, msg, ruta_archivo)

        return jsonify({
            'ok': True,
            'msg_id': msg_id,
            'ruta': ruta_archivo,
            'tamanio_bytes': len(bytes_archivo)
        })

    except Exception as e:
        log_error(f"Error en guardar_archivo: {e}")
        traceback.print_exc()
        return jsonify({'ok': False, 'error': str(e)}), 500

# ============================================================
# 📖 LEER ARCHIVO
# ============================================================
@app.route('/almacen/archivo/<conductor_id>/<msg_id>', methods=['GET'])
def leer_archivo(conductor_id, msg_id):
    try:
        carpeta = get_archivos_path(conductor_id)
        if not os.path.exists(carpeta):
            return jsonify({'ok': False, 'error': 'No existe carpeta'}), 404

        encontrado = None
        for f in os.listdir(carpeta):
            if f.startswith(msg_id + '.') or f == msg_id:
                encontrado = os.path.join(carpeta, f)
                break

        if not encontrado:
            return jsonify({'ok': False, 'error': 'Archivo no encontrado'}), 404

        if request.args.get('formato') == 'base64':
            with open(encontrado, 'rb') as f:
                bytes_archivo = f.read()
            return jsonify({
                'ok': True,
                'msg_id': msg_id,
                'conductor_id': conductor_id,
                'archivo_nombre': os.path.basename(encontrado),
                'tamanio': len(bytes_archivo),
                'base64': base64.b64encode(bytes_archivo).decode('utf-8')
            })

        return send_file(encontrado)
    except Exception as e:
        log_error(f"Error en leer_archivo: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500

# ============================================================
# 🔍 VERIFICAR
# ============================================================
@app.route('/almacen/verificar/<conductor_id>/<msg_id>', methods=['GET'])
def verificar_archivo(conductor_id, msg_id):
    try:
        carpeta = get_archivos_path(conductor_id)
        if not os.path.exists(carpeta):
            return jsonify({'ok': True, 'existe': False})

        for f in os.listdir(carpeta):
            if f.startswith(msg_id + '.') or f == msg_id:
                ruta = os.path.join(carpeta, f)
                return jsonify({
                    'ok': True,
                    'existe': True,
                    'ruta': ruta,
                    'tamanio': os.path.getsize(ruta),
                    'nombre': os.path.basename(ruta)
                })

        return jsonify({'ok': True, 'existe': False})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

# ============================================================
# 📨 MENSAJES
# ============================================================
@app.route('/almacen/mensajes/<conductor_id>', methods=['GET'])
def leer_mensajes(conductor_id):
    try:
        mensajes = leer_json(get_mensajes_json_path(conductor_id), [])
        return jsonify({
            'ok': True,
            'conductor_id': conductor_id,
            'mensajes': mensajes,
            'total': len(mensajes)
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

# ============================================================
# 📍 UBICACIÓN
# ============================================================
@app.route('/almacen/ubicacion/guardar', methods=['POST'])
def guardar_ubicacion():
    try:
        data = request.get_json()
        if not data or not verificar_clave():
            return jsonify({'ok': False, 'error': 'Sin autorización'}), 401

        conductor_id = data.get('conductor_id')
        lat = data.get('lat')
        lng = data.get('lng')

        if not conductor_id or lat is None or lng is None:
            return jsonify({'ok': False, 'error': 'Faltan datos'}), 400

        guardar_json(get_ubicacion_json_path(conductor_id), {
            'lat': float(lat),
            'lng': float(lng),
            'fecha': datetime.now().isoformat()
        })

        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@app.route('/almacen/ubicacion/<conductor_id>', methods=['GET'])
def leer_ubicacion(conductor_id):
    ubicacion = leer_json(get_ubicacion_json_path(conductor_id), None)
    if ubicacion:
        return jsonify({'ok': True, 'ubicacion': ubicacion})
    return jsonify({'ok': False, 'error': 'Sin ubicación'}), 404

# ============================================================
# 👥 CONDUCTORES
# ============================================================
@app.route('/almacen/conductores', methods=['GET'])
def leer_conductores():
    try:
        conductores = leer_json(get_conductores_json_path(), [])
        return jsonify({'ok': True, 'conductores': conductores, 'total': len(conductores)})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

# ============================================================
# 🗑️ ELIMINAR
# ============================================================
@app.route('/almacen/archivo/<conductor_id>/<msg_id>', methods=['DELETE'])
def eliminar_archivo(conductor_id, msg_id):
    try:
        carpeta = get_archivos_path(conductor_id)
        if not os.path.exists(carpeta):
            return jsonify({'ok': False, 'error': 'No existe'}), 404

        for f in os.listdir(carpeta):
            if f.startswith(msg_id + '.') or f == msg_id:
                os.remove(os.path.join(carpeta, f))
                log_info(f"🗑️ Eliminado: {f}")
                return jsonify({'ok': True, 'mensaje': 'Archivo eliminado'})

        return jsonify({'ok': False, 'error': 'No encontrado'}), 404
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

# ============================================================
# 🧹 LIMPIAR HUÉRFANOS
# ============================================================
@app.route('/almacen/limpiar', methods=['POST'])
def limpiar_huerfanos():
    try:
        conductores = leer_json(get_conductores_json_path(), [])
        total_eliminados = 0

        for conductor in conductores:
            cid = conductor.get('id')
            if not cid:
                continue

            mensajes = leer_json(get_mensajes_json_path(cid), [])
            ids_mensajes = {m.get('id') for m in mensajes if m.get('id')}

            carpeta = get_archivos_path(cid)
            if not os.path.exists(carpeta):
                continue

            for archivo in os.listdir(carpeta):
                msg_id = archivo.rsplit('.', 1)[0] if '.' in archivo else archivo
                if msg_id not in ids_mensajes:
                    try:
                        os.remove(os.path.join(carpeta, archivo))
                        total_eliminados += 1
                    except Exception:
                        pass

        return jsonify({
            'ok': True,
            'eliminados': total_eliminados,
            'mensaje': f'{total_eliminados} archivos huérfanos eliminados'
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

# ============================================================
# DIAGNÓSTICO
# ============================================================
@app.route('/almacen/debug', methods=['GET'])
def debug():
    try:
        resultado = {
            'version': '4.0',
            'path_almacen': ALMACEN_PATH,
            'existe': os.path.exists(ALMACEN_PATH),
            'apps_script_url': API_URL,
            'polling_activo': POLLING_ACTIVO,
            'polling_stats': _stats_polling,
            'conductores': []
        }

        if os.path.exists(get_conductores_chat_path()):
            for cid in os.listdir(get_conductores_chat_path()):
                cpath = get_conductor_path(cid)
                if not os.path.isdir(cpath):
                    continue

                archivos = []
                archivos_path = get_archivos_path(cid)
                if os.path.exists(archivos_path):
                    for f in os.listdir(archivos_path):
                        ruta = os.path.join(archivos_path, f)
                        archivos.append({
                            'nombre': f,
                            'tamanio_kb': round(os.path.getsize(ruta) / 1024, 2)
                        })

                resultado['conductores'].append({
                    'id': cid,
                    'carpeta': cpath,
                    'archivos': archivos,
                    'total_archivos': len(archivos),
                    'tiene_mensajes_json': os.path.exists(get_mensajes_json_path(cid)),
                    'tiene_ubicacion_json': os.path.exists(get_ubicacion_json_path(cid))
                })

        return jsonify(resultado)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================================
# 🆕 FORZAR DESCARGA MANUAL
# ============================================================
@app.route('/almacen/forzar_descarga', methods=['POST'])
def forzar_descarga():
    """Fuerza una consulta inmediata a Apps Script (útil para debugging)"""
    try:
        log_info("🔍 Forzando descarga manual...")
        procesar_pendientes()
        return jsonify({
            'ok': True,
            'mensaje': 'Consulta forzada ejecutada',
            'stats': _stats_polling
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

# ============================================================
# INICIAR SERVIDOR
# ============================================================
def iniciar_almacen(host=ALMACEN_HOST, port=ALMACEN_PORT):
    log_info("═══════════════════════════════════════════════")
    log_info("📦 ALMACÉN DE UBICACIÓN v4.0")
    log_info(f"   Path: {ALMACEN_PATH}")
    log_info(f"   Host: {host}")
    log_info(f"   Puerto: {port}")
    log_info(f"   Clave: {CLAVE_API}")
    log_info(f"   Apps Script: {API_URL[:60]}...")
    log_info(f"   Polling: {'ACTIVO' if POLLING_ACTIVO else 'INACTIVO'} cada {POLLING_INTERVALO}s")
    log_info("═══════════════════════════════════════════════")

    try:
        app.run(
            host=host,
            port=port,
            debug=False,
            use_reloader=False,
            threaded=True
        )
    except Exception as e:
        log_error(f"Error iniciando servidor: {e}")
        traceback.print_exc()

def iniciar_almacen_thread(host=ALMACEN_HOST, port=ALMACEN_PORT):
    """Inicia TODO: servidor HTTP + polling"""
    # 1. Verificar conexión a Apps Script
    try:
        verificar_conexion()
    except Exception as e:
        log_error(f"Error verificando conexión: {e}")

    # 2. Iniciar polling (Modo B)
    if POLLING_ACTIVO:
        iniciar_polling()

    # 3. Iniciar servidor HTTP (Modo A)
    hilo = threading.Thread(
        target=iniciar_almacen,
        args=(host, port),
        daemon=True,
        name='AlmacenHTTP'
    )
    hilo.start()

    log_ok("✅ Almacén v4.0 iniciado (HTTP + Polling)")
    log_info(f"   🌐 Local: http://127.0.0.1:{port}/")
    log_info(f"   🌐 Status: http://127.0.0.1:{port}/almacen/status")
    log_info(f"   🌐 Debug: http://127.0.0.1:{port}/almacen/debug")
    log_info(f"   🔄 Polling cada {POLLING_INTERVALO}s a Apps Script")

    return hilo

# ============================================================
# MAIN (para probar standalone)
# ============================================================
if __name__ == '__main__':
    print("=" * 60)
    print("ALMACÉN DE UBICACIÓN v4.0 - Modo Standalone")
    print("=" * 60)
    print(f"URL local:      http://127.0.0.1:{ALMACEN_PORT}/")
    print(f"Status:         http://127.0.0.1:{ALMACEN_PORT}/almacen/status")
    print(f"Debug:          http://127.0.0.1:{ALMACEN_PORT}/almacen/debug")
    print(f"Forzar:         POST http://127.0.0.1:{ALMACEN_PORT}/almacen/forzar_descarga")
    print(f"Path:           {ALMACEN_PATH}")
    print(f"Apps Script:    {API_URL[:60]}...")
    print(f"Polling:        cada {POLLING_INTERVALO}s")
    print("=" * 60)
    print("Presiona Ctrl+C para detener")
    print("=" * 60)

    # Verificar conexión primero
    verificar_conexion()

    # Iniciar polling
    iniciar_polling()

    # Iniciar servidor (bloqueante)
    iniciar_almacen()