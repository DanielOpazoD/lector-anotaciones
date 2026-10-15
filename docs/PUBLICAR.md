# Publicar la página

La página es un único `index.html` sin dependencias de compilación. Necesita, en el mismo directorio, `libro.json` y una carpeta `figs/` con las figuras que el libro referencia (o el prefijo que se haya pasado en `--figs`).

## En el propio computador

```bash
lector-anotaciones construir fuentes/ --pdf libro.pdf --salida salida/libro.json --titulo "Mi libro"
cp web/index.html salida/ && cp -r figs salida/
python -m http.server --directory salida 8000
```

Las anotaciones quedan en el `localStorage` del navegador. Son privadas a ese navegador: hay que copiarlas con «Copiar todo» para sacarlas de ahí.

## Como página privada en claude.ai (recomendado para trabajar con Claude)

Publicada como artefacto desde una sesión de Claude Code con la capacidad `db`, la página guarda cada anotación como un documento de la colección `anotaciones` de una base compartida. Eso es lo que permite que Claude, en la sesión siguiente, lea las anotaciones directamente (herramienta `ArtifactData`, acciones `list` y `query` sobre la colección) y las vuelque a las fuentes, marcando `estado: "resuelta"` las que atendió.

Pasos, desde la sesión de Claude Code:

1. Construir `libro.json` con el PDF, para que las páginas impresas coincidan con las del lector del PDF.
2. Publicar `web/index.html` con la herramienta de artefactos, adjuntando `libro.json` y las figuras como archivos de apoyo, y declarando las capacidades `db`, `user` y `downloads` (`{"db": {}, "user": {"scopes": ["profile"]}, "downloads": true}`; `downloads` permite descargar un libro de la biblioteca como Markdown o `libro.json`): `db` guarda las anotaciones y el respaldo diario (colección `respaldos`: un documento índice por fecha, `AAAA-MM-DD`, con `n` anotaciones respaldadas, `partes` y `omitidas`, y una o más partes `AAAA-MM-DD-n` con las anotaciones serializadas; cada parte se mide en bytes ya envuelta y se corta a 180 KiB para no pasar del tamaño por documento, y una anotación que no cabe ni sola queda fuera del respaldo, aunque su propio documento sigue guardándola); `user` da a cada anotación el id de quien la hizo y resuelve los nombres al mostrar. Sin `user`, todo funciona y `autor` queda en `null`.

Si la base rechaza una escritura, la página distingue el motivo: ante un rechazo de permiso (`not_granted`, `revoked`, `invalid_argument` con un documento bien formado) pasa a sólo lectura el resto de la visita; ante uno transitorio (`unavailable`, `resource_exhausted` o un código desconocido) reintenta una vez tras un retardo corto. Un cambio rechazado sobre una anotación que la base ya tenía (color, estado, nota, réplica) vuelve a la versión guardada. Una anotación que la base no tiene (nueva, o un «Deshacer borrado» cuando el borrado ya se confirmó) nunca se pierde, sea cual sea el rechazo: sigue a la vista marcada «sin guardar», con copia en el navegador; la ficha ofrece reintentar (salvo en sólo lectura, donde sólo cabe copiarla), y «Copiar» y «Copiar todo» la llevan con la señal de que la base no la tiene (`sin guardar en la base (código)` en el texto, campo `sin_guardar` en el JSON). Lo mismo vale para lo que un lector de sólo lectura anotó antes de que la página lo supiera (mientras conectaba, o en otra sesión): al conectar queda marcado «sin guardar (sólo lectura)» y la barra lo dice.
3. Tras cada cambio en las fuentes, reconstruir `libro.json` y republicar con la misma URL. Los ids de bloque son estables mientras no cambie el orden de los bloques de una sección; una anotación cuyo bloque se movió sigue siendo localizable por `cita`, `antes` y `despues`.

La página funciona igual sin la base: si `window.claude.use("db")` devuelve `null`, pasa sola al respaldo local y lo dice en la barra de estado.

### Una biblioteca en vez de un libro

Publicada sin `libro.json`, la página abre su biblioteca vacía e invita a importar un libro (Markdown, texto, HTML, EPUB o Word). Con `libro.json`, ese libro es el de la página y la biblioteca suma los importados. Los libros que se guardan en la biblioteca compartida quedan en la colección `libros` (troceados en `libros/<id>/partes`) y sus anotaciones en `libros/<id>/anotaciones`, con el mismo formato que `anotaciones`. Detalles en [IMPORTAR.md](IMPORTAR.md).

### Lectores invitados

Compartir el artefacto con otra persona le da el libro y todas las anotaciones. Para que pueda anotar, su acceso debe permitir escribir en la base (nivel «Contributor» o superior en el menú de compartir); quien sólo puede ver recibe la página en modo sólo lectura (puede leer y copiar, no anotar): lo señalan un chip «sólo lectura» en la cabecera y el estado de conexión, la barra de selección sólo ofrece copiar, los números de página siguen en el margen pero sin acción, y la ayuda omite los atajos de anotar. Cada ficha lleva el nombre de quien la escribió cuando hay más de un lector, y el panel ofrece un selector para ver las de cada uno.

## En cualquier servidor estático

Vale cualquier hosting de archivos estáticos (GitHub Pages, Netlify, un bucket). Sin base compartida, se comporta como en el propio computador: anotaciones por navegador y exportación manual.
