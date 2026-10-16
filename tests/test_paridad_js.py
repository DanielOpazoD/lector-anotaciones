"""El núcleo de la página (JavaScript) arma el mismo libro.json que el paquete a partir del mismo Markdown.

La página importa libros sin la línea de órdenes; sus ids, su HTML y sus huellas tienen que coincidir con los del
paquete para que un libro construido de una forma y anotado de la otra conserve sus subrayados.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from lector_anotaciones.construir import construir
from lector_anotaciones.markdown import expandir_fuentes

RAIZ = Path(__file__).resolve().parent.parent
FUENTES = RAIZ / "ejemplo" / "fuentes"
NODE = shutil.which("node")

pytestmark = pytest.mark.skipif(NODE is None, reason="hace falta node para ejecutar el núcleo de la página")


def _armar_js(rutas: list[Path], titulo: str) -> dict:
    salida = subprocess.run(
        [NODE, str(RAIZ / "tests" / "js" / "armar.mjs"), "--titulo", titulo, *map(str, rutas)],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return json.loads(salida.stdout)


def _forma(libro: dict) -> dict:
    claves = ("formato", "id", "titulo", "inicio", "paginas_fisicas", "desfase_paginas", "fuentes")
    return {
        **{k: libro[k] for k in claves},
        "secciones": [
            {
                "id": s["id"],
                "titulo": s["titulo"],
                "nivel": s["nivel"],
                "src": s["src"],
                "pagina": s["pagina"],
                "bloques": [{k: b.get(k) for k in ("id", "t", "html", "src", "h", "pagina")} for b in s["bloques"]],
            }
            for s in libro["secciones"]
        ],
    }


def test_el_ejemplo_sale_igual_en_python_y_en_la_pagina():
    rutas = expandir_fuentes([FUENTES])
    py = construir([FUENTES], titulo="Libro de ejemplo", capas=None)
    js = _armar_js(rutas, "Libro de ejemplo")
    assert _forma(js) == _forma(py)


def test_casos_raros_del_dialecto(tmp_path):
    md = tmp_path / "raro.md"
    md.write_text(
        "﻿Texto antes de todo título\r\n\r\n"
        "# Capítulo 3. Uno\n\n"
        "Párrafo con *cursiva*, **negrita**, 2*3*4, a*b, ∗x*, <etiqueta> & «comillas»\n"
        "y una segunda línea.\n\n"
        "## Interludio II. Dos\n\n"
        "1. uno\n1. dos\n\n"
        "| A | *B* |\n|:--|--:|\n| 1 | 2 |\n\n"
        "> cita\n> en dos\n\n"
        "[LEGAL]\nDerechos\n\nOtra línea\n[/LEGAL]\n\n"
        "## Apéndice B. Tres\n\n### Sub *a*\n\n#### Subsub\n\n- x\n- y **z**\n\n"
        "## Capítulo 3. Repetido\n\nFin.\n",
        encoding="utf-8",
    )
    py = construir([md], titulo="Raro", capas=None)
    js = _armar_js([md], "Raro")
    assert _forma(js) == _forma(py)


@pytest.mark.parametrize(
    "texto",
    [
        "## Capítulo 1. A\n\nUna frase\x85\n",  # NEL al final de la línea (cp1252 mal convertido)
        "## Capítulo 1. A\n\nUno\n\x1c\nDos\n",  # una línea con sólo un separador cuenta como vacía
        "## Capítulo 1. A\n\n- ﻿item\n",  # la marca de orden de bytes no es un espacio
        "## Capítulo 1. A\n\n١. uno\n٢. dos\n",  # lista numerada con dígitos arábigo-índicos
        "## Capítulo 1. A\n\n[FIGURA: a.png | Ley enda]\n",  # separador de línea Unicode dentro de la leyenda
        "## Capítulo ٣. X\n\nTexto.\n",  # el número del capítulo en otra escritura
    ],
    ids=["nel", "separador", "bom", "digitos-lista", "figura-u2028", "digito-capitulo"],
)
def test_espacios_y_digitos_unicode_como_python(tmp_path, texto):
    md = tmp_path / "c.md"
    md.write_text(texto, encoding="utf-8")
    assert _forma(_armar_js([md], "T")) == _forma(construir([md], titulo="T", capas=None))


def _evaluar_js(llamadas: list) -> list:
    salida = subprocess.run(
        [NODE, str(RAIZ / "tests" / "js" / "evaluar.mjs")],
        input=json.dumps(llamadas),
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return json.loads(salida.stdout)


def test_la_conversacion_y_lo_reabierto_se_escriben_igual_en_python_y_en_la_pagina():
    from lector_anotaciones.exportar import linea_hilo, reabierta

    hilos = [
        {
            "de": "editor",
            "texto": "Quité la cifra.",
            "cierre": "atendida",
            "commit": "abc1234",
            "cuando": "2026-10-03T10:00:00Z",
        },
        {"de": "autor", "texto": "No:\nla cifra hacía falta.", "cuando": "2026-10-04T08:00:00.000Z"},
        {"de": "editor", "texto": "  ¿Cuál preferís?  ", "cierre": "pregunta"},
        {"de": "autor", "texto": ""},
    ]
    anots = [
        {"cierre": "atendida", "revisado": "r", "estado": "abierta"},
        {"cierre": "atendida", "revisado": "r", "estado": "resuelta"},
        {"cierre": "pregunta", "revisado": "r"},
        {"cierre": "descartada"},
    ]
    js = _evaluar_js([["lineaHilo", [h]] for h in hilos] + [["reabierta", [a]] for a in anots])
    assert js == [linea_hilo(h) for h in hilos] + [reabierta(a) for a in anots]


def test_lo_que_escribe_responder_vuelve_a_la_bandeja_del_autor_en_la_pagina():
    # `responder` escribe un `respondido` nuevo; la página (porRevisar) tiene que devolver la anotación a «Por revisar»
    # aunque el autor ya hubiera revisado la respuesta anterior, y dejarla de contar como reabierta si se resolvió.
    from lector_anotaciones.responder import aplicar_update, datos_respuesta

    t = "2026-10-15T09:00:00.000Z"
    base = {"id": "a", "tipo": "general", "nota": "n", "creado": t, "respuesta": "Hecho.", "respondido": t}
    reabierta = {**base, "cierre": "atendida", "estado": "abierta", "revisado": t}
    contestada = {**base, "cierre": "pregunta", "estado": "abierta", "revisado": t, "replica": "Sí."}
    nuevas = [
        aplicar_update(a, datos_respuesta(a, {"respuesta": "Otra vez.", "cierre": c}, "2026-10-16T12:00:00.000Z"))
        for a, c in [(reabierta, "atendida"), (contestada, "pregunta"), (contestada, "descartada")]
    ]
    js = _evaluar_js(
        [["porRevisar", [a, None]] for a in [reabierta, contestada, *nuevas]]
        + [["reabierta", [a]] for a in [reabierta, *nuevas]]
    )
    assert js == [False, False, True, True, True, True, False, False, False]
