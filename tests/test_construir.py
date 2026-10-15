import json
import random
import time
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


def test_anterior_no_se_confunde_al_insertar_o_borrar_un_parrafo(tmp_path: Path):
    fuente = tmp_path / "a.md"
    fuente.write_text("# Uno\n\nA primero.\n\nB segundo.\n\nC tercero.\n", encoding="utf-8")
    v1 = construir([fuente])
    # se inserta un párrafo al inicio y se modifica el segundo: sólo ese se marca, con su propio texto anterior
    fuente.write_text("# Uno\n\nN nuevo.\n\nA primero.\n\nB segundo corregido.\n\nC tercero.\n", encoding="utf-8")
    v2 = construir([fuente], anterior=v1)
    bloques = v2["secciones"][0]["bloques"]
    assert [b.get("anterior") for b in bloques] == [None, None, "B segundo.", None]
    assert v2["cambios"] == 1
    # se borra el primero: nada cambió
    fuente.write_text("# Uno\n\nA primero.\n\nB segundo corregido.\n\nC tercero.\n", encoding="utf-8")
    v3 = construir([fuente], anterior=v2)
    assert v3["cambios"] == 0 and all("anterior" not in b for b in v3["secciones"][0]["bloques"])


def _versiones(tmp_path: Path, v1: list[str], v2: list[str]) -> list[str | None]:
    """Construye v1, luego v2 con v1 como anterior, y devuelve el `anterior` de cada bloque de v2."""
    fuente = tmp_path / "a.md"
    fuente.write_text("# Uno\n\n" + "\n\n".join(v1) + "\n", encoding="utf-8")
    libro1 = construir([fuente])
    fuente.write_text("# Uno\n\n" + "\n\n".join(v2) + "\n", encoding="utf-8")
    libro2 = construir([fuente], anterior=libro1)
    assert validar(libro2) == []
    anteriores = [b.get("anterior") for b in libro2["secciones"][0]["bloques"]]
    assert libro2["cambios"] == sum(1 for a in anteriores if a is not None)
    return anteriores


def test_anterior_con_insercion_pegada_a_la_modificacion(tmp_path: Path):
    # sin bloque intacto entre el párrafo nuevo y el retocado: el texto viejo debe ir al retocado, no al nuevo
    anteriores = _versiones(
        tmp_path,
        ["A primero.", "B segundo.", "C tercero."],
        ["A primero.", "N nuevo.", "B segundo corregido.", "C tercero."],
    )
    assert anteriores == [None, None, "B segundo.", None]


def test_anterior_con_borrado_pegado_a_la_modificacion(tmp_path: Path):
    anteriores = _versiones(
        tmp_path,
        ["A primero.", "B segundo.", "C tercero.", "D cuarto."],
        ["A primero.", "C tercero corregido.", "D cuarto."],
    )
    assert anteriores == [None, "C tercero.", None], "el retocado se empareja con su propio texto, no con el borrado"


def test_anterior_con_bloques_repetidos(tmp_path: Path):
    # separadores idénticos alrededor del párrafo que cambia: difflib prefiere alinear los repetidos
    sep = "Separador ∗ ∗ ∗"
    anteriores = _versiones(
        tmp_path, [sep, sep, sep, "Párrafo alfa que cambia."], [sep, sep, "Párrafo alfa que cambió.", sep]
    )
    assert anteriores == [None, None, "Párrafo alfa que cambia.", None]


def test_anterior_no_empareja_lo_que_no_se_parece(tmp_path: Path):
    # en un tramo con más de un bloque por lado, lo que no se parece no se empareja: es un borrado más una inserción
    anteriores = _versiones(
        tmp_path,
        ["A primero.", "B segundo.", "C tercero."],
        ["A primero.", "Otro párrafo sin relación.", "C tercero corregido."],
    )
    assert anteriores == [None, None, "C tercero."]


