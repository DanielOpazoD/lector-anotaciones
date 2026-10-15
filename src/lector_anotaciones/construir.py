"""Construcción de `libro.json`, el archivo que lee la página web."""

from __future__ import annotations

import difflib
import hashlib
import html as html_mod
import json
import re
from datetime import date
from pathlib import Path

from . import __version__
from .capas import ConfigCapas, capas_por_partes
from .markdown import expandir_fuentes, parse_fuentes
from .paginas import asignar_paginas, calcular_desfase, sin_paginas, texto_paginas_pdf
from .util import slug, texto_plano

FORMATO = 2
_ID_BLOQUE = re.compile(r"^(.+)-b(\d+)$")


def partes_render(b: dict) -> list[str]:
    """Los trozos de texto con que la página compone el bloque: uno por ítem o celda, o uno solo."""
    h = b["html"]
    if isinstance(h, str):
        return [html_mod.unescape(texto_plano(h))]
    if isinstance(h, dict):
        return [html_mod.unescape(texto_plano(h.get("caption", "")))]
    if isinstance(h, list):
        partes = []
        for x in h:
            if isinstance(x, list):
                partes.extend(html_mod.unescape(texto_plano(c)) for c in x)
            else:
                partes.append(html_mod.unescape(texto_plano(x)))
        return partes
    return []


def texto_render(b: dict) -> str:
    """El texto del bloque tal como lo muestra la página (su `textContent`, sin marcador de página).

    Es el sistema de coordenadas de los subrayados y de las capas, y lo que se resume en `h`. En listas,
    tablas y portada los ítems o celdas van pegados, sin separador, como en el `textContent`.
    """
    return "".join(partes_render(b))


def huella(texto: str) -> str:
    return hashlib.sha1(texto.encode("utf-8")).hexdigest()[:12]


