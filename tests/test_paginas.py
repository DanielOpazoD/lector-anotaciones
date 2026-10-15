from lector_anotaciones.markdown import parse_texto
from lector_anotaciones.paginas import asignar_paginas, calcular_desfase, normalizar_pagina, sin_paginas
from lector_anotaciones.util import norm

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
