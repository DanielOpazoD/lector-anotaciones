// Prueba de la biblioteca con Playwright: importar libros (EPUB, Word, Markdown, libro.json) desde la página,
// abrirlos, anotarlos, reemplazarlos por una versión nueva sin perder las anotaciones, exportarlos y borrarlos; la
// página sin libro propio; la biblioteca compartida en una base simulada (troceo y lectura de vuelta); y un libro.json
// malicioso que no debe ejecutar nada.
//
// Uso: node tests/web/biblioteca.mjs   (antes: construir el ejemplo, ver tests/web/smoke.mjs)
// Variables: LIBRO_JSON, CHROMIUM.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIBRO = process.env.LIBRO_JSON || path.join(RAIZ, 'ejemplo', 'salida', 'libro.json');
const MUESTRAS = path.join(RAIZ, 'tests', 'fixtures');
const FIGS = process.env.FIGS_DIR || path.join(RAIZ, 'ejemplo', 'figs');
if (!fs.existsSync(LIBRO)) { console.error(`No existe ${LIBRO}. Construye el ejemplo primero.`); process.exit(2); }

function servir() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const ruta = new URL(req.url, 'http://x').pathname;
      const archivo = ruta === '/' || ruta === '/index.html' ? path.join(RAIZ, 'web', 'index.html') : ruta === '/libro.json' ? LIBRO : ruta.startsWith('/figs/') ? path.join(FIGS, path.basename(ruta)) : null;
      if (!archivo || !fs.existsSync(archivo)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': archivo.endsWith('.json') ? 'application/json' : archivo.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8' });
      fs.createReadStream(archivo).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

let fallas = 0;
function check(cond, msg) { if (cond) console.log(`ok   ${msg}`); else { fallas++; console.log(`FALLA ${msg}`); } }
async function esperar(page, fn, arg = null, plazo = 6000) { try { await page.waitForFunction(fn, arg, { timeout: plazo }); return true; } catch { return false; } }

const sinBase = () => { window.claude = { use: () => Promise.resolve(null) }; };
// Base simulada que sobrevive a las recargas (la biblioteca recarga para abrir otro libro): se guarda en sessionStorage.
const conBase = () => {
  const guardado = JSON.parse(sessionStorage.getItem('__base') || '{}');
  const cols = guardado; const oyentes = {};
  const persistir = () => sessionStorage.setItem('__base', JSON.stringify(cols));
  const coleccion = (n) => (cols[n] = cols[n] || {});
  const snapDoc = (n, id) => ({ id, exists: !!coleccion(n)[id], data: () => coleccion(n)[id], metadata: { fromCache: false, hasPendingWrites: false } });
  const snap = (n, cambios) => ({ metadata: { fromCache: false }, docChanges: () => cambios.map((c) => ({ type: c.type, doc: { id: c.id, data: () => coleccion(n)[c.id] } })) });
  const emitir = (n, cambios) => (oyentes[n] || []).forEach((cb) => cb(snap(n, cambios)));
  window.__escrituras = [];
  const db = {
    collection: (n) => ({
      doc: (id) => ({
        get: () => Promise.resolve(snapDoc(n, id)),
        set: (data) => { window.__escrituras.push(n + '/' + id); const ex = !!coleccion(n)[id]; coleccion(n)[id] = JSON.parse(JSON.stringify(data)); persistir(); setTimeout(() => emitir(n, [{ type: ex ? 'modified' : 'added', id }]), 20); return Promise.resolve(); },
        delete: () => { delete coleccion(n)[id]; persistir(); setTimeout(() => emitir(n, [{ type: 'removed', id }]), 20); return Promise.resolve(); },
      }),
      get: () => Promise.resolve({ docs: Object.keys(coleccion(n)).map((id) => snapDoc(n, id)) }),
      onSnapshot: (cb) => { (oyentes[n] = oyentes[n] || []).push(cb); cb(snap(n, Object.keys(coleccion(n)).map((id) => ({ type: 'added', id })))); return () => {}; },
    }),
  };
  const user = { id: () => Promise.resolve('u_me'), can: () => Promise.resolve(null), profiles: (ids) => Promise.resolve(Object.fromEntries(ids.map((i) => [i, { id: i, name: 'Yo', color: '#333' }]))) };
  window.claude = { use: (n) => Promise.resolve(n === 'db' ? db : n === 'user' ? user : null) };
  window.__cols = cols;
};

