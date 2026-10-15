# Lector de anotaciones

Un libro escrito en Markdown se convierte en una página de lectura donde el autor **destaca** pasajes con colores que significan algo, les deja **notas**, y anota también **por página**, **por sección** y en general. Cada anotación sale trazable al archivo y la línea de las fuentes y a la página impresa del PDF, de modo que una persona o un asistente pueda volcarla a las fuentes sin ambigüedad.

Nació para editar *Hechos, inferencias e incertidumbre* y está generalizado para cualquier libro en Markdown sencillo.

## Cómo funciona

```
fuentes/*.md  ──construir──▶  libro.json  ──▶  web/index.html  ──▶  anotaciones (JSON)  ──exportar──▶  tareas.md
     + libro.pdf (opcional)        ▲                 │                      │
                                   └── bloques con id, archivo:línea y página impresa
```

1. **`lector-anotaciones construir`** lee las fuentes (y el PDF maquetado, si lo hay) y escribe `libro.json`: cada párrafo, lista, cita, tabla o figura es un bloque con id estable, `archivo.md:línea` de origen y página impresa.
2. **`web/index.html`** muestra el libro por secciones con los números de página al margen. Seleccionar texto abre una barra con cuatro colores; cada color es una instrucción: **revisar** (ámbar), **cortar** (rojo), **duda o verificar** (violeta), **conservar** (verde). Clic en un número de página deja una nota de página; hay botones para notas de sección y generales; filtros, búsqueda, estado abierta/resuelta y «Copiar todo» en JSON o Markdown.
3. **`lector-anotaciones exportar`** convierte el JSON de anotaciones en una lista de tareas en Markdown, por sección o por archivo de origen.

Publicada como página privada en claude.ai con la capacidad `db`, la página guarda cada anotación en una base compartida que Claude lee directamente en la sesión siguiente. Sin esa base, guarda en el navegador y lo dice. Ver [docs/PUBLICAR.md](docs/PUBLICAR.md).

## Instalación

Requiere Python 3.11 o superior. Para asignar páginas hace falta `poppler-utils` (`pdftotext`, `pdfinfo`); sin él, todo funciona salvo la paginación.

```bash
pip install git+https://github.com/DanielOpazoD/lector-anotaciones
# o, para desarrollar:
git clone https://github.com/DanielOpazoD/lector-anotaciones && cd lector-anotaciones && pip install -e ".[dev]"
```

## Uso

```bash
# 1. El libro, con páginas tomadas del PDF maquetado
lector-anotaciones construir fuentes/ --pdf Mi_libro.pdf --salida salida/libro.json \
    --titulo "Mi libro" --autor "Quien lo escribe" \
    --marca-pagina-1 "MI LIBRO Prefacio" --estricto

# 2. La página, junto al libro y a las figuras
cp web/index.html salida/ && cp -r figs salida/
python -m http.server --directory salida 8000      # http://localhost:8000/

# 3. Las anotaciones, de vuelta al trabajo sobre las fuentes
lector-anotaciones exportar anotaciones.json --agrupar archivo --solo-abiertas --salida tareas.md
```

`--marca-pagina-1` es el texto con que empieza la página impresa 1 en el PDF (por ejemplo el encabezado corrido seguido del título del prefacio); con él la herramienta calcula cuántas páginas preliminares hay que restar. Sin PDF, los bloques quedan sin página. El directorio [`ejemplo/`](ejemplo/) tiene un libro inventado con todo el dialecto para probar de punta a punta.

### Dialecto Markdown admitido

`#` y `##` abren secciones; `###` y `####` son subtítulos; párrafos, listas `- ` y `1. `, tablas `|…|`, citas `> `, `**negrita**` y `*cursiva*`. Tres marcadores propios de un libro: `[FIGURA: archivo.png | Leyenda]`, `[PORTADA] … [/PORTADA]` y `[LEGAL] … [/LEGAL]`. Lo que no está en esta lista se muestra como texto. Los detalles y los ids de sección están en [docs/FORMATO_LIBRO.md](docs/FORMATO_LIBRO.md).

## Estructura del repositorio

```
src/lector_anotaciones/   paquete Python
  markdown.py             fuentes → secciones y bloques (ids, archivo:línea, HTML seguro)
  paginas.py              PDF → texto por página; búsqueda y herencia de la página impresa
  construir.py            arma y valida libro.json
  exportar.py             anotaciones JSON → Markdown de tareas
  cli.py                  órdenes `construir` y `exportar`
web/index.html            la página (HTML, CSS y JS sin dependencias)
tests/                    pytest (paquete) y tests/web/smoke.mjs (Playwright sobre la página)
docs/                     formatos de libro.json y de las anotaciones; cómo publicar
ejemplo/                  libro de prueba con figura
```

## Desarrollo

```bash
pip install -e ".[dev]"
ruff check . && ruff format --check .
pytest
npm install && npx playwright install chromium && npm run test:web   # pruebas de la página
```

La integración continua corre ruff y pytest en Python 3.11–3.13, construye el ejemplo y pasa la prueba de humo de la página en Chromium. Ver [CONTRIBUTING.md](CONTRIBUTING.md).

## Decisiones de diseño

- **Trazabilidad antes que riqueza de formato.** La página renderiza un subconjunto pequeño de Markdown a cambio de que cada bloque tenga un id estable y una línea de origen. Un editor con todo el Markdown pero sin esa trazabilidad no sirve para volcar anotaciones.
- **La página no tiene compilación.** Un solo archivo HTML, sin paquetes, que corre desde un servidor estático o como artefacto de claude.ai. Los contratos que el resto del sistema da por supuestos (lee `libro.json`, colección `anotaciones`, respaldo local por libro, sin scripts externos) están en `tests/test_web.py`.
- **Los colores son instrucciones.** Cuatro significados fijos, no una paleta libre, para que quien vuelque las anotaciones no tenga que interpretar.
- **Un subrayado se comprueba antes de pintarse.** Los ids de bloque son posicionales y cambian si se inserta un párrafo; la página verifica que la cita guardada siga en su sitio y, si no, la busca por el texto y el contexto (y lo dice en la ficha) o la declara no encontrada. Nunca pinta un pasaje equivocado y nunca modifica lo guardado. Detalles en [docs/FORMATO_ANOTACIONES.md](docs/FORMATO_ANOTACIONES.md).
- **Escribir una nota no se interrumpe.** Los cambios que llegan de la base (el eco de un guardado propio o una edición desde otra sesión) redibujan el panel sin quitar el editor activo, su borrador ni el cursor.
- **La página impresa se busca, no se calcula.** Los primeros 40 caracteres normalizados de cada bloque se buscan en una ventana de páginas hacia adelante; lo que no se encuentra hereda la página anterior. Es robusto frente a guiones, acentos y cambios de maquetación, y la validación avisa si una página retrocede.

## Licencia

[MIT](LICENSE). © 2026 Daniel Opazo.
