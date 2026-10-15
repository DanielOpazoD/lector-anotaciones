# Ejemplo

Un libro inventado, corto, para probar la herramienta de punta a punta. Desde la raíz del repositorio:

```bash
lector-anotaciones construir ejemplo/fuentes --salida ejemplo/salida/libro.json --titulo "Libro de ejemplo" --autor "Autora Ejemplo" --estricto
mkdir -p ejemplo/salida && cp web/index.html ejemplo/salida/ && cp -r ejemplo/figs ejemplo/salida/
python -m http.server --directory ejemplo/salida 8000
```

Y abrir <http://localhost:8000/>. Sin PDF, los bloques no llevan página (el margen queda vacío y las notas de página se crean escribiendo el número a mano); todo lo demás funciona igual. Para verlo con páginas sin maquetar nada, `python -m tests.pdf_minimo ejemplo/fuentes --salida ejemplo/salida/libro.pdf` escribe un PDF de texto plano, una sección por página, y `construir … --pdf ejemplo/salida/libro.pdf` las asigna; es lo que hace la integración continua.

- `fuentes/` — dos archivos Markdown con el dialecto completo: portada, página legal, títulos de nivel 1 y 2, subtítulos, listas, tabla, cita y figura.
- `figs/figura_01.png` — la figura que referencia el capítulo 1.
- `salida/` — se genera; está en `.gitignore`.
