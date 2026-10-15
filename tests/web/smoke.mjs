// Prueba de humo de la página con Playwright: sirve web/index.html con el libro de ejemplo y recorre
// el flujo del autor en dos modos: sin base compartida (respaldo local) y con una base simulada.
//
//   1. Subrayar, dejar una nota de sección, recargar y comprobar que todo persiste; filtros, búsqueda,
//      copia en JSON, ancho de teléfono sin desborde y ningún error de consola.
//   2. Reubicación: anotaciones cuyo bloque o posición cambió (como tras reconstruir libro.json) se
//      vuelven a encontrar por la cita y el contexto; las que ya no están se declaran perdidas.
//   3. Con la base simulada: un cambio llegado de fuera no interrumpe la nota que se está escribiendo.
//
// Uso: node tests/web/smoke.mjs   (antes: lector-anotaciones construir ejemplo/fuentes --salida ejemplo/salida/libro.json)
// Variables: LIBRO_JSON, FIGS_DIR, CHROMIUM (ruta a un ejecutable de Chromium, opcional).

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIBRO = process.env.LIBRO_JSON || path.join(RAIZ, 'ejemplo', 'salida', 'libro.json');
const FIGS = process.env.FIGS_DIR || path.join(RAIZ, 'ejemplo', 'figs');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

if (!fs.existsSync(LIBRO)) {
  console.error(`No existe ${LIBRO}. Construye el ejemplo primero (ver ejemplo/README.md).`);
  process.exit(2);
}

