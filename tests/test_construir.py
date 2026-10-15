import json
from datetime import date
from pathlib import Path

import pytest

from lector_anotaciones import construir as mod
from lector_anotaciones.cli import main
from lector_anotaciones.construir import construir, escribir, resumen, validar
from lector_anotaciones.util import norm


def test_construir_sin_pdf(ejemplo_fuentes: Path):
    libro = construir([ejemplo_fuentes], titulo="Libro de ejemplo", autor="Alguien")
    assert libro["formato"] == 2
    assert libro["id"] == "libro-de-ejemplo"
    assert libro["generado"] == date.today().isoformat()
    assert libro["paginas_fisicas"] is None and libro["desfase_paginas"] == 0
    assert libro["fuentes"] == sorted(p.name for p in ejemplo_fuentes.glob("*.md"))
    assert libro["inicio"] == next(s["id"] for s in libro["secciones"] if s["nivel"] == 2)
    assert libro["claves_anteriores"] == []
    assert construir([ejemplo_fuentes], claves_anteriores=["lector-viejo"])["claves_anteriores"] == ["lector-viejo"]
    assert validar(libro) == []
    assert all("texto" not in b for s in libro["secciones"] for b in s["bloques"])
    assert all(b["pagina"] is None for s in libro["secciones"] for b in s["bloques"])


def test_titulo_por_defecto_es_la_primera_seccion(tmp_path: Path):
    (tmp_path / "a.md").write_text("# Mi libro\n\nTexto.\n", encoding="utf-8")
    libro = construir([tmp_path])
    assert libro["titulo"] == "Mi libro" and libro["id"] == "mi-libro"
    assert libro["inicio"] == "mi-libro", "sin secciones de nivel 2, se abre en la primera"


def test_construir_con_pdf_simulado(monkeypatch, tmp_path: Path):
    fuente = tmp_path / "libro.md"
    fuente.write_text(
        "# Prefacio\n\nUn prefacio con una frase suficientemente larga para ubicarla.\n\n"
        "## Capítulo 1. Uno\n\nPrimer párrafo del capítulo, también suficientemente largo.\n",
        encoding="utf-8",
    )
    textos = [
        "portada",
        norm("ENCABEZADO Prefacio Un prefacio con una frase suficientemente larga"),
        norm("ENCABEZADO Capítulo 1 Primer párrafo del capítulo, también suficientemente largo"),
    ]
    monkeypatch.setattr(mod, "texto_paginas_pdf", lambda pdf: textos)
    avisos: list[str] = []
    libro = construir([fuente], pdf=Path("x.pdf"), marca_pagina_1="Encabezado prefacio", avisos=avisos)
    assert avisos == []
    assert libro["paginas_fisicas"] == 3 and libro["desfase_paginas"] == 1
    assert libro["secciones"][0]["bloques"][0]["pagina"] == 1
    assert libro["secciones"][1]["bloques"][0]["pagina"] == 2
    assert validar(libro) == []

    avisos = []
    libro = construir([fuente], pdf=Path("x.pdf"), marca_pagina_1="no aparece", avisos=avisos)
    assert avisos and "desfase 0" in avisos[0]
    assert libro["desfase_paginas"] == 0
    assert libro["secciones"][0]["bloques"][0]["pagina"] == 2


def test_validar_detecta_problemas(ejemplo_fuentes: Path):
    libro = construir([ejemplo_fuentes])
    secs = libro["secciones"]
    secs[1]["id"] = secs[0]["id"]
    secs[2]["bloques"][0]["id"] = "otro-b9"
    secs[2]["bloques"][0]["pagina"] = 5
    secs[2]["bloques"][1]["pagina"] = 3
    del secs[2]["bloques"][1]["src"]
    problemas = validar(libro)
    assert any("sección repetido" in p for p in problemas)
    assert any("fuera de patrón" in p for p in problemas)
    assert any("retrocede" in p for p in problemas)
    assert any("sin «src»" in p for p in problemas)
    assert validar({"secciones": []}) == ["el libro no tiene secciones"]


def test_escribir_y_resumen(ejemplo_fuentes: Path, tmp_path: Path):
    libro = construir([ejemplo_fuentes])
    salida = tmp_path / "salida" / "libro.json"
    assert escribir(libro, salida) > 0, "crea el directorio de salida si no existe"
    leido = json.loads(salida.read_text(encoding="utf-8"))
    assert leido["titulo"] == libro["titulo"]
    assert "secciones" in resumen(libro) and "sin página" in resumen(libro)


def test_cli_construir(ejemplo_fuentes: Path, tmp_path: Path, capsys):
    salida = tmp_path / "libro.json"
    codigo = main(
        [
            "construir",
            str(ejemplo_fuentes),
            "--salida",
            str(salida),
            "--titulo",
            "Ejemplo",
            "--estricto",
            "--claves-anteriores",
            "a",
            "b",
        ]
    )
    assert codigo == 0
    assert salida.exists()
    assert json.loads(salida.read_text(encoding="utf-8"))["claves_anteriores"] == ["a", "b"]
    assert capsys.readouterr().out.startswith(f"ok {salida}:")


