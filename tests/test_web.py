"""Comprobaciones estáticas de la página: lo que el resto del sistema da por supuesto de ella."""

import re
from pathlib import Path


def _codigo(ruta: Path) -> str:
    """El texto de la página con cada tramo de espacios reducido a uno: los contratos son el código, no su formato."""
    return re.sub(r"\s+", " ", ruta.read_text(encoding="utf-8"))


def test_la_pagina_es_un_documento_completo_y_autocontenido(web_index: Path):
    html = _codigo(web_index)
    assert html.lower().startswith("<!doctype html>")
    assert '<meta charset="utf-8">' in html
    assert 'name="viewport"' in html
    assert "<script src=" not in html, "sin scripts externos: la página debe funcionar sin red"
    hojas = re.findall(r'<link rel="stylesheet" href="([^"]+)"', html)
    assert all(h.startswith("https://fonts.googleapis.com/") for h in hojas)


def test_contratos_con_el_resto_del_sistema(web_index: Path):
    html = _codigo(web_index)
    assert "fetch('libro.json')" in html, "lee el libro generado por `construir`"
    # el libro de la página guarda en «anotaciones» (lo que lee `exportar` y Claude); uno importado, en libros/<id>/…
    assert "collection(P.rutaBase('anotaciones'))" in html, "la colección que lee `exportar` y Claude"
    assert "E.FUENTE.tipo === 'base' ? 'libros/' + E.FUENTE.id + '/' + nombre : nombre" in html
    assert "window.claude.use('db')" in html
    assert "'lector-anotaciones:' + (id || 'libro')" in html, "el respaldo local se separa por libro"
    assert "'lector-anotaciones:' + tipo + ':' + id" in html, "y el de un libro importado lleva su lugar"
    for color in ("revisar", "cortar", "duda", "conservar"):
        assert f'data-c="{color}"' in html
    for tipo in ("'subrayado'", "'pagina'", "'capitulo'", "'general'"):
        assert tipo in html


def test_sin_restos_del_libro_original(web_index: Path):
    html = _codigo(web_index)
    assert "hiid" not in html.lower()
    assert "Hechos, inferencias" not in html


def test_los_subrayados_se_comprueban_antes_de_pintarse(web_index: Path):
    """Los ids de bloque son posicionales; la página no puede fiarse de ellos tras una reconstrucción."""
    html = _codigo(web_index)
    assert "function ubicar(" in html and "function reubicarTodo(" in html
    for estado in ("'exacto'", "'reubicado'", "'perdido'"):
        assert estado in html
    assert "libro: E.LIBRO ? E.LIBRO.generado : null" in html, (
        "cada anotación registra con qué versión del libro se hizo"
    )


def test_migra_las_anotaciones_de_claves_anteriores(web_index: Path):
    html = _codigo(web_index)
    assert "LIBRO.claves_anteriores" in html and "localStorage.removeItem(k)" in html
    assert "if (guardadas) anteriores.forEach" in html, "la clave vieja sólo se retira si la copia nueva quedó guardada"
    assert "return localStorage.getItem(k) === v" in html, "lsSet confirma la escritura en vez de tragarse el error"


def test_el_panel_conserva_el_editor_activo(web_index: Path):
    html = _codigo(web_index)
    assert "document.activeElement" in html and "setSelectionRange" in html
    assert "if (cambio) { P.pintarTodo(); P.renderPanel(); P.renderCuentas(); }" in html, (
        "el eco de un guardado propio no redibuja"
    )
