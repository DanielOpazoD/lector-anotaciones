import shutil
from pathlib import Path

import pytest

from lector_anotaciones.construir import construir
from lector_anotaciones.markdown import parse_texto
from lector_anotaciones.paginas import (
    asignar_paginas,
    calcular_desfase,
    normalizar_pagina,
    sin_paginas,
    texto_paginas_pdf,
)
from lector_anotaciones.util import norm
from tests.conftest import FIXTURES
from tests.pdf_minimo import pdf_de_fuentes

con_poppler = pytest.mark.skipif(
    not (shutil.which("pdfinfo") and shutil.which("pdftotext")), reason="falta poppler-utils (pdfinfo, pdftotext)"
)

LIBRO = """[PORTADA]
Título
[/PORTADA]

[LEGAL]
© 2026
[/LEGAL]

# Prefacio

Este prefacio abre el libro con una frase suficientemente larga para buscarla.

## Capítulo 1. Uno

Primer párrafo del capítulo uno, también largo para que tenga clave.

- a
- b

Párrafo que está muy lejos, fuera de la ventana de búsqueda, y por eso hereda la página.
"""


def test_normalizar_pagina_une_palabras_partidas():
    assert normalizar_pagina("inferen-\n  cia y Más") == "inferenciaymas"


def test_calcular_desfase():
    textos = ["portada", "legal", norm("TÍTULO DEL LIBRO Prefacio y el resto")]
    assert calcular_desfase(textos, "Título del libro prefacio") == 2
    assert calcular_desfase(textos, "no está") is None
    assert calcular_desfase(textos, None) is None


PREFACIO = norm("Este prefacio abre el libro con una frase suficientemente larga para buscarla.")
CAP = norm("Primer párrafo del capítulo uno, también largo para que tenga clave.")
LEJOS = norm("Párrafo que está muy lejos, fuera de la ventana de búsqueda, y por eso hereda la página.")


def test_la_clave_de_busqueda_son_los_primeros_40_caracteres_normalizados():
    assert len(norm("Primer párrafo del capítulo uno, también largo")) < 40, "una página con menos no basta"
    assert len(CAP) > 40


def test_asignar_paginas_busca_hereda_y_resta_el_desfase():
    secciones = parse_texto(LIBRO)
    textos = ["portada", "legal", "encabezado" + PREFACIO, "encabezado" + CAP, "", "", "", "", "", LEJOS]
    asignar_paginas(secciones, textos, desfase=2, ventana=5)

    assert [b["pagina"] for b in secciones[0]["bloques"]] == [None], "la portada no lleva página"
    assert [b["pagina"] for b in secciones[1]["bloques"]] == [None], "la página legal tampoco"
    assert secciones[2]["bloques"][0]["pagina"] == 1, "física 3 menos desfase 2"
    assert secciones[2]["pagina"] == 1
    bloques = secciones[3]["bloques"]
    assert bloques[0]["pagina"] == 2
    assert bloques[1]["pagina"] == 2, "la lista corta hereda la página anterior"
    assert bloques[2]["pagina"] == 2, "fuera de la ventana: hereda en vez de saltar"
    assert secciones[3]["pagina"] == 2


def test_asignar_paginas_dentro_de_la_ventana_avanza():
    secciones = parse_texto(LIBRO)
    textos = ["portada", "legal", PREFACIO, CAP, "", "", LEJOS]
    asignar_paginas(secciones, textos, desfase=0, ventana=5)
    assert secciones[3]["bloques"][2]["pagina"] == 7


def test_paginas_fisicas_anteriores_al_desfase_quedan_sin_pagina():
    secciones = parse_texto("# Agradecimientos\n\nUn párrafo de agradecimientos suficientemente largo.\n")
    textos = [norm("Un párrafo de agradecimientos suficientemente largo"), "cuerpo"]
    asignar_paginas(secciones, textos, desfase=1)
    assert secciones[0]["bloques"][0]["pagina"] is None
    assert secciones[0]["pagina"] is None


def test_sin_paginas():
    secciones = parse_texto(LIBRO)
    sin_paginas(secciones)
    assert all(b["pagina"] is None for s in secciones for b in s["bloques"])
    assert all(s["pagina"] is None for s in secciones)


LISTA_NUMERADA = """# Capítulo 1. Uno

Un párrafo introductorio bastante largo que está en la página uno del PDF.

1. Lavarse las manos
2. Secarlas bien
3. Aplicar gel

Otro párrafo largo que sigue en la página dos del PDF, después de la lista.
"""


