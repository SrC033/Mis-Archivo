"""
ia.py - Módulo principal de la IA usando llama-cpp-python con ruta absoluta
Ubicación: chat_programar_IA\modelo_py\ia.py

Configuración OPTIMIZADA PARA VELOCIDAD:
  - Usa todos los núcleos de CPU
  - Batch grande (512) para prefill rápido
  - Contexto reducido (4096) para acelerar
  - Respuestas limitadas (1024 tokens)
  - Historial mínimo (2 mensajes) para no perder velocidad
  - chat_format específico de Qwen
  - Prompt del sistema ultra-corto
  - Expone prompt_manager para construir prompts externos
"""

import os
import sys
import time
from typing import Dict, List, Optional, Any, Generator

try:
    from llama_cpp import Llama
except ImportError:
    print("⚠️ Falta instalar la librería llama-cpp-python. Ejecuta: pip install llama-cpp-python")
    Llama = None

try:
    from .prom import PromptManager, crear_prompt_ia
except ImportError:
    try:
        from prom import PromptManager, crear_prompt_ia
    except ImportError:
        class PromptManager:
            def __init__(self):
                self.max_file_chars = 2000
            def construir_prompt_archivo(self, file_name, file_content, user_message, tipo_analisis='default', archivos_multiples=None):
                return {'prompt': f"{user_message}\n{file_content[:2000]}",
                        'metadatos': {}, 'tokens_estimados': 0,
                        'es_peticion_codigo': True, 'lenguaje_detectado': 'texto'}
            def get_system_prompt(self, tipo='default'):
                return "Programador experto. Devuelve código funcional en bloques Markdown. Sin explicaciones. Español."
            def optimizar_historial(self, historial, max_mensajes):
                return historial

try:
    from .editor_ejecutor import CodeEditor
except ImportError:
    try:
        from editor_ejecutor import CodeEditor
    except ImportError:
        class CodeEditor:
            def __init__(self): pass
            def inicializar(self): return True
            def crear_archivo(self, codigo, nombre, lenguaje):
                return {'nombre': f"{nombre}.py", 'codigo': codigo, 'lenguaje': lenguaje}
            def ejecutar(self, nombre):
                return {'success': False, 'error': 'Editor no disponible'}
            def listar_proyectos(self): return []
            def obtener_codigo(self, nombre): return None


# ==================================================================
# CONFIGURACIÓN OPTIMIZADA PARA VELOCIDAD
# ==================================================================
class IAConfig:
    """Configuración optimizada para velocidad en CPU."""

    def __init__(self):
        # Ruta absoluta del modelo GGUF
        self.modelo_path = r"C:\Users\PC\Documents\chat_programar_IA\modelo_IA\qwen2.5-coder-3b-instruct-q4_k_m.gguf"

        # ------------------------------------------------------
        # ⚡ PARÁMETROS DE VELOCIDAD
        # ------------------------------------------------------
        self.max_context_tokens = 4096      # contexto pequeño = más rápido
        self.max_response_tokens = 1024     # respuestas más cortas = más rápidas
        self.temperature = 0.1
        self.tipo_sistema = 'coder'
        self.max_historial = 4              # turnos previos (memoria de hilo)

        # ------------------------------------------------------
        # ⚡ CPU AGRESIVO
        # ------------------------------------------------------
        total_cpu = os.cpu_count() or 4
        self.n_threads = min(total_cpu, 16)   # usa TODOS los núcleos disponibles
        self.n_gpu_layers = 0                 # 0 = CPU only · -1 = todas las capas en GPU
        self.n_batch = 512                    # batch grande = prefill más rápido
        self.use_mmap = True                  # mapea el modelo en memoria (menos RAM)
        self.use_mlock = False                # no bloquear páginas de memoria

        # ------------------------------------------------------
        # ⚡ GENERACIÓN
        # ------------------------------------------------------
        self.top_p = 0.9
        self.top_k = 40
        self.repeat_penalty = 1.1
        self.chat_format = "qwen"             # formato específico de Qwen (más rápido)

    def mostrar_configuracion(self):
        print("=" * 70)
        print("📋 CONFIGURACIÓN OPTIMIZADA PARA VELOCIDAD")
        print("=" * 70)
        print(f"📁 Modelo: {self.modelo_path}")
        print(f"🧵 Hilos CPU: {self.n_threads} (de {os.cpu_count()} núcleos)")
        print(f"📦 Contexto: {self.max_context_tokens} tokens")
        print(f"📝 Respuesta máx: {self.max_response_tokens} tokens")
        print(f"⚡ Batch: {self.n_batch}")
        print(f"💾 mmap: {self.use_mmap} · mlock: {self.use_mlock}")
        print(f"🌡️ Temperatura: {self.temperature}")
        print("=" * 70)


