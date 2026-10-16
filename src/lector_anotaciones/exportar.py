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
from typing import Any

from .tipos import Anotacion, Json, Libro

COLORES = {
    "revisar": "revisar o reescribir",
    "cortar": "cortar",
    "duda": "duda o verificar",
    "conservar": "conservar",
}
TIPOS = {"subrayado": "subrayado", "pagina": "nota de página", "capitulo": "nota de sección", "general": "nota general"}


def cargar(ruta: Path) -> list[Anotacion]:
    """Lee el JSON en cualquiera de las tres formas y devuelve la lista de anotaciones."""
    datos = json.loads(Path(ruta).read_text(encoding="utf-8-sig"))
    return normalizar(datos)


def normalizar(datos: Any) -> list[Anotacion]:
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


def _indice_bloque(a: Anotacion) -> int:
    m = _NUM_BLOQUE.search(a.get("pid") or "")
    return int(m.group(1)) if m else 0


def _orden(a: Anotacion) -> tuple[Any, ...]:
    """Dentro de una sección, el orden del libro: por bloque y desplazamiento, como `ordenKey` en la página.

    La página de la anotación no cuenta (se fijó al crearla y puede faltar o haber quedado vieja); sólo
    ordena entre sí a las notas de página, que no tienen bloque.
    """
    pagina = (a.get("pagina") or 0) if not a.get("pid") else 0
    return (_indice_bloque(a), pagina, a.get("inicio") or 0, a.get("creado") or "")


def _grupo(a: Anotacion) -> str:
    return "General" if a.get("tipo") == "general" else (a.get("sidTitulo") or "General")


def _orden_archivo(a: Anotacion) -> tuple[Any, ...]:
    archivo, _, linea = (a.get("src") or "").partition(":")
    return (archivo, int(linea) if linea.isdigit() else 0, a.get("inicio") or 0)


def linea_hilo(h: Json) -> str:
    """Una entrada anterior de la conversación: quién, con su cierre, commit y fecha, y el texto."""
    quien = "quien edita" if h.get("de") == "editor" else "el autor"
    detalle = ", ".join(x for x in (h.get("cierre"), h.get("commit"), (h.get("cuando") or "")[:10]) if x)
    texto = (h.get("texto") or "").strip().replace(chr(10), " ")
    return f"Antes, {quien}{f' ({detalle})' if detalle else ''}: {texto}"


def _cola(a: Anotacion) -> list[str]:
    """Las líneas de la conversación anterior, la respuesta, el cierre y la réplica que siguen a una anotación."""
    lineas = [f"  - {linea_hilo(h)}" for h in a.get("hilo") or [] if isinstance(h, dict)]
    if a.get("respuesta") or a.get("cierre"):
        cierre = a.get("cierre")
        detalle = f" ({cierre}{', ' + a['commit'] if a.get('commit') else ''})" if cierre else ""
        lineas.append(f"  - Respuesta{detalle}: {(a.get('respuesta') or '').strip().replace(chr(10), ' ')}")
    if a.get("replica"):
        lineas.append(f"  - Réplica: {a['replica'].strip().replace(chr(10), ' ')}")
    if reabierta(a):
        lineas.append("  - Reabierta por el autor tras la respuesta.")
    return lineas


def propuesta(a: Anotacion) -> str:
    """Lo que un subrayado propone en lugar de su cita, sin espacios en los extremos; vacío si no propone nada (sin
    propuesta, vacía o igual a la cita), como `propuesta` en la página."""
    s = a.get("sugerencia") if a.get("tipo") == "subrayado" else None
    s = s.strip() if isinstance(s, str) else ""
    return s if s and s != (a.get("cita") or "").strip() else ""


def reabierta(a: Anotacion) -> bool:
    """Respondida (sin pregunta: atendida, descartada o sin cierre) y devuelta por el autor desde «Por revisar»."""
    return (
        bool(a.get("revisado"))
        and bool(a.get("respuesta") or a.get("cierre"))
        and a.get("cierre") != "pregunta"
        and a.get("estado") != "resuelta"
    )


def _linea(a: Anotacion) -> list[str]:
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
        if propuesta(a):
            lineas.append(f"  - Propuesta: «{propuesta(a).replace(chr(10), ' ')}»")
        return [*lineas, *_cola(a)]
    etiqueta = f"**{TIPOS.get(a.get('tipo', ''), a.get('tipo', ''))}**"
    partes = [etiqueta, pag if a.get("tipo") == "pagina" else "", src, quien]
    return [f"- {caja} " + " · ".join(p for p in partes if p) + f": {nota or '(sin texto)'}", *_cola(a)]


def orden_de_secciones(libro: Libro) -> dict[str, int]:
    """Posición de cada sección en el libro (`id` → índice), para ordenar los grupos como el libro."""
    return {s["id"]: i for i, s in enumerate(libro.get("secciones", []))}


def _ordenar_grupos(grupos: dict[str, list[Anotacion]], orden_secciones: dict[str, int] | None) -> list[str]:
    """Las secciones en el orden del libro si se conoce; si no, por su primera página y después por
    la fecha de su primera anotación. «General» va siempre al final."""
    infinito = float("inf")

    def clave(nombre: str) -> tuple[Any, ...]:
        lista = grupos[nombre]
        if nombre == "General":
            return (2, infinito, "")
        if orden_secciones is not None:
            pos = min((orden_secciones.get(a.get("sid") or "", infinito) for a in lista), default=infinito)
            if pos != infinito:
                return (0, pos, "")
        paginas = [a["pagina"] for a in lista if a.get("pagina")]
        return (1, min(paginas) if paginas else infinito, min(a.get("creado") or "" for a in lista))

    return sorted(grupos, key=clave)


def a_markdown(
    anots: list[Anotacion],
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
    grupos: dict[str, list[Anotacion]] = {}
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