def test_anterior_de_un_parrafo_reescrito_del_todo_en_su_sitio(tmp_path: Path):
    # cuando el tramo cambia exactamente un bloque por otro, el anterior es inequívoco aunque no se parezcan
    assert _versiones(tmp_path, ["Uno dos tres cuatro."], ["Zeta equis griega ye."]) == ["Uno dos tres cuatro."]
    anteriores = _versiones(
        tmp_path,
        ["A primero.", "Uno dos tres cuatro.", "C tercero."],
        ["A primero.", "Zeta equis griega ye.", "C tercero."],
    )
    assert anteriores == [None, "Uno dos tres cuatro.", None]


def test_anterior_con_insercion_y_borrado_adyacentes_en_el_mismo_tramo(tmp_path: Path):
    # inserción pegada a una modificación y, más abajo, borrado pegado a otra: cada retocado recibe su propio texto
    anteriores = _versiones(
        tmp_path,
        ["A primero.", "B segundo.", "C tercero.", "D cuarto.", "E quinto."],
        ["A primero.", "N nuevo.", "B segundo corregido.", "D cuarto corregido.", "E quinto."],
    )
    assert anteriores == [None, None, "B segundo.", "D cuarto.", None]


def test_anterior_amplia_la_ventana_si_la_insercion_desplaza_mas_de_tres_posiciones(tmp_path: Path):
    letras = [
        "Alfa beta gamma",
        "Delta épsilon zeta",
        "Eta theta iota",
        "Kappa lambda mu",
        "Nu xi ómicron",
        "Pi rho sigma",
    ]
    retocados = [f"{x} de siempre." for x in letras]
    nuevos = [f"Nuevo {n} que no estaba." for n in ("uno", "dos", "tres", "cuatro", "cinco")]
    anteriores = _versiones(tmp_path, retocados, nuevos + [f"{x} de ahora." for x in letras])
    assert anteriores == [None] * 5 + retocados, (
        "lejos de la diagonal del tramo, pero cada uno con una sola pareja posible"
    )


def _parrafos_de_prosa(cuantos: int, palabras: int = 60) -> list[str]:
    """Párrafos deterministas que mezclan palabras gramaticales comunes y palabras de contenido variadas."""
    azar = random.Random(7)
    comunes = ["de", "la", "el", "que", "y", "en", "un", "una", "los", "las", "se", "por", "con", "para", "no", "es"]
    salida = []
    for _ in range(cuantos):
        ws = [
            azar.choice(comunes) if azar.random() < 0.5 else f"palabra{azar.randint(0, 400)}" for _ in range(palabras)
        ]
        salida.append(" ".join(ws).capitalize() + ".")
    return salida


def test_una_edicion_global_de_trescientos_bloques_se_empareja_en_menos_de_dos_segundos(tmp_path: Path):
    # cambiar una palabra en cada párrafo del capítulo (un nombre, las comillas): todos cambian, nada se desplaza
    v1 = _parrafos_de_prosa(300)
    v2 = [" ".join([*ws[:10], "cambiada", *ws[11:]]) for ws in (p.split() for p in v1)]
    fuente = tmp_path / "a.md"
    fuente.write_text("# Uno\n\n" + "\n\n".join(v1) + "\n", encoding="utf-8")
    libro1 = construir([fuente])
    fuente.write_text("# Uno\n\n" + "\n\n".join(v2) + "\n", encoding="utf-8")
    inicio = time.perf_counter()
    libro2 = construir([fuente], anterior=libro1)
    segundos = time.perf_counter() - inicio
    assert [b.get("anterior") for b in libro2["secciones"][0]["bloques"]] == v1 and libro2["cambios"] == 300
    assert segundos < 2, f"{segundos:.1f} s para emparejar 300 bloques cambiados"


