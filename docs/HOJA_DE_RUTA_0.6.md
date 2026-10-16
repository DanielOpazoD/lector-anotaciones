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
| F2 | La página en módulos: cada fragmento en su ámbito; lo compartido por un espacio de nombres tipado y el estado por un objeto explícito; `50-panel.js` partido | pendiente |
| F3 | La ficha como función de (anotación, vista): la firma sale de la vista, no de una lista a mano | pendiente |
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