def cargar_anterior(ruta: Path | None, avisos: list[str] | None = None) -> dict | None:
    """La salida anterior, si existe, para marcar qué bloques cambiaron desde entonces.

    Si el archivo existe pero no se puede leer como un libro, se devuelve None y se deja un aviso en
    `avisos` (si se da), para que no pase por «nada cambió» en silencio.
    """
    if ruta is None or not Path(ruta).is_file():
        return None
    try:
        libro = json.loads(Path(ruta).read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as e:
        if avisos is not None:
            avisos.append(f"no se pudo leer la salida anterior {ruta} ({e}); no se marcan los bloques cambiados")
        return None
    if isinstance(libro, dict) and "secciones" in libro:
        return libro
    if avisos is not None:
        avisos.append(
            f"la salida anterior {ruta} no tiene la forma de un libro.json; no se marcan los bloques cambiados"
        )
    return None


def construir(
    fuentes: list[Path],
    pdf: Path | None = None,
    titulo: str = "",
    subtitulo: str = "",
    autor: str = "",
    figs: str = "figs/",
    marca_pagina_1: str | None = None,
    ventana: int = 5,
    claves_anteriores: list[str] | None = None,
    anterior: dict | None = None,
    capas: ConfigCapas | None = None,
    avisos: list[str] | None = None,
) -> dict:
    """Lee las fuentes (y el PDF, si se da) y devuelve el libro como diccionario listo para JSON.

    `anterior` es la salida previa: los bloques cuyo texto cambió desde entonces llevan `anterior` con
    el texto viejo, para que la página muestre qué cambió. `capas` configura las capas editoriales
    (None las desactiva).
    """
    rutas = expandir_fuentes(fuentes)
    secciones = parse_fuentes(rutas, figs=figs)
    for sec in secciones:
        for b in sec["bloques"]:
            texto = texto_render(b)
            b["h"] = huella(texto)
            if capas is not None:
                m = capas_por_partes(partes_render(b), capas)
                if m:
                    b["m"] = m
    cambios = marcar_cambios(secciones, anterior) if anterior else 0
    paginas_fisicas = None
    desfase = 0
    if pdf is not None:
        textos = texto_paginas_pdf(Path(pdf))
        paginas_fisicas = len(textos)
        d = calcular_desfase(textos, marca_pagina_1)
        if marca_pagina_1 and d is None and avisos is not None:
            avisos.append("no se encontró la marca de la página 1 en el PDF; se usa desfase 0")
        desfase = d or 0
        asignar_paginas(secciones, textos, desfase=desfase, ventana=ventana)
    else:
        sin_paginas(secciones)
    for sec in secciones:
        for b in sec["bloques"]:
            b.pop("texto", None)
    titulo = titulo or (secciones[0]["titulo"] if secciones else "Libro")
    inicio = next((s["id"] for s in secciones if s["nivel"] == 2), secciones[0]["id"] if secciones else None)
    return {
        "formato": FORMATO,
        "generador": f"lector-anotaciones {__version__}",
        "id": slug(titulo),
        "titulo": titulo,
        "subtitulo": subtitulo,
        "autor": autor,
        "generado": date.today().isoformat(),
        "fuentes": [r.name for r in rutas],
        "paginas_fisicas": paginas_fisicas,
        "desfase_paginas": desfase,
        "inicio": inicio,
        "claves_anteriores": list(claves_anteriores or []),
        "anterior_generado": anterior.get("generado") if anterior else None,
        "cambios": cambios,
        "capas": {
            "fl": f"frases largas (más de {capas.frase_larga} palabras)",
            "mu": "muletillas",
            "tr": "términos retirados",
            "rep": "repeticiones cercanas",
            "cn": "citas narrativas",
        }
        if capas is not None
        else {},
        "secciones": secciones,
    }


UMBRAL_SEMEJANZA = 0.5
UMBRAL_PALABRAS_COMUNES = 0.3
VENTANA_EMPAREJAMIENTO = 3
_PALABRA = re.compile(r"\w+")

# un bloque listo para comparar: (índice en su lista, palabras en orden, conjunto de palabras)
_Preparado = tuple[int, list[str], frozenset[str]]


def _preparar(bloques: list[tuple[int, str]]) -> list[_Preparado]:
    """Parte cada texto en palabras (minúsculas) una sola vez; un bloque sin palabras se compara por caracteres."""
    salida = []
    for i, texto in bloques:
        palabras = _PALABRA.findall(texto.lower()) or list(texto)
        salida.append((i, palabras, frozenset(palabras)))
    return salida


def _palabras_comunes(a: frozenset[str], b: frozenset[str]) -> float:
    """Jaccard de los conjuntos de palabras (0 a 1): el filtro barato antes de comparar en orden."""
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _semejanza(a: list[str], b: list[str]) -> float:
    """Proporción de palabras en común, en orden, entre dos bloques (0 a 1); las cotas rápidas descartan lo distinto."""
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    if sm.real_quick_ratio() < UMBRAL_SEMEJANZA or sm.quick_ratio() < UMBRAL_SEMEJANZA:
        return 0.0
    return sm.ratio()


def _emparejar(viejos: list[_Preparado], nuevos: list[_Preparado], ventana: int | None) -> list[tuple[int, int]]:
    """Pares (índice viejo, índice nuevo) de mayor semejanza, sin repetir ninguno y sólo por encima del umbral.

    Con `ventana`, sólo se comparan los bloques a esa distancia de posiciones dentro de las dos listas (la
    diagonal del tramo); con None, todos contra todos. En ambos casos la comparación en orden, que es la
    cara, sólo se hace entre bloques que comparten bastantes palabras.
    """
    candidatos = []
    for a, (i, palabras_v, conjunto_v) in enumerate(viejos):
        for b, (j, palabras_n, conjunto_n) in enumerate(nuevos):
            if ventana is not None and abs(a - b) > ventana:
                continue
            if _palabras_comunes(conjunto_v, conjunto_n) < UMBRAL_PALABRAS_COMUNES:
                continue
            r = _semejanza(palabras_v, palabras_n)
            if r >= UMBRAL_SEMEJANZA:
                candidatos.append((-r, i, j))
    usados_v: set[int] = set()
    usados_n: set[int] = set()
    pares = []
    for _, i, j in sorted(candidatos):
        if i in usados_v or j in usados_n:
            continue
        usados_v.add(i)
        usados_n.add(j)
        pares.append((i, j))
    return pares


def emparejar_por_semejanza(viejos: list[tuple[int, str]], nuevos: list[tuple[int, str]]) -> list[tuple[int, int]]:
    """Pares (índice viejo, índice nuevo) de mayor semejanza, sin repetir ninguno y sólo por encima del umbral.

    Una edición global (cambiar un nombre o las comillas en todo el capítulo) altera cada bloque, y
    comparar todos contra todos costaría minutos: primero se miran sólo los bloques a pocas posiciones
    unos de otros (una inserción o un borrado desplaza una o dos, no cien), y sólo lo que queda sin
    pareja a ambos lados se vuelve a intentar sin esa ventana.
    """
    preparados_v, preparados_n = _preparar(viejos), _preparar(nuevos)
    pares = _emparejar(preparados_v, preparados_n, VENTANA_EMPAREJAMIENTO)
    emparejados_v = {i for i, _ in pares}
    emparejados_n = {j for _, j in pares}
    sueltos_v = [x for x in preparados_v if x[0] not in emparejados_v]
    sueltos_n = [x for x in preparados_n if x[0] not in emparejados_n]
    if sueltos_v and sueltos_n:
        pares.extend(_emparejar(sueltos_v, sueltos_n, None))
    return pares


def marcar_cambios(secciones: list[dict], anterior: dict) -> int:
    """Escribe `anterior` en los bloques cuyo texto cambió respecto de la salida previa; devuelve cuántos.

    Los ids son posicionales, así que no sirven para emparejar: se alinean las dos listas de huellas de
    cada sección con difflib. Los bloques con la misma huella están intactos. En cada tramo que difiere,
    los bloques viejos y nuevos se emparejan por semejanza de texto (no por posición, que confunde una
    inserción o un borrado pegado a una modificación); lo que queda suelto en la sección se vuelve a
    emparejar entre sí, por si difflib prefirió alinear bloques repetidos. Un bloque nuevo sin pareja
    es una inserción y no lleva `anterior`; un bloque viejo sin pareja es un borrado y no se marca.
    Cuando el tramo cambia exactamente un bloque por otro, el anterior es inequívoco y se emparejan
    aunque no se parezcan (un párrafo reescrito del todo en su sitio).
    """
    previas = {s["id"]: s.get("bloques", []) for s in anterior.get("secciones", [])}
    cambios = 0
    for sec in secciones:
        prev = previas.get(sec["id"])
        if prev is None:
            continue
        nuevos = sec["bloques"]
        hp = [b.get("h") or "" for b in prev]
        hn = [b["h"] for b in nuevos]
        textos_prev = [texto_render(b) if b.get("h") else None for b in prev]
        textos_nuevos = [texto_render(b) for b in nuevos]
        sueltos_v: list[tuple[int, str]] = []
        sueltos_n: list[tuple[int, str]] = []
        for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, hp, hn, autojunk=False).get_opcodes():
            if op == "equal":
                continue
            viejos = [(i, textos_prev[i]) for i in range(i1, i2) if textos_prev[i] is not None]
            tramo_nuevos = [(j, textos_nuevos[j]) for j in range(j1, j2)]
            if op == "replace" and len(viejos) == 1 and len(tramo_nuevos) == 1:
                pares = [(viejos[0][0], tramo_nuevos[0][0])]
            else:
                pares = emparejar_por_semejanza(viejos, tramo_nuevos)
            for i, j in pares:
                nuevos[j]["anterior"] = textos_prev[i]
            emparejados_v = {i for i, _ in pares}
            emparejados_n = {j for _, j in pares}
            sueltos_v.extend(x for x in viejos if x[0] not in emparejados_v)
            sueltos_n.extend(x for x in tramo_nuevos if x[0] not in emparejados_n)
            cambios += len(pares)
        pares = emparejar_por_semejanza(sueltos_v, sueltos_n)
        for i, j in pares:
            nuevos[j]["anterior"] = textos_prev[i]
        cambios += len(pares)
    return cambios


