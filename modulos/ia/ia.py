
import os
import re
import sys
import glob
import time
import threading
from typing import Dict, List, Optional, Any

# ============================================================
# Asegurar que la carpeta de ia.py este en sys.path
# (necesario para importar prom.py con importlib)
# ============================================================
_CARPETA_IA = os.path.dirname(os.path.abspath(__file__))
if _CARPETA_IA not in sys.path:
    sys.path.insert(0, _CARPETA_IA)

# ============================================================
# IMPORTAR PROMPT DESDE prom.py
# ============================================================
try:
    from prom import PROMPT_SISTEMA
    print(f"✅ Prompt cargado desde prom.py ({len(PROMPT_SISTEMA)} chars)")
except ImportError as e:
    print(f"⚠️ No se pudo importar prom.py: {e}")
    print("   Usando prompt de fallback.")
    PROMPT_SISTEMA = (
        "Eres ALFA, asistente del sistema GSN Dashboard. "
        "Responde en espanol, breve y directo. Maximo 3 oraciones."
    )
except Exception as e:
    print(f"⚠️ Error cargando prom.py: {e}")
    PROMPT_SISTEMA = (
        "Eres ALFA, asistente del sistema GSN Dashboard. "
        "Responde en espanol, breve y directo."
    )


# ============================================================
# IMPORT DE llama-cpp-python
# ============================================================
try:
    from llama_cpp import Llama
    _LLAMA_OK = True
    try:
        import llama_cpp
        _VERSION = getattr(llama_cpp, '__version__', 'desconocida')
    except Exception:
        _VERSION = 'desconocida'
except ImportError as e:
    print(f"⚠️ llama-cpp-python no disponible: {e}")
    Llama = None
    _LLAMA_OK = False
    _VERSION = 'no instalada'

try:
    import psutil
    _PSUTIL_OK = True
except ImportError:
    psutil = None
    _PSUTIL_OK = False


# ============================================================
# CHAT FORMATS VALIDOS
# ============================================================
CHAT_FORMATS_VALIDOS = {
    'llama-2', 'llama-3', 'alpaca', 'qwen', 'vicuna', 'oasst_llama',
    'baichuan-2', 'baichuan', 'openbuddy', 'redpajama-incite', 'snoozy',
    'phind', 'intel', 'open-orca', 'mistrallite', 'zephyr', 'pygmalion',
    'chatml', 'mistral-instruct', 'chatglm3', 'openchat', 'saiga', 'gemma',
    'functionary', 'functionary-v2', 'functionary-v1', 'chatml-function-calling'
}


# ============================================================
# UTILIDADES
# ============================================================
def _limpiar_datos_frontend(datos: str) -> str:
    """Sanitiza el bloque de datos que envia el frontend."""
    if not datos or not isinstance(datos, str):
        return ""
    MAX_TOTAL = 2000
    MAX_LINEA = 300
    lineas = []
    vacias = 0
    for ln in datos.split('\n'):
        ln = ln.rstrip()
        if len(ln) > MAX_LINEA:
            ln = ln[:MAX_LINEA] + '...'
        if not ln:
            vacias += 1
            if vacias > 1:
                continue
        else:
            vacias = 0
        lineas.append(ln)
    texto = '\n'.join(lineas).strip()
    if len(texto) > MAX_TOTAL:
        texto = texto[:MAX_TOTAL] + '\n[...truncado...]'
    return texto