def test_capas_de_listas_y_tablas_se_calculan_por_item(tmp_path: Path):
    from lector_anotaciones.capas import ConfigCapas
    from lector_anotaciones.construir import texto_render

    items = "\n".join(f"- Ítem número {i} con cinco voces." for i in range(1, 13))
    tabla = "| Celda uno | Por eso |\n|---|---|\n| Dos | tres |"
    fuente = tmp_path / "a.md"
    fuente.write_text(
        f"# Uno\n\n{items}\n\n{tabla}\n\n- Primero\n- Por eso incertidumbre, incertidumbre\n", encoding="utf-8"
    )
    lista, tabla_b, muletilla = construir([fuente], capas=ConfigCapas(frase_larga=20))["secciones"][0]["bloques"]
    assert "m" not in lista, "doce ítems cortos no son una frase larga ni repiten palabras largas"
    texto = texto_render(tabla_b)
    assert [texto[a:b] for a, b in tabla_b["m"]["mu"]] == ["Por eso"], "las coordenadas son las del texto pegado"
    texto = texto_render(muletilla)
    assert [texto[a:b] for a, b in muletilla["m"]["mu"]] == ["Por eso"]
    assert [texto[a:b] for a, b in muletilla["m"]["rep"]] == ["incertidumbre", "incertidumbre"]


def test_repeticiones_partidas_entre_items_o_celdas(tmp_path: Path):
    from lector_anotaciones.capas import ConfigCapas
    from lector_anotaciones.construir import texto_render

    fuente = tmp_path / "a.md"
    fuente.write_text(
        "# Uno\n\n- Primero la incertidumbre\n- Incertidumbre después\n\n"
        "| Incertidumbre | x |\n|---|---|\n| y | incertidumbre |\n",
        encoding="utf-8",
    )
    lista, tabla = construir([fuente], capas=ConfigCapas())["secciones"][0]["bloques"]
    texto = texto_render(lista)
    assert texto == "Primero la incertidumbreIncertidumbre después"
    assert [texto[a:b] for a, b in lista["m"]["rep"]] == ["incertidumbre", "Incertidumbre"], (
        "la repetición partida entre dos ítems se ve, y las coordenadas son las del texto pegado"
    )
    texto = texto_render(tabla)
    assert [texto[a:b] for a, b in tabla["m"]["rep"]] == ["Incertidumbre", "incertidumbre"]
    assert "fl" not in lista["m"] and "fl" not in tabla["m"]


def test_cargar_anterior_tolera_bom_y_avisa_si_no_se_puede_leer(tmp_path: Path):
    from lector_anotaciones.construir import cargar_anterior

    fuente = tmp_path / "a.md"
    salida = tmp_path / "libro.json"
    fuente.write_text("# Uno\n\nTexto primero.\n", encoding="utf-8")
    escribir(construir([fuente]), salida)
    salida.write_bytes(b"\xef\xbb\xbf" + salida.read_bytes())
    avisos: list[str] = []
    assert cargar_anterior(salida, avisos)["secciones"] and avisos == []
    salida.write_text("{ roto", encoding="utf-8")
    assert cargar_anterior(salida, avisos) is None and "no se pudo leer" in avisos[0]
    salida.write_text("[]", encoding="utf-8")
    assert cargar_anterior(salida, avisos) is None and "forma de un libro.json" in avisos[1]
    assert cargar_anterior(tmp_path / "no-existe.json", avisos) is None and len(avisos) == 2


def test_cli_anterior_con_bom_marca_cambios_y_roto_avisa(tmp_path: Path, capsys):
    fuente = tmp_path / "a.md"
    salida = tmp_path / "libro.json"
    fuente.write_text("# Uno\n\nTexto primero.\n", encoding="utf-8")
    assert main(["construir", str(fuente), "--salida", str(salida)]) == 0
    salida.write_bytes(b"\xef\xbb\xbf" + salida.read_bytes())  # como lo deja PowerShell con -Encoding utf8
    fuente.write_text("# Uno\n\nTexto segundo.\n", encoding="utf-8")
    assert main(["construir", str(fuente), "--salida", str(salida)]) == 0
    libro = json.loads(salida.read_text(encoding="utf-8"))
    assert libro["cambios"] == 1 and libro["secciones"][0]["bloques"][0]["anterior"] == "Texto primero."
    assert capsys.readouterr().err == ""
    salida.write_text("{ roto", encoding="utf-8")
    assert main(["construir", str(fuente), "--salida", str(salida)]) == 0
    assert "aviso: no se pudo leer la salida anterior" in capsys.readouterr().err
    assert json.loads(salida.read_text(encoding="utf-8"))["cambios"] == 0
