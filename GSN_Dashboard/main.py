#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import threading
import time
import socket
import ctypes
import json
import signal
import importlib.util
from datetime import datetime
from urllib.parse import unquote
from flask import Flask, send_file, request, jsonify, redirect
from flask_cors import CORS

# ============================================================
# OCULTAR CONSOLA EN WINDOWS
# ============================================================
def ocultar_consola():
    try:
        if sys.platform == 'win32':
            hwnd = ctypes.windll.kernel32.GetConsoleWindow()
            if hwnd:
                ctypes.windll.user32.ShowWindow(hwnd, 0)
    except:
        pass

if getattr(sys, 'frozen', False):
    ocultar_consola()

# ============================================================
# RUTA BASE
# ============================================================
def get_base_path():
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

BASE_PATH = get_base_path()

# ============================================================
# RUTA FIJA A ia.py
# ============================================================
RUTA_IA_PY = r"C:\Users\PC\Documents\GSN_Combustible_DAashboard\modulos\ia\ia.py"

# Fallbacks por si el proyecto se mueve
RUTAS_IA_FALLBACK = [
    RUTA_IA_PY,
    os.path.join(BASE_PATH, "modulos", "ia", "ia.py"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "modulos", "ia", "ia.py"),
]

def encontrar_ia_py():
    for ruta in RUTAS_IA_FALLBACK:
        if os.path.exists(ruta):
            return ruta
    return None

# ============================================================
# AGREGAR RUTAS DE MODULOS A sys.path (para excel.py, pdf.py, etc.)
# ============================================================
def agregar_rutas_modulos():
    rutas = [
        os.path.join(BASE_PATH, "modulos"),
        os.path.join(BASE_PATH, "modulos", "ia"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "modulos"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "modulos", "ia"),
    ]
    for ruta in rutas:
        if os.path.exists(ruta) and ruta not in sys.path:
            sys.path.insert(0, ruta)
            print(f"Ruta agregada: {ruta}")

agregar_rutas_modulos()

# ============================================================
# VARIABLES GLOBALES
# ============================================================
IA = None
IA_INITIALIZED = False
SERVIDOR_IA_ACTIVO = False

# ============================================================
# CAPTURAR SEÑALES DE CIERRE
# ============================================================
def limpiar_procesos():
    global IA, IA_INITIALIZED, SERVIDOR_IA_ACTIVO
    print("\nCerrando procesos...")
    SERVIDOR_IA_ACTIVO = False
    if IA:
        try:
            IA.detener()
            print("IA detenida")
        except Exception as e:
            print(f"Error deteniendo IA: {e}")
        IA = None
    IA_INITIALIZED = False
    print("Todos los procesos cerrados")

def setup_signal_handlers():
    def signal_handler(signum, frame):
        print("\nSeñal de cierre recibida")
        limpiar_procesos()
        sys.exit(0)
    try:
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    except:
        pass

# ============================================================
# CREAR CARPETAS
# ============================================================
def crear_carpetas():
    if getattr(sys, 'frozen', False):
        app_path = os.path.dirname(sys.executable)
    else:
        app_path = os.path.dirname(os.path.abspath(__file__))

    carpetas = {
        'excel': os.path.join(app_path, "excel_informes"),
        'pdf': os.path.join(app_path, "reporte_pdf"),
        'logs': os.path.join(app_path, "logs"),
        'datos_modulos': os.path.join(app_path, "templates", "datos_modulos"),
        'datos_mensuales': os.path.join(app_path, "templates", "datos_modulos", "mensuales"),
        'datos_mayoreo': os.path.join(app_path, "templates", "datos_modulos", "mensuales", "mayoreo"),
        'datos_fuel': os.path.join(app_path, "templates", "datos_modulos", "mensuales", "fuelOil"),
        'ubicacion': os.path.join(app_path, "templates", "datos_modulos", "ubicacion"),
        'conductores_chat': os.path.join(app_path, "templates", "datos_modulos", "ubicacion", "conductores_chat"),
    }
    for nombre, ruta in carpetas.items():
        try:
            if not os.path.exists(ruta):
                os.makedirs(ruta)
                print(f"Carpeta creada: {ruta}")
        except Exception as e:
            print(f"Error creando carpeta {nombre}: {e}")
    return carpetas

CARPETAS = crear_carpetas()

# ============================================================
# LOGGING
# ============================================================
def configurar_logging():
    try:
        log_file = os.path.join(CARPETAS['logs'], f"gsn_{datetime.now().strftime('%Y%m%d')}.log")
        import logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file, encoding='utf-8'),
                logging.StreamHandler()
            ]
        )
        return logging.getLogger(__name__)
    except:
        return None

logger = configurar_logging()

def log_info(m):
    if logger: logger.info(m)
    else: print(f"INFO: {m}")

def log_error(m):
    if logger: logger.error(m)
    else: print(f"ERROR: {m}")

def log_warning(m):
    if logger: logger.warning(m)
    else: print(f"WARNING: {m}")

