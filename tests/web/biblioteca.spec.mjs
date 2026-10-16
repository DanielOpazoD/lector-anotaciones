// Prueba de la biblioteca con Playwright: importar libros (EPUB, Word, Markdown, libro.json) desde la página,
// abrirlos, anotarlos, reemplazarlos por una versión nueva sin perder las anotaciones, exportarlos y borrarlos; la
// página sin libro propio; la biblioteca compartida en una base simulada (troceo y lectura de vuelta); y un libro.json
// malicioso que no debe ejecutar nada.
//
// Uso: npx playwright test biblioteca (antes: construir el ejemplo, ver tests/web/ayudas.mjs)
// Variables: LIBRO_JSON, CHROMIUM, LISTAR=1.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect } from '@playwright/test';

import { test } from './ayudas.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIBRO = process.env.LIBRO_JSON || path.join(RAIZ, 'ejemplo', 'salida', 'libro.json');
const MUESTRAS = path.join(RAIZ, 'tests', 'fixtures');
const FIGS = process.env.FIGS_DIR || path.join(RAIZ, 'ejemplo', 'figs');

function servir() {
  if (!fs.existsSync(LIBRO)) throw new Error(`No existe ${LIBRO}. Construye el ejemplo primero.`);
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const ruta = new URL(req.url, 'http://x').pathname;
      const archivo =
        ruta === '/' || ruta === '/index.html'
          ? path.join(RAIZ, 'web', 'index.html')
          : ruta === '/libro.json'
            ? LIBRO
            : ruta.startsWith('/figs/')
              ? path.join(FIGS, path.basename(ruta))
              : null;
      if (!archivo || !fs.existsSync(archivo)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        'content-type': archivo.endsWith('.json')
          ? 'application/json'
          : archivo.endsWith('.png')
            ? 'image/png'
            : 'text/html; charset=utf-8',
      });
      fs.createReadStream(archivo).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// Una comprobación que no detiene la prueba (ver check en ayudas.mjs).
function check(cond, msg) {
  if (process.env.LISTAR) console.log(`${cond ? 'ok   ' : 'FALLA'} ${msg}`);
  expect.soft(!!cond, msg).toBe(true);
}
async function esperar(page, fn, arg = null, plazo = 6000) {
  try {
    await page.waitForFunction(fn, arg, { timeout: plazo });
    return true;
  } catch {
    return false;
  }
}

