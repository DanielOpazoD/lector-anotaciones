import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from lector_anotaciones.cli import main
from lector_anotaciones.exportar import a_markdown, cargar, normalizar, orden_de_secciones

SUBRAYADO = {
    "id": "a1",
    "tipo": "subrayado",
    "sid": "cap-01",
    "sidTitulo": "Capítulo 1. Uno",
    "pid": "cap-01-b2",
    "src": "01_cuerpo.md:12",
    "pagina": 4,
    "inicio": 10,
    "fin": 30,
    "cita": "una frase que sobra",
    "color": "cortar",
    "nota": "Repite lo del párrafo anterior.\nQuitar.",
    "estado": "abierta",
    "creado": "2026-10-15T10:00:00Z",
}
NOTA_PAGINA = {
    "id": "a2",
    "tipo": "pagina",
    "sid": "cap-01",
    "sidTitulo": "Capítulo 1. Uno",
    "pagina": 3,
    "nota": "Demasiado denso.",
    "estado": "resuelta",
    "creado": "2026-10-15T10:01:00Z",
}
NOTA_SECCION = {
    "id": "a3",
    "tipo": "capitulo",
    "sid": "prefacio",
    "sidTitulo": "Prefacio",
    "nota": "Mover el caso al inicio.",
    "estado": "abierta",
    "creado": "2026-10-15T10:02:00Z",
}
GENERAL = {
    "id": "a4",
    "tipo": "general",
    "nota": "Revisar el título.",
    "estado": "abierta",
    "creado": "2026-10-15T10:03:00Z",
}
TODAS = [SUBRAYADO, NOTA_PAGINA, NOTA_SECCION, GENERAL]
AHORA = datetime(2026, 10, 15, 12, 0, tzinfo=UTC)


def test_normalizar_acepta_las_tres_formas():
    assert normalizar(TODAS) == TODAS
    assert normalizar({"libro": "X", "anotaciones": TODAS}) == TODAS
    por_id = normalizar({a["id"]: {k: v for k, v in a.items() if k != "id"} for a in TODAS})
    assert sorted(a["id"] for a in por_id) == ["a1", "a2", "a3", "a4"]
    with pytest.raises(ValueError):
        normalizar("texto")
    with pytest.raises(ValueError):
        normalizar([{"nota": "sin id"}])


def test_cargar(tmp_path: Path):
    ruta = tmp_path / "anotaciones.json"
    ruta.write_text(json.dumps({"anotaciones": TODAS}), encoding="utf-8")
    assert cargar(ruta) == TODAS


def test_a_markdown_por_seccion():
    md = a_markdown(TODAS, titulo="Libro X", ahora=AHORA)
    assert md.startswith("# Anotaciones · Libro X\n\n4 anotaciones (3 abiertas). Exportado el 2026-10-15 12:00 UTC.\n")
    assert md.index("## Capítulo 1. Uno") < md.index("## Prefacio") < md.index("## General")
    assert "- [x] **nota de página** · p. 3: Demasiado denso." in md
    assert (
        "- [ ] **cortar** · p. 4 · `01_cuerpo.md:12` · «una frase que sobra»\n  - Nota: Repite lo del párrafo anterior. Quitar."
        in md
    )
    assert "- [ ] **nota de sección**: Mover el caso al inicio." in md
    assert "- [ ] **nota general**: Revisar el título." in md
    assert md.index("p. 3") < md.index("p. 4"), "dentro de la sección, por página"


def test_a_markdown_incluye_respuesta_cierre_replica_y_lector():
    con = dict(
        SUBRAYADO,
        id="a7",
        autor="u_abc",
        respuesta="Quitado.",
        cierre="atendida",
        commit="abc1234",
        replica="De acuerdo.",
        estado="resuelta",
    )
    md = a_markdown([con, dict(GENERAL, id="a8", cierre="pregunta", respuesta="¿Dónde?")], ahora=AHORA)
    assert "· lector u_abc" in md
    assert "  - Respuesta (atendida, abc1234): Quitado." in md
    assert "  - Réplica: De acuerdo." in md
    assert "- [ ] **nota general**: Revisar el título.\n  - Respuesta (pregunta): ¿Dónde?" in md


