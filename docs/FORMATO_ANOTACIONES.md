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
  "editado": "2026-10-15T14:03:40.000Z"
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

## Los cuatro colores

Cada color es una instrucción, no un adorno:

| Color | Significa |
|---|---|
| `revisar` (ámbar) | Reescribir o revisar el pasaje. |
| `cortar` (rojo) | Quitarlo. |
| `duda` (violeta) | Verificar un dato, una cita o una afirmación. |
| `conservar` (verde) | Está bien así; no tocarlo. |

## Cómo se vuelcan a las fuentes

`lector-anotaciones exportar anotaciones.json --agrupar archivo` produce una lista de tareas ordenada por archivo y línea, que es el orden en que conviene aplicar los cambios. Un asistente que lea la colección directamente debe tratar cada documento como una instrucción del autor sobre el bloque `pid` del archivo `src`, usar `cita` (y `antes`/`despues`) para ubicar el pasaje exacto, y marcar `estado: "resuelta"` cuando lo haya atendido.
