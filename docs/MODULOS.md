# Los módulos de la página

Generado por `herramientas/modulos.mjs` (`npm run modulos`); la CI comprueba que esté al día.

Cada fragmento de `src/lector_anotaciones/web/pagina/` es un módulo: `(function (P, E) { … })(LAPagina, LAEstado)`.
Lo que declara es privado; lo que otro fragmento necesita lo ofrece en `P` (funciones y valores que no cambian), y
el estado que varios comparten y reasignan vive en `E`. Los tipos de ambos están en `tipos/pagina.d.ts`, así que
usar algo que nadie ofrece es un error de `npm run tipos`.

En total: 127 cosas ofrecidas y 22 de estado compartido.

## Estado compartido (`E`)

| nombre | se declara en | lo usan |
|---|---|---|
| `avisoRevisar` | 00-base.js | 00-base.js, 90-arranque.js |
| `CAPAS_ON` | 00-base.js | 00-base.js, 45-pintar.js, 82-capas.js, 90-arranque.js |
| `col` | 00-base.js | 00-base.js, 20-guardado.js, 52-ficha.js, 90-arranque.js |
| `db` | 00-base.js | 00-base.js, 86-deshacer-respaldo.js, 90-arranque.js |
| `ESCRIBIENDO` | 00-base.js | 00-base.js, 88-biblioteca.js |
| `FUENTE` | 88-biblioteca.js | 88-biblioteca.js, 90-arranque.js |
| `lectura` | 00-base.js | 00-base.js, 10-libro.js, 70-interfaz.js, 84-progreso-voz.js |
| `LEIDAS` | 00-base.js | 00-base.js, 84-progreso-voz.js, 90-arranque.js |
| `LIBRO` | 00-base.js | 00-base.js, 20-guardado.js, 30-crear.js, 45-pintar.js, 60-exportar.js, 70-interfaz.js, 80-cambios.js, 82-capas.js, 86-deshacer-respaldo.js, 88-biblioteca.js, 90-arranque.js |
| `LOCAL_KEY` | 00-base.js | 00-base.js, 10-libro.js, 20-guardado.js, 70-interfaz.js, 80-cambios.js, 82-capas.js, 84-progreso-voz.js, 86-deshacer-respaldo.js, 90-arranque.js |
| `ME` | 00-base.js | 00-base.js, 30-crear.js, 50-panel.js, 52-ficha.js, 75-lectores.js, 88-biblioteca.js, 90-arranque.js |
| `modo` | 00-base.js | 00-base.js, 20-guardado.js, 52-ficha.js, 90-arranque.js |
| `punteroAbajo` | 55-margen.js | 52-ficha.js, 55-margen.js |
| `respaldoBloqueado` | 00-base.js | 00-base.js, 86-deshacer-respaldo.js |
| `respaldoHoy` | 00-base.js | 00-base.js, 86-deshacer-respaldo.js |
| `SECS` | 00-base.js | 00-base.js, 10-libro.js, 40-ubicar.js, 50-panel.js, 54-revisar.js, 65-buscar.js, 82-capas.js, 84-progreso-voz.js, 90-arranque.js |
| `SOLO_LECTURA` | 00-base.js | 00-base.js, 20-guardado.js, 30-crear.js, 50-panel.js, 52-ficha.js, 54-revisar.js, 70-interfaz.js, 86-deshacer-respaldo.js, 88-biblioteca.js, 90-arranque.js |
| `UBIC` | 40-ubicar.js | 20-guardado.js, 40-ubicar.js, 45-pintar.js, 50-panel.js, 52-ficha.js, 54-revisar.js, 60-exportar.js |
| `ultimoBorrado` | 00-base.js | 00-base.js, 86-deshacer-respaldo.js |
| `USER` | 00-base.js | 00-base.js, 75-lectores.js, 90-arranque.js |
| `VISTO` | 00-base.js | 00-base.js, 80-cambios.js, 90-arranque.js |
| `volverA` | 70-interfaz.js | 65-buscar.js, 70-interfaz.js |

## Fragmentos

### 00-base.js

Ofrece: `$`, `$$`, `ahora`, `anots`, `anunciar`, `BLOQUE_SEC`, `BLOQUES`, `bytesJSON`, `el`, `enCurso`, `estado`, `lsGet`, `lsSet`, `N`, `ORIG`, `PERFILES`, `PERFILES_PEDIDOS`, `POS_BLOQUE`, `RESPALDO_MAX`, `SEC_BY_ID`, `SINC`, `uid`, `V`, `VISTA`.