async function abrirBiblioteca(page) {
  if (!(await page.$eval('#biblioteca', (d) => d.open))) {
    // en el teléfono el botón vive en «⋯»; aquí la ventana es ancha
    await page.click('#b-biblioteca');
  }
  await page.waitForFunction(() => !/Cargando/.test(document.querySelector('#bib-lista').textContent));
}
async function importar(page, archivos, opciones = {}) {
  await abrirBiblioteca(page);
  await page.setInputFiles('#bib-archivo', archivos);
  const listo = await esperar(page, () => !document.querySelector('#bib-previa').hidden || /No se pudo/.test(document.querySelector('#bib-estado').textContent));
  if (!listo || (await page.$eval('#bib-previa', (f) => f.hidden))) return { error: await page.$eval('#bib-estado', (e) => e.textContent) };
  const previa = await page.evaluate(() => ({ resumen: document.querySelector('#bib-resumen').textContent, avisos: document.querySelector('#bib-avisos').textContent, titulo: document.querySelector('#bib-titulo').value, autor: document.querySelector('#bib-autor').value, baseActiva: !document.querySelector('input[name="bib-donde"][value="base"]').disabled, choque: document.querySelector('#bib-choque').getClientRects().length > 0, boton: document.querySelector('#bib-importar').textContent }));
  if (opciones.titulo) { await page.fill('#bib-titulo', opciones.titulo); }
  if (opciones.choque) await page.check(`input[name="bib-choque"][value="${opciones.choque}"]`);
  if (opciones.donde) await page.check(`input[name="bib-donde"][value="${opciones.donde}"]`);
  if (opciones.antes) Object.assign(previa, await opciones.antes());
  await Promise.all([page.waitForEvent('load', { timeout: 15000 }), page.click('#bib-importar')]);
  await page.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  return previa;
}
async function seleccionarTexto(page, texto) {
  return page.evaluate((t) => {
    for (const p of document.querySelectorAll('article.seccion:not([hidden]) [data-pid]')) {
      const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const i = n.nodeValue.indexOf(t); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + t.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; } }
    }
    return false;
  }, texto);
}
const fixture = (n) => path.join(MUESTRAS, n);

