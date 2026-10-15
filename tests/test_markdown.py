from pathlib import Path

import pytest

from lector_anotaciones.markdown import (
    expandir_fuentes,
    inline,
    parse_fuentes,
    parse_texto,
    seccion_id,
)
from tests.conftest import lineno


def test_seccion_id_reconoce_las_convenciones_del_libro():
    usados: set[str] = set()
    assert seccion_id("Capítulo 7. La frase", usados) == "cap-07"
    assert seccion_id("Interludio II. Carmen", usados) == "interludio-2"
    assert seccion_id("PARTE III. Decidir", usados) == "parte-3"
    assert seccion_id("PARTE IV. Enseñar", usados) == "parte-4"
    assert seccion_id("Apéndice B. Léxico", usados) == "ap-b"
    assert seccion_id("Glosario", usados) == "glosario"
    assert seccion_id("Cómo leer este libro. Una guía", usados) == "como-leer-este-libro"


def test_seccion_id_no_repite_ids():
    usados: set[str] = set()
    assert seccion_id("Capítulo 1. A", usados) == "cap-01"
    assert seccion_id("Capítulo 1. B", usados) == "cap-01-2"
    assert seccion_id("Capítulo 1. C", usados) == "cap-01-3"


@pytest.mark.parametrize(
    ("entrada", "salida"),
    [
        ("**negrita** y *cursiva*", "<strong>negrita</strong> y <em>cursiva</em>"),
        ("2*3*4", "2*3*4"),
        ("a * b", "a * b"),
        ("x < y & z", "x &lt; y &amp; z"),
        ("concepto∗ *propio*", "concepto∗ <em>propio</em>"),
    ],
)
def test_inline(entrada, salida):
    assert inline(entrada) == salida


def test_parse_fixture_secciones_y_bloques(fixture_md: Path):
    secciones = parse_fuentes([fixture_md])
    assert [s["id"] for s in secciones] == [
        "portada",
        "pagina-legal",
        "prefacio",
        "parte-1",
        "cap-01",
        "cap-01-2",
        "interludio-1",
        "ap-a",
    ]
    assert [s["nivel"] for s in secciones] == [1, 1, 1, 1, 2, 2, 2, 2]

    portada = secciones[0]["bloques"]
    assert len(portada) == 1 and portada[0]["t"] == "portada"
    assert portada[0]["html"][0] == "<strong>Un libro de prueba</strong>"
    assert portada[0]["src"] == f"{fixture_md.name}:1"

    legal = secciones[1]["bloques"]
    assert [b["t"] for b in legal] == ["p", "p"]
    assert legal[0]["html"] == "© 2026 Autora Ejemplo"

    prefacio = secciones[2]["bloques"]
    assert len(prefacio) == 1
    b = prefacio[0]
    assert b["id"] == "prefacio-b1"
    assert b["src"] == f"{fixture_md.name}:{lineno(fixture_md, 'Este es el primer')}"
    assert "<em>cursiva</em>" in b["html"] and "<strong>negrita</strong>" in b["html"]
    assert b["texto"].endswith("negrita**. Continúa en la línea siguiente.")

    cap = secciones[4]["bloques"]
    assert [b["t"] for b in cap] == ["h3", "ul", "ol", "table", "quote", "figure", "p"]
    assert [b["id"] for b in cap] == [f"cap-01-b{n}" for n in range(1, 8)]
    assert cap[1]["html"] == ["Primer ítem", "Segundo ítem"]
    assert cap[1]["texto"] == "Primer ítem Segundo ítem"
    assert cap[2]["html"] == ["Uno", "Dos"]
    assert cap[3]["html"] == [["A", "B"], ["1", "2"]], "la fila separadora no es una fila"
    assert cap[4]["html"] == "Una cita en dos líneas."
    assert cap[5]["html"] == {"src": "figs/fig01.png", "caption": "Leyenda de la figura"}
    assert cap[5]["texto"] == "Leyenda de la figura"
    assert cap[6]["html"] == "Párrafo con &lt;etiqueta&gt; &amp; ampersand."
    assert cap[6]["src"] == f"{fixture_md.name}:{lineno(fixture_md, 'Párrafo con')}"


def test_prefijo_de_figuras_configurable(fixture_md: Path):
    secciones = parse_fuentes([fixture_md], figs="img/")
    fig = next(b for s in secciones for b in s["bloques"] if b["t"] == "figure")
    assert fig["html"]["src"] == "img/fig01.png"


def test_una_seccion_sigue_en_el_archivo_siguiente(tmp_path: Path):
    a = tmp_path / "01.md"
    b = tmp_path / "02.md"
    a.write_text("# Uno\n\nPárrafo del primer archivo.\n", encoding="utf-8")
    b.write_text("Párrafo que continúa sin título.\n\n# Dos\n\nOtro.\n", encoding="utf-8")
    secciones = parse_fuentes([a, b])
    assert [s["id"] for s in secciones] == ["uno", "dos"]
    assert [x["src"] for x in secciones[0]["bloques"]] == ["01.md:3", "02.md:1"]


def test_bloque_antes_de_todo_titulo_va_a_preliminares():
    secciones = parse_texto("Texto suelto.\n\n# Uno\n")
    assert secciones[0]["id"] == "preliminares"
    assert secciones[0]["bloques"][0]["id"] == "preliminares-b1"


def test_marcado_sin_cierre_es_error():
    with pytest.raises(ValueError, match=r"\[/PORTADA\]"):
        parse_texto("[PORTADA]\nTítulo\n")


def test_expandir_fuentes(tmp_path: Path):
    (tmp_path / "02_b.md").write_text("# B\n", encoding="utf-8")
    (tmp_path / "01_a.md").write_text("# A\n", encoding="utf-8")
    (tmp_path / "notas.txt").write_text("no", encoding="utf-8")
    assert [p.name for p in expandir_fuentes([tmp_path])] == ["01_a.md", "02_b.md"]
    with pytest.raises(FileNotFoundError):
        expandir_fuentes([tmp_path / "no-existe.md"])
    vacio = tmp_path / "vacio"
    vacio.mkdir()
    with pytest.raises(FileNotFoundError):
        expandir_fuentes([vacio])


def test_un_archivo_con_bom_no_pierde_su_primer_titulo(tmp_path: Path):
    f = tmp_path / "bom.md"
    f.write_bytes("\ufeff# Prefacio\n\nTexto.\n".encode("utf-8"))
    secciones = parse_fuentes([f])
    assert [s["id"] for s in secciones] == ["prefacio"]


def test_el_texto_de_listas_y_tablas_no_lleva_entidades_html():
    secciones = parse_texto("# A\n\n- Tos & fiebre <38\n\n| x & y | z |\n|---|---|\n| 1 | 2 |\n")
    ul, tabla = secciones[0]["bloques"]
    assert ul["texto"] == "Tos & fiebre <38" and ul["html"] == ["Tos &amp; fiebre &lt;38"]
    assert tabla["texto"] == "x & y z"