# ============================================================
# RUTAS DE ARCHIVOS
# ============================================================
def get_conductores_path():
    return os.path.join(CARPETAS['ubicacion'], 'conductores.json')

def get_chat_conductor_path(conductor_id):
    carpeta = os.path.join(CARPETAS['conductores_chat'], conductor_id)
    if not os.path.exists(carpeta):
        os.makedirs(carpeta)
    return carpeta

def get_mensajes_conductor_path(conductor_id):
    return os.path.join(get_chat_conductor_path(conductor_id), 'mensajes.json')

def get_ubicacion_conductor_path(conductor_id):
    return os.path.join(get_chat_conductor_path(conductor_id), 'ubicacion.json')

def get_cache_archivo_path(conductor_id, msg_id):
    carpeta = os.path.join(get_chat_conductor_path(conductor_id), 'archivos_cache')
    if not os.path.exists(carpeta):
        os.makedirs(carpeta)
    return os.path.join(carpeta, f"{msg_id}.json")

# ============================================================
# CONDUCTORES
# ============================================================
def cargar_conductores():
    ruta = get_conductores_path()
    try:
        if os.path.exists(ruta):
            with open(ruta, 'r', encoding='utf-8') as f:
                return json.load(f)
        else:
            guardar_conductores([])
            return []
    except Exception as e:
        log_error(f"Error cargando conductores: {e}")
        return []