const sinBase = () => {
  window.claude = { use: () => Promise.resolve(null) };
};
// Base simulada que sobrevive a las recargas (la biblioteca recarga para abrir otro libro): se guarda en sessionStorage.
const conBase = () => {
  const guardado = JSON.parse(sessionStorage.getItem('__base') || '{}');
  const cols = guardado;
  const oyentes = {};
  const persistir = () => sessionStorage.setItem('__base', JSON.stringify(cols));
  const coleccion = (n) => (cols[n] = cols[n] || {});
  const snapDoc = (n, id) => ({
    id,
    exists: !!coleccion(n)[id],
    data: () => coleccion(n)[id],
    metadata: { fromCache: false, hasPendingWrites: false },
  });
  const snap = (n, cambios) => ({
    metadata: { fromCache: false },
    docChanges: () => cambios.map((c) => ({ type: c.type, doc: { id: c.id, data: () => coleccion(n)[c.id] } })),
  });
  const emitir = (n, cambios) => (oyentes[n] || []).forEach((cb) => cb(snap(n, cambios)));
  window.__escrituras = [];
  // sessionStorage.__fallos = { "<regex sobre colección/doc>": { code, veces, demora } }: esas escrituras fallan
  const fallo = (ruta) => {
    const fs = JSON.parse(sessionStorage.getItem('__fallos') || '{}');
    for (const k of Object.keys(fs)) {
      if (fs[k].veces > 0 && new RegExp(k).test(ruta)) {
        fs[k].veces--;
        sessionStorage.setItem('__fallos', JSON.stringify(fs));
        return fs[k];
      }
    }
    return null;
  };
  const db = {
    collection: (n) => ({
      doc: (id) => ({
        get: () => Promise.resolve(snapDoc(n, id)),
        set: (data) => {
          const f = fallo(n + '/' + id);
          if (f)
            return new Promise((_, rej) => setTimeout(() => rej({ code: f.code, message: 'simulado' }), f.demora || 0));
          window.__escrituras.push(n + '/' + id);
          const ex = !!coleccion(n)[id];
          coleccion(n)[id] = JSON.parse(JSON.stringify(data));
          persistir();
          setTimeout(() => emitir(n, [{ type: ex ? 'modified' : 'added', id }]), 20);
          return Promise.resolve();
        },
        delete: () => {
          delete coleccion(n)[id];
          persistir();
          setTimeout(() => emitir(n, [{ type: 'removed', id }]), 20);
          return Promise.resolve();
        },
      }),
      get: () =>
        sessionStorage.getItem('__fallaLista') && n === 'libros'
          ? Promise.reject({ code: 'unavailable', message: 'simulado' })
          : Promise.resolve({ docs: Object.keys(coleccion(n)).map((id) => snapDoc(n, id)) }),
      onSnapshot: (cb) => {
        (oyentes[n] = oyentes[n] || []).push(cb);
        cb(
          snap(
            n,
            Object.keys(coleccion(n)).map((id) => ({ type: 'added', id }))
          )
        );
        return () => {};
      },
    }),
  };
  const user = {
    id: () => Promise.resolve('u_me'),
    can: () => Promise.resolve(null),
    profiles: (ids) => Promise.resolve(Object.fromEntries(ids.map((i) => [i, { id: i, name: 'Yo', color: '#333' }]))),
  };
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
  const listo = await esperar(
    page,
    () =>
      !document.querySelector('#bib-previa').hidden ||
      /No se pudo/.test(document.querySelector('#bib-estado').textContent)
  );
  if (!listo || (await page.$eval('#bib-previa', (f) => f.hidden)))
    return { error: await page.$eval('#bib-estado', (e) => e.textContent) };
  const previa = await page.evaluate(() => ({
    resumen: document.querySelector('#bib-resumen').textContent,
    avisos: document.querySelector('#bib-avisos').textContent,
    titulo: document.querySelector('#bib-titulo').value,
    autor: document.querySelector('#bib-autor').value,
    baseActiva: !document.querySelector('input[name="bib-donde"][value="base"]').disabled,
    choque: document.querySelector('#bib-choque').getClientRects().length > 0,
    boton: document.querySelector('#bib-importar').textContent,
  }));
  if (opciones.titulo) {
    await page.fill('#bib-titulo', opciones.titulo);
  }
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
      const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const i = n.nodeValue.indexOf(t);
        if (i >= 0) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + t.length);
          const s = getSelection();
          s.removeAllRanges();
          s.addRange(r);
          return true;
        }
      }
    }
    return false;
  }, texto);
}
const fixture = (n) => path.join(MUESTRAS, n);

let srv, base, tmp;
test.beforeAll(async () => {
  srv = await servir();
  base = `http://127.0.0.1:${srv.address().port}/`;
  tmp = fs.mkdtempSync(path.join(RAIZ, 'tests', 'web', '.tmp-'));
});
test.afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  srv.close();
});

