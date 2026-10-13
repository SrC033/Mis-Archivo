import json
import os
import re
from collections import Counter
from datetime import datetime

class BuscadorJSONAvanzado:
    def __init__(self):
        # Rutas absolutas de los archivos
        self.archivos = {
            "fuelOil": "C:/Users/PC/Downloads/gestion_2/templates/datos_modulos/fuelOil_todos_Volumen.json",
            "mayoreo": "C:/Users/PC/Downloads/gestion_2/templates/datos_modulos/mayoreo_todos_Volumen.json"
        }
        self.datos = {}
        self.cargar_archivos()
    
    def cargar_archivos(self):
        """Carga todos los archivos JSON en memoria"""
        print("\n📂 CARGANDO ARCHIVOS...")
        print("="*70)
        
        for nombre, archivo in self.archivos.items():
            try:
                if os.path.exists(archivo):
                    with open(archivo, 'r', encoding='utf-8') as f:
                        self.datos[nombre] = json.load(f)
                    print(f"✅ {nombre.upper()} cargado correctamente")
                    print(f"   📁 {archivo}")
                else:
                    print(f"❌ {nombre.upper()} no encontrado: {archivo}")
                    self.datos[nombre] = None
            except Exception as e:
                print(f"❌ Error al cargar {nombre}: {str(e)}")
                self.datos[nombre] = None
        
        print("="*70)
    
    def buscar_frase(self, frase):
        """Busca una frase exacta o palabras en el JSON"""
        frase = frase.strip()
        print(f"\n🔍 BUSCANDO: '{frase}'")
        print("="*70)
        
        # Dividir la frase en palabras para búsqueda flexible
        palabras = frase.lower().split()
        resultados = []
        
        for nombre_archivo, datos in self.datos.items():
            if datos is None:
                continue
            
            print(f"\n📁 {nombre_archivo.upper()}:")
            
            # Convertir todo el JSON a string para búsqueda
            contenido_json = json.dumps(datos, ensure_ascii=False, indent=2)
            lineas = contenido_json.split('\n')
            
            # Buscar líneas que contengan TODAS las palabras
            lineas_encontradas = []
            for i, linea in enumerate(lineas):
                linea_lower = linea.lower()
                # Verificar si todas las palabras están en la línea
                todas_palabras = all(palabra in linea_lower for palabra in palabras)
                if todas_palabras:
                    lineas_encontradas.append((i, linea))
                elif len(palabras) == 1 and palabras[0] in linea_lower:
                    # Si es una sola palabra, buscar coincidencia simple
                    lineas_encontradas.append((i, linea))
            
            if lineas_encontradas:
                print(f"  ✅ Encontradas {len(lineas_encontradas)} coincidencias:")
                
                # Agrupar por contexto (mostrar líneas relacionadas)
                for i, (num_linea, linea) in enumerate(lineas_encontradas[:20], 1):  # Limitar a 20 resultados
                    # Mostrar contexto (2 líneas antes y después)
                    inicio = max(0, num_linea - 2)
                    fin = min(len(lineas), num_linea + 3)
                    
                    print(f"\n  [{i}] Línea {num_linea + 1}:")
                    for j in range(inicio, fin):
                        prefijo = "    >>> " if j == num_linea else "        "
                        linea_mostrar = lineas[j][:200]  # Limitar longitud
                        if len(lineas[j]) > 200:
                            linea_mostrar += "..."
                        print(f"{prefijo}{linea_mostrar}")
                    
                    resultados.append({
                        'archivo': nombre_archivo,
                        'linea': num_linea + 1,
                        'contenido': linea.strip()
                    })
                
                if len(lineas_encontradas) > 20:
                    print(f"\n  ... y {len(lineas_encontradas) - 20} coincidencias más")
            
            else:
                print(f"  ❌ No se encontró '{frase}'")
        
        # Mostrar resumen
        if resultados:
            print(f"\n📊 RESUMEN:")
            print(f"  Total de coincidencias encontradas: {len(resultados)}")
            
            # Contar por archivo
            contador_archivos = Counter([r['archivo'] for r in resultados])
            for archivo, cantidad in contador_archivos.items():
                print(f"  • {archivo.upper()}: {cantidad} coincidencias")
        else:
            print(f"\n❌ No se encontraron coincidencias para '{frase}'")
        
        return resultados
    
    def buscar_por_mes(self, mes):
        """Busca información por mes específico con contexto completo"""
        mes = mes.upper().strip()
        print(f"\n📅 BUSCANDO INFORMACIÓN PARA: {mes.upper()}")
        print("="*70)
        
        resultados = []
        
        for nombre_archivo, datos in self.datos.items():
            if datos is None:
                continue
            
            print(f"\n📁 {nombre_archivo.upper()}:")
            
            # Buscar específicamente por mes en las claves
            coincidencias = []
            
            if isinstance(datos, dict):
                for clave, valor in datos.items():
                    if mes.lower() in str(clave).lower() or mes.lower() in str(valor).lower():
                        # Si el valor es un diccionario o lista, buscar más profundo
                        if isinstance(valor, (dict, list)):
                            coincidencias.extend(self._buscar_recursivo(valor, mes, clave))
                        else:
                            coincidencias.append({
                                'clave': clave,
                                'valor': valor
                            })
            
            if coincidencias:
                print(f"  ✅ Encontradas {len(coincidencias)} coincidencias para {mes}:")
                for i, coincidencia in enumerate(coincidencias[:15], 1):
                    print(f"\n  [{i}] {coincidencia['clave']}:")
                    if isinstance(coincidencia['valor'], (dict, list)):
                        print(f"      {json.dumps(coincidencia['valor'], ensure_ascii=False)[:200]}...")
                    else:
                        print(f"      {coincidencia['valor']}")
                
                if len(coincidencias) > 15:
                    print(f"\n  ... y {len(coincidencias) - 15} coincidencias más")
                
                resultados.extend(coincidencias)
            else:
                print(f"  ❌ No se encontró información para {mes}")
        
        return resultados
    
    def _buscar_recursivo(self, datos, mes, ruta_actual):
        """Búsqueda recursiva dentro de estructuras anidadas"""
        resultados = []
        
        if isinstance(datos, dict):
            for clave, valor in datos.items():
                nueva_ruta = f"{ruta_actual}.{clave}"
                if mes.lower() in str(clave).lower() or mes.lower() in str(valor).lower():
                    resultados.append({
                        'clave': nueva_ruta,
                        'valor': valor
                    })
                if isinstance(valor, (dict, list)):
                    resultados.extend(self._buscar_recursivo(valor, mes, nueva_ruta))
        
        elif isinstance(datos, list):
            for i, item in enumerate(datos):
                nueva_ruta = f"{ruta_actual}[{i}]"
                if isinstance(item, (dict, list)):
                    resultados.extend(self._buscar_recursivo(item, mes, nueva_ruta))
                else:
                    if mes.lower() in str(item).lower():
                        resultados.append({
                            'clave': nueva_ruta,
                            'valor': item
                        })
        
        return resultados
    
    def buscar_combustible(self, combustible, mes=None):
        """Busca información por tipo de combustible con contexto"""
        combustible = combustible.upper().strip()
        print(f"\n⛽ BUSCANDO COMBUSTIBLE: {combustible.upper()}")
        if mes:
            print(f"📅 Mes: {mes.upper()}")
        print("="*70)
        
        resultados = []
        
        for nombre_archivo, datos in self.datos.items():
            if datos is None:
                continue
            
            print(f"\n📁 {nombre_archivo.upper()}:")
            
            # Buscar específicamente por combustible
            coincidencias = []
            
            if isinstance(datos, dict):
                for clave, valor in datos.items():
                    if "combustible" in str(clave).lower():
                        if isinstance(valor, str) and combustible.lower() in valor.lower():
                            # Encontrar el prefijo para buscar datos relacionados
                            prefijo = clave.replace("_combustible", "")
                            
                            # Buscar datos relacionados (solicitado, despachado, etc.)
                            info_relacionada = {}
                            for k, v in datos.items():
                                if k.startswith(prefijo) and k != clave:
                                    info_relacionada[k.replace(prefijo + "_", "")] = v
                            
                            coincidencias.append({
                                'clave': clave,
                                'valor': valor,
                                'informacion': info_relacionada
                            })
                    
                    # También buscar en valores anidados
                    if isinstance(valor, (dict, list)):
                        coincidencias.extend(self._buscar_combustible_recursivo(valor, combustible))
            
            if coincidencias:
                print(f"  ✅ Encontradas {len(coincidencias)} coincidencias de {combustible}:")
                for i, coincidencia in enumerate(coincidencias, 1):
                    print(f"\n  [{i}] {coincidencia['clave']}: {coincidencia['valor']}")
                    if 'informacion' in coincidencia and coincidencia['informacion']:
                        print("      Información relacionada:")
                        for campo, valor in coincidencia['informacion'].items():
                            print(f"        • {campo}: {valor}")
                
                resultados.extend(coincidencias)
            else:
                print(f"  ❌ No se encontró '{combustible}'")
        
        return resultados
    
    def _buscar_combustible_recursivo(self, datos, combustible):
        """Búsqueda recursiva de combustible"""
        resultados = []
        
        if isinstance(datos, dict):
            for clave, valor in datos.items():
                if "combustible" in str(clave).lower():
                    if isinstance(valor, str) and combustible.lower() in valor.lower():
                        resultados.append({
                            'clave': clave,
                            'valor': valor
                        })
                if isinstance(valor, (dict, list)):
                    resultados.extend(self._buscar_combustible_recursivo(valor, combustible))
        
        elif isinstance(datos, list):
            for item in datos:
                if isinstance(item, (dict, list)):
                    resultados.extend(self._buscar_combustible_recursivo(item, combustible))
        
        return resultados
    
    def buscar_inteligente(self, texto):
        """Búsqueda inteligente que detecta el tipo de búsqueda"""
        texto_lower = texto.lower()
        
        # Lista de meses y combustibles
        meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
        combustibles = ['diesel', 'gasolina', 'fuel', 'oil', 'gas', 'diésel']
        
        # Detectar si es búsqueda por mes
        for mes in meses:
            if mes in texto_lower:
                return self.buscar_por_mes(mes)
        
        # Detectar si es búsqueda por combustible
        for combustible in combustibles:
            if combustible in texto_lower:
                # Verificar si también tiene mes
                for mes in meses:
                    if mes in texto_lower:
                        return self.buscar_combustible(combustible, mes)
                return self.buscar_combustible(combustible)
        
        # Si no detecta tipo específico, hacer búsqueda de frase
        return self.buscar_frase(texto)

