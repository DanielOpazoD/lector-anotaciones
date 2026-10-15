// Sin base: anotar, guardar en el navegador y reubicar tras un cambio del libro.
import fs from 'node:fs';

import { test } from '@playwright/test';

import {
  LIBRO,
  servir,
  check,
  esperar,
  sinBase,
  conBase,
  abrirDe,
  pulsar,
  enFicha,
  seleccionarTexto,
  seleccionar,
  libroAlterado,
  paginar,
  conCambio,
  conRepetidos,
  activo,
  CLAVE_LOCAL,
  guardadoLocal,
} from './ayudas.mjs';

let srv, base;
test.beforeAll(async () => {
  srv = await servir();
  base = `http://127.0.0.1:${srv.address().port}/`;
});
test.afterAll(() => srv.close());

test('Modo local y reubicación tras un cambio del libro', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(sinBase);
  const errores = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(`${m.text()} (${(m.location() || {}).url || 'sin url'})`);
  });
  await libroAlterado(page, conRepetidos);

  await page.goto(base);
  await page.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await page.waitForFunction(() => /Sin base compartida/.test(document.querySelector('#estado').textContent));
  check((await page.title()).startsWith('Lector · '), 'el título de la pestaña sale de libro.json');
  check((await page.$$('nav a.sec')).length >= 5, 'el índice lista las secciones');
  const abierta = await page.$eval('article.seccion:not([hidden]) h1', (h) => h.textContent);
  check(/^Capítulo 1\./.test(abierta), `se abre en la primera sección de nivel 2 (${abierta})`);

  const pid = await seleccionar(page);
  await page.waitForSelector('#sel-tb', { state: 'visible' });
  await page.click('#sel-tb .col-btn[data-c="revisar"]');
  await page.waitForSelector(`[data-pid="${pid}"] mark.hl.c-revisar`);
  check(true, 'subrayar pinta una marca con el color elegido');

  await pulsar(page, '#b-nota-cap');
  await page.waitForSelector('.ficha textarea');
  await page.fill('.ficha textarea', 'Nota de prueba de la sección');
  await page.$eval('.ficha textarea', (t) => t.blur());

  const guardado = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^lector-anotaciones:[a-z0-9-]+$/.test(x));
    return { clave: k, anots: Object.values(JSON.parse(localStorage.getItem(k) || '{}')) };
  });
  check(/^lector-anotaciones:[a-z0-9-]+$/.test(guardado.clave), `clave local por libro (${guardado.clave})`);
  check(guardado.anots.length === 2, `dos anotaciones guardadas (${guardado.anots.length})`);
  const sub = guardado.anots.find((a) => a.tipo === 'subrayado');
  const cap = guardado.anots.find((a) => a.tipo === 'capitulo');
  check(
    sub && sub.color === 'revisar' && sub.pid === pid && /:\d+$/.test(sub.src) && sub.cita.length === 20,
    'el subrayado lleva color, bloque, archivo:línea y cita exacta'
  );
  check(
    sub && typeof sub.libro === 'string' && sub.libro.length >= 10,
    `la anotación registra la versión del libro (${sub && sub.libro})`
  );
  check(
    cap && cap.nota === 'Nota de prueba de la sección' && cap.sid,
    'la nota de sección guarda su texto y su sección'
  );

  await page.reload();
  await page.waitForSelector(`[data-pid="${pid}"] mark.hl.c-revisar`);
  check(true, 'tras recargar, el subrayado vuelve a pintarse');
  await pulsar(page, '.filtro[data-f="notas"]');
  check((await page.$$('.ficha')).length === 1, 'el filtro «notas de página/sección» deja una ficha');
  await pulsar(page, '.filtro[data-f="todas"]');
  check((await page.$$('.ficha')).length === 2, 'el filtro «todas» muestra las dos');

  await page.fill('#buscar', 'inferencia');
  await page.press('#buscar', 'Enter');
  await page.waitForSelector('.res');
  check((await page.$$('.res')).length >= 1, 'la búsqueda encuentra coincidencias');

  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await pulsar(page, '#b-copiar');
  const copiado = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const json = (() => {
    try {
      return JSON.parse(copiado);
    } catch {
      return null;
    }
  })();
  check(
    json && Array.isArray(json.anotaciones) && json.anotaciones.length === 2,
    'Copiar todo (JSON) produce {libro, anotaciones[]}'
  );

  // Copiar una sola anotación como texto, y copiar una selección con su referencia.
  await page.click('.tab[data-tab="todas"]');
  await enFicha(page, `.ficha[data-id="${sub.id}"]`, 'button:has-text("Copiar")');
  const unaCopia = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    unaCopia.startsWith('[revisar] ') && unaCopia.includes(`· ${sub.src}`) && unaCopia.includes(`«${sub.cita}»`),
    'Copiar en una ficha da color, sección, página, archivo:línea y la cita'
  );
  await seleccionar(page, 25);
  await page.waitForSelector('#sel-tb', { state: 'visible' });
  await page.click('#sel-copiar');
  const selCopia = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    /^\[Capítulo 1\..*· 00_preliminares\.md:\d+\]\n«.{25}»$/.test(selCopia),
    `Copiar en la barra de selección da la referencia y el texto (${JSON.stringify(selCopia).slice(0, 80)}…)`
  );
  await page.evaluate(() => window.getSelection().removeAllRanges());
  // Se simula lo que pasa al reconstruir libro.json: la misma cita con desplazamientos viejos, la misma
  // cita atribuida al bloque siguiente (un párrafo insertado antes), y una cita que ya no existe.
  const pidSiguiente = await page.evaluate((pid) => {
    const todos = Array.from(document.querySelectorAll('article.seccion:not([hidden]) p.bloque[data-pid]')).map((p) =>
      p.getAttribute('data-pid')
    );
    return todos[todos.indexOf(pid) + 1];
  }, pid);
  await page.evaluate(
    ({ clave, pid, pidSiguiente }) => {
      const j = JSON.parse(localStorage.getItem(clave));
      const s = Object.values(j).find((a) => a.tipo === 'subrayado');
      const movida = Object.assign({}, s, { id: 'movida', inicio: s.inicio + 7, fin: s.fin + 7 });
      const corrida = Object.assign({}, s, { id: 'corrida', pid: pidSiguiente, src: 'viejo.md:1', color: 'duda' });
      const perdida = Object.assign({}, s, {
        id: 'perdida',
        cita: 'frase que no existe en ningún bloque del libro',
        color: 'cortar',
      });
      // «Dar por hecho» aparece en tres ítems de la lista del capítulo 1 y en ningún otro sitio: sin contexto es ambigua
      const repetida = Object.assign({}, s, {
        id: 'repetida',
        pid: 'cap-01-b99',
        cita: 'Dar por hecho',
        antes: '',
        despues: '',
        inicio: 0,
        fin: 13,
        color: 'duda',
      });
      // con contexto, una cita repetida se encuentra aunque otra igual aparezca en un bloque anterior
      const txtSig = document.querySelector('[data-pid="' + pidSiguiente + '"]').textContent;
      const conctx = Object.assign({}, s, {
        id: 'conctx',
        pid: 'cap-01-b99',
        cita: txtSig.slice(3, 20),
        antes: txtSig.slice(0, 3),
        despues: txtSig.slice(20, 50),
        inicio: 3,
        fin: 20,
        color: 'conservar',
      });
      // la cita aparece sin su contexto en tres bloques anteriores y con él en el cuarto: hay que recorrerlos todos
      const triple = Object.assign({}, s, {
        id: 'triple',
        cita: 'la inferencia tramposa',
        antes: 'Contexto previo ',
        despues: ' contexto posterior',
        inicio: 0,
        fin: 22,
        color: 'duda',
      });
      j.movida = movida;
      j.corrida = corrida;
      j.perdida = perdida;
      j.repetida = repetida;
      j.conctx = conctx;
      j.triple = triple;
      localStorage.setItem(clave, JSON.stringify(j));
    },
    { clave: guardado.clave, pid, pidSiguiente }
  );
  await page.reload();
  await page.waitForSelector(`[data-pid="${pid}"] mark.hl`);
  await pulsar(page, '.filtro[data-f="todas"]');
  const marcas = await page.$$eval(`[data-pid="${pid}"] mark.hl`, (ms) =>
    ms.map((m) => ({ ids: m.getAttribute('data-aids').split(' '), texto: m.textContent }))
  );
  const cubren = (id) =>
    marcas
      .filter((m) => m.ids.includes(id))
      .map((m) => m.texto)
      .join('');
  check(
    cubren('movida') === sub.cita,
    `con desplazamientos viejos, la marca vuelve a cubrir la cita exacta («${cubren('movida')}»)`
  );
  check(cubren('corrida') === sub.cita, 'atribuida al bloque siguiente, la marca vuelve al bloque donde está la cita');
  check(cubren('perdida') === '', 'una cita que ya no existe no pinta nada');
  check(cubren('repetida') === '', 'una cita corta que aparece en varios bloques sin contexto no se adivina');
  const marcasCtx = await page.$$eval('article.seccion:not([hidden]) mark.hl', (ms) =>
    ms
      .filter((m) => m.getAttribute('data-aids').split(' ').includes('conctx'))
      .map((m) => m.closest('[data-pid]').getAttribute('data-pid'))
  );
  check(
    marcasCtx.length === 1 && marcasCtx[0] === pidSiguiente,
    `una cita repetida pero con contexto se reubica en el bloque correcto aunque otro igual aparezca antes (${marcasCtx.join(',')})`
  );
  const corridaEnSiguiente = await page.$$eval(
    `[data-pid="${pidSiguiente}"] mark.hl`,
    (ms) => ms.filter((m) => m.getAttribute('data-aids').split(' ').includes('corrida')).length
  );
  check(corridaEnSiguiente === 0, 'y la anotación corrida no se pinta en el bloque equivocado');
  const marcasTriple = await page.$$eval('article.seccion:not([hidden]) mark.hl', (ms) =>
    ms
      .filter((m) => m.getAttribute('data-aids').split(' ').includes('triple'))
      .map((m) => m.closest('[data-pid]').getAttribute('data-pid'))
  );
  check(
    marcasTriple.length === 1 && marcasTriple[0] === 'cap-01-b93',
    `una cita repetida sin contexto en tres bloques se reubica en el cuarto, donde el contexto coincide (${marcasTriple.join(',') || 'ninguna'})`
  );
  const avisos = await page.$$eval('.ficha', (fs) =>
    fs.map((f) => [f.getAttribute('data-id'), (f.querySelector('.aviso-ubic') || {}).textContent || ''])
  );
  const aviso = (id) => (avisos.find((x) => x[0] === id) || [])[1] || '';
  check(
    /^Reubicado/.test(aviso('movida')) && /^Reubicado/.test(aviso('corrida')) && /otro bloque/.test(aviso('corrida')),
    'las fichas reubicadas lo dicen'
  );
  check(/^No encontrado/.test(aviso('perdida')), 'la ficha perdida lo dice y conserva la cita');
  check(aviso(sub.id) === '', 'la anotación intacta no lleva aviso');
  const guardadoDespues = await page.evaluate((clave) => JSON.parse(localStorage.getItem(clave)), guardado.clave);
  check(
    guardadoDespues.movida.inicio === sub.inicio + 7 && guardadoDespues.corrida.pid === pidSiguiente,
    'la reubicación no modifica lo guardado'
  );
  // Lo que se copia de una ficha reubicada apunta al bloque donde la cita está hoy, y lo dice; la perdida lo declara.
  await enFicha(page, '.ficha[data-id="corrida"]', 'button:has-text("Copiar")');
  const copiaCorrida = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    copiaCorrida.startsWith(`[duda] ${sub.sidTitulo} ·`) &&
      copiaCorrida.includes(`· ${sub.src} ·`) &&
      copiaCorrida.includes('reubicado') &&
      copiaCorrida.includes('(antes viejo.md:1)'),
    `Copiar en una ficha reubicada da el bloque actual y avisa (${JSON.stringify(copiaCorrida).slice(0, 110)}…)`
  );
  await enFicha(page, '.ficha[data-id="perdida"]', 'button:has-text("Copiar")');
  const copiaPerdida = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    copiaPerdida.includes('no encontrado en esta versión del libro') && copiaPerdida.includes(`· ${sub.src}`),
    'Copiar en una ficha perdida conserva la referencia original y lo declara'
  );

  check(errores.length === 0, `sin errores de consola${errores.length ? ': ' + errores.join(' | ') : ''}`);
  await ctx.close();
});