const srv = await servir();
const base = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const tmp = fs.mkdtempSync(path.join(RAIZ, 'tests', 'web', '.tmp-'));
try {
  // ---------------------------------------------------------------- sin base: importar EPUB, anotarlo, volver al libro de la página
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(sinBase);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('dialog', (d) => { errores.push('diálogo inesperado: ' + d.message()); d.dismiss(); });
  await page.goto(base);
  await page.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await abrirBiblioteca(page);
  const lista0 = await page.$$eval('#bib-lista .bib-libro', (ls) => ls.map((l) => ({ t: l.querySelector('.t').textContent, d: l.querySelector('.d').textContent, abierto: l.classList.contains('abierto') })));
  check(lista0.length === 1 && lista0[0].t === 'Libro de ejemplo' && lista0[0].abierto && /libro de esta página/.test(lista0[0].d), `la biblioteca muestra el libro de la página como abierto (${JSON.stringify(lista0)})`);
  check(/sólo en este navegador/.test(await page.$eval('#bib-intro', (p) => p.textContent)), 'sin base, la biblioteca avisa que lo importado queda en este navegador');

  const epub = await importar(page, [fixture('ejemplo.epub')]);
  check(/«Libro de muestra EPUB»: 3 secciones, 11 bloques \(epub\)/.test(epub.resumen) && epub.autor === 'Autora de Muestra' && !epub.baseActiva && !epub.choque && /Importar y abrir/.test(epub.boton), `la vista previa resume el EPUB y, sin base, sólo ofrece este navegador (${epub.resumen})`);
  const abierto = await page.evaluate(() => ({ sub: document.querySelector('#sub').textContent, indice: Array.from(document.querySelectorAll('nav a.sec')).map((a) => a.textContent), img: (document.querySelector('figure img') || {}).src || '', escapado: Array.from(document.querySelectorAll('p.bloque')).some((p) => p.textContent.includes('<etiqueta> & más')), scripts: document.querySelectorAll('article script').length, estado: document.querySelector('#estado').textContent }));
  check(/Libro de muestra EPUB/.test(abierto.sub) && abierto.indice.some((t) => /Capítulo 2\. Sin encabezado/.test(t)), `el EPUB queda abierto, con el capítulo sin encabezado titulado desde su índice (${abierto.indice.join(' | ')})`);
  check(/^data:image\/png;base64,/.test(abierto.img) && abierto.escapado && abierto.scripts === 0, 'su figura entra como imagen y su HTML sólo como texto');
  check(/Libro guardado sólo en este navegador/.test(abierto.estado), `la barra dice dónde se guardan sus anotaciones (${abierto.estado.slice(0, 60)})`);
  // anotar el libro importado
  await page.click('nav a.sec:has-text("Capítulo 1")');
  check(await seleccionarTexto(page, 'Un hecho es lo que se'), 'se puede seleccionar texto del libro importado');
  await page.keyboard.press('3');
  await page.waitForSelector('mark.hl.c-duda');
  const claveEpub = await page.evaluate(() => Object.keys(localStorage).find((k) => k === 'lector-anotaciones:libro-de-muestra-epub'));
  check(!!claveEpub && /Un hecho es lo que se/.test(await page.evaluate((k) => localStorage.getItem(k), claveEpub)), 'su anotación se guarda con la clave de ese libro');
  await page.reload();
  await page.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  check(/Libro de muestra EPUB/.test(await page.$eval('#sub', (s) => s.textContent)) && (await page.$$('mark.hl.c-duda')).length === 1, 'al recargar sigue abierto el libro importado, con su anotación');
  // volver al libro de la página
  await abrirBiblioteca(page);
  const lista1 = await page.$$eval('#bib-lista .bib-libro', (ls) => ls.map((l) => l.querySelector('.t').textContent + (l.classList.contains('abierto') ? ' (abierto)' : '')));
  check(lista1.length === 2 && lista1.includes('Libro de muestra EPUB (abierto)'), `la biblioteca lista los dos libros (${lista1.join(' · ')})`);
  await Promise.all([page.waitForEvent('load'), page.click('#bib-lista .bib-libro:not(.abierto) button:has-text("Abrir")')]);
  await page.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  check(/Libro de ejemplo/.test(await page.$eval('#sub', (s) => s.textContent)) && (await page.$$('mark.hl')).length === 0, 'abrir el libro de la página lo muestra sin las anotaciones del otro');

  // exportar el libro de la página como Markdown y como libro.json
  await abrirBiblioteca(page);
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('#bib-lista .bib-libro.abierto button:has-text("Markdown")')]);
  const destino = path.join(tmp, descarga.suggestedFilename());
  await descarga.saveAs(destino);
  const md = fs.readFileSync(destino, 'utf8');
  check(descarga.suggestedFilename() === 'libro-de-ejemplo.md' && /^## Capítulo 1\./m.test(md), `exportar a Markdown descarga el libro en el dialecto del lector (${descarga.suggestedFilename()}, ${md.length} caracteres)`);

  // Word: títulos, listas, cita, tabla, figura con su leyenda, control de cambios
  const docx = await importar(page, [fixture('ejemplo.docx')]);
  const word = await page.evaluate(() => ({ sub: document.querySelector('#sub').textContent, cap: document.querySelector('article.seccion:not([hidden]) h1').textContent, tipos: Array.from(document.querySelectorAll('article.seccion:not([hidden]) .bloque')).map((b) => b.tagName.toLowerCase()), leyenda: (document.querySelector('article.seccion:not([hidden]) figcaption') || {}).textContent, borrado: document.querySelector('#lectura').textContent.includes('BORRADO') }));
  check(docx.titulo === 'Libro de muestra Word' && docx.autor === 'Autor de Muestra' && /Libro de muestra Word/.test(word.sub), `Word toma título y autor del documento (${docx.titulo} · ${docx.autor})`);
  check(word.cap === 'Capítulo 1. Hechos' && ['p', 'h2', 'ul', 'ol', 'blockquote', 'div', 'figure'].every((t) => word.tipos.includes(t)) && word.leyenda === 'Figura 1. Un punto mínimo.' && !word.borrado, `Word: párrafos, subtítulo, listas, cita, tabla y figura con su leyenda; sin el texto borrado (${word.tipos.join(',')} · ${word.leyenda} · ${word.borrado})`);

  // Markdown en dos archivos con su imagen; luego una versión nueva que reemplaza a la anterior y conserva la anotación
  const cuento1 = path.join(tmp, '01.md'), cuento2 = path.join(tmp, '02.md'), fig = path.join(tmp, 'f.png');
  fs.writeFileSync(cuento1, '# Cuento de prueba\n\n## Capítulo 1. Inicio\n\nHabía una vez una frase que nadie quería subrayar.\n\n[FIGURA: f.png | Figura 1. Un punto.]\n');
  fs.writeFileSync(cuento2, '## Capítulo 2. Final\n\nY colorín colorado.\n');
  fs.copyFileSync(path.join(MUESTRAS, 'ejemplo.docx'), path.join(tmp, 'no-es.png'));
  fs.writeFileSync(fig, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const cuento = await importar(page, [cuento2, cuento1, fig]);
  check(/«Cuento de prueba»: 3 secciones, 3 bloques \(md\)/.test(cuento.resumen), `varios .md se leen en orden de nombre, con sus imágenes (${cuento.resumen})`);
  await page.click('nav a.sec:has-text("Inicio")');
  await seleccionarTexto(page, 'nadie quería subrayar');
  await page.keyboard.press('2');
  await page.waitForSelector('mark.hl.c-cortar');
  fs.writeFileSync(cuento1, '# Cuento de prueba\n\n## Capítulo 1. Inicio\n\nUn párrafo nuevo antes de todo.\n\nHabía una vez una frase que nadie quería subrayar, ahora más larga.\n\n[FIGURA: f.png | Figura 1. Un punto.]\n');
  const otra = await importar(page, [cuento1, cuento2, fig], { choque: 'reemplazar' });
  check(otra.choque && /Reemplazar y abrir/.test(otra.boton), 'reimportar un libro con el mismo título ofrece reemplazarlo');
  await page.click('nav a.sec:has-text("Inicio")');
  const reubicada = await page.evaluate(() => ({ marca: (document.querySelector('mark.hl.c-cortar') || {}).textContent, bloques: document.querySelectorAll('article.seccion:not([hidden]) p.bloque').length }));
  const nLibros = (await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('lector-anotaciones', 1); r.onsuccess = () => { const q = r.result.transaction('libros').objectStore('libros').getAllKeys(); q.onsuccess = () => res(q.result); }; })));
  check(reubicada.marca === 'nadie quería subrayar' && reubicada.bloques === 2 && nLibros.filter((k) => /^cuento-de-prueba/.test(k)).length === 1, `la versión nueva reemplaza a la anterior y la anotación se reubica en su texto (${JSON.stringify(reubicada)}, ${nLibros.join(', ')})`);

  // errores legibles y un libro.json malicioso
  await abrirBiblioteca(page);
  await page.setInputFiles('#bib-archivo', [path.join(tmp, 'no-es.png')]);
  await esperar(page, () => /No se pudo/.test(document.querySelector('#bib-estado').textContent));
  check(/elige el texto del libro/.test(await page.$eval('#bib-estado', (e) => e.textContent)), 'sólo imágenes: lo dice sin romperse');
  const malo = path.join(tmp, 'malo.json');
  const L = JSON.parse(fs.readFileSync(LIBRO, 'utf8'));
  L.titulo = 'Libro malicioso'; L.id = 'malicioso';
  L.secciones[1].bloques[0].html = 'Texto <img src=x onerror="window.__xss=1"> <strong onclick="window.__xss=2">fuerte</strong>';
  fs.writeFileSync(malo, JSON.stringify(L));
  await importar(page, [malo]);
  await page.goto(base + '#' + L.secciones[1].id);
  await page.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  const xss = await page.evaluate(() => ({ xss: window.__xss, img: document.querySelectorAll('article img[onerror], article [onclick]').length, fuerte: !!Array.from(document.querySelectorAll('article strong')).find((s) => s.textContent === 'fuerte') }));
  check(xss.xss === undefined && xss.img === 0 && xss.fuerte, `un libro.json importado no ejecuta nada: se queda su texto y su negrita (${JSON.stringify(xss)})`);
  // borrar el libro abierto vuelve al de la página
  await abrirBiblioteca(page);
  await page.click('#bib-lista .bib-libro.abierto button:has-text("Borrar")');
  await Promise.all([page.waitForEvent('load'), page.click('#bib-lista .bib-libro.abierto button:has-text("Sí, borrar")')]);
  await page.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await abrirBiblioteca(page);
  const trasBorrar = await page.$$eval('#bib-lista .bib-libro .t', (ts) => ts.map((t) => t.textContent));
  check(/Libro de ejemplo/.test(await page.$eval('#sub', (s) => s.textContent)) && !trasBorrar.includes('Libro malicioso'), `borrar el libro abierto lo quita y vuelve al de la página (${trasBorrar.join(' · ')})`);
  check(errores.length === 0, `sin errores de consola${errores.length ? ': ' + errores.join(' | ') : ''}`);
  await ctx.close();

  // ---------------------------------------------------------------- una página sin libro propio
  const ctxV = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxV.addInitScript(sinBase);
  const pv = await ctxV.newPage();
  await pv.route('**/libro.json', (r) => r.fulfill({ status: 404, body: '' }));
  await pv.goto(base);
  const vacia = await esperar(pv, () => document.querySelector('#biblioteca').open && /todavía no tiene un libro/.test(document.querySelector('#lectura').textContent));
  check(vacia, 'sin libro.json, la página invita a importar uno y abre la biblioteca');
  const pvImp = await importar(pv, [fixture('ejemplo-ncx.epub')]);
  check(/Libro de muestra EPUB/.test(await pv.$eval('#sub', (s) => s.textContent)) && !!pvImp.resumen, 'e importar un libro lo abre');
  await ctxV.close();

  // ---------------------------------------------------------------- biblioteca compartida (base simulada)
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxB.addInitScript(conBase);
  const pb = await ctxB.newPage();
  const erroresB = [];
  pb.on('pageerror', (e) => erroresB.push(String(e)));
  await pb.goto(base);
  await pb.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  // un libro largo para que se trocee
  const largo = path.join(tmp, 'largo.md');
  let texto = '# Libro largo\n\n';
  for (let c = 1; c <= 12; c++) { texto += `## Capítulo ${c}. Parte ${c}\n\n`; for (let p = 0; p < 60; p++) texto += `Párrafo ${p} del capítulo ${c}: ${'«texto con acentos, ñandúes y comillas» '.repeat(12)}\n\n`; }
  fs.writeFileSync(largo, texto);
  const compartido = await importar(pb, [largo]);
  check(compartido.baseActiva, 'con base, la vista previa ofrece la biblioteca compartida');
  const partes = await pb.evaluate(() => Object.keys(window.__cols['libros/libro-largo/partes'] || {}).length);
  const ficha = await pb.evaluate(() => (window.__cols.libros || {})['libro-largo']);
  check(partes > 1 && ficha && ficha.partes === partes && ficha.bloques === 720, `el libro se guarda troceado en la base, con una ficha que cuenta sus partes (${partes} partes)`);
  const abiertoB = await pb.evaluate(() => ({ sub: document.querySelector('#sub').textContent, secciones: document.querySelectorAll('nav a.sec').length }));
  check(/Libro largo/.test(abiertoB.sub) && abiertoB.secciones === 13, `y se vuelve a armar al abrirlo (${abiertoB.secciones} secciones)`);
  await pb.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  await pb.click('nav a.sec:has-text("Parte 3")');
  await seleccionarTexto(pb, 'Párrafo 7 del capítulo 3');
  await pb.keyboard.press('1');
  await esperar(pb, () => Object.keys(window.__cols['libros/libro-largo/anotaciones'] || {}).length === 1);
  check((await pb.evaluate(() => Object.keys(window.__cols['libros/libro-largo/anotaciones'] || {}).length)) === 1 && (await pb.evaluate(() => Object.keys(window.__cols.anotaciones || {}).length)) === 0, 'las anotaciones del libro compartido van a su propia colección');
  check(erroresB.length === 0, `sin errores de consola con base${erroresB.length ? ': ' + erroresB.join(' | ') : ''}`);
  await ctxB.close();
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  await browser.close();
  srv.close();
}
console.log(fallas ? `\n${fallas} comprobaciones fallaron` : '\nTodo en orden');
process.exit(fallas ? 1 : 0);
