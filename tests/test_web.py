"""Comprobaciones estáticas de la página: lo que el resto del sistema da por supuesto de ella."""

import re
from pathlib import Path


def test_la_pagina_es_un_documento_completo_y_autocontenido(web_index: Path):
    html = web_index.read_text(encoding="utf-8")
    assert html.lower().startswith("<!doctype html>")
    assert '<meta charset="utf-8">' in html
    assert 'name="viewport"' in html
    assert "<script src=" not in html, "sin scripts externos: la página debe funcionar sin red"
    hojas = re.findall(r'<link rel="stylesheet" href="([^"]+)"', html)
    assert all(h.startswith("https://fonts.googleapis.com/") for h in hojas)


def test_contratos_con_el_resto_del_sistema(web_index: Path):
    html = web_index.read_text(encoding="utf-8")
    assert "fetch('libro.json')" in html, "lee el libro generado por `construir`"
    assert "collection('anotaciones')" in html, "la colección que lee `exportar` y Claude"
    assert "window.claude.use('db')" in html
    assert "'lector-anotaciones:' + (L.id" in html, "el respaldo local se separa por libro"
    for color in ("revisar", "cortar", "duda", "conservar"):
        assert f'data-c="{color}"' in html
    for tipo in ("'subrayado'", "'pagina'", "'capitulo'", "'general'"):
        assert tipo in html


def test_sin_restos_del_libro_original(web_index: Path):
    html = web_index.read_text(encoding="utf-8")
    assert "hiid" not in html.lower()
    assert "Hechos, inferencias" not in html


def test_los_subrayados_se_comprueban_antes_de_pintarse(web_index: Path):
    """Los ids de bloque son posicionales; la página no puede fiarse de ellos tras una reconstrucción."""
    html = web_index.read_text(encoding="utf-8")
    assert "function ubicar(" in html and "function reubicarTodo(" in html
    for estado in ("'exacto'", "'reubicado'", "'perdido'"):
        assert estado in html
    assert "libro: LIBRO ? LIBRO.generado : null" in html, "cada anotación registra con qué versión del libro se hizo"


def test_el_panel_conserva_el_editor_activo(web_index: Path):
    html = web_index.read_text(encoding="utf-8")
    assert "document.activeElement" in html and "setSelectionRange" in html
    assert "if (cambio) { pintarTodo(); renderPanel(); renderCuentas(); }" in html, (
        "el eco de un guardado propio no redibuja"
    )
