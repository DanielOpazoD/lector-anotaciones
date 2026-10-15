# Formato de `libro.json`

Es el archivo que `lector-anotaciones construir` produce y que `web/index.html` lee. Está pensado para que cada anotación hecha sobre la página pueda volver a las fuentes sin ambigüedad: cada bloque sabe de qué archivo y línea viene y en qué página impresa cae.

```json
{
  "formato": 1,
  "generador": "lector-anotaciones 0.1.0",
  "id": "libro-de-ejemplo",
  "titulo": "Libro de ejemplo",
  "subtitulo": "",
  "autor": "Autora Ejemplo",
  "generado": "2026-10-15",
  "fuentes": ["00_preliminares.md", "01_cierre.md"],
  "paginas_fisicas": 12,
  "desfase_paginas": 2,
  "inicio": "cap-01",
  "secciones": [
    {
      "id": "cap-01",
      "titulo": "Capítulo 1. Hechos y observaciones",
      "nivel": 2,
      "src": "00_preliminares.md:21",
      "pagina": 3,
      "bloques": [
        { "id": "cap-01-b1", "t": "p", "html": "Un hecho es lo que se observó…", "src": "00_preliminares.md:23", "pagina": 3 },
        { "id": "cap-01-b2", "t": "h3", "html": "Tres maneras de mezclar", "src": "00_preliminares.md:25", "pagina": 3 },
        { "id": "cap-01-b3", "t": "ul", "html": ["Dar por hecho…", "…"], "src": "00_preliminares.md:27", "pagina": 3 }
      ]
    }
  ]
}
```

## Campos del libro

| Campo | Significado |
|---|---|
| `formato` | Versión del formato (hoy `1`). La página rechaza un libro sin secciones; un cambio incompatible subirá este número. |
| `id` | Slug del título. La página lo usa para separar el respaldo local (`localStorage`) de cada libro. |
| `generado` | Fecha de construcción. Como las anotaciones citan ids de bloque, conviene registrar con qué `libro.json` se hicieron. |
| `fuentes` | Nombres de los archivos leídos, en orden. |
| `paginas_fisicas` | Páginas del PDF, o `null` si se construyó sin PDF. |
| `desfase_paginas` | Páginas físicas anteriores a la página impresa 1 (portada, legal, índice…). |
| `inicio` | Sección que la página abre la primera vez: la primera de nivel 2, o la primera que haya. |
| `claves_anteriores` | Claves de `localStorage` que usaron versiones anteriores de la página para este libro (`--claves-anteriores`). Al cargar sin base compartida, la página copia esas anotaciones a la clave actual sin pisar las existentes y retira la clave vieja. |

## Secciones

Cada `#` o `##` de las fuentes abre una sección. Los ids siguen las convenciones de un libro en español cuando el título las cumple, y un slug del título en cualquier otro caso; si se repiten, reciben `-2`, `-3`…

| Título | id |
|---|---|
| `Capítulo 7. …` | `cap-07` |
| `Interludio II. …` | `interludio-2` |
| `PARTE III. …` | `parte-3` |
| `Apéndice B. …` | `ap-b` |
| `[PORTADA]` / `[LEGAL]` | `portada` / `pagina-legal` |
| `Glosario`, `Cómo leer este libro. …` | `glosario`, `como-leer-este-libro` |

`pagina` es la primera página impresa en que aparece un bloque de la sección, o `null`.

## Bloques

| `t` | `html` | Fuente |
|---|---|---|
| `p` | cadena | párrafo (líneas consecutivas no vacías) |
| `h3`, `h4` | cadena | `###`, `####` |
| `ul`, `ol` | lista de cadenas | `- ` y `1. ` |
| `quote` | cadena | líneas `> ` consecutivas, unidas |
| `table` | lista de filas (lista de celdas); la primera fila es la cabecera | líneas `\|…\|`; la fila separadora `|---|` se omite |
| `figure` | `{"src": "figs/archivo.png", "caption": "…"}` | `[FIGURA: archivo.png \| Leyenda]` |
| `portada` | lista de cadenas (una por línea) | `[PORTADA] … [/PORTADA]` |

En todos los casos el HTML ya está escapado y sólo contiene `<strong>` y `<em>`. `src` es `archivo.md:línea` de la primera línea del bloque. `pagina` es la impresa (física menos desfase), o `null` cuando el bloque cae en las páginas preliminares o no hubo PDF.

## Invariantes que comprueba `validar`

- Ids de sección y de bloque únicos; cada bloque numerado `<sección>-b<n>` en orden.
- `src` con número de línea.
- La página nunca retrocede a lo largo del libro (si lo hace, la búsqueda en el PDF se confundió: suele bastar con subir `--ventana` o revisar un párrafo duplicado).

Con `--estricto`, `construir` termina con código 1 cuando algo de esto falla.
