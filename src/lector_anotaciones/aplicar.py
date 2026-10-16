"""Aplicar a las fuentes Markdown las propuestas de texto de los subrayados (`sugerencia`).

Cada propuesta se busca donde dice su `src` (`archivo.md:línea`): en el bloque que empieza en esa línea y llega hasta
la siguiente línea en blanco. La cita es el texto plano del bloque, así que se busca con los espacios flexibles (un
salto de línea suave en la fuente es un espacio en la página), tolerando la marca de énfasis (`*`, `**`) entre
palabras y sin partir palabras. Si hay más de una coincidencia, decide el contexto (`antes`, `despues`); si no aparece
en el bloque (las fuentes cambiaron desde que se construyó el libro), se busca en todo el archivo, y ahí se exige que
coincida al menos un lado del contexto, como al reubicar en la página.

No se toca, y queda para hacerlo a mano: lo que no se encuentra, lo ambiguo, lo que cortaría una marca de énfasis por
la mitad, lo que cambiaría la forma del texto (una celda o un ítem de más, un título nuevo) y lo que ya está aplicado
(la propuesta ya está donde estaba la cita: aplicar dos veces no duplica). Sólo se leen y escriben archivos dentro de
las fuentes, con sus finales de línea.
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .exportar import propuesta
from .markdown import parse_texto
from .responder import motivo
from .tipos import Anotacion, Json

# El dialecto sólo tiene `*cursiva*` y `**negrita**`: el guion bajo es un carácter más.
_MARCA = r"\*{1,3}"
_ENFASIS = rf"(?:{_MARCA})?"
# Las marcas de énfasis como tramos (`**` es una sola), sin contar la viñeta `* ` de una lista.
_TRAMO = re.compile(r"(?m)^[ \t]*\*[ \t]|(\*+)")
_NUNCA = re.compile(r"(?!x)x")


def _tramos(s: str) -> int:
    return sum(1 for m in _TRAMO.finditer(s) if m.group(1))


@dataclass
class Resultado:
    id: str
    # aplicada, reubicada, ya aplicada, no encontrada, ambigua, énfasis cortado, estructura, sin archivo, sin origen
    estado: str
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

    def __post_init__(self) -> None:
        self.texto = self.original


def _patron(texto: str) -> re.Pattern[str]:
    """El texto como expresión: palabras en orden, separadas por espacios cualesquiera y, si la fuente la tiene, una
    marca de énfasis a un lado u otro del espacio; la que envuelva el texto entero queda en los grupos `a` y `b`. No
    empieza ni termina dentro de una palabra."""
    palabras = texto.split()
    if not palabras:
        return _NUNCA
    sep = _ENFASIS + r"\s+" + _ENFASIS
    ini = r"(?<!\w)" if re.match(r"\w", palabras[0]) else ""
    fin = r"(?!\w)" if re.search(r"\w$", palabras[-1]) else ""
    cuerpo = sep.join(re.escape(p) for p in palabras)
    return re.compile(f"(?P<a>{_MARCA})?{ini}{cuerpo}{fin}(?P<b>{_MARCA})?")


def _reemplazo(m: re.Match[str], texto: str) -> tuple[int, int, str] | None:
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
    return " ".join(re.sub(_MARCA, "", s).split())


def _puntos(texto: str, m: re.Match[str], a: Anotacion) -> int:
    """Cuánto coincide el contexto de la anotación con el de la coincidencia: 0, 1 o 2 lados."""
    antes = _plano(texto[max(0, m.start() - 200) : m.start()])
    despues = _plano(texto[m.end() : m.end() + 200])
    p = 0
    if _plano(a.get("antes") or "") and antes.endswith(_plano(a["antes"])):
        p += 1
    if _plano(a.get("despues") or "") and despues.startswith(_plano(a["despues"])):
        p += 1
    return p


def _elegir(texto: str, inicio: int, fin: int, a: Anotacion, con_contexto: bool) -> tuple[re.Match[str] | None, str]:
    """La coincidencia de la cita entre `inicio` y `fin`: la única, o la única con el mejor contexto. Con
    `con_contexto` (fuera del bloque), sólo cuentan las que coinciden al menos en un lado del contexto."""
    ms = list(_patron(a.get("cita") or "").finditer(texto, inicio, fin))
    puntos = [_puntos(texto, m, a) for m in ms]
    if con_contexto:
        ms, puntos = [m for m, p in zip(ms, puntos, strict=True) if p], [p for p in puntos if p]
    if not ms:
        return None, "no encontrada"
    if len(ms) == 1:
        return ms[0], ""
    mejor = max(puntos)
    if puntos.count(mejor) == 1:
        return ms[puntos.index(mejor)], ""
    return None, "ambigua"


def _ya_aplicada(texto: str, inicio: int, fin: int, a: Anotacion, prop: str, m: re.Match[str] | None) -> bool:
    """¿La propuesta ya está donde estaba la cita? Con la cita encontrada, si una aparición de la propuesta la contiene
    (aplicarla otra vez la duplicaría). Sin ella, si la propuesta aparece con el contexto de la anotación; si la
    anotación no tiene contexto, si aparece en su bloque."""
    apariciones = list(_patron(prop).finditer(texto))
    if m is not None:
        return any(p.start() <= m.start() and p.end() >= m.end() for p in apariciones)
    if _plano(a.get("antes") or "") or _plano(a.get("despues") or ""):
        return any(_puntos(texto, p, a) for p in apariciones)
    return any(inicio <= p.start() and p.end() <= fin for p in apariciones)


def _forma(texto: str) -> str | list[tuple[str, list[tuple[str, Any]]]]:
    """La forma del texto como lo leería `construir`: secciones y bloques, sin el texto. Una propuesta no la cambia."""

    def esqueleto(x: Any) -> Any:
        if isinstance(x, list):
            return [esqueleto(y) for y in x]
        if isinstance(x, dict):
            return {k: esqueleto(v) for k, v in x.items()}
        return ""

    try:
        secciones = parse_texto(texto.replace("\r\n", "\n"))
    except Exception as e:  # una fuente que ya no se puede leer: la forma es el error
        return repr(e)
    return [(s["id"], [(b["t"], esqueleto(b["html"])) for b in s["bloques"]]) for s in secciones]


def _bloque(texto: str, linea: int) -> tuple[int, int]:
    """Desplazamientos del bloque que empieza en la línea `linea` (desde 1): hasta la siguiente línea en blanco. Las
    líneas se cuentan como `construir`, partiendo sólo en `\\n`."""
    lineas = texto.split("\n")
    if not 1 <= linea <= len(lineas):
        return 0, 0
    inicio = sum(len(x) + 1 for x in lineas[: linea - 1])
    fin = inicio
    for x in lineas[linea - 1 :]:
        if not x.strip() and fin > inicio:
            break
        fin = min(len(texto), fin + len(x) + 1)
    return inicio, fin


def _buscar_archivo(raiz: Path, nombre: str) -> Path | None:
    """El archivo de un `src`: `construir` guarda sólo el nombre, así que un nombre con carpetas (o `..`) no es de las
    fuentes. Se busca bajo `raiz` y nunca fuera de ella (tampoco por un enlace simbólico)."""
    if not nombre or Path(nombre).name != nombre or nombre in (".", ".."):
        return None
    base = raiz.resolve()
    candidatos = sorted({p.resolve() for p in raiz.rglob(nombre) if p.is_file()})
    candidatos = [p for p in candidatos if p.is_relative_to(base)]
    return candidatos[0] if len(candidatos) == 1 else None


def aplicables(anots: list[Anotacion]) -> list[Anotacion]:
    """Los subrayados con una propuesta que espera a quien edita (sin respuesta, o reabiertos)."""
    return [a for a in anots if propuesta(a) and motivo(a) in ("nueva", "reabierta")]


def leer(ruta: Path) -> str:
    with open(ruta, encoding="utf-8", newline="") as f:
        return f.read()


def escribir(ruta: Path, texto: str) -> None:
    with open(ruta, "w", encoding="utf-8", newline="") as f:
        f.write(texto)


def aplicar(anots: list[Anotacion], raiz: Path) -> tuple[list[Resultado], dict[Path, Archivo]]:
    """Aplica en memoria las propuestas sobre las fuentes bajo `raiz`. Devuelve el resultado de cada propuesta y los
    archivos tocados (con el texto original y el nuevo); escribirlos es cosa de quien llama (`escribir`)."""
    raiz = Path(raiz)
    if not raiz.is_dir():
        raise FileNotFoundError(f"no existe el directorio de fuentes {raiz}")
    resultados: list[Resultado] = []
    archivos: dict[Path, Archivo] = {}
    pendientes: list[tuple[Archivo, int, Anotacion, Resultado]] = []
    for a in aplicables(anots):
        nombre, _, linea = (a.get("src") or "").rpartition(":")
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
            archivos[ruta] = Archivo(ruta, leer(ruta))
        pendientes.append((archivos[ruta], r.linea, a, r))
    # de abajo hacia arriba en cada archivo: un cambio no mueve las líneas de lo que falta por aplicar
    for arch, linea, a, r in sorted(pendientes, key=lambda x: (str(x[0].ruta), -x[1])):
        _aplicar_una(arch, linea, a, r)
    return resultados, {k: v for k, v in archivos.items() if v.texto != v.original}


def _aplicar_una(arch: Archivo, linea: int, a: Anotacion, r: Resultado) -> None:
    texto = arch.texto
    inicio, fin = _bloque(texto, linea)
    m, fallo = _elegir(texto, inicio, fin, a, False) if fin > inicio else (None, "no encontrada")
    estado = "aplicada"
    if not m and fallo != "ambigua":  # sólo lo que no está en su bloque se busca en el resto del archivo
        m, fallo = _elegir(texto, 0, len(texto), a, True)
        estado = "reubicada"
    if _ya_aplicada(texto, inicio, fin, a, r.propuesta, m):
        r.estado = "ya aplicada"
        return
    if not m:
        r.estado = fallo
        return
    tramo = _reemplazo(m, texto)
    if tramo is None:
        r.estado, r.detalle = "énfasis cortado", m.group(0)
        return
    ini, fin_m, detalle = tramo
    # la propuesta es un trozo de línea: sus saltos de línea van como espacios
    nuevo = re.sub(r"\s*\n\s*", " ", r.propuesta)
    if nuevo != r.propuesta:
        detalle = "; ".join(x for x in (detalle, "los saltos de línea de la propuesta van como espacios") if x)
    resultado = texto[:ini] + nuevo + texto[fin_m:]
    if _forma(resultado) != _forma(texto):
        r.estado, r.detalle = "estructura", "la propuesta cambiaría la forma del texto (celdas, ítems, títulos)"
        return
    arch.texto = resultado
    r.estado, r.detalle = estado, detalle
    if estado == "reubicada":
        r.linea = resultado.count("\n", 0, ini) + 1
        r.detalle = "; ".join(x for x in (f"no estaba en la línea {linea}", detalle) if x)
    arch.resultados.append(r)


def diferencias(archivos: dict[Path, Archivo], raiz: Path) -> str:
    """Las diferencias unificadas de lo que se cambiaría, archivo por archivo, con los finales de línea tal cual."""
    base = Path(raiz).resolve()
    out: list[str] = []
    for ruta, arch in sorted(archivos.items()):
        nombre = str(ruta.relative_to(base)) if ruta.is_relative_to(base) else str(ruta)
        out += difflib.unified_diff(
            arch.original.splitlines(keepends=True),
            arch.texto.splitlines(keepends=True),
            fromfile=f"a/{nombre}",
            tofile=f"b/{nombre}",
        )
    return "".join(out)


def respuestas(resultados: list[Resultado]) -> list[Json]:
    """Las respuestas de lo aplicado, listas para `responder`."""
    return [
        {"id": r.id, "respuesta": f"Aplicada la propuesta: «{r.propuesta}».", "cierre": "atendida"}
        for r in resultados
        if r.estado in ("aplicada", "reubicada")
    ]
