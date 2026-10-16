"""Capas editoriales: señales calculadas sobre el texto de cada bloque, para verlas mientras se lee.

Cada capa es una lista de rangos `[inicio, fin]` en caracteres sobre el texto tal como lo muestra la
página (el `textContent` del bloque, sin marcadores de página), el mismo sistema de coordenadas que
usan los subrayados. Las capas:

- `fl`  frases largas: oraciones con más palabras que el umbral (50 por defecto);
- `mu`  muletillas: expresiones de una lista, con límites de palabra y sin distinguir mayúsculas;
- `tr`  términos retirados: variantes léxicas que el libro decidió no usar (lista del proyecto);
- `rep` repeticiones cercanas: la misma palabra larga dos veces a poca distancia;
- `cn`  citas narrativas: «Autor (año)» en el cuerpo de la frase, por si se quiere revisar el reparto
        entre citas narrativas y entre paréntesis.
"""

from __future__ import annotations

import bisect
import re
from dataclasses import dataclass, field
from pathlib import Path

from .util import norm

MULETILLAS_POR_DEFECTO = [
    "por eso",
    "exactamente",
    "precisamente",
    "justamente",
    "en el fondo",
    "en realidad",
    "simplemente",
    "claramente",
    "obviamente",
    "evidentemente",
    "sin duda",
    "de alguna manera",
]

_FIN_ORACION = re.compile(r"(?<=[.!?…»])\s+(?=[«¿¡(\[]?[A-ZÁÉÍÓÚÑ0-9])")
_PALABRA = re.compile(r"[^\W\d_]{2,}", re.UNICODE)
_NOMBRE = r"[A-ZÁÉÍÓÚÑ][\wáéíóúñü'-]+"
_CITA_NARRATIVA = re.compile(
    r"\b" + _NOMBRE + r"(?:,? (?:y|e|and|&) " + _NOMBRE + r")?(?: et al\.)? \((?:\d{4}[a-z]?)(?:[,;] p+\. ?[\d–-]+)?\)"
)


@dataclass
class ConfigCapas:
    frase_larga: int = 50
    muletillas: list[str] = field(default_factory=lambda: list(MULETILLAS_POR_DEFECTO))
    terminos_retirados: list[str] = field(default_factory=list)
    repeticion_min_letras: int = 7
    repeticion_ventana: int = 120


def _oraciones(texto: str) -> list[tuple[int, int]]:
    """Rangos [inicio, fin) de cada oración, sin espacios de borde."""
    rangos = []
    inicio = 0
    for m in _FIN_ORACION.finditer(texto):
        rangos.append((inicio, m.start()))
        inicio = m.end()
    rangos.append((inicio, len(texto)))
    salida = []
    for a, b in rangos:
        seg = texto[a:b]
        izq = len(seg) - len(seg.lstrip())
        der = len(seg) - len(seg.rstrip())
        if b - der > a + izq:
            salida.append((a + izq, b - der))
    return salida


def frases_largas(texto: str, umbral: int) -> list[list[int]]:
    return [[a, b] for a, b in _oraciones(texto) if len(texto[a:b].split()) > umbral]


def _buscar_expresiones(texto: str, expresiones: list[str]) -> list[list[int]]:
    rangos: list[list[int]] = []
    for expr in expresiones:
        expr = expr.strip()
        if not expr:
            continue
        patron = r"(?<![\wáéíóúñü])" + re.escape(expr).replace(r"\ ", r"\s+") + r"(?![\wáéíóúñü])"
        for m in re.finditer(patron, texto, flags=re.IGNORECASE):
            rangos.append([m.start(), m.end()])
    return sorted(rangos)


def repeticiones(texto: str, min_letras: int, ventana: int) -> list[list[int]]:
    """Dos apariciones de la misma palabra larga (normalizada) a menos de `ventana` caracteres."""
    vistas: dict[str, int] = {}
    marcados: set[tuple[int, int]] = set()
    posiciones: dict[str, tuple[int, int]] = {}
    for m in _PALABRA.finditer(texto):
        palabra = m.group(0)
        if len(palabra) < min_letras:
            continue
        clave = norm(palabra)
        if clave in vistas and m.start() - vistas[clave] <= ventana:
            marcados.add(posiciones[clave])
            marcados.add((m.start(), m.end()))
        vistas[clave] = m.start()
        posiciones[clave] = (m.start(), m.end())
    return [list(r) for r in sorted(marcados)]


def citas_narrativas(texto: str) -> list[list[int]]:
    return [[m.start(), m.end()] for m in _CITA_NARRATIVA.finditer(texto)]


def largo_utf16(texto: str) -> int:
    """Lo que mide `texto` en unidades UTF-16 (`String.length` en la página)."""
    return sum(2 if ord(c) >= 0x10000 else 1 for c in texto)


