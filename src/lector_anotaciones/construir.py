"""Construcción de `libro.json`, el archivo que lee la página web."""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

from . import __version__
from .markdown import expandir_fuentes, parse_fuentes
from .paginas import asignar_paginas, calcular_desfase, sin_paginas, texto_paginas_pdf
from .util import slug

FORMATO = 1
_ID_BLOQUE = re.compile(r"^(.+)-b(\d+)$")


def construir(
    fuentes: list[Path],
    pdf: Path | None = None,
    titulo: str = "",
    subtitulo: str = "",
    autor: str = "",
    figs: str = "figs/",
    marca_pagina_1: str | None = None,
    ventana: int = 5,
    avisos: list[str] | None = None,
) -> dict:
    """Lee las fuentes (y el PDF, si se da) y devuelve el libro como diccionario listo para JSON."""
    rutas = expandir_fuentes(fuentes)
    secciones = parse_fuentes(rutas, figs=figs)
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
        "secciones": secciones,
    }


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
    return (
        f"{len(secciones)} secciones, {nb} bloques, {sin} sin página, "
        f"desfase {libro['desfase_paginas']}, páginas físicas {libro['paginas_fisicas']}"
    )


def escribir(libro: dict, salida: Path) -> int:
    """Escribe el JSON (UTF-8, sin escapes) y devuelve su tamaño en bytes."""
    salida = Path(salida)
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(json.dumps(libro, ensure_ascii=False), encoding="utf-8")
    return salida.stat().st_size
