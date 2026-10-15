"""Lectura de las fuentes Markdown y conversión a secciones y bloques con id estable.

Dialecto admitido (el de un libro escrito en Markdown sencillo):

- `# Título` y `## Título` abren secciones de nivel 1 y 2. `###` y `####` son subtítulos dentro
  de la sección (bloques `h3` y `h4`).
- Párrafos (líneas consecutivas no vacías), listas con `- `, listas numeradas `1. `, tablas con `|`
  y citas con `> `.
- `**negrita**` y `*cursiva*` en línea; todo lo demás se escapa como texto.
- Marcadores propios de un libro: `[FIGURA: archivo.png | Leyenda]`, y los bloques
  `[PORTADA] … [/PORTADA]` y `[LEGAL] … [/LEGAL]`, que se vuelven secciones «Portada» y
  «Página legal».

Cada bloque sale con `id` (`<sección>-b<n>`), `t` (tipo), `html`, `src` (`archivo.md:línea`) y
`texto` (versión plana, usada después para ubicar la página en el PDF).
"""

from __future__ import annotations

import html
import re
from collections.abc import Iterable
from pathlib import Path

from .util import slug, texto_plano

ROMANOS = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5}

_ABRE_BLOQUE = re.compile(r"^(#{1,4} |- |\d+\. |\||> |\[FIGURA|\[/?PORTADA\]|\[/?LEGAL\])")
_FIGURA = re.compile(r"^\[FIGURA:\s*(\S+)\s*\|\s*(.+)\]$")
_SEPARADOR_TABLA = re.compile(r"^\|\s*:?-{2,}")
_ITEM_NUMERADO = re.compile(r"^(\d+)\. ")
_NEGRITA = re.compile(r"\*\*([^*]+)\*\*")
_CURSIVA = re.compile(r"(?<![\w∗])\*([^*\n]+)\*(?!\w)")

SECCIONES_SIN_PAGINA = ("Portada", "Página legal")


def seccion_id(titulo: str, usados: set[str]) -> str:
    """Id estable y legible para una sección; se registra en `usados` para evitar duplicados."""
    if m := re.match(r"Capítulo (\d+)\.", titulo):
        base = f"cap-{int(m.group(1)):02d}"
    elif m := re.match(r"Interludio (I{1,3})\.", titulo):
        base = f"interludio-{ROMANOS[m.group(1)]}"
    elif m := re.match(r"PARTE (I{1,3}V?|IV)\.", titulo):
        base = f"parte-{ROMANOS[m.group(1)]}"
    elif m := re.match(r"Apéndice ([A-Z])\.", titulo):
        base = f"ap-{m.group(1).lower()}"
    else:
        base = slug(titulo.split(".")[0])
    sid, n = base, 2
    while sid in usados:
        sid, n = f"{base}-{n}", n + 1
    usados.add(sid)
    return sid


def inline(s: str) -> str:
    """Escapa HTML y convierte **negrita** y *cursiva*."""
    s = html.escape(s, quote=False)
    s = _NEGRITA.sub(r"<strong>\1</strong>", s)
    s = _CURSIVA.sub(r"<em>\1</em>", s)
    return s


class _Estado:
    """Estado del recorrido: las secciones ya abiertas y la sección actual."""

    def __init__(self, figs: str) -> None:
        self.figs = figs
        self.usados: set[str] = set()
        self.secciones: list[dict] = []
        self.sec: dict | None = None

    def nueva(self, titulo: str, nivel: int, src: str) -> None:
        self.sec = {
            "id": seccion_id(titulo, self.usados),
            "titulo": titulo,
            "nivel": nivel,
            "src": src,
            "bloques": [],
        }
        self.secciones.append(self.sec)

    def bloque(self, t: str, contenido, src: str, texto: str = "") -> None:
        if self.sec is None:
            self.nueva("Preliminares", 1, src)
        assert self.sec is not None
        b = {"id": f"{self.sec['id']}-b{len(self.sec['bloques']) + 1}", "t": t, "html": contenido, "src": src}
        b["texto"] = texto
        self.sec["bloques"].append(b)


def _leer_marcado(lines: list[str], i: int, cierre: str) -> tuple[list[str], int]:
    """Lee las líneas no vacías hasta `cierre` (exclusivo); devuelve (líneas, índice tras el cierre)."""
    buf: list[str] = []
    i += 1
    while i < len(lines) and not lines[i].startswith(cierre):
        if lines[i].strip():
            buf.append(lines[i].strip())
        i += 1
    if i >= len(lines):
        raise ValueError(f"falta el cierre {cierre}")
    return buf, i + 1


