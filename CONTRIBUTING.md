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
mypy                         # el paquete Python, con --strict (configuración en pyproject.toml)
pytest
lector-anotaciones pagina --salida web/index.html --comprobar
npm run formato              # Prettier sobre el JavaScript (npm run formatear lo corrige)
npm run modulos -- --comprobar   # tipos/pagina.d.ts y docs/MODULOS.md al día; la ficha se dibuja sólo con (anotación, vista)
npm run tipos                # tsc --checkJs: la página con strictNullChecks; el núcleo, además, sin tipos implícitos
npm run test:js
python -m tests.pdf_minimo ejemplo/fuentes --salida ejemplo/salida/libro.pdf
lector-anotaciones construir ejemplo/fuentes --pdf ejemplo/salida/libro.pdf --salida ejemplo/salida/libro.json --titulo "Libro de ejemplo" --estricto
npm run test:web             # npx playwright test: tests/web/*.spec.mjs en paralelo
```

La cobertura se mide en las tres partes, como un detector de lo que ninguna prueba toca (no como un objetivo):
`pytest --cov` (piso en `pyproject.toml`), `npm run cobertura:js` (el núcleo con `node --test`) y `npm run cobertura:web`
(la página en el navegador: cada prueba recoge la cobertura V8 de sus páginas y `tests/web/herramientas/cobertura.mjs`
la reparte por fragmento de `pagina/` y `nucleo/`, con las funciones que nunca se ejecutaron, en `cobertura/web.md`).
Los pisos salen de una medición real; si una función nueva queda sin ejecutar, el informe lo dice.

Son los mismos pasos que corre la integración continua. Las pruebas del navegador están en `tests/web/*.spec.mjs`
(`@playwright/test`), con las ayudas comunes en `tests/web/ayudas.mjs`. Cada prueba es corta (no más de unas cien
líneas) e independiente: abre su página con `abrir({ … })` —que crea el contexto, siembra la base simulada o el
navegador, navega, espera y lo cierra todo al terminar— y, si necesita un estado que cuesta armar, lo arma una
preparación del archivo (`cuatroRespondidas`, `casosLimite`…) que llaman todas las que lo usan. `sinErrores(p, …)`
comprueba que la página no dejó escapar errores. Corren en paralelo; si se lanzan dos corridas a la vez en la misma
copia, cada una con su `--output`, para que no se borren los artefactos. `check(cond, mensaje)` es una aserción blanda: si falla, la prueba termina en rojo con el mensaje
y sigue con las demás comprobaciones; `LISTAR=1 npx playwright test` escribe todas. Una sola prueba:
`npx playwright test revision -g "casos límite"`. Las pruebas importan `test` de `ayudas.mjs`, no de
`@playwright/test`: así un error sin capturar en cualquier página que abran las hace fallar. La base simulada
(`conBase`) conecta en seguida; con `window.__retenerDb = true` espera a que la prueba llame a `__soltarDb()` (también
después de recargar), para probar lo que pasa mientras conecta sin depender de un plazo. En la CI, un `test.only`
olvidado es un error; lo que falla deja captura y traza en `test-results/`. `tests/pdf_minimo.py` escribe un PDF de texto plano, sin maquetador y siempre con los mismos bytes; `tests/fixtures/libro_min.pdf` sale de él (`python -m tests.pdf_minimo tests/fixtures/libro_min.md --salida tests/fixtures/libro_min.pdf`) y una prueba comprueba que sigue siendo el mismo. Las pruebas que leen un PDF de verdad se saltan si falta `poppler-utils`.

## Reglas de la casa

- Español en código, pruebas y documentación; nombres de funciones y variables en español, como el resto.
- Lo que la página llama del núcleo, y la forma de una anotación, de la sincronía y de la vista, está tipado en
  `src/lector_anotaciones/web/tipos/globales.d.ts` (no se empaqueta); `npm run tipos` lo revisa. Una función nueva del
  núcleo que la página use se agrega ahí: el núcleo está declarado entero, así que un nombre que no esté es un error, y
  `strictNullChecks` obliga a mirar lo que puede faltar.
- Los estilos van por capas (`@layer tokens, base, componentes, pantallas, preferencias`): lo del teléfono y las pantallas
  táctiles gana a los componentes, y las preferencias del sistema (movimiento reducido, alto contraste) a todo. Para
  reorganizar `estilos.css` sin cambiar lo que se ve, `npm run estilos -- antes.html despues.html` compara los estilos
  calculados de dos versiones de la página en una docena de estados.
- La ficha de una anotación es función de la anotación y de su vista: `vistaDeFicha` (`pagina/50-panel.js`) reúne todo
  lo demás que decide lo que muestra, y su JSON es la firma con que se reutiliza el nodo. En `pagina/52-ficha.js`, lo
  que corre al dibujar no lee estado (`npm run modulos` lo comprueba); si la ficha necesita algo más, va a la vista.
  Cambiar una ficha sin redibujarla pasa por `vistaEnSitio`.
- Un error que la página pasa por alto a propósito (un almacenamiento bloqueado, una voz que no está) no se calla:
  `P.fallo('dónde', e)` lo deja en el diagnóstico que se copia con «Copiar diagnóstico». Nada de `catch (e) {}`.
- En Python, `mypy --strict`: los datos en JSON llevan los alias de `tipos.py` (`Anotacion`, `Libro`, `Seccion`…).
- Cada fragmento de `pagina/` es un módulo, `(function (P, E) { … })(LAPagina, LAEstado)`: lo que declara es suyo. Lo que
  otro fragmento necesita se ofrece con `P.nombre = nombre;` (al principio, para las funciones) y se usa como
  `P.nombre(…)`; el estado que varios fragmentos comparten y reasignan vive en `E` (`E.SOLO_LECTURA`…), declarado con su
  primer valor en el nivel del módulo. `npm run modulos` regenera `tipos/pagina.d.ts` (los tipos de `P` y `E`, que
  infiere tsc) y `docs/MODULOS.md` (qué ofrece y usa cada fragmento); la CI comprueba que estén al día, y usar algo que
  nadie ofrece es un error de `npm run tipos`.
- La página se edita en `src/lector_anotaciones/web/` (nunca a mano en `web/index.html`, que se regenera con `lector-anotaciones pagina --salida web/index.html`). Lo que no necesita el DOM va en `nucleo/` con su prueba en `tests/js/`; lo que replica al paquete Python (el Markdown, las huellas) se prueba contra él en `tests/test_paridad_js.py`. Los libros de muestra de `tests/fixtures/` salen de `tests/fixtures/generar.py`.
- Ningún cambio en la página que rompa los contratos de `tests/test_web.py` (lee `libro.json`, colección `anotaciones`, clave local por libro, sin scripts externos). Si un cambio exige romperlos, se actualizan el documento de formato y el número de `formato` en `libro.json`.
- Cada cambio de comportamiento lleva prueba, y cada cambio visible entra en `CHANGELOG.md`.
- Sin dependencias de ejecución en Python; `poppler-utils` sigue siendo opcional (sólo para páginas).