# ============================================================
# CONFIGURACION
# ============================================================
class IAConfig:
    def __init__(self, puerto: int = 5501):
        self.puerto = puerto

        self.base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

        self.carpetas_modelos = [
            r"C:\Users\PC\Documents\GSN_Combustible_DAashboard\modelos",
            os.path.join(self.base_dir, "modelos"),
            os.path.join(self.base_dir, "llama", "llama-b9455-bin-win-cpu-x64", "modelos"),
            os.path.join(self.base_dir, "llama", "modelos"),
            os.path.join(os.getcwd(), "modelos"),
        ]

        self.modelo_path = self._buscar_modelo()
        self._detectar_parametros()

        nucleos = 6
        if _PSUTIL_OK:
            try:
                detectados = psutil.cpu_count(logical=False) or 6
                nucleos = min(detectados, 6)
            except Exception:
                pass
        self.n_threads = max(2, nucleos)

        self.n_batch = 64
        self.n_gpu_layers = 0
        self.n_ctx = 2048
        self.max_tokens = 180

        self.temperature = 0.35
        self.top_p = 0.9
        self.top_k = 40
        self.repeat_penalty = 1.1
        self.max_historial = 6

        self.use_mmap = True
        self.use_mlock = False
        self.verbose = False

        self.chat_format = self._detectar_chat_format()
        self._mostrar_config()

    def _buscar_modelo(self) -> Optional[str]:
        for carpeta in self.carpetas_modelos:
            if not os.path.isdir(carpeta):
                continue
            ggufs = sorted(glob.glob(os.path.join(carpeta, "*.gguf")))
            if not ggufs:
                continue
            preferido = None
            for archivo in ggufs:
                nombre = os.path.basename(archivo).lower()
                if 'mmproj' in nombre:
                    continue
                if 'qwen2.5-3b' in nombre:
                    preferido = archivo
                    break
                if preferido is None:
                    preferido = archivo
            if preferido:
                print(f"Modelo detectado: {preferido}")
                return preferido
        print("No se encontro ningun .gguf")
        for c in self.carpetas_modelos:
            print(f"   - {c}")
        return None

    def _detectar_parametros(self):
        if not self.modelo_path:
            self.parametros_b = 2.0
            self.tipo_modelo = 'desconocido'
            self.cuantizacion = 'desconocida'
            return
        nombre = os.path.basename(self.modelo_path).lower()
        m = re.search(r'(?<![a-z0-9])(\d+(?:\.\d+)?)\s*b(?![a-z0-9])', nombre)
        try:
            self.parametros_b = float(m.group(1)) if m else 2.0
        except ValueError:
            self.parametros_b = 2.0
        cm = re.search(r'(?:^|[^a-z])(i?q\d+(?:_[a-z0-9]+)*)', nombre, re.IGNORECASE)
        self.cuantizacion = cm.group(1).upper() if cm else 'desconocida'
        p = self.parametros_b
        if p < 1:      self.tipo_modelo = 'tiny'
        elif p < 2:    self.tipo_modelo = '1b'
        elif p < 3:    self.tipo_modelo = '2b'
        elif p < 4:    self.tipo_modelo = '3b'
        elif p < 6:    self.tipo_modelo = '4b'
        elif p < 9:    self.tipo_modelo = '7b'
        elif p < 15:   self.tipo_modelo = '13b'
        elif p < 40:   self.tipo_modelo = '32b'
        else:          self.tipo_modelo = '70b'

    def _detectar_chat_format(self) -> Optional[str]:
        if not self.modelo_path:
            return None
        n = os.path.basename(self.modelo_path).lower()
        if 'qwen' in n:                     return 'qwen'
        if 'llama-3' in n or 'llama3' in n: return 'llama-3'
        if 'llama-2' in n or 'llama2' in n: return 'llama-2'
        if 'phi-3' in n or 'phi3' in n:     return 'chatml'
        if 'mistral' in n:                  return 'mistral-instruct'
        return None

    def _mostrar_config(self):
        print("=" * 70)
        print("CONFIGURACION IA - llama-cpp-python (in-process)")
        print("=" * 70)
        print(f"llama-cpp-python: {_VERSION}")
        print(f"Modelo: {os.path.basename(self.modelo_path) if self.modelo_path else 'NO ENCONTRADO'}")
        print(f"Tipo: {self.tipo_modelo} | {self.cuantizacion} | {self.parametros_b}B")
        print(f"Hilos: {self.n_threads} | Batch: {self.n_batch}")
        print(f"Contexto: {self.n_ctx} | Respuesta max: {self.max_tokens}")
        print(f"Chat format: {self.chat_format or 'auto'}")
        print(f"Memoria conversacional: {self.max_historial} turnos")
        print(f"Prompt: {len(PROMPT_SISTEMA)} chars (desde prom.py)")
        print("=" * 70)