# ==================================================================
# SERVIDOR DE IA (carga del modelo y generación)
# ==================================================================
class IAServidor:
    """Gestiona la carga y consultas directas del modelo GGUF en memoria."""

    def __init__(self, config: IAConfig):
        self.config = config
        self.llm = None
        self.activo = False

    def verificar(self) -> bool:
        return self.activo and self.llm is not None

    def iniciar(self) -> bool:
        if Llama is None:
            print("❌ ERROR: La librería 'llama-cpp-python' no está instalada.")
            return False

        if not os.path.exists(self.config.modelo_path):
            print(f"❌ ERROR: No se encuentra el archivo .gguf en: {self.config.modelo_path}")
            return False

        print(f"⏳ Cargando el modelo GGUF en memoria RAM...")
        t0 = time.time()
        try:
            self.llm = Llama(
                model_path=self.config.modelo_path,
                n_ctx=self.config.max_context_tokens,
                n_threads=self.config.n_threads,
                n_gpu_layers=self.config.n_gpu_layers,
                n_batch=self.config.n_batch,
                use_mmap=self.config.use_mmap,
                use_mlock=self.config.use_mlock,
                chat_format=self.config.chat_format,
                verbose=False,
            )
            self.activo = True
            print(f"✅ ¡Modelo cargado exitosamente en {time.time() - t0:.2f}s!")
            return True
        except Exception as e:
            print(f"❌ Error al cargar el modelo: {e}")
            return False

    def detener(self):
        self.llm = None
        self.activo = False
        print("🛑 Modelo descargado de la memoria.")

    # ------------------------------------------------------------------
    # GENERACIÓN
    # ------------------------------------------------------------------
    def crear_chat_completion_stream(
        self, messages: List[Dict], temperature: float, max_tokens: int
    ) -> Generator:
        """Genera respuesta en streaming (token por token)."""
        try:
            stream = self.llm.create_chat_completion(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=self.config.top_p,
                top_k=self.config.top_k,
                repeat_penalty=self.config.repeat_penalty,
                stream=True,
            )
            for chunk in stream:
                yield chunk
        except Exception as e:
            yield {'error': str(e)}

    def crear_chat_completion_sync(
        self, messages: List[Dict], temperature: float, max_tokens: int
    ) -> Dict:
        """Genera respuesta completa (sin streaming)."""
        try:
            response = self.llm.create_chat_completion(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=self.config.top_p,
                top_k=self.config.top_k,
                repeat_penalty=self.config.repeat_penalty,
                stream=False,
            )
            return response
        except Exception as e:
            return {'error': str(e)}


