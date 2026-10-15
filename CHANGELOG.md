# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/); versiones según [SemVer](https://semver.org/lang/es/).

## [0.2.8] - 2026-10-15

### Corregido

- Una nota o réplica que la base rechaza ya no se descarta: el borrador sigue en el cuadro (con el foco) y en memoria marcado «sin guardar», con copia en el navegador y reintento desde la ficha; un rechazo de permiso pasa además la página a sólo lectura y lo exportado lleva la señal. Sustituye el comportamiento de 0.2.7, que reponía el texto guardado en el cuadro y perdía lo escrito.
- Al recargar, una copia local más reciente que la versión de la base (un borrador que no subió) manda, se muestra y vuelve a subir.
- El chip «sólo lectura» quedaba visible aunque se pudiera escribir, porque la regla de `.chip` fijaba `display` por encima del atributo `hidden`.

## [0.2.7] - 2026-10-15

Segunda revisión adversarial con agentes independientes (20 hallazgos confirmados sobre 0.2.2; cuatro ya estaban cerrados en 0.2.3–0.2.6) y sus correcciones, cada rama revisada por un agente distinto antes de fusionarla.

### Corregido

Página:

- Un cambio de color o de estado rechazado por la base vuelve a lo que la base tiene: los botones de la ficha pasan una copia con el cambio y `guardar` toma la versión previa del objeto intacto.
- Las ediciones de nota y réplica siguen la misma política que `guardar`: si la base rechaza, la memoria vuelve a la versión guardada (y la página pasa a sólo lectura si el rechazo es de permiso); si el cuadro sigue enfocado, repone el texto guardado y la barra lo dice.
- Un rechazo transitorio de la base (`unavailable`, `resource_exhausted` o un código desconocido) se reintenta una vez tras un retardo aleatorio corto.
- Una anotación que la base no tiene (nueva, o un «Deshacer borrado» con el borrado ya confirmado) nunca se pierde, sea cual sea el rechazo: sigue a la vista marcada «sin guardar», con copia en el navegador; la ficha ofrece reintentar, y ante un rechazo de permiso la página pasa a sólo lectura y la barra dice que se puede copiar.
- Las clausuras de la ficha leen la anotación viva: «Copiar», cambiar el color o el estado tras escribir una nota llevan la nota recién escrita.
- En sólo lectura, lo recuperado del navegador y lo anotado antes de saberlo queda marcado «sin guardar (sólo lectura)», con copia local y aviso, en vez de mostrarse como si estuviera en la base. «Copiar» en la ficha, «Copiar todo (Markdown)» y «Copiar todo (JSON)» señalan lo que la base no tiene (texto «sin guardar en la base (código)»; campo `sin_guardar` sólo en el JSON exportado, documentado en FORMATO_ANOTACIONES.md).
- El respaldo diario mide cada parte en bytes del documento ya envuelto (TextEncoder) con tope de 180 KiB; una anotación que no cabe ni sola queda fuera y el índice la cuenta en `omitidas`.
- Copiar una selección toma el texto sólo de los bloques visibles entre sus extremos, no de las secciones ocultas que siguen en el DOM; la barra de selección queda siempre dentro de la ventana.
- Teclado: el foco en un botón de ficha sobrevive al redibujo (identificado por acción y color); Enter o Espacio en una marca y Enter en un resultado dejan el foco en la ficha; «Borrar» enfoca «Sí» y «No» devuelve el foco a «Borrar». En pantalla estrecha, índice y panel cerrados quedan inertes y sus botones exponen `aria-expanded`/`aria-controls`.
- Sólo lectura: chip persistente en la cabecera y sufijo en todo mensaje de estado (el eco «Conectado · N» ya no lo pisa), barra de selección «Copiar la selección», ayuda sin los atajos de anotar, números de página visibles pero sin acción y el «p.» del panel oculto entero.
- En móvil, el marcador «cambió» entra en el flujo como el número de página, con área táctil de 32 px.
- Un borrado rechazado sólo retira el enlace de deshacer si es el suyo.

Paquete:

- «Qué cambió»: dentro de cada tramo que difiere, los bloques viejos y nuevos se emparejan por semejanza de texto (al menos la mitad de las palabras en común, en orden) y no por posición, así que una inserción o un borrado pegado a una modificación ya no cruza los textos anteriores; lo que queda suelto en la sección se vuelve a emparejar. Un bloque nuevo sin pareja es una inserción y no lleva «anterior»; si en un tramo cambió exactamente un bloque por otro, se emparejan aunque no se parezcan. Dos o más párrafos adyacentes reescritos en más de la mitad de sus palabras ya no llevan «anterior» (la marca por huella «cambió desde tu última lectura» no cambia).
- La semejanza se mide por palabras y sólo entre bloques a pocas posiciones unos de otros (con un segundo intento sin ventana para lo que queda suelto): una edición global de un capítulo entero se empareja en décimas de segundo.
- Capas editoriales en listas, tablas y portada: las frases largas y las citas narrativas se calculan ítem por ítem (o celda por celda), así que doce ítems cortos ya no son una «frase larga»; las muletillas, los términos retirados y las repeticiones se buscan sobre los ítems unidos por un espacio, de modo que una palabra repetida entre dos ítems o celdas sí se señala, y un rango que cruzaría de un ítem al siguiente se recorta al final del suyo.
- El texto con que se busca la página de una lista numerada lleva los números que imprime el PDF, renumerados en secuencia desde el primero («1.» en todos los ítems → 1, 2, 3), así que una lista de ítems cortos al inicio de página ya no hereda la página anterior.
- `exportar` ordena dentro de cada sección por bloque y desplazamiento, como la página; la página de la anotación sólo ordena entre sí a las notas de página.
- `anotaciones.json`, `--libro` y la salida anterior se leen con BOM UTF-8; `construir` avisa por stderr cuando la salida anterior existe pero no se pudo leer o no es un libro, en vez de informar «0 bloques cambiados» en silencio.
- Integración continua: el ejemplo se construye con un PDF mínimo generado en el propio trabajo (`tests/pdf_minimo.py`, sin dependencias) y se comprueba que hay bloques con página; las pruebas que leen un PDF real corren con poppler, con un fixture `tests/fixtures/libro_min.pdf` regenerable byte a byte.
- Prueba de humo: 155 comprobaciones con plazos cortos y nombre en cada fallo; pytest: 79 pruebas.

### Pendiente (señalado por los revisores, para la próxima ronda)

- La subida en lote de pendientes al conectar no activa sólo lectura ante `not_granted`/`revoked` (lo hace la primera escritura posterior).
- «Conectado · N anotaciones» y el contador del panel cuentan también las anotaciones «sin guardar».
- `exportar` (CLI) ignora el campo `sin_guardar` del JSON exportado por la página.
- Una muletilla o un término retirado de varias palabras que sólo existe al unir dos ítems o celdas se señala recortado a la primera parte.
- El borrado no reintenta un rechazo transitorio.

## [0.2.6] - 2026-10-15

### Corregido

- La copia local de una anotación borrada sólo se retira cuando la base confirma el borrado (o no tenía nada que borrar). Si la base lo rechaza, la anotación vuelve a la memoria, la copia local la sigue teniendo y no se ofrece deshacer un borrado que no ocurrió.

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