test('Sin base: importar EPUB, anotarlo, volver al libro de la página', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(sinBase);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text());
  });
  page.on('dialog', (d) => {
    errores.push('diálogo inesperado: ' + d.message());
    d.dismiss();
  });
  await page.goto(base);
  await page.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await abrirBiblioteca(page);
  const lista0 = await page.$$eval('#bib-lista .bib-libro', (ls) =>
    ls.map((l) => ({
      t: l.querySelector('.t').textContent,
      d: l.querySelector('.d').textContent,
      abierto: l.classList.contains('abierto'),
    }))
  );
  check(
    lista0.length === 1 &&
      lista0[0].t === 'Libro de ejemplo' &&
      lista0[0].abierto &&
      /libro de esta página/.test(lista0[0].d),
    `la biblioteca muestra el libro de la página como abierto (${JSON.stringify(lista0)})`
  );
  check(
    /sólo en este navegador/.test(await page.$eval('#bib-intro', (p) => p.textContent)),
    'sin base, la biblioteca avisa que lo importado queda en este navegador'
  );

  const epub = await importar(page, [fixture('ejemplo.epub')]);
  check(
    /«Libro de muestra EPUB»: 3 secciones, 11 bloques \(epub\)/.test(epub.resumen) &&
      epub.autor === 'Autora de Muestra' &&
      !epub.baseActiva &&
      !epub.choque &&
      /Importar y abrir/.test(epub.boton),
    `la vista previa resume el EPUB y, sin base, sólo ofrece este navegador (${epub.resumen})`
  );
  const abierto = await page.evaluate(() => ({
    sub: document.querySelector('#sub').textContent,
    indice: Array.from(document.querySelectorAll('nav a.sec')).map((a) => a.textContent),
    img: (document.querySelector('figure img') || {}).src || '',
    escapado: Array.from(document.querySelectorAll('p.bloque')).some((p) => p.textContent.includes('<etiqueta> & más')),
    scripts: document.querySelectorAll('article script').length,
    estado: document.querySelector('#estado').textContent,
  }));
  check(
    /Libro de muestra EPUB/.test(abierto.sub) && abierto.indice.some((t) => /Capítulo 2\. Sin encabezado/.test(t)),
    `el EPUB queda abierto, con el capítulo sin encabezado titulado desde su índice (${abierto.indice.join(' | ')})`
  );
  check(
    /^data:image\/png;base64,/.test(abierto.img) && abierto.escapado && abierto.scripts === 0,
    'su figura entra como imagen y su HTML sólo como texto'
  );
  check(
    /Libro guardado sólo en este navegador/.test(abierto.estado),
    `la barra dice dónde se guardan sus anotaciones (${abierto.estado.slice(0, 60)})`
  );
  // anotar el libro importado
  await page.click('nav a.sec:has-text("Capítulo 1")');
  check(await seleccionarTexto(page, 'Un hecho es lo que se'), 'se puede seleccionar texto del libro importado');
  await page.keyboard.press('3');
  await page.waitForSelector('mark.hl.c-duda');
  const claveEpub = await page.evaluate(() =>
    Object.keys(localStorage).find((k) => k === 'lector-anotaciones:local:libro-de-muestra-epub')
  );
  check(
    !!claveEpub && /Un hecho es lo que se/.test(await page.evaluate((k) => localStorage.getItem(k), claveEpub)),
    'su anotación se guarda con la clave de ese libro, que lleva su lugar (local:)'
  );
  const eleccion = await page.evaluate(() => Object.keys(localStorage).filter((k) => /abierto/.test(k)));
  check(
    eleccion.length === 1 && /^lector-anotaciones\.abierto:\//.test(eleccion[0]),
    `la elección del libro abierto vive fuera de las claves de los libros (${eleccion.join(', ')})`
  );
  await page.reload();
  await page.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  check(
    /Libro de muestra EPUB/.test(await page.$eval('#sub', (s) => s.textContent)) &&
      (await page.$$('mark.hl.c-duda')).length === 1,
    'al recargar sigue abierto el libro importado, con su anotación'
  );
  // volver al libro de la página
  await abrirBiblioteca(page);
  const lista1 = await page.$$eval('#bib-lista .bib-libro', (ls) =>
    ls.map((l) => l.querySelector('.t').textContent + (l.classList.contains('abierto') ? ' (abierto)' : ''))
  );
  check(
    lista1.length === 2 && lista1.includes('Libro de muestra EPUB (abierto)'),
    `la biblioteca lista los dos libros (${lista1.join(' · ')})`
  );
  await Promise.all([
    page.waitForEvent('load'),
    page.click('#bib-lista .bib-libro:not(.abierto) button:has-text("Abrir")'),
  ]);
  await page.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  check(
    /Libro de ejemplo/.test(await page.$eval('#sub', (s) => s.textContent)) && (await page.$$('mark.hl')).length === 0,
    'abrir el libro de la página lo muestra sin las anotaciones del otro'
  );

  // exportar el libro de la página como Markdown y como libro.json
  await abrirBiblioteca(page);
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#bib-lista .bib-libro.abierto button:has-text("Markdown")'),
  ]);
  const destino = path.join(tmp, descarga.suggestedFilename());
  await descarga.saveAs(destino);
  const md = fs.readFileSync(destino, 'utf8');
  check(
    descarga.suggestedFilename() === 'libro-de-ejemplo.md' && /^## Capítulo 1\./m.test(md),
    `exportar a Markdown descarga el libro en el dialecto del lector (${descarga.suggestedFilename()}, ${md.length} caracteres)`
  );

  // Word: títulos, listas, cita, tabla, figura con su leyenda, control de cambios
  const docx = await importar(page, [fixture('ejemplo.docx')]);
  const word = await page.evaluate(() => ({
    sub: document.querySelector('#sub').textContent,
    cap: document.querySelector('article.seccion:not([hidden]) h1').textContent,
    tipos: Array.from(document.querySelectorAll('article.seccion:not([hidden]) .bloque')).map((b) =>
      b.tagName.toLowerCase()
    ),
    leyenda: (document.querySelector('article.seccion:not([hidden]) figcaption') || {}).textContent,
    borrado: document.querySelector('#lectura').textContent.includes('BORRADO'),
  }));
  check(
    docx.titulo === 'Libro de muestra Word' &&
      docx.autor === 'Autor de Muestra' &&
      /Libro de muestra Word/.test(word.sub),
    `Word toma título y autor del documento (${docx.titulo} · ${docx.autor})`
  );
  check(
    word.cap === 'Capítulo 1. Hechos' &&
      ['p', 'h2', 'ul', 'ol', 'blockquote', 'div', 'figure'].every((t) => word.tipos.includes(t)) &&
      word.leyenda === 'Figura 1. Un punto mínimo.' &&
      !word.borrado,
    `Word: párrafos, subtítulo, listas, cita, tabla y figura con su leyenda; sin el texto borrado (${word.tipos.join(',')} · ${word.leyenda} · ${word.borrado})`
  );

  // Markdown en dos archivos con su imagen; luego una versión nueva que reemplaza a la anterior y conserva la anotación
  const cuento1 = path.join(tmp, '01.md'),
    cuento2 = path.join(tmp, '02.md'),
    fig = path.join(tmp, 'f.png');
  fs.writeFileSync(
    cuento1,
    '# Cuento de prueba\n\n## Capítulo 1. Inicio\n\nHabía una vez una frase que nadie quería subrayar.\n\n[FIGURA: f.png | Figura 1. Un punto.]\n'
  );
  fs.writeFileSync(cuento2, '## Capítulo 2. Final\n\nY colorín colorado.\n');
  fs.copyFileSync(path.join(MUESTRAS, 'ejemplo.docx'), path.join(tmp, 'no-es.png'));
  fs.writeFileSync(
    fig,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
  );
  const cuento = await importar(page, [cuento2, cuento1, fig]);
  check(
    /«Cuento de prueba»: 3 secciones, 3 bloques \(md\)/.test(cuento.resumen),
    `varios .md se leen en orden de nombre, con sus imágenes (${cuento.resumen})`
  );
  await page.click('nav a.sec:has-text("Inicio")');
  await seleccionarTexto(page, 'nadie quería subrayar');
  await page.keyboard.press('2');
  await page.waitForSelector('mark.hl.c-cortar');
  fs.writeFileSync(
    cuento1,
    '# Cuento de prueba\n\n## Capítulo 1. Inicio\n\nUn párrafo nuevo antes de todo.\n\nHabía una vez una frase que nadie quería subrayar, ahora más larga.\n\n[FIGURA: f.png | Figura 1. Un punto.]\n'
  );
  const otra = await importar(page, [cuento1, cuento2, fig], { choque: 'reemplazar' });
  check(
    otra.choque && /Reemplazar y abrir/.test(otra.boton),
    'reimportar un libro con el mismo título ofrece reemplazarlo'
  );
  await page.click('nav a.sec:has-text("Inicio")');
  const reubicada = await page.evaluate(() => ({
    marca: (document.querySelector('mark.hl.c-cortar') || {}).textContent,
    bloques: document.querySelectorAll('article.seccion:not([hidden]) p.bloque').length,
  }));
  const nLibros = await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('lector-anotaciones', 1);
        r.onsuccess = () => {
          const q = r.result.transaction('libros').objectStore('libros').getAllKeys();
          q.onsuccess = () => res(q.result);
        };
      })
  );
  check(
    reubicada.marca === 'nadie quería subrayar' &&
      reubicada.bloques === 2 &&
      nLibros.filter((k) => /^cuento-de-prueba/.test(k)).length === 1,
    `la versión nueva reemplaza a la anterior y la anotación se reubica en su texto (${JSON.stringify(reubicada)}, ${nLibros.join(', ')})`
  );

  // errores legibles y un libro.json malicioso
  await abrirBiblioteca(page);
  await page.setInputFiles('#bib-archivo', [path.join(tmp, 'no-es.png')]);
  await esperar(page, () => /No se pudo/.test(document.querySelector('#bib-estado').textContent));
  check(
    /elige el texto del libro/.test(await page.$eval('#bib-estado', (e) => e.textContent)),
    'sólo imágenes: lo dice sin romperse'
  );
  const malo = path.join(tmp, 'malo.json');
  const L = JSON.parse(fs.readFileSync(LIBRO, 'utf8'));
  L.titulo = 'Libro malicioso';
  L.id = 'malicioso';
  L.secciones[1].bloques[0].html =
    'Texto <img src=x onerror="window.__xss=1"> <strong onclick="window.__xss=2">fuerte</strong>';
  fs.writeFileSync(malo, JSON.stringify(L));
  await importar(page, [malo]);
  await page.goto(base + '#' + L.secciones[1].id);
  await page.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  const xss = await page.evaluate(() => ({
    xss: window.__xss,
    img: document.querySelectorAll('article img[onerror], article [onclick]').length,
    fuerte: !!Array.from(document.querySelectorAll('article strong')).find((s) => s.textContent === 'fuerte'),
  }));
  check(
    xss.xss === undefined && xss.img === 0 && xss.fuerte,
    `un libro.json importado no ejecuta nada: se queda su texto y su negrita (${JSON.stringify(xss)})`
  );
  const idMalo = path.join(tmp, 'id-malo.json');
  const L2 = JSON.parse(fs.readFileSync(LIBRO, 'utf8'));
  L2.secciones[1].id = 'x"]';
  L2.secciones[1].bloques.forEach((b, i) => {
    b.id = 'x"]-b' + (i + 1);
  });
  fs.writeFileSync(idMalo, JSON.stringify(L2));
  await abrirBiblioteca(page);
  await page.setInputFiles('#bib-archivo', [idMalo]);
  await esperar(page, () => /No se pudo/.test(document.querySelector('#bib-estado').textContent));
  check(
    /caracteres no admitidos/.test(await page.$eval('#bib-estado', (e) => e.textContent)),
    'un libro.json con ids que romperían la página se rechaza al importarlo'
  );
  await page.keyboard.press('Escape');
  // borrar el libro abierto vuelve al de la página
  await abrirBiblioteca(page);
  await page.click('#bib-lista .bib-libro.abierto button:has-text("Borrar")');
  await Promise.all([
    page.waitForEvent('load'),
    page.click('#bib-lista .bib-libro.abierto button:has-text("Sí, borrar")'),
  ]);
  await page.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await abrirBiblioteca(page);
  const trasBorrar = await page.$$eval('#bib-lista .bib-libro .t', (ts) => ts.map((t) => t.textContent));
  check(
    /Libro de ejemplo/.test(await page.$eval('#sub', (s) => s.textContent)) && !trasBorrar.includes('Libro malicioso'),
    `borrar el libro abierto lo quita y vuelve al de la página (${trasBorrar.join(' · ')})`
  );
  check(errores.length === 0, `sin errores de consola${errores.length ? ': ' + errores.join(' | ') : ''}`);
  await ctx.close();
});

