"""Los tipos de los datos que se leen y escriben en JSON: las anotaciones, libro.json y sus partes.

Son diccionarios (lo que da `json.loads`); los alias dicen qué contiene cada uno, y el formato está en
docs/FORMATO_ANOTACIONES.md y en los esquemas de `esquemas/`.
"""

from __future__ import annotations

from typing import Any

#: Una anotación: subrayado, nota de página, de sección o general.
Anotacion = dict[str, Any]
#: libro.json entero: título, secciones, capas…
Libro = dict[str, Any]
#: Una sección de libro.json, con sus bloques.
Seccion = dict[str, Any]
#: Un bloque (párrafo, título, lista, figura…) de una sección.
Bloque = dict[str, Any]
#: Cualquier otro objeto JSON: una respuesta, una escritura de la base…
Json = dict[str, Any]
