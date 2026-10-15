"""Línea de órdenes: `lector-anotaciones construir …` y `lector-anotaciones exportar …`."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import __version__
from .capas import ConfigCapas, leer_lista
from .construir import cargar_anterior, construir, escribir, resumen, validar
from .exportar import a_markdown, cargar, orden_de_secciones
from .paginas import HerramientaFaltante


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="lector-anotaciones",
        description="Convierte un libro en Markdown en la página de lectura y anotación, y vuelca las anotaciones.",
    )
    p.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = p.add_subparsers(dest="orden", required=True)

    c = sub.add_parser("construir", help="genera libro.json desde las fuentes Markdown (y el PDF, si lo hay)")
    c.add_argument("fuentes", nargs="+", type=Path, help="archivos .md o directorios con ellos, en orden")
    c.add_argument("--pdf", type=Path, help="PDF maquetado del libro, para asignar páginas impresas")
    c.add_argument("--salida", type=Path, default=Path("libro.json"), help="archivo JSON de salida")
    c.add_argument("--titulo", default="", help="título del libro (por defecto, el de la primera sección)")
    c.add_argument("--subtitulo", default="")
    c.add_argument("--autor", default="")
    c.add_argument("--figs", default="figs/", help="prefijo con que la página pedirá las figuras")
    c.add_argument(
        "--marca-pagina-1",
        default=None,
        help="texto con que empieza la página impresa 1 en el PDF (p. ej. el encabezado corrido y «Prefacio»)",
    )
    c.add_argument("--ventana", type=int, default=5, help="páginas hacia adelante en que se busca cada bloque")
    c.add_argument(
        "--claves-anteriores",
        nargs="*",
        default=[],
        help="claves de localStorage de versiones anteriores de la página; sus anotaciones se migran al cargar",
    )
    c.add_argument("--estricto", action="store_true", help="termina con error si la validación encuentra problemas")
    c.add_argument(
        "--anterior",
        type=Path,
        default=None,
        help="libro.json previo con que comparar (por defecto, la propia salida si ya existe)",
    )
    c.add_argument("--sin-anterior", action="store_true", help="no marcar los bloques cambiados")
    c.add_argument("--sin-capas", action="store_true", help="no calcular las capas editoriales")
    c.add_argument("--frase-larga", type=int, default=50, help="umbral de palabras de la capa de frases largas")
    c.add_argument(
        "--muletillas", type=Path, help="archivo con una muletilla por línea (sustituye la lista por defecto)"
    )
    c.add_argument("--terminos-retirados", type=Path, help="archivo con un término retirado por línea")

    e = sub.add_parser("exportar", help="convierte las anotaciones (JSON) en un Markdown de trabajo")
    e.add_argument("anotaciones", type=Path, help="JSON copiado desde la página o volcado de la colección")
    e.add_argument("--salida", type=Path, help="archivo Markdown (por defecto, la salida estándar)")
    e.add_argument("--titulo", default="")
    e.add_argument("--solo-abiertas", action="store_true", help="omite las anotaciones resueltas")
    e.add_argument("--agrupar", choices=("seccion", "archivo"), default="seccion")
    e.add_argument("--libro", type=Path, help="libro.json, para ordenar las secciones como en el libro")
    return p


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.orden == "construir":
        avisos: list[str] = []
        try:
            anterior = None if args.sin_anterior else cargar_anterior(args.anterior or args.salida, avisos)
            capas = None
            if not args.sin_capas:
                capas = ConfigCapas(frase_larga=args.frase_larga)
                if args.muletillas:
                    capas.muletillas = leer_lista(args.muletillas)
                if args.terminos_retirados:
                    capas.terminos_retirados = leer_lista(args.terminos_retirados)
            libro = construir(
                args.fuentes,
                pdf=args.pdf,
                titulo=args.titulo,
                subtitulo=args.subtitulo,
                autor=args.autor,
                figs=args.figs,
                marca_pagina_1=args.marca_pagina_1,
                ventana=args.ventana,
                claves_anteriores=args.claves_anteriores,
                anterior=anterior,
                capas=capas,
                avisos=avisos,
            )
        except (FileNotFoundError, HerramientaFaltante, ValueError) as e:
            print(f"error: {e}", file=sys.stderr)
            return 2
        for a in avisos:
            print(f"aviso: {a}", file=sys.stderr)
        problemas = validar(libro)
        for pr in problemas:
            print(f"problema: {pr}", file=sys.stderr)
        tam = escribir(libro, args.salida)
        print(f"ok {args.salida}: {resumen(libro)}, {tam // 1024} KB")
        return 1 if (problemas and args.estricto) else 0
    if args.orden == "exportar":
        try:
            anots = cargar(args.anotaciones)
            orden = None
            titulo = args.titulo
            if args.libro:
                libro = json.loads(Path(args.libro).read_text(encoding="utf-8-sig"))
                orden = orden_de_secciones(libro)
                titulo = titulo or libro.get("titulo", "")
        except (FileNotFoundError, ValueError) as e:
            print(f"error: {e}", file=sys.stderr)
            return 2
        md = a_markdown(
            anots, titulo=titulo, solo_abiertas=args.solo_abiertas, agrupar=args.agrupar, orden_secciones=orden
        )
        if args.salida:
            Path(args.salida).write_text(md, encoding="utf-8")
            print(f"ok {args.salida}: {len(anots)} anotaciones")
        else:
            sys.stdout.write(md)
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
