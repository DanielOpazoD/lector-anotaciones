"""`pendientes` y `responder`: qué espera a quien edita y las escrituras que dejan las respuestas en la base."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from lector_anotaciones.cli import main
from lector_anotaciones.responder import (
    BORRAR,
    a_texto,
    aplicar_update,
    cargar_coleccion,
    datos_respuesta,
    en_lotes,
    escrituras,
    leer_versiones,
    motivo,
    pendientes,
)

T_RESP = "2026-10-15T09:00:00.000Z"
AHORA = datetime(2026, 10, 16, 12, 30, 5, 123000, tzinfo=UTC)
MARCA = "2026-10-16T12:30:05.123Z"


def anot(i: str, **extra) -> dict:
    base = {"id": i, "tipo": "subrayado", "pid": "c-b1", "inicio": 0, "fin": 3, "cita": "abc", "color": "revisar"}
    return {**base, "estado": "abierta", "creado": "2026-10-14T10:00:00.000Z", **extra}


NUEVA = anot("nueva", src="02_b.md:7")
TEMPRANA = anot("temprana", src="01_a.md:30")
GENERAL = {"id": "gen", "tipo": "general", "nota": "Título.", "estado": "abierta", "creado": "2026-10-14T09:00:00Z"}
REABIERTA = anot(
    "reab",
    src="01_a.md:12",
    respuesta="Reescrito.",
    cierre="atendida",
    commit="abc1234",
    respondido=T_RESP,
    revisado=T_RESP,
    nota="Sigue sobrando la segunda frase.",
)
CON_REPLICA = anot(
    "repl", src="02_b.md:3", respuesta="¿Corto también la nota al pie?", cierre="pregunta", respondido=T_RESP
)
CON_REPLICA["replica"] = "Sí, también."
PREGUNTA_SIN_REPLICA = anot("preg", respuesta="¿Lo cambio?", cierre="pregunta", respondido=T_RESP, replica="")
POR_REVISAR = anot("porrev", respuesta="Hecho.", cierre="atendida", respondido=T_RESP, estado="resuelta")
RESPONDIDA_ABIERTA = anot("resp", respuesta="Hecho.", cierre="atendida", respondido=T_RESP)
RESUELTA_SOLA = anot("sola", estado="resuelta")
TODAS = [NUEVA, TEMPRANA, GENERAL, REABIERTA, CON_REPLICA, PREGUNTA_SIN_REPLICA, POR_REVISAR, RESPONDIDA_ABIERTA]
TODAS.append(RESUELTA_SOLA)


def test_motivo_separa_lo_que_espera_a_quien_edita_de_lo_que_espera_al_autor():
    assert motivo(NUEVA) == "nueva"
    assert motivo(GENERAL) == "nueva"
    assert motivo(REABIERTA) == "reabierta"
    assert motivo(CON_REPLICA) == "replica"
    assert motivo(PREGUNTA_SIN_REPLICA) is None, "la pregunta espera al autor"
    assert motivo(POR_REVISAR) is None, "resuelta y respondida: espera que el autor la revise"
    assert motivo(RESPONDIDA_ABIERTA) is None, "respondida y sin revisar: el autor todavía no la vio"
    assert motivo(RESUELTA_SOLA) is None, "el autor la resolvió sin respuesta"
    assert motivo({**CON_REPLICA, "replica": "   "}) is None, "una réplica en blanco no es réplica"


def test_pendientes_en_el_orden_de_aplicarlas():
    ids = [a["id"] for _, a in pendientes(TODAS)]
    assert ids == ["reab", "temprana", "repl", "nueva", "gen"], "por archivo y línea; lo que no tiene origen, al final"


def test_a_texto_cuenta_por_motivo_y_lleva_la_conversacion():
    md = a_texto(pendientes(TODAS))
    assert md.startswith(
        "# Pendientes · 5 (3 sin respuesta, 1 reabierta por el autor, 1 el autor contestó la pregunta)\n"
    )
    assert "- `reab` · reabierta por el autor\n  - [ ] **revisar**" in md
    assert "    - Respuesta (atendida, abc1234): Reescrito." in md
    assert "    - Réplica: Sí, también." in md
    assert a_texto([]) == "# Pendientes · 0\n\n"


def test_cargar_coleccion_de_un_json_o_de_un_directorio_de_documentos(tmp_path: Path):
    ruta = tmp_path / "todo.json"
    ruta.write_text(json.dumps({"formato": 2, "anotaciones": TODAS}), encoding="utf-8")
    assert cargar_coleccion(ruta) == TODAS
    # como lo deja una lectura de ArtifactData con out_dir: <dir>/anotaciones/<id>.json, sin `id` dentro si se quiere
    carpeta = tmp_path / "db" / "anotaciones"
    carpeta.mkdir(parents=True)
    for a in TODAS[:3]:
        (carpeta / f"{a['id']}.json").write_text(json.dumps({k: v for k, v in a.items() if k != "id"}), "utf-8")
    assert sorted(a["id"] for a in cargar_coleccion(tmp_path / "db")) == ["gen", "nueva", "temprana"]
    (tmp_path / "vacio").mkdir()
    with pytest.raises(ValueError, match="no tiene documentos"):
        cargar_coleccion(tmp_path / "vacio")


def test_leer_versiones_del_texto_de_la_lectura_o_de_un_json(tmp_path: Path):
    texto = tmp_path / "lectura.txt"
    texto.write_text(
        '2 documents from collection "anotaciones" saved as JSON files under "/x/anotaciones":\n'
        '- "amv8ws796u99k4"  2772 bytes  version 20  "/x/anotaciones/amv8ws796u99k4.json"\n'
        '- "b-2_x"  80 bytes  version 3  "/x/anotaciones/b-2_x.json"\n',
        encoding="utf-8",
    )
    assert leer_versiones(texto) == {"amv8ws796u99k4": 20, "b-2_x": 3}
    js = tmp_path / "v.json"
    js.write_text('{"a": 4}', encoding="utf-8")
    assert leer_versiones(js) == {"a": 4}
    js.write_text('{"a": "4"}', encoding="utf-8")
    with pytest.raises(ValueError):
        leer_versiones(js)


def test_primera_respuesta_sin_hilo():
    d = datos_respuesta(NUEVA, {"id": "nueva", "respuesta": " Cortado. ", "cierre": "atendida", "commit": "f00"}, MARCA)
    assert d == {
        "respuesta": "Cortado.",
        "cierre": "atendida",
        "respondido": MARCA,
        "estado": "resuelta",
        "commit": "f00",
    }


def test_responder_una_reabierta_pasa_lo_vigente_al_hilo_y_quita_el_commit_viejo():
    d = datos_respuesta(REABIERTA, {"id": "reab", "respuesta": "No lo cambio.", "cierre": "descartada"}, MARCA)
    assert d["hilo"] == [
        {"de": "editor", "texto": "Reescrito.", "cierre": "atendida", "commit": "abc1234", "cuando": T_RESP}
    ]
    assert d["commit"] == BORRAR, "el commit era de la respuesta anterior"
    assert d["estado"] == "resuelta" and d["respondido"] == MARCA
    assert "nota" not in d and "revisado" not in d, "los campos del autor no se tocan"


def test_responder_una_replica_la_pasa_al_hilo_y_la_retira():
    previo = {**CON_REPLICA, "hilo": [{"de": "editor", "texto": "Primera."}]}
    d = datos_respuesta(previo, {"id": "repl", "respuesta": "¿Y el título?", "cierre": "pregunta"}, MARCA)
    assert d["hilo"] == [
        {"de": "editor", "texto": "Primera."},
        {"de": "editor", "texto": "¿Corto también la nota al pie?", "cierre": "pregunta", "cuando": T_RESP},
        {"de": "autor", "texto": "Sí, también."},
    ]
    assert d["replica"] == BORRAR
    assert d["estado"] == "abierta", "otra pregunta deja la anotación abierta"
    assert "commit" not in d


def test_el_documento_resultante_cumple_el_esquema():
    jsonschema = pytest.importorskip("jsonschema")
    from referencing import Registry, Resource

    raiz = Path(__file__).resolve().parent.parent / "src" / "lector_anotaciones" / "esquemas"
    esquema = json.loads((raiz / "anotacion.schema.json").read_text(encoding="utf-8"))
    validador = jsonschema.Draft202012Validator(
        esquema, registry=Registry().with_resources([(esquema["$id"], Resource.from_contents(esquema))])
    )
    for a, r in [
        (REABIERTA, {"respuesta": "No.", "cierre": "descartada"}),
        (CON_REPLICA, {"respuesta": "Hecho.", "cierre": "atendida", "commit": "e1"}),
        (NUEVA, {"respuesta": "¿Seguro?", "cierre": "pregunta"}),
    ]:
        doc = aplicar_update(a, datos_respuesta(a, {"id": a["id"], **r}, MARCA))
        assert [e.message for e in validador.iter_errors(doc)] == [], a["id"]
        assert "replica" not in doc


def test_escrituras_una_por_respuesta_fijada_a_su_version():
    avisos: list[str] = []
    resp = [
        {"id": "reab", "respuesta": "Cortado.", "cierre": "atendida", "commit": "c1"},
        {"id": "porrev", "respuesta": "Otra vez.", "cierre": "atendida"},
    ]
    es = escrituras(TODAS, resp, {"reab": 7, "porrev": 2}, coleccion="libros/x/anotaciones", ahora=AHORA, avisos=avisos)
    assert [(e["op"], e["collection"], e["doc_id"], e["if_version"]) for e in es] == [
        ("update", "libros/x/anotaciones", "reab", 7),
        ("update", "libros/x/anotaciones", "porrev", 2),
    ]
    assert es[0]["data"]["respondido"] == MARCA
    assert avisos == ["porrev: no estaba pendiente (estado resuelta, cierre atendida)"]


@pytest.mark.parametrize(
    ("respuesta", "versiones", "error"),
    [
        ({"id": "otra", "respuesta": "x", "cierre": "atendida"}, {"otra": 1}, "no está en la colección"),
        ({"id": "nueva", "respuesta": "x", "cierre": "hecha"}, {"nueva": 1}, "cierre 'hecha'"),
        ({"id": "nueva", "respuesta": "  ", "cierre": "atendida"}, {"nueva": 1}, "sin respuesta"),
        ({"id": "nueva", "respuesta": "x", "cierre": "atendida", "commit": 3}, {"nueva": 1}, "commit debe ser texto"),
        ({"id": "nueva", "respuesta": "x", "cierre": "atendida"}, {}, "falta su versión"),
    ],
)
def test_escrituras_rechaza_respuestas_invalidas(respuesta, versiones, error):
    with pytest.raises(ValueError, match=error):
        escrituras(TODAS, [respuesta], versiones, ahora=AHORA)


def test_escrituras_rechaza_responder_dos_veces_lo_mismo():
    r = {"id": "nueva", "respuesta": "x", "cierre": "atendida"}
    with pytest.raises(ValueError, match="nueva: respondida dos veces"):
        escrituras(TODAS, [r, r], {"nueva": 1}, ahora=AHORA)


def test_en_lotes_respeta_cincuenta_escrituras_y_el_tamano():
    pequenas = [{"doc_id": str(i), "data": {}} for i in range(120)]
    assert [len(lote) for lote in en_lotes(pequenas)] == [50, 50, 20]
    grandes = [{"doc_id": str(i), "data": {"respuesta": "x" * 400_000}} for i in range(5)]
    assert [len(lote) for lote in en_lotes(grandes)] == [2, 2, 1]
    assert en_lotes([]) == []


def test_cli_pendientes(tmp_path: Path, capsys):
    ruta = tmp_path / "todo.json"
    ruta.write_text(json.dumps(TODAS), encoding="utf-8")
    assert main(["pendientes", str(ruta)]) == 0
    assert capsys.readouterr().out.startswith("# Pendientes · 5 ")
    assert main(["pendientes", str(ruta), "--json"]) == 0
    lista = json.loads(capsys.readouterr().out)
    assert [(x["motivo"], x["anotacion"]["id"]) for x in lista][:2] == [("reabierta", "reab"), ("nueva", "temprana")]


def test_cli_responder(tmp_path: Path, capsys):
    ruta = tmp_path / "todo.json"
    ruta.write_text(json.dumps(TODAS), encoding="utf-8")
    resp = tmp_path / "resp.json"
    resp.write_text(json.dumps({"nueva": {"respuesta": "Hecho.", "cierre": "atendida"}}), encoding="utf-8")
    vers = tmp_path / "v.txt"
    vers.write_text('- "nueva"  10 bytes  version 5  "/x/nueva.json"\n', encoding="utf-8")
    assert main(["responder", str(ruta), str(resp), "--versiones", str(vers)]) == 0
    lote = json.loads(capsys.readouterr().out)
    assert [(e["doc_id"], e["if_version"], e["data"]["estado"]) for e in lote] == [("nueva", 5, "resuelta")]
    vers.write_text("{}", encoding="utf-8")
    assert main(["responder", str(ruta), str(resp), "--versiones", str(vers)]) == 2
    assert "falta su versión" in capsys.readouterr().err


def test_cli_responder_en_varios_lotes(tmp_path: Path, capsys):
    anots = [anot(f"a{i}") for i in range(60)]
    ruta = tmp_path / "todo.json"
    ruta.write_text(json.dumps(anots), encoding="utf-8")
    resp = tmp_path / "resp.json"
    resp.write_text(json.dumps([{"id": a["id"], "respuesta": "Hecho.", "cierre": "atendida"} for a in anots]), "utf-8")
    vers = tmp_path / "v.json"
    vers.write_text(json.dumps({a["id"]: 1 for a in anots}), encoding="utf-8")
    assert main(["responder", str(ruta), str(resp), "--versiones", str(vers)]) == 2, "dos lotes no van a la pantalla"
    salida = tmp_path / "lote.json"
    assert main(["responder", str(ruta), str(resp), "--versiones", str(vers), "--salida", str(salida)]) == 0
    assert [len(json.loads((tmp_path / f"lote-{i}.json").read_text("utf-8"))) for i in (1, 2)] == [50, 10]
    assert "lote 2 de 2" in capsys.readouterr().out


def test_leer_versiones_sólo_las_líneas_de_la_lectura(tmp_path: Path):
    texto = tmp_path / "lectura.txt"
    texto.write_text(
        '3 documents from collection "anotaciones" saved as JSON files under "/x":\n'
        '- "a.b"  2,772 bytes  version 20  "/x/a.b.json"\n'
        '- "c"  2.7 KB  version 3  "/x/c.json"\n'
        "- abc: version 9\n",
        encoding="utf-8",
    )
    assert leer_versiones(texto) == {"a.b": 20, "c": 3}, "sin claves basura; la id con punto, entera"
    texto.write_text('- "a"  1 bytes  version 2  "/x"\n- "a"  1 bytes  version 3  "/x"\n', encoding="utf-8")
    with pytest.raises(ValueError, match="dos versiones"):
        leer_versiones(texto)
    js = tmp_path / "v.json"
    js.write_text('{"a": true}', encoding="utf-8")
    with pytest.raises(ValueError):
        leer_versiones(js)


def test_una_escritura_que_no_cabe_en_un_lote_es_un_error():
    with pytest.raises(ValueError, match="más de lo que cabe"):
        en_lotes([{"doc_id": "x", "data": {"respuesta": "ñ" * 200_000}}])


def test_responder_no_acepta_lo_que_copia_la_pagina(tmp_path: Path):
    ruta = tmp_path / "copia.json"
    ruta.write_text(json.dumps({"formato": 2, "anotaciones": TODAS}), encoding="utf-8")
    assert cargar_coleccion(ruta) == TODAS, "para leer, sí"
    with pytest.raises(ValueError, match="lo que copia la página"):
        cargar_coleccion(ruta, de_la_base=True)


def test_en_un_directorio_la_id_es_el_nombre_del_archivo(tmp_path: Path):
    carpeta = tmp_path / "db" / "anotaciones"
    carpeta.mkdir(parents=True)
    (carpeta / "doc1.json").write_text(json.dumps({**NUEVA, "id": "otra"}), encoding="utf-8")
    assert [a["id"] for a in cargar_coleccion(tmp_path / "db")] == ["doc1"]
