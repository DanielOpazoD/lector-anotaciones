"""El empaquetador de la página: arma un único index.html desde las fuentes de `web/`."""

from pathlib import Path

import pytest

from lector_anotaciones import __version__
from lector_anotaciones.cli import main
from lector_anotaciones.pagina import WEB, empaquetar, escribir_pagina, esta_al_dia

RAIZ = Path(__file__).resolve().parents[1]


def test_web_index_esta_al_dia_con_las_fuentes():
    """`web/index.html` es una salida del empaquetador: si alguien edita las fuentes, debe regenerarla."""
    assert esta_al_dia(RAIZ / "web" / "index.html"), "regenera con `lector-anotaciones pagina --salida web/index.html`"


def test_la_pagina_empaquetada_no_tiene_marcas_sin_sustituir():
    html = empaquetar()
    for marca in ("{{ESTILOS}}", "{{NUCLEO}}", "{{PAGINA}}", "{{VERSION}}"):
        assert marca not in html
    assert html.count("<script>") == html.count("</script>")


def test_la_pagina_dice_su_version():
    """El diagnóstico de la página («Copiar diagnóstico») la lee de aquí."""
    assert f'<meta name="generator" content="lector-anotaciones {__version__}">' in empaquetar()


def _copia_de_web(tmp_path: Path) -> Path:
    destino = tmp_path / "web"
    for f in WEB.rglob("*"):
        if f.is_file():
            (destino / f.relative_to(WEB)).parent.mkdir(parents=True, exist_ok=True)
            (destino / f.relative_to(WEB)).write_bytes(f.read_bytes())
    return destino


def test_una_fuente_que_cierra_el_script_se_rechaza(tmp_path: Path):
    web = _copia_de_web(tmp_path)
    (web / "pagina" / "99-mal.js").write_text("var x = '</script>';\n", encoding="utf-8")
    with pytest.raises(ValueError, match="</script"):
        empaquetar(web)


def test_una_marca_repetida_en_la_plantilla_se_rechaza(tmp_path: Path):
    web = _copia_de_web(tmp_path)
    p = web / "plantilla.html"
    p.write_text(p.read_text(encoding="utf-8") + "{{PAGINA}}", encoding="utf-8")
    with pytest.raises(ValueError, match="exactamente una vez"):
        empaquetar(web)


def test_los_fragmentos_se_concatenan_por_orden_de_nombre(tmp_path: Path):
    web = _copia_de_web(tmp_path)
    (web / "pagina" / "99-ultimo.js").write_text("  // marca-ultimo\n", encoding="utf-8")
    (web / "pagina" / "01-primero.js").write_text("  // marca-primero\n", encoding="utf-8")
    html = empaquetar(web)
    assert (
        html.index("E.LIBRO = /** @type {Libro | null} */ (null)")
        < html.index("marca-primero")
        < html.index("function renderLibro")
    )
    assert html.index("function arrancar") < html.index("marca-ultimo")


def test_orden_pagina_escribe_y_comprueba(tmp_path: Path, capsys):
    destino = tmp_path / "sitio" / "index.html"
    assert main(["pagina", "--salida", str(destino)]) == 0
    assert destino.read_text(encoding="utf-8") == empaquetar()
    assert main(["pagina", "--salida", str(destino), "--comprobar"]) == 0
    destino.write_text("otra cosa", encoding="utf-8")
    assert main(["pagina", "--salida", str(destino), "--comprobar"]) == 1
    assert "no coincide" in capsys.readouterr().err


def test_construir_con_pagina_la_deja_junto_al_libro(tmp_path: Path, fixture_md: Path):
    salida = tmp_path / "sitio" / "libro.json"
    assert main(["construir", str(fixture_md), "--salida", str(salida), "--sin-anterior", "--pagina"]) == 0
    assert (salida.parent / "index.html").read_text(encoding="utf-8") == empaquetar()


def test_escribir_pagina_devuelve_el_tamano(tmp_path: Path):
    destino = tmp_path / "index.html"
    assert escribir_pagina(destino) == len(destino.read_bytes())
