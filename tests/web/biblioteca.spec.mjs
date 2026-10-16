// La biblioteca: importar libros (EPUB, Word, Markdown, HTML, texto, libro.json) desde la página, abrirlos, anotarlos,
// reemplazarlos por una versión nueva sin perder las anotaciones, exportarlos y borrarlos; la página sin libro propio;
// la biblioteca compartida en una base simulada (troceo y lectura de vuelta); y un libro.json malicioso que no debe
// ejecutar nada.
//
// Uso: npx playwright test biblioteca (antes: construir el ejemplo, ver tests/web/ayudas.mjs)
// Variables: LIBRO_JSON, CHROMIUM, LISTAR=1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LIBRO,
  ESCRITORIO,
  check,
  esperar,
  conectado,
  seleccionarTexto,
  sinErrores,
  test as pruebaWeb,
} from './ayudas.mjs';

const MUESTRAS = fileURLToPath(new URL('../fixtures/', import.meta.url));
const muestra = (n) => path.join(MUESTRAS, n);
const BLOQUES = 'article.seccion:not([hidden]) .bloque[data-pid]';
// Leer e importar un libro tarda más que lo habitual: las esperas de este archivo son de 6 s (no los 5 de `esperar`).
const PLAZO = 6000;

// Cada prueba escribe los archivos que importa en una carpeta propia (tests/web/.tmp-*), que se borra al terminar.
const test = pruebaWeb.extend({
  tmp: async ({}, use) => {
    const d = fs.mkdtempSync(fileURLToPath(new URL('./.tmp-', import.meta.url)));
    await use(d);
    fs.rmSync(d, { recursive: true, force: true });
  },
});

