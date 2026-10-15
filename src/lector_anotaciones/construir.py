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
from .capas import ConfigCapas, calcular_capas
from .markdown import expandir_fuentes, parse_fuentes
from .paginas import asignar_paginas, calcular_desfase, sin_paginas, texto_paginas_pdf
from .util import slug, texto_plano

FORMATO = 2
_ID_BLOQUE = re.compile(r"^(.+)-b(\d+)$")


def texto_render(b: dict) -> str:
    """El texto del bloque tal como lo muestra la página (su `textContent`, sin marcador de página).

    Es el sistema de coordenadas de los subrayados y de las capas, y lo que se resume en `h`.
    """
    h = b["html"]
    if isinstance(h, str):
        return html_mod.unescape(texto_plano(h))
    if isinstance(h, dict):
        return html_mod.unescape(texto_plano(h.get("caption", "")))
    if isinstance(h, list):
        partes = []
        for x in h:
            if isinstance(x, list):
                partes.extend(html_mod.unescape(texto_plano(c)) for c in x)
            else:
                partes.append(html_mod.unescape(texto_plano(x)))
        return "".join(partes)
    return ""


def huella(texto: str) -> str:
    return hashlib.sha1(texto.encode("utf-8")).hexdigest()[:12]


def cargar_anterior(ruta: Path | None) -> dict | None:
    """La salida anterior, si existe, para marcar qué bloques cambiaron desde entonces."""
    if ruta is None or not Path(ruta).is_file():
        return None
    try:
        libro = json.loads(Path(ruta).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return libro if isinstance(libro, dict) and "secciones" in libro else None


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
                m = calcular_capas(texto, capas)
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


def marcar_cambios(secciones: list[dict], anterior: dict) -> int:
    """Escribe `anterior` en los bloques cuyo texto cambió respecto de la salida previa; devuelve cuántos.

    Los ids son posicionales, así que no sirven para emparejar: se alinean las dos listas de huellas de
    cada sección con difflib. Los bloques con la misma huella están intactos; los tramos sustituidos se
    emparejan en orden; los insertados no tienen versión anterior y los borrados no se marcan.
    """
    previas = {s["id"]: s.get("bloques", []) for s in anterior.get("secciones", [])}
    cambios = 0
    for sec in secciones:
        prev = previas.get(sec["id"])
        if prev is None:
            continue
        hp = [b.get("h") or "" for b in prev]
        hn = [b["h"] for b in sec["bloques"]]
        for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, hp, hn, autojunk=False).get_opcodes():
            if op != "replace":
                continue
            for pb, b in zip(prev[i1:i2], sec["bloques"][j1:j2], strict=False):
                if pb.get("h"):
                    b["anterior"] = texto_render(pb)
                    cambios += 1
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