def test_a_markdown_senala_lo_reabierto_desde_por_revisar():
    devuelta = dict(SUBRAYADO, id="a9", respuesta="Hecho.", cierre="atendida", revisado="2026-10-17T08:00:00.000Z")
    md = a_markdown([devuelta], ahora=AHORA)
    assert "  - Respuesta (atendida): Hecho.\n  - Reabierta por el autor tras la respuesta." in md
    revisada = dict(devuelta, estado="resuelta")
    assert "Reabierta" not in a_markdown([revisada], ahora=AHORA), "atendida y revisada no es reabierta"
    pregunta = dict(devuelta, cierre="pregunta")
    assert "Reabierta" not in a_markdown([pregunta], ahora=AHORA), "una pregunta abierta sigue esperando, no se reabrió"


def test_a_markdown_ordena_como_el_libro_si_se_le_da_el_orden():
    orden = orden_de_secciones({"secciones": [{"id": "prefacio"}, {"id": "cap-01"}]})
    md = a_markdown(TODAS, orden_secciones=orden, ahora=AHORA)
    assert md.index("## Prefacio") < md.index("## Capítulo 1. Uno") < md.index("## General")


def test_a_markdown_solo_abiertas_y_por_archivo():
    md = a_markdown(TODAS, solo_abiertas=True, ahora=AHORA)
    assert "3 anotaciones (3 abiertas)" in md and "Demasiado denso" not in md
    md = a_markdown(
        [SUBRAYADO, dict(SUBRAYADO, id="a9", src="01_cuerpo.md:3", cita="antes")], agrupar="archivo", ahora=AHORA
    )
    assert "## 01_cuerpo.md" in md
    assert md.index("«antes»") < md.index("«una frase que sobra»"), "por línea de origen"
    with pytest.raises(ValueError):
        a_markdown(TODAS, agrupar="color")


def test_cli_exportar(tmp_path: Path, capsys):
    ruta = tmp_path / "anotaciones.json"
    ruta.write_text(json.dumps(TODAS), encoding="utf-8")
    assert main(["exportar", str(ruta), "--titulo", "Libro X"]) == 0
    assert capsys.readouterr().out.startswith("# Anotaciones · Libro X")
    libro = tmp_path / "libro.json"
    libro.write_text(json.dumps({"titulo": "Del libro", "secciones": [{"id": "prefacio"}, {"id": "cap-01"}]}))
    assert main(["exportar", str(ruta), "--libro", str(libro)]) == 0
    out = capsys.readouterr().out
    assert out.startswith("# Anotaciones · Del libro") and out.index("## Prefacio") < out.index("## Capítulo 1")
    salida = tmp_path / "anotaciones.md"
    assert main(["exportar", str(ruta), "--salida", str(salida), "--solo-abiertas"]) == 0
    assert salida.read_text(encoding="utf-8").count("- [ ]") == 3
    assert main(["exportar", str(tmp_path / "no.json")]) == 2


def test_orden_por_bloque_y_las_generales_van_a_general():
    primero = dict(SUBRAYADO, id="b1", pid="cap-01-b2", inicio=50, cita="del bloque dos", pagina=None)
    segundo = dict(SUBRAYADO, id="b2", pid="cap-01-b10", inicio=3, cita="del bloque diez", pagina=None)
    general = dict(GENERAL, id="g1", sid="cap-01", sidTitulo="Capítulo 1. Uno", nota="General con sección")
    md = a_markdown([segundo, primero, general], ahora=AHORA)
    assert md.index("«del bloque dos»") < md.index("«del bloque diez»"), "por número de bloque, no por desplazamiento"
    assert "## General\n\n- [ ] **nota general**: General con sección" in md


