"""Los esquemas del formato (src/lector_anotaciones/esquemas/): válidos, y lo que la documentación y la página producen
los cumple."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

jsonschema = pytest.importorskip("jsonschema")
from referencing import Registry, Resource  # noqa: E402  (viene con jsonschema)

RAIZ = Path(__file__).resolve().parent.parent
ESQUEMAS = RAIZ / "src" / "lector_anotaciones" / "esquemas"
ANOTACION = json.loads((ESQUEMAS / "anotacion.schema.json").read_text(encoding="utf-8"))
EXPORTACION = json.loads((ESQUEMAS / "exportacion.schema.json").read_text(encoding="utf-8"))
REGISTRO = Registry().with_resources([(ANOTACION["$id"], Resource.from_contents(ANOTACION))])


def _errores(esquema: dict, dato) -> list[str]:
    validador = jsonschema.Draft202012Validator(esquema, registry=REGISTRO)
    return [e.message for e in validador.iter_errors(dato)]


def test_los_esquemas_son_validos():
    jsonschema.Draft202012Validator.check_schema(ANOTACION)
    jsonschema.Draft202012Validator.check_schema(EXPORTACION)


def test_el_ejemplo_de_la_documentacion_cumple_el_esquema():
    doc = (RAIZ / "docs" / "FORMATO_ANOTACIONES.md").read_text(encoding="utf-8")
    ejemplo = json.loads(re.search(r"```json\n(.*?)\n```", doc, re.S).group(1))
    assert _errores(ANOTACION, ejemplo) == []


def test_lo_que_copia_la_pagina_cumple_el_esquema():
    # exportado con «Copiar todo (JSON)» desde la página (tests/fixtures/exportacion_pagina.json): un subrayado con su
    # conversación anterior, una nota de página, una de sección y una general
    datos = json.loads((RAIZ / "tests" / "fixtures" / "exportacion_pagina.json").read_text(encoding="utf-8"))
    assert datos["formato"] == 2
    assert {a["tipo"] for a in datos["anotaciones"]} == {"subrayado", "pagina", "capitulo", "general"}
    assert any(a.get("hilo") for a in datos["anotaciones"])
    assert any(a.get("sugerencia") for a in datos["anotaciones"])
    assert _errores(EXPORTACION, datos) == []


@pytest.mark.parametrize(
    ("cambio", "motivo"),
    [
        ({"tipo": "subrayado", "cita": None}, "un subrayado sin cita"),
        ({"tipo": "nota"}, "un tipo que no existe"),
        ({"color": "azul"}, "un color que no es una instrucción"),
        ({"hilo": [{"de": "editor"}]}, "una entrada de la conversación sin texto"),
        ({"hilo": [{"de": "otro", "texto": "x"}]}, "una entrada que no es ni del editor ni del autor"),
    ],
)
def test_el_esquema_rechaza(cambio, motivo):
    base = {"id": "a", "tipo": "subrayado", "pid": "c-b1", "inicio": 0, "fin": 3, "cita": "abc", "color": "duda"}
    dato = {**base, **cambio}
    dato = {k: v for k, v in dato.items() if v is not None}
    assert _errores(ANOTACION, dato), motivo
