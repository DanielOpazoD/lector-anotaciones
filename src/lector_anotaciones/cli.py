"""Línea de órdenes: `lector-anotaciones construir …`, `… pagina …`, `… exportar …`, `… pendientes …` y
`… responder …`."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import __version__
from .capas import ConfigCapas, leer_lista
from .construir import cargar_anterior, construir, escribir, resumen, validar
from .exportar import a_markdown, cargar, orden_de_secciones
from .pagina import escribir_pagina, esta_al_dia
from .paginas import HerramientaFaltante
from .responder import a_texto, cargar_coleccion, en_lotes, escrituras, leer_respuestas, leer_versiones, pendientes


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
    c.add_argument(
        "--pagina",
        action="store_true",
        help="escribe también la página de lectura (index.html) junto a la salida, lista para servir o publicar",
    )

    g = sub.add_parser("pagina", help="escribe la página de lectura y anotación (un único index.html sin dependencias)")
    g.add_argument("--salida", type=Path, default=Path("index.html"), help="archivo HTML de salida")
    g.add_argument(
        "--comprobar",
        action="store_true",
        help="no escribe nada: termina con error si la salida no coincide con lo que se empaquetaría ahora",
    )

    e = sub.add_parser("exportar", help="convierte las anotaciones (JSON) en un Markdown de trabajo")
    e.add_argument("anotaciones", type=Path, help="JSON copiado desde la página o volcado de la colección")
    e.add_argument("--salida", type=Path, help="archivo Markdown (por defecto, la salida estándar)")
    e.add_argument("--titulo", default="")
    e.add_argument("--solo-abiertas", action="store_true", help="omite las anotaciones resueltas")
    e.add_argument("--agrupar", choices=("seccion", "archivo"), default="seccion")
    e.add_argument("--libro", type=Path, help="libro.json, para ordenar las secciones como en el libro")

    pe = sub.add_parser("pendientes", help="lista lo que espera respuesta de quien edita las fuentes")
    pe.add_argument("anotaciones", type=Path, help="JSON de la página o directorio con un documento por archivo")
    pe.add_argument("--json", action="store_true", help="salida en JSON: [{motivo, anotacion}]")
    pe.add_argument("--salida", type=Path, help="archivo de salida (por defecto, la salida estándar)")

    r = sub.add_parser(
        "responder", help="prepara las escrituras (acción «batch» de ArtifactData) que dejan las respuestas en la base"
    )
    r.add_argument("anotaciones", type=Path, help="la colección como se leyó: JSON o directorio de documentos")
    r.add_argument("respuestas", type=Path, help="JSON con [{id, respuesta, cierre, commit?}]")
    r.add_argument(
        "--versiones",
        type=Path,
        required=True,
        help="versiones de los documentos: JSON {id: versión} o el texto que devolvió la lectura de la colección",
    )
    r.add_argument("--coleccion", default="anotaciones", help="ruta de la colección (p. ej. libros/<id>/anotaciones)")
    r.add_argument(
        "--salida",
        type=Path,
        help="archivo JSON con las escrituras; si no caben en un lote, uno por lote (-1, -2…). Por defecto, la salida "
        "estándar",
    )
    return p


def _escribir_o_imprimir(texto: str, salida: Path | None, resumen: str) -> None:
    if salida:
        Path(salida).write_text(texto, encoding="utf-8")
        print(f"ok {salida}: {resumen}")
    else:
        sys.stdout.write(texto)


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
        if args.pagina:
            destino = Path(args.salida).parent / "index.html"
            print(f"ok {destino}: página de lectura, {escribir_pagina(destino) // 1024} KB")
        return 1 if (problemas and args.estricto) else 0
    if args.orden == "pagina":
        if args.comprobar:
            if esta_al_dia(args.salida):
                print(f"ok {args.salida}: al día con las fuentes de la página")
                return 0
            orden = f"lector-anotaciones pagina --salida {args.salida}"
            print(f"error: {args.salida} no coincide con las fuentes; regenérala con `{orden}`", file=sys.stderr)
            return 1
        print(f"ok {args.salida}: página de lectura, {escribir_pagina(args.salida) // 1024} KB")
        return 0
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
    if args.orden == "pendientes":
        try:
            lista = pendientes(cargar_coleccion(args.anotaciones))
        except (FileNotFoundError, ValueError) as e:
            print(f"error: {e}", file=sys.stderr)
            return 2
        if args.json:
            texto = json.dumps([{"motivo": m, "anotacion": a} for m, a in lista], ensure_ascii=False, indent=2) + "\n"
        else:
            texto = a_texto(lista)
        _escribir_o_imprimir(texto, args.salida, f"{len(lista)} pendientes")
        return 0
    if args.orden == "responder":
        notas: list[str] = []
        try:
            lotes = en_lotes(
                escrituras(
                    cargar_coleccion(args.anotaciones),
                    leer_respuestas(args.respuestas),
                    leer_versiones(args.versiones),
                    coleccion=args.coleccion,
                    avisos=notas,
                )
            )
        except (FileNotFoundError, ValueError) as e:
            print(f"error: {e}", file=sys.stderr)
            return 2
        for a in notas:
            print(f"aviso: {a}", file=sys.stderr)
        if len(lotes) > 1 and not args.salida:
            print(f"error: {len(lotes)} lotes no caben en la salida estándar; usa --salida", file=sys.stderr)
            return 2
        if len(lotes) <= 1:
            lote = lotes[0] if lotes else []
            texto = json.dumps(lote, ensure_ascii=False, indent=2) + "\n"
            _escribir_o_imprimir(texto, args.salida, f"{len(lote)} escrituras en un lote")
            return 0
        for i, lote in enumerate(lotes, 1):
            destino = Path(args.salida).with_name(f"{Path(args.salida).stem}-{i}{Path(args.salida).suffix}")
            destino.write_text(json.dumps(lote, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"ok {destino}: lote {i} de {len(lotes)}, {len(lote)} escrituras")
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
