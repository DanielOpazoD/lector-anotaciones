# Cómo contribuir

## Preparar el entorno

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pre-commit install          # opcional: ruff antes de cada commit
```

Para las pruebas de la página hace falta Node 22 y Playwright:

```bash
npm install
npx playwright install chromium
```

## Antes de abrir un pull request

```bash
ruff check . && ruff format --check .
pytest
lector-anotaciones pagina --salida web/index.html --comprobar
npm run test:js
python -m tests.pdf_minimo ejemplo/fuentes --salida ejemplo/salida/libro.pdf
lector-anotaciones construir ejemplo/fuentes --pdf ejemplo/salida/libro.pdf --salida ejemplo/salida/libro.json --titulo "Libro de ejemplo" --estricto
npm run test:web
```

Son los mismos pasos que corre la integración continua. `tests/pdf_minimo.py` escribe un PDF de texto plano, sin maquetador y siempre con los mismos bytes; `tests/fixtures/libro_min.pdf` sale de él (`python -m tests.pdf_minimo tests/fixtures/libro_min.md --salida tests/fixtures/libro_min.pdf`) y una prueba comprueba que sigue siendo el mismo. Las pruebas que leen un PDF de verdad se saltan si falta `poppler-utils`.

## Reglas de la casa

- Español en código, pruebas y documentación; nombres de funciones y variables en español, como el resto.
- La página se edita en `src/lector_anotaciones/web/` (nunca a mano en `web/index.html`, que se regenera con `lector-anotaciones pagina --salida web/index.html`). Lo que no necesita el DOM va en `nucleo/` con su prueba en `tests/js/`; lo que replica al paquete Python (el Markdown, las huellas) se prueba contra él en `tests/test_paridad_js.py`. Los libros de muestra de `tests/fixtures/` salen de `tests/fixtures/generar.py`.
- Ningún cambio en la página que rompa los contratos de `tests/test_web.py` (lee `libro.json`, colección `anotaciones`, clave local por libro, sin scripts externos). Si un cambio exige romperlos, se actualizan el documento de formato y el número de `formato` en `libro.json`.
- Cada cambio de comportamiento lleva prueba, y cada cambio visible entra en `CHANGELOG.md`.
- Sin dependencias de ejecución en Python; `poppler-utils` sigue siendo opcional (sólo para páginas).