def _parse_lineas(lines: list[str], nombre: str, st: _Estado) -> None:
    i = 0
    while i < len(lines):
        linea = lines[i]
        src = f"{nombre}:{i + 1}"
        if not linea.strip():
            i += 1
            continue
        if linea.startswith("[PORTADA]"):
            buf, i = _leer_marcado(lines, i, "[/PORTADA]")
            st.nueva("Portada", 1, src)
            st.bloque("portada", [inline(x) for x in buf], src)
            continue
        if linea.startswith("[LEGAL]"):
            buf, i = _leer_marcado(lines, i, "[/LEGAL]")
            st.nueva("Página legal", 1, src)
            for p in buf:
                st.bloque("p", inline(p), src, p)
            continue
        if linea.startswith("# "):
            st.nueva(linea[2:].strip(), 1, src)
            i += 1
            continue
        if linea.startswith("## "):
            st.nueva(linea[3:].strip(), 2, src)
            i += 1
            continue
        if linea.startswith("### "):
            st.bloque("h3", inline(linea[4:].strip()), src, linea[4:].strip())
            i += 1
            continue
        if linea.startswith("#### "):
            st.bloque("h4", inline(linea[5:].strip()), src, linea[5:].strip())
            i += 1
            continue
        if m := _FIGURA.match(linea):
            leyenda = m.group(2).strip()
            st.bloque("figure", {"src": st.figs + m.group(1), "caption": inline(leyenda)}, src, leyenda)
            i += 1
            continue
        if linea.startswith("- "):
            items = []
            while i < len(lines) and lines[i].startswith("- "):
                items.append(inline(lines[i][2:].strip()))
                i += 1
            st.bloque("ul", items, src, " ".join(html.unescape(texto_plano(x)) for x in items))
            continue
        if m := _ITEM_NUMERADO.match(linea):
            items = []
            textos = []
            primero = int(m.group(1))
            while i < len(lines) and (m := _ITEM_NUMERADO.match(lines[i])):
                items.append(inline(lines[i][m.end() :].strip()))
                # el texto de búsqueda lleva los números que imprime el PDF: los maquetadores (pandoc, LaTeX)
                # y el <ol> de la página renumeran en secuencia desde el primero, aunque la fuente escriba «1.» en todos
                textos.append(f"{primero + len(textos)}. " + html.unescape(texto_plano(items[-1])))
                i += 1
            st.bloque("ol", items, src, " ".join(textos))
            continue
        if linea.startswith("|"):
            filas = []
            while i < len(lines) and lines[i].startswith("|"):
                if not _SEPARADOR_TABLA.match(lines[i]):
                    filas.append([inline(c.strip()) for c in lines[i].strip().strip("|").split("|")])
                i += 1
            st.bloque("table", filas, src, " ".join(html.unescape(texto_plano(c)) for c in filas[0]) if filas else "")
            continue
        if linea.startswith("> "):
            buf = []
            while i < len(lines) and lines[i].startswith("> "):
                buf.append(lines[i][2:].strip())
                i += 1
            texto = " ".join(buf)
            st.bloque("quote", inline(texto), src, texto)
            continue
        # párrafo: líneas consecutivas no vacías que no abren otro bloque
        buf = [linea.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not _ABRE_BLOQUE.match(lines[i]):
            buf.append(lines[i].strip())
            i += 1
        texto = " ".join(buf)
        st.bloque("p", inline(texto), src, texto)


def parse_texto(texto: str, nombre: str = "fuente.md", figs: str = "figs/") -> list[dict]:
    """Convierte un único Markdown (como cadena) en secciones con bloques."""
    st = _Estado(figs)
    _parse_lineas(texto.split("\n"), nombre, st)
    return st.secciones


def parse_fuentes(rutas: Iterable[Path], figs: str = "figs/") -> list[dict]:
    """Convierte varios archivos Markdown, en orden, en una sola lista de secciones.

    Una sección abierta en un archivo sigue recibiendo bloques si el siguiente archivo empieza
    sin título, como ocurre cuando un libro largo se parte en varios archivos.
    """
    st = _Estado(figs)
    for ruta in rutas:
        ruta = Path(ruta)
        _parse_lineas(ruta.read_text(encoding="utf-8-sig").split("\n"), ruta.name, st)
    return st.secciones


def expandir_fuentes(rutas: Iterable[Path]) -> list[Path]:
    """Acepta archivos y directorios; un directorio aporta sus `*.md` en orden alfabético."""
    salida: list[Path] = []
    for r in rutas:
        r = Path(r)
        if r.is_dir():
            salida.extend(sorted(p for p in r.iterdir() if p.suffix == ".md" and p.is_file()))
        elif r.is_file():
            salida.append(r)
        else:
            raise FileNotFoundError(f"no existe la fuente {r}")
    if not salida:
        raise FileNotFoundError("no se encontró ningún archivo .md en las fuentes indicadas")
    return salida
