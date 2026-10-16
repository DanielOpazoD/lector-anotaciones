"""Aplicar a las fuentes Markdown las propuestas de texto de los subrayados (`sugerencia`).

Cada propuesta se busca donde dice su `src` (`archivo.md:línea`): en el bloque que empieza en esa línea y llega hasta
la siguiente línea en blanco. La cita es el texto plano del bloque, así que se busca con los espacios flexibles (un
salto de línea suave en la fuente es un espacio en la página) y tolerando la marca de énfasis (`*`, `**`) entre
palabras. Si hay más de una coincidencia, decide el contexto (`antes`, `despues`); si no aparece en el bloque (las
fuentes cambiaron desde que se construyó el libro), se busca en todo el archivo con el mismo criterio. Lo que no se
encuentra, lo ambiguo y lo que cortaría una marca de énfasis por la mitad no se toca: queda para hacerlo a mano.
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field
from pathlib import Path

from .exportar import propuesta
from .responder import motivo

_MARCA = r"\*{1,3}|_"
# Las marcas de énfasis como tramos (`**` es una sola), sin contar la viñeta `* ` de una lista.
_TRAMO = re.compile(r"(?m)^[ \t]*\*[ \t]|(\*+|_+)")


def _tramos(s: str) -> int:
    return sum(1 for m in _TRAMO.finditer(s) if m.group(1))


_ENFASIS = rf"(?:{_MARCA})?"


@dataclass
class Resultado:
    id: str
    estado: str  # aplicada, reubicada, no encontrada, ambigua, énfasis cortado, sin archivo, sin origen
    archivo: str = ""
    linea: int = 0
    cita: str = ""
    propuesta: str = ""
    detalle: str = ""


@dataclass
class Archivo:
    ruta: Path
    original: str
    texto: str = ""
    resultados: list[Resultado] = field(default_factory=list)

    def __post_init__(self):
        self.texto = self.original


def _patron(cita: str) -> re.Pattern:
    """La cita como expresión: palabras en orden, separadas por espacios cualesquiera y, si la fuente la tiene, una
    marca de énfasis a un lado u otro del espacio; la que envuelva la cita entera queda en los grupos `a` y `b`."""
    palabras = cita.split()
    sep = _ENFASIS + r"\s+" + _ENFASIS
    return re.compile(f"(?P<a>{_MARCA})?" + sep.join(re.escape(p) for p in palabras) + f"(?P<b>{_MARCA})?")


def _reemplazo(m: re.Match, texto: str) -> tuple[int, int, str] | None:
    """Qué tramo de la coincidencia se sustituye y con qué aviso. Primero el núcleo (sin las marcas de énfasis de los
    extremos): sin marcas dentro, se cambia sólo él, también dentro de un énfasis, que se conserva. Si el núcleo tiene
    marcas, la coincidencia entera, siempre que no empiece dentro de un énfasis ni deje uno abierto: la propuesta va
    sin ese énfasis. Si no (cruza el borde de un énfasis), None: no se toca."""
    a, b = m.group("a") or "", m.group("b") or ""
    ini, fin = m.start() + len(a), m.end() - len(b)
    if not _tramos(texto[ini:fin]):
        return ini, fin, ""
    parrafo = max(texto.rfind("\n\n", 0, m.start()), texto.rfind("\n\r\n", 0, m.start()), -1)
    if _tramos(texto[parrafo + 1 : m.start()]) % 2 or _tramos(m.group(0)) % 2:
        return None
    return m.start(), m.end(), "el pasaje tenía énfasis; la propuesta va sin él"


def _plano(s: str) -> str:
    return " ".join(re.sub(r"\*{1,3}|_", "", s).split())


def _puntos(texto: str, m: re.Match, a: dict) -> int:
    """Cuánto coincide el contexto de la anotación con el de la coincidencia: 0, 1 o 2 lados."""
    antes = _plano(texto[max(0, m.start() - 200) : m.start()])
    despues = _plano(texto[m.end() : m.end() + 200])
    p = 0
    if (a.get("antes") or "").strip() and antes.endswith(_plano(a["antes"])):
        p += 1
    if (a.get("despues") or "").strip() and despues.startswith(_plano(a["despues"])):
        p += 1
    return p


def _elegir(texto: str, inicio: int, fin: int, a: dict) -> tuple[re.Match | None, str]:
    """La coincidencia de la cita entre `inicio` y `fin`: la única, o la única con el mejor contexto."""
    patron = _patron(a.get("cita") or "")
    ms = list(patron.finditer(texto, inicio, fin))
    if not ms:
        return None, "no encontrada"
    if len(ms) == 1:
        return ms[0], ""
    puntos = [_puntos(texto, m, a) for m in ms]
    mejor = max(puntos)
    if puntos.count(mejor) == 1:
        return ms[puntos.index(mejor)], ""
    return None, "ambigua"


def _bloque(texto: str, linea: int) -> tuple[int, int]:
    """Desplazamientos del bloque que empieza en la línea `linea` (desde 1): hasta la siguiente línea en blanco."""
    lineas = texto.splitlines(keepends=True)
    if not 1 <= linea <= len(lineas):
        return 0, 0
    inicio = sum(len(x) for x in lineas[: linea - 1])
    fin = inicio
    for x in lineas[linea - 1 :]:
        if not x.strip() and fin > inicio:
            break
        fin += len(x)
    return inicio, fin


def _buscar_archivo(raiz: Path, nombre: str) -> Path | None:
    directo = raiz / nombre
    if directo.is_file():
        return directo
    candidatos = sorted(raiz.rglob(Path(nombre).name))
    return candidatos[0] if len(candidatos) == 1 else None


def aplicables(anots: list[dict]) -> list[dict]:
    """Los subrayados con una propuesta que espera a quien edita (sin respuesta, o reabiertos)."""
    return [a for a in anots if propuesta(a) and motivo(a) in ("nueva", "reabierta")]


def aplicar(anots: list[dict], raiz: Path) -> tuple[list[Resultado], dict[Path, Archivo]]:
    """Aplica en memoria las propuestas sobre las fuentes bajo `raiz`. Devuelve el resultado de cada propuesta y los
    archivos tocados (con el texto original y el nuevo); escribirlos es cosa de quien llama."""
    resultados: list[Resultado] = []
    archivos: dict[Path, Archivo] = {}
    pendientes: list[tuple[Archivo, int, dict, Resultado]] = []
    for a in aplicables(anots):
        nombre, _, linea = (a.get("src") or "").partition(":")
        r = Resultado(id=a["id"], estado="", archivo=nombre, cita=a.get("cita") or "", propuesta=propuesta(a))
        resultados.append(r)
        if not nombre or not linea.isdigit():
            r.estado = "sin origen"
            continue
        r.linea = int(linea)
        ruta = _buscar_archivo(raiz, nombre)
        if not ruta:
            r.estado = "sin archivo"
            continue
        if ruta not in archivos:
            archivos[ruta] = Archivo(ruta, ruta.read_text(encoding="utf-8"))
        pendientes.append((archivos[ruta], r.linea, a, r))
    # de abajo hacia arriba en cada archivo: un cambio no mueve las líneas de lo que falta por aplicar
    for arch, linea, a, r in sorted(pendientes, key=lambda x: (str(x[0].ruta), -x[1])):
        inicio, fin = _bloque(arch.texto, linea)
        m, motivo_fallo = _elegir(arch.texto, inicio, fin, a) if fin > inicio else (None, "no encontrada")
        estado = "aplicada"
        if not m:
            m, motivo_fallo = _elegir(arch.texto, 0, len(arch.texto), a)
            estado = "reubicada"
        if not m:
            r.estado = motivo_fallo
            continue
        tramo = _reemplazo(m, arch.texto)
        if tramo is None:
            r.estado = "énfasis cortado"
            r.detalle = m.group(0)
            continue
        ini, fin, detalle = tramo
        arch.texto = arch.texto[:ini] + r.propuesta + arch.texto[fin:]
        r.estado = estado
        r.detalle = detalle
        if estado == "reubicada":
            r.linea = arch.texto.count("\n", 0, ini) + 1
            r.detalle = "; ".join(x for x in (f"no estaba en la línea {linea}", detalle) if x)
        arch.resultados.append(r)
    return resultados, {k: v for k, v in archivos.items() if v.texto != v.original}


def diferencias(archivos: dict[Path, Archivo], raiz: Path) -> str:
    """Las diferencias unificadas de lo que se cambiaría, archivo por archivo."""
    out = []
    for ruta, arch in sorted(archivos.items()):
        nombre = str(ruta.relative_to(raiz)) if ruta.is_relative_to(raiz) else str(ruta)
        out += difflib.unified_diff(
            arch.original.splitlines(keepends=True),
            arch.texto.splitlines(keepends=True),
            fromfile=f"a/{nombre}",
            tofile=f"b/{nombre}",
        )
    return "".join(out)


def respuestas(resultados: list[Resultado]) -> list[dict]:
    """Las respuestas de lo aplicado, listas para `responder`."""
    return [
        {"id": r.id, "respuesta": f"Aplicada la propuesta: «{r.propuesta}».", "cierre": "atendida"}
        for r in resultados
        if r.estado in ("aplicada", "reubicada")
    ]