test('El libro elegido ya no está: aviso que no se pisa', async ({ browser }) => {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxA.addInitScript(sinBase);
  await ctxA.addInitScript(() => {
    if (!sessionStorage.getItem('__hecho')) {
      sessionStorage.setItem('__hecho', '1');
      localStorage.setItem('lector-anotaciones.abierto:/', 'local:no-existe');
    }
  });
  const pa = await ctxA.newPage();
  await pa.goto(base);
  await pa.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pa.waitForTimeout(1200);
  const aviso = await pa.evaluate(() => ({
    visible: !document.querySelector('#aviso-libro').hidden,
    texto: document.querySelector('#aviso-libro').textContent,
    eleccion: localStorage.getItem('lector-anotaciones.abierto:/'),
  }));
  check(
    aviso.visible && /ya no está/.test(aviso.texto) && aviso.eleccion === '',
    `si el libro elegido ya no está, se abre el de la página con un aviso que no se pisa y la elección se olvida (${aviso.texto.slice(0, 70)})`
  );
  await ctxA.close();
});

test('Una página sin libro propio', async ({ browser }) => {
  const ctxV = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxV.addInitScript(sinBase);
  const pv = await ctxV.newPage();
  await pv.route('**/libro.json', (r) => r.fulfill({ status: 404, body: '' }));
  await pv.goto(base);
  const vacia = await esperar(
    pv,
    () =>
      document.querySelector('#biblioteca').open &&
      /todavía no tiene un libro/.test(document.querySelector('#lectura').textContent)
  );
  check(vacia, 'sin libro.json, la página invita a importar uno y abre la biblioteca');
  const pvImp = await importar(pv, [fixture('ejemplo-ncx.epub')]);
  check(
    /Libro de muestra EPUB/.test(await pv.$eval('#sub', (s) => s.textContent)) && !!pvImp.resumen,
    'e importar un libro lo abre'
  );
  await ctxV.close();
});