# ============================================================
# SERVIDOR DE IA (carga el modelo)
# ============================================================
class IAServidor:
    def __init__(self, config: IAConfig):
        self.config = config
        self.llm = None
        self.activo = False
        self._lock = threading.Lock()

    def verificar(self) -> bool:
        return self.activo and self.llm is not None

    def iniciar(self) -> bool:
        if not _LLAMA_OK:
            print("llama-cpp-python no esta instalado.")
            print("   Instala con: pip install llama-cpp-python")
            return False
        if not self.config.modelo_path or not os.path.exists(self.config.modelo_path):
            print(f"Modelo no encontrado: {self.config.modelo_path}")
            return False

        print(f"Cargando modelo: {os.path.basename(self.config.modelo_path)}")
        t0 = time.time()
        try:
            kwargs = {
                'model_path': self.config.modelo_path,
                'n_ctx': self.config.n_ctx,
                'n_threads': self.config.n_threads,
                'n_gpu_layers': self.config.n_gpu_layers,
                'n_batch': self.config.n_batch,
                'use_mmap': self.config.use_mmap,
                'use_mlock': self.config.use_mlock,
                'verbose': self.config.verbose,
            }
            if self.config.chat_format and self.config.chat_format in CHAT_FORMATS_VALIDOS:
                kwargs['chat_format'] = self.config.chat_format

            try:
                self.llm = Llama(**kwargs)
            except TypeError as te:
                print(f"TypeError: {te}, reintentando minimo...")
                self.llm = Llama(
                    model_path=self.config.modelo_path,
                    n_ctx=self.config.n_ctx,
                    n_threads=self.config.n_threads,
                    use_mmap=True,
                    verbose=False,
                )

            self.activo = True
            print(f"Modelo cargado en {(time.time() - t0):.1f}s")
            return True
        except Exception as e:
            print(f"Error cargando modelo: {e}")
            import traceback
            traceback.print_exc()
            self.llm = None
            self.activo = False
            return False

    def detener(self):
        with self._lock:
            self.llm = None
            self.activo = False
            print("Modelo descargado.")

    def chat_completion(self, messages: List[Dict[str, str]]) -> Optional[Dict[str, Any]]:
        if not self.llm:
            return None
        try:
            with self._lock:
                return self.llm.create_chat_completion(
                    messages=messages,
                    temperature=self.config.temperature,
                    max_tokens=self.config.max_tokens,
                    top_p=self.config.top_p,
                    top_k=self.config.top_k,
                    repeat_penalty=self.config.repeat_penalty,
                    stream=False,
                )
        except Exception as e:
            print(f"Error en create_chat_completion: {e}")
            return None


# ============================================================
# CHAT CON HISTORIAL (usa PROMPT_SISTEMA de prom.py)
# ============================================================
class IAChat:
    def __init__(self, config: IAConfig, servidor: IAServidor):
        self.config = config
        self.servidor = servidor
        self.historial: List[Dict[str, str]] = []
        self._lock = threading.Lock()
        self._inicializar()

    def _inicializar(self):
        # El prompt viene de prom.py
        self.historial = [{
            "role": "system",
            "content": PROMPT_SISTEMA
        }]

    def reiniciar(self):
        with self._lock:
            self._inicializar()

    def _recortar(self):
        limite = 1 + self.config.max_historial * 2
        if len(self.historial) > limite:
            self.historial = [self.historial[0]] + self.historial[-self.config.max_historial * 2:]

    def enviar(self, mensaje: str, datos_frontend: str = "") -> Dict[str, Any]:
        if not self.servidor.verificar():
            return {
                "success": False,
                "reply": "El motor IA no esta inicializado.",
                "error": "server_offline",
            }

        t0 = time.time()
        texto = (mensaje or "").strip() or "(mensaje vacio)"

        contexto = ""
        origen = "ninguno"
        if datos_frontend and isinstance(datos_frontend, str) and datos_frontend.strip():
            contexto = _limpiar_datos_frontend(datos_frontend)
            origen = "frontend"

        if contexto:
            contenido_usuario = (
                f"{contexto}\n\n"
                f"PREGUNTA DEL USUARIO: {texto}\n\n"
                f"Responde usando el dato de arriba. Se natural y breve."
            )
        else:
            contenido_usuario = (
                f"PREGUNTA DEL USUARIO: {texto}\n\n"
                f"Responde como asistente general del dashboard GSN."
            )

        with self._lock:
            mensajes = list(self.historial) + [{"role": "user", "content": contenido_usuario}]

        respuesta = self.servidor.chat_completion(mensajes)

        if not respuesta:
            return {
                "success": False,
                "reply": "No pude generar respuesta. Revisa los logs.",
                "error": "no_response",
            }

        try:
            reply = respuesta['choices'][0]['message']['content'].strip()
        except (KeyError, IndexError, TypeError) as e:
            return {"success": False, "reply": f"Respuesta malformada: {e}", "error": "parse_error"}

        with self._lock:
            self.historial.append({"role": "user", "content": texto})
            self.historial.append({"role": "assistant", "content": reply})
            self._recortar()

        elapsed = time.time() - t0
        print(f"Respuesta en {elapsed:.2f}s | origen_datos={origen}")
        return {
            "success": True,
            "reply": reply,
            "elapsed": elapsed,
            "con_datos": bool(contexto),
            "origen_datos": origen,
        }