def guardar_conductores(conductores):
    ruta = get_conductores_path()
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, 'w', encoding='utf-8') as f:
            json.dump(conductores, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        log_error(f"Error guardando conductores: {e}")
        return False

def get_conductor_by_id(cid, conductores):
    for c in conductores:
        if c.get('id') == cid:
            return c
    return None

def get_conductor_by_nombre(nombre, conductores):
    for c in conductores:
        if c.get('nombre', '').lower() == nombre.lower():
            return c
    return None

def generar_id_conductor(conductores):
    nums = [int(c.get('id', 'CON-000').replace('CON-', ''))
            for c in conductores if c.get('id', '').startswith('CON-')]
    return f"CON-{str(max(nums) + 1).zfill(3)}" if nums else "CON-001"

def actualizar_actividad_conductor(cid):
    conductores = cargar_conductores()
    c = get_conductor_by_id(cid, conductores)
    if c:
        c['ultima_actividad'] = datetime.now().isoformat()
        guardar_conductores(conductores)
        return True
    return False

# ============================================================
# MENSAJES
# ============================================================
def cargar_mensajes_conductor(cid):
    ruta = get_mensajes_conductor_path(cid)
    try:
        if os.path.exists(ruta):
            with open(ruta, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []
    except Exception as e:
        log_error(f"Error cargando mensajes de {cid}: {e}")
        return []

def guardar_mensajes_conductor(cid, mensajes):
    ruta = get_mensajes_conductor_path(cid)
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, 'w', encoding='utf-8') as f:
            json.dump(mensajes, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        log_error(f"Error guardando mensajes de {cid}: {e}")
        return False

# ============================================================
# UBICACION
# ============================================================
def guardar_ubicacion_conductor(cid, lat, lng):
    ruta = get_ubicacion_conductor_path(cid)
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, 'w', encoding='utf-8') as f:
            json.dump({'lat': lat, 'lng': lng, 'fecha': datetime.now().isoformat()},
                      f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        log_error(f"Error guardando ubicación de {cid}: {e}")
        return False

def cargar_ubicacion_conductor(cid):
    ruta = get_ubicacion_conductor_path(cid)
    try:
        if os.path.exists(ruta):
            with open(ruta, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None
    except Exception as e:
        log_error(f"Error cargando ubicación de {cid}: {e}")
        return None

# ============================================================
# BUSCAR TEMPLATES
# ============================================================
TEMPLATES_PATH = None

RUTAS_TEMPLATES_CANDIDATAS = [
    r"C:\Users\PC\Documents\GSN_Combustible_DAashboard\templates",
    os.path.join(BASE_PATH, "templates"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates"),
    os.path.join(os.getcwd(), "templates"),
    BASE_PATH,
]

if getattr(sys, 'frozen', False):
    exe_dir = os.path.dirname(sys.executable)
    RUTAS_TEMPLATES_CANDIDATAS.insert(0, os.path.join(exe_dir, "templates"))
    RUTAS_TEMPLATES_CANDIDATAS.insert(1, exe_dir)
    RUTAS_TEMPLATES_CANDIDATAS.insert(2, sys._MEIPASS)

for ruta in RUTAS_TEMPLATES_CANDIDATAS:
    if not os.path.exists(ruta):
        continue
    for html in [
        os.path.join(ruta, "index.html"),
        os.path.join(ruta, "modulos", "main.html"),
        os.path.join(ruta, "modulos", "MODULOS_C", "DASHBOARD", "resumen_ejecutivo.html"),
        os.path.join(ruta, "main.html"),
        os.path.join(ruta, "dashboard.html"),
    ]:
        if os.path.exists(html):
            TEMPLATES_PATH = ruta
            log_info(f"✅ Templates encontrados en: {ruta}")
            log_info(f"   Archivo detectado: {html}")
            break
    if TEMPLATES_PATH:
        break

if TEMPLATES_PATH is None:
    TEMPLATES_PATH = BASE_PATH
    log_warning(f"⚠️ Usando directorio base como fallback: {TEMPLATES_PATH}")

log_info(f"Templates path: {TEMPLATES_PATH}")

INDEX_HTML_FULL = os.path.join(TEMPLATES_PATH, "index.html")
INDEX_HTML_EXISTS = os.path.exists(INDEX_HTML_FULL)

MAIN_HTML_FULL = os.path.join(TEMPLATES_PATH, "modulos", "main.html")
MAIN_HTML_EXISTS = os.path.exists(MAIN_HTML_FULL)

MODULOS_C_PATH = os.path.join(TEMPLATES_PATH, "modulos", "MODULOS_C")
MODULOS_C_EXISTS = os.path.exists(MODULOS_C_PATH)

# Actualizar carpetas con la ruta correcta de templates
CARPETAS['datos_modulos'] = os.path.join(TEMPLATES_PATH, 'datos_modulos')
CARPETAS['datos_mensuales'] = os.path.join(CARPETAS['datos_modulos'], 'mensuales')
CARPETAS['datos_mayoreo'] = os.path.join(CARPETAS['datos_mensuales'], 'mayoreo')
CARPETAS['datos_fuel'] = os.path.join(CARPETAS['datos_mensuales'], 'fuelOil')
CARPETAS['ubicacion'] = os.path.join(CARPETAS['datos_modulos'], 'ubicacion')
CARPETAS['conductores_chat'] = os.path.join(CARPETAS['ubicacion'], 'conductores_chat')

for carpeta in [CARPETAS['datos_modulos'], CARPETAS['datos_mensuales'],
                CARPETAS['datos_mayoreo'], CARPETAS['datos_fuel'],
                CARPETAS['ubicacion'], CARPETAS['conductores_chat']]:
    if not os.path.exists(carpeta):
        try:
            os.makedirs(carpeta)
        except:
            pass

# ============================================================
# IMPORTAR MODULOS DE EXPORTACION (excel.py / pdf.py)
# ============================================================
MODULOS_EXPORT = None

def importar_modulos_exportacion():
    global MODULOS_EXPORT
    try:
        modulos_path = os.path.join(BASE_PATH, "modulos")
        if modulos_path not in sys.path:
            sys.path.insert(0, modulos_path)

        from excel import generar_excel_html, extraer_numero, formato_numero_simple, formato_moneda
        from pdf import generar_pdf_con_pie

        MODULOS_EXPORT = {
            'generar_excel_html': generar_excel_html,
            'extraer_numero': extraer_numero,
            'formato_numero_simple': formato_numero_simple,
            'formato_moneda': formato_moneda,
            'generar_pdf_con_pie': generar_pdf_con_pie,
        }
        log_info("✅ Módulos de exportación importados")
        return MODULOS_EXPORT
    except ImportError as e:
        log_error(f"❌ Error importando módulos de exportación: {e}")
        MODULOS_EXPORT = None
        return None

importar_modulos_exportacion()

# ============================================================
# BUSCAR PUERTO
# ============================================================
def encontrar_puerto(puerto_inicial=5500, max_intentos=10):
    for puerto in range(puerto_inicial, puerto_inicial + max_intentos):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('127.0.0.1', puerto))
                return puerto
        except OSError:
            continue
    return 5500

PORT = encontrar_puerto()
log_info(f"Puerto asignado: {PORT}")

# ============================================================
# CARGAR ia.py POR RUTA ABSOLUTA (importlib)
# ============================================================
IA = None
IA_INITIALIZED = False

def cargar_modulo_ia():
    """
    Carga modulos/ia/ia.py por RUTA ABSOLUTA usando importlib,
    ignorando cualquier otro ia.py que esté en sys.path.

    Devuelve el módulo o None.
    """
    ruta_ia = encontrar_ia_py()

    if not ruta_ia:
        log_error("❌ No se encontró ia.py en ninguna de estas rutas:")
        for r in RUTAS_IA_FALLBACK:
            log_error(f"   - {r}")
        return None

    log_info(f"📄 Cargando IA desde: {ruta_ia}")

    try:
        spec = importlib.util.spec_from_file_location("ia_gsn_modulo", ruta_ia)
        if spec is None or spec.loader is None:
            log_error("❌ No se pudo crear spec para ia.py")
            return None

        ia_module = importlib.util.module_from_spec(spec)
        sys.modules["ia_gsn_modulo"] = ia_module
        spec.loader.exec_module(ia_module)
        log_info("✅ ia.py cargado correctamente")
        return ia_module

    except Exception as e:
        log_error(f"❌ Error cargando ia.py: {e}")
        import traceback
        log_error(traceback.format_exc())
        return None


def inicializar_ia():
    """
    Carga ia.py, verifica que exporte crear_ia, crea la instancia
    y la inicia (carga el modelo con llama-cpp-python).
    """
    global IA, IA_INITIALIZED

    log_info("Inicializando IA (llama-cpp-python)...")
    t0 = time.time()

    ia_module = cargar_modulo_ia()
    if ia_module is None:
        return False

    # Verificar que exporta crear_ia a nivel de módulo
    crear_ia_func = getattr(ia_module, 'crear_ia', None)
    if not callable(crear_ia_func):
        log_error("❌ ia.py no exporta crear_ia() a nivel de módulo")
        atributos = [a for a in dir(ia_module) if not a.startswith('_')]
        log_error(f"   Atributos disponibles: {atributos}")
        return False

    # Crear instancia
    try:
        ia_instancia = crear_ia_func(puerto=PORT)
    except Exception as e:
        log_error(f"❌ Error en crear_ia(): {e}")
        import traceback
        log_error(traceback.format_exc())
        return False

    # Iniciar (carga el modelo)
    try:
        if ia_instancia.iniciar():
            IA = ia_instancia
            IA_INITIALIZED = True
            log_info(f"✅ IA lista en {time.time() - t0:.1f}s")
            try:
                info = IA.get_info_modelo()
                log_info(f"   Modelo: {info.get('modelo')}")
                log_info(f"   Tipo:   {info.get('tipo')} | {info.get('cuantizacion')}")
                log_info(f"   Ctx:    {info.get('contexto')} | Threads: {info.get('threads')}")
            except Exception:
                pass
            return True
        else:
            log_error(f"❌ IA no pudo iniciar tras {time.time() - t0:.1f}s")
            return False
    except Exception as e:
        log_error(f"❌ Excepción iniciando IA: {e}")
        import traceback
        log_error(traceback.format_exc())
        return False


def _background_ia():
    try:
        inicializar_ia()
    except Exception as e:
        log_error(f"Error en background IA: {e}")
        import traceback
        log_error(traceback.format_exc())

# ============================================================
# SERVIDOR FLASK
# ============================================================
app = Flask(__name__, static_folder=TEMPLATES_PATH, static_url_path='')
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024

import logging
logging.getLogger('werkzeug').setLevel(logging.ERROR)

# ============================================================
# RUTAS PRINCIPALES
# ============================================================
@app.route('/')
def index():
    ruta_index = os.path.join(TEMPLATES_PATH, "index.html")
    if os.path.exists(ruta_index):
        return send_file(ruta_index)
    ruta_main = os.path.join(TEMPLATES_PATH, "modulos", "main.html")
    if os.path.exists(ruta_main):
        return redirect('/modulos/main.html')
    for rel in ["main.html", "dashboard.html"]:
        ruta = os.path.join(TEMPLATES_PATH, rel)
        if os.path.exists(ruta):
            return send_file(ruta)
    return jsonify({
        'error': 'No se encontró el dashboard',
        'templates_path': TEMPLATES_PATH,
    }), 404

@app.route('/<path:path>')
def serve_static(path):
    if '..' in path or path.startswith('/'):
        return jsonify({'error': 'Ruta invalida'}), 400

    path_decoded = unquote(path)
    ubicaciones = [
        os.path.join(TEMPLATES_PATH, path_decoded),
        os.path.join(TEMPLATES_PATH, "modulos", path_decoded),
        os.path.join(TEMPLATES_PATH, "modulos", "MODULOS_C", path_decoded),
        os.path.join(BASE_PATH, path_decoded),
        os.path.join(BASE_PATH, "templates", path_decoded),
        os.path.join(BASE_PATH, "templates", "modulos", path_decoded),
        os.path.join(BASE_PATH, "templates", "modulos", "MODULOS_C", path_decoded),
    ]
    for ruta in ubicaciones:
        if os.path.exists(ruta) and os.path.isfile(ruta):
            return send_file(ruta)

    try:
        nombre = os.path.basename(path_decoded)
        path_norm = path_decoded.replace('\\', '/')
        for root, dirs, files in os.walk(TEMPLATES_PATH):
            if nombre in files:
                ruta_completa = os.path.join(root, nombre)
                if ruta_completa.replace('\\', '/').endswith(path_norm):
                    return send_file(ruta_completa)
    except Exception as e:
        log_error(f"Error en búsqueda recursiva: {e}")

    log_warning(f"404: {path_decoded}")
    return jsonify({'error': 'Archivo no encontrado', 'path': path_decoded}), 404

# ============================================================
# ENDPOINT PRINCIPAL /api/chat  → llama a ia.py
# ============================================================
@app.route('/api/chat', methods=['POST'])
def api_chat():
    try:
        data = request.get_json(silent=True) or {}

        mensaje = data.get('mensaje', '') or ''
        imagen = data.get('imagen', '') or ''
        imagen_nombre = data.get('imagen_nombre', 'imagen') or 'imagen'
        datos_frontend = data.get('datos_frontend', '') or ''

        if not mensaje.strip() and not imagen:
            return jsonify({'success': False, 'reply': 'No has escrito ningún mensaje.'}), 400

        log_info(f"📨 /api/chat: mensaje={len(mensaje)} chars | "
                 f"imagen={len(imagen)} b | datos_frontend={len(datos_frontend)} chars")

        global IA, IA_INITIALIZED

        if not IA_INITIALIZED or IA is None:
            return jsonify({
                'success': False,
                'reply': 'El servidor de IA aún no está listo. Espera unos segundos e inténtalo de nuevo.',
                'error': 'ia_not_initialized',
            }), 503

        if not IA.esta_activo():
            log_warning("⚠️ IA no responde, intentando reiniciar...")
            if IA.iniciar():
                log_info("✅ IA reiniciada")
            else:
                return jsonify({
                    'success': False,
                    'reply': 'El motor de IA no está disponible.',
                    'error': 'server_offline',
                }), 503

        try:
            resultado = IA.enviar_mensaje(mensaje, imagen, imagen_nombre, datos_frontend)
        except Exception as e:
            log_error(f"❌ Error ejecutando IA: {e}")
            import traceback
            log_error(traceback.format_exc())
            return jsonify({
                'success': False,
                'reply': f'Error en el servidor de IA: {e}',
                'error': 'ia_exception',
            }), 500

        return jsonify(resultado)

    except Exception as e:
        log_error(f"❌ Error en /api/chat: {e}")
        import traceback
        log_error(traceback.format_exc())
        return jsonify({
            'success': False,
            'reply': f'Error interno: {e}',
            'error': 'internal_error',
        }), 500

# ============================================================
# LIMPIAR HISTORIAL DE LA IA
# ============================================================
@app.route('/api/chat/limpiar', methods=['POST'])
def api_chat_limpiar():
    global IA
    if IA and IA_INITIALIZED:
        try:
            IA.limpiar_historial()
            return jsonify({'success': True, 'mensaje': 'Historial limpiado'})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    return jsonify({'success': False, 'error': 'IA no inicializada'}), 503

# ============================================================
# ESTADO
# ============================================================
@app.route('/api/status', methods=['GET'])
def api_status():
    try:
        conductores = cargar_conductores()
        ia_ok = False
        if IA_INITIALIZED and IA is not None:
            try:
                ia_ok = IA.esta_activo()
            except Exception:
                ia_ok = False

        info_modelo = {}
        if IA and IA_INITIALIZED:
            try:
                info_modelo = IA.get_info_modelo()
            except Exception:
                pass

        return jsonify({
            'status': 'running',
            'port': PORT,
            'ia_available': ia_ok,
            'ia_mode': 'llama-cpp-python-in-process',
            'ia_info': info_modelo,
            'ia_py_path': encontrar_ia_py(),
            'version': '4.0',
            'templates_path': TEMPLATES_PATH,
            'index_html_exists': INDEX_HTML_EXISTS,
            'main_html_exists': MAIN_HTML_EXISTS,
            'modulos_c_exists': MODULOS_C_EXISTS,
            'timestamp': datetime.now().isoformat(),
            'conductores_total': len(conductores),
            'conductores_path': get_conductores_path(),
            'chat_path': CARPETAS['conductores_chat'],
        })
    except Exception as e:
        log_error(f"Error en /api/status: {e}")
        return jsonify({'status': 'running', 'ia_available': False, 'error': str(e)}), 500

# ============================================================
# ENDPOINTS DE CONDUCTORES
# ============================================================
@app.route('/api/conductores', methods=['GET'])
def api_get_conductores():
    try:
        conductores = cargar_conductores()
        ahora = datetime.now()
        activos = []
        for c in conductores:
            ultima = c.get('ultima_actividad')
            if ultima:
                try:
                    if (ahora - datetime.fromisoformat(ultima)).total_seconds() < 300:
                        activos.append(c)
                except:
                    pass
        return jsonify({'success': True, 'conductores': activos,
                        'total': len(activos), 'todos': len(conductores)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/conductores/todos', methods=['GET'])
def api_get_conductores_todos():
    try:
        conductores = cargar_conductores()
        return jsonify({'success': True, 'conductores': conductores, 'total': len(conductores)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/conductores', methods=['POST'])
def api_add_conductor():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
        nombre = data.get('nombre', '').strip()
        if not nombre:
            return jsonify({'success': False, 'error': 'El nombre es obligatorio'}), 400
        conductores = cargar_conductores()
        if get_conductor_by_nombre(nombre, conductores):
            return jsonify({'success': False, 'error': f'Ya existe "{nombre}"'}), 400
        cid = data.get('id', '').strip() or generar_id_conductor(conductores)
        nuevo = {
            'id': cid, 'nombre': nombre,
            'fecha_registro': datetime.now().isoformat(),
            'ultima_actividad': datetime.now().isoformat(),
        }
        conductores.append(nuevo)
        if guardar_conductores(conductores):
            return jsonify({'success': True, 'conductor': nuevo})
        return jsonify({'success': False, 'error': 'Error guardando'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/conductores/<cid>', methods=['DELETE'])
def api_delete_conductor(cid):
    try:
        conductores = cargar_conductores()
        if not get_conductor_by_id(cid, conductores):
            return jsonify({'success': False, 'error': 'No encontrado'}), 404
        conductores = [c for c in conductores if c.get('id') != cid]
        if guardar_conductores(conductores):
            return jsonify({'success': True})
        return jsonify({'success': False, 'error': 'Error guardando'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/conductores/<cid>', methods=['PUT'])
def api_update_conductor(cid):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data'}), 400
        nuevo = data.get('nombre', '').strip()
        if not nuevo:
            return jsonify({'success': False, 'error': 'Nombre obligatorio'}), 400
        conductores = cargar_conductores()
        c = get_conductor_by_id(cid, conductores)
        if not c:
            return jsonify({'success': False, 'error': 'No encontrado'}), 404
        c['nombre'] = nuevo
        c['fecha_actualizacion'] = datetime.now().isoformat()
        if guardar_conductores(conductores):
            return jsonify({'success': True, 'conductor': c})
        return jsonify({'success': False, 'error': 'Error guardando'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/conductores/verificar/<nombre>', methods=['GET'])
def api_verificar_conductor(nombre):
    try:
        conductores = cargar_conductores()
        c = get_conductor_by_nombre(nombre, conductores)
        return jsonify({'success': True, 'existe': bool(c), 'conductor': c})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ============================================================
# ENDPOINTS DE MENSAJES
# ============================================================
@app.route('/api/mensajes/<cid>', methods=['GET'])
def api_get_mensajes(cid):
    try:
        mensajes = cargar_mensajes_conductor(cid)
        return jsonify({'success': True, 'conductor_id': cid,
                        'mensajes': mensajes, 'total': len(mensajes)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/mensajes/<cid>', methods=['POST'])
def api_add_mensaje(cid):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data'}), 400
        mensaje = data.get('mensaje', '')
        if not mensaje:
            return jsonify({'success': False, 'error': 'Mensaje obligatorio'}), 400
        mensajes = cargar_mensajes_conductor(cid)
        nuevo = {
            'id': f"msg_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{len(mensajes)+1}",
            'remitente': data.get('remitente', 'Conductor'),
            'mensaje': mensaje,
            'fecha': datetime.now().isoformat(),
            'ubicacion': data.get('ubicacion'),
            'leido': False,
        }
        mensajes.append(nuevo)
        if guardar_mensajes_conductor(cid, mensajes):
            actualizar_actividad_conductor(cid)
            return jsonify({'success': True, 'mensaje': nuevo, 'total': len(mensajes)})
        return jsonify({'success': False, 'error': 'Error guardando'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/mensajes/<cid>/<msg_id>', methods=['DELETE'])
def api_delete_mensaje(cid, msg_id):
    try:
        mensajes = cargar_mensajes_conductor(cid)
        filtrados = [m for m in mensajes if m.get('id') != msg_id]
        if len(filtrados) == len(mensajes):
            return jsonify({'success': False, 'error': 'No encontrado'}), 404
        if guardar_mensajes_conductor(cid, filtrados):
            return jsonify({'success': True})
        return jsonify({'success': False, 'error': 'Error guardando'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/mensajes/<cid>/limpiar', methods=['DELETE'])
def api_limpiar_mensajes(cid):
    try:
        if guardar_mensajes_conductor(cid, []):
            return jsonify({'success': True})
        return jsonify({'success': False, 'error': 'Error'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ============================================================
# ENDPOINTS DE UBICACIÓN
# ============================================================
@app.route('/api/ubicacion/<cid>', methods=['GET'])
def api_get_ubicacion(cid):
    try:
        u = cargar_ubicacion_conductor(cid)
        if u:
            return jsonify({'success': True, 'conductor_id': cid, 'ubicacion': u})
        return jsonify({'success': False, 'error': 'No disponible'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/ubicacion/<cid>', methods=['POST'])
def api_set_ubicacion(cid):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data'}), 400
        lat, lng = data.get('lat'), data.get('lng')
        if lat is None or lng is None:
            return jsonify({'success': False, 'error': 'lat y lng requeridos'}), 400
        if guardar_ubicacion_conductor(cid, lat, lng):
            actualizar_actividad_conductor(cid)
            return jsonify({'success': True})
        return jsonify({'success': False, 'error': 'Error guardando'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ============================================================
# CACHE DE ARCHIVOS
# ============================================================
@app.route('/api/cache/archivo', methods=['POST'])
def api_cache_archivo():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data'}), 400
        msg_id = data.get('msg_id')
        cid = data.get('conductor_id')
        b64 = data.get('archivo_base64')
        if not msg_id or not cid or not b64:
            return jsonify({'success': False, 'error': 'Faltan campos'}), 400
        ruta = get_cache_archivo_path(cid, msg_id)
        with open(ruta, 'w', encoding='utf-8') as f:
            json.dump({
                'msg_id': msg_id, 'conductor_id': cid,
                'archivo_nombre': data.get('archivo_nombre', 'archivo'),
                'archivo_tipo': data.get('archivo_tipo', 'application/octet-stream'),
                'archivo_tamanio': data.get('archivo_tamanio', 0),
                'archivo_base64': b64,
                'fecha_cache': datetime.now().isoformat(),
            }, f, ensure_ascii=False)
        return jsonify({'success': True, 'msg_id': msg_id, 'ruta': ruta})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cache/archivo/<cid>/<msg_id>', methods=['GET'])
def api_leer_cache(cid, msg_id):
    try:
        ruta = get_cache_archivo_path(cid, msg_id)
        if not os.path.exists(ruta):
            return jsonify({'success': False, 'error': 'No cacheado'}), 404
        with open(ruta, 'r', encoding='utf-8') as f:
            return jsonify({'success': True, **json.load(f)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cache/verificar/<cid>/<msg_id>', methods=['GET'])
def api_verificar_cache(cid, msg_id):
    try:
        ruta = get_cache_archivo_path(cid, msg_id)
        return jsonify({'success': True, 'existe': os.path.exists(ruta)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cache/lista/<cid>', methods=['GET'])
def api_lista_cache(cid):
    try:
        carpeta = os.path.join(CARPETAS['conductores_chat'], cid, 'archivos_cache')
        if not os.path.exists(carpeta):
            return jsonify({'success': True, 'archivos': [], 'total': 0})
        archivos = []
        for f in os.listdir(carpeta):
            if f.endswith('.json'):
                ruta = os.path.join(carpeta, f)
                archivos.append({
                    'msg_id': f.replace('.json', ''),
                    'tamanio': os.path.getsize(ruta),
                    'fecha': datetime.fromtimestamp(os.path.getmtime(ruta)).isoformat(),
                })
        return jsonify({'success': True, 'archivos': archivos, 'total': len(archivos)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cache/archivo/<cid>/<msg_id>', methods=['DELETE'])
def api_borrar_cache(cid, msg_id):
    try:
        ruta = get_cache_archivo_path(cid, msg_id)
        if os.path.exists(ruta):
            os.remove(ruta)
            return jsonify({'success': True})
        return jsonify({'success': False, 'error': 'No existe'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ============================================================
# EXPORTACIÓN EXCEL / PDF
# ============================================================
@app.route('/api/export/excel', methods=['POST'])
def api_export_excel():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data'}), 400
        view_name = data.get('view', 'Dashboard')
        rows = data.get('rows', [])
        columns = data.get('columns', [])
        headers = data.get('headers', columns)
        fuel_data = data.get('fuelData', [])
        combustible_data = data.get('combustibleData', data.get('data', []))
        if not rows and not combustible_data and not fuel_data:
            return jsonify({'error': 'Sin datos'}), 400
        global MODULOS_EXPORT
        if MODULOS_EXPORT is None:
            importar_modulos_exportacion()
            if MODULOS_EXPORT is None:
                return jsonify({'error': 'Módulos export no disponibles'}), 500
        generar_excel_html = MODULOS_EXPORT.get('generar_excel_html')
        if not generar_excel_html:
            return jsonify({'error': 'generar_excel_html no disponible'}), 500
        fecha = datetime.now().strftime('%Y-%m-%d_%H%M%S')
        nombre = f"GSN_{view_name}_{fecha}.xlsx"
        ruta = os.path.join(CARPETAS['excel'], nombre)
        excel_data = {
            'view': view_name, 'rows': rows, 'headers': headers,
            'columns': columns,
            'data': combustible_data if combustible_data else rows,
            'combustibleData': combustible_data, 'fuelData': fuel_data,
            'filters': data.get('filters', {}), 'totals': data.get('totals', {}),
        }
        if generar_excel_html(excel_data, ruta, view_name):
            return send_file(ruta, as_attachment=True, download_name=nombre,
                             mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        return jsonify({'error': 'Error generando Excel'}), 500
    except Exception as e:
        log_error(f"Error Excel: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/export/pdf', methods=['POST'])
def api_export_pdf():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data'}), 400
        view_name = data.get('view', 'Dashboard')
        rows = data.get('rows', [])
        columns = data.get('columns', [])
        headers = data.get('headers', columns)
        title = data.get('title', f'GSN - Reporte {view_name}')
        fuel_data = data.get('fuelData', [])
        combustible_data = data.get('combustibleData', data.get('data', []))
        if not rows and not combustible_data and not fuel_data:
            return jsonify({'error': 'Sin datos'}), 400
        global MODULOS_EXPORT
        if MODULOS_EXPORT is None:
            importar_modulos_exportacion()
            if MODULOS_EXPORT is None:
                return jsonify({'error': 'Módulos export no disponibles'}), 500
        generar_pdf_con_pie = MODULOS_EXPORT.get('generar_pdf_con_pie')
        if not generar_pdf_con_pie:
            return jsonify({'error': 'generar_pdf_con_pie no disponible'}), 500
        fecha = datetime.now().strftime('%Y-%m-%d_%H%M%S')
        nombre = f"GSN_{view_name}_{fecha}.pdf"
        ruta = os.path.join(CARPETAS['pdf'], nombre)
        pdf_data = {
            'view': view_name, 'rows': rows, 'headers': headers,
            'columns': columns, 'title': title,
            'data': combustible_data if combustible_data else rows,
            'combustibleData': combustible_data, 'fuelData': fuel_data,
            'filters': data.get('filters', {}), 'totals': data.get('totals', {}),
            'rawData': rows,
        }
        if generar_pdf_con_pie(pdf_data, ruta, view_name):
            return send_file(ruta, as_attachment=True, download_name=nombre,
                             mimetype='application/pdf')
        return jsonify({'error': 'Error generando PDF'}), 500
    except Exception as e:
        log_error(f"Error PDF: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================
# DEBUG
# ============================================================
@app.route('/api/debug/paths', methods=['GET'])
def api_debug_paths():
    return jsonify({
        'BASE_PATH': BASE_PATH,
        'TEMPLATES_PATH': TEMPLATES_PATH,
        'INDEX_HTML_FULL': INDEX_HTML_FULL,
        'MAIN_HTML_FULL': MAIN_HTML_FULL,
        'MODULOS_C_PATH': MODULOS_C_PATH,
        'RUTA_IA_PY': encontrar_ia_py(),
        'IA_INITIALIZED': IA_INITIALIZED,
        'IA_ACTIVO': IA.esta_activo() if IA else False,
    })

# ============================================================
# INICIAR SERVIDOR
# ============================================================
def iniciar_servidor():
    try:
        log_info(f"Iniciando servidor en http://127.0.0.1:{PORT}/")
        app.run(host='127.0.0.1', port=PORT, debug=False,
                use_reloader=False, threaded=True)
    except Exception as e:
        log_error(f"Error iniciando servidor: {e}")

# ============================================================
# ABRIR APP CON WEBVIEW
# ============================================================
def abrir_app():
    url = f'http://127.0.0.1:{PORT}/'
    try:
        import webview
        log_info("Abriendo aplicación...")
        window = webview.create_window(
            'Dashboard GSN - Control de Distribución',
            url, width=1024, height=768,
            resizable=True, min_size=(800, 600),
            confirm_close=True, text_select=True,
            easy_drag=True, fullscreen=False,
        )
        def maximizar():
            time.sleep(1.5)
            try:
                window.maximize()
            except:
                pass
        threading.Thread(target=maximizar, daemon=True).start()
        webview.start(gui='edgechromium', debug=False)
        limpiar_procesos()
        os._exit(0)
    except ImportError:
        import webbrowser
        webbrowser.open(url)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            limpiar_procesos()
            os._exit(0)
    except Exception as e:
        log_error(f"Error abriendo app: {e}")
        limpiar_procesos()
        time.sleep(5)
        os._exit(1)

# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    try:
        print("=" * 70)
        print("Dashboard GSN - Control de Distribución v4.0")
        print("  IA: llama-cpp-python (in-process, importlib)")
        print("=" * 70)
        log_info(f"Base path:      {BASE_PATH}")
        log_info(f"Templates path: {TEMPLATES_PATH}")
        log_info(f"ia.py:          {encontrar_ia_py() or 'NO ENCONTRADO'}")
        log_info(f"Puerto:         {PORT}")
        print("-" * 70)

        setup_signal_handlers()

        # 1. Servidor Flask (dashboard + /api/chat)
        print("\n[1/3] Arrancando servidor Flask...")
        server_thread = threading.Thread(target=iniciar_servidor, daemon=True)
        server_thread.start()
        time.sleep(1.5)
        print(f"[1/3] Flask en http://127.0.0.1:{PORT}")

        # 2. IA en background (carga el modelo, tarda unos segundos)
        print("\n[2/3] Iniciando IA en background...")
        threading.Thread(target=_background_ia, daemon=True, name="bg_ia").start()
        print("[2/3] IA lanzada (cargará el modelo en segundo plano)")

        # 3. Abrir la app
        print("\n[3/3] Abriendo dashboard...")
        print("-" * 70)
        print(f"  Dashboard: http://127.0.0.1:{PORT}/")
        print(f"  Chat IA:   POST http://127.0.0.1:{PORT}/api/chat")
        print(f"  Status:    GET  http://127.0.0.1:{PORT}/api/status")
        print(f"  Debug:     GET  http://127.0.0.1:{PORT}/api/debug/paths")
        print("-" * 70)

        abrir_app()

    except Exception as e:
        log_error(f"Error en main: {e}")
        import traceback
        log_error(traceback.format_exc())
        limpiar_procesos()
        time.sleep(5)
        os._exit(1)