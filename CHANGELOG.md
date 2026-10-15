# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/); versiones según [SemVer](https://semver.org/lang/es/).

## [0.2.5] - 2026-10-15

### Corregido

- Borrar una anotación que no había logrado subir la retira también de la copia local, así que no vuelve al recargar.
- La copia local ya no se reescribe entera: anotar o editar mientras la base conecta funde en ella, de la copia sólo sale lo que subió, lo que la base ya tenía o lo borrado, y lo de otra cuenta en el mismo navegador se conserva ahí, sin cargarse ni subirse, hasta que vuelva su autor.

## [0.2.4] - 2026-10-15

### Corregido

- Con base compartida, la página nunca volvía a leer lo que había quedado en el navegador (anotado sin conexión en otra sesión, o cuya subida falló): esas anotaciones quedaban invisibles e inexportables. Ahora, tras la primera foto de la base, se recuperan, se muestran y se vuelven a subir; la copia local sólo se retira cuando todas subieron, lo que la base ya tiene manda sobre la copia local, y una copia local de una anotación ajena no se resucita.
- Tras una subida fallida, la copia local guarda sólo lo que no logró subir, no toda la memoria.
- En sólo lectura no se intenta subir nada y la copia local no se toca.

## [0.2.3] - 2026-10-15

### Corregido

- Si una anotación hecha antes de conectar no logra subir, la nota y su copia local se conservan y el estado lo avisa, en vez de borrarla del navegador.
- `ubicar` recorre todos los bloques candidatos antes de decidir: una cita con contexto se reubica en el bloque correcto aunque otro igual aparezca antes, y una cita corta sin contexto que se repite no se adivina.
- El respaldo diario también se escribe tras editar una nota existente (respuesta, cierre, réplica) o borrar una anotación, no sólo tras crear.

## [0.2.2] - 2026-10-15

Revisión adversarial con agentes independientes (20 hallazgos confirmados) y sus correcciones.

### Corregido

- Lo anotado mientras la base todavía conectaba se guardaba sólo en el navegador y no llegaba a la base; ahora sube al conectar, con su autor, y la copia local se retira.
- El modo sólo lectura es un estado comprobado (no sólo CSS): muestra las notas como texto, deja únicamente copiar en la barra de selección y bloquea atajos, notas y borrados; una escritura rechazada por falta de permiso lo activa, y cualquier rechazo revierte la memoria para no dejar anotaciones fantasma.
- Un subrayado que ocupaba un bloque entero (sin contexto) o una cita larga y única se reubica en otro bloque tras una reconstrucción, en vez de darse por perdido.
- Las capas calculadas en Python llegan en unidades UTF-16, así que no se corren tras un emoji u otro carácter fuera del plano básico.
- Una selección que termina fuera de los bloques (triple clic en el último párrafo, arrastre hasta debajo del texto) se subraya y se copia recortada al bloque.
- Al enfocar otra ficha, el subrayado anterior pierde el contorno; la búsqueda ignora los marcadores del margen.
- La lectura en voz alta no toma por fallo la interrupción que provoca cancelar, cada lectura responde sólo a sus propios eventos, y cambiar de sección o pulsar Esc la detiene.
- El respaldo diario se escribe tras una escritura propia confirmada, troceado en documentos pequeños, con fecha local, y no insiste cuando la base no puede.
- «Qué cambió» alinea las versiones por huella con difflib: insertar o borrar un párrafo ya no marca como cambiados todos los siguientes.
- `exportar` ordena por bloque y no por desplazamiento, y las notas generales van siempre al grupo «General» (la página ya no les asigna sección).
- Archivos con BOM UTF-8 conservan su primer título; el texto de listas y tablas no lleva entidades HTML, así que su página se encuentra en el PDF.
- Teclado: «ir al texto» y «Deshacer borrado» son botones, los resultados de búsqueda y las marcas se alcanzan con Tab y responden a Enter, y el foco en un botón de ficha sobrevive al redibujo. En móvil, «ir al texto» cierra el panel; el menú de capas se cierra con Esc o con un clic fuera.