def a_utf16(texto: str, rangos: list[list[int]]) -> list[list[int]]:
    """Convierte índices de puntos de código (Python) a unidades UTF-16 (lo que mide `String.length` en la página).

    Sólo difieren cuando hay caracteres fuera del plano básico (emoji, símbolos matemáticos), que en
    JavaScript ocupan dos unidades.
    """
    if all(ord(c) < 0x10000 for c in texto):
        return rangos
    acumulado = [0]
    for c in texto:
        acumulado.append(acumulado[-1] + (2 if ord(c) >= 0x10000 else 1))
    return [[acumulado[a], acumulado[b]] for a, b in rangos]


def calcular_capas(texto: str, config: ConfigCapas | None = None) -> dict[str, list[list[int]]]:
    """Las capas de un bloque, en unidades UTF-16; sólo se incluyen las que tienen algo."""
    cfg = config or ConfigCapas()
    capas = {
        "fl": frases_largas(texto, cfg.frase_larga),
        "mu": _buscar_expresiones(texto, cfg.muletillas),
        "tr": _buscar_expresiones(texto, cfg.terminos_retirados),
        "rep": repeticiones(texto, cfg.repeticion_min_letras, cfg.repeticion_ventana),
        "cn": citas_narrativas(texto),
    }
    return {k: a_utf16(texto, v) for k, v in capas.items() if v}


def _reproyectar(partes: list[str], inicios: list[int], rangos: list[list[int]]) -> list[list[int]]:
    """Lleva rangos del texto unido por espacios al texto pegado del bloque, en unidades UTF-16.

    `inicios` es dónde empieza cada parte en el texto unido. Un rango que cruce el límite de su parte se
    recorta al final de ella; si no queda nada, se omite.
    """
    desplazamientos = [0]
    for parte in partes:
        desplazamientos.append(desplazamientos[-1] + largo_utf16(parte))
    salida = []
    for a, b in rangos:
        k = bisect.bisect_right(inicios, a) - 1
        parte, inicio = partes[k], inicios[k]
        b = min(b, inicio + len(parte))
        if b <= a:
            continue
        base = desplazamientos[k]
        salida.append([base + largo_utf16(parte[: a - inicio]), base + largo_utf16(parte[: b - inicio])])
    return salida


def capas_por_partes(partes: list[str], config: ConfigCapas | None = None) -> dict[str, list[list[int]]]:
    """Las capas de un bloque compuesto de varios trozos (los ítems de una lista, las celdas de una tabla).

    Las frases largas y las citas se buscan parte por parte, para que el final de un ítem y el comienzo
    del siguiente no formen una sola oración. Las muletillas, los términos retirados y las repeticiones
    se buscan sobre las partes unidas por un espacio, de modo que una palabra repetida entre dos ítems o
    celdas sí se ve (y dos ítems pegados no forman una sola palabra); un rango que cruzaría de una parte
    a la siguiente se recorta al final de la suya. En todos los casos las coordenadas son las del texto
    pegado del bloque (su `textContent`), en unidades UTF-16. Con una sola parte equivale a `calcular_capas`.
    """
    cfg = config or ConfigCapas()
    if not partes:
        return {}
    unido = " ".join(partes)
    inicios = [0]
    for parte in partes[:-1]:
        inicios.append(inicios[-1] + len(parte) + 1)
    por_parte: dict[str, list[list[int]]] = {"fl": [], "cn": []}
    desplazamiento = 0
    for parte in partes:
        for clave, rangos in (("fl", frases_largas(parte, cfg.frase_larga)), ("cn", citas_narrativas(parte))):
            por_parte[clave].extend([a + desplazamiento, b + desplazamiento] for a, b in a_utf16(parte, rangos))
        desplazamiento += largo_utf16(parte)
    unidas = {
        "mu": _buscar_expresiones(unido, cfg.muletillas),
        "tr": _buscar_expresiones(unido, cfg.terminos_retirados),
        "rep": repeticiones(unido, cfg.repeticion_min_letras, cfg.repeticion_ventana),
    }
    capas = {
        "fl": por_parte["fl"],
        "mu": _reproyectar(partes, inicios, unidas["mu"]),
        "tr": _reproyectar(partes, inicios, unidas["tr"]),
        "rep": _reproyectar(partes, inicios, unidas["rep"]),
        "cn": por_parte["cn"],
    }
    return {k: v for k, v in capas.items() if v}


def leer_lista(ruta: str | Path) -> list[str]:
    """Una expresión por línea; se ignoran vacías y las que empiezan con #."""
    lineas = Path(ruta).read_text(encoding="utf-8-sig").split("\n")
    return [x.strip() for x in lineas if x.strip() and not x.strip().startswith("#")]