def mostrar_ayuda():
    """Muestra la ayuda con ejemplos"""
    print("\n" + "="*70)
    print("📋 COMANDOS Y EJEMPLOS:")
    print("="*70)
    print("\n  🔍 BÚSQUEDA POR FRASE O PALABRA:")
    print("    diesel                → Busca 'diesel' en todo el contenido")
    print("    4000                  → Busca el número 4000")
    print("    cliente null          → Busca 'cliente null' como frase")
    print("    pedidoPuma null       → Busca 'pedidoPuma null'")
    print()
    print("  📅 BÚSQUEDA POR MES:")
    print("    mes agosto            → Busca todo relacionado con agosto")
    print("    mes septiembre        → Busca todo relacionado con septiembre")
    print()
    print("  ⛽ BÚSQUEDA POR COMBUSTIBLE:")
    print("    comb diesel           → Busca información de Diesel")
    print("    comb diesel agosto    → Busca Diesel en agosto")
    print()
    print("  🎯 BÚSQUEDA INTELIGENTE (escribe directamente):")
    print("    agosto                → Detecta automáticamente que es un mes")
    print("    diesel                → Detecta automáticamente combustible")
    print("    diesel agosto         → Detecta combustible y mes")
    print("    cliente               → Busca 'cliente' en todo")
    print()
    print("  📊 MOSTRAR COINCIDENCIAS:")
    print("    Muestra todas las líneas que contengan la frase")
    print("    Si hay más de 2 coincidencias, las muestra todas")
    print("    Agrupa por archivo y muestra contexto")
    print()
    print("  📚 OTROS COMANDOS:")
    print("    help                  → Mostrar esta ayuda")
    print("    exit / quit / salir   → Salir del programa")
    print("="*70)