# ============================================================
# INTERFAZ PRINCIPAL
# ============================================================
class IA:
    def __init__(self, config: Optional[IAConfig] = None):
        self.config = config or IAConfig()
        self.servidor = IAServidor(self.config)
        self.chat = IAChat(self.config, self.servidor)
        self.initialized = False

    def iniciar(self) -> bool:
        if self.servidor.iniciar():
            self.initialized = True
            return True
        return False

    def detener(self):
        self.servidor.detener()
        self.initialized = False

    def enviar_mensaje(
        self,
        mensaje: str,
        imagen: str = "",
        imagen_nombre: str = "",
        datos_frontend: str = "",
    ) -> Dict[str, Any]:
        """Firma compatible con main.py."""
        if not self.initialized:
            return {
                "success": False,
                "reply": "La IA no esta inicializada.",
                "error": "not_initialized",
            }
        return self.chat.enviar(mensaje, datos_frontend)

    def reiniciar_conversacion(self):
        self.chat.reiniciar()

    def limpiar_historial(self):
        self.chat.reiniciar()

    def esta_activo(self) -> bool:
        return self.initialized and self.servidor.verificar()

    def get_config(self):
        return self.config

    def get_info_modelo(self) -> Dict[str, Any]:
        return {
            'modelo': os.path.basename(self.config.modelo_path) if self.config.modelo_path else None,
            'parametros_b': self.config.parametros_b,
            'cuantizacion': self.config.cuantizacion,
            'tipo': self.config.tipo_modelo,
            'contexto': self.config.n_ctx,
            'chat_format': self.config.chat_format,
            'threads': self.config.n_threads,
            'version_llama_cpp': _VERSION,
            'memoria_turnos': self.config.max_historial,
            'puerto': self.config.puerto,
            'prompt_chars': len(PROMPT_SISTEMA),
        }


# ============================================================
# FACTORY (lo que main.py importa)
# ============================================================
def crear_ia(puerto: int = 5501, **kwargs) -> IA:
    """main.py llama: crear_ia(puerto=PORT)"""
    config = IAConfig(puerto=puerto)
    return IA(config)


# ============================================================
# PRUEBA RAPIDA
# ============================================================
def probar_ia():
    print("=== PRUEBA ia.py (llama-cpp-python + prom.py) ===")
    print(f"Prompt cargado ({len(PROMPT_SISTEMA)} chars):")
    print("-" * 70)
    print(PROMPT_SISTEMA[:300])
    print("-" * 70)

    ia = crear_ia(puerto=5500)
    if not ia.iniciar():
        print("No se pudo iniciar la IA")
        return

    for k, v in ia.get_info_modelo().items():
        print(f"  {k}: {v}")

    print("\n--- Turno 1 ---")
    r = ia.enviar_mensaje("Hola, que modulos tiene el dashboard?")
    print(f"IA: {r.get('reply', '')[:300]}")

    print("\n--- Turno 2 ---")
    r = ia.enviar_mensaje("Y para que sirve Fuel Oil?")
    print(f"IA: {r.get('reply', '')[:300]}")

    ia.detener()


if __name__ == "__main__":
    probar_ia()