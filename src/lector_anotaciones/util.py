"""Utilidades compartidas: normalización de texto e identificadores."""

from __future__ import annotations

import re
import unicodedata

_NO_ALFANUM = re.compile(r"[^a-z0-9]+")
_ETIQUETA = re.compile(r"<[^>]+>")


def sin_acentos(s: str) -> str:
    """Devuelve `s` sin diacríticos ni caracteres fuera de ASCII."""
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def slug(s: str, maximo: int = 40) -> str:
    """Identificador legible: minúsculas ASCII separadas por guiones, nunca vacío."""
    s = _NO_ALFANUM.sub("-", sin_acentos(s).lower()).strip("-")
    return s[:maximo].rstrip("-") or "s"


def norm(s: str) -> str:
    """Minúsculas, sin acentos, sólo letras y dígitos: la clave con que se compara fuente y PDF."""
    return _NO_ALFANUM.sub("", sin_acentos(s).lower())


def texto_plano(fragmento_html: str) -> str:
    """Quita las etiquetas HTML de un fragmento ya convertido."""
    return _ETIQUETA.sub("", fragmento_html)
