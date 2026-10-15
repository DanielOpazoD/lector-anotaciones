# Importar otros libros desde la página

La página no está atada a un libro. Además del que trae consigo (`libro.json` junto a `index.html`), su **Biblioteca** importa otros desde archivos y los guarda para leerlos y anotarlos igual. Una página publicada sin `libro.json` abre directamente la biblioteca e invita a importar el primero.

Hay dos caminos para tener un libro en el lector, y conviven:

| | Línea de órdenes (`lector-anotaciones construir`) | Biblioteca de la página |
|---|---|---|
| Entrada | Markdown del dialecto del lector | Markdown o texto, HTML, EPUB, Word (`.docx`) o un `libro.json` |
| Página impresa de cada bloque | sí, desde el PDF maquetado | no |
| Capas editoriales | sí | no |
| Diferencia palabra por palabra con la versión anterior | sí (`--anterior`) | no; sí la marca «cambió desde tu última lectura» |
| Hace falta instalar algo | Python | nada |

Los dos producen el mismo `libro.json` (formato 2): el núcleo de la página es un port del paquete y una prueba (`tests/test_paridad_js.py`) comprueba que, con el mismo Markdown, ids, HTML, `archivo:línea` y huellas salen idénticos. Un libro importado se puede descargar como Markdown desde la biblioteca para seguir trabajándolo con la línea de órdenes.

## Formatos

- **Markdown o texto** (`.md`, `.markdown`, `.txt`). Uno o varios archivos, que se leen en orden de nombre (`01-…`, `02-…`) como capítulos seguidos. Las imágenes que se elijan junto con ellos resuelven los `[FIGURA: archivo.png | Leyenda]`. En un `.txt`, una línea suelta del tipo «CAPÍTULO III», «Chapter 3» o «Prólogo» se toma como título de sección; las líneas consecutivas forman un párrafo.
- **HTML** (`.html`, `.htm`, `.xhtml`), uno o varios.
- **EPUB** (2 y 3). Se siguen el orden de lectura (`spine`), los metadatos (título y autor) y el índice del libro (`nav` o `toc.ncx`): un capítulo sin encabezado propio toma su título del índice.
- **Word** (`.docx`). Título y autor salen del documento (estilo Título, propiedades); los estilos «Título 1», «Título 2»… (o el nivel de esquema) abren secciones y subtítulos; las listas numeradas y con viñetas, las citas, las tablas y las imágenes se conservan; la leyenda que sigue a una imagen (estilo Descripción o «Figura N. …») queda como su pie; el texto borrado con control de cambios no entra.
- **`libro.json`** de otro lector o de la línea de órdenes, tal cual (se valida).

De HTML, EPUB y Word se toma la estructura: títulos de dos niveles como secciones (el primero agrupa en el índice; si el libro usa uno solo, cada título es un capítulo), los siguientes como subtítulos, y párrafos, listas, citas, tablas y figuras como bloques. Del formato sólo pasan la **negrita** y la *cursiva*; colores, tipografías, enlaces (queda su texto), notas al pie y estilos se pierden, como en el Markdown del lector.

## Antes de guardar

Al elegir los archivos (o arrastrarlos a la ventana), la biblioteca muestra cuántas secciones y bloques encontró y cualquier aviso (por ejemplo, figuras que quedaron sólo con su leyenda). El título y el autor se pueden corregir. Luego se elige dónde guardarlo:

- **La biblioteca compartida de la página.** Disponible en claude.ai con la capacidad `db` y para quien puede escribir en la base. El libro lo ve todo el que abre la página, y sus anotaciones se comparten como las del libro propio.
- **Sólo este navegador.** El libro y sus anotaciones quedan en este navegador (IndexedDB y `localStorage`). Es lo único disponible fuera de claude.ai o para quien sólo puede leer.

**Reemplazar una versión anterior.** Si ya hay un libro con ese título en el mismo lugar, la biblioteca ofrece reemplazarlo. Sus anotaciones se conservan: como al reconstruir con la línea de órdenes, cada subrayado se busca por su cita y su contexto en la versión nueva, se pinta donde está ahora y la ficha avisa si se movió o si ya no se encuentra. También se puede guardar como otro libro. El libro de la página no se reemplaza desde la biblioteca; un libro importado con su mismo título se guarda con otro id.

## Dónde queda cada cosa

| | Libro de la página | Importado, compartido | Importado, sólo este navegador |
|---|---|---|---|
| Libro | `libro.json` | `libros/<id>` (ficha) y `libros/<id>/partes/<n>` | IndexedDB `lector-anotaciones` → `libros` |
| Anotaciones | colección `anotaciones` | `libros/<id>/anotaciones` | `localStorage` `lector-anotaciones:<id>` |
| Respaldo diario | `respaldos` | `libros/<id>/respaldos` | — |

El `<id>` es el título en minúsculas ASCII con guiones (`libro-de-muestra`), único en la biblioteca. El libro compartido se guarda troceado en partes de hasta 180 KiB (la base admite 256 KiB por documento), primero las partes y al final la ficha que las cuenta, de modo que un libro a medio subir no aparece en la lista. Las anotaciones tienen el mismo formato en los tres casos ([FORMATO_ANOTACIONES.md](FORMATO_ANOTACIONES.md)); para volcarlas, Claude lee la colección del libro que corresponda.

Borrar un libro compartido quita el libro y sus partes, no sus anotaciones: si se vuelve a importar con el mismo título, reaparecen. Borrar uno de este navegador quita también sus anotaciones locales.

## Figuras

Las imágenes de EPUB y Word (y las que acompañan a un Markdown) entran incrustadas en el libro como `data:image/…` cuando caben: hasta 300 KB cada una y 4 MB en total por libro. Las demás, o las de formato no admitido (se admiten PNG, JPEG, GIF, WebP y SVG), quedan como figura con su leyenda y un aviso en la vista previa.

## Seguridad

Un libro que no es el de la página puede venir de cualquier archivo, y uno compartido lo puede escribir cualquier colaborador con acceso a la base. Por eso, al importarlo y cada vez que se abre, su HTML se reduce a texto, `<strong>` y `<em>` sin atributos; los signos `<` y `>` sueltos quedan escapados; y una figura sólo conserva una ruta relativa o una imagen `data:image/…`. Nada de un archivo importado se ejecuta ni carga recursos de otros sitios. Un libro legítimo no cambia con ese saneado (es exactamente lo que produce el Markdown del lector), así que sus huellas y sus anotaciones siguen valiendo.

## Abrir otro libro

La página atiende un libro por carga. Abrir otro desde la biblioteca recuerda la elección en el navegador, espera a que terminen las escrituras pendientes en la base y recarga; la próxima visita abre el mismo libro. Si el libro elegido ya no está (se borró, o es compartido y se abre fuera de claude.ai), la página abre el suyo y lo dice.