No usa nada de otros fragmentos.

### 10-libro.js

Ofrece: `irA`, `mover`, `renderLibro`.

Usa:

- de 00-base.js: `$`, `$$`, `BLOQUE_SEC`, `BLOQUES`, `el`, `lsSet`, `ORIG`, `POS_BLOQUE`, `SEC_BY_ID`, `V`, `VISTA`
- de 30-crear.js: `notaPagina`
- de 50-panel.js: `renderPanel`
- de 70-interfaz.js: `lateral`
- de 80-cambios.js: `marcarCambio`, `registrarVisto`
- de 84-progreso-voz.js: `detenerLectura`, `herramientasSeccion`

### 20-guardado.js

Ofrece: `activarSoloLectura`, `borrar`, `cargarLocal`, `escribirCampos`, `escribirEnBase`, `guardar`, `guardarLocal`, `podarLocal`, `reintentar`.

Usa:

- de 00-base.js: `$`, `$$`, `ahora`, `anots`, `enCurso`, `estado`, `lsGet`, `lsSet`, `N`, `SINC`
- de 40-ubicar.js: `ubicar`
- de 45-pintar.js: `marcasPagina`, `pintar`, `pintarPid`
- de 50-panel.js: `renderPanel`
- de 54-revisar.js: `renderCuentas`
- de 70-interfaz.js: `ocultarTb`
- de 80-cambios.js: `lsJSON`
- de 86-deshacer-respaldo.js: `ofrecerDeshacer`, `respaldar`, `retirarDeshacer`

### 30-crear.js

Ofrece: `ancestroPid`, `crearSubrayado`, `extremosDeRango`, `notaGeneral`, `notaPagina`, `notaSeccion`.

Usa:

- de 00-base.js: `$$`, `ahora`, `anots`, `BLOQUES`, `SEC_BY_ID`, `uid`, `V`
- de 20-guardado.js: `guardar`
- de 45-pintar.js: `esMarcador`
- de 54-revisar.js: `enfocar`
- de 70-interfaz.js: `ocultarTb`

### 40-ubicar.js

Ofrece: `pidEfectivo`, `reubicarTodo`, `textoPlano`, `ubicar`.

Usa:

- de 00-base.js: `anots`, `BLOQUE_SEC`, `el`, `N`, `ORIG`, `SEC_BY_ID`

### 45-pintar.js

Ofrece: `esMarcador`, `marcasPagina`, `pintar`, `pintarPid`, `pintarTodo`, `refrescarMarcas`.

Usa:

- de 00-base.js: `$`, `$$`, `anots`, `BLOQUES`, `el`, `ORIG`, `V`
- de 40-ubicar.js: `pidEfectivo`, `reubicarTodo`
- de 50-panel.js: `porRevisar`
- de 54-revisar.js: `enfocar`

### 50-panel.js

Ofrece: `activar`, `ajustarAlto`, `ajustarTextareas`, `avanzarFicha`, `cambiarTab`, `cuantasPorRevisar`, `etiqueta`, `FICHAS`, `lista`, `listaNavegable`, `ordenKey`, `porRevisar`, `PROPUESTA_ABIERTA`, `refirmarFoco`, `renderCuentaRevisar`, `renderPanel`.

Usa:

- de 00-base.js: `$`, `$$`, `anots`, `BLOQUE_SEC`, `BLOQUES`, `el`, `N`, `PERFILES`, `POS_BLOQUE`, `SEC_BY_ID`, `SINC`, `V`, `VISTA`
- de 40-ubicar.js: `pidEfectivo`
- de 45-pintar.js: `refrescarMarcas`
- de 52-ficha.js: `ficha`
- de 54-revisar.js: `actualizarNav`, `cambioDe`, `navegar`
- de 55-margen.js: `colocarMargen`, `margenActivo`, `reacomodarPorActivar`, `soltarMargen`
- de 70-interfaz.js: `marcarFiltro`, `quitarFiltros`
- de 75-lectores.js: `etiquetasDe`, `renderSelectores`, `resolverPerfiles`, `variosAutores`

### 52-ficha.js

