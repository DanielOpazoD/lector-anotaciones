# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/); versiones según [SemVer](https://semver.org/lang/es/).

## [0.1.0] - 2026-10-15

Primera versión, extraída del lector construido para el libro *Hechos, inferencias e incertidumbre* y generalizada para cualquier libro en Markdown.

### Añadido

- `lector-anotaciones construir`: fuentes Markdown (y PDF opcional) → `libro.json` con ids estables, `archivo:línea` y página impresa por bloque; validación de invariantes y modo `--estricto`.
- `lector-anotaciones exportar`: anotaciones JSON (copiadas de la página o volcadas de la colección) → Markdown de tareas por sección o por archivo de origen.
- `web/index.html`: página de lectura con destacados de cuatro colores con significado, notas por destacado, página, sección y generales, filtros, búsqueda, estado abierta/resuelta y copia JSON/Markdown; base compartida en claude.ai o respaldo local.
- Cada subrayado se comprueba contra el texto antes de pintarse y se reubica por la cita y el contexto si el libro cambió (o se declara no encontrado); cada anotación registra la versión del libro (`libro`).
- El panel conserva el editor activo, su borrador y el cursor cuando la base redibuja; el eco de un guardado propio no redibuja.
- Sin base compartida, las anotaciones guardadas bajo claves de versiones anteriores de la página (`claves_anteriores` en `libro.json`) se migran a la clave actual al cargar; la clave vieja sólo se retira cuando la copia nueva quedó escrita, y un fallo de escritura (almacenamiento lleno o bloqueado) se avisa en la barra de estado en vez de tragarse.
- Ejemplo completo, documentación de formatos y de publicación, pruebas (pytest y Playwright) e integración continua.
