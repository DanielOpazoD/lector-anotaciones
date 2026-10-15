from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"
RAIZ = Path(__file__).resolve().parents[1]


@pytest.fixture
def fixture_md() -> Path:
    return FIXTURES / "libro_min.md"


@pytest.fixture
def ejemplo_fuentes() -> Path:
    return RAIZ / "ejemplo" / "fuentes"


@pytest.fixture
def web_index() -> Path:
    return RAIZ / "web" / "index.html"


def lineno(ruta: Path, inicio: str) -> int:
    """Número de línea (1-based) de la primera línea del archivo que empieza con `inicio`."""
    for n, linea in enumerate(ruta.read_text(encoding="utf-8").split("\n"), 1):
        if linea.startswith(inicio):
            return n
    raise AssertionError(f"no hay línea que empiece con {inicio!r} en {ruta}")
