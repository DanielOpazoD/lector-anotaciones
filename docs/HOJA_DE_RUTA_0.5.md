# Hoja de ruta 0.5

Lo que se hace, en qué orden, y cómo se sabe que quedó hecho. Se actualiza al cerrar cada etapa.

## Criterio

- **Etapas estructurales (E1–E6): ningún cambio visible.** Siguen verdes, sin tocarlas salvo para moverlas de archivo,
  las comprobaciones de navegador (254), las de la biblioteca (36), el núcleo (`node --test`) y `pytest`. Lo nuevo
  trae pruebas propias que fallan sin ello (se comprueba rompiendo el código donde el fallo ocurriría y revirtiendo).
- **Etapas de modelo y funcionales (E7–E8):** cada cambio con su prueba, que falla con la versión anterior.
- **Presupuesto:** hasta tres pasadas completas de las pruebas de navegador por etapa; una revisión independiente (dos
  revisores con papeles distintos) al cerrar lo estructural y otra al cerrar lo funcional.

## Decisiones

- **El empaquetado sigue en Python.** `lector-anotaciones pagina` arma `index.html` sin Node: quien instala con `pip`
  no necesita otra cosa. Los módulos ES con un empaquetador de JavaScript obligarían a tener Node para generar la
  página. La estructura se gana por otro lado: estado en un almacén, decisiones en el núcleo y fichas por id.

## Etapas

| | Etapa | Estado |
|---|---|---|
| E1 | Formato (Prettier) y CSS por capas (`@layer`) | hecho: estilos calculados iguales en 14 estados salvo dos casos revisados |
| E6 | Pruebas de navegador en archivos `.spec` de `@playwright/test`, en paralelo | hecho: 27 pruebas, las mismas 290 comprobaciones, ~40 s en vez de ~105 s |
| E2 | Sincronizador en el núcleo: decisiones de guardado puras, con base simulada en `node --test` | hecho: 11 pruebas de núcleo; 290 comprobaciones de navegador intactas |
| E3 | Almacén de estado de la vista con reglas y suscripciones | hecho: 8 variables globales menos, 3 pruebas de núcleo; la regla de la bandeja cubierta en núcleo y navegador |
| E4 | Fichas por id: el panel reutiliza las fichas que no cambiaron | hecho: redibujar 300 fichas sin cambios, de 64–115 ms a 2–4 ms; ficha() en cinco partes |
| E5 | Tipos: JSDoc y `tsc --checkJs` en la CI | hecho: 54 avisos resueltos; la API del núcleo, la anotación, la sincronía y la vista tipadas |
| E7 | Modelo: esquema versionado, ancla estable por bloque, hilo de la conversación | hecho: esquemas JSON con pruebas, ancla por huella, hilo en ficha, copia y exportación |
| E8 | `pendientes`/`responder`/`aplicar`, sugerencias, marcas en el teléfono, deshacer cambios | pendiente |
| E9 | Revisión independiente, documentación y publicación de la 0.5.0 | pendiente |
