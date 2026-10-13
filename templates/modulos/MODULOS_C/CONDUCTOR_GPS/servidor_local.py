import http.server
import socketserver
import webbrowser
import os
import sys
from pathlib import Path

# ============================================================
# CONFIGURACIÓN
# ============================================================
PUERTO = 8000
ARCHIVO_HTML = "index.html"  # Solo el nombre, no la ruta

# ============================================================
# BUSCAR EL HTML AUTOMÁTICAMENTE
# ============================================================
def encontrar_html():
    """Busca CONDUCTOR.html desde la carpeta del script hacia arriba y abajo."""
    
    # 1. Buscar en la carpeta actual
    carpeta_script = Path(__file__).parent
    print(f"📁 Buscando desde: {carpeta_script}")
    
    # 2. Buscar en carpetas cercanas
    candidatos = [
        carpeta_script,                                    # Misma carpeta
        carpeta_script.parent,                             # Un nivel arriba
        carpeta_script.parent.parent,                      # Dos niveles arriba
        Path.home() / "Documents",                         # Documentos
        Path.home() / "Desktop",                           # Escritorio
        Path("C:/Users/PC/Documents"),                     # Ruta específica
    ]
    
    # 3. Buscar recursivamente en cada candidato
    for base in candidatos:
        if not base.exists():
            continue
        print(f"   🔍 Revisando: {base}")
        
        # Buscar directamente
        directo = base / ARCHIVO_HTML
        if directo.exists():
            print(f"   ✅ Encontrado en: {directo}")
            return directo
        
        # Buscar en subcarpetas (máximo 5 niveles)
        for raiz, dirs, archivos in os.walk(base):
            # Limitar profundidad
            profundidad = len(Path(raiz).parts) - len(base.parts)
            if profundidad > 5:
                dirs[:] = []
                continue
            
            if ARCHIVO_HTML in archivos:
                ruta = Path(raiz) / ARCHIVO_HTML
                print(f"   ✅ Encontrado en: {ruta}")
                return ruta
    
    return None

# ============================================================
# HANDLER
# ============================================================
class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        print(f"   📄 {args[0]}")

# ============================================================
# BUSCAR PUERTO LIBRE
# ============================================================
def puerto_libre(puerto_inicial, max_intentos=20):
    import socket
    for p in range(puerto_inicial, puerto_inicial + max_intentos):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('', p))
                return p
            except OSError:
                continue
    return None

# ============================================================
# MAIN
# ============================================================
def main():
    print("=" * 65)
    print("🚀 SERVIDOR LOCAL · GSN Conductor GPS")
    print("=" * 65)

    # 1. Encontrar el HTML
    ruta_html = encontrar_html()

    if not ruta_html:
        print("\n❌ ERROR: No se encontró CONDUCTOR.html")
        print(f"\n📁 Carpeta del script: {Path(__file__).parent}")
        print(f"\n💡 Soluciones:")
        print(f"   1. Mueve este script a la MISMA carpeta donde está CONDUCTOR.html")
        print(f"   2. O edita el script y pon la ruta manualmente en RUTA_MANUAL")
        print(f"\n📁 Carpetas revisadas:")
        print(f"   - {Path(__file__).parent}")
        print(f"   - {Path(__file__).parent.parent}")
        print(f"   - {Path.home() / 'Documents'}")
        print(f"   - {Path.home() / 'Desktop'}")
        input("\nPresiona Enter para salir...")
        sys.exit(1)

    # 2. Cambiar a la carpeta del HTML
    carpeta = ruta_html.parent
    os.chdir(carpeta)

    # 3. Buscar puerto libre
    puerto = puerto_libre(PUERTO)
    if not puerto:
        print(f"\n❌ No hay puertos libres cerca de {PUERTO}")
        input("\nPresiona Enter para salir...")
        sys.exit(1)

    if puerto != PUERTO:
        print(f"\n⚠️  El puerto {PUERTO} está ocupado. Usando {puerto}")

    # 4. Construir URL
    url = f"http://localhost:{puerto}/{ARCHIVO_HTML}"

    print()
    print("=" * 65)
    print("✅ SERVIDOR INICIADO")
    print("=" * 65)
    print(f"📁 Carpeta: {carpeta}")
    print(f"📄 HTML:    {ARCHIVO_HTML}")
    print(f"🌐 URL:     {url}")
    print("=" * 65)
    print("💡 El navegador se abrirá automáticamente")
    print("💡 GPS funcionará (http:// en lugar de file://)")
    print("⏹️  Presiona Ctrl+C para detener")
    print("=" * 65)
    print()

    # 5. Abrir navegador
    webbrowser.open(url)

    # 6. Iniciar servidor
    try:
        with socketserver.TCPServer(("", puerto), Handler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n⏹️  Servidor detenido. ¡Hasta luego!")

if __name__ == '__main__':
    main()