def test_lista_numerada_de_items_cortos_encuentra_la_pagina_en_que_empieza():
    secciones = parse_texto(LISTA_NUMERADA)
    textos = [
        normalizar_pagina("Un párrafo introductorio bastante largo que está en la página uno del PDF."),
        normalizar_pagina(
            "1. Lavarse las manos\n2. Secarlas bien\n3. Aplicar gel\n\nOtro párrafo largo que sigue en la página dos"
        ),
    ]
    asignar_paginas(secciones, textos)
    lista = secciones[0]["bloques"][1]
    assert lista["t"] == "ol" and lista["texto"] == "1. Lavarse las manos 2. Secarlas bien 3. Aplicar gel"
    assert [b["pagina"] for b in secciones[0]["bloques"]] == [1, 2, 2], (
        "la lista no hereda la página del párrafo anterior"
    )


def test_lista_numerada_escrita_con_unos_encuentra_su_pagina():
    # la fuente escribe «1.» en todos los ítems; el PDF imprime 1, 2, 3
    secciones = parse_texto(LISTA_NUMERADA.replace("2. Secarlas", "1. Secarlas").replace("3. Aplicar", "1. Aplicar"))
    textos = [
        normalizar_pagina("Un párrafo introductorio bastante largo que está en la página uno del PDF."),
        normalizar_pagina("1. Lavarse las manos\n2. Secarlas bien\n3. Aplicar gel\n\nOtro párrafo largo que sigue"),
    ]
    asignar_paginas(secciones, textos)
    assert secciones[0]["bloques"][1]["texto"] == "1. Lavarse las manos 2. Secarlas bien 3. Aplicar gel"
    assert [b["pagina"] for b in secciones[0]["bloques"]] == [1, 2, 2]


def test_el_pdf_de_fixture_se_regenera_igual(fixture_md: Path):
    # tests/fixtures/libro_min.pdf sale de `python -m tests.pdf_minimo tests/fixtures/libro_min.md --salida tests/fixtures/libro_min.pdf`
    assert pdf_de_fuentes([fixture_md]) == (FIXTURES / "libro_min.pdf").read_bytes()


@con_poppler
def test_texto_paginas_pdf_lee_el_fixture_y_construir_asigna_paginas(fixture_md: Path):
    pdf = FIXTURES / "libro_min.pdf"
    textos = texto_paginas_pdf(pdf)
    assert len(textos) == 8, "portada, legal, prefacio, parte I, dos capítulos 1, interludio y apéndice"
    assert textos[2].startswith(norm("Prefacio Este es el primer párrafo del prefacio"))
    libro = construir([fixture_md], pdf=pdf, marca_pagina_1="Prefacio")
    assert libro["paginas_fisicas"] == 8 and libro["desfase_paginas"] == 2
    paginas = {b["id"]: b["pagina"] for s in libro["secciones"] for b in s["bloques"]}
    assert paginas["portada-b1"] is None and paginas["pagina-legal-b1"] is None, "antes del desfase"
    assert paginas["prefacio-b1"] == 1 and paginas["cap-01-b2"] == 3 and paginas["ap-a-b1"] == 6, "física menos desfase"


@con_poppler
def test_lista_numerada_al_inicio_de_pagina_en_un_pdf_real(tmp_path: Path):
    # con seis renglones por página, el título y un párrafo de tres renglones llenan la primera página, la lista la segunda
    parrafo = (
        "Un párrafo introductorio bastante largo que está en la página uno del PDF y que sigue, con más "
        "palabras de las necesarias, hasta ocupar tres renglones enteros de la página, para que la lista "
        "numerada empiece en la página siguiente."
    )
    fuente = tmp_path / "a.md"
    fuente.write_text(LISTA_NUMERADA.replace(LISTA_NUMERADA.split("\n")[2], parrafo), encoding="utf-8")
    pdf = tmp_path / "a.pdf"
    pdf.write_bytes(pdf_de_fuentes([fuente], lineas_por_pagina=6))
    textos = texto_paginas_pdf(pdf)
    assert textos[1].startswith("1lavarselasmanos2secarlasbien3aplicargel"), "pdftotext conserva la numeración"
    libro = construir([fuente], pdf=pdf)
    assert [b["pagina"] for b in libro["secciones"][0]["bloques"]] == [1, 2, 3]