test('Biblioteca compartida (base simulada)', async ({ browser }) => {
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
  for (let c = 1; c <= 12; c++) {
    texto += `## Capítulo ${c}. Parte ${c}\n\n`;
    for (let p = 0; p < 60; p++)
      texto += `Párrafo ${p} del capítulo ${c}: ${'«texto con acentos, ñandúes y comillas» '.repeat(12)}\n\n`;
  }
  fs.writeFileSync(largo, texto);
  const compartido = await importar(pb, [largo]);
  check(compartido.baseActiva, 'con base, la vista previa ofrece la biblioteca compartida');
  const partes = await pb.evaluate(() => Object.keys(window.__cols['libros/libro-largo/partes'] || {}).length);
  const ficha = await pb.evaluate(() => (window.__cols.libros || {})['libro-largo']);
  check(
    partes > 1 && ficha && ficha.partes === partes && ficha.bloques === 720,
    `el libro se guarda troceado en la base, con una ficha que cuenta sus partes (${partes} partes)`
  );
  const abiertoB = await pb.evaluate(() => ({
    sub: document.querySelector('#sub').textContent,
    secciones: document.querySelectorAll('nav a.sec').length,
  }));
  check(
    /Libro largo/.test(abiertoB.sub) && abiertoB.secciones === 13,
    `y se vuelve a armar al abrirlo (${abiertoB.secciones} secciones)`
  );
  await pb.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  await pb.click('nav a.sec:has-text("Parte 3")');
  await seleccionarTexto(pb, 'Párrafo 7 del capítulo 3');
  await pb.keyboard.press('1');
  await esperar(pb, () => Object.keys(window.__cols['libros/libro-largo/anotaciones'] || {}).length === 1);
  check(
    (await pb.evaluate(() => Object.keys(window.__cols['libros/libro-largo/anotaciones'] || {}).length)) === 1 &&
      (await pb.evaluate(() => Object.keys(window.__cols.anotaciones || {}).length)) === 0,
    'las anotaciones del libro compartido van a su propia colección'
  );
  // un reemplazo que falla a mitad no mezcla versiones: el libro sigue siendo el anterior, entero
  const fichaAntes = await pb.evaluate(() => JSON.parse(JSON.stringify(window.__cols.libros['libro-largo'])));
  await pb.evaluate(() =>
    sessionStorage.setItem(
      '__fallos',
      JSON.stringify({ '^libros/libro-largo/partes/.*-3$': { code: 'quota_exceeded', veces: 1 } })
    )
  );
  fs.writeFileSync(largo, texto.replace(/Párrafo/g, 'Parágrafo'));
  await abrirBiblioteca(pb);
  await pb.setInputFiles('#bib-archivo', [largo]);
  await pb.waitForSelector('#bib-previa:not([hidden])');
  await pb.click('#bib-importar');
  await esperar(pb, () => /No se pudo guardar/.test(document.querySelector('#bib-estado').textContent), null, 10000);
  const trasFallo = await pb.evaluate(
    (v) => ({
      estado: document.querySelector('#bib-estado').textContent,
      ficha: window.__cols.libros['libro-largo'],
      partes: Object.keys(window.__cols['libros/libro-largo/partes']).filter((k) => k.indexOf(v + '-') === 0).length,
      sueltas: Object.keys(window.__cols['libros/libro-largo/partes']).filter((k) => k.indexOf(v + '-') !== 0).length,
    }),
    fichaAntes.version
  );
  check(
    /quota_exceeded/.test(trasFallo.estado) &&
      trasFallo.ficha.version === fichaAntes.version &&
      trasFallo.partes === fichaAntes.partes &&
      trasFallo.sueltas === 0,
    `un reemplazo que falla deja la ficha y las partes de la versión anterior, sin partes nuevas sueltas (${JSON.stringify({ partes: trasFallo.partes, sueltas: trasFallo.sueltas })})`
  );
  await pb.keyboard.press('Escape');
  await pb.reload();
  await pb.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  const intacto = await pb.evaluate(() => ({
    viejo:
      document.querySelectorAll('[data-pid]').length > 0 &&
      /Párrafo 0 del capítulo/.test(
        document.querySelector('#lectura').textContent +
          Array.from(document.querySelectorAll('article'))
            .map((a) => a.textContent)
            .join('')
      ),
    nuevo: Array.from(document.querySelectorAll('article')).some((a) => /Parágrafo/.test(a.textContent)),
  }));
  check(intacto.viejo && !intacto.nuevo, 'y al reabrirlo se lee la versión anterior completa');
  // una escritura en vuelo (lenta y rechazada) al cambiar de libro no se pierde
  await pb.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  await pb.evaluate(() =>
    sessionStorage.setItem(
      '__fallos',
      JSON.stringify({ '^libros/libro-largo/anotaciones/': { code: 'unavailable', veces: 2, demora: 1200 } })
    )
  );
  await pb.click('nav a.sec:has-text("Parte 5")');
  await seleccionarTexto(pb, 'Párrafo 9 del capítulo 5');
  await pb.keyboard.press('2');
  await abrirBiblioteca(pb);
  await Promise.all([
    pb.waitForEvent('load', { timeout: 15000 }),
    pb.click('#bib-lista .bib-libro:not(.abierto) button:has-text("Abrir")'),
  ]);
  await pb.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  const copia = await pb.evaluate(() => localStorage.getItem('lector-anotaciones:base:libro-largo') || '');
  check(
    /Párrafo 9 del capítulo 5/.test(copia),
    'una anotación cuya escritura seguía en vuelo al cambiar de libro queda en la copia del navegador'
  );
  await abrirBiblioteca(pb);
  await Promise.all([
    pb.waitForEvent('load', { timeout: 15000 }),
    pb.click('#bib-lista .bib-libro:has-text("Libro largo") button:has-text("Abrir")'),
  ]);
  await pb.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  const subida = await esperar(
    pb,
    () =>
      Object.values(window.__cols['libros/libro-largo/anotaciones'] || {}).some((a) =>
        /Párrafo 9 del capítulo 5/.test(a.cita)
      ),
    null,
    6000
  );
  check(subida, 'y al volver a ese libro sube a la base');
  // si la lista compartida no se puede leer, no se ofrece guardar en ella
  await pb.evaluate(() => sessionStorage.setItem('__fallaLista', '1'));
  await abrirBiblioteca(pb);
  await pb.setInputFiles('#bib-archivo', [fixture('ejemplo.epub')]);
  await pb.waitForSelector('#bib-previa:not([hidden])');
  const sinLista = await pb.evaluate(() => ({
    intro: document.querySelector('#bib-intro').textContent,
    base: document.querySelector('input[name="bib-donde"][value="base"]').disabled,
  }));
  check(
    /No se pudo leer la biblioteca compartida/.test(sinLista.intro) && sinLista.base,
    'si la lista compartida no se puede leer, la importación sólo se ofrece en este navegador'
  );
  await pb.evaluate(() => sessionStorage.removeItem('__fallaLista'));
  check(erroresB.length === 0, `sin errores de consola con base${erroresB.length ? ': ' + erroresB.join(' | ') : ''}`);
  await ctxB.close();
});

