"""La página de lectura y anotación: se escribe en módulos y se empaqueta en un único `index.html`.

Las fuentes viven junto al paquete, en `web/`:

- `plantilla.html`: el esqueleto, con tres marcas que el empaquetador sustituye una sola vez cada una:
  `{{ESTILOS}}`, `{{NUCLEO}}` y `{{PAGINA}}`.
- `estilos.css`: la hoja de estilos.
- `nucleo/*.js`: lógica pura, sin DOM (ubicar citas, fundir borradores, diferencias, Markdown…). Cada
  archivo funciona igual en el navegador (se registra en `LANucleo`) y en Node (se exporta con
  `module.exports`), así que se prueba con `node --test` sin navegador.
- `pagina/*.js`: la interfaz, en fragmentos que se concatenan por orden de nombre. Cada fragmento es un
  módulo, `(function (P, E) { … })(LAPagina, LAEstado)`: lo suyo es privado, lo que ofrece a los demás va en `P` y
  el estado que comparten y reasignan, en `E` (ver docs/MODULOS.md).

El resultado no tiene dependencias ni pasos de compilación en el navegador: se puede abrir desde un
servidor estático, publicar como página de claude.ai o copiar junto a cualquier `libro.json`.
"""

from __future__ import annotations

from pathlib import Path

WEB = Path(__file__).parent / "web"
MARCAS = ("{{ESTILOS}}", "{{NUCLEO}}", "{{PAGINA}}")


def _concatenar(carpeta: Path) -> str:
    if not carpeta.is_dir():
        return ""
    return "".join(f.read_text(encoding="utf-8") for f in sorted(carpeta.glob("*.js")))


def empaquetar(web: Path = WEB) -> str:
    """Devuelve el `index.html` completo armado desde las fuentes de `web`."""
    plantilla = (web / "plantilla.html").read_text(encoding="utf-8")
    for marca in MARCAS:
        if plantilla.count(marca) != 1:
            raise ValueError(f"la plantilla debe contener {marca} exactamente una vez")
    partes = {
        "{{ESTILOS}}": (web / "estilos.css").read_text(encoding="utf-8"),
        "{{NUCLEO}}": _concatenar(web / "nucleo"),
        "{{PAGINA}}": _concatenar(web / "pagina"),
    }
    for marca, texto in partes.items():
        cierre = "</style" if marca == "{{ESTILOS}}" else "</script"
        if cierre in texto.lower():
            raise ValueError(f"{marca}: el texto contiene «{cierre}», que cerraría el bloque antes de tiempo")
        for otra in MARCAS:
            if otra in texto:
                raise ValueError(f"{marca}: el texto contiene la marca {otra}")
    salida = plantilla
    for marca, texto in partes.items():
        salida = salida.replace(marca, texto)
    return salida


def escribir_pagina(destino: Path, web: Path = WEB) -> int:
    """Escribe la página empaquetada en `destino` y devuelve su tamaño en bytes."""
    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    datos = empaquetar(web).encode("utf-8")
    destino.write_bytes(datos)
    return len(datos)


def esta_al_dia(destino: Path, web: Path = WEB) -> bool:
    """True si `destino` coincide con lo que produciría el empaquetador ahora."""
    destino = Path(destino)
    return destino.is_file() and destino.read_text(encoding="utf-8") == empaquetar(web)
