# Hoja de ruta 0.6

Calidad técnica del código: medir antes de reorganizar, y reorganizar donde las revisiones de la 0.5 encontraron los
fallos (el estado repartido de la página y las fichas reutilizadas con una firma a mano). Se actualiza al cerrar cada
etapa.

## Criterio

- **Nada visible cambia en F2–F6**, salvo lo que se diga en la etapa: siguen verdes, sin tocarlas salvo para moverlas,
  las pruebas de navegador, del núcleo y de Python. Lo nuevo trae su prueba, que falla sin ello (se comprueba
  rompiendo el código donde el fallo ocurriría y revirtiendo).
- **La cobertura es un detector, no un objetivo.** Los pisos salen de una medición real y sólo avisan de una caída; las
  líneas que no se pueden alcanzar no se persiguen.
- **Presupuesto:** hasta tres pasadas completas de las pruebas de navegador por etapa (una con cobertura); una revisión
  independiente con dos revisores de papeles distintos al final.

## Etapas

| | Etapa | Estado |
|---|---|---|
| F1 | Medir la cobertura: Python, núcleo (`node --test`) y página (V8 en Playwright, por fragmento); pisos en la CI | hecho |
| F2 | La página en módulos: cada fragmento en su ámbito; lo compartido por un espacio de nombres tipado y el estado por un objeto explícito; `50-panel.js` partido | hecho |
| F3 | La ficha como función de (anotación, vista): la firma sale de la vista, no de una lista a mano | hecho |
| F4 | Pruebas de navegador cortas, con preparaciones compartidas | pendiente |
| F5 | Tipos: `libro.json` tipado, sin `any`, `noImplicitAny` en el núcleo; mypy para Python | pendiente |
| F6 | Menores: una función por orden en `cli.py`; los errores silenciados, a un diagnóstico copiable | pendiente |
| F7 | Revisión independiente, documentación y publicación de la 0.6.0 | pendiente |

## F1 · Lo que midió la cobertura

| | líneas | piso |
|---|---|---|
| Python (`pytest --cov`, con ramas) | 96,8 % | 95 % |
| Núcleo con `node --test` | 66,5 % (ramas 84,5 %, funciones 86,4 %) | 65 / 83 / 85 % |
| Página en el navegador (núcleo y página) | 91,6 % → 93,2 % con las pruebas nuevas | 92 % |

El núcleo bajo `node --test` tiene un 26 % en los importadores (`80-importar.js`), que se prueban en el navegador
(90,7 % ahí). Lo que ninguna prueba ejecutaba y ahora sí: importar HTML y texto plano, borrar un libro de la biblioteca
compartida, J/K y ‹ › entre secciones, abrir un resultado de la búsqueda, la copia en Markdown de las notas de sección
y generales, el aviso de «Deshacer» que se va a los ocho segundos y una selección que empieza en el título. Esa última
encontró un defecto: con la selección empezando en el título la barra subrayaba pero los atajos (1–4, N, P, C) no; ahora
siguen la misma regla. Queda sin alcanzar, a propósito, el intercambio de extremos de `crearSubrayado` (un rango del
navegador siempre va en orden) y los errores de IndexedDB.

## F2 · Los módulos

`50-panel.js` (1.195 líneas) se partió en `50-panel.js` (la lista), `52-ficha.js` (la ficha) y `54-revisar.js` (revisar y
recorrer), con la página empaquetada idéntica byte a byte. Después, una conversión automática con el servicio de
lenguaje de TypeScript (que resuelve cada referencia, sin expresiones regulares) puso cada fragmento en su propio
ámbito: de 278 declaraciones de nivel superior, 129 quedaron privadas, 127 se ofrecen en `P` y 22 —las que varios
fragmentos comparten y reasignan: el libro, la base, el modo, quién lee, sólo lectura…— viven en `E`. Ningún fragmento
usaba al cargar algo de uno posterior, así que el orden no cambió. `herramientas/modulos.mjs` genera los tipos de `P` y
`E` (151 miembros, 20 sin tipo) y `docs/MODULOS.md`. Comprobado: una errata en `P.x`, usar algo privado de otro
fragmento y una oferta que falta hacen fallar los tipos o la comprobación; las 63 pruebas de navegador pasan.

## F3 · La ficha como función de (anotación, vista)

Antes, la ficha leía el estado en cinco funciones (activa, por revisar, revisada, sin guardar, dónde quedó, si su pasaje
cambió, sólo lectura, quién lee, los perfiles, la propuesta abierta) y la firma con que se reutilizaba el nodo era una
lista escrita a mano que tenía que coincidir con esas lecturas: las fichas que la 0.5 encontró viejas salían de ahí.
Ahora `vistaDeFicha` (50-panel.js) reúne todo eso en un objeto congelado, la firma es su JSON y `ficha(a, vista)` no lee
nada más; `vistaEnSitio` es el único camino para cambiar una ficha sin redibujarla (activarla, dejarla, abrir el cuadro
de la propuesta), y lo pasajero que no está en la vista («¿Borrar?») la olvida con `olvidarFicha`. `herramientas/modulos.mjs`
comprueba que lo que corre al dibujar en `52-ficha.js` (incluidas las funciones que pasa a `forEach` o guarda y llama)
sólo use la anotación, la vista y ayudantes puros; los manejadores de eventos y las acciones sí leen el estado. La
comprobación cae con cada una de siete violaciones inyectadas (leer `P.V`, `E.SOLO_LECTURA` o `P.anots` al dibujar,
dentro de una función guardada o de un `forEach`, llamar a una acción, leer `document.activeElement`, una variable del
módulo) y no con dos lecturas legítimas dentro de manejadores. De paso, las etiquetas de la nota se dibujan con una
función pura y los selectores de lector y etiqueta se rehacen una vez por redibujo, no una por ficha. Prueba nueva: una
ficha activa, dejada o con la propuesta abierta no se rehace en un redibujo, y la rehecha vuelve con el cuadro abierto;
cae al quitar cualquiera de las cuatro llamadas a `vistaEnSitio`, y las pruebas existentes caen al vaciar `perfil`,
`sinGuardar` o `revisada` de la vista. Las 64 pruebas de navegador pasan.
