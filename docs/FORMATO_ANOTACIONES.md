# Formato de las anotaciones

Una anotación es un documento JSON. La página las guarda una a una en la colección `anotaciones` de la base compartida (cuando está publicada en claude.ai) o todas juntas en `localStorage` bajo la clave `lector-anotaciones:<id del libro>`. El botón «Copiar todo (JSON)» produce `{"libro": …, "generado": …, "exportado": …, "anotaciones": [ … ]}`.

```json
{
  "id": "am2x1k9abc3",
  "tipo": "subrayado",
  "sid": "cap-01",
  "sidTitulo": "Capítulo 1. Hechos y observaciones",
  "pid": "cap-01-b1",
  "src": "00_preliminares.md:23",
  "pagina": 3,
  "inicio": 12,
  "fin": 58,
  "cita": "no lo que se concluyó de la observación",
  "antes": "Un hecho es lo que se observó, ",
  "despues": ". La diferencia parece obvia",
  "color": "cortar",
  "nota": "Lo mismo se dice dos párrafos después.",
  "estado": "abierta",
  "creado": "2026-10-15T14:02:11.000Z",
  "editado": "2026-10-15T14:03:40.000Z",
  "libro": "2026-10-15",
  "bh": "3f2a9c1d0b7e",
  "autor": "u_0123456789abcdefghijkl",
  "respuesta": "Reescrito en el commit indicado: la frase ahora separa el vómito referido de la aspiración no presenciada.",
  "cierre": "atendida",
  "commit": "9f1e2d3",
  "respondido": "2026-10-16T09:10:00.000Z",
  "replica": ""
}
```

## Campos

| Campo | Tipos | Significado |
|---|---|---|
| `id` | todos | Identificador único generado por la página. |
| `tipo` | todos | `subrayado`, `pagina`, `capitulo` (nota de sección) o `general`. |
| `sid`, `sidTitulo` | todos salvo `general` | Sección en que se hizo. |
| `pid` | subrayado | Id del bloque subrayado. |
| `src` | subrayado | `archivo.md:línea` del bloque, copiado de `libro.json`. |
| `pagina` | subrayado, pagina | Página impresa. |
| `inicio`, `fin` | subrayado | Desplazamientos en caracteres dentro del texto plano del bloque. |
| `cita` | subrayado | El texto exacto seleccionado. |
| `antes`, `despues` | subrayado | Hasta 40 caracteres de contexto a cada lado, para reubicar la cita si el bloque cambió. |
| `color` | subrayado | `revisar`, `cortar`, `duda` o `conservar` (ver abajo). |
| `grupo` | subrayado | Presente cuando una selección abarcó varios bloques: todos los trozos comparten el mismo valor. |
| `nota` | todos | Texto libre; en los subrayados es opcional. |
| `estado` | todos | `abierta` o `resuelta`. |
| `creado`, `editado` | todos | ISO 8601. |
| `libro` | todos | Valor de `generado` del `libro.json` con que se hizo la anotación. |
| `bh` | subrayado | Huella `h` del bloque en el momento de anotar; si difiere de la actual, la ficha avisa que el bloque cambió. |
| `autor` | todos | Id opaco de quien anotó (capacidad `user`), o `null` sin identidad. Nunca se guarda el nombre: la página lo resuelve al mostrar. |
| `respuesta` | todos | Texto de quien edita las fuentes (Claude o una persona) sobre qué hizo con la anotación. |
| `cierre` | todos | `atendida` (se aplicó), `descartada` (no se aplicó, con el motivo en `respuesta`) o `pregunta` (hace falta una decisión del autor). |
| `commit` | todos | Identificador del commit que aplicó el cambio, si lo hubo. |
| `respondido` | todos | ISO 8601 de la respuesta. |
| `replica` | todos | La respuesta del autor a una `pregunta`; la escribe en la ficha. |

## Los cuatro colores

Cada color es una instrucción, no un adorno:

| Color | Significa |
|---|---|
| `revisar` (ámbar) | Reescribir o revisar el pasaje. |
| `cortar` (rojo) | Quitarlo. |
| `duda` (violeta) | Verificar un dato, una cita o una afirmación. |
| `conservar` (verde) | Está bien así; no tocarlo. |

## Qué pasa cuando el libro cambia

Los ids de bloque son posicionales (`cap-01-b7` es el séptimo bloque del capítulo 1). Si se inserta un párrafo y se reconstruye `libro.json`, los ids posteriores de esa sección cambian, y una anotación guardada apuntaría al bloque equivocado. Por eso la página nunca pinta un subrayado sin comprobarlo:

1. Si `cita` sigue exactamente en `pid` entre `inicio` y `fin`, se pinta tal cual.
2. Si no, se busca `cita` en ese bloque (desambiguando con `antes` y `despues`), luego en los bloques de la misma sección y luego en todo el libro; fuera del bloque original se exige que coincida al menos un lado del contexto. Si aparece, se pinta ahí y la ficha dice «Reubicado».
3. Si no aparece, no se pinta nada y la ficha dice «No encontrado en esta versión del libro», con la cita a la vista.

Nada de esto modifica la anotación guardada: `pid`, `inicio` y `fin` siguen siendo los originales, y `libro` dice con qué versión se hicieron. Quien vuelque las anotaciones a las fuentes debe aplicar la misma regla: localizar por `cita` y contexto, y usar `pid` y `src` como pista, no como verdad.

## Cómo responde quien edita

Cada anotación es una conversación corta. Quien vuelque la anotación a las fuentes (Claude desde la sesión de trabajo, con `ArtifactData` sobre la colección `anotaciones`, o una persona desde cualquier cliente de la base) la cierra escribiendo en el mismo documento:

- `respuesta` con una línea de qué cambió o por qué no, `cierre` con `atendida` o `descartada`, `commit` si lo hay, `respondido` con la fecha, y `estado: "resuelta"`;
- o `cierre: "pregunta"` y `respuesta` con la pregunta, dejando `estado: "abierta"`. La ficha muestra entonces un cuadro para la réplica; cuando el autor escribe en él, `replica` queda en el documento y la siguiente sesión puede leerla.

La página muestra la respuesta bajo la nota, con el cierre como etiqueta, y ofrece los filtros «con respuesta» y «preguntas». Nada de esto toca la nota del autor.

## Etiquetas

Una palabra precedida de `#` dentro de la nota (`#carmen`, `#dato`) es una etiqueta: la ficha la muestra como chip y el panel ofrece un selector para filtrar por ella. No hay lista fija.

## Cómo se vuelcan a las fuentes

`lector-anotaciones exportar anotaciones.json --agrupar archivo` produce una lista de tareas ordenada por archivo y línea, que es el orden en que conviene aplicar los cambios. Un asistente que lea la colección directamente debe tratar cada documento como una instrucción del autor sobre el bloque `pid` del archivo `src`, usar `cita` (y `antes`/`despues`) para ubicar el pasaje exacto, y marcar `estado: "resuelta"` cuando lo haya atendido.