// Base simulada propia de la biblioteca. Difiere de `conBase` (ayudas.mjs) en que sobrevive a las recargas (la
// biblioteca recarga para abrir otro libro: se guarda en sessionStorage), anida colecciones (`libros/<id>/partes`), lee
// documentos y colecciones con `get()`, y hace fallar las escrituras que se le piden o la lectura de la lista de libros.
// Deja sus colecciones en `window.__cols`.
const conBasePersistente = () => {
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
// Importa `archivos` desde la biblioteca y espera a que el libro se abra; devuelve lo que mostró la vista previa (o el
// error, si no la hubo). `opciones`: titulo, choque ('reemplazar'…), donde ('base'…), antes (`async () => ({…})`).
async function importar(page, archivos, opciones = {}) {
  await abrirBiblioteca(page);
  await page.setInputFiles('#bib-archivo', archivos);
  const listo = await esperar(
    page,
    () =>
      !document.querySelector('#bib-previa').hidden ||
      /No se pudo/.test(document.querySelector('#bib-estado').textContent),
    null,
    PLAZO
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
  await page.waitForSelector(BLOQUES);
  return previa;
}

// ------------------------------------------------------------ sin base: importar, anotar, exportar y borrar
// La página sin base, abierta en su portada, con descargas. Un diálogo que la página abriera por su cuenta cuenta como
// error de la página.
const paginaSinBase = (abrir) =>
  abrir({
    hash: '',
    contexto: { ...ESCRITORIO, acceptDownloads: true },
    preparar: (p) =>
      p.on('dialog', (d) => {
        p.errores.push('diálogo inesperado: ' + d.message());
        d.dismiss();
      }),
  });

test('Sin base, la biblioteca muestra el libro de la página como abierto y avisa que lo importado queda en este navegador', async ({
  abrir,
}) => {
  const p = await paginaSinBase(abrir);
  await abrirBiblioteca(p);
  const lista0 = await p.$$eval('#bib-lista .bib-libro', (ls) =>
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
    /sólo en este navegador/.test(await p.$eval('#bib-intro', (e) => e.textContent)),
    'sin base, la biblioteca avisa que lo importado queda en este navegador'
  );
  sinErrores(p, 'al abrir la biblioteca', { consola: true });
});

// El EPUB de muestra importado (y abierto) en la página sin base; devuelve la vista previa que mostró.
async function conEpub(abrir) {
  const p = await paginaSinBase(abrir);
  const previa = await importar(p, [muestra('ejemplo.epub')]);
  return { p, previa };
}
// Un subrayado «duda» en el capítulo 1 del EPUB abierto.
async function anotarEpub(p) {
  await p.click('nav a.sec:has-text("Capítulo 1")');
  check(await seleccionarTexto(p, 'Un hecho es lo que se'), 'se puede seleccionar texto del libro importado');
  await p.keyboard.press('3');
  await p.waitForSelector('mark.hl.c-duda');
}
// El EPUB anotado y la página recargada: como quedaba antes de volver al libro de la página.
async function epubAnotado(abrir) {
  const { p } = await conEpub(abrir);
  await anotarEpub(p);
  await p.reload();
  await p.waitForSelector(BLOQUES);
  return p;
}
// Vuelve al libro de la página desde la biblioteca; devuelve la lista de libros que mostraba antes de volver.
async function volverAlDeLaPagina(p) {
  await abrirBiblioteca(p);
  const lista = await p.$$eval('#bib-lista .bib-libro', (ls) =>
    ls.map((l) => l.querySelector('.t').textContent + (l.classList.contains('abierto') ? ' (abierto)' : ''))
  );
  await Promise.all([p.waitForEvent('load'), p.click('#bib-lista .bib-libro:not(.abierto) button:has-text("Abrir")')]);
  await p.waitForSelector(BLOQUES);
  return lista;
}

test('Importar un EPUB: la vista previa lo resume; se abre con su índice, su figura como imagen y su HTML sólo como texto', async ({
  abrir,
}) => {
  const { p, previa: epub } = await conEpub(abrir);
  check(
    /«Libro de muestra EPUB»: 3 secciones, 11 bloques \(epub\)/.test(epub.resumen) &&
      epub.autor === 'Autora de Muestra' &&
      !epub.baseActiva &&
      !epub.choque &&
      /Importar y abrir/.test(epub.boton),
    `la vista previa resume el EPUB y, sin base, sólo ofrece este navegador (${epub.resumen})`
  );
  const abierto = await p.evaluate(() => ({
    sub: document.querySelector('#sub').textContent,
    indice: Array.from(document.querySelectorAll('nav a.sec')).map((a) => a.textContent),
    img: (document.querySelector('figure img') || {}).src || '',
    escapado: Array.from(document.querySelectorAll('p.bloque')).some((e) => e.textContent.includes('<etiqueta> & más')),
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
  sinErrores(p, 'al importar un EPUB', { consola: true });
});

test('Anotar un EPUB importado: la anotación va a la clave de ese libro, la elección del abierto vive aparte, y al recargar sigue abierto', async ({
  abrir,
}) => {
  const { p } = await conEpub(abrir);
  await anotarEpub(p);
  const claveEpub = await p.evaluate(() =>
    Object.keys(localStorage).find((k) => k === 'lector-anotaciones:local:libro-de-muestra-epub')
  );
  check(
    !!claveEpub && /Un hecho es lo que se/.test(await p.evaluate((k) => localStorage.getItem(k), claveEpub)),
    'su anotación se guarda con la clave de ese libro, que lleva su lugar (local:)'
  );
  const eleccion = await p.evaluate(() => Object.keys(localStorage).filter((k) => /abierto/.test(k)));
  check(
    eleccion.length === 1 && /^lector-anotaciones\.abierto:\//.test(eleccion[0]),
    `la elección del libro abierto vive fuera de las claves de los libros (${eleccion.join(', ')})`
  );
  await p.reload();
  await p.waitForSelector(BLOQUES);
  check(
    /Libro de muestra EPUB/.test(await p.$eval('#sub', (s) => s.textContent)) &&
      (await p.$$('mark.hl.c-duda')).length === 1,
    'al recargar sigue abierto el libro importado, con su anotación'
  );
  sinErrores(p, 'al anotar un EPUB', { consola: true });
});

test('Volver al libro de la página: la biblioteca lista los dos, y el de la página se abre sin las anotaciones del otro', async ({
  abrir,
}) => {
  const p = await epubAnotado(abrir);
  const lista1 = await volverAlDeLaPagina(p);
  check(
    lista1.length === 2 && lista1.includes('Libro de muestra EPUB (abierto)'),
    `la biblioteca lista los dos libros (${lista1.join(' · ')})`
  );
  check(
    /Libro de ejemplo/.test(await p.$eval('#sub', (s) => s.textContent)) && (await p.$$('mark.hl')).length === 0,
    'abrir el libro de la página lo muestra sin las anotaciones del otro'
  );
  sinErrores(p, 'al volver al libro de la página', { consola: true });
});

test('Exportar el libro de la página a Markdown lo descarga en el dialecto del lector', async ({ abrir, tmp }) => {
  // de vuelta al libro de la página tras importar y anotar un EPUB, como en el recorrido original
  const p = await epubAnotado(abrir);
  await volverAlDeLaPagina(p);
  await abrirBiblioteca(p);
  const [descarga] = await Promise.all([
    p.waitForEvent('download'),
    p.click('#bib-lista .bib-libro.abierto button:has-text("Markdown")'),
  ]);
  const destino = path.join(tmp, descarga.suggestedFilename());
  await descarga.saveAs(destino);
  const md = fs.readFileSync(destino, 'utf8');
  check(
    descarga.suggestedFilename() === 'libro-de-ejemplo.md' && /^## Capítulo 1\./m.test(md),
    `exportar a Markdown descarga el libro en el dialecto del lector (${descarga.suggestedFilename()}, ${md.length} caracteres)`
  );
  sinErrores(p, 'al exportar a Markdown', { consola: true });
});

// Desde aquí, cada importación parte de la página recién abierta: lo que el recorrido original había importado antes
// (otros títulos, sin choque) no cambia cómo se lee el archivo nuevo.
test('Importar un Word: título y autor del documento; párrafos, subtítulo, listas, cita, tabla y figura, sin el texto borrado', async ({
  abrir,
}) => {
  const p = await paginaSinBase(abrir);
  const docx = await importar(p, [muestra('ejemplo.docx')]);
  const word = await p.evaluate(() => ({
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
  sinErrores(p, 'al importar un Word', { consola: true });
});

test('Varios .md se leen en orden de nombre con su imagen; una versión nueva reemplaza a la anterior y reubica la anotación', async ({
  abrir,
  tmp,
}) => {
  const p = await paginaSinBase(abrir);
  const cuento1 = path.join(tmp, '01.md'),
    cuento2 = path.join(tmp, '02.md'),
    fig = path.join(tmp, 'f.png');
  fs.writeFileSync(
    cuento1,
    '# Cuento de prueba\n\n## Capítulo 1. Inicio\n\nHabía una vez una frase que nadie quería subrayar.\n\n[FIGURA: f.png | Figura 1. Un punto.]\n'
  );
  fs.writeFileSync(cuento2, '## Capítulo 2. Final\n\nY colorín colorado.\n');
  fs.writeFileSync(
    fig,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
  );
  const cuento = await importar(p, [cuento2, cuento1, fig]);
  check(
    /«Cuento de prueba»: 3 secciones, 3 bloques \(md\)/.test(cuento.resumen),
    `varios .md se leen en orden de nombre, con sus imágenes (${cuento.resumen})`
  );
  await p.click('nav a.sec:has-text("Inicio")');
  await seleccionarTexto(p, 'nadie quería subrayar');
  await p.keyboard.press('2');
  await p.waitForSelector('mark.hl.c-cortar');
  fs.writeFileSync(
    cuento1,
    '# Cuento de prueba\n\n## Capítulo 1. Inicio\n\nUn párrafo nuevo antes de todo.\n\nHabía una vez una frase que nadie quería subrayar, ahora más larga.\n\n[FIGURA: f.png | Figura 1. Un punto.]\n'
  );
  const otra = await importar(p, [cuento1, cuento2, fig], { choque: 'reemplazar' });
  check(
    otra.choque && /Reemplazar y abrir/.test(otra.boton),
    'reimportar un libro con el mismo título ofrece reemplazarlo'
  );
  await p.click('nav a.sec:has-text("Inicio")');
  const reubicada = await p.evaluate(() => ({
    marca: (document.querySelector('mark.hl.c-cortar') || {}).textContent,
    bloques: document.querySelectorAll('article.seccion:not([hidden]) p.bloque').length,
  }));
  const nLibros = await p.evaluate(
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
  sinErrores(p, 'al importar y reemplazar un Markdown', { consola: true });
});

test('Importar sólo imágenes lo dice sin romperse', async ({ abrir, tmp }) => {
  const p = await paginaSinBase(abrir);
  const noEs = path.join(tmp, 'no-es.png');
  fs.copyFileSync(muestra('ejemplo.docx'), noEs);
  await abrirBiblioteca(p);
  await p.setInputFiles('#bib-archivo', [noEs]);
  await esperar(p, () => /No se pudo/.test(document.querySelector('#bib-estado').textContent), null, PLAZO);
  check(
    /elige el texto del libro/.test(await p.$eval('#bib-estado', (e) => e.textContent)),
    'sólo imágenes: lo dice sin romperse'
  );
  sinErrores(p, 'al importar sólo imágenes', { consola: true });
});

// Un libro.json con HTML que intentaría ejecutar código, importado y abierto en la sección que lo lleva.
async function maliciosoAbierto(abrir, base, tmp) {
  const p = await paginaSinBase(abrir);
  const malo = path.join(tmp, 'malo.json');
  const L = JSON.parse(fs.readFileSync(LIBRO, 'utf8'));
  L.titulo = 'Libro malicioso';
  L.id = 'malicioso';
  L.secciones[1].bloques[0].html =
    'Texto <img src=x onerror="window.__xss=1"> <strong onclick="window.__xss=2">fuerte</strong>';
  fs.writeFileSync(malo, JSON.stringify(L));
  await importar(p, [malo]);
  await p.goto(base + '#' + L.secciones[1].id);
  await p.waitForSelector(BLOQUES);
  return p;
}

test('Un libro.json importado no ejecuta nada; uno con ids que romperían la página se rechaza', async ({
  abrir,
  base,
  tmp,
}) => {
  const p = await maliciosoAbierto(abrir, base, tmp);
  const xss = await p.evaluate(() => ({
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
  await abrirBiblioteca(p);
  await p.setInputFiles('#bib-archivo', [idMalo]);
  await esperar(p, () => /No se pudo/.test(document.querySelector('#bib-estado').textContent), null, PLAZO);
  check(
    /caracteres no admitidos/.test(await p.$eval('#bib-estado', (e) => e.textContent)),
    'un libro.json con ids que romperían la página se rechaza al importarlo'
  );
  sinErrores(p, 'con un libro.json malicioso', { consola: true });
});

test('Borrar el libro abierto lo quita de la biblioteca y vuelve al libro de la página', async ({
  abrir,
  base,
  tmp,
}) => {
  const p = await maliciosoAbierto(abrir, base, tmp);
  await abrirBiblioteca(p);
  await p.click('#bib-lista .bib-libro.abierto button:has-text("Borrar")');
  await Promise.all([p.waitForEvent('load'), p.click('#bib-lista .bib-libro.abierto button:has-text("Sí, borrar")')]);
  await p.waitForSelector(BLOQUES);
  await abrirBiblioteca(p);
  const trasBorrar = await p.$$eval('#bib-lista .bib-libro .t', (ts) => ts.map((t) => t.textContent));
  check(
    /Libro de ejemplo/.test(await p.$eval('#sub', (s) => s.textContent)) && !trasBorrar.includes('Libro malicioso'),
    `borrar el libro abierto lo quita y vuelve al de la página (${trasBorrar.join(' · ')})`
  );
  sinErrores(p, 'al borrar el libro abierto', { consola: true });
});

// ------------------------------------------------------------ el libro elegido y la página sin libro
test('Si el libro elegido ya no está, se abre el de la página con un aviso que no se pisa y la elección se olvida', async ({
  abrir,
}) => {
  const p = await abrir({
    hash: '',
    // la elección apunta a un libro que no existe, sólo en la primera carga
    previo: [
      () => {
        if (!sessionStorage.getItem('__hecho')) {
          sessionStorage.setItem('__hecho', '1');
          localStorage.setItem('lector-anotaciones.abierto:/', 'local:no-existe');
        }
      },
    ],
  });
  await p.waitForTimeout(1200);
  const aviso = await p.evaluate(() => ({
    visible: !document.querySelector('#aviso-libro').hidden,
    texto: document.querySelector('#aviso-libro').textContent,
    eleccion: localStorage.getItem('lector-anotaciones.abierto:/'),
  }));
  check(
    aviso.visible && /ya no está/.test(aviso.texto) && aviso.eleccion === '',
    `si el libro elegido ya no está, se abre el de la página con un aviso que no se pisa y la elección se olvida (${aviso.texto.slice(0, 70)})`
  );
});

test('Una página sin libro propio invita a importar uno con la biblioteca abierta, e importarlo lo abre', async ({
  abrir,
}) => {
  const p = await abrir({
    hash: '',
    esperar: null,
    preparar: (p) => p.route('**/libro.json', (r) => r.fulfill({ status: 404, body: '' })),
  });
  const vacia = await esperar(
    p,
    () =>
      document.querySelector('#biblioteca').open &&
      /todavía no tiene un libro/.test(document.querySelector('#lectura').textContent),
    null,
    PLAZO
  );
  check(vacia, 'sin libro.json, la página invita a importar uno y abre la biblioteca');
  const imp = await importar(p, [muestra('ejemplo-ncx.epub')]);
  check(
    /Libro de muestra EPUB/.test(await p.$eval('#sub', (s) => s.textContent)) && !!imp.resumen,
    'e importar un libro lo abre'
  );
});

// Lo que encontró el tipado estricto del importador (0.6): un atributo que falta era la clave «null», así que un ítem
// sin id y una referencia sin idref se juntaban en un capítulo que el libro no tiene.
test('Un EPUB mal formado (un ítem sin id, una referencia sin idref) no suma un capítulo fantasma', async ({
  abrir,
}) => {
  const p = await paginaSinBase(abrir);
  const imp = await importar(p, [muestra('ejemplo-sin-ids.epub')]);
  const secciones = await p.$$eval('nav a.sec', (as) => as.map((a) => a.textContent));
  check(
    !imp.error &&
      secciones.some((t) => /Capítulo 1/.test(t)) &&
      secciones.some((t) => /Capítulo 2/.test(t)) &&
      !secciones.some((t) => /fantasma/i.test(t)),
    `importa los dos capítulos, el segundo con su título del índice, y nada más (${JSON.stringify({ error: imp.error, secciones })})`
  );
  sinErrores(p, 'al importar un EPUB mal formado');
});

// ------------------------------------------------------------ la biblioteca compartida (base simulada)
// Con la base que sobrevive a las recargas, la página en su portada.
const conBiblioteca = (abrir) => abrir({ hash: '', modo: 'ninguno', previo: [conBasePersistente] });
// Un libro largo (12 capítulos de 60 párrafos) importado a la biblioteca compartida, que lo trocea; devuelve la vista
// previa, el archivo y su texto. Con `anotado`, además, un subrayado en la parte 3 una vez conectada, ya guardado en la
// base: lo que el recorrido original tenía hecho antes de reemplazar el libro o de cambiar de libro.
async function libroLargo(abrir, tmp, { anotado = false } = {}) {
  const p = await conBiblioteca(abrir);
  const largo = path.join(tmp, 'largo.md');
  let texto = '# Libro largo\n\n';
  for (let c = 1; c <= 12; c++) {
    texto += `## Capítulo ${c}. Parte ${c}\n\n`;
    for (let i = 0; i < 60; i++)
      texto += `Párrafo ${i} del capítulo ${c}: ${'«texto con acentos, ñandúes y comillas» '.repeat(12)}\n\n`;
  }
  fs.writeFileSync(largo, texto);
  const previa = await importar(p, [largo]);
  if (anotado) {
    await conectado(p);
    await p.click('nav a.sec:has-text("Parte 3")');
    await seleccionarTexto(p, 'Párrafo 7 del capítulo 3');
    await p.keyboard.press('1');
    await esperar(
      p,
      () => Object.keys(window.__cols['libros/libro-largo/anotaciones'] || {}).length === 1,
      null,
      PLAZO
    );
  }
  return { p, previa, largo, texto };
}

test('Biblioteca compartida: un libro largo se guarda troceado, con una ficha que cuenta sus partes, y se rearma al abrirlo', async ({
  abrir,
  tmp,
}) => {
  const { p, previa } = await libroLargo(abrir, tmp);
  check(previa.baseActiva, 'con base, la vista previa ofrece la biblioteca compartida');
  const partes = await p.evaluate(() => Object.keys(window.__cols['libros/libro-largo/partes'] || {}).length);
  const ficha = await p.evaluate(() => (window.__cols.libros || {})['libro-largo']);
  check(
    partes > 1 && ficha && ficha.partes === partes && ficha.bloques === 720,
    `el libro se guarda troceado en la base, con una ficha que cuenta sus partes (${partes} partes)`
  );
  const abiertoB = await p.evaluate(() => ({
    sub: document.querySelector('#sub').textContent,
    secciones: document.querySelectorAll('nav a.sec').length,
  }));
  check(
    /Libro largo/.test(abiertoB.sub) && abiertoB.secciones === 13,
    `y se vuelve a armar al abrirlo (${abiertoB.secciones} secciones)`
  );
  sinErrores(p, 'al trocear un libro compartido');
});

test('Biblioteca compartida: las anotaciones de un libro compartido van a su propia colección', async ({
  abrir,
  tmp,
}) => {
  const { p } = await libroLargo(abrir, tmp, { anotado: true });
  check(
    (await p.evaluate(() => Object.keys(window.__cols['libros/libro-largo/anotaciones'] || {}).length)) === 1 &&
      (await p.evaluate(() => Object.keys(window.__cols.anotaciones || {}).length)) === 0,
    'las anotaciones del libro compartido van a su propia colección'
  );
  sinErrores(p, 'al anotar un libro compartido');
});

test('Biblioteca compartida: un reemplazo que falla a mitad no mezcla versiones, y al reabrir se lee la anterior entera', async ({
  abrir,
  tmp,
}) => {
  const { p, largo, texto } = await libroLargo(abrir, tmp, { anotado: true });
  const fichaAntes = await p.evaluate(() => JSON.parse(JSON.stringify(window.__cols.libros['libro-largo'])));
  await p.evaluate(() =>
    sessionStorage.setItem(
      '__fallos',
      JSON.stringify({ '^libros/libro-largo/partes/.*-3$': { code: 'quota_exceeded', veces: 1 } })
    )
  );
  fs.writeFileSync(largo, texto.replace(/Párrafo/g, 'Parágrafo'));
  await abrirBiblioteca(p);
  await p.setInputFiles('#bib-archivo', [largo]);
  await p.waitForSelector('#bib-previa:not([hidden])');
  await p.click('#bib-importar');
  await esperar(p, () => /No se pudo guardar/.test(document.querySelector('#bib-estado').textContent), null, 10000);
  const trasFallo = await p.evaluate(
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
  await p.keyboard.press('Escape');
  await p.reload();
  await p.waitForSelector(BLOQUES);
  const intacto = await p.evaluate(() => ({
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
  sinErrores(p, 'al fallar el reemplazo de un libro compartido');
});

test('Biblioteca compartida: una anotación en vuelo al cambiar de libro queda en la copia del navegador y sube al volver', async ({
  abrir,
  tmp,
}) => {
  // el reemplazo fallido que la precedía en el recorrido original no deja nada (lo comprueba la prueba anterior)
  const { p } = await libroLargo(abrir, tmp, { anotado: true });
  await conectado(p);
  // la escritura de la anotación tarda y se rechaza dos veces: sigue en vuelo al cambiar de libro
  await p.evaluate(() =>
    sessionStorage.setItem(
      '__fallos',
      JSON.stringify({ '^libros/libro-largo/anotaciones/': { code: 'unavailable', veces: 2, demora: 1200 } })
    )
  );
  await p.click('nav a.sec:has-text("Parte 5")');
  await seleccionarTexto(p, 'Párrafo 9 del capítulo 5');
  await p.keyboard.press('2');
  await abrirBiblioteca(p);
  await Promise.all([
    p.waitForEvent('load', { timeout: 15000 }),
    p.click('#bib-lista .bib-libro:not(.abierto) button:has-text("Abrir")'),
  ]);
  await p.waitForSelector(BLOQUES);
  const copia = await p.evaluate(() => localStorage.getItem('lector-anotaciones:base:libro-largo') || '');
  check(
    /Párrafo 9 del capítulo 5/.test(copia),
    'una anotación cuya escritura seguía en vuelo al cambiar de libro queda en la copia del navegador'
  );
  await abrirBiblioteca(p);
  await Promise.all([
    p.waitForEvent('load', { timeout: 15000 }),
    p.click('#bib-lista .bib-libro:has-text("Libro largo") button:has-text("Abrir")'),
  ]);
  await p.waitForSelector(BLOQUES);
  const subida = await esperar(
    p,
    () =>
      Object.values(window.__cols['libros/libro-largo/anotaciones'] || {}).some((a) =>
        /Párrafo 9 del capítulo 5/.test(a.cita)
      ),
    null,
    PLAZO
  );
  check(subida, 'y al volver a ese libro sube a la base');
  sinErrores(p, 'al cambiar de libro con una escritura en vuelo');
});

test('Biblioteca compartida: si su lista no se puede leer, la importación sólo se ofrece en este navegador', async ({
  abrir,
  tmp,
}) => {
  const { p } = await libroLargo(abrir, tmp, { anotado: true });
  await p.evaluate(() => sessionStorage.setItem('__fallaLista', '1'));
  await abrirBiblioteca(p);
  await p.setInputFiles('#bib-archivo', [muestra('ejemplo.epub')]);
  await p.waitForSelector('#bib-previa:not([hidden])');
  const sinLista = await p.evaluate(() => ({
    intro: document.querySelector('#bib-intro').textContent,
    base: document.querySelector('input[name="bib-donde"][value="base"]').disabled,
  }));
  check(
    /No se pudo leer la biblioteca compartida/.test(sinLista.intro) && sinLista.base,
    'si la lista compartida no se puede leer, la importación sólo se ofrece en este navegador'
  );
  sinErrores(p, 'sin poder leer la lista compartida');
});

test('Borrar un libro de la biblioteca compartida: la confirmación dice que sus anotaciones se quedan, y se van su ficha y sus partes', async ({
  abrir,
  tmp,
}) => {
  const p = await conBiblioteca(abrir);
  const md = path.join(tmp, 'efimero.md');
  fs.writeFileSync(md, '# Libro efímero\n\n## Capítulo 1. Único\n\nUn párrafo que se va a borrar.\n');
  await importar(p, [md], { donde: 'base' });
  const antes = await p.evaluate(() => ({
    ficha: !!(window.__cols.libros || {})['libro-efimero'],
    partes: Object.keys(window.__cols['libros/libro-efimero/partes'] || {}).length,
  }));
  check(antes.ficha && antes.partes > 0, `el libro está en la base, con sus partes (${JSON.stringify(antes)})`);
  await abrirBiblioteca(p);
  await p.click('#bib-lista .bib-libro.abierto button:has-text("Borrar")');
  check(
    /sus anotaciones quedan en la base/.test(await p.textContent('#bib-lista .bib-libro.abierto .confirmar')),
    'la confirmación dice que las anotaciones se quedan en la base'
  );
  await Promise.all([
    p.waitForEvent('load', { timeout: 15000 }),
    p.click('#bib-lista .bib-libro.abierto button:has-text("Sí, borrar")'),
  ]);
  await p.waitForSelector(BLOQUES);
  const despues = await p.evaluate(() => ({
    ficha: !!(window.__cols.libros || {})['libro-efimero'],
    partes: Object.keys(window.__cols['libros/libro-efimero/partes'] || {}).length,
    sub: document.querySelector('#sub').textContent,
  }));
  check(
    !despues.ficha && despues.partes === 0 && /Libro de ejemplo/.test(despues.sub),
    `borrar el libro compartido abierto quita su ficha y sus partes y vuelve al de la página (${JSON.stringify(despues)})`
  );
});

// ------------------------------------------------------------ importar HTML y texto plano
// Lo que la medición de cobertura de la 0.6 encontró sin probar (con el borrado de un libro compartido, arriba).
test('Importar un HTML: título y autor de su cabecera; cada h1 abre una sección, con sus párrafos y listas', async ({
  abrir,
  tmp,
}) => {
  const p = await abrir({ hash: '' });
  const html = path.join(tmp, 'cuento.html');
  fs.writeFileSync(
    html,
    '<!doctype html><html><head><meta charset="utf-8"><title>Un cuento breve</title>' +
      '<meta name="author" content="Autora Html"></head><body>' +
      '<h1>Primera parte</h1><p>Era una vez un <em>hecho</em> observado.</p>' +
      '<ul><li>Uno</li><li>Dos</li></ul>' +
      '<h1>Segunda parte</h1><p>Y otro que se infirió.</p></body></html>'
  );
  const previa = await importar(p, [html]);
  check(
    previa.titulo === 'Un cuento breve' && previa.autor === 'Autora Html',
    `el HTML da el título y el autor de su cabecera (${JSON.stringify({ t: previa.titulo, a: previa.autor })})`
  );
  const leidoHtml = await p.evaluate(() => ({
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
});

test('Importar un texto plano: las líneas sueltas «CAPÍTULO …» abren secciones y el resto son párrafos', async ({
  abrir,
  tmp,
}) => {
  // en el recorrido original venía tras importar el HTML; con otro título, lo importado antes no cambia cómo se lee
  const p = await abrir({ hash: '' });
  const txt = path.join(tmp, 'diario.txt');
  fs.writeFileSync(
    txt,
    'Notas sueltas antes del primer capítulo.\n\nCAPÍTULO I\n\nLa primera línea del capítulo uno.\n\nCapítulo 2. El segundo\n\nTexto del segundo.\nEsta línea sigue el párrafo.\n'
  );
  await importar(p, [txt], { titulo: 'Un diario' });
  const leidoTxt = await p.evaluate(() => ({
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
});