// Lo que la medición de cobertura de la 0.6 encontró sin probar: importar HTML y texto plano, y borrar un libro de la
// biblioteca compartida.
test('Importar un HTML y un texto plano', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(sinBase);
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  const html = path.join(tmp, 'cuento.html');
  fs.writeFileSync(
    html,
    '<!doctype html><html><head><meta charset="utf-8"><title>Un cuento breve</title>' +
      '<meta name="author" content="Autora Html"></head><body>' +
      '<h1>Primera parte</h1><p>Era una vez un <em>hecho</em> observado.</p>' +
      '<ul><li>Uno</li><li>Dos</li></ul>' +
      '<h1>Segunda parte</h1><p>Y otro que se infirió.</p></body></html>'
  );
  const previa = await importar(page, [html]);
  check(
    previa.titulo === 'Un cuento breve' && previa.autor === 'Autora Html',
    `el HTML da el título y el autor de su cabecera (${JSON.stringify({ t: previa.titulo, a: previa.autor })})`
  );
  const leidoHtml = await page.evaluate(() => ({
    secciones: Array.from(document.querySelectorAll('nav a.sec')).map((a) => a.textContent.replace(/\d+$/, '')),
    texto: document.querySelector('article.seccion:not([hidden])').textContent,
    lista: document.querySelectorAll('article.seccion:not([hidden]) ul li').length,
  }));
  check(
    leidoHtml.secciones.join('|') === 'Primera parte|Segunda parte' &&
      /Era una vez un hecho observado/.test(leidoHtml.texto) &&
      leidoHtml.lista === 2,
    `cada h1 abre una sección, con sus párrafos y listas (${JSON.stringify(leidoHtml)})`
  );
  const txt = path.join(tmp, 'diario.txt');
  fs.writeFileSync(
    txt,
    'Notas sueltas antes del primer capítulo.\n\nCAPÍTULO I\n\nLa primera línea del capítulo uno.\n\nCapítulo 2. El segundo\n\nTexto del segundo.\nEsta línea sigue el párrafo.\n'
  );
  await importar(page, [txt], { titulo: 'Un diario' });
  const leidoTxt = await page.evaluate(() => ({
    secciones: Array.from(document.querySelectorAll('nav a.sec')).map((a) => a.textContent.replace(/\d+$/, '')),
    todo: Array.from(document.querySelectorAll('article.seccion'))
      .map((a) => a.textContent)
      .join(' | '),
  }));
  check(
    leidoTxt.secciones.includes('CAPÍTULO I') &&
      leidoTxt.secciones.includes('Capítulo 2. El segundo') &&
      /Texto del segundo\. Esta línea sigue el párrafo\./.test(leidoTxt.todo),
    `en un .txt, las líneas sueltas «CAPÍTULO …» abren secciones y el resto son párrafos (${JSON.stringify(leidoTxt.secciones)})`
  );
  await ctx.close();
});