def validar(libro: dict) -> list[str]:
    """Comprueba las invariantes de las que depende la trazabilidad; devuelve los problemas."""
    problemas: list[str] = []
    vistos: set[str] = set()
    ultima = 0
    for sec in libro.get("secciones", []):
        if sec["id"] in vistos:
            problemas.append(f"id de sección repetido: {sec['id']}")
        vistos.add(sec["id"])
        for n, b in enumerate(sec["bloques"], 1):
            for clave in ("id", "t", "html", "src"):
                if clave not in b:
                    problemas.append(f"bloque sin «{clave}» en {sec['id']}")
            if "h" not in b:
                problemas.append(f"bloque sin «h» en {sec['id']}")
            m = _ID_BLOQUE.match(b.get("id", ""))
            if not m or m.group(1) != sec["id"] or int(m.group(2)) != n:
                problemas.append(f"id de bloque fuera de patrón: {b.get('id')} (esperado {sec['id']}-b{n})")
            if b["id"] in vistos:
                problemas.append(f"id de bloque repetido: {b['id']}")
            vistos.add(b["id"])
            if not re.match(r"^.+:\d+$", b.get("src", "")):
                problemas.append(f"src sin línea en {b.get('id')}: {b.get('src')!r}")
            p = b.get("pagina")
            if p is not None:
                if p < ultima:
                    problemas.append(f"página retrocede en {b['id']}: {p} tras {ultima}")
                ultima = max(ultima, p)
    if not libro.get("secciones"):
        problemas.append("el libro no tiene secciones")
    return problemas


def resumen(libro: dict) -> str:
    """Una línea con las cifras que conviene mirar tras cada construcción."""
    secciones = libro["secciones"]
    nb = sum(len(s["bloques"]) for s in secciones)
    sin = sum(1 for s in secciones for b in s["bloques"] if b.get("pagina") is None)
    con_capas = sum(1 for s in secciones for b in s["bloques"] if b.get("m"))
    return (
        f"{len(secciones)} secciones, {nb} bloques, {sin} sin página, "
        f"desfase {libro['desfase_paginas']}, páginas físicas {libro['paginas_fisicas']}, "
        f"{libro.get('cambios', 0)} bloques cambiados desde la salida anterior, {con_capas} con señales editoriales"
    )


def escribir(libro: dict, salida: Path) -> int:
    """Escribe el JSON (UTF-8, sin escapes) y devuelve su tamaño en bytes."""
    salida = Path(salida)
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(json.dumps(libro, ensure_ascii=False), encoding="utf-8")
    return salida.stat().st_size
