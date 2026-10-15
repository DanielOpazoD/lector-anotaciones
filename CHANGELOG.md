# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/); versiones según [SemVer](https://semver.org/lang/es/).

## [0.4.0] - 2026-10-15

### Añadido

- **Bandeja «Por revisar».** Una pestaña con las respuestas de quien edita llegadas después de la última revisión del autor (campo nuevo `revisado`), con cuenta en la pestaña y en el botón del panel, y aviso al abrir. Se resuelven con el teclado: A atendida (resuelta y revisada, y a la siguiente), R reabrir (con el cursor en la nota o en la réplica), V ver el cambio; contestar una pregunta también la revisa. Llegar a una respuesta cuyo pasaje cambió lleva a él con el antes y el después abiertos. Lo revisado sigue a la vista hasta salir de la pestaña.
- **Notas al margen (escritorio).** En la pestaña «Sección», cada ficha a la altura de su pasaje, sin encimarse (la activa manda y empuja a las demás), y acompañando al texto al desplazarlo; la activa queda siempre a la vista. «Al margen» lo apaga y se recuerda.
- **Fichas compactas.** En reposo la nota se lee como texto, sin marco ni botones, y la cita y la respuesta se recortan; al tocarla se activa con el cursor donde se tocó.
- **Recorrer las anotaciones.** `.` y `,` (o ‹ ›, con «n de N») pasan a la siguiente o a la anterior en el orden del libro, con los filtros puestos, cambiando de sección.
- «+ Nota» reúne las notas de sección, de página y generales.
- La exportación y «Copiar» señalan una respuesta atendida o descartada que el autor reabrió: «Reabierta por el autor tras la respuesta».

### Cambiado

- En un documento que la base ya tiene, la página escribe sólo los campos del lector (`update`), no el documento entero: una respuesta que quien edita escribió y todavía no llegó a la página no se pisa.

### Corregido

- En un párrafo con dos o más subrayados, el clic en cualquiera abría la ficha del último.
- Un clic que empieza en una ficha ya no la cierra si se suelta fuera de ella.

### Revisión independiente antes de publicar

- `revisado` guarda el `respondido` de la respuesta revisada, no la hora del navegador: con el reloj de quien responde adelantado, A ya no dejaba la respuesta en la bandeja, y con el reloj atrasado una respuesta nueva no se perdía.
- Sin identidad conocida sólo cuentan las anotaciones sin autor (A ya no resuelve las de otra lectora), y la cuenta y el aviso al conectar esperan a saber quién se es.
- A, R y V no actúan con la tecla mantenida ni con el panel oculto (concentración, panel cerrado).
- «Ver el cambio» de una cita que ya no está elige el bloque donde estaba según su contexto, no el primero que la contenía.
- `.` y `,` siguen desde donde estaba la anotación actual si un filtro la sacó de la lista, y llegar a una nota de página sin su página en el texto pasa a «Todas» sin quitar los filtros.
- «✓ Atendida» fuera de la bandeja deja la ficha donde está; lo revisado sale de la bandeja también al dejarla por la búsqueda o por un subrayado.
- Al margen: las fichas se recolocan cuando el texto cambia de tamaño, de letra o de fuente, o cuando crece la cabecera del panel; ninguna queda bajo la cabecera con el texto al principio; el artículo se alarga para alcanzar las fichas apiladas al final; con Tab, el control enfocado de una ficha más alta que la lista queda a la vista; las fichas no se reacomodan con el botón del puntero abajo (el cursor queda donde se tocó); la búsqueda desde «Sección» vuelve a ser una lista que se desplaza.
- Las acciones de una ficha en reposo siguen en el orden de Tab (también hacia atrás) y para los lectores de pantalla; lo revisado se marca sin atenuar el texto; el botón «Anotaciones» del teléfono dice qué cuenta su número.
- Notas de alto ajustado por lotes y cambio de ancho una vez por cuadro: con 300 fichas, redibujar baja de ~130–190 ms a ~80–160 ms y un redimensionado sin cambio de ancho de ~75–100 ms a nada.

## [0.3.0] - 2026-10-15

### Añadido

- **Biblioteca: otros libros, importados desde la página.** Markdown o texto (uno o varios capítulos, con sus imágenes), HTML, EPUB 2 y 3, Word `.docx` y `libro.json`. Vista previa con título y autor editables; se guardan en la biblioteca compartida de la página (colección `libros`, troceados en `libros/<id>/partes`) o sólo en el navegador (IndexedDB). Reemplazar un libro por una versión nueva conserva y reubica sus anotaciones. Cada libro se descarga como Markdown (para la línea de órdenes) o `libro.json`, y se puede borrar. Las anotaciones y respaldos de un libro importado van en `libros/<id>/…`. Una página sin `libro.json` abre la biblioteca e invita a importar. Ver `docs/IMPORTAR.md`.
- Salir de una ficha con un clic fuera (en el texto o en el fondo); Esc o Ctrl/Cmd+Enter en una nota la guarda y devuelve el foco al pasaje. Esc cierra de a una capa (menú, cajón, concentración, ficha).
- En pantalla estrecha, índice y panel con velo: tocar fuera o «×» los cierra, el foco entra y vuelve a donde estaba, y lo de detrás queda inerte. El panel es una hoja que sube desde abajo y deja ver el pasaje; tocar un subrayado la abre con su ficha. La barra se reduce a una fila; búsqueda y herramientas se despliegan con «⋯».
- Ajustes de lectura («Aa»): tamaño del texto, tema claro, oscuro o del sistema, y letra con o sin serifa; recordados en el navegador.
- Accesibilidad: estado como región `status`, pestañas con patrón `tablist` y flechas, filtros, colores y concentración con `aria-pressed`, sección actual con `aria-current`, «Saltar al texto», categoría escrita en cada ficha, atajos, figura ampliada y biblioteca como `<dialog>` modales (clic en el fondo cierra; la figura lleva su leyenda como texto alternativo), áreas táctiles de 40 px y barra de subrayado abajo en pantallas táctiles, alto contraste del sistema.
- «Deshacer borrado» como aviso flotante, a mano también con el panel abierto en el teléfono. Al borrar, el foco pasa a la ficha vecina.
- Panel más despejado: filtros y exportación en desplegables, con el filtro activo resumido; «Quitar filtros» cuando un filtro deja la lista vacía.
- Orden `lector-anotaciones pagina [--salida index.html] [--comprobar]` y opción `construir --pagina`.
- Correcciones de accesibilidad de la revisión independiente: concentración y panel, contraste del tema oscuro (texto sobre la tinta de 1,92:1 a 9,4:1), foco que no cae al cuerpo, diálogos que no se cierran con un clic en su relleno, barra táctil sin desborde, áreas de toque, región viva propia sólo para avisos, cambio de ancho con un cajón abierto, Esc por capas también desde un campo, títulos y leyendas que crecen con «Aa», y guardar la nota en edición al salir de la página.