function servir() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const ruta = new URL(req.url, 'http://x').pathname;
      let archivo = null;
      if (ruta === '/' || ruta === '/index.html') archivo = path.join(RAIZ, 'web', 'index.html');
      else if (ruta === '/libro.json') archivo = LIBRO;
      else if (ruta.startsWith('/figs/')) archivo = path.join(FIGS, path.basename(ruta));
      if (!archivo || !fs.existsSync(archivo)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
      fs.createReadStream(archivo).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

let fallas = 0;
function check(cond, msg) {
  if (cond) console.log(`ok   ${msg}`);
  else { fallas++; console.log(`FALLA ${msg}`); }
}

// Sin base: window.claude.use('db') devuelve null.
const sinBase = () => { window.claude = { use: () => Promise.resolve(null) }; };

// Base simulada en memoria con la misma superficie que usa la página: collection().doc().set/delete y
// onSnapshot con docChanges(). Cada escritura se devuelve como eco asíncrono, como hace la base real.
const conBase = () => {
  // Colecciones separadas (anotaciones, respaldos…), ecos asíncronos y un usuario con perfil.
  const cols = {}; const oyentes = {};
  const coleccion = (nombre) => (cols[nombre] = cols[nombre] || {});
  const snap = (nombre, cambios) => ({ metadata: { fromCache: false }, docChanges: () => cambios.map((c) => ({ type: c.type, doc: { id: c.id, data: () => coleccion(nombre)[c.id] } })) });
  const emitir = (nombre, cambios) => (oyentes[nombre] || []).forEach((cb) => cb(snap(nombre, cambios)));
  const sembrar = window.__semilla || {};
  Object.keys(sembrar).forEach((id) => { coleccion('anotaciones')[id] = sembrar[id]; });
  const db = {
    collection: (nombre) => ({
      doc: (id) => ({
        set: (data) => { if (window.__rechazar) return Promise.reject({ code: window.__rechazar, message: 'simulado' }); const docs = coleccion(nombre); const existia = !!docs[id]; docs[id] = JSON.parse(JSON.stringify(data)); setTimeout(() => emitir(nombre, [{ type: existia ? 'modified' : 'added', id }]), 30); return Promise.resolve(); },
        delete: () => { delete coleccion(nombre)[id]; setTimeout(() => emitir(nombre, [{ type: 'removed', id }]), 30); return Promise.resolve(); },
      }),
      onSnapshot: (cb) => { (oyentes[nombre] = oyentes[nombre] || []).push(cb); cb(snap(nombre, Object.keys(coleccion(nombre)).map((id) => ({ type: 'added', id })))); return () => {}; },
    }),
  };
  const nombres = { u_me: 'Yo Mismo', u_otro: 'Lectora Invitada' };
  const user = {
    id: () => Promise.resolve('u_me'),
    can: () => Promise.resolve(window.__soloLectura ? false : null),
    profiles: (ids) => Promise.resolve(Object.fromEntries((Array.isArray(ids) ? ids : [ids]).map((i) => [i, { id: i, name: nombres[i] || '', color: i === 'u_me' ? '#3d5a6c' : '#8c2f2f', avatarUrl: '', email: null, isMe: i === 'u_me', guest: i === 'u_otro' }]))),
  };
  const retraso = window.__retrasoDb || 0;
  window.claude = { use: (n) => new Promise((res) => setTimeout(() => res(n === 'db' ? db : n === 'user' ? user : null), n === 'db' ? retraso : 0)) };
  window.__docs = coleccion('anotaciones');
  window.__colecciones = cols;
  window.__cambioExterno = (id, parche) => { Object.assign(coleccion('anotaciones')[id], parche); emitir('anotaciones', [{ type: 'modified', id }]); };
};

async function seleccionar(page, n = 20) {
  // Selecciona los primeros n caracteres del primer párrafo visible y devuelve su pid.
  return page.evaluate((n) => {
    const p = document.querySelector('article.seccion:not([hidden]) p.bloque[data-pid]');
    const tn = Array.from(p.childNodes).find((x) => x.nodeType === 3 && x.textContent.length > n);
    const r = document.createRange(); r.setStart(tn, 0); r.setEnd(tn, n);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    return p.getAttribute('data-pid');
  }, n);
}

const srv = await servir();
const base = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
try {
  // ---------------------------------------------------------------- modo local
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(sinBase);
  const errores = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(`${m.text()} (${(m.location() || {}).url || 'sin url'})`); });

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

  await page.click('#b-nota-cap');
  await page.waitForSelector('.ficha textarea');
  await page.fill('.ficha textarea', 'Nota de prueba de la sección');
  await page.$eval('.ficha textarea', (t) => t.blur());

  const guardado = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('lector-anotaciones:') && !x.endsWith(':ultima'));
    return { clave: k, anots: Object.values(JSON.parse(localStorage.getItem(k) || '{}')) };
  });
  check(/^lector-anotaciones:[a-z0-9-]+$/.test(guardado.clave), `clave local por libro (${guardado.clave})`);
  check(guardado.anots.length === 2, `dos anotaciones guardadas (${guardado.anots.length})`);
  const sub = guardado.anots.find((a) => a.tipo === 'subrayado');
  const cap = guardado.anots.find((a) => a.tipo === 'capitulo');
  check(sub && sub.color === 'revisar' && sub.pid === pid && /:\d+$/.test(sub.src) && sub.cita.length === 20,
    'el subrayado lleva color, bloque, archivo:línea y cita exacta');
  check(sub && typeof sub.libro === 'string' && sub.libro.length >= 10, `la anotación registra la versión del libro (${sub && sub.libro})`);
  check(cap && cap.nota === 'Nota de prueba de la sección' && cap.sid, 'la nota de sección guarda su texto y su sección');

  await page.reload();
  await page.waitForSelector(`[data-pid="${pid}"] mark.hl.c-revisar`);
  check(true, 'tras recargar, el subrayado vuelve a pintarse');
  await page.click('.filtro[data-f="notas"]');
  check((await page.$$('.ficha')).length === 1, 'el filtro «notas de página/sección» deja una ficha');
  await page.click('.filtro[data-f="todas"]');
  check((await page.$$('.ficha')).length === 2, 'el filtro «todas» muestra las dos');

  await page.fill('#buscar', 'inferencia');
  await page.press('#buscar', 'Enter');
  await page.waitForSelector('.res');
  check((await page.$$('.res')).length >= 1, 'la búsqueda encuentra coincidencias');

  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('#b-copiar');
  const copiado = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const json = (() => { try { return JSON.parse(copiado); } catch { return null; } })();
  check(json && Array.isArray(json.anotaciones) && json.anotaciones.length === 2, 'Copiar todo (JSON) produce {libro, anotaciones[]}');

  // Copiar una sola anotación como texto, y copiar una selección con su referencia.
  await page.click('.tab[data-tab="todas"]');
  await page.click(`.ficha[data-id="${sub.id}"] .acciones button:has-text("Copiar")`);
  const unaCopia = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(unaCopia.startsWith('[revisar] ') && unaCopia.includes(`· ${sub.src}`) && unaCopia.includes(`«${sub.cita}»`),
    'Copiar en una ficha da color, sección, página, archivo:línea y la cita');
  await seleccionar(page, 25);
  await page.waitForSelector('#sel-tb', { state: 'visible' });
  await page.click('#sel-copiar');
  const selCopia = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(/^\[Capítulo 1\..*· 00_preliminares\.md:\d+\]\n«.{25}»$/.test(selCopia), `Copiar en la barra de selección da la referencia y el texto (${JSON.stringify(selCopia).slice(0, 80)}…)`);
  await page.evaluate(() => window.getSelection().removeAllRanges());

  // ---------------------------------------------------------------- reubicación tras un cambio del libro
  // Se simula lo que pasa al reconstruir libro.json: la misma cita con desplazamientos viejos, la misma
  // cita atribuida al bloque siguiente (un párrafo insertado antes), y una cita que ya no existe.
  const pidSiguiente = await page.evaluate((pid) => {
    const todos = Array.from(document.querySelectorAll('article.seccion:not([hidden]) p.bloque[data-pid]')).map((p) => p.getAttribute('data-pid'));
    return todos[todos.indexOf(pid) + 1];
  }, pid);
  await page.evaluate(({ clave, pid, pidSiguiente }) => {
    const j = JSON.parse(localStorage.getItem(clave));
    const s = Object.values(j).find((a) => a.tipo === 'subrayado');
    const movida = Object.assign({}, s, { id: 'movida', inicio: s.inicio + 7, fin: s.fin + 7 });
    const corrida = Object.assign({}, s, { id: 'corrida', pid: pidSiguiente, src: 'viejo.md:1', color: 'duda' });
    const perdida = Object.assign({}, s, { id: 'perdida', cita: 'frase que no existe en ningún bloque del libro', color: 'cortar' });
    // «Dar por hecho» aparece en tres ítems de la lista del capítulo 1 y en ningún otro sitio: sin contexto es ambigua
    const repetida = Object.assign({}, s, { id: 'repetida', pid: 'cap-01-b99', cita: 'Dar por hecho', antes: '', despues: '', inicio: 0, fin: 13, color: 'duda' });
    // con contexto, una cita repetida se encuentra aunque otra igual aparezca en un bloque anterior
    const txtSig = document.querySelector('[data-pid="' + pidSiguiente + '"]').textContent;
    const conctx = Object.assign({}, s, { id: 'conctx', pid: 'cap-01-b99', cita: txtSig.slice(3, 20), antes: txtSig.slice(0, 3), despues: txtSig.slice(20, 50), inicio: 3, fin: 20, color: 'conservar' });
    j.movida = movida; j.corrida = corrida; j.perdida = perdida; j.repetida = repetida; j.conctx = conctx;
    localStorage.setItem(clave, JSON.stringify(j));
  }, { clave: guardado.clave, pid, pidSiguiente });
  await page.reload();
  await page.waitForSelector(`[data-pid="${pid}"] mark.hl`);
  await page.click('.filtro[data-f="todas"]');
  const marcas = await page.$$eval(`[data-pid="${pid}"] mark.hl`, (ms) => ms.map((m) => ({ ids: m.getAttribute('data-aids').split(' '), texto: m.textContent })));
  const cubren = (id) => marcas.filter((m) => m.ids.includes(id)).map((m) => m.texto).join('');
  check(cubren('movida') === sub.cita, `con desplazamientos viejos, la marca vuelve a cubrir la cita exacta («${cubren('movida')}»)`);
  check(cubren('corrida') === sub.cita, 'atribuida al bloque siguiente, la marca vuelve al bloque donde está la cita');
  check(cubren('perdida') === '', 'una cita que ya no existe no pinta nada');
  check(cubren('repetida') === '', 'una cita corta que aparece en varios bloques sin contexto no se adivina');
  const marcasCtx = await page.$$eval('article.seccion:not([hidden]) mark.hl', (ms) => ms.filter((m) => m.getAttribute('data-aids').split(' ').includes('conctx')).map((m) => m.closest('[data-pid]').getAttribute('data-pid')));
  check(marcasCtx.length === 1 && marcasCtx[0] === pidSiguiente, `una cita repetida pero con contexto se reubica en el bloque correcto aunque otro igual aparezca antes (${marcasCtx.join(',')})`);
  const corridaEnSiguiente = await page.$$eval(`[data-pid="${pidSiguiente}"] mark.hl`, (ms) => ms.filter((m) => m.getAttribute('data-aids').split(' ').includes('corrida')).length);
  check(corridaEnSiguiente === 0, 'y la anotación corrida no se pinta en el bloque equivocado');
  const avisos = await page.$$eval('.ficha', (fs) => fs.map((f) => [f.getAttribute('data-id'), (f.querySelector('.aviso-ubic') || {}).textContent || '']));
  const aviso = (id) => (avisos.find((x) => x[0] === id) || [])[1] || '';
  check(/^Reubicado/.test(aviso('movida')) && /^Reubicado/.test(aviso('corrida')) && /otro bloque/.test(aviso('corrida')), 'las fichas reubicadas lo dicen');
  check(/^No encontrado/.test(aviso('perdida')), 'la ficha perdida lo dice y conserva la cita');
  check(aviso(sub.id) === '', 'la anotación intacta no lleva aviso');
  const guardadoDespues = await page.evaluate((clave) => JSON.parse(localStorage.getItem(clave)), guardado.clave);
  check(guardadoDespues.movida.inicio === sub.inicio + 7 && guardadoDespues.corrida.pid === pidSiguiente, 'la reubicación no modifica lo guardado');
  // Lo que se copia de una ficha reubicada apunta al bloque donde la cita está hoy, y lo dice; la perdida lo declara.
  await page.click('.ficha[data-id="corrida"] .acciones button:has-text("Copiar")');
  const copiaCorrida = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(copiaCorrida.startsWith(`[duda] ${sub.sidTitulo} ·`) && copiaCorrida.includes(`· ${sub.src} ·`) && copiaCorrida.includes('reubicado') && copiaCorrida.includes('(antes viejo.md:1)'),
    `Copiar en una ficha reubicada da el bloque actual y avisa (${JSON.stringify(copiaCorrida).slice(0, 110)}…)`);
  await page.click('.ficha[data-id="perdida"] .acciones button:has-text("Copiar")');
  const copiaPerdida = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(copiaPerdida.includes('no encontrado en esta versión del libro') && copiaPerdida.includes(`· ${sub.src}`), 'Copiar en una ficha perdida conserva la referencia original y lo declara');

  check(errores.length === 0, `sin errores de consola${errores.length ? ': ' + errores.join(' | ') : ''}`);
  await ctx.close();

  // ---------------------------------------------------------------- con base simulada: escribir sin interrupciones
  const ctxDb = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxDb.addInitScript(conBase);
  const erroresDb = [];
  const pdb = await ctxDb.newPage();
  pdb.on('pageerror', (e) => erroresDb.push(String(e)));
  await pdb.goto(base);
  await pdb.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pdb.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  check(true, 'con base, la barra dice «Conectado»');
  const pidDb = await seleccionar(pdb);
  await pdb.waitForSelector('#sel-tb', { state: 'visible' });
  await pdb.click('#sel-tb .col-btn[data-c="conservar"]');
  await pdb.waitForSelector(`[data-pid="${pidDb}"] mark.hl.c-conservar`);
  await pdb.waitForFunction(() => Object.values(window.__docs).some((d) => d.tipo === 'subrayado'));
  check(true, 'el subrayado llega a la base');
  const idSub = await pdb.evaluate(() => Object.values(window.__docs).find((d) => d.tipo === 'subrayado').id);

  await pdb.click('#b-nota-cap');
  await pdb.waitForSelector('.ficha.t-capitulo textarea');
  await pdb.focus('.ficha.t-capitulo textarea');
  await pdb.keyboard.type('Primera parte de la nota', { delay: 10 });
  await pdb.waitForTimeout(1100); // pasa el guardado diferido (900 ms) y su eco
  await pdb.keyboard.type(' y sigo escribiendo', { delay: 10 });
  const activo1 = await pdb.evaluate(() => document.activeElement && document.activeElement.value);
  check(activo1 === 'Primera parte de la nota y sigo escribiendo', 'el eco del guardado no quita el foco ni corta la escritura');
  // Un cambio llegado de otra sesión mientras hay un borrador sin guardar
  await pdb.evaluate((id) => window.__cambioExterno(id, { color: 'duda' }), idSub);
  await pdb.waitForSelector(`[data-pid="${pidDb}"] mark.hl.c-duda`);
  const activo2 = await pdb.evaluate(() => ({ id: document.activeElement && document.activeElement.id, valor: document.activeElement && document.activeElement.value, fin: document.activeElement && document.activeElement.selectionStart }));
  check(/^nota-/.test(activo2.id) && activo2.valor === 'Primera parte de la nota y sigo escribiendo' && activo2.fin === activo2.valor.length,
    'un cambio externo redibuja el panel sin perder el editor, el borrador ni la posición del cursor');
  await pdb.keyboard.type('.', { delay: 10 });
  await pdb.waitForFunction(() => Object.values(window.__docs).some((d) => d.tipo === 'capitulo' && d.nota === 'Primera parte de la nota y sigo escribiendo.'));
  check(true, 'el borrador completo termina guardado en la base');
  check(erroresDb.length === 0, `sin errores de página con base${erroresDb.length ? ': ' + erroresDb.join(' | ') : ''}`);
  await ctxDb.close();

  // ---------------------------------------------------------------- migración desde una clave anterior
  // Una versión anterior de la página guardaba bajo otra clave; libro.json la declara en claves_anteriores.
  const ctxMig = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxMig.addInitScript(sinBase);
  await ctxMig.addInitScript(() => {
    localStorage.setItem('lector-viejo', JSON.stringify({ vieja1: { id: 'vieja1', tipo: 'general', nota: 'Nota heredada', estado: 'abierta', creado: '2026-01-01T00:00:00.000Z' } }));
  });
  const pmig = await ctxMig.newPage();
  await pmig.route('**/libro.json', async (route) => {
    const L = JSON.parse(fs.readFileSync(LIBRO, 'utf8'));
    L.claves_anteriores = ['lector-viejo'];
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(L) });
  });
  await pmig.goto(base);
  await pmig.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pmig.waitForFunction(() => /recuperadas/.test(document.querySelector('#estado').textContent));
  await pmig.click('.tab[data-tab="todas"]');
  const heredada = await pmig.$$eval('.ficha textarea', (ts) => ts.map((t) => t.value));
  check(heredada.includes('Nota heredada'), 'las anotaciones de la clave anterior aparecen tras cargar');
  const claves = await pmig.evaluate(() => ({ vieja: localStorage.getItem('lector-viejo'), nueva: Object.keys(localStorage).find((k) => /^lector-anotaciones:/.test(k) && !/:ultima$/.test(k)) }));
  check(claves.vieja === null && !!claves.nueva, 'quedan bajo la clave nueva y la vieja se retira');
  await ctxMig.close();

  // ---------------------------------------------------------------- migración con el almacenamiento lleno
  // Si la copia nueva no se puede escribir, la clave vieja debe seguir ahí (es la única copia) y la barra avisar.
  const ctxLleno = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxLleno.addInitScript(sinBase);
  await ctxLleno.addInitScript(() => {
    localStorage.setItem('lector-viejo', JSON.stringify({ vieja1: { id: 'vieja1', tipo: 'general', nota: 'Nota heredada', estado: 'abierta', creado: '2026-01-01T00:00:00.000Z' } }));
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (/^lector-anotaciones:/.test(k) && !/:ultima$/.test(k)) throw new DOMException('QuotaExceededError', 'QuotaExceededError'); return original.call(this, k, v); };
  });
  const plleno = await ctxLleno.newPage();
  await plleno.route('**/libro.json', async (route) => {
    const L = JSON.parse(fs.readFileSync(LIBRO, 'utf8'));
    L.claves_anteriores = ['lector-viejo'];
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(L) });
  });
  await plleno.goto(base);
  await plleno.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await plleno.waitForFunction(() => /No se pudieron guardar/.test(document.querySelector('#estado').textContent));
  const llenoEstado = await plleno.evaluate(() => ({ vieja: localStorage.getItem('lector-viejo'), nueva: Object.keys(localStorage).find((k) => /^lector-anotaciones:/.test(k) && !/:ultima$/.test(k)) || null }));
  check(llenoEstado.vieja !== null && llenoEstado.nueva === null, 'si la copia nueva no se puede escribir, la clave vieja se conserva y la barra avisa');
  await plleno.click('.tab[data-tab="todas"]');
  check((await plleno.$$eval('.ficha textarea', (ts) => ts.map((t) => t.value))).includes('Nota heredada'), 'y las anotaciones heredadas siguen visibles en esa sesión');
  await ctxLleno.close();

  // ---------------------------------------------------------------- capas, cambios, progreso, concentración, atajos, etiquetas, deshacer, búsqueda en notas, figura
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx2.addInitScript(sinBase);
  await ctx2.grantPermissions(['clipboard-read', 'clipboard-write']);
  const p2 = await ctx2.newPage();
  const errores2 = [];
  p2.on('pageerror', (e) => errores2.push(String(e)));
  p2.on('console', (m) => { if (m.type() === 'error') errores2.push(`${m.text()} (${(m.location() || {}).url || 'sin url'})`); });
  // libro.json con un bloque cambiado respecto de la construcción anterior
  await p2.route('**/libro.json', async (route) => {
    const L = JSON.parse(fs.readFileSync(LIBRO, 'utf8'));
    const cap2 = L.secciones.find((s) => /^Capítulo 2/.test(s.titulo));
    const b = cap2.bloques.find((x) => x.t === 'p');
    b.anterior = 'Una inferencia es un salto desde lo observado hacia lo no observado.';
    L.anterior_generado = '2026-01-01'; L.cambios = 1;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(L) });
  });
  await p2.goto(base + '#cap-02');
  await p2.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await p2.waitForFunction(() => /Sin base compartida/.test(document.querySelector('#estado').textContent));
  check(!(await p2.$eval('#capas', (d) => d.hidden)), 'el menú de capas aparece cuando libro.json las trae');
  await p2.click('#capas > summary');
  const etiquetasCapas = await p2.$$eval('#capas-menu label', (ls) => ls.map((l) => l.textContent));
  check(etiquetasCapas.some((t) => /frases largas/.test(t)) && etiquetasCapas.some((t) => /muletillas/.test(t)), `el menú lista las capas con sus cuentas (${etiquetasCapas.length})`);
  await p2.check('#capas-menu input[data-capa="fl"]');
  await p2.check('#capas-menu input[data-capa="mu"]');
  await p2.waitForSelector('article.seccion:not([hidden]) span.capa.k-fl');
  const nMu = (await p2.$$('article.seccion:not([hidden]) span.capa.k-mu')).length;
  check(nMu >= 1, `las capas activas se pintan sobre el texto (muletillas: ${nMu})`);
  const resumenCapas = await p2.$eval('article.seccion:not([hidden]) .sec-herr span[id^="capas-"]', (s) => s.textContent);
  check(/frases largas/.test(resumenCapas) && /muletillas/.test(resumenCapas), `la sección resume sus señales (${resumenCapas})`);
  await p2.uncheck('#capas-menu input[data-capa="fl"]');
  check((await p2.$$('article.seccion:not([hidden]) span.capa.k-fl')).length === 0, 'al apagar una capa, sus marcas desaparecen');
  await p2.keyboard.press('Escape');
  // qué cambió
  check((await p2.$$('article.seccion:not([hidden]) .bloque.cambiado')).length === 1, 'el bloque cambiado en la última construcción se marca');
  const chipCambio = await p2.$eval('article.seccion:not([hidden]) .sec-herr .chip', (c) => c.textContent);
  check(/1 bloque cambiado/.test(chipCambio), `la sección cuenta sus bloques cambiados (${chipCambio})`);
  await p2.click('article.seccion:not([hidden]) .marca-cambio');
  await p2.waitForSelector('.diff');
  const diff = await p2.$eval('.diff', (d) => ({ del: Array.from(d.querySelectorAll('del')).map((x) => x.textContent).join('|'), ins: Array.from(d.querySelectorAll('ins')).map((x) => x.textContent).join('|') }));
  check(/salto/.test(diff.del) && /paso/.test(diff.ins), `la diferencia muestra lo quitado y lo añadido (${JSON.stringify(diff).slice(0, 80)})`);
  await p2.click('article.seccion:not([hidden]) .marca-cambio');
  check((await p2.$$('.diff')).length === 0, 'volver a pulsar oculta la diferencia');
  // cambió desde tu última lectura (huella guardada distinta)
  const pidCap2 = await p2.$eval('article.seccion:not([hidden]) p.bloque[data-pid]:not(.cambiado)', (n) => n.getAttribute('data-pid'));
  await p2.evaluate((pid) => { const k = Object.keys(localStorage).find((x) => x.endsWith(':visto')); const v = JSON.parse(localStorage.getItem(k) || '{}'); v[pid] = 'huellavieja'; localStorage.setItem(k, JSON.stringify(v)); }, pidCap2);
  await p2.reload();
  await p2.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  check(await p2.$eval(`[data-pid="${pidCap2}"]`, (n) => n.classList.contains('cambiado') && /última lectura/.test(n.querySelector('.marca-cambio').title)), 'un bloque con huella distinta de la vista se marca como cambiado desde la última lectura');
  // progreso y leída
  await p2.check('article.seccion:not([hidden]) input[data-leida]');
  const prog = await p2.evaluate(() => ({ leida: !!document.querySelector('nav a.sec.activa.leida'), ancho: document.querySelector('nav .progreso[data-grupo="parte-1"] i').style.width }));
  check(prog.leida && prog.ancho !== '0%' && prog.ancho !== '', `marcar leída actualiza el índice y la barra de progreso (${prog.ancho})`);
  await p2.keyboard.press('l');
  check(!(await p2.$('nav a.sec.activa.leida')), 'la tecla L alterna la marca de leída');
  // concentración
  await p2.click('#b-foco');
  const foco = await p2.evaluate(() => ({ on: document.querySelector('#app').classList.contains('foco'), nav: getComputedStyle(document.querySelector('nav.indice')).display, panel: getComputedStyle(document.querySelector('aside.panel')).display }));
  check(foco.on && foco.nav === 'none' && foco.panel === 'none', 'el modo concentración oculta índice y panel');
  await p2.keyboard.press('Escape');
  check(!(await p2.evaluate(() => document.querySelector('#app').classList.contains('foco'))), 'Esc sale del modo concentración');
  // atajos: 2 subraya en rojo; ? abre la ayuda
  await seleccionar(p2, 18);
  await p2.keyboard.press('2');
  await p2.waitForSelector('article.seccion:not([hidden]) mark.hl.c-cortar');
  check(true, 'la tecla 2 subraya la selección en «cortar»');
  await p2.keyboard.press('?');
  check(await p2.$eval('#atajos', (a) => a.classList.contains('abierto')), 'la tecla ? muestra los atajos');
  await p2.keyboard.press('Escape');
  // etiquetas en la nota, filtro por etiqueta, búsqueda en notas
  await p2.click('.tab[data-tab="todas"]');
  await p2.fill('.ficha textarea', 'Revisar con #carmen la cinética');
  await p2.$eval('.ficha textarea', (t) => t.blur());
  await p2.waitForSelector('.ficha .etiquetas button');
  check((await p2.$eval('.ficha .etiquetas button', (b) => b.textContent)) === '#carmen' && !(await p2.$eval('#f-etiqueta', (s) => s.hidden)), 'las #etiquetas de la nota se vuelven chips y un selector');
  await p2.selectOption('#f-etiqueta', 'carmen');
  check((await p2.$$('.ficha')).length === 1, 'el filtro por etiqueta deja las fichas con esa etiqueta');
  await p2.click('.filtro[data-f="conservar"]');
  await p2.fill('#buscar', 'cinética');
  await p2.press('#buscar', 'Enter');
  await p2.waitForSelector('.res.anot');
  check(true, 'la búsqueda encuentra el texto de una nota');
  await p2.click('.res.anot');
  await p2.waitForSelector('.ficha.foco textarea');
  const trasResultado = await p2.evaluate(() => ({ tab: document.querySelector('.tab.activa').getAttribute('data-tab'), filtro: document.querySelector('.filtro.on').getAttribute('data-f'), nota: document.querySelector('.ficha.foco textarea').value }));
  check(trasResultado.tab !== 'buscar' && trasResultado.filtro === 'todas' && /cinética/.test(trasResultado.nota), `pulsar el resultado abre la ficha, saliendo de la búsqueda y del filtro que la escondía (${trasResultado.tab}, ${trasResultado.filtro})`);
  // copiar una selección que empieza en un marcador del margen o con la palabra «Cambió» del manuscrito
  const copiaMarcador = await p2.evaluate(async () => {
    const p = document.querySelector('article.seccion:not([hidden]) .bloque.cambiado');
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let tn = w.nextNode();
    while (tn && tn.parentNode.closest('.pg, .marca-cambio')) tn = w.nextNode();
    const r = document.createRange(); r.setStart(p, 0); r.setEnd(tn, Math.min(12, tn.textContent.length));
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    const bruto = r.toString();
    document.querySelector('#sel-copiar').click();
    await new Promise((res) => setTimeout(res, 200));
    return { bruto, copia: await navigator.clipboard.readText() };
  });
  check(/^cambió/.test(copiaMarcador.bruto) && copiaMarcador.copia.split('\n')[1] === '«' + copiaMarcador.bruto.replace(/^cambió/, '') + '»', `la copia omite el marcador «cambió» del margen (${JSON.stringify(copiaMarcador.copia.split('\n')[1])})`);
  const copiaPalabra = await p2.evaluate(async () => {
    const p = Array.from(document.querySelectorAll('article.seccion:not([hidden]) p.bloque')).find((x) => /^Cambió la frase/.test(x.textContent.replace(/^(p\. \d+)?(cambió)?/, '')));
    const tn = Array.from(p.childNodes).find((x) => x.nodeType === 3);
    const r = document.createRange(); r.setStart(tn, 0); r.setEnd(tn, 15);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.querySelector('#sel-copiar').click();
    await new Promise((res) => setTimeout(res, 200));
    return navigator.clipboard.readText();
  });
  check(copiaPalabra.split('\n')[1] === '«Cambió la frase»', `y conserva la palabra «Cambió» cuando es del manuscrito (${JSON.stringify(copiaPalabra.split('\n')[1])})`);
  await p2.evaluate(() => window.getSelection().removeAllRanges());
  // copiar varios ítems de una lista y una fila de una tabla conserva los límites
  await p2.evaluate(() => { location.hash = '#cap-01'; });
  await p2.waitForSelector('#sec-cap-01:not([hidden]) ul.bloque');
  const copiaLista = await p2.evaluate(async () => {
    const lis = document.querySelectorAll('#sec-cap-01 ul.bloque li');
    const r = document.createRange(); r.setStart(lis[0].firstChild, 0); r.setEnd(lis[1].firstChild, lis[1].firstChild.textContent.length);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.querySelector('#sel-copiar').click();
    await new Promise((res) => setTimeout(res, 200));
    return navigator.clipboard.readText();
  });
  check(copiaLista.split('\n').slice(1).join('\n') === '«Dar por hecho lo que alguien contó.\nDar por hecho lo que se infirió de una cifra.»', `los ítems copiados van en líneas distintas (${JSON.stringify(copiaLista.split('\n').slice(1).join('|'))})`);
  const copiaTabla = await p2.evaluate(async () => {
    const celdas = document.querySelectorAll('#sec-cap-01 .tabla tr:nth-child(2) td');
    const r = document.createRange(); r.setStart(celdas[0].firstChild, 0); r.setEnd(celdas[2].firstChild, celdas[2].firstChild.textContent.length);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.querySelector('#sel-copiar').click();
    await new Promise((res) => setTimeout(res, 200));
    return navigator.clipboard.readText();
  });
  check(copiaTabla.split('\n')[1] === '«Hecho · ¿Qué vi? · Fiebre de 38,5 °C»', `las celdas copiadas llevan separador (${JSON.stringify(copiaTabla.split('\n')[1])})`);
  await p2.evaluate(() => window.getSelection().removeAllRanges());
  // selección que termina fuera de los bloques (triple clic en el último párrafo): se subraya y se copia igual
  const ultimoTexto = await p2.evaluate(() => {
    const bloques = document.querySelectorAll('#sec-cap-01 .bloque[data-pid]'); const p = bloques[bloques.length - 1];
    const tn = Array.from(p.childNodes).find((x) => x.nodeType === 3 && x.textContent.trim());
    const r = document.createRange(); r.setStart(tn, 0); r.setEnd(document.querySelector('#sig'), 0);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    return p.getAttribute('data-pid');
  });
  await p2.waitForSelector('#sel-tb', { state: 'visible' });
  await p2.keyboard.press('1');
  await p2.waitForSelector(`[data-pid="${ultimoTexto}"] mark.hl.c-revisar`);
  const subrayadoFinal = await p2.evaluate((pid) => { const k = Object.keys(localStorage).find((x) => x.startsWith('lector-anotaciones:') && !x.endsWith(':ultima') && !/:(visto|leidas|capas|foco|respaldo)$/.test(x)); const a = Object.values(JSON.parse(localStorage.getItem(k))).find((x) => x.pid === pid); return a && { inicio: a.inicio, fin: a.fin, cita: a.cita }; }, ultimoTexto);
  check(subrayadoFinal && subrayadoFinal.inicio === 0 && subrayadoFinal.fin === subrayadoFinal.cita.length && /separar mejor\.$/.test(subrayadoFinal.cita), 'una selección que sale del último bloque se recorta a ese bloque entero');
  await p2.evaluate(() => window.getSelection().removeAllRanges());
  // el contorno de foco se mueve con la ficha enfocada
  await p2.click('.tab[data-tab="todas"]');
  const fichas = await p2.$$eval('.ficha', (fs) => fs.map((f) => f.getAttribute('data-id')));
  await p2.click(`.ficha[data-id="${fichas[0]}"] .cab button.enlace`);
  await p2.click('.tab[data-tab="todas"]');
  await p2.click(`.ficha[data-id="${fichas[1]}"] .cab button.enlace`);
  check((await p2.$$('mark.hl.foco')).length <= 1, 'sólo el subrayado de la ficha enfocada lleva contorno');
  // la búsqueda no lee los marcadores del margen como texto
  await p2.evaluate(() => { location.hash = '#cap-02'; });
  await p2.waitForSelector('#sec-cap-02:not([hidden])');
  await p2.fill('#buscar', 'cambió');
  await p2.press('#buscar', 'Enter');
  await p2.waitForSelector('.res');
  const resCambio = await p2.$$eval('.res:not(.anot)', (rs) => rs.map((r) => r.textContent));
  check(resCambio.length >= 1 && resCambio.every((t) => !/cambióUna/.test(t)), `la búsqueda ignora el marcador «cambió» del margen (${resCambio.length} resultados)`);
  // deshacer un borrado
  await p2.click('.tab[data-tab="todas"]');
  const antesBorrar = (await p2.$$('.ficha')).length;
  await p2.click('.ficha .acciones button:has-text("Borrar")');
  await p2.click('.ficha .confirmar button:has-text("Sí")');
  await p2.waitForSelector('#deshacer');
  check((await p2.$$('.ficha')).length === antesBorrar - 1, 'borrar quita la ficha y ofrece deshacer');
  await p2.click('#deshacer');
  await p2.waitForFunction((n) => document.querySelectorAll('.ficha').length === n, antesBorrar);
  check(true, 'deshacer la recupera');
  // figura ampliable y lectura en voz alta
  await p2.goto(base + '#cap-01');
  await p2.waitForSelector('article.seccion:not([hidden]) figure img');
  await p2.click('article.seccion:not([hidden]) figure img');
  check(await p2.$eval('#lightbox', (l) => l.classList.contains('abierto')), 'clic en una figura la amplía');
  await p2.keyboard.press('Escape');
  check(!(await p2.$eval('#lightbox', (l) => l.classList.contains('abierto'))), 'Esc cierra la figura');
  await p2.click('article.seccion:not([hidden]) button[data-escuchar]');
  await p2.waitForTimeout(400); // en un navegador sin voces, el error llega enseguida y el botón vuelve solo
  const txtVoz = await p2.$eval('article.seccion:not([hidden]) button[data-escuchar]', (b) => b.textContent);
  const estadoVoz = await p2.$eval('#estado', (e) => e.textContent);
  check(txtVoz === 'Detener' || /voz alta/.test(estadoVoz), `escuchar arranca la lectura o avisa que no hay voz (${txtVoz} · ${estadoVoz.slice(0, 50)})`);
  if (txtVoz === 'Detener') { await p2.click('article.seccion:not([hidden]) button[data-escuchar]'); check((await p2.$eval('article.seccion:not([hidden]) button[data-escuchar]', (b) => b.textContent)) === 'Escuchar', 'detener vuelve al estado inicial'); }
  check(errores2.length === 0, `sin errores de consola en el segundo recorrido${errores2.length ? ': ' + errores2.join(' | ') : ''}`);
  await ctx2.close();

  // ---------------------------------------------------------------- con base y usuario: respuesta de quien edita, lectores, respaldo
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx3.addInitScript(() => {
    window.__semilla = {
      grande: { id: 'grande', tipo: 'general', nota: 'x'.repeat(199500), estado: 'resuelta', creado: '2026-09-30T00:00:00.000Z', autor: 'u_otro' },
      ajena: { id: 'ajena', tipo: 'general', nota: 'Nota de otra lectora', estado: 'abierta', creado: '2026-10-01T00:00:00.000Z', autor: 'u_otro' },
      conpregunta: { id: 'conpregunta', tipo: 'general', nota: '¿Conviene mover el caso?', estado: 'abierta', creado: '2026-10-02T00:00:00.000Z', autor: 'u_me', respuesta: '¿Al inicio del capítulo o al final?', cierre: 'pregunta', respondido: '2026-10-03T10:00:00.000Z' },
      atendida: { id: 'atendida', tipo: 'general', nota: 'Quitar el adjetivo', estado: 'resuelta', creado: '2026-10-02T01:00:00.000Z', autor: 'u_me', respuesta: 'Quitado en el párrafo 3.', cierre: 'atendida', commit: 'abc1234', respondido: '2026-10-03T10:00:00.000Z' },
    };
  });
  await ctx3.addInitScript(conBase);
  const p3 = await ctx3.newPage();
  const errores3 = [];
  p3.on('pageerror', (e) => errores3.push(String(e)));
  await p3.goto(base);
  await p3.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await p3.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  await p3.click('.tab[data-tab="todas"]');
  await p3.waitForFunction(() => document.querySelectorAll('.ficha').length === 4);
  const fichaPregunta = await p3.$eval('.ficha[data-id="conpregunta"]', (f) => ({ pregunta: f.classList.contains('cierre-pregunta'), cierre: (f.querySelector('.cierre') || {}).textContent, respuesta: (f.querySelector('.respuesta') || {}).textContent, replica: !!f.querySelector('textarea.replica') }));
  check(fichaPregunta.pregunta && fichaPregunta.cierre === 'pregunta' && /Al inicio del capítulo/.test(fichaPregunta.respuesta) && fichaPregunta.replica, 'una respuesta con pregunta se muestra con su cierre y un cuadro para replicar');
  const fichaAtendida = await p3.$eval('.ficha[data-id="atendida"]', (f) => ({ cierre: (f.querySelector('.cierre') || {}).textContent, quien: (f.querySelector('.respuesta .quien') || {}).textContent, resuelta: f.classList.contains('resuelta') }));
  check(fichaAtendida.cierre === 'atendida' && /abc1234/.test(fichaAtendida.quien) && fichaAtendida.resuelta, 'una anotación atendida muestra el cierre y el commit');
  await p3.fill('.ficha[data-id="conpregunta"] textarea.replica', 'Al inicio.');
  await p3.$eval('.ficha[data-id="conpregunta"] textarea.replica', (t) => t.blur());
  await p3.waitForFunction(() => window.__docs.conpregunta && window.__docs.conpregunta.replica === 'Al inicio.');
  check(true, 'la réplica del autor queda guardada en la base');
  await p3.click('.filtro[data-f="preguntas"]');
  check((await p3.$$('.ficha')).length === 1, 'el filtro «preguntas» deja sólo la pregunta');
  await p3.click('.filtro[data-f="respondidas"]');
  check((await p3.$$('.ficha')).length === 2, 'el filtro «con respuesta» deja las respondidas');
  await p3.click('.filtro[data-f="todas"]');
  check(!(await p3.$('.ficha[data-id="ajena"] .cab button.enlace')) && (await p3.$eval('.ficha[data-id="conpregunta"] .acciones button', (b) => b.tagName)) === 'BUTTON', 'las notas generales no llevan «ir al texto» y los controles son botones');
  await p3.click('.filtro[data-f="todas"]');
  await p3.waitForFunction(() => Array.from(document.querySelectorAll('.ficha[data-id="ajena"] .autor span')).some((s) => s.textContent === 'Lectora Invitada'));
  check(true, 'la ficha de otra lectora lleva su nombre resuelto por la capacidad user');
  check(!(await p3.$eval('#f-autor', (s) => s.hidden)) && (await p3.$$eval('#f-autor option', (os) => os.map((o) => o.textContent))).includes('Lectora Invitada'), 'con varios lectores aparece el selector de lector');
  await p3.selectOption('#f-autor', 'u_otro');
  check((await p3.$$('.ficha')).length === 2, 'el filtro por lector deja sus anotaciones');
  await p3.selectOption('#f-autor', '');
  const pid3 = await seleccionar(p3, 12);
  await p3.waitForSelector('#sel-tb', { state: 'visible' });
  await p3.click('#sel-tb .col-btn[data-c="duda"]');
  await p3.waitForFunction(() => Object.values(window.__docs).some((d) => d.tipo === 'subrayado'));
  const mio = await p3.evaluate(() => Object.values(window.__docs).find((d) => d.tipo === 'subrayado'));
  check(mio.autor === 'u_me' && typeof mio.bh === 'string' && mio.bh.length === 12, 'un subrayado nuevo lleva autor y la huella del bloque');
  await p3.waitForFunction(() => window.__colecciones.respaldos && Object.values(window.__colecciones.respaldos).some((d) => d.libro));
  const respaldo = await p3.evaluate(() => Object.values(window.__colecciones.respaldos).find((d) => d.partes !== undefined && d.libro));
  check(respaldo.partes >= 2 && respaldo.n >= 4 && (await p3.evaluate(() => Object.keys(window.__colecciones.respaldos).length)) === respaldo.partes + 1, `el respaldo diario se trocea en documentos pequeños (${respaldo.partes} partes, ${respaldo.n} anotaciones)`);
  await p3.evaluate(() => { window.__colecciones.respaldos = {}; Object.keys(localStorage).filter((k) => k.endsWith(':respaldo')).forEach((k) => localStorage.removeItem(k)); });
  await p3.fill('.ficha[data-id="conpregunta"] textarea.replica', 'Al inicio, confirmado.');
  await p3.$eval('.ficha[data-id="conpregunta"] textarea.replica', (t) => t.blur());
  await p3.waitForFunction(() => Object.values(window.__colecciones.respaldos || {}).some((d) => d.libro) || true);
  await p3.waitForTimeout(150);
  check((await p3.evaluate(() => Object.keys(window.__colecciones.respaldos || {}).length)) === 0, 'editar una nota el mismo día no repite el respaldo (ya se hizo hoy)');
  const copiaResp = await (async () => { await ctx3.grantPermissions(['clipboard-read', 'clipboard-write']); await p3.click('.ficha[data-id="atendida"] .acciones button:has-text("Copiar")'); return p3.evaluate(() => navigator.clipboard.readText()).catch(() => ''); })();
  check(/Respuesta \(atendida, abc1234\): Quitado en el párrafo 3\./.test(copiaResp), 'copiar una ficha incluye la respuesta y su cierre');
  // una escritura rechazada por la base no deja anotaciones fantasma
  await p3.evaluate(() => { window.__rechazar = 'quota_exceeded'; });
  await seleccionar(p3, 8);
  await p3.waitForSelector('#sel-tb', { state: 'visible' });
  await p3.click('#sel-tb .col-btn[data-c="cortar"]');
  await p3.waitForFunction(() => /No se pudo guardar \(quota_exceeded\)/.test(document.querySelector('#estado').textContent));
  check((await p3.$$('mark.hl.c-cortar')).length === 0 && !(await p3.evaluate(() => Object.values(window.__docs).some((d) => d.color === 'cortar'))) && !(await p3.evaluate(() => document.body.classList.contains('solo-lectura'))), 'si la base rechaza la escritura, la anotación se retira de la memoria y la página sigue editable');
  await p3.evaluate(() => { window.__rechazar = null; window.getSelection().removeAllRanges(); });
  await p3.click('.ficha[data-id="ajena"] .acciones button:has-text("Borrar")');
  await p3.click('.ficha[data-id="ajena"] .confirmar button:has-text("Sí")');
  await p3.waitForFunction(() => !window.__docs.ajena && /^Conectado/.test(document.querySelector('#estado').textContent));
  check(!!(await p3.$('#deshacer')), 'el enlace de deshacer sobrevive al eco de la base que confirma el borrado');
  await p3.click('#deshacer');
  await p3.waitForFunction(() => !!window.__docs.ajena);
  check(true, 'deshacer devuelve la anotación a la base');
  check(errores3.length === 0, `sin errores de página con base y usuario${errores3.length ? ': ' + errores3.join(' | ') : ''}`);
  await ctx3.close();

  // ---------------------------------------------------------------- anotar mientras la base todavía conecta
  const ctxTarde = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxTarde.addInitScript(() => { window.__retrasoDb = 1500; });
  await ctxTarde.addInitScript(conBase);
  const pt = await ctxTarde.newPage();
  await pt.goto(base);
  await pt.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pt.waitForFunction(() => /Conectando/.test(document.querySelector('#estado').textContent));
  const pidTarde = await seleccionar(pt, 10);
  await pt.waitForSelector('#sel-tb', { state: 'visible' });
  await pt.click('#sel-tb .col-btn[data-c="revisar"]');
  await pt.waitForSelector(`[data-pid="${pidTarde}"] mark.hl`);
  check(/sólo en este navegador/.test(await pt.$eval('#estado', (e) => e.textContent)), 'antes de conectar, la anotación se guarda en el navegador y se dice');
  await pt.waitForFunction(() => Object.values(window.__docs).some((d) => d.tipo === 'subrayado' && d.autor === 'u_me'), null, { timeout: 10000 });
  check(true, 'al conectar, lo anotado mientras tanto sube a la base con su autor');
  const sinLocal = await pt.evaluate(() => !Object.keys(localStorage).some((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k)));
  check(sinLocal, 'y la copia del navegador se retira para que no vuelva duplicada');
  await ctxTarde.close();
  // si la subida de una pendiente falla, la anotación no se pierde: sigue en memoria y en el navegador
  const ctxTarde2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxTarde2.addInitScript(() => { window.__retrasoDb = 1500; window.__rechazar = 'unavailable'; });
  await ctxTarde2.addInitScript(conBase);
  const pt2 = await ctxTarde2.newPage();
  await pt2.goto(base);
  await pt2.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pt2.waitForFunction(() => /Conectando/.test(document.querySelector('#estado').textContent));
  const pidTarde2 = await seleccionar(pt2, 10);
  await pt2.waitForSelector('#sel-tb', { state: 'visible' });
  await pt2.click('#sel-tb .col-btn[data-c="revisar"]');
  await pt2.waitForSelector(`[data-pid="${pidTarde2}"] mark.hl`);
  await pt2.waitForFunction(() => /no pudo subir/.test(document.querySelector('#estado').textContent), null, { timeout: 10000 });
  const conservada = await pt2.evaluate(() => ({ marca: !!document.querySelector('mark.hl'), local: Object.keys(localStorage).some((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /subrayado/.test(localStorage.getItem(k))), enBase: Object.values(window.__docs).some((d) => d.tipo === 'subrayado') }));
  check(conservada.marca && conservada.local && !conservada.enBase, 'una pendiente que no pudo subir sigue en memoria y en el navegador, y la barra lo dice');
  // borrarla la saca también de la copia local: al recargar no vuelve
  await pt2.evaluate(() => { window.__rechazar = null; });
  await pt2.click('.tab[data-tab="todas"]');
  await pt2.click('.ficha .acciones button:has-text("Borrar")');
  await pt2.click('.ficha .confirmar button:has-text("Sí")');
  await pt2.waitForSelector('#deshacer');
  const localTrasBorrar = await pt2.evaluate(() => Object.keys(localStorage).filter((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k)).map((k) => localStorage.getItem(k)).join(''));
  check(!/subrayado/.test(localTrasBorrar), 'borrar una pendiente que no subió la retira también de la copia local');
  await pt2.reload();
  await pt2.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pt2.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent), null, { timeout: 10000 });
  check((await pt2.$$('mark.hl')).length === 0, 'y al recargar no resucita');
  await ctxTarde2.close();
  // lo que quedó en el navegador en otra sesión (sin conexión, o con subida fallida) se recupera al conectar:
  // sube lo que la base no tiene; en lo que la base ya tenía, manda la base
  const ctxRecarga = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxRecarga.addInitScript(() => { window.__retrasoDb = 1500; window.__semilla = { vieja: { id: 'vieja', tipo: 'general', nota: 'Versión de la base', estado: 'abierta', creado: '2026-10-02T00:00:00.000Z', editado: '2026-10-03T00:00:00.000Z', autor: 'u_me' } }; });
  await ctxRecarga.addInitScript(conBase);
  await ctxRecarga.addInitScript((clave) => {
    localStorage.setItem(clave, JSON.stringify({
      huerfana: { id: 'huerfana', tipo: 'general', nota: 'Quedó sólo en el navegador', estado: 'abierta', creado: '2026-10-02T00:00:00.000Z', editado: '2026-10-02T00:00:00.000Z' },
      vieja: { id: 'vieja', tipo: 'general', nota: 'Copia local atrasada', estado: 'abierta', creado: '2026-10-02T00:00:00.000Z', editado: '2026-10-02T00:00:00.000Z', autor: 'u_me' },
      ajena: { id: 'ajena', tipo: 'general', nota: 'De otra lectora, ya borrada en la base', estado: 'abierta', creado: '2026-10-02T00:00:00.000Z', editado: '2026-10-02T00:00:00.000Z', autor: 'u_otro' },
    }));
  }, guardado.clave);
  const pr = await ctxRecarga.newPage();
  await pr.goto(base);
  await pr.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pr.waitForFunction(() => /Conectando/.test(document.querySelector('#estado').textContent));
  const pidRec = await seleccionar(pr, 10);
  await pr.waitForSelector('#sel-tb', { state: 'visible' });
  await pr.click('#sel-tb .col-btn[data-c="revisar"]');
  await pr.waitForSelector(`[data-pid="${pidRec}"] mark.hl`);
  const localAntesDeConectar = await pr.evaluate((clave) => Object.keys(JSON.parse(localStorage.getItem(clave) || '{}')), guardado.clave);
  check(localAntesDeConectar.length === 4 && ['ajena', 'huerfana', 'vieja'].every((k) => localAntesDeConectar.includes(k)), `anotar mientras la base conecta no pisa lo que ya había en la copia local (${localAntesDeConectar.join()})`);
  await pr.waitForFunction(() => window.__docs && window.__docs.huerfana && window.__docs.huerfana.autor === 'u_me' && Object.values(window.__docs).some((d) => d.tipo === 'subrayado' && d.autor === 'u_me'), null, { timeout: 10000 });
  check(true, 'al conectar suben la anotación que quedó en el navegador en otra sesión y la hecha mientras conectaba, con su autor');
  await pr.waitForFunction((clave) => { const j = JSON.parse(localStorage.getItem(clave) || '{}'); return !j.huerfana && !j.vieja && !Object.values(j).some((a) => a.tipo === 'subrayado'); }, guardado.clave, { timeout: 10000 });
  await pr.click('.tab[data-tab="todas"]');
  const recuperada = await pr.evaluate((clave) => ({
    ficha: !!document.querySelector('.ficha[data-id="huerfana"]'),
    vieja: (document.querySelector('.ficha[data-id="vieja"] textarea') || {}).value || '',
    viejaEnBase: window.__docs.vieja.nota,
    ajenaVisible: !!document.querySelector('.ficha[data-id="ajena"]') || !!window.__docs.ajena,
    local: Object.keys(JSON.parse(localStorage.getItem(clave) || '{}')),
  }), guardado.clave);
  check(recuperada.ficha, 'la recuperada aparece en el panel y sale de la copia local una vez subida');
  check(recuperada.vieja === 'Versión de la base' && recuperada.viejaEnBase === 'Versión de la base', 'una copia local atrasada de algo que la base ya tiene no pisa la versión de la base');
  check(!recuperada.ajenaVisible && recuperada.local.join() === 'ajena', `la copia local de una anotación de otra cuenta no se carga ni se sube, pero se conserva para cuando vuelva su autora (${recuperada.local.join()})`);
  await ctxRecarga.close();

  // ---------------------------------------------------------------- sólo lectura de verdad
  const ctxSL = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxSL.addInitScript(() => { window.__soloLectura = true; window.__semilla = { nota1: { id: 'nota1', tipo: 'general', nota: 'Nota visible en sólo lectura', estado: 'abierta', creado: '2026-10-01T00:00:00.000Z', autor: 'u_otro' } }; });
  await ctxSL.addInitScript(conBase);
  const psl = await ctxSL.newPage();
  await psl.goto(base);
  await psl.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await psl.waitForFunction(() => document.body.classList.contains('solo-lectura'));
  await psl.click('.tab[data-tab="todas"]');
  await psl.waitForSelector('.ficha .nota-texto');
  check((await psl.$eval('.ficha .nota-texto', (n) => n.textContent)) === 'Nota visible en sólo lectura' && !(await psl.$('.ficha textarea')), 'en sólo lectura la nota se ve como texto');
  await seleccionar(psl, 10);
  await psl.waitForSelector('#sel-tb', { state: 'visible' });
  const tbSL = await psl.evaluate(() => ({ color: getComputedStyle(document.querySelector('#sel-tb .col-btn')).display, copiar: getComputedStyle(document.querySelector('#sel-copiar')).display }));
  check(tbSL.color === 'none' && tbSL.copiar !== 'none', 'la barra de selección sólo ofrece copiar');
  await psl.keyboard.press('1');
  await psl.waitForTimeout(200);
  check((await psl.$$('mark.hl')).length === 0 && !(await psl.evaluate(() => Object.values(window.__docs).some((d) => d.tipo === 'subrayado'))), 'los atajos no anotan en sólo lectura');
  await ctxSL.close();

  // ---------------------------------------------------------------- lectura en voz alta: cambiar de sección mientras suena
  const ctxVoz = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxVoz.addInitScript(sinBase);
  await ctxVoz.addInitScript(() => {
    // Un sintetizador que acepta hablar y nunca termina, para probar el estado sin depender de voces reales.
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    // cancel() dispara «interrupted» en la locución en curso, como hace Chromium
    Object.defineProperty(window, 'speechSynthesis', { value: { speak: function (u) { this.actual = u; if (u.onstart) u.onstart(); }, cancel: function () { var u = this.actual; this.actual = null; if (u && u.onerror) setTimeout(function () { u.onerror({ error: 'interrupted' }); }, 0); }, getVoices: function () { return []; } }, configurable: true });
  });
  const pv = await ctxVoz.newPage();
  await pv.goto(base + '#cap-01');
  await pv.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pv.click('#sec-cap-01 button[data-escuchar]');
  check((await pv.$eval('#sec-cap-01 button[data-escuchar]', (b) => b.textContent)) === 'Detener' && (await pv.$$('#sec-cap-01 .bloque.leyendo')).length === 1, 'escuchar ilumina el párrafo que suena');
  await pv.evaluate(() => { location.hash = '#cap-02'; });
  await pv.waitForSelector('#sec-cap-02:not([hidden])');
  await pv.click('#sec-cap-02 button[data-escuchar]');
  const botones = await pv.evaluate(() => ({ uno: document.querySelector('#sec-cap-01 button[data-escuchar]').textContent, dos: document.querySelector('#sec-cap-02 button[data-escuchar]').textContent, leyendo: document.querySelectorAll('#sec-cap-02 .bloque.leyendo').length }));
  check(botones.uno === 'Escuchar' && botones.dos === 'Detener' && botones.leyendo === 1, `escuchar otra sección cambia la lectura en vez de sólo detenerla (${botones.uno} / ${botones.dos})`);
  await pv.waitForTimeout(50);
  check(!/No se pudo leer/.test(await pv.$eval('#estado', (e) => e.textContent)) && (await pv.$eval('#sec-cap-02 button[data-escuchar]', (b) => b.textContent)) === 'Detener', 'la interrupción que provoca cancelar no se toma por un fallo');
  await pv.click('#sec-cap-02 button[data-escuchar]');
  check((await pv.$eval('#sec-cap-02 button[data-escuchar]', (b) => b.textContent)) === 'Escuchar', 'pulsar en la misma sección detiene');
  await pv.click('#sec-cap-02 button[data-escuchar]');
  await pv.evaluate(() => { location.hash = '#cap-01'; });
  await pv.waitForSelector('#sec-cap-01:not([hidden])');
  check((await pv.$eval('#sec-cap-02 button[data-escuchar]', (b) => b.textContent)) === 'Escuchar' && (await pv.$$('.bloque.leyendo')).length === 0, 'cambiar de sección detiene la lectura');
  await ctxVoz.close();

  // ---------------------------------------------------------------- ancho de teléfono
  const movil = await browser.newContext({ viewport: { width: 400, height: 800 } });
  await movil.addInitScript(sinBase);
  const pm = await movil.newPage();
  await pm.goto(base);
  await pm.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  const anchos = await pm.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  check(anchos[0] <= anchos[1], `sin desborde horizontal a 400 px (${anchos.join(' / ')})`);
  await pm.waitForFunction(() => /Sin base compartida/.test(document.querySelector('#estado').textContent));
  await pm.evaluate(() => { const k = Object.keys(localStorage).find((x) => /^lector-anotaciones:[a-z0-9-]+$/.test(x)) || 'lector-anotaciones:libro-de-ejemplo'; const p = document.querySelector('article.seccion:not([hidden]) p.bloque[data-pid]'); localStorage.setItem(k, JSON.stringify({ m1: { id: 'm1', tipo: 'subrayado', sid: p.closest('article').id.replace(/^sec-/, ''), pid: p.getAttribute('data-pid'), src: p.getAttribute('data-src'), inicio: 0, fin: 10, cita: p.textContent.slice(0, 10), antes: '', despues: p.textContent.slice(10, 40), color: 'duda', nota: '', estado: 'abierta', creado: '2026-10-01T00:00:00.000Z' } })); });
  await pm.reload();
  await pm.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pm.click('#b-panel');
  await pm.waitForSelector('aside.panel.abierta');
  await pm.click('.ficha .cab button.enlace');
  check(!(await pm.$eval('aside.panel', (a) => a.classList.contains('abierta'))), 'en móvil, «ir al texto» cierra el panel para dejar ver el pasaje');
  await movil.close();
} finally {
  await browser.close();
  srv.close();
}
console.log(fallas ? `\n${fallas} comprobaciones fallaron` : '\nTodo en orden');
process.exit(fallas ? 1 : 0);