def test_cli_construir_fuente_inexistente(tmp_path: Path, capsys):
    assert main(["construir", str(tmp_path / "nada.md"), "--salida", str(tmp_path / "x.json")]) == 2
    assert "error:" in capsys.readouterr().err


def test_cli_construir_estricto_falla_con_problemas(monkeypatch, ejemplo_fuentes: Path, tmp_path: Path):
    monkeypatch.setattr("lector_anotaciones.cli.validar", lambda libro: ["problema simulado"])
    salida = tmp_path / "libro.json"
    assert main(["construir", str(ejemplo_fuentes), "--salida", str(salida), "--estricto"]) == 1
    assert main(["construir", str(ejemplo_fuentes), "--salida", str(salida)]) == 0


def test_cli_version(capsys):
    with pytest.raises(SystemExit) as e:
        main(["--version"])
    assert e.value.code == 0
    assert capsys.readouterr().out.startswith("lector-anotaciones ")


def test_huella_y_texto_render(ejemplo_fuentes: Path):
    from lector_anotaciones.construir import huella, texto_render

    libro = construir([ejemplo_fuentes])
    bloques = {b["id"]: b for s in libro["secciones"] for b in s["bloques"]}
    assert all(len(b["h"]) == 12 for b in bloques.values())
    p = next(b for b in bloques.values() if b["t"] == "p")
    assert "<" not in texto_render(p) and "&amp;" not in texto_render(p)
    assert p["h"] == huella(texto_render(p))
    lista = next(b for b in bloques.values() if b["t"] == "ul")
    assert texto_render(lista) == "".join(texto_render({"html": x}) for x in lista["html"])
    tabla = next(b for b in bloques.values() if b["t"] == "table")
    assert texto_render(tabla).startswith("Capa")
    fig = next(b for b in bloques.values() if b["t"] == "figure")
    assert texto_render(fig).startswith("Figura 1.")
    assert libro["formato"] == 2 and libro["cambios"] == 0 and libro["anterior_generado"] is None


def test_anterior_marca_los_bloques_cambiados(tmp_path: Path):
    fuente = tmp_path / "a.md"
    fuente.write_text("# Uno\n\nPrimer párrafo original.\n\nSegundo párrafo que no cambia.\n", encoding="utf-8")
    v1 = construir([fuente])
    fuente.write_text("# Uno\n\nPrimer párrafo corregido.\n\nSegundo párrafo que no cambia.\n", encoding="utf-8")
    v2 = construir([fuente], anterior=v1)
    b1, b2 = v2["secciones"][0]["bloques"]
    assert b1["anterior"] == "Primer párrafo original." and "anterior" not in b2
    assert v2["cambios"] == 1 and v2["anterior_generado"] == v1["generado"]
    assert validar(v2) == []


def test_capas_en_el_libro_y_opcion_para_apagarlas(tmp_path: Path):
    from lector_anotaciones.capas import ConfigCapas

    fuente = tmp_path / "a.md"
    fuente.write_text("# Uno\n\nPor eso lo digo, exactamente.\n", encoding="utf-8")
    con = construir([fuente], capas=ConfigCapas())
    sin = construir([fuente], capas=None)
    assert con["secciones"][0]["bloques"][0]["m"]["mu"] and con["capas"]["mu"] == "muletillas"
    assert "m" not in sin["secciones"][0]["bloques"][0] and sin["capas"] == {}


def test_cli_anterior_por_defecto_es_la_salida_previa(tmp_path: Path, capsys):
    fuente = tmp_path / "a.md"
    salida = tmp_path / "libro.json"
    fuente.write_text("# Uno\n\nTexto primero.\n", encoding="utf-8")
    assert main(["construir", str(fuente), "--salida", str(salida)]) == 0
    fuente.write_text("# Uno\n\nTexto segundo.\n", encoding="utf-8")
    assert main(["construir", str(fuente), "--salida", str(salida)]) == 0
    libro = json.loads(salida.read_text(encoding="utf-8"))
    assert libro["cambios"] == 1 and libro["secciones"][0]["bloques"][0]["anterior"] == "Texto primero."
    assert "1 bloques cambiados" in capsys.readouterr().out
    terminos = tmp_path / "retirados.txt"
    terminos.write_text("# comentario\nTexto segundo\n", encoding="utf-8")
    assert (
        main(
            ["construir", str(fuente), "--salida", str(salida), "--sin-anterior", "--terminos-retirados", str(terminos)]
        )
        == 0
    )
    libro = json.loads(salida.read_text(encoding="utf-8"))
    assert libro["cambios"] == 0 and libro["secciones"][0]["bloques"][0]["m"]["tr"] == [[0, 13]]
    assert main(["construir", str(fuente), "--salida", str(salida), "--sin-capas"]) == 0
    assert "m" not in json.loads(salida.read_text(encoding="utf-8"))["secciones"][0]["bloques"][0]