### Cambiado

- La página se escribe en módulos (`src/lector_anotaciones/web/`: plantilla, estilos, núcleo puro y fragmentos de interfaz) y se empaqueta en el mismo `index.html` único y sin dependencias; la CI comprueba que esté al día. El núcleo (texto, diferencias, ubicar subrayados, borradores, Markdown, libros, ZIP, importadores) tiene pruebas con `node --test`, y el Markdown y las huellas, una prueba de paridad con el paquete Python.

### Seguridad

- Lo que no es el libro de la página (importado de un archivo, o leído de la biblioteca compartida, donde escribe cualquier colaborador) se reduce a texto, `<strong>` y `<em>` antes de mostrarse; las figuras sólo admiten rutas relativas a la página (ni de otro sitio, ni `//…`, ni con barras invertidas) o `data:image`; y un libro con ids de sección que no sean letras, dígitos, `-` o `_` se rechaza al importarlo y al abrirlo.

### Robustez de la biblioteca (revisión independiente antes de publicar)

- Las claves locales de un libro importado llevan su lugar (`lector-anotaciones:base:<id>`, `lector-anotaciones:local:<id>`), y la elección del libro abierto y los ajustes viven fuera de ese espacio: ningún libro pisa las notas de otro.
- Reemplazar un libro compartido es atómico: partes con versión y ficha que las nombra, comprobadas al leer; una subida que falla no deja partes sueltas ni mezcla versiones.
- Abrir otro libro espera también a los reintentos y deja en el navegador lo que la base no confirmó, para subirlo al volver.
- Antes de guardar en la biblioteca compartida se vuelve a comprobar el choque de títulos; si la lista no se puede leer, sólo se ofrece este navegador.
- Importadores: espacios entre bloques dentro de celdas, ítems y títulos; tablas anidadas sin texto repetido; marcos de una columna en Word; `numId 0` sin lista; aviso por imágenes omitidas dentro del texto; texto que no está en UTF-8 leído como windows-1252 (o el charset del HTML) con aviso.
- El Markdown de la página coincide con `markdown.py` también con espacios Unicode (`\x85`, `\x1c`), la marca de orden de bytes y dígitos de otras escrituras.
- Un aviso de arranque (el libro elegido no se pudo abrir) queda a la vista hasta cerrarlo; la elección sólo se olvida si el libro ya no existe; con localStorage bloqueado se usa sessionStorage o se dice que no se puede cambiar de libro.

## [0.2.12] - 2026-10-15

### Corregido

- «Deshacer borrado» devuelve también la lista de campos que el lector había cambiado y la base todavía no tenía. Antes, borrar y recuperar una anotación sin base compartida perdía esa lista, y al conectar un cambio de color o de estado hecho sin conexión no subía.

## [0.2.11] - 2026-10-15

### Corregido

- Escribir la lista de campos cambiados ya no reemplaza la lista guardada entera: sólo actualiza las anotaciones que se tocaron y conserva las de borradores aún no cargados (o de otra cuenta). Antes, anotar algo mientras la base conectaba borraba la lista de un borrador anterior, y al recuperarlo se subía también su réplica vieja encima de una más reciente de la base.
- Borrar una anotación sin base compartida retira también su entrada de la lista de campos.

## [0.2.10] - 2026-10-15

### Corregido

- La lista de campos que el lector cambió en un borrador se escribe junto con cada escritura de la copia local, también sin base compartida y también por `guardar` (color y estado): una réplica escrita sin conexión sobre un borrador recuperado ya no se pierde al volver a conectar.
- Las marcas de campos se retiran sólo cuando la base tiene ese valor (escritura confirmada, vuelta a la versión de la base, borrado), no al podar la copia local; lo que se siguió editando después conserva su marca, y la copia local no se suelta si hubo ediciones posteriores a la escritura confirmada.
- Un borrador sin lista de campos (anterior a 0.2.9) sólo aporta la nota y la réplica: el color y el estado los manda la base, para no pisar un estado compartido con una copia vieja.

## [0.2.9] - 2026-10-15

### Corregido

- Un borrador recuperado ya no pisa lo que otra sesión escribió entre tanto: la página recuerda qué campos cambió el lector (nota, réplica, color, estado), los guarda junto a la copia local (`<clave>:campos`) y al recargar funde sólo esos campos sobre la versión de la base; respuesta, cierre y demás vienen de la base. Lo mismo cuando un cambio externo llega mientras hay un borrador sin guardar: se muestra debajo sin pisarlo.

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
