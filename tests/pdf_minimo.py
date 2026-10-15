"""Un PDF mínimo y determinista a partir de fuentes Markdown, para probar la lectura de páginas sin maquetador.

No pretende maquetar bien: escribe el texto plano en Helvetica, una línea por renglón, y salta de
página en cada título de sección (`#`, `##`, portada y página legal) o al llenarse. Lo que importa es
que `pdfinfo` y `pdftotext` lo lean como leen un libro de verdad, y que dos ejecuciones den los mismos
bytes (sin fecha ni identificador), para que el fixture de `tests/fixtures/` se pueda regenerar y
comparar. Sin dependencias: sólo la biblioteca estándar.

Uso:

    python -m tests.pdf_minimo tests/fixtures/libro_min.md --salida tests/fixtures/libro_min.pdf
    python -m tests.pdf_minimo ejemplo/fuentes --salida ejemplo/salida/libro.pdf
"""

from __future__ import annotations

import argparse
import re
import textwrap
from pathlib import Path

from lector_anotaciones.markdown import expandir_fuentes

LINEAS_POR_PAGINA = 44
ANCHO = 80
_FIGURA = re.compile(r"^\[FIGURA:\s*\S+\s*\|\s*(.+)\]$")
_SEPARADOR_TABLA = re.compile(r"^\|\s*:?-{2,}")
_SALTO = ("# ", "## ", "[PORTADA]", "[LEGAL]")


def parrafos_de_markdown(texto: str) -> list[str | None]:
    """Los párrafos tal como los imprimiría un maquetador sencillo; None es un salto de página."""
    salida: list[str | None] = []
    buf: list[str] = []

    def cerrar() -> None:
        if buf:
            salida.append(" ".join(buf))
            buf.clear()

    for linea in texto.split("\n"):
        linea = linea.strip()
        if not linea or linea in ("[/PORTADA]", "[/LEGAL]"):
            cerrar()
            continue
        if linea.startswith(_SALTO):
            cerrar()
            salida.append(None)
            if linea.startswith("#"):
                salida.append(linea.lstrip("#").strip())
            continue
        if linea.startswith(("### ", "#### ")):
            cerrar()
            salida.append(linea.lstrip("#").strip())
            continue
        if m := _FIGURA.match(linea):
            cerrar()
            salida.append(m.group(1).strip())
            continue
        if linea.startswith("|"):
            if not _SEPARADOR_TABLA.match(linea):
                cerrar()
                salida.append("   ".join(c.strip() for c in linea.strip("|").split("|")))
            continue
        if linea.startswith(("- ", "> ")) or re.match(r"^\d+\. ", linea):
            cerrar()
            salida.append(linea[2:] if linea.startswith("> ") else linea)
            continue
        buf.append(linea)
    cerrar()
    return [p.replace("*", "") if p is not None else None for p in salida]


def paginar(parrafos: list[str | None], lineas_por_pagina: int = LINEAS_POR_PAGINA) -> list[list[str]]:
    """Reparte los párrafos (envueltos a ANCHO) en páginas de a lo sumo `lineas_por_pagina` renglones."""
    paginas: list[list[str]] = []
    actual: list[str] = []
    for p in parrafos:
        if p is None:
            if actual:
                paginas.append(actual)
                actual = []
            continue
        for linea in [*textwrap.wrap(p, ANCHO), ""]:
            if len(actual) >= lineas_por_pagina:
                paginas.append(actual)
                actual = []
            actual.append(linea)
    if actual:
        paginas.append(actual)
    return paginas or [[""]]


def _cadena_pdf(linea: str) -> bytes:
    cuerpo = linea.encode("cp1252", errors="replace")
    return b"(" + cuerpo.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)") + b")"


def pdf_bytes(paginas: list[list[str]]) -> bytes:
    """Un PDF 1.4 con una página por lista de renglones, en Helvetica 11 sobre carta."""
    objetos: list[bytes] = []
    kids = []
    fuente = 3
    for i, lineas in enumerate(paginas):
        n_pagina = 4 + 2 * i
        kids.append(f"{n_pagina} 0 R")
        contenido = b"BT /F1 11 Tf 14 TL 72 720 Td " + b" T* ".join(_cadena_pdf(x) + b" Tj" for x in lineas) + b" ET"
        objetos.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 {fuente} 0 R >> >> /Contents {n_pagina + 1} 0 R >>".encode()
        )
        objetos.append(f"<< /Length {len(contenido)} >>\nstream\n".encode() + contenido + b"\nendstream")
    cabecera = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(paginas)} >>".encode(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ]
    todos = cabecera + objetos
    salida = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    desplazamientos = []
    for n, obj in enumerate(todos, 1):
        desplazamientos.append(len(salida))
        salida += f"{n} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(salida)
    salida += f"xref\n0 {len(todos) + 1}\n".encode() + b"0000000000 65535 f \n"
    for d in desplazamientos:
        salida += f"{d:010d} 00000 n \n".encode()
    salida += f"trailer\n<< /Size {len(todos) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(salida)


def pdf_de_fuentes(fuentes: list[Path], lineas_por_pagina: int = LINEAS_POR_PAGINA) -> bytes:
    parrafos: list[str | None] = []
    for ruta in expandir_fuentes(fuentes):
        parrafos.extend(parrafos_de_markdown(ruta.read_text(encoding="utf-8-sig")))
    return pdf_bytes(paginar(parrafos, lineas_por_pagina))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="escribe un PDF mínimo con el texto de las fuentes Markdown")
    p.add_argument("fuentes", nargs="+", type=Path, help="archivos .md o directorios con ellos, en orden")
    p.add_argument("--salida", type=Path, required=True)
    p.add_argument("--lineas-por-pagina", type=int, default=LINEAS_POR_PAGINA)
    args = p.parse_args(argv)
    datos = pdf_de_fuentes(args.fuentes, args.lineas_por_pagina)
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_bytes(datos)
    print(f"ok {args.salida}: {datos.count(b'/Type /Page ')} páginas, {len(datos)} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
