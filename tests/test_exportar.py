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