test('Borrar un libro de la biblioteca compartida', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(conBase);
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  const md = path.join(tmp, 'efimero.md');
  fs.writeFileSync(md, '# Libro efímero\n\n## Capítulo 1. Único\n\nUn párrafo que se va a borrar.\n');
  await importar(page, [md], { donde: 'base' });
  const antes = await page.evaluate(() => ({
    ficha: !!(window.__cols.libros || {})['libro-efimero'],
    partes: Object.keys(window.__cols['libros/libro-efimero/partes'] || {}).length,
  }));
  check(antes.ficha && antes.partes > 0, `el libro está en la base, con sus partes (${JSON.stringify(antes)})`);
  await abrirBiblioteca(page);
  await page.click('#bib-lista .bib-libro.abierto button:has-text("Borrar")');
  check(
    /sus anotaciones quedan en la base/.test(await page.textContent('#bib-lista .bib-libro.abierto .confirmar')),
    'la confirmación dice que las anotaciones se quedan en la base'
  );
  await Promise.all([
    page.waitForEvent('load', { timeout: 15000 }),
    page.click('#bib-lista .bib-libro.abierto button:has-text("Sí, borrar")'),
  ]);
  await page.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  const despues = await page.evaluate(() => ({
    ficha: !!(window.__cols.libros || {})['libro-efimero'],
    partes: Object.keys(window.__cols['libros/libro-efimero/partes'] || {}).length,
    sub: document.querySelector('#sub').textContent,
  }));
  check(
    !despues.ficha && despues.partes === 0 && /Libro de ejemplo/.test(despues.sub),
    `borrar el libro compartido abierto quita su ficha y sus partes y vuelve al de la página (${JSON.stringify(despues)})`
  );
  await ctx.close();
});