## [0.2.1] - 2026-10-15

### Corregido

- Pulsar un resultado de búsqueda que es una anotación abre su ficha aunque la pestaña o un filtro la escondieran.
- El enlace «Deshacer borrado» vive fuera del texto de estado, así que el eco de la base que confirma el borrado ya no se lo lleva antes de los ocho segundos.
- Copiar una selección quita los marcadores del margen por estructura (clon de la selección sin `.pg` ni `.marca-cambio`), nunca borrando palabras del manuscrito.
- Pulsar «Escuchar» en otra sección mientras suena una cambia la lectura en vez de sólo detenerla.
- Copiar varios ítems de una lista o varias celdas de una tabla conserva sus límites (salto de línea por ítem o fila, separador entre celdas).

## [0.2.0] - 2026-10-15

### Añadido

- Respuesta en cada ficha: `respuesta`, `cierre` (atendida, descartada, pregunta), `commit`, `respondido` y `replica`; filtros «con respuesta» y «preguntas»; `exportar` las incluye.
- Qué cambió: huella `h` por bloque, `bh` en cada subrayado, `anterior` con el texto previo cuando la salida anterior existe (`--anterior`, `--sin-anterior`), marca «cambió» al margen con diferencia palabra por palabra, y marca «cambió desde tu última lectura» por lector.
- Capas editoriales (`capas.py`): frases largas, muletillas, términos retirados, repeticiones cercanas y citas narrativas, en `m` por bloque; menú «Capas» con recuentos por sección; opciones `--sin-capas`, `--frase-larga`, `--muletillas`, `--terminos-retirados`.
- Lectores con identidad: `autor` por anotación (capacidad `user`), nombre resuelto al mostrar, selector de lector, modo sólo lectura cuando no se puede escribir.
- Progreso por parte, casilla «Leída», modo concentración y atajos de teclado (1–4, N, C, J/K, L, F, ?).
- Búsqueda en las notas, `#etiquetas` con filtro, deshacer un borrado, respaldo diario en la colección `respaldos`, lectura en voz alta, figuras ampliables, navegación por el hash de la URL.

### Cambiado

- `libro.json` pasa a `formato` 2.

## [0.1.0] - 2026-10-15

Primera versión, extraída del lector construido para el libro *Hechos, inferencias e incertidumbre* y generalizada para cualquier libro en Markdown.

### Añadido

- `lector-anotaciones construir`: fuentes Markdown (y PDF opcional) → `libro.json` con ids estables, `archivo:línea` y página impresa por bloque; validación de invariantes y modo `--estricto`.
- `lector-anotaciones exportar`: anotaciones JSON (copiadas de la página o volcadas de la colección) → Markdown de tareas por sección o por archivo de origen.
- `web/index.html`: página de lectura con destacados de cuatro colores con significado, notas por destacado, página, sección y generales, filtros, búsqueda, estado abierta/resuelta y copia JSON/Markdown; base compartida en claude.ai o respaldo local.
- Cada subrayado se comprueba contra el texto antes de pintarse y se reubica por la cita y el contexto si el libro cambió (o se declara no encontrado); cada anotación registra la versión del libro (`libro`).
- El panel conserva el editor activo, su borrador y el cursor cuando la base redibuja; el eco de un guardado propio no redibuja.
- Sin base compartida, las anotaciones guardadas bajo claves de versiones anteriores de la página (`claves_anteriores` en `libro.json`) se migran a la clave actual al cargar; la clave vieja sólo se retira cuando la copia nueva quedó escrita, y un fallo de escritura (almacenamiento lleno o bloqueado) se avisa en la barra de estado en vez de tragarse.
- «Copiar» en cada ficha (una anotación como texto con color, sección, página, `archivo:línea`, cita y nota) y «Copiar» en la barra de selección (un pasaje con su referencia), para pegar en un chat.
- Ejemplo completo, documentación de formatos y de publicación, pruebas (pytest y Playwright) e integración continua.