def main():
    buscador = BuscadorJSONAvanzado()
    
    print("\n" + "="*70)
    print("🔎 BUSCADOR AVANZADO DE JSON")
    print("   Fuel Oil y Mayoreo - Búsqueda por frases y palabras")
    print("="*70)
    print("\n💡 Características:")
    print("  • Busca frases completas (ej: 'cliente null')")
    print("  • Muestra TODAS las coincidencias encontradas")
    print("  • Muestra contexto alrededor de cada coincidencia")
    print("  • Agrupa resultados por archivo")
    print("\n💡 Escribe 'help' para ver todos los comandos")
    print("="*70)
    
    while True:
        try:
            entrada = input("\n🔎 > ").strip()
            
            if not entrada:
                continue
            
            if entrada.lower() in ['exit', 'quit', 'salir']:
                print("\n👋 ¡Hasta luego!")
                break
            
            if entrada.lower() == 'help':
                mostrar_ayuda()
                continue
            
            # Procesar comandos específicos
            partes = entrada.split()
            comando = partes[0].lower()
            
            if comando == 'mes' and len(partes) > 1:
                mes = ' '.join(partes[1:])
                buscador.buscar_por_mes(mes)
            
            elif comando == 'comb' and len(partes) > 1:
                if len(partes) > 2:
                    # Buscar combustible con mes
                    # Ejemplo: comb diesel agosto
                    combustible = partes[1]
                    mes = ' '.join(partes[2:])
                    buscador.buscar_combustible(combustible, mes)
                else:
                    combustible = partes[1]
                    buscador.buscar_combustible(combustible)
            
            elif comando == 'buscar' and len(partes) > 1:
                frase = ' '.join(partes[1:])
                buscador.buscar_frase(frase)
            
            else:
                # Búsqueda inteligente
                buscador.buscar_inteligente(entrada)
                
        except KeyboardInterrupt:
            print("\n👋 ¡Hasta luego!")
            break
        except Exception as e:
            print(f"❌ Error: {str(e)}")

if __name__ == "__main__":
    main()