# ==================================================================
# CHAT (gestión del historial y prompts)
# ==================================================================
class IAChat:
    def __init__(self, config: IAConfig, servidor: IAServidor):
        self.config = config
        self.servidor = servidor
        self.prompt_manager = PromptManager()
        self.editor = CodeEditor()
        self.historial = []
        self.inicializar_conversacion()

    def inicializar_conversacion(self):
        system_prompt = self.prompt_manager.get_system_prompt(self.config.tipo_sistema)
        self.historial = [{"role": "system", "content": system_prompt}]

    def reiniciar(self):
        self.inicializar_conversacion()
        print("🔄 Conversación reiniciada.")

    def agregar_mensaje(self, role: str, content: str):
        # Recortar contenido a 2000 chars antes de guardarlo en historial
        MAX_CHARS_HISTORIAL = 2000
        contenido = content[:MAX_CHARS_HISTORIAL] if len(content) > MAX_CHARS_HISTORIAL else content
        self.historial.append({"role": role, "content": contenido})
        self.historial = self.prompt_manager.optimizar_historial(
            self.historial,
            self.config.max_historial
        )

    # ------------------------------------------------------------------
    # STREAMING
    # ------------------------------------------------------------------
    def enviar_consulta_stream(
        self, user_message: str = "", file_content: str = "", file_name: str = ""
    ):
        if not self.servidor.verificar():
            yield {'error': 'Motor de IA no inicializado', 'final': True}
            return

        # Construir prompt
        if file_content:
            prompt_data = self.prompt_manager.construir_prompt_archivo(
                file_name=file_name or 'archivo',
                file_content=file_content,
                user_message=user_message,
            )
            contenido_actual = prompt_data['prompt']
        else:
            contenido_actual = user_message

        self.agregar_mensaje("user", contenido_actual)

        print(f"🔄 Generando respuesta en streaming...")
        respuesta_completa = ""

        stream = self.servidor.crear_chat_completion_stream(
            messages=self.historial,
            temperature=self.config.temperature,
            max_tokens=self.config.max_response_tokens,
        )

        for chunk in stream:
            if isinstance(chunk, dict) and 'error' in chunk:
                yield {'error': chunk['error'], 'final': True}
                return

            try:
                delta = chunk['choices'][0]['delta']
                content = delta.get('content', '')
                if content:
                    respuesta_completa += content
                    yield {'chunk': content, 'final': False}
            except (KeyError, IndexError):
                continue

        self.agregar_mensaje("assistant", respuesta_completa)
        yield {'final': True, 'proyecto': None}

    # ------------------------------------------------------------------
    # SYNC (sin streaming)
    # ------------------------------------------------------------------
    def enviar_consulta(
        self, user_message: str = "", file_content: str = "", file_name: str = ""
    ) -> Dict[str, Any]:
        if not self.servidor.verificar():
            return {
                'success': False,
                'reply': "❌ Motor de IA no inicializado.",
                'error': 'server_offline',
            }

        if file_content:
            prompt_data = self.prompt_manager.construir_prompt_archivo(
                file_name=file_name or 'archivo',
                file_content=file_content,
                user_message=user_message,
            )
            contenido_actual = prompt_data['prompt']
        else:
            contenido_actual = user_message

        self.agregar_mensaje("user", contenido_actual)

        response_data = self.servidor.crear_chat_completion_sync(
            messages=self.historial,
            temperature=self.config.temperature,
            max_tokens=self.config.max_response_tokens,
        )

        if 'error' in response_data:
            return {
                'success': False,
                'reply': f"❌ Error de IA: {response_data['error']}",
                'error': 'ia_error',
            }

        try:
            bot_reply = response_data['choices'][0]['message']['content']
            self.agregar_mensaje("assistant", bot_reply)
            return {
                'success': True,
                'reply': bot_reply,
                'metadatos': {'tipo': 'mensaje_solo'},
                'proyecto_creado': None,
            }
        except (KeyError, IndexError) as e:
            return {
                'success': False,
                'reply': f"❌ Error procesando respuesta: {str(e)}",
                'error': 'parse_error',
            }

    # ------------------------------------------------------------------
    # UTILIDADES
    # ------------------------------------------------------------------
    def obtener_historial(self):
        return self.historial

    def limpiar_historial(self):
        self.inicializar_conversacion()


# ==================================================================
# INTERFAZ PRINCIPAL
# ==================================================================
class IA:
    def __init__(self, config: Optional[IAConfig] = None):
        self.config = config or IAConfig()
        self.servidor = IAServidor(self.config)
        self.chat = IAChat(self.config, self.servidor)
        self.initialized = False

    # ⭐ NUEVO: expone el prompt_manager para construir prompts con archivos del ojo
    def get_prompt_manager(self):
        """Expone el prompt_manager para construir prompts con archivos del ojo."""
        return self.chat.prompt_manager

    def iniciar(self) -> bool:
        self.config.mostrar_configuracion()
        if self.servidor.iniciar():
            self.initialized = True
            return True
        return False

    def detener(self):
        self.servidor.detener()
        self.initialized = False

    def enviar_mensaje(
        self, mensaje: str, archivo_contenido: str = "", archivo_nombre: str = ""
    ):
        if not self.initialized:
            return {'success': False, 'reply': "❌ IA no inicializada."}
        return self.chat.enviar_consulta(mensaje, archivo_contenido, archivo_nombre)

    def enviar_mensaje_stream(
        self, mensaje: str, archivo_contenido: str = "", archivo_nombre: str = ""
    ):
        if not self.initialized:
            yield {'error': "❌ IA no inicializada.", 'final': True}
            return
        yield from self.chat.enviar_consulta_stream(mensaje, archivo_contenido, archivo_nombre)

    def reiniciar_conversacion(self):
        self.chat.reiniciar()

    def esta_activo(self) -> bool:
        return self.initialized and self.servidor.verificar()

    def get_config(self) -> IAConfig:
        return self.config


def crear_ia(tipo='coder', puerto=8081):
    config = IAConfig()
    config.tipo_sistema = tipo
    return IA(config)