Ofrece: `abrirPropuesta`, `ficha`.

Usa:

- de 00-base.js: `$`, `ahora`, `anots`, `BLOQUES`, `el`, `N`, `SINC`, `V`, `VISTA`
- de 20-guardado.js: `borrar`, `escribirEnBase`, `guardar`, `guardarLocal`, `reintentar`
- de 40-ubicar.js: `pidEfectivo`
- de 50-panel.js: `activar`, `ajustarAlto`, `avanzarFicha`, `etiqueta`, `FICHAS`, `porRevisar`, `PROPUESTA_ABIERTA`, `renderCuentaRevisar`
- de 54-revisar.js: `cambioDe`, `irAAnot`, `revisar`, `verCambio`
- de 55-margen.js: `colocarMargenPronto`
- de 60-exportar.js: `copiar`, `textoAnotacion`
- de 70-interfaz.js: `volverAlTexto`
- de 75-lectores.js: `chipAutor`, `pintarEtiquetas`, `variosAutores`
- de 80-cambios.js: `diffPalabras`
- de 86-deshacer-respaldo.js: `ofrecerDeshacerCambio`

### 54-revisar.js

Ofrece: `actualizarNav`, `cambioDe`, `enfocar`, `irAAnot`, `navegar`, `renderCuentas`, `revisar`, `verCambio`.

Usa:

- de 00-base.js: `$`, `$$`, `ahora`, `anots`, `anunciar`, `BLOQUE_SEC`, `BLOQUES`, `el`, `N`, `SEC_BY_ID`, `V`, `VISTA`
- de 10-libro.js: `irA`
- de 20-guardado.js: `guardar`
- de 40-ubicar.js: `pidEfectivo`
- de 45-pintar.js: `pintarPid`
- de 50-panel.js: `activar`, `cambiarTab`, `lista`, `listaNavegable`, `ordenKey`, `porRevisar`, `renderCuentaRevisar`, `renderPanel`
- de 55-margen.js: `asegurarVisibleMargen`, `margenActivo`
- de 70-interfaz.js: `alternarFoco`, `enfocable`, `lateral`, `mqMovil`, `quitarFiltros`
- de 80-cambios.js: `alternarDiff`
- de 86-deshacer-respaldo.js: `ofrecerDeshacerCambio`

### 55-margen.js

Ofrece: `asegurarVisibleMargen`, `colocarMargen`, `colocarMargenPronto`, `margenActivo`, `reacomodarPorActivar`, `soltarMargen`.

Usa:

- de 00-base.js: `$`, `$$`, `anots`, `lsGet`, `lsSet`, `N`, `V`, `VISTA`
- de 40-ubicar.js: `pidEfectivo`
- de 50-panel.js: `ajustarTextareas`, `renderPanel`
- de 54-revisar.js: `cambioDe`
- de 70-interfaz.js: `mqMovil`

### 60-exportar.js

Ofrece: `copiar`, `copiarSeleccion`, `exportarJSON`, `exportarMD`, `textoAnotacion`.

Usa:

- de 00-base.js: `$`, `ahora`, `anots`, `BLOQUE_SEC`, `el`, `estado`, `N`, `SEC_BY_ID`, `SINC`
- de 30-crear.js: `extremosDeRango`
- de 50-panel.js: `ordenKey`

### 65-buscar.js

Ofrece: `buscar`.

Usa:

- de 00-base.js: `$`, `anots`, `el`, `N`
- de 10-libro.js: `irA`
- de 40-ubicar.js: `textoPlano`
- de 50-panel.js: `cambiarTab`, `etiqueta`, `ordenKey`
- de 54-revisar.js: `irAAnot`
- de 55-margen.js: `soltarMargen`
- de 70-interfaz.js: `cerrarHerramientas`, `lateral`, `mqMovil`

### 70-interfaz.js

Ofrece: `abrirDialogo`, `alternarFoco`, `cerrarDialogo`, `cerrarHerramientas`, `enfocable`, `lateral`, `marcarFiltro`, `mqMovil`, `ocultarTb`, `quitarFiltros`, `volverAlTexto`.

Usa:

- de 00-base.js: `$`, `$$`, `anots`, `lsSet`, `SEC_BY_ID`, `V`, `VISTA`
- de 10-libro.js: `irA`, `mover`
- de 30-crear.js: `ancestroPid`, `crearSubrayado`, `extremosDeRango`, `notaGeneral`, `notaPagina`, `notaSeccion`
- de 50-panel.js: `ajustarTextareas`, `cambiarTab`, `porRevisar`, `refirmarFoco`, `renderPanel`
- de 52-ficha.js: `abrirPropuesta`
- de 54-revisar.js: `actualizarNav`, `navegar`, `revisar`, `verCambio`
- de 55-margen.js: `colocarMargenPronto`
- de 60-exportar.js: `copiar`, `copiarSeleccion`, `exportarJSON`, `exportarMD`
- de 65-buscar.js: `buscar`
- de 84-progreso-voz.js: `alternarLeida`, `detenerLectura`

### 72-ajustes.js

No ofrece nada.

Usa:

- de 00-base.js: `$`, `$$`, `lsGet`, `lsSet`

### 75-lectores.js

Ofrece: `chipAutor`, `etiquetasDe`, `pintarEtiquetas`, `renderSelectores`, `resolverPerfiles`, `variosAutores`.

Usa:

- de 00-base.js: `$`, `anots`, `el`, `N`, `PERFILES`, `PERFILES_PEDIDOS`, `V`, `VISTA`
- de 50-panel.js: `renderPanel`

### 80-cambios.js

Ofrece: `alternarDiff`, `diffPalabras`, `lsJSON`, `marcarCambio`, `registrarVisto`.

Usa:

- de 00-base.js: `$`, `BLOQUES`, `el`, `lsGet`, `lsSet`, `N`, `SEC_BY_ID`
- de 40-ubicar.js: `textoPlano`
- de 55-margen.js: `colocarMargenPronto`

### 82-capas.js

Ofrece: `renderCapasMenu`.

Usa:

- de 00-base.js: `$`, `el`, `lsSet`
- de 45-pintar.js: `pintarTodo`

### 84-progreso-voz.js

Ofrece: `alternarLeida`, `detenerLectura`, `herramientasSeccion`, `renderProgreso`.

Usa:

- de 00-base.js: `$`, `$$`, `el`, `estado`, `lsSet`, `SEC_BY_ID`
- de 40-ubicar.js: `textoPlano`

### 86-deshacer-respaldo.js

Ofrece: `ofrecerDeshacer`, `ofrecerDeshacerCambio`, `respaldar`, `retirarDeshacer`.

Usa:

- de 00-base.js: `$`, `anots`, `anunciar`, `bytesJSON`, `el`, `enCurso`, `estado`, `lsGet`, `lsSet`, `RESPALDO_MAX`, `SINC`
- de 20-guardado.js: `guardar`
- de 54-revisar.js: `enfocar`
- de 70-interfaz.js: `enfocable`
- de 88-biblioteca.js: `rutaBase`

### 88-biblioteca.js

Ofrece: `claveLocalDe`, `mostrarSinLibro`, `obtenerLibro`, `rutaBase`, `usoDb`, `usoUser`.

Usa:

- de 00-base.js: `$`, `$$`, `ahora`, `anots`, `bytesJSON`, `el`, `enCurso`, `estado`, `lsGet`, `lsSet`, `N`, `SINC`
- de 20-guardado.js: `guardarLocal`
- de 70-interfaz.js: `abrirDialogo`, `cerrarDialogo`

### 90-arranque.js

No ofrece nada.

Usa:

- de 00-base.js: `$`, `anots`, `anunciar`, `estado`, `lsGet`, `SEC_BY_ID`, `SINC`
- de 10-libro.js: `irA`, `renderLibro`
- de 20-guardado.js: `activarSoloLectura`, `cargarLocal`, `escribirCampos`, `guardarLocal`, `podarLocal`
- de 45-pintar.js: `pintarTodo`
- de 50-panel.js: `cuantasPorRevisar`, `renderPanel`
- de 54-revisar.js: `renderCuentas`
- de 70-interfaz.js: `alternarFoco`
- de 80-cambios.js: `lsJSON`
- de 82-capas.js: `renderCapasMenu`
- de 84-progreso-voz.js: `renderProgreso`
- de 86-deshacer-respaldo.js: `respaldar`, `retirarDeshacer`
- de 88-biblioteca.js: `claveLocalDe`, `mostrarSinLibro`, `obtenerLibro`, `rutaBase`, `usoDb`, `usoUser`
