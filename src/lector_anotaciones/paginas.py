"""Asignación de la página impresa a cada bloque a partir del texto del PDF.

El PDF se lee con `pdftotext` (poppler-utils), página por página. Cada bloque se busca por sus
primeros 40 caracteres normalizados en una ventana de páginas hacia adelante desde la última
página encontrada; si no aparece (bloques muy cortos, tablas, figuras), hereda la página del
bloque anterior. La página impresa es la física menos el desfase de las páginas preliminares.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

from .markdown import SECCIONES_SIN_PAGINA
from .util import norm

LARGO_CLAVE = 40
MINIMO_CLAVE = 15


class HerramientaFaltante(RuntimeError):
    """Falta un programa externo necesario (pdfinfo o pdftotext)."""


def normalizar_pagina(texto: str) -> str:
    """Une las palabras partidas a fin de línea y normaliza el texto de una página."""
    return norm(re.sub(r"-\n\s*", "", texto))


def texto_paginas_pdf(pdf: Path) -> list[str]:
    """Texto normalizado de cada página física del PDF, en orden."""
    for herramienta in ("pdfinfo", "pdftotext"):
        if not shutil.which(herramienta):
            raise HerramientaFaltante(f"falta `{herramienta}`; instala poppler-utils")
    info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout
    m = re.search(r"Pages:\s+(\d+)", info)
    if not m:
        raise RuntimeError(f"pdfinfo no informó el número de páginas de {pdf}")
    textos = []
    for p in range(1, int(m.group(1)) + 1):
        salida = subprocess.run(
            ["pdftotext", "-f", str(p), "-l", str(p), "-layout", str(pdf), "-"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
        textos.append(normalizar_pagina(salida))
    return textos


def calcular_desfase(textos: list[str], marca: str | None) -> int | None:
    """Número de páginas físicas anteriores a la página impresa 1.

    `marca` es el texto con que empieza la primera página impresa (por ejemplo el encabezado
    corrido seguido del título del prefacio). Devuelve None si no se encuentra o no hay marca.
    """
    if not marca:
        return None
    clave = norm(marca)
    for i, t in enumerate(textos):
        if t.startswith(clave):
            return i
    return None


def asignar_paginas(
    secciones: list[dict],
    textos: list[str],
    desfase: int = 0,
    ventana: int = 5,
    sin_pagina: tuple[str, ...] = SECCIONES_SIN_PAGINA,
) -> None:
    """Escribe `pagina` (impresa) en cada bloque y en cada sección, en el lugar.

    Los bloques de las secciones en `sin_pagina` que quedan antes de la primera coincidencia no
    reciben página (portada, página legal). Los bloques en páginas físicas anteriores al desfase
    tampoco (preliminares sin numeración).
    """
    n = len(textos)
    cur = 0  # índice físico (0-based) de la última página encontrada
    for sec in secciones:
        for b in sec["bloques"]:
            clave = norm(b.get("texto", ""))[:LARGO_CLAVE]
            pagina = None
            if len(clave) >= MINIMO_CLAVE:
                for p in range(cur, min(cur + ventana, n)):
                    if clave in textos[p]:
                        cur = p
                        pagina = p + 1
                        break
            if pagina is None:
                hereda = cur > 0 or sec["nivel"] == 2 or sec["titulo"] not in sin_pagina
                pagina = cur + 1 if hereda else None
            b["pagina"] = (pagina - desfase) if (pagina and pagina > desfase) else None
        sec["pagina"] = next((b["pagina"] for b in sec["bloques"] if b.get("pagina")), None)


def sin_paginas(secciones: list[dict]) -> None:
    """Deja todos los bloques y secciones sin página (cuando no hay PDF)."""
    for sec in secciones:
        for b in sec["bloques"]:
            b["pagina"] = None
        sec["pagina"] = None