def test_cargar_tolera_el_bom(tmp_path: Path):
    ruta = tmp_path / "anotaciones.json"
    ruta.write_bytes(b"\xef\xbb\xbf" + json.dumps(TODAS).encode("utf-8"))
    assert cargar(ruta) == TODAS


def test_cli_exportar_con_libro_con_bom(tmp_path: Path, capsys):
    ruta = tmp_path / "anotaciones.json"
    ruta.write_text(json.dumps(TODAS), encoding="utf-8")
    libro = tmp_path / "libro.json"
    libro.write_bytes(b"\xef\xbb\xbf" + json.dumps({"titulo": "Del libro", "secciones": [{"id": "cap-01"}]}).encode())
    assert main(["exportar", str(ruta), "--libro", str(libro)]) == 0
    assert capsys.readouterr().out.startswith("# Anotaciones · Del libro")


def test_orden_dentro_de_la_seccion_es_el_del_libro_no_el_de_la_pagina():
    # páginas nula (hecha sin PDF) y obsoleta (PDF remaquetado) mezcladas con vigentes: manda el bloque, como en la página
    base = dict(SUBRAYADO, inicio=0)
    anots = [
        dict(base, id="x9", pid="cap-01-b9", cita="b9", pagina=None),
        dict(base, id="x2", pid="cap-01-b2", cita="b2", pagina=12),
        dict(base, id="x5", pid="cap-01-b5", cita="b5", pagina=40),
        dict(base, id="x6", pid="cap-01-b6", cita="b6", pagina=13),
        dict(NOTA_PAGINA, id="p2", pagina=14, nota="página catorce"),
        dict(NOTA_PAGINA, id="p1", pagina=11, nota="página once"),
        dict(NOTA_SECCION, id="s1", sid="cap-01", sidTitulo="Capítulo 1. Uno", nota="de la sección"),
    ]
    md = a_markdown(anots, ahora=AHORA)
    citas = [linea.split("«")[1].split("»")[0] for linea in md.split("\n") if "«" in linea]
    assert citas == ["b2", "b5", "b6", "b9"]
    assert md.index("de la sección") < md.index("página once") < md.index("página catorce") < md.index("«b2»"), (
        "las notas sin bloque van antes, y las de página ordenadas por página"
    )


def test_a_markdown_lleva_la_conversacion_anterior_antes_de_la_respuesta_vigente():
    con = dict(
        SUBRAYADO,
        id="h1",
        hilo=[
            {
                "de": "editor",
                "texto": "Quité la cifra.",
                "cierre": "atendida",
                "commit": "abc1234",
                "cuando": "2026-10-03T10:00:00Z",
            },
            {"de": "autor", "texto": "La cifra\nhacía falta.", "cuando": "2026-10-04"},
        ],
        respuesta="La repuse con su fuente.",
        cierre="atendida",
        commit="def5678",
    )
    md = a_markdown([con], ahora=AHORA)
    assert (
        "  - Antes, quien edita (atendida, abc1234, 2026-10-03): Quité la cifra.\n"
        "  - Antes, el autor (2026-10-04): La cifra hacía falta.\n"
        "  - Respuesta (atendida, def5678): La repuse con su fuente."
    ) in md


def test_a_markdown_lleva_la_propuesta_bajo_la_nota():
    con = {**SUBRAYADO, "sugerencia": "una frase\nmejor"}
    md = a_markdown([con, {**SUBRAYADO, "id": "a9", "sugerencia": " una frase que sobra "}], ahora=AHORA)
    assert "  - Nota: Repite lo del párrafo anterior. Quitar.\n  - Propuesta: «una frase mejor»\n" in md
    assert md.count("Propuesta") == 1, "una propuesta igual a la cita no propone nada"
