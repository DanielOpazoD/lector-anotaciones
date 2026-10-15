"""Conversión de las anotaciones (JSON) a un Markdown de trabajo.

Acepta tres formas de entrada, que son las que produce la página o la base compartida:

- el objeto que copia el botón «Copiar todo (JSON)»: `{"libro": …, "anotaciones": [ … ]}`;
- una lista de anotaciones;
- un diccionario `id → anotación`, como un volcado de la colección `anotaciones`.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path

COLORES = {
    "revisar": "revisar o reescribir",
    "cortar": "cortar",
    "duda": "duda o verificar",
    "conservar": "conservar",
}
TIPOS = {"subrayado": "subrayado", "pagina": "nota de página", "capitulo": "nota de sección", "general": "nota general"}


def cargar(ruta: Path) -> list[dict]:
    """Lee el JSON en cualquiera de las tres formas y devuelve la lista de anotaciones."""
    datos = json.loads(Path(ruta).read_text(encoding="utf-8"))
    return normalizar(datos)


def normalizar(datos) -> list[dict]:
    if isinstance(datos, list):
        anots = datos
    elif isinstance(datos, dict) and isinstance(datos.get("anotaciones"), list):
        anots = datos["anotaciones"]
    elif isinstance(datos, dict):
        anots = [dict(v, id=v.get("id", k)) for k, v in datos.items() if isinstance(v, dict)]
    else:
        raise ValueError("el JSON no tiene la forma de una exportación de anotaciones")
    for a in anots:
        if "id" not in a or "tipo" not in a:
            raise ValueError(f"anotación sin id o sin tipo: {a!r}"[:200])
    return anots


_NUM_BLOQUE = re.compile(r"-b(\d+)$")


def _indice_bloque(a: dict) -> int:
    m = _NUM_BLOQUE.search(a.get("pid") or "")
    return int(m.group(1)) if m else 0


def _orden(a: dict) -> tuple:
    return (a.get("pagina") or 0, _indice_bloque(a), a.get("inicio") or 0, a.get("creado") or "")


def _grupo(a: dict) -> str:
    return "General" if a.get("tipo") == "general" else (a.get("sidTitulo") or "General")


def _orden_archivo(a: dict) -> tuple:
    archivo, _, linea = (a.get("src") or "").partition(":")
    return (archivo, int(linea) if linea.isdigit() else 0, a.get("inicio") or 0)


def _cola(a: dict) -> list[str]:
    """Las líneas de respuesta, cierre y réplica que siguen a una anotación."""
    lineas = []
    if a.get("respuesta") or a.get("cierre"):
        cierre = a.get("cierre")
        detalle = f" ({cierre}{', ' + a['commit'] if a.get('commit') else ''})" if cierre else ""
        lineas.append(f"  - Respuesta{detalle}: {(a.get('respuesta') or '').strip().replace(chr(10), ' ')}")
    if a.get("replica"):
        lineas.append(f"  - Réplica: {a['replica'].strip().replace(chr(10), ' ')}")
    return lineas


def _linea(a: dict) -> list[str]:
    caja = "[x]" if a.get("estado") == "resuelta" else "[ ]"
    pag = f"p. {a['pagina']}" if a.get("pagina") else "sin página"
    src = f"`{a['src']}`" if a.get("src") else ""
    quien = f"lector {a['autor']}" if a.get("autor") else ""
    nota = (a.get("nota") or "").strip().replace("\n", " ")
    if a.get("tipo") == "subrayado":
        etiqueta = f"**{a.get('color', 'revisar')}**"
        partes = [etiqueta, pag, src, f"«{(a.get('cita') or '').strip()}»", quien]
        lineas = [f"- {caja} " + " · ".join(p for p in partes if p)]
        if nota:
            lineas.append(f"  - Nota: {nota}")
        return [*lineas, *_cola(a)]
    etiqueta = f"**{TIPOS.get(a.get('tipo', ''), a.get('tipo', ''))}**"
    partes = [etiqueta, pag if a.get("tipo") == "pagina" else "", src, quien]
    return [f"- {caja} " + " · ".join(p for p in partes if p) + f": {nota or '(sin texto)'}", *_cola(a)]


def orden_de_secciones(libro: dict) -> dict[str, int]:
    """Posición de cada sección en el libro (`id` → índice), para ordenar los grupos como el libro."""
    return {s["id"]: i for i, s in enumerate(libro.get("secciones", []))}


def _ordenar_grupos(grupos: dict[str, list[dict]], orden_secciones: dict[str, int] | None) -> list[str]:
    """Las secciones en el orden del libro si se conoce; si no, por su primera página y después por
    la fecha de su primera anotación. «General» va siempre al final."""
    infinito = float("inf")

    def clave(nombre: str) -> tuple:
        lista = grupos[nombre]
        if nombre == "General":
            return (2, infinito, "")
        if orden_secciones is not None:
            pos = min((orden_secciones.get(a.get("sid"), infinito) for a in lista), default=infinito)
            if pos != infinito:
                return (0, pos, "")
        paginas = [a["pagina"] for a in lista if a.get("pagina")]
        return (1, min(paginas) if paginas else infinito, min(a.get("creado") or "" for a in lista))

    return sorted(grupos, key=clave)


def a_markdown(
    anots: list[dict],
    titulo: str = "",
    solo_abiertas: bool = False,
    agrupar: str = "seccion",
    orden_secciones: dict[str, int] | None = None,
    ahora: datetime | None = None,
) -> str:
    """Markdown con una lista de tareas por sección (o por archivo de origen).

    `orden_secciones` (de `orden_de_secciones(libro)`) ordena las secciones como en el libro; sin él,
    por la primera página anotada de cada una.
    """
    if agrupar not in ("seccion", "archivo"):
        raise ValueError("agrupar debe ser «seccion» o «archivo»")
    if solo_abiertas:
        anots = [a for a in anots if a.get("estado") != "resuelta"]
    abiertas = sum(1 for a in anots if a.get("estado") != "resuelta")
    fecha = (ahora or datetime.now(UTC)).strftime("%Y-%m-%d %H:%M UTC")
    out = [f"# Anotaciones · {titulo}" if titulo else "# Anotaciones", ""]
    out.append(f"{len(anots)} anotaciones ({abiertas} abiertas). Exportado el {fecha}.")
    grupos: dict[str, list[dict]] = {}
    if agrupar == "seccion":
        for a in sorted(anots, key=_orden):
            grupos.setdefault(_grupo(a), []).append(a)
        nombres = _ordenar_grupos(grupos, orden_secciones)
    else:
        for a in sorted(anots, key=_orden_archivo):
            grupos.setdefault((a.get("src") or "").partition(":")[0] or "Sin origen", []).append(a)
        nombres = list(grupos)
    for nombre in nombres:
        out += ["", f"## {nombre}", ""]
        for a in grupos[nombre]:
            out += _linea(a)
    return "\n".join(out) + "\n"
