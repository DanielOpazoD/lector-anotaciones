# Publicar la página

La página es un único `index.html` sin dependencias de compilación. Necesita, en el mismo directorio, `libro.json` y una carpeta `figs/` con las figuras que el libro referencia (o el prefijo que se haya pasado en `--figs`).

## En el propio computador

```bash
lector-anotaciones construir fuentes/ --pdf libro.pdf --salida salida/libro.json --titulo "Mi libro"
cp web/index.html salida/ && cp -r figs salida/
python -m http.server --directory salida 8000
```

Las anotaciones quedan en el `localStorage` del navegador. Son privadas a ese navegador: hay que copiarlas con «Copiar todo» para sacarlas de ahí.

## Como página privada en claude.ai (recomendado para trabajar con Claude)

Publicada como artefacto desde una sesión de Claude Code con la capacidad `db`, la página guarda cada anotación como un documento de la colección `anotaciones` de una base compartida. Eso es lo que permite que Claude, en la sesión siguiente, lea las anotaciones directamente (herramienta `ArtifactData`, acciones `list` y `query` sobre la colección) y las vuelque a las fuentes, marcando `estado: "resuelta"` las que atendió.

Pasos, desde la sesión de Claude Code:

1. Construir `libro.json` con el PDF, para que las páginas impresas coincidan con las del lector del PDF.
2. Publicar `web/index.html` con la herramienta de artefactos, adjuntando `libro.json` y las figuras como archivos de apoyo, y declarando la capacidad `db`.
3. Tras cada cambio en las fuentes, reconstruir `libro.json` y republicar con la misma URL. Los ids de bloque son estables mientras no cambie el orden de los bloques de una sección; una anotación cuyo bloque se movió sigue siendo localizable por `cita`, `antes` y `despues`.

La página funciona igual sin la base: si `window.claude.use("db")` devuelve `null`, pasa sola al respaldo local y lo dice en la barra de estado.

## En cualquier servidor estático

Vale cualquier hosting de archivos estáticos (GitHub Pages, Netlify, un bucket). Sin base compartida, se comporta como en el propio computador: anotaciones por navegador y exportación manual.
