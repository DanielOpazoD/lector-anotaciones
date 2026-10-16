"""`aplicar`: las propuestas de texto de los subrayados, escritas en las fuentes Markdown."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from lector_anotaciones.aplicar import aplicables, aplicar, diferencias, respuestas
from lector_anotaciones.cli import main

FUENTE = """# Capítulo 1

Un hecho es lo que se observó, no lo que se concluyó
de la observación. La diferencia parece obvia.

Otra vez la frase repetida. Y al final, la frase repetida.

Un párrafo con *énfasis entero* y con **mitad de** algo.

Y *uno dos* tres *cuatro cinco*.

- Dar por hecho lo que alguien contó.
"""


def anot(i: str, cita: str, sugerencia: str, linea: int, **extra) -> dict:
    base = {"id": i, "tipo": "subrayado", "pid": "c-b1", "inicio": 0, "fin": len(cita), "cita": cita}
    return {**base, "sugerencia": sugerencia, "src": f"01_a.md:{linea}", "estado": "abierta", **extra}


@pytest.fixture
def fuentes(tmp_path: Path) -> Path:
    d = tmp_path / "fuentes"
    d.mkdir()
    (d / "01_a.md").write_text(FUENTE, encoding="utf-8")
    return d


def _estados(resultados) -> dict[str, str]:
    return {r.id: r.estado for r in resultados}


def test_aplica_con_saltos_de_linea_suaves_y_de_abajo_hacia_arriba(fuentes: Path):
    anots = [
        anot("salto", "lo que se concluyó de la observación", "lo que se dedujo", 3),
        anot("lista", "lo que alguien contó", "lo que contó un testigo", 12),
    ]
    res, archivos = aplicar(anots, fuentes)
    assert _estados(res) == {"salto": "aplicada", "lista": "aplicada"}
    nuevo = archivos[fuentes / "01_a.md"].texto
    assert "no lo que se dedujo. La diferencia" in nuevo
    assert "- Dar por hecho lo que contó un testigo.\n" in nuevo
    assert (fuentes / "01_a.md").read_text(encoding="utf-8") == FUENTE, "aplicar no escribe: eso lo decide quien llama"


def test_el_enfasis_que_envuelve_la_cita_se_conserva_y_el_cortado_no_se_toca(fuentes: Path):
    anots = [
        anot("entero", "énfasis entero", "énfasis nuevo", 8),
        anot("mitad", "de algo", "de otra cosa", 8),
        anot("todo", "mitad de algo", "la mitad", 8),
        anot("interior", "dos", "y dos", 10),
        anot("cruza", "dos tres cuatro", "siete", 10),
        anot("abre", "tres cuatro", "seis", 10),
    ]
    res, archivos = aplicar(anots, fuentes)
    estados = _estados(res)
    assert estados["entero"] == "aplicada"
    assert estados["mitad"] == "énfasis cortado", "la cita empieza dentro de la negrita"
    assert estados["todo"] == "aplicada"
    assert estados["interior"] == "aplicada", "dentro del énfasis y sin marcas: se cambia ahí dentro"
    assert estados["cruza"] == "énfasis cortado", "sale de un énfasis y entra en otro"
    assert estados["abre"] == "énfasis cortado", "deja abierto un énfasis que sigue después"
    texto = archivos[fuentes / "01_a.md"].texto
    assert "con *énfasis nuevo* y con la mitad.\n" in texto
    assert "Y *uno y dos* tres *cuatro cinco*.\n" in texto
    assert next(r for r in res if r.id == "todo").detalle == "el pasaje tenía énfasis; la propuesta va sin él"


def test_el_contexto_decide_entre_dos_coincidencias(fuentes: Path):
    con = anot("segunda", "la frase repetida", "la misma frase", 6, antes="Y al final, ", despues=".")
    sin = anot("ambigua", "la frase repetida", "otra", 6)
    res, archivos = aplicar([con], fuentes)
    assert _estados(res) == {"segunda": "aplicada"}
    assert "Otra vez la frase repetida. Y al final, la misma frase." in archivos[fuentes / "01_a.md"].texto
    res, archivos = aplicar([sin], fuentes)
    assert _estados(res) == {"ambigua": "ambigua"} and not archivos


def test_reubicada_si_la_linea_ya_no_es_la_suya_y_lo_que_no_se_puede(fuentes: Path):
    anots = [
        anot("movida", "La diferencia parece obvia", "La diferencia no es obvia", 6),
        anot("perdida", "esto no está", "nada", 3),
        anot("lejos", "algo", "nada", 3, src="99_otro.md:1"),
        anot("libro-importado", "algo", "nada", 3, src="cap-uno:4"),
        anot("sin-src", "algo", "nada", 3, src=None),
    ]
    res, _ = aplicar(anots, fuentes)
    assert _estados(res) == {
        "movida": "reubicada",
        "perdida": "no encontrada",
        "lejos": "sin archivo",
        "libro-importado": "sin archivo",
        "sin-src": "sin origen",
    }
    movida = next(r for r in res if r.id == "movida")
    assert movida.linea == 4 and movida.detalle == "no estaba en la línea 6"


def test_solo_lo_que_espera_a_quien_edita_y_propone_algo():
    base = anot("x", "abc", "abd", 1)
    assert [a["id"] for a in aplicables([base])] == ["x"]
    assert aplicables([{**base, "sugerencia": "abc"}]) == [], "igual a la cita no propone nada"
    assert aplicables([{**base, "respuesta": "Hecho.", "cierre": "atendida"}]) == [], "ya respondida"
    reabierta = {**base, "respuesta": "No.", "cierre": "descartada", "revisado": "r", "respondido": "r"}
    assert [a["id"] for a in aplicables([reabierta])] == ["x"], "reabierta por el autor: vuelve a aplicarse"
    assert aplicables([{**base, "estado": "resuelta"}]) == []


def test_diferencias_y_respuestas(fuentes: Path):
    res, archivos = aplicar([anot("salto", "lo que se concluyó de la observación", "lo que se dedujo", 3)], fuentes)
    dif = diferencias(archivos, fuentes)
    assert dif.startswith("--- a/01_a.md\n+++ b/01_a.md\n")
    assert "-Un hecho es lo que se observó, no lo que se concluyó\n-de la observación." in dif
    assert respuestas(res) == [
        {"id": "salto", "respuesta": "Aplicada la propuesta: «lo que se dedujo».", "cierre": "atendida"}
    ]


def test_cli_aplicar_y_responder_con_commit(fuentes: Path, tmp_path: Path, capsys):
    anots = tmp_path / "anots.json"
    anots.write_text(json.dumps([anot("salto", "lo que se concluyó de la observación", "lo que se dedujo", 3)]))
    assert main(["aplicar", str(anots), "--fuentes", str(fuentes)]) == 0
    salida = capsys.readouterr()
    assert salida.out.startswith("--- a/01_a.md") and "aplicada: salto · 01_a.md:3" in salida.err
    assert (fuentes / "01_a.md").read_text(encoding="utf-8") == FUENTE, "sin --escribir no cambia nada"
    resp = tmp_path / "resp.json"
    assert main(["aplicar", str(anots), "--fuentes", str(fuentes), "--escribir", "--respuestas", str(resp)]) == 0
    assert "lo que se dedujo" in (fuentes / "01_a.md").read_text(encoding="utf-8")
    capsys.readouterr()
    vers = tmp_path / "v.json"
    vers.write_text('{"salto": 3}')
    assert main(["responder", str(anots), str(resp), "--versiones", str(vers), "--commit", "abc1234"]) == 0
    lote = json.loads(capsys.readouterr().out)
    assert lote[0]["data"]["commit"] == "abc1234" and lote[0]["data"]["cierre"] == "atendida"
