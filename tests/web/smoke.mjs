// Prueba de humo de la página con Playwright: sirve web/index.html con el libro de ejemplo y recorre
// el flujo del autor en dos modos: sin base compartida (respaldo local) y con una base simulada.
//
//   1. Subrayar, dejar una nota de sección, recargar y comprobar que todo persiste; filtros, búsqueda,
//      copia en JSON, ancho de teléfono sin desborde y ningún error de consola.
//   2. Reubicación: anotaciones cuyo bloque o posición cambió (como tras reconstruir libro.json) se
//      vuelven a encontrar por la cita y el contexto; las que ya no están se declaran perdidas.
//   3. Con la base simulada: un cambio llegado de fuera no interrumpe la nota que se está escribiendo; una
//      escritura rechazada vuelve a lo que la base tiene (color, estado, nota, réplica) o, si la base no la tenía,
//      se conserva marcada «sin guardar» con reintento; un rechazo transitorio se reintenta solo; un rechazo de
//      permiso pasa a sólo lectura, señalado donde el eco de la base no lo pisa, sin retirar lo nuevo de la vista;
//      lo que un lector de sólo lectura anotó antes de saberlo queda marcado y se exporta con esa señal; los botones
//      de la ficha llevan lo recién escrito; el respaldo se mide en bytes.
//   4. Teclado y pantalla estrecha: el foco sobrevive al redibujo (marcas, resultados, colores, «Borrar»); índice y
//      panel cerrados quedan inertes; el marcador «cambió» se puede tocar.
//   5. Accesibilidad y salida de las fichas: roles y estados ARIA, «Saltar al texto», pestañas con flechas, filtros
//      resumidos; un clic fuera de la ficha o Esc/Ctrl+Enter en la nota guarda y sale; atajos y figura como diálogos
//      modales; ajustes de lectura recordados. En el teléfono: velo que cierra el cajón al tocar fuera, foco que entra
//      y vuelve, barra de subrayado abajo con botones grandes, «Deshacer» a mano con el panel abierto.
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
// Espera a que `fn` se cumpla en la página y dice si ocurrió: lo que no debe tardar se comprueba con un plazo corto
// y un `check` que nombre lo que no pasó, en vez de abortar la prueba entera a los 30 s.
async function esperar(page, fn, arg = null, plazo = 5000) {
  try { await page.waitForFunction(fn, arg, { timeout: plazo }); return true; } catch { return false; }
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
  // window.__rechazar rechaza toda escritura con ese código; window.__rechazarUnaVez sólo la siguiente (para probar
  // el reintento); window.__intentos cuenta los set por colección.
  window.__intentos = {};
  const db = {
    collection: (nombre) => ({
      doc: (id) => ({
        set: (data) => { window.__intentos[nombre] = (window.__intentos[nombre] || 0) + 1; const rechazo = window.__rechazar || window.__rechazarUnaVez; window.__rechazarUnaVez = null; if (rechazo) return Promise.reject({ code: rechazo, message: 'simulado' }); const docs = coleccion(nombre); const existia = !!docs[id]; docs[id] = JSON.parse(JSON.stringify(data)); setTimeout(() => emitir(nombre, [{ type: existia ? 'modified' : 'added', id }]), 30); return Promise.resolve(); },
        delete: () => { if (window.__rechazar) return Promise.reject({ code: window.__rechazar, message: 'simulado' }); delete coleccion(nombre)[id]; setTimeout(() => emitir(nombre, [{ type: 'removed', id }]), 30); return Promise.resolve(); },
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

// Los filtros y la exportación viven en desplegables del panel: se abren antes de usarlos.
async function abrirDe(page, sel) {
  await page.evaluate((s) => { const n = document.querySelector(s); const d = n && n.closest('details'); if (d) d.open = true; }, sel);
}
async function pulsar(page, sel) { await abrirDe(page, sel); await page.click(sel); }

// Las acciones de una ficha compacta aparecen al activarla (tocándola): se activa antes de pulsar una.
async function enFicha(page, selFicha, selBoton) {
  await page.evaluate((sel) => { const f = document.querySelector(sel); if (f && !f.classList.contains('foco')) f.querySelector('.cab > span').click(); }, selFicha);
  await page.click(`${selFicha} ${selBoton}`);
}

// Selecciona un texto dado dentro de la sección visible.
async function seleccionarTexto(page, t) {
  return page.evaluate((t) => {
    for (const b of document.querySelectorAll('article.seccion:not([hidden]) [data-pid]')) {
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const i = n.nodeValue.indexOf(t); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + t.length); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); return true; } }
    }
    return false;
  }, t);
}
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

// libro.json alterado al vuelo: `fn(L)` lo modifica antes de servirlo a esa página.
async function libroAlterado(page, fn) {
  await page.route('**/libro.json', async (route) => {
    const L = JSON.parse(fs.readFileSync(LIBRO, 'utf8'));
    fn(L);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(L) });
  });
}
// Páginas en el capítulo 1 (el ejemplo no trae): tres bloques por página.
const paginar = (L) => { const cap1 = L.secciones.find((s) => /^Capítulo 1/.test(s.titulo)); cap1.pagina = 1; cap1.bloques.forEach((b, i) => { b.pagina = 1 + Math.floor(i / 3); }); };
// Un bloque del capítulo 2 cambiado respecto de la construcción anterior.
const conCambio = (L) => { const cap2 = L.secciones.find((s) => /^Capítulo 2/.test(s.titulo)); const b = cap2.bloques.find((x) => x.t === 'p'); b.anterior = 'Una inferencia es un salto desde lo observado hacia lo no observado.'; L.anterior_generado = '2026-01-01'; L.cambios = 1; };
// Cuatro párrafos más al final del capítulo 1: la misma cita en tres de ellos con otro contexto, y el contexto exacto en el cuarto.
const conRepetidos = (L) => {
  const cap1 = L.secciones.find((s) => /^Capítulo 1/.test(s.titulo));
  ['Primero, la inferencia tramposa se disfraza.', 'Después, la inferencia tramposa se repite.', 'Al final, la inferencia tramposa se olvida.', 'Contexto previo la inferencia tramposa contexto posterior.']
    .forEach((t, i) => { cap1.bloques.push({ id: `cap-01-b9${i}`, t: 'p', html: t, src: `extra.md:${i + 1}`, h: `h${i}`.padEnd(12, '0') }); });
};
const activo = (page) => page.evaluate(() => {
  const a = document.activeElement; const r = a ? a.getBoundingClientRect() : null;
  return { tag: a ? a.tagName : null, texto: a ? a.textContent.trim().slice(0, 30) : '', clase: a ? a.className : '', enFicha: !!(a && a.closest('.ficha')), enFoco: !!(a && a.closest('.ficha.foco')), enLateral: !!(a && a.closest('#indice, #panel')), left: r ? Math.round(r.left) : null };
});

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
  check(sub && sub.color === 'revisar' && sub.pid === pid && /:\d+$/.test(sub.src) && sub.cita.length === 20,
    'el subrayado lleva color, bloque, archivo:línea y cita exacta');
  check(sub && typeof sub.libro === 'string' && sub.libro.length >= 10, `la anotación registra la versión del libro (${sub && sub.libro})`);
  check(cap && cap.nota === 'Nota de prueba de la sección' && cap.sid, 'la nota de sección guarda su texto y su sección');

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
  const json = (() => { try { return JSON.parse(copiado); } catch { return null; } })();
  check(json && Array.isArray(json.anotaciones) && json.anotaciones.length === 2, 'Copiar todo (JSON) produce {libro, anotaciones[]}');

  // Copiar una sola anotación como texto, y copiar una selección con su referencia.
  await page.click('.tab[data-tab="todas"]');
  await enFicha(page, `.ficha[data-id="${sub.id}"]`, 'button:has-text("Copiar")');
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
    // la cita aparece sin su contexto en tres bloques anteriores y con él en el cuarto: hay que recorrerlos todos
    const triple = Object.assign({}, s, { id: 'triple', cita: 'la inferencia tramposa', antes: 'Contexto previo ', despues: ' contexto posterior', inicio: 0, fin: 22, color: 'duda' });
    j.movida = movida; j.corrida = corrida; j.perdida = perdida; j.repetida = repetida; j.conctx = conctx; j.triple = triple;
    localStorage.setItem(clave, JSON.stringify(j));
  }, { clave: guardado.clave, pid, pidSiguiente });
  await page.reload();
  await page.waitForSelector(`[data-pid="${pid}"] mark.hl`);
  await pulsar(page, '.filtro[data-f="todas"]');
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
  const marcasTriple = await page.$$eval('article.seccion:not([hidden]) mark.hl', (ms) => ms.filter((m) => m.getAttribute('data-aids').split(' ').includes('triple')).map((m) => m.closest('[data-pid]').getAttribute('data-pid')));
  check(marcasTriple.length === 1 && marcasTriple[0] === 'cap-01-b93', `una cita repetida sin contexto en tres bloques se reubica en el cuarto, donde el contexto coincide (${marcasTriple.join(',') || 'ninguna'})`);
  const avisos = await page.$$eval('.ficha', (fs) => fs.map((f) => [f.getAttribute('data-id'), (f.querySelector('.aviso-ubic') || {}).textContent || '']));
  const aviso = (id) => (avisos.find((x) => x[0] === id) || [])[1] || '';
  check(/^Reubicado/.test(aviso('movida')) && /^Reubicado/.test(aviso('corrida')) && /otro bloque/.test(aviso('corrida')), 'las fichas reubicadas lo dicen');
  check(/^No encontrado/.test(aviso('perdida')), 'la ficha perdida lo dice y conserva la cita');
  check(aviso(sub.id) === '', 'la anotación intacta no lleva aviso');
  const guardadoDespues = await page.evaluate((clave) => JSON.parse(localStorage.getItem(clave)), guardado.clave);
  check(guardadoDespues.movida.inicio === sub.inicio + 7 && guardadoDespues.corrida.pid === pidSiguiente, 'la reubicación no modifica lo guardado');
  // Lo que se copia de una ficha reubicada apunta al bloque donde la cita está hoy, y lo dice; la perdida lo declara.
  await enFicha(page, '.ficha[data-id="corrida"]', 'button:has-text("Copiar")');
  const copiaCorrida = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(copiaCorrida.startsWith(`[duda] ${sub.sidTitulo} ·`) && copiaCorrida.includes(`· ${sub.src} ·`) && copiaCorrida.includes('reubicado') && copiaCorrida.includes('(antes viejo.md:1)'),
    `Copiar en una ficha reubicada da el bloque actual y avisa (${JSON.stringify(copiaCorrida).slice(0, 110)}…)`);
  await enFicha(page, '.ficha[data-id="perdida"]', 'button:has-text("Copiar")');
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

  await pulsar(pdb, '#b-nota-cap');
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
  check(await p2.$eval('#atajos', (a) => a.open), 'la tecla ? muestra los atajos');
  await p2.keyboard.press('Escape');
  // etiquetas en la nota, filtro por etiqueta, búsqueda en notas
  await p2.click('.tab[data-tab="todas"]');
  await p2.fill('.ficha textarea', 'Revisar con #carmen la cinética');
  await p2.$eval('.ficha textarea', (t) => t.blur());
  await p2.waitForSelector('.ficha .etiquetas button');
  check((await p2.$eval('.ficha .etiquetas button', (b) => b.textContent)) === '#carmen' && !(await p2.$eval('#f-etiqueta', (s) => s.hidden)), 'las #etiquetas de la nota se vuelven chips y un selector');
  await abrirDe(p2, '#f-etiqueta'); await p2.selectOption('#f-etiqueta', 'carmen');
  check((await p2.$$('.ficha')).length === 1, 'el filtro por etiqueta deja las fichas con esa etiqueta');
  await pulsar(p2, '.filtro[data-f="conservar"]');
  await p2.fill('#buscar', 'cinética');
  await p2.press('#buscar', 'Enter');
  await p2.waitForSelector('.res.anot');
  check(true, 'la búsqueda encuentra el texto de una nota');
  // activar el resultado con el teclado deja el foco en la ficha, no en el cuerpo del documento
  await p2.focus('.res.anot');
  await p2.keyboard.press('Enter');
  await p2.waitForSelector('.ficha.foco textarea');
  const trasEnterRes = await activo(p2);
  check(trasEnterRes.enFoco, `Enter en un resultado de búsqueda lleva el foco a la ficha (${trasEnterRes.tag})`);
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
  // la copia de esa selección trae sólo el bloque visible, no los de las secciones ocultas que siguen en el DOM
  await p2.click('#sel-copiar');
  const copiaFinal = await p2.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const textoUltimo = await p2.$eval(`[data-pid="${ultimoTexto}"]`, (p) => p.textContent.trim());
  check(copiaFinal.split('\n').slice(1).join('\n') === '«' + textoUltimo + '»' && !/00_preliminares\.md:\d+ →/.test(copiaFinal), `copiar una selección que sale del último bloque da sólo ese bloque (${copiaFinal.length} caracteres)`);
  await p2.keyboard.press('1');
  await p2.waitForSelector(`[data-pid="${ultimoTexto}"] mark.hl.c-revisar`);
  const subrayadoFinal = await p2.evaluate((pid) => { const k = Object.keys(localStorage).find((x) => /^lector-anotaciones:[a-z0-9-]+$/.test(x)); const a = Object.values(JSON.parse(localStorage.getItem(k))).find((x) => x.pid === pid); return a && { inicio: a.inicio, fin: a.fin, cita: a.cita }; }, ultimoTexto);
  check(subrayadoFinal && subrayadoFinal.inicio === 0 && subrayadoFinal.fin === subrayadoFinal.cita.length && /separar mejor\.$/.test(subrayadoFinal.cita), 'una selección que sale del último bloque se recorta a ese bloque entero');
  await p2.evaluate(() => window.getSelection().removeAllRanges());
  // el contorno de foco se mueve con la ficha enfocada
  await p2.click('.tab[data-tab="todas"]');
  const fichas = await p2.$$eval('.ficha', (fs) => fs.map((f) => f.getAttribute('data-id')));
  await p2.click(`.ficha[data-id="${fichas[0]}"] .cab button.enlace`);
  await p2.click('.tab[data-tab="todas"]');
  await p2.click(`.ficha[data-id="${fichas[1]}"] .cab button.enlace`);
  check((await p2.$$('mark.hl.foco')).length <= 1, 'sólo el subrayado de la ficha enfocada lleva contorno');
  // teclado: Enter y Espacio en una marca llevan el foco a su ficha; Enter en un color lo conserva en el botón
  await p2.focus('article.seccion:not([hidden]) mark.hl');
  await p2.keyboard.press('Enter');
  const trasEnterMarca = await activo(p2);
  check(trasEnterMarca.enFoco, `Enter en una marca del texto lleva el foco a la ficha (${trasEnterMarca.tag})`);
  await p2.focus('article.seccion:not([hidden]) mark.hl');
  await p2.keyboard.press(' ');
  const trasEspacio = await activo(p2);
  check(trasEspacio.enFoco, `Espacio en una marca del texto también la activa (${trasEspacio.tag})`);
  const colorAntes = await p2.$eval('.ficha.foco .col-btn.on', (b) => b.getAttribute('data-c'));
  const colorNuevo = colorAntes === 'duda' ? 'conservar' : 'duda';
  await p2.focus(`.ficha.foco .col-btn[data-c="${colorNuevo}"]`);
  await p2.keyboard.press('Enter');
  await p2.waitForSelector(`.ficha.foco .col-btn[data-c="${colorNuevo}"].on`);
  const trasColor = await activo(p2);
  check(trasColor.enFoco && trasColor.tag === 'BUTTON' && /col-btn/.test(trasColor.clase) && /\bon\b/.test(trasColor.clase), `Enter en un color de la ficha cambia el color y el foco sigue en ese botón (${trasColor.tag} ${trasColor.clase})`);
  await p2.focus('.ficha.foco button:has-text("Borrar")');
  await p2.keyboard.press('Enter');
  const trasBorrar = await activo(p2);
  await p2.keyboard.press('Tab');
  const trasTab = await activo(p2);
  await p2.keyboard.press('Enter');
  const trasNo = await activo(p2);
  check(trasBorrar.texto === 'Sí' && trasTab.texto === 'No' && trasNo.texto === 'Borrar' && trasNo.enFoco, `Enter en «Borrar» enfoca «Sí»; «No» devuelve el foco a «Borrar» (${trasBorrar.texto} / ${trasTab.texto} / ${trasNo.texto})`);
  // la barra de selección queda dentro de la ventana aunque la selección sea más alta que la pantalla
  await p2.setViewportSize({ width: 1280, height: 320 });
  await p2.evaluate(() => { location.hash = '#cap-01'; });
  await p2.waitForSelector('#sec-cap-01:not([hidden])');
  await p2.evaluate(() => {
    const bloques = document.querySelectorAll('#sec-cap-01 .bloque[data-pid]');
    const r = document.createRange(); r.setStart(bloques[0], 0); r.setEnd(bloques[bloques.length - 1], bloques[bloques.length - 1].childNodes.length);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.querySelector('#lectura').scrollTop = 400;
  });
  await p2.waitForSelector('#sel-tb', { state: 'visible' });
  await p2.waitForTimeout(250);
  const tbRect = await p2.$eval('#sel-tb', (t) => { const r = t.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), alto: window.innerHeight }; });
  check(tbRect.top >= 0 && tbRect.bottom <= tbRect.alto, `con una selección más alta que la ventana, la barra queda a la vista (top ${tbRect.top}, bottom ${tbRect.bottom}, ventana ${tbRect.alto})`);
  await p2.evaluate(() => window.getSelection().removeAllRanges());
  await p2.setViewportSize({ width: 1280, height: 900 });
  await p2.evaluate(() => { location.hash = '#cap-02'; });
  await p2.waitForSelector('#sec-cap-02:not([hidden])');
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
  await enFicha(p2, '.ficha', 'button:has-text("Borrar")');
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
  check(await p2.$eval('#lightbox', (l) => l.open), 'clic en una figura la amplía');
  await p2.keyboard.press('Escape');
  check(!(await p2.$eval('#lightbox', (l) => l.open)), 'Esc cierra la figura');
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
      // comillas, saltos y emoji: 56 000 unidades UTF-16 que, escapadas dentro del respaldo, pesan 104 000 bytes; con
      // «mediana» caben en una parte por unidades (176 000 < 180 KiB) pero no por bytes (224 000)
      rara: { id: 'rara', tipo: 'general', nota: '"ñ\n😀'.repeat(8000), estado: 'abierta', creado: '2026-10-02T02:00:00.000Z', autor: 'u_me' },
      mediana: { id: 'mediana', tipo: 'general', nota: 'x'.repeat(120000), estado: 'abierta', creado: '2026-10-02T03:00:00.000Z', autor: 'u_me' },
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
  await p3.waitForFunction(() => document.querySelectorAll('.ficha').length === 6);
  const fichaPregunta = await p3.$eval('.ficha[data-id="conpregunta"]', (f) => ({ pregunta: f.classList.contains('cierre-pregunta'), cierre: (f.querySelector('.cierre') || {}).textContent, respuesta: (f.querySelector('.respuesta') || {}).textContent, replica: !!f.querySelector('textarea.replica') }));
  check(fichaPregunta.pregunta && fichaPregunta.cierre === 'pregunta' && /Al inicio del capítulo/.test(fichaPregunta.respuesta) && fichaPregunta.replica, 'una respuesta con pregunta se muestra con su cierre y un cuadro para replicar');
  const fichaAtendida = await p3.$eval('.ficha[data-id="atendida"]', (f) => ({ cierre: (f.querySelector('.cierre') || {}).textContent, quien: (f.querySelector('.respuesta .quien') || {}).textContent, resuelta: f.classList.contains('resuelta') }));
  check(fichaAtendida.cierre === 'atendida' && /abc1234/.test(fichaAtendida.quien) && fichaAtendida.resuelta, 'una anotación atendida muestra el cierre y el commit');
  await p3.fill('.ficha[data-id="conpregunta"] textarea.replica', 'Al inicio.');
  await p3.$eval('.ficha[data-id="conpregunta"] textarea.replica', (t) => t.blur());
  await p3.waitForFunction(() => window.__docs.conpregunta && window.__docs.conpregunta.replica === 'Al inicio.');
  check(true, 'la réplica del autor queda guardada en la base');
  await pulsar(p3, '.filtro[data-f="preguntas"]');
  check((await p3.$$('.ficha')).length === 1, 'el filtro «preguntas» deja sólo la pregunta');
  await pulsar(p3, '.filtro[data-f="respondidas"]');
  check((await p3.$$('.ficha')).length === 2, 'el filtro «con respuesta» deja las respondidas');
  await pulsar(p3, '.filtro[data-f="todas"]');
  check(!(await p3.$('.ficha[data-id="ajena"] .cab button.enlace')) && (await p3.$eval('.ficha[data-id="conpregunta"] .acciones button', (b) => b.tagName)) === 'BUTTON', 'las notas generales no llevan «ir al texto» y los controles son botones');
  await pulsar(p3, '.filtro[data-f="todas"]');
  await p3.waitForFunction(() => Array.from(document.querySelectorAll('.ficha[data-id="ajena"] .autor span')).some((s) => s.textContent === 'Lectora Invitada'));
  check(true, 'la ficha de otra lectora lleva su nombre resuelto por la capacidad user');
  check(!(await p3.$eval('#f-autor', (s) => s.hidden)) && (await p3.$$eval('#f-autor option', (os) => os.map((o) => o.textContent))).includes('Lectora Invitada'), 'con varios lectores aparece el selector de lector');
  await abrirDe(p3, '#f-autor'); await p3.selectOption('#f-autor', 'u_otro');
  check((await p3.$$('.ficha')).length === 2, 'el filtro por lector deja sus anotaciones');
  await abrirDe(p3, '#f-autor'); await p3.selectOption('#f-autor', '');
  const pid3 = await seleccionar(p3, 12);
  await p3.waitForSelector('#sel-tb', { state: 'visible' });
  await p3.click('#sel-tb .col-btn[data-c="duda"]');
  await p3.waitForFunction(() => Object.values(window.__docs).some((d) => d.tipo === 'subrayado'));
  const mio = await p3.evaluate(() => Object.values(window.__docs).find((d) => d.tipo === 'subrayado'));
  check(mio.autor === 'u_me' && typeof mio.bh === 'string' && mio.bh.length === 12, 'un subrayado nuevo lleva autor y la huella del bloque');
  await p3.waitForFunction(() => window.__colecciones.respaldos && Object.values(window.__colecciones.respaldos).some((d) => d.libro));
  const respaldo = await p3.evaluate(() => Object.values(window.__colecciones.respaldos).find((d) => d.partes !== undefined && d.libro));
  check(respaldo.partes >= 2 && respaldo.n >= 4 && (await p3.evaluate(() => Object.keys(window.__colecciones.respaldos).length)) === respaldo.partes + 1, `el respaldo diario se trocea en documentos pequeños (${respaldo.partes} partes, ${respaldo.n} anotaciones)`);
  // el tope se mide en bytes del documento ya envuelto (las comillas y los saltos se escapan otra vez; ñ y emoji ocupan 2–4 bytes)
  const pesos = await p3.evaluate(() => Object.values(window.__colecciones.respaldos).filter((d) => d.anotaciones).map((d) => new TextEncoder().encode(JSON.stringify(d)).length));
  check(pesos.length === respaldo.partes && pesos.every((b) => b <= 180 * 1024), `cada parte del respaldo pesa menos de 180 KiB medida en bytes (${pesos.join(', ')})`);
  const respaldadas = await p3.evaluate(() => Object.values(window.__colecciones.respaldos).filter((d) => d.anotaciones).map((d) => JSON.parse(d.anotaciones).map((a) => a.id)).flat());
  check(respaldo.omitidas === 1 && !respaldadas.includes('grande') && respaldadas.includes('rara') && respaldadas.includes('mediana') && respaldadas.length === respaldo.n, `la anotación que no cabe ni sola queda fuera y el índice la cuenta (omitidas ${respaldo.omitidas}, respaldadas ${respaldadas.length})`);
  await p3.evaluate(() => { window.__colecciones.respaldos = {}; Object.keys(localStorage).filter((k) => k.endsWith(':respaldo')).forEach((k) => localStorage.removeItem(k)); });
  await p3.fill('.ficha[data-id="conpregunta"] textarea.replica', 'Al inicio, confirmado.');
  await p3.$eval('.ficha[data-id="conpregunta"] textarea.replica', (t) => t.blur());
  await p3.waitForFunction(() => Object.values(window.__colecciones.respaldos || {}).some((d) => d.libro) || true);
  await p3.waitForTimeout(150);
  check((await p3.evaluate(() => Object.keys(window.__colecciones.respaldos || {}).length)) === 0, 'editar una nota el mismo día no repite el respaldo (ya se hizo hoy)');
  const copiaResp = await (async () => { await ctx3.grantPermissions(['clipboard-read', 'clipboard-write']); await enFicha(p3, '.ficha[data-id="atendida"]', 'button:has-text("Copiar")'); return p3.evaluate(() => navigator.clipboard.readText()).catch(() => ''); })();
  check(/Respuesta \(atendida, abc1234\): Quitado en el párrafo 3\./.test(copiaResp), 'copiar una ficha incluye la respuesta y su cierre');
  // una escritura nueva rechazada por la base sin ser de permiso (la base está llena) no se pierde ni se da por guardada:
  // sigue a la vista marcada «sin guardar», con copia en el navegador, y la página sigue editable
  await p3.evaluate(() => { window.__rechazar = 'quota_exceeded'; });
  await seleccionar(p3, 8);
  await p3.waitForSelector('#sel-tb', { state: 'visible' });
  await p3.click('#sel-tb .col-btn[data-c="cortar"]');
  const llenaAvisada = await esperar(p3, () => /No se pudo guardar en la base \(quota_exceeded\)/.test(document.querySelector('#estado').textContent));
  const llena = await p3.evaluate(() => ({ marca: document.querySelectorAll('mark.hl.c-cortar').length, ficha: !!document.querySelector('.ficha.sin-guardar.c-cortar .aviso-guardar'), enBase: Object.values(window.__docs).some((d) => d.color === 'cortar'), local: Object.keys(localStorage).some((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /cortar/.test(localStorage.getItem(k))), sl: document.body.classList.contains('solo-lectura'), intentos: window.__intentos.anotaciones }));
  check(llenaAvisada && llena.marca === 1 && llena.ficha && !llena.enBase && llena.local && !llena.sl, `si la base rechaza la escritura por estar llena, la anotación sigue aquí marcada «sin guardar», con copia en el navegador, y la página sigue editable (avisada en 5 s ${llenaAvisada}, marcas ${llena.marca}, en base ${llena.enBase})`);
  // un cambio de color o de estado rechazado vuelve a lo que la base tiene: `previa` se toma antes de mutar
  await p3.evaluate(() => { window.getSelection().removeAllRanges(); document.querySelector('#estado').textContent = ''; });
  await enFicha(p3, `.ficha[data-id="${mio.id}"]`, '.col-btn[data-c="revisar"]');
  await p3.waitForFunction(() => /No se pudo guardar \(quota_exceeded\)/.test(document.querySelector('#estado').textContent));
  const colorRechazado = await p3.evaluate((id) => ({ marca: !!document.querySelector(`mark.hl.c-duda[data-aids~="${id}"]`), marcaNueva: !!document.querySelector(`mark.hl.c-revisar[data-aids~="${id}"]`), boton: document.querySelector(`.ficha[data-id="${id}"] .col-btn.on`).getAttribute('data-c'), ficha: document.querySelector(`.ficha[data-id="${id}"]`).classList.contains('c-duda'), base: window.__docs[id].color }), mio.id);
  check(colorRechazado.marca && !colorRechazado.marcaNueva && colorRechazado.boton === 'duda' && colorRechazado.ficha && colorRechazado.base === 'duda', `un cambio de color rechazado vuelve al color que la base tiene (marca ${colorRechazado.marca}, botón ${colorRechazado.boton}, base ${colorRechazado.base})`);
  await p3.evaluate(() => { document.querySelector('#estado').textContent = ''; });
  await enFicha(p3, `.ficha[data-id="${mio.id}"]`, 'button[data-accion="estado"]');
  await p3.waitForFunction(() => /No se pudo guardar \(quota_exceeded\)/.test(document.querySelector('#estado').textContent));
  const estadoRechazado = await p3.evaluate((id) => ({ resuelta: document.querySelector(`.ficha[data-id="${id}"]`).classList.contains('resuelta'), boton: document.querySelector(`.ficha[data-id="${id}"] button[data-accion="estado"]`).textContent, base: window.__docs[id].estado }), mio.id);
  check(!estadoRechazado.resuelta && estadoRechazado.boton === 'Resuelta' && estadoRechazado.base === 'abierta', `un cambio de estado rechazado vuelve al estado que la base tiene (${estadoRechazado.boton}, base ${estadoRechazado.base})`);
  // una nota rechazada mientras se escribe no se pierde: el borrador sigue en el cuadro (con el foco), la ficha queda
  // «sin guardar» con reintento y copia local, y la base conserva lo suyo hasta que el reintento la actualiza
  await p3.evaluate(() => { document.querySelector('#estado').textContent = ''; });
  await p3.focus('.ficha[data-id="atendida"] textarea');
  await p3.keyboard.type(' y el adverbio', { delay: 10 });
  const borradorAvisado = await esperar(p3, () => /sigue aquí/.test(document.querySelector('#estado').textContent) && !!document.querySelector('.ficha[data-id="atendida"].sin-guardar'));
  const notaRechazada = await p3.evaluate(() => ({ cuadro: document.querySelector('.ficha[data-id="atendida"] textarea').value, foco: document.activeElement.id, base: window.__docs.atendida.nota, reintentar: !!document.querySelector('.ficha[data-id="atendida"] button[data-accion="reintentar"]'), local: Object.keys(localStorage).some((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /adverbio/.test(localStorage.getItem(k))) }));
  check(borradorAvisado && notaRechazada.cuadro === 'Quitar el adjetivo y el adverbio' && notaRechazada.foco === 'nota-atendida' && notaRechazada.base === 'Quitar el adjetivo' && notaRechazada.reintentar && notaRechazada.local, `una nota rechazada conserva el borrador en el cuadro con el foco, marcada «sin guardar» con reintento y copia local, y la base sigue con lo suyo (${JSON.stringify(notaRechazada.cuadro)}, base ${JSON.stringify(notaRechazada.base)})`);
  await p3.evaluate(() => { window.__rechazar = null; window.getSelection().removeAllRanges(); });
  await p3.click('.ficha[data-id="atendida"] button[data-accion="reintentar"]');
  const reintentada = await esperar(p3, () => window.__docs.atendida.nota === 'Quitar el adjetivo y el adverbio' && !document.querySelector('.ficha[data-id="atendida"].sin-guardar'));
  check(reintentada, 'reintentar desde la ficha lleva el borrador a la base y quita la marca');
  await p3.$eval('.ficha[data-id="atendida"] textarea', (t) => t.blur());
  await enFicha(p3, '.ficha[data-id="ajena"]', 'button:has-text("Borrar")');
  await p3.click('.ficha[data-id="ajena"] .confirmar button:has-text("Sí")');
  await p3.waitForFunction(() => !window.__docs.ajena && /^Conectado/.test(document.querySelector('#estado').textContent));
  check(!!(await p3.$('#deshacer')), 'el enlace de deshacer sobrevive al eco de la base que confirma el borrado');
  await p3.click('#deshacer');
  await p3.waitForFunction(() => !!window.__docs.ajena);
  check(true, 'deshacer devuelve la anotación a la base');
  check(errores3.length === 0, `sin errores de página con base y usuario${errores3.length ? ': ' + errores3.join(' | ') : ''}`);
  await ctx3.close();

  // ---------------------------------------------------------------- un borrador que no subió sobrevive a la recarga
  // la copia local es más reciente que la versión de la base: al recargar manda el borrador y vuelve a subir
  const ctxBr = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxBr.addInitScript(() => {
    // en la segunda carga la base ya trae la respuesta que otra sesión escribió mientras el borrador esperaba
    const carga = (Number(sessionStorage.getItem('carga')) || 0) + 1; sessionStorage.setItem('carga', String(carga));
    const otra = carga >= 2 ? { respuesta: 'Atendido en otra sesión', cierre: 'atendida', editado: '2026-10-01T00:00:00.000Z' } : {};
    window.__semilla = { borrador: Object.assign({ id: 'borrador', tipo: 'general', nota: 'Texto original', estado: 'abierta', creado: '2026-10-01T00:00:00.000Z', editado: '2026-10-01T00:00:00.000Z', autor: 'u_me' }, otra) };
  });
  await ctxBr.addInitScript(conBase);
  const pbr = await ctxBr.newPage();
  await pbr.goto(base);
  await pbr.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pbr.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  await pbr.click('.tab[data-tab="todas"]');
  await pbr.evaluate(() => { window.__rechazar = 'unavailable'; });
  await pbr.focus('.ficha[data-id="borrador"] textarea');
  await pbr.keyboard.type(' y añadido', { delay: 10 });
  const brMarcado = await esperar(pbr, () => !!document.querySelector('.ficha[data-id="borrador"].sin-guardar'));
  check(brMarcado, 'un borrador rechazado queda marcado «sin guardar»');
  // un cambio de otra sesión que llega mientras tanto se funde debajo del borrador sin pisarlo
  await pbr.evaluate(() => window.__cambioExterno('borrador', { respuesta: 'Respondida mientras tanto', cierre: 'pregunta' }));
  await pbr.waitForSelector('.ficha[data-id="borrador"] .respuesta, .ficha[data-id="borrador"] .resp, .ficha[data-id="borrador"]').catch(() => {});
  const brFundido = await pbr.evaluate(() => ({ cuadro: (document.querySelector('.ficha[data-id="borrador"] textarea') || {}).value, sinGuardar: !!document.querySelector('.ficha[data-id="borrador"].sin-guardar'), respuesta: /Respondida mientras tanto/.test(document.querySelector('.ficha[data-id="borrador"]').textContent) }));
  check(brFundido.cuadro === 'Texto original y añadido' && brFundido.sinGuardar && brFundido.respuesta, `un cambio externo mientras hay borrador se muestra sin pisar el borrador (${JSON.stringify(brFundido)})`);
  await pbr.reload();
  await pbr.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  const brSubido = await esperar(pbr, () => window.__docs.borrador && window.__docs.borrador.nota === 'Texto original y añadido', null, 10000);
  await pbr.click('.tab[data-tab="todas"]');
  const brTras = await pbr.evaluate(() => ({ cuadro: (document.querySelector('.ficha[data-id="borrador"] textarea') || {}).value, sinGuardar: !!document.querySelector('.ficha[data-id="borrador"].sin-guardar'), local: Object.keys(localStorage).some((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /borrador/.test(localStorage.getItem(k))), respuesta: window.__docs.borrador.respuesta, cierre: window.__docs.borrador.cierre }));
  check(brSubido && brTras.cuadro === 'Texto original y añadido' && !brTras.sinGuardar && !brTras.local, `al recargar, el borrador local más reciente que la base manda, sube y suelta la copia local (${JSON.stringify(brTras.cuadro)})`);
  check(brTras.respuesta === 'Atendido en otra sesión' && brTras.cierre === 'atendida', `y lo que otra sesión escribió entre tanto (respuesta, cierre) se conserva al subir el borrador (${brTras.respuesta}, ${brTras.cierre})`);
  await ctxBr.close();

  // ---------------------------------------------------------------- un borrador editado sin base conserva la lista de campos
  // borrador recuperado con la lista {nota}; se abre sin base y se escribe la réplica: la lista guardada debe sumar
  // la réplica, y al conectar después deben subir la nota y la réplica sin pisar la respuesta de la base
  const claveL = guardado.clave;
  const borradorX = { id: 'x', tipo: 'general', nota: 'Nota en borrador', estado: 'abierta', cierre: 'pregunta', respuesta: '¿Por qué?', creado: '2026-10-01T00:00:00.000Z', editado: '2026-10-05T00:00:00.000Z', autor: 'u_me' };
  const ctxOff = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxOff.addInitScript(sinBase);
  await ctxOff.addInitScript(([clave, x]) => { if (!sessionStorage.getItem('sembrado')) { sessionStorage.setItem('sembrado', '1'); localStorage.setItem(clave, JSON.stringify({ x })); localStorage.setItem(clave + ':campos', JSON.stringify({ x: { nota: true } })); } }, [claveL, borradorX]);
  const poff = await ctxOff.newPage();
  await poff.goto(base);
  await poff.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await poff.click('.tab[data-tab="todas"]');
  await poff.waitForSelector('#nota-x-replica');
  await poff.fill('#nota-x-replica', 'Porque lo dice la guía');
  await poff.$eval('#nota-x-replica', (t) => t.blur());
  const offLocal = await poff.evaluate((clave) => ({ campos: JSON.parse(localStorage.getItem(clave + ':campos') || '{}'), copia: JSON.parse(localStorage.getItem(clave) || '{}') }), claveL);
  check(offLocal.campos.x && offLocal.campos.x.nota && offLocal.campos.x.replica && offLocal.copia.x.replica === 'Porque lo dice la guía', `sin base, la lista de campos guardada suma la réplica (${JSON.stringify(offLocal.campos.x)})`);
  const estadoOff = await poff.evaluate((clave) => ({ copia: localStorage.getItem(clave), campos: localStorage.getItem(clave + ':campos') }), claveL);
  await ctxOff.close();
  const ctxOn = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxOn.addInitScript(() => { window.__semilla = { x: { id: 'x', tipo: 'general', nota: 'Nota original', estado: 'resuelta', cierre: 'pregunta', respuesta: '¿Por qué? Ampliada en otra sesión', creado: '2026-10-01T00:00:00.000Z', editado: '2026-10-02T00:00:00.000Z', autor: 'u_me' } }; });
  await ctxOn.addInitScript(conBase);
  await ctxOn.addInitScript(([clave, e]) => { if (!sessionStorage.getItem('sembrado')) { sessionStorage.setItem('sembrado', '1'); localStorage.setItem(clave, e.copia); localStorage.setItem(clave + ':campos', e.campos); } }, [claveL, estadoOff]);
  const pon = await ctxOn.newPage();
  await pon.goto(base);
  const onSubido = await esperar(pon, () => window.__docs && window.__docs.x && window.__docs.x.replica === 'Porque lo dice la guía', null, 10000);
  const onBase = await pon.evaluate((clave) => ({ x: window.__docs.x, copia: localStorage.getItem(clave), campos: JSON.parse(localStorage.getItem(clave + ':campos') || '{}') }), claveL);
  check(onSubido && onBase.x.nota === 'Nota en borrador' && onBase.x.respuesta === '¿Por qué? Ampliada en otra sesión' && onBase.x.estado === 'resuelta', `al conectar suben la nota y la réplica del borrador, y la respuesta y el estado de la base se conservan (${JSON.stringify({ nota: onBase.x.nota, estado: onBase.x.estado })})`);
  const sueltas = await esperar(pon, (clave) => !JSON.parse(localStorage.getItem(clave) || '{}').x && !JSON.parse(localStorage.getItem(clave + ':campos') || '{}').x, claveL);
  check(sueltas, 'y la copia local y su lista de campos se sueltan una vez subidas');
  await ctxOn.close();

  // ---------------------------------------------------------------- deshacer un borrado sin base devuelve la lista de campos
  // borrador y con lista {color} (cambio de color sin subir); sin base se borra y se deshace; al conectar, el color
  // del borrador debe subir sobre la copia más vieja de la base
  const ctxDz = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxDz.addInitScript(sinBase);
  await ctxDz.addInitScript((clave) => { if (!sessionStorage.getItem('sembrado')) { sessionStorage.setItem('sembrado', '1'); localStorage.setItem(clave, JSON.stringify({ y: { id: 'y', tipo: 'general', nota: 'Nota de y', color: 'duda', estado: 'abierta', creado: '2026-10-01T00:00:00.000Z', editado: '2026-10-05T00:00:00.000Z', autor: 'u_me' } })); localStorage.setItem(clave + ':campos', JSON.stringify({ y: { color: true } })); } }, claveL);
  const pdz = await ctxDz.newPage();
  await pdz.goto(base);
  await pdz.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pdz.click('.tab[data-tab="todas"]');
  await enFicha(pdz, '.ficha[data-id="y"]', 'button:has-text("Borrar")');
  await pdz.click('.ficha[data-id="y"] .confirmar button:has-text("Sí")');
  await pdz.waitForSelector('#deshacer');
  await pdz.click('#deshacer');
  await pdz.waitForSelector('.ficha[data-id="y"]');
  const dzLocal = await pdz.evaluate((clave) => ({ campos: JSON.parse(localStorage.getItem(clave + ':campos') || '{}'), copia: JSON.parse(localStorage.getItem(clave) || '{}') }), claveL);
  check(dzLocal.campos.y && dzLocal.campos.y.color && dzLocal.copia.y, `deshacer un borrado sin base devuelve la anotación y su lista de campos (${JSON.stringify(dzLocal.campos)})`);
  const dzEstado = await pdz.evaluate((clave) => ({ copia: localStorage.getItem(clave), campos: localStorage.getItem(clave + ':campos') }), claveL);
  await ctxDz.close();
  const ctxDz2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxDz2.addInitScript(() => { window.__semilla = { y: { id: 'y', tipo: 'general', nota: 'Nota de y', color: 'revisar', estado: 'abierta', creado: '2026-10-01T00:00:00.000Z', editado: '2026-10-02T00:00:00.000Z', autor: 'u_me' } }; });
  await ctxDz2.addInitScript(conBase);
  await ctxDz2.addInitScript(([clave, e]) => { if (!sessionStorage.getItem('sembrado')) { sessionStorage.setItem('sembrado', '1'); localStorage.setItem(clave, e.copia); if (e.campos) localStorage.setItem(clave + ':campos', e.campos); } }, [claveL, dzEstado]);
  const pdz2 = await ctxDz2.newPage();
  await pdz2.goto(base);
  const dzSubido = await esperar(pdz2, () => window.__docs && window.__docs.y && window.__docs.y.color === 'duda', null, 10000);
  check(dzSubido, `al conectar, el color cambiado sin base sube aunque la anotación se borrara y se recuperara (${await pdz2.evaluate(() => window.__docs.y && window.__docs.y.color)})`);
  await ctxDz2.close();

  // ---------------------------------------------------------------- anotar mientras conecta no borra la lista de otro borrador
  // la copia local trae el borrador x con lista {nota}; se anota algo mientras la base conecta (eso escribe la lista);
  // al conectar, x debe subir sólo su nota, sin pisar la réplica más reciente que otra sesión dejó en la base
  const ctxLst = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxLst.addInitScript(() => { window.__retrasoDb = 1500; window.__semilla = { x: { id: 'x', tipo: 'general', nota: 'Nota base', replica: 'Réplica nueva de otra sesión', cierre: 'pregunta', respuesta: '¿Por qué?', estado: 'abierta', creado: '2026-10-01T00:00:00.000Z', editado: '2026-10-02T00:00:00.000Z', autor: 'u_me' } }; });
  await ctxLst.addInitScript(conBase);
  await ctxLst.addInitScript((clave) => { if (!sessionStorage.getItem('sembrado')) { sessionStorage.setItem('sembrado', '1'); localStorage.setItem(clave, JSON.stringify({ x: { id: 'x', tipo: 'general', nota: 'Nota del borrador', replica: 'Réplica vieja', cierre: 'pregunta', respuesta: '¿Por qué?', estado: 'abierta', creado: '2026-10-01T00:00:00.000Z', editado: '2026-10-05T00:00:00.000Z', autor: 'u_me' } })); localStorage.setItem(clave + ':campos', JSON.stringify({ x: { nota: true }, ajena9: { nota: true } })); } }, claveL);
  const plst = await ctxLst.newPage();
  await plst.goto(base);
  await plst.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await plst.waitForFunction(() => /Conectando/.test(document.querySelector('#estado').textContent));
  const pidLst = await seleccionar(plst, 10);
  await plst.waitForSelector('#sel-tb', { state: 'visible' });
  await plst.click('#sel-tb .col-btn[data-c="revisar"]');
  await plst.waitForSelector(`[data-pid="${pidLst}"] mark.hl`);
  const listaIntacta = await plst.evaluate((clave) => JSON.parse(localStorage.getItem(clave + ':campos') || '{}'), claveL);
  check(listaIntacta.x && listaIntacta.x.nota && listaIntacta.ajena9, `anotar mientras la base conecta no borra la lista de campos de los borradores aún no cargados (${JSON.stringify(listaIntacta)})`);
  const lstSubido = await esperar(plst, () => window.__docs && window.__docs.x && window.__docs.x.nota === 'Nota del borrador', null, 10000);
  const lstBase = await plst.evaluate((clave) => ({ x: window.__docs.x, campos: JSON.parse(localStorage.getItem(clave + ':campos') || '{}') }), claveL);
  check(lstSubido && lstBase.x.replica === 'Réplica nueva de otra sesión', `al conectar, el borrador sube su nota y la réplica más reciente de la base se conserva (${JSON.stringify(lstBase.x.replica)})`);
  check(!lstBase.campos.x && !!lstBase.campos.ajena9, `y su lista se suelta, mientras la de otra anotación no cargada se conserva (${JSON.stringify(lstBase.campos)})`);
  await ctxLst.close();

  // ---------------------------------------------------------------- la nota de otro lector rechazada por falta de permiso
  // can('data.write') resuelve null (host antiguo, visitante de fuera): la página deja escribir y es el rechazo
  // invalid_argument de la base el que decide: la nota vuelve a lo guardado y la página pasa a sólo lectura.
  const ctxF = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxF.addInitScript(() => { window.__semilla = { ajena: { id: 'ajena', tipo: 'general', nota: 'Nota de otra lectora', estado: 'abierta', creado: '2026-10-01T00:00:00.000Z', autor: 'u_otro' } }; });
  await ctxF.addInitScript(conBase);
  await ctxF.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pf = await ctxF.newPage();
  await pf.goto(base);
  await pf.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pf.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  check(await pf.$eval('#sl-chip', (c) => getComputedStyle(c).display === 'none'), 'con permiso de escritura el chip «sólo lectura» no se ve');
  await pf.click('.tab[data-tab="todas"]');
  await pf.waitForSelector('.ficha[data-id="ajena"] textarea');
  await pf.evaluate(() => { window.__rechazar = 'invalid_argument'; });
  await pf.fill('.ficha[data-id="ajena"] textarea', 'Nota de otra lectora, cambiada sin permiso');
  await pf.$eval('.ficha[data-id="ajena"] textarea', (t) => t.blur());
  await pf.waitForFunction(() => document.body.classList.contains('solo-lectura'));
  await pulsar(pf, '#b-copiar');
  const exportadoF = await pf.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const fantasma = await pf.evaluate(() => ({ texto: (document.querySelector('.ficha[data-id="ajena"] .nota-texto') || {}).textContent, sinGuardar: !!document.querySelector('.ficha[data-id="ajena"].sin-guardar'), cuadro: !!document.querySelector('.ficha textarea'), base: window.__docs.ajena.nota, chip: getComputedStyle(document.querySelector('#sl-chip')).display !== 'none', tb: document.querySelector('#sel-tb').getAttribute('aria-label'), estado: document.querySelector('#estado').textContent }));
  check(fantasma.texto === 'Nota de otra lectora, cambiada sin permiso' && fantasma.sinGuardar && !fantasma.cuadro && fantasma.base === 'Nota de otra lectora' && (() => { try { const j = JSON.parse(exportadoF); const a = j.anotaciones.find((x) => x.id === 'ajena'); return a.nota === 'Nota de otra lectora, cambiada sin permiso' && a.sin_guardar === 'invalid_argument'; } catch (e) { return false; } })(), `una nota rechazada por falta de permiso conserva el borrador marcado «sin guardar», se exporta con esa señal, la base no cambia y la página pasa a sólo lectura (${JSON.stringify(fantasma.texto)})`);
  check(fantasma.chip && fantasma.tb === 'Copiar la selección' && /sólo lectura/i.test(fantasma.estado), `el modo sólo lectura se señala con el chip, la barra de selección y el estado (${fantasma.estado.slice(0, 60)})`);
  await pf.evaluate(() => window.__cambioExterno('ajena', { estado: 'resuelta' }));
  await pf.waitForSelector('.ficha[data-id="ajena"].resuelta');
  check(/^Conectado .*sólo lectura/.test(await pf.$eval('#estado', (e) => e.textContent)), `un cambio llegado de fuera no borra el aviso de sólo lectura (${await pf.$eval('#estado', (e) => e.textContent)})`);
  await ctxF.close();

  // ---------------------------------------------------------------- rechazo transitorio: reintento, conservación y reintento manual
  // Lo que aquí no ocurre a tiempo es una FALLA con nombre, no un abort a los 30 s.
  const ctxRe = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxRe.addInitScript(conBase);
  const pre = await ctxRe.newPage();
  const erroresRe = [];
  pre.on('pageerror', (e) => erroresRe.push(String(e)));
  await pre.goto(base);
  await pre.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pre.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  // la base rechaza una sola vez con unavailable: la página reintenta sola (segundo intento) y la anotación llega
  await pre.evaluate(() => { window.__rechazarUnaVez = 'unavailable'; window.__intentos = {}; });
  await pulsar(pre, '#b-nota-cap');
  await pre.waitForSelector('.ficha.t-capitulo textarea');
  const reintentado = await esperar(pre, () => window.__intentos.anotaciones === 2 && Object.values(window.__docs).some((d) => d.tipo === 'capitulo'));
  const reintento = await pre.evaluate(() => ({ intentos: window.__intentos.anotaciones, sinGuardar: document.querySelectorAll('.ficha.sin-guardar').length, enBase: Object.values(window.__docs).some((d) => d.tipo === 'capitulo') }));
  check(reintentado && reintento.intentos === 2 && reintento.sinGuardar === 0, `un rechazo transitorio se reintenta una vez tras un retardo corto y la anotación llega a la base (${reintento.intentos} intentos en 5 s, en base ${reintento.enBase})`);
  await pre.fill('.ficha.t-capitulo textarea', 'Nota de sección valiosa');
  await pre.$eval('.ficha.t-capitulo textarea', (t) => t.blur());
  check(await esperar(pre, () => Object.values(window.__docs).some((d) => d.tipo === 'capitulo' && d.nota === 'Nota de sección valiosa')), 'la nota escrita después llega a la base');
  const idCap = await pre.evaluate(() => (Object.values(window.__docs).find((d) => d.tipo === 'capitulo') || Object.values(window.__docs)[0] || {}).id);
  // la base sigue sin responder: la anotación nueva no se pierde (memoria, ficha marcada, copia local, reintento a mano)
  await pre.evaluate(() => { window.__rechazar = 'unavailable'; window.__intentos = {}; });
  await pulsar(pre, '#b-nota-gen');
  const conservadaVisible = await esperar(pre, () => !!document.querySelector('.ficha.sin-guardar.t-general textarea'));
  check(conservadaVisible, 'si el reintento también falla, la anotación nueva sigue a la vista marcada «sin guardar» (en 5 s)');
  if (conservadaVisible) {
    await pre.focus('.ficha.sin-guardar.t-general textarea');
    await pre.keyboard.type('Texto que no se pierde', { delay: 5 });
    await pre.$eval('.ficha.sin-guardar.t-general textarea', (t) => t.blur());
    const enLocal = await esperar(pre, () => Object.keys(localStorage).some((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /Texto que no se pierde/.test(localStorage.getItem(k))));
    const conservada2 = await pre.evaluate(() => ({ intentos: window.__intentos.anotaciones, cuadro: document.querySelector('.ficha.sin-guardar.t-general textarea').value, aviso: document.querySelector('.ficha.sin-guardar.t-general .aviso-guardar').textContent, reintentar: !!document.querySelector('.ficha.sin-guardar.t-general button[data-accion="reintentar"]'), enBase: Object.values(window.__docs).some((d) => d.tipo === 'general'), estado: document.querySelector('#estado').textContent }));
    check(enLocal && conservada2.intentos >= 2 && conservada2.cuadro === 'Texto que no se pierde' && /unavailable/.test(conservada2.aviso) && conservada2.reintentar && !conservada2.enBase && /sigue aquí y en este navegador/.test(conservada2.estado), `la anotación conservada tiene su texto, la marca «sin guardar», copia en el navegador y reintento (${conservada2.intentos} intentos, en el navegador ${enLocal})`);
    await pre.evaluate(() => { window.__rechazar = null; });
    await pre.click('.ficha.sin-guardar.t-general button[data-accion="reintentar"]');
    check(await esperar(pre, () => Object.values(window.__docs).some((d) => d.tipo === 'general' && d.nota === 'Texto que no se pierde') && !document.querySelector('.ficha.sin-guardar') && !Object.keys(localStorage).some((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /Texto que no se pierde/.test(localStorage.getItem(k)))), 'reintentar desde la ficha la sube con su texto, quita la marca y la retira de la copia local');
  }
  // deshacer un borrado cuando la base no responde: la anotación con su nota no se pierde
  await pre.evaluate(() => { window.__rechazar = null; });
  await enFicha(pre, `.ficha[data-id="${idCap}"]`, 'button:has-text("Borrar")');
  await pre.click(`.ficha[data-id="${idCap}"] .confirmar button:has-text("Sí")`);
  await pre.waitForFunction((id) => !window.__docs[id] && !!document.querySelector('#deshacer'), idCap);
  await pre.evaluate(() => { window.__rechazar = 'unavailable'; });
  await pre.click('#deshacer');
  const deshechaVisible = await esperar(pre, (id) => !!document.querySelector(`.ficha[data-id="${id}"].sin-guardar textarea`), idCap);
  const deshecha = await pre.evaluate((id) => ({ cuadro: (document.querySelector(`.ficha[data-id="${id}"] textarea`) || {}).value, local: Object.keys(localStorage).some((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /Nota de sección valiosa/.test(localStorage.getItem(k))), enBase: !!window.__docs[id] }), idCap);
  check(deshechaVisible && deshecha.cuadro === 'Nota de sección valiosa' && deshecha.local && !deshecha.enBase, `si la base rechaza «Deshacer borrado», la anotación recuperada se conserva con su nota en memoria y en el navegador (a la vista ${deshechaVisible}, en el navegador ${deshecha.local})`);
  if (deshechaVisible) {
    await pre.evaluate(() => { window.__rechazar = null; });
    await pre.click(`.ficha[data-id="${idCap}"] button[data-accion="reintentar"]`);
    check(await esperar(pre, (id) => !!window.__docs[id] && window.__docs[id].nota === 'Nota de sección valiosa', idCap), 'y reintentar la devuelve a la base');
  }
  check(erroresRe.length === 0, `sin errores de página en los reintentos${erroresRe.length ? ': ' + erroresRe.join(' | ') : ''}`);
  await ctxRe.close();

  // ---------------------------------------------------------------- las clausuras de la ficha leen la anotación viva
  // Un guardado silencioso (nota, réplica) sustituye el objeto en memoria sin redibujar el panel: «Copiar» y los
  // botones de color y estado de esa misma ficha deben llevar lo recién escrito, no la copia con que se dibujó.
  const ctxCl = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxCl.addInitScript(conBase);
  await ctxCl.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pcl = await ctxCl.newPage();
  await pcl.goto(base);
  await pcl.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pcl.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  await pulsar(pcl, '#b-nota-gen');
  await pcl.waitForSelector('.ficha.t-general textarea');
  await pcl.fill('.ficha.t-general textarea', 'Nota escrita después de crearla');
  await pcl.$eval('.ficha.t-general textarea', (t) => t.blur());
  check(await esperar(pcl, () => Object.values(window.__docs).some((d) => d.tipo === 'general' && d.nota === 'Nota escrita después de crearla')), 'la nota general escrita tras crearla llega a la base');
  await enFicha(pcl, '.ficha.t-general', 'button[data-accion="copiar"]');
  const copiaViva = await pcl.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(/^\[nota general\] General\nNota: Nota escrita después de crearla$/.test(copiaViva), `«Copiar» en la ficha lleva la nota recién escrita (${JSON.stringify(copiaViva)})`);
  await seleccionar(pcl, 14);
  await pcl.waitForSelector('#sel-tb', { state: 'visible' });
  await pcl.click('#sel-tb .col-btn[data-c="revisar"]');
  check(await esperar(pcl, () => Object.values(window.__docs).some((d) => d.tipo === 'subrayado')), 'el subrayado llega a la base');
  await pcl.fill('.ficha.t-subrayado textarea', 'Nota del subrayado');
  await pcl.$eval('.ficha.t-subrayado textarea', (t) => t.blur());
  check(await esperar(pcl, () => Object.values(window.__docs).some((d) => d.tipo === 'subrayado' && d.nota === 'Nota del subrayado')), 'la nota del subrayado llega a la base');
  await enFicha(pcl, '.ficha.t-subrayado', '.col-btn[data-c="conservar"]');
  const colorYNota = await esperar(pcl, () => Object.values(window.__docs).some((d) => d.tipo === 'subrayado' && d.color === 'conservar'));
  const subrayadoCl = await pcl.evaluate(() => { const d = Object.values(window.__docs).find((x) => x.tipo === 'subrayado'); return { color: d.color, nota: d.nota, cuadro: document.querySelector('.ficha.t-subrayado textarea').value }; });
  check(colorYNota && subrayadoCl.color === 'conservar' && subrayadoCl.nota === 'Nota del subrayado' && subrayadoCl.cuadro === 'Nota del subrayado', `cambiar el color tras escribir la nota manda a la base el color y la nota (color ${subrayadoCl.color}, nota ${JSON.stringify(subrayadoCl.nota)})`);
  await enFicha(pcl, '.ficha.t-subrayado', 'button[data-accion="estado"]');
  check(await esperar(pcl, () => Object.values(window.__docs).some((d) => d.tipo === 'subrayado' && d.estado === 'resuelta' && d.color === 'conservar' && d.nota === 'Nota del subrayado')), 'y cambiar el estado conserva color y nota');
  await ctxCl.close();

  // ---------------------------------------------------------------- un rechazo de permiso no retira de la vista lo que la base no tiene
  // Una anotación nueva rechazada con not_granted queda marcada «sin guardar», con copia en el navegador, en una
  // página que pasa a sólo lectura y lo dice; se puede copiar, sola o con «Copiar todo», con esa señal.
  const ctxNG = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxNG.addInitScript(conBase);
  await ctxNG.grantPermissions(['clipboard-read', 'clipboard-write']);
  const png = await ctxNG.newPage();
  await png.goto(base);
  await png.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await png.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  await png.evaluate(() => { window.__rechazar = 'not_granted'; });
  await seleccionar(png, 10);
  await png.waitForSelector('#sel-tb', { state: 'visible' });
  await png.click('#sel-tb .col-btn[data-c="duda"]');
  const negadaVisible = await esperar(png, () => document.body.classList.contains('solo-lectura') && !!document.querySelector('.ficha.sin-guardar.t-subrayado'));
  const negada = await png.evaluate(() => ({ marca: document.querySelectorAll('mark.hl.c-duda').length, aviso: (document.querySelector('.ficha.sin-guardar .aviso-guardar') || {}).textContent || '', reintentar: !!document.querySelector('.ficha button[data-accion="reintentar"]'), cuadro: !!document.querySelector('.ficha textarea'), enBase: Object.values(window.__docs).some((d) => d.tipo === 'subrayado'), local: Object.keys(localStorage).some((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /subrayado/.test(localStorage.getItem(k))), estado: document.querySelector('#estado').textContent, cuenta: document.querySelector('#n-panel').textContent }));
  check(negadaVisible && negada.marca === 1 && /not_granted/.test(negada.aviso) && !negada.reintentar && !negada.cuadro && !negada.enBase && negada.local, `una anotación nueva rechazada por permiso sigue a la vista marcada «sin guardar», con copia en el navegador, sin reintentar y en sólo lectura (a la vista ${negadaVisible}, marcas ${negada.marca}, en el navegador ${negada.local})`);
  check(/No se pudo guardar en la base \(not_granted\)/.test(negada.estado) && /copia tus anotaciones/.test(negada.estado) && /sólo lectura/.test(negada.estado), `la barra dice que no se pudo guardar y que se puede copiar (${negada.estado})`);
  const copiaNegada = negadaVisible ? await enFicha(png, '.ficha.sin-guardar', 'button[data-accion="copiar"]').then(() => png.evaluate(() => navigator.clipboard.readText())).catch(() => '') : '';
  await pulsar(png, '#b-copiar');
  const todoNegado = await png.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  await pulsar(png, '#b-copiar-md');
  const todoNegadoMD = await png.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(/sin guardar en la base \(not_granted\)/.test(copiaNegada) && /"sin_guardar": "not_granted"/.test(todoNegado) && /sin guardar en la base \(not_granted\)/.test(todoNegadoMD), `«Copiar» en la ficha y «Copiar todo» la incluyen con la señal de que la base no la tiene (${JSON.stringify(copiaNegada.split('\n')[0])})`);
  await ctxNG.close();
  // «Deshacer borrado» rechazado por permiso, con el borrado ya confirmado: la nota no se pierde
  const ctxND = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxND.addInitScript(() => { window.__semilla = { valiosa: { id: 'valiosa', tipo: 'general', nota: 'Nota valiosa con mucho trabajo', estado: 'abierta', creado: '2026-10-01T00:00:00.000Z', autor: 'u_me' } }; });
  await ctxND.addInitScript(conBase);
  const pnd = await ctxND.newPage();
  await pnd.goto(base);
  await pnd.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pnd.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  await pnd.click('.tab[data-tab="todas"]');
  await enFicha(pnd, '.ficha[data-id="valiosa"]', 'button:has-text("Borrar")');
  await pnd.click('.ficha[data-id="valiosa"] .confirmar button:has-text("Sí")');
  await pnd.waitForFunction(() => !window.__docs.valiosa && !!document.querySelector('#deshacer'));
  await pnd.evaluate(() => { window.__rechazar = 'not_granted'; });
  await pnd.click('#deshacer');
  const deshechaNegadaVisible = await esperar(pnd, () => document.body.classList.contains('solo-lectura') && !!document.querySelector('.ficha[data-id="valiosa"].sin-guardar'));
  const deshechaNegada = await pnd.evaluate(() => ({ texto: (document.querySelector('.ficha[data-id="valiosa"] .nota-texto') || {}).textContent, aviso: (document.querySelector('.ficha[data-id="valiosa"] .aviso-guardar') || {}).textContent || '', enBase: !!window.__docs.valiosa, local: Object.keys(localStorage).some((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /Nota valiosa con mucho trabajo/.test(localStorage.getItem(k))), estado: document.querySelector('#estado').textContent }));
  check(deshechaNegadaVisible && deshechaNegada.texto === 'Nota valiosa con mucho trabajo' && /not_granted/.test(deshechaNegada.aviso) && !deshechaNegada.enBase && deshechaNegada.local && /No se pudo guardar en la base \(not_granted\)/.test(deshechaNegada.estado), `un «Deshacer borrado» rechazado por permiso conserva la anotación con su nota, marcada y en el navegador (a la vista ${deshechaNegadaVisible}, en el navegador ${deshechaNegada.local})`);
  await ctxND.close();

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
  // si la base rechaza el borrado, vuelve a la memoria y la copia local la sigue teniendo (no se pierde al recargar)
  await pt2.click('.tab[data-tab="todas"]');
  await enFicha(pt2, '.ficha', 'button:has-text("Borrar")');
  await pt2.click('.ficha .confirmar button:has-text("Sí")');
  await pt2.waitForFunction(() => /No se pudo borrar/.test(document.querySelector('#estado').textContent), null, { timeout: 10000 });
  const trasRechazo = await pt2.evaluate(() => ({ marca: !!document.querySelector('mark.hl'), ficha: !!document.querySelector('.ficha'), deshacer: !!document.querySelector('#deshacer'), local: Object.keys(localStorage).filter((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k)).map((k) => localStorage.getItem(k)).join('') }));
  check(trasRechazo.marca && trasRechazo.ficha && /subrayado/.test(trasRechazo.local) && !trasRechazo.deshacer, 'si la base rechaza el borrado de una pendiente, vuelve a la memoria, la copia local la conserva y no se ofrece deshacer');
  // borrarla de verdad la saca también de la copia local: al recargar no vuelve
  await pt2.evaluate(() => { window.__rechazar = null; });
  await enFicha(pt2, '.ficha', 'button:has-text("Borrar")');
  await pt2.click('.ficha .confirmar button:has-text("Sí")');
  await pt2.waitForSelector('#deshacer');
  await pt2.waitForFunction(() => !Object.keys(localStorage).filter((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k)).some((k) => /subrayado/.test(localStorage.getItem(k))), null, { timeout: 10000 });
  check(true, 'borrar una pendiente que no subió la retira también de la copia local, una vez que la base confirma');
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
  await ctxSL.addInitScript(() => { window.__soloLectura = true; window.__semilla = { nota1: { id: 'nota1', tipo: 'general', nota: 'Nota visible en sólo lectura', estado: 'abierta', creado: '2026-10-01T00:00:00.000Z', autor: 'u_otro' }, notapg: { id: 'notapg', tipo: 'pagina', pagina: 2, sid: 'cap-01', sidTitulo: 'Capítulo 1', nota: 'Nota de la página 2', estado: 'abierta', creado: '2026-10-01T01:00:00.000Z', autor: 'u_otro' } }; });
  await ctxSL.addInitScript(conBase);
  const psl = await ctxSL.newPage();
  await libroAlterado(psl, paginar);
  await psl.goto(base);
  await psl.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await psl.waitForFunction(() => document.body.classList.contains('solo-lectura'));
  await psl.click('.tab[data-tab="todas"]');
  await psl.waitForSelector('.ficha[data-id="nota1"] .nota-texto');
  check((await psl.$eval('.ficha[data-id="nota1"] .nota-texto', (n) => n.textContent)) === 'Nota visible en sólo lectura' && !(await psl.$('.ficha textarea')), 'en sólo lectura la nota se ve como texto');
  // los números de página siguen en el margen, sin acción, con el punto de «página con nota»; el «p.» del panel no queda suelto
  const pgsSL = await psl.evaluate(() => ({ pgs: Array.from(document.querySelectorAll('#sec-cap-01 .pg')).map((p) => ({ visible: getComputedStyle(p).display !== 'none', inactivo: p.disabled, pg: p.getAttribute('data-pg'), conNota: p.classList.contains('con-nota') })), confirmar: getComputedStyle(document.querySelector('.panel-cab .confirmar')).display, chip: !document.querySelector('#sl-chip').hidden, atajo: getComputedStyle(document.querySelector('#atajos .anotar')).display, tb: document.querySelector('#sel-tb').getAttribute('aria-label') }));
  check(pgsSL.pgs.length >= 2 && pgsSL.pgs.every((p) => p.visible && p.inactivo) && pgsSL.pgs.filter((p) => p.conNota).map((p) => p.pg).join() === '2', `en sólo lectura los números de página siguen a la vista, sin acción y con el punto de página con nota (${pgsSL.pgs.map((p) => p.pg + (p.conNota ? '●' : '')).join(' ')})`);
  check(pgsSL.confirmar === 'none' && pgsSL.chip && pgsSL.atajo === 'none' && pgsSL.tb === 'Copiar la selección', `el «p.» del panel se oculta entero, el chip se ve, la ayuda calla los atajos de anotar y la barra dice copiar (${pgsSL.tb})`);
  await psl.evaluate(() => window.__cambioExterno('nota1', { nota: 'Nota visible en sólo lectura (editada fuera)' }));
  await psl.waitForFunction(() => /editada fuera/.test(document.querySelector('.ficha[data-id="nota1"] .nota-texto').textContent));
  check(/^Conectado .*sólo lectura/.test(await psl.$eval('#estado', (e) => e.textContent)), `tras un cambio externo, el estado conserva el aviso de sólo lectura (${await psl.$eval('#estado', (e) => e.textContent)})`);
  await seleccionar(psl, 10);
  await psl.waitForSelector('#sel-tb', { state: 'visible' });
  const tbSL = await psl.evaluate(() => ({ color: getComputedStyle(document.querySelector('#sel-tb .col-btn')).display, copiar: getComputedStyle(document.querySelector('#sel-copiar')).display }));
  check(tbSL.color === 'none' && tbSL.copiar !== 'none', 'la barra de selección sólo ofrece copiar');
  await psl.keyboard.press('1');
  await psl.waitForTimeout(200);
  check((await psl.$$('mark.hl')).length === 0 && !(await psl.evaluate(() => Object.values(window.__docs).some((d) => d.tipo === 'subrayado'))), 'los atajos no anotan en sólo lectura');
  await ctxSL.close();
  // quien anotó mientras conectaba y resulta ser de sólo lectura no pierde su única copia: queda en el navegador y vuelve al recargar
  const ctxSLTarde = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxSLTarde.addInitScript(() => { window.__retrasoDb = 1500; window.__soloLectura = true; });
  await ctxSLTarde.addInitScript(conBase);
  await ctxSLTarde.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pst = await ctxSLTarde.newPage();
  await pst.goto(base);
  await pst.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pst.waitForFunction(() => /Conectando/.test(document.querySelector('#estado').textContent));
  const pidSLT = await seleccionar(pst, 10);
  await pst.waitForSelector('#sel-tb', { state: 'visible' });
  await pst.click('#sel-tb .col-btn[data-c="revisar"]');
  await pst.waitForSelector(`[data-pid="${pidSLT}"] mark.hl`);
  await pst.waitForFunction(() => document.body.classList.contains('solo-lectura'), null, { timeout: 10000 });
  await pst.waitForTimeout(300);
  // lo que no pudo subir queda marcado «sin guardar» (sin reintento, que no cabe en sólo lectura) y la barra lo dice
  const marcadaSL = (p) => p.evaluate(() => ({ marca: !!document.querySelector('mark.hl'), ficha: !!document.querySelector('.ficha.sin-guardar.t-subrayado'), aviso: (document.querySelector('.ficha.sin-guardar .aviso-guardar') || {}).textContent || '', reintentar: !!document.querySelector('.ficha button[data-accion="reintentar"]'), local: Object.keys(localStorage).some((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /subrayado/.test(localStorage.getItem(k))), enBase: Object.values(window.__docs).some((d) => d.tipo === 'subrayado'), estado: document.querySelector('#estado').textContent }));
  const antesRecarga = await marcadaSL(pst);
  check(antesRecarga.local && !antesRecarga.enBase && antesRecarga.ficha && /sólo lectura/.test(antesRecarga.aviso) && !antesRecarga.reintentar && /no puede subir/.test(antesRecarga.estado) && /Copiar todo/.test(antesRecarga.estado), `lo anotado antes de saber que se es de sólo lectura no sube y queda marcado «sin guardar», con aviso en la barra (${antesRecarga.estado.slice(0, 70)})`);
  await pst.reload();
  await pst.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pst.waitForFunction(() => document.body.classList.contains('solo-lectura'), null, { timeout: 10000 });
  await pst.waitForTimeout(300);
  const trasRecarga = await marcadaSL(pst);
  check(trasRecarga.marca && trasRecarga.local && !trasRecarga.enBase && trasRecarga.ficha && /sólo lectura/.test(trasRecarga.aviso) && /no puede subir/.test(trasRecarga.estado), 'se conserva en el navegador y vuelve al recargar, otra vez marcada');
  await pulsar(pst, '#b-copiar');
  const todoSL = await pst.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const fichaSL = trasRecarga.ficha ? await enFicha(pst, '.ficha.sin-guardar', 'button[data-accion="copiar"]').then(() => pst.evaluate(() => navigator.clipboard.readText())).catch(() => '') : '';
  check(/"sin_guardar": "sólo lectura"/.test(todoSL) && /sin guardar en la base \(sólo lectura\)/.test(fichaSL), `«Copiar todo» y «Copiar» en la ficha la incluyen con la señal de que la base no la tiene (${JSON.stringify(fichaSL.split('\n')[0])})`);
  await ctxSLTarde.close();

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

  // ---------------------------------------------------------------- accesibilidad y salir de las fichas (escritorio)
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxA.addInitScript(sinBase);
  const pa = await ctxA.newPage();
  const erroresA = [];
  pa.on('pageerror', (e) => erroresA.push(String(e)));
  pa.on('console', (m) => { if (m.type() === 'error') erroresA.push(m.text()); });
  await pa.goto(base + '#cap-01');
  await pa.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  await pa.waitForFunction(() => /Sin base compartida/.test(document.querySelector('#estado').textContent));
  const guardadoLocal = (page, texto) => page.evaluate((t) => Object.keys(localStorage).some((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && (localStorage.getItem(k) || '').includes(t)), texto);
  const aria = await pa.evaluate(() => ({
    estado: (document.querySelector('#anuncio') && !document.querySelector('#anuncio').closest('#app')) ? document.querySelector('#anuncio').getAttribute('role') : null,
    tabs: (document.querySelector('.tabs') || {}).getAttribute ? document.querySelector('.tabs').getAttribute('role') : null,
    seleccionadas: document.querySelectorAll('.tab[aria-selected="true"]').length,
    actual: (document.querySelector('nav a.sec[aria-current="page"]') || {}).className || '',
    filtros: document.querySelectorAll('.filtro[aria-pressed]').length,
  }));
  check(aria.estado === 'status' && aria.tabs === 'tablist' && aria.seleccionadas === 1 && /activa/.test(aria.actual) && aria.filtros >= 9, `el estado se anuncia, pestañas y filtros exponen su estado y el índice marca la sección actual (${JSON.stringify(aria)})`);
  const salto = await pa.evaluate(() => { const s = document.querySelector('a.saltar'); const primero = document.querySelector('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'); return !!s && primero === s; });
  if (salto) { await pa.focus('a.saltar'); await pa.keyboard.press('Enter'); }
  check(salto && (await pa.evaluate(() => document.activeElement.id)) === 'lectura', 'lo primero del orden de Tab es «Saltar al texto», que lleva el foco a la lectura');
  // pestañas con flechas
  await pa.focus('.tab.activa');
  await pa.keyboard.press('ArrowRight');
  const tabTras = await pa.evaluate(() => ({ foco: document.activeElement.getAttribute('data-tab'), sel: (document.querySelector('.tab[aria-selected="true"]') || { getAttribute: () => null }).getAttribute('data-tab'), lista: document.querySelector('#lista').getAttribute('aria-labelledby') }));
  check(tabTras.foco === 'todas' && tabTras.sel === 'todas' && tabTras.lista === 'tab-todas', `→ pasa a la pestaña siguiente y la selecciona (${JSON.stringify(tabTras)})`);
  // un filtro sin resultados lo dice y ofrece quitarlo
  await pulsar(pa, '.filtro[data-f="duda"]');
  const filtrada = await pa.evaluate(() => ({ pulsado: document.querySelector('.filtro[data-f="duda"]').getAttribute('aria-pressed'), resumen: (document.querySelector('#filtro-resumen') || {}).textContent || '', quitar: !!Array.from(document.querySelectorAll('#lista button')).find((b) => /Quitar filtros/.test(b.textContent)) }));
  check(filtrada.pulsado === 'true' && /duda/.test(filtrada.resumen) && filtrada.quitar, `el filtro activo se anuncia, se resume junto a «Filtros» y, sin resultados, ofrece quitarlo (${JSON.stringify(filtrada)})`);
  if (filtrada.quitar) await pa.click('#lista button.enlace');
  check((await pa.$eval('.filtro.on', (b) => b.getAttribute('data-f'))) === 'todas', '«Quitar filtros» vuelve a mostrarlo todo');
  // subrayar con nota y salir con un clic en el texto
  await pa.click('.tab[data-tab="capitulo"]');
  await seleccionar(pa, 25);
  await pa.keyboard.press('n');
  await pa.waitForSelector('.ficha.foco textarea');
  check(await pa.evaluate(() => document.activeElement.tagName === 'TEXTAREA'), 'N abre la nota del subrayado con el cursor en ella');
  await pa.keyboard.type('Nota que se guarda al salir');
  const cab = await pa.evaluate(() => ({ cat: (document.querySelector('.ficha.foco .cab .cat') || {}).textContent || '', pulsados: document.querySelectorAll('.ficha.foco .col-btn[aria-pressed="true"]').length }));
  check(cab.cat === 'revisar' && cab.pulsados === 1, `la ficha nombra su categoría (no sólo el color) y el color actual se anuncia pulsado (${JSON.stringify(cab)})`);
  // el centro de otro párrafo, sin subrayados
  const pOtro = await pa.evaluate(() => { const ps = Array.from(document.querySelectorAll('article.seccion:not([hidden]) p.bloque[data-pid]')).filter((p) => !p.querySelector('mark')); const p = ps[ps.length - 1]; p.scrollIntoView({ block: 'center' }); const r = p.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await pa.mouse.click(pOtro.x, pOtro.y);
  const fuera = await pa.evaluate(() => ({ ficha: document.querySelectorAll('.ficha.foco').length, marca: document.querySelectorAll('mark.hl.foco').length }));
  check(fuera.ficha === 0 && fuera.marca === 0 && (await guardadoLocal(pa, 'Nota que se guarda al salir')), `un clic en el texto, fuera de la ficha, sale de ella y la nota queda guardada (${JSON.stringify(fuera)})`);
  // Esc en la nota guarda, sale y devuelve el foco al pasaje
  await pa.click('article.seccion:not([hidden]) mark.hl');
  check((await pa.$$('.ficha.foco')).length === 1, 'clic en el subrayado vuelve a su ficha');
  await pa.click('.ficha.foco textarea');
  await pa.keyboard.press('End');
  await pa.keyboard.type(' (y más)');
  await pa.keyboard.press('Escape');
  const trasEsc = await pa.evaluate(() => ({ tag: document.activeElement.tagName, foco: document.querySelectorAll('.ficha.foco, mark.hl.foco').length }));
  check(trasEsc.tag === 'MARK' && trasEsc.foco === 0 && (await guardadoLocal(pa, '(y más)')), `Esc en la nota la guarda, sale de la ficha y devuelve el foco al pasaje (${JSON.stringify(trasEsc)})`);
  // Enter en el pasaje vuelve a la ficha; Ctrl+Enter en la nota sale igual; Esc fuera de la nota también sale
  await pa.keyboard.press('Enter');
  await pa.focus('.ficha.foco textarea');
  await pa.keyboard.press('End');
  await pa.keyboard.type('!');
  await pa.keyboard.press('Control+Enter');
  const trasCtrl = await pa.evaluate(() => ({ tag: document.activeElement.tagName, foco: document.querySelectorAll('.ficha.foco').length, nota: (document.querySelector('.ficha textarea') || {}).value }));
  check(trasCtrl.tag === 'MARK' && trasCtrl.foco === 0 && /!$/.test(trasCtrl.nota || ''), `Ctrl+Enter en la nota guarda y vuelve al texto (${JSON.stringify(trasCtrl)})`);
  await pa.keyboard.press('Enter');
  await pa.keyboard.press('Escape');
  check((await pa.$$('.ficha.foco')).length === 0, 'Esc con la ficha enfocada (fuera de la nota) sale de ella');
  // atajos: diálogo modal que se cierra con un clic en el fondo o con Esc, y devuelve el foco
  await pa.keyboard.press('?');
  const dlg = await pa.evaluate(() => { const d = document.querySelector('#atajos'); return { abierto: !!d.open, modal: d.matches(':modal'), foco: !!document.activeElement.closest('#atajos') }; });
  await pa.mouse.click(5, 5);
  check(dlg.abierto && dlg.modal && dlg.foco && !(await pa.$eval('#atajos', (d) => !!d.open)), `? abre los atajos como diálogo modal con el foco adentro, y un clic en el fondo lo cierra (${JSON.stringify(dlg)})`);
  await pa.click('#b-atajos');
  const bordeAtajos = await pa.$eval('#atajos', (d) => { const r = d.getBoundingClientRect(); return { x: r.left + 4, y: r.top + 4 }; });
  await pa.mouse.click(bordeAtajos.x, bordeAtajos.y);
  check(await pa.$eval('#atajos', (d) => !!d.open), 'un clic en el relleno del diálogo (dentro de su recuadro) no lo cierra');
  await pa.keyboard.press('Escape');
  check(!(await pa.$eval('#atajos', (d) => !!d.open)) && (await pa.evaluate(() => document.activeElement.id)) === 'b-atajos', 'Esc cierra los atajos y el foco vuelve a su botón');
  // figura ampliada con texto alternativo; un clic la cierra
  await pa.click('article.seccion:not([hidden]) figure img');
  const lb = await pa.evaluate(() => ({ abierto: !!document.querySelector('#lightbox').open, alt: document.querySelector('#lightbox img').alt }));
  await pa.mouse.click(640, 450);
  check(lb.abierto && lb.alt.length > 3 && !(await pa.$eval('#lightbox', (d) => !!d.open)), `la figura ampliada lleva su leyenda como texto alternativo y un clic la cierra (${lb.alt.slice(0, 40)})`);
  // ajustes de lectura: tamaño, tema y letra, recordados al recargar
  const tamTexto = () => pa.$eval('article.seccion:not([hidden]) p.bloque', (p) => parseFloat(getComputedStyle(p).fontSize));
  const tam0 = await tamTexto();
  let ajustesOk = false;
  try {
    await pa.click('#ajustes > summary');
    await pa.click('#aj-mas'); await pa.click('#aj-mas');
    await pa.check('input[name="aj-tema"][value="dark"]');
    await pa.check('input[name="aj-letra"][value="sans"]');
    ajustesOk = true;
  } catch { ajustesOk = false; }
  const tam1 = await tamTexto();
  const oscuro = await pa.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const letra = await pa.$eval('article.seccion:not([hidden]) p.bloque', (p) => getComputedStyle(p).fontFamily);
  // contraste del texto sobre la tinta (pestaña activa, sección activa, botón primario) en tema oscuro
  const contrasteOscuro = await pa.evaluate(() => {
    const lum = (c) => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const ratio = (n) => { const cs = getComputedStyle(n); const a = lum(cs.color), b = lum(cs.backgroundColor); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
    return Math.min(...['.tab.activa', 'nav a.sec.activa'].map((q) => ratio(document.querySelector(q))));
  });
  check(contrasteOscuro >= 4.5, `en tema oscuro el texto sobre la tinta tiene contraste suficiente (${contrasteOscuro.toFixed(2)}:1)`);
  for (let i = 0; i < 2; i++) await pa.click('#aj-mas');  // de 120 % al tope (145 %)
  check((await pa.evaluate(() => document.activeElement.id)) === 'aj-mas' && (await pa.$eval('#aj-mas', (b) => b.getAttribute('aria-disabled'))) === 'true', 'A+ al tope queda deshabilitado sin perder el foco');
  for (let i = 0; i < 2; i++) await pa.click('#aj-menos');
  await pa.keyboard.press('Escape');
  const menuCerrado = await pa.evaluate(() => !document.querySelector('#ajustes').open && document.activeElement.tagName === 'SUMMARY');
  check(ajustesOk && tam1 > tam0 && oscuro === 'rgb(21, 23, 27)' && /Plex/.test(letra) && menuCerrado, `«Aa» agranda el texto, cambia tema y letra, y Esc cierra el menú con el foco en su botón (${tam0} → ${tam1} px, ${oscuro})`);
  const subtitulo = await pa.$eval('article.seccion:not([hidden]) h1.sec-titulo', (h) => parseFloat(getComputedStyle(h).fontSize));
  check(subtitulo > 28, `el título de la sección también crece con «Aa» (${subtitulo} px)`);
  await pa.reload();
  await pa.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  check((await tamTexto()) === tam1 && (await pa.evaluate(() => document.documentElement.getAttribute('data-tema-lector'))) === 'dark', 'los ajustes de lectura se recuerdan al recargar');
  if (ajustesOk) { await pa.click('#ajustes > summary'); await pa.check('input[name="aj-tema"][value=""]'); }
  check(!(await pa.evaluate(() => document.documentElement.hasAttribute('data-tema-lector'))), '«sistema» devuelve el tema al del sistema');
  await pa.mouse.click(640, 450);
  // concentración anuncia su estado; borrar no deja el foco perdido
  await pa.click('#b-foco');
  const focoPulsado = await pa.$eval('#b-foco', (b) => b.getAttribute('aria-pressed'));
  await pa.click('#b-foco');
  check(focoPulsado === 'true' && (await pa.$eval('#b-foco', (b) => b.getAttribute('aria-pressed'))) === 'false', 'el botón de concentración anuncia si está activo');
  await enFicha(pa, '.ficha', 'button[data-accion="borrar"]');
  await pa.click('.ficha button[data-accion="si"]');
  const trasBorrarA = await pa.evaluate(() => ({ foco: document.activeElement !== document.body && !!document.activeElement.closest('#panel'), deshacer: !!document.querySelector('#deshacer') }));
  check(trasBorrarA.foco && trasBorrarA.deshacer, `al borrar, el foco queda en el panel y aparece «Deshacer» (${JSON.stringify(trasBorrarA)})`);
  await pa.click('#deshacer');
  check(await pa.evaluate(() => document.activeElement !== document.body && !!document.activeElement.closest('.ficha, mark')), 'tras deshacer, el foco queda en la anotación recuperada');
  check(erroresA.length === 0, `sin errores de consola en el recorrido de accesibilidad${erroresA.length ? ': ' + erroresA.join(' | ') : ''}`);
  await ctxA.close();

  // ---------------------------------------------------------------- fichas compactas, recorrido, bandeja de revisión y notas al margen (escritorio)
  // Cuatro subrayados (dos en un mismo párrafo, uno en la lista, uno en el párrafo del capítulo 2 que cambió) con
  // respuestas de quien edita: atendida, pregunta, descartada y atendida con el pasaje reescrito.
  const ctxV = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxV.addInitScript(sinBase);
  await ctxV.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pv4 = await ctxV.newPage();
  const erroresV = [];
  pv4.on('pageerror', (e) => erroresV.push(String(e)));
  pv4.on('console', (m) => { if (m.type() === 'error') erroresV.push(m.text()); });
  await libroAlterado(pv4, conCambio);
  await pv4.goto(base + '#cap-01');
  await pv4.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  // lo que la versión anterior no tenga no detiene el resto: el clic que no encuentra su botón se anota y sigue
  const tocar = (sel) => pv4.click(sel, { timeout: 2000 }).then(() => true, () => false);
  for (const [t, k] of [['Un hecho es lo que se observó', '1'], ['se lee una ficha escrita con prisa', '3'], ['Dar por hecho lo que se infirió de una cifra', '2']]) {
    await seleccionarTexto(pv4, t); await pv4.keyboard.press(k); await pv4.keyboard.press('Escape');
  }
  await pv4.evaluate(() => { location.hash = '#cap-02'; });
  await esperar(pv4, () => !document.querySelector('#sec-cap-02').hidden);
  await seleccionarTexto(pv4, 'un paso desde lo observado'); await pv4.keyboard.press('4'); await pv4.keyboard.press('Escape');
  const clave = await pv4.evaluate(() => Object.keys(localStorage).find((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k)));
  const leer = () => pv4.evaluate((k) => { const j = JSON.parse(localStorage.getItem(k) || '{}'); return Object.values(j).sort((a, b) => (a.creado < b.creado ? -1 : 1)); }, clave);
  const [vA, vB, vC, vD] = (await leer()).map((a) => a.id);
  await pv4.evaluate(({ k, ids }) => {
    const j = JSON.parse(localStorage.getItem(k)); const [a, b, c, d] = ids;
    Object.assign(j[a], { nota: 'Definición demasiado tajante; matizar con un ejemplo clínico.', respuesta: 'Añadí el ejemplo de la fiebre referida.', cierre: 'atendida', commit: 'a1b2c3d', respondido: '2026-10-15T12:00:00Z' });
    Object.assign(j[b], { respuesta: '¿Prefieres «con prisa» o «al final del turno»?', cierre: 'pregunta', respondido: '2026-10-15T12:10:00Z' });
    Object.assign(j[c], { nota: 'Repite la idea del párrafo anterior.', respuesta: 'Lo dejé: la lista resume el párrafo.', cierre: 'descartada', respondido: '2026-10-15T12:05:00Z', estado: 'resuelta' });
    Object.assign(j[d], { respuesta: 'Cambié «salto» por «paso».', cierre: 'atendida', respondido: '2026-10-15T12:20:00Z', bh: 'viejo0000000' });
    localStorage.setItem(k, JSON.stringify(j));
  }, { k: clave, ids: [vA, vB, vC, vD] });
  await pv4.goto(base + '#cap-01');
  await pv4.reload();
  await pv4.waitForSelector('article.seccion:not([hidden]) mark.hl');
  // cada marca abre su anotación, aunque el párrafo tenga dos
  await pv4.click(`article.seccion:not([hidden]) mark.hl[data-aids~="${vA}"]`);
  check((await pv4.evaluate(() => (document.querySelector('.ficha.foco') || {}).getAttribute?.('data-id'))) === vA, 'en un párrafo con dos subrayados, el clic en el primero abre su ficha y no la del otro');
  // ficha compacta: en reposo la nota se lee como texto, sin marco ni botones; activa, con ellos
  const compacta = await pv4.evaluate((ids) => {
    const f = (id) => document.querySelector(`.ficha[data-id="${id}"]`); const ta = (id) => f(id) && f(id).querySelector('textarea.nota');
    const marco = (id) => ta(id) ? getComputedStyle(ta(id)).borderTopColor : null; const acc = (id) => f(id) ? getComputedStyle(f(id).querySelector('.acciones')).display : null;
    return { reposoMarco: marco(ids.c), reposoAcc: acc(ids.c), activaMarco: marco(ids.a), activaAcc: acc(ids.a) };
  }, { a: vA, c: vC });
  check(compacta.reposoMarco === 'rgba(0, 0, 0, 0)' && compacta.reposoAcc === 'none' && compacta.activaMarco !== 'rgba(0, 0, 0, 0)' && compacta.activaAcc !== 'none', `en reposo la ficha es texto (nota sin marco, sin botones); activa muestra el cuadro y las acciones (${JSON.stringify(compacta)})`);
  await tocar(`.ficha[data-id="${vC}"] textarea.nota`);
  const tocada = await pv4.evaluate((id) => ({ foco: (document.querySelector('.ficha.foco') || {}).getAttribute?.('data-id'), cursor: document.activeElement.id }), vC);
  check(tocada.foco === vC && tocada.cursor === `nota-${vC}`, `tocar la nota de una ficha en reposo la activa con el cursor en la nota (${JSON.stringify(tocada)})`);
  await pv4.keyboard.press('Escape');
  // al margen: la ficha a la altura de su pasaje, sin encimarse, y acompaña al texto cuando se desplaza
  const alMargen = () => pv4.evaluate((a) => {
    const capa = document.querySelector('#lista.al-margen .capa-margen'); if (!capa) return { capa: false };
    const fs = Array.from(capa.querySelectorAll('.ficha')).map((f) => { const r = f.getBoundingClientRect(); return { id: f.getAttribute('data-id'), top: r.top, bottom: r.bottom }; }).sort((x, y) => x.top - y.top);
    const m = document.querySelector(`mark.hl[data-aids~="${a}"]`).getBoundingClientRect(); const fa = fs.find((x) => x.id === a);
    return { capa: true, n: fs.length, desfase: fa ? Math.round(fa.top - m.top) : null, encimadas: fs.some((x, i) => i > 0 && x.top < fs[i - 1].bottom + 6), tops: fs.map((x) => Math.round(x.top)) };
  }, vA);
  await pv4.waitForTimeout(120);
  const m0 = await alMargen();
  check(m0.capa && m0.n === 3 && Math.abs(m0.desfase) <= 3 && !m0.encimadas, `en «Sección», las fichas van al margen a la altura de su pasaje y sin encimarse (${JSON.stringify(m0)})`);
  await pv4.evaluate(() => { document.querySelector('#lectura').scrollTop += 90; });
  await pv4.waitForTimeout(120);
  const m1 = await alMargen();
  check(m1.capa && Math.abs(m1.desfase) <= 3 && m1.tops.every((t, i) => Math.abs(t - (m0.tops[i] - 90)) <= 3), `al desplazar el texto, las fichas lo acompañan (${JSON.stringify({ antes: m0.tops, despues: m1.tops })})`);
  await pv4.evaluate(() => { document.querySelector('#lectura').scrollTop = 0; });
  await pv4.click(`article.seccion:not([hidden]) mark.hl[data-aids~="${vC}"]`);
  const visible = await pv4.evaluate((id) => { const f = document.querySelector(`.ficha[data-id="${id}"]`), l = document.querySelector('#lista').getBoundingClientRect(); if (!f) return null; const r = f.getBoundingClientRect(); return { foco: f.classList.contains('foco'), dentro: r.top >= l.top - 1 && r.top < l.bottom - 40 }; }, vC);
  check(visible && visible.foco && visible.dentro, `la ficha activa al margen queda a la vista (${JSON.stringify(visible)})`);
  await pv4.keyboard.press('Escape');
  const sinMargen = await tocar('#b-margen') && await pv4.evaluate(() => ({ pulsado: document.querySelector('#b-margen').getAttribute('aria-pressed'), margen: !!document.querySelector('#lista.al-margen'), guardado: localStorage.getItem('lector-anotaciones.margen') }));
  await pv4.reload();
  await pv4.waitForSelector('article.seccion:not([hidden]) mark.hl');
  const margenRecarga = await pv4.evaluate(() => ({ margen: !!document.querySelector('#lista.al-margen'), fichas: document.querySelectorAll('#lista .ficha').length }));
  check(sinMargen && sinMargen.pulsado === 'false' && !sinMargen.margen && sinMargen.guardado === '0' && !margenRecarga.margen && margenRecarga.fichas === 3, `«Al margen» se apaga, vuelve a la lista y se recuerda al recargar (${JSON.stringify({ sinMargen, margenRecarga })})`);
  await tocar('#b-margen');
  await tocar('.tab[data-tab="todas"]');
  const enTodas = await pv4.evaluate(() => !!document.querySelector('#lista.al-margen'));
  await tocar('.tab[data-tab="capitulo"]');
  check(!enTodas && (await pv4.evaluate(() => !!document.querySelector('#lista.al-margen'))), '«Todas» es una lista; al volver a «Sección» las fichas vuelven al margen');
  // recorrer con . y , en el orden del libro, de una sección a otra
  await pv4.focus('#lectura');
  const pos = () => pv4.evaluate(() => ({ ff: (document.querySelector('.ficha.foco') || {}).getAttribute?.('data-id') || null, pos: (document.querySelector('#anot-pos') || {}).textContent || '', sec: Array.from(document.querySelectorAll('article.seccion')).filter((a) => !a.hidden).map((a) => a.id).join() }));
  await pv4.keyboard.press('.');
  const r1 = await pos();
  await pv4.keyboard.press('.'); await pv4.keyboard.press('.'); await pv4.keyboard.press('.');
  const r4 = await pos();
  await pv4.keyboard.press('.');
  await pv4.waitForTimeout(150);
  const fin = { ...(await pos()), anuncio: await pv4.$eval('#anuncio', (n) => n.textContent) };
  await pv4.keyboard.press(',');
  const r3 = await pos();
  await tocar('#anot-ant');
  const r2 = await pos();
  check(r1.ff === vA && r1.pos === '1 de 4' && r4.ff === vD && r4.sec === 'sec-cap-02' && r4.pos === '4 de 4' && fin.ff === vD && /última/.test(fin.anuncio) && r3.ff === vC && r3.sec === 'sec-cap-01' && r2.ff === vB, `. y , (y ‹ ›) recorren las anotaciones en orden, cambian de sección y avisan al llegar al final (${JSON.stringify({ r1, r4, fin, r3, r2 })})`);
  await pv4.keyboard.press('Escape');
  // bandeja «Por revisar»: cuenta, A atendida, contestar la pregunta, R reabrir, ver el cambio
  const cuenta = () => pv4.evaluate(() => (document.querySelector('#n-revisar') || {}).textContent ?? null);
  const enBandeja = await tocar('#tab-revisar');
  const bandeja = await pv4.evaluate(() => ({ cab: (document.querySelector('.bandeja-cab') || {}).textContent || '', fichas: document.querySelectorAll('#lista .ficha.por-revisar').length }));
  check(enBandeja && (await cuenta()) === '4' && /4 respuestas por revisar/.test(bandeja.cab) && bandeja.fichas === 4, `«Por revisar» cuenta y lista las respuestas nuevas (${JSON.stringify(bandeja)})`);
  await pv4.keyboard.press('.');
  await pv4.keyboard.press('a');
  const trasA = (await leer())[0];
  const despuesA = await pv4.evaluate((id) => ({ ff: (document.querySelector('.ficha.foco') || {}).getAttribute?.('data-id'), revisada: !!document.querySelector(`#lista .ficha.revisada[data-id="${id}"]`) }), vA);
  check(trasA.estado === 'resuelta' && !!trasA.revisado && despuesA.ff === vB && despuesA.revisada && (await cuenta()) === '3', `A deja la respuesta atendida (resuelta y revisada), la mantiene a la vista marcada y pasa a la siguiente (${JSON.stringify({ estado: trasA.estado, revisado: trasA.revisado, ...despuesA })})`);
  await tocar(`.ficha[data-id="${vB}"] textarea.replica`);
  await pv4.keyboard.type('Al final del turno');
  await pv4.keyboard.press('Escape');
  await pv4.waitForTimeout(100);
  const trasB = (await leer())[1];
  check(trasB.replica === 'Al final del turno' && !!trasB.revisado && (await cuenta()) === '2', `contestar la pregunta la da por revisada (${JSON.stringify({ replica: trasB.replica, revisado: trasB.revisado })})`);
  await pv4.focus(`.ficha[data-id="${vB}"]`).catch(() => {});
  await pv4.keyboard.press('.');
  await pv4.keyboard.press('r');
  const trasR = (await leer())[2];
  const cursorR = await pv4.evaluate(() => document.activeElement.id);
  check(trasR.estado === 'abierta' && !!trasR.revisado && cursorR === `nota-${vC}`, `R reabre la respuesta descartada, la da por revisada y deja el cursor en la nota (${JSON.stringify({ estado: trasR.estado, cursorR })})`);
  await pv4.keyboard.type(' Mejor quitarla.');
  await pv4.keyboard.press('Escape');
  // quien vuelca las anotaciones ve que el autor la devolvió
  const copiaR = await enFicha(pv4, `.ficha[data-id="${vC}"]`, 'button[data-accion="copiar"]').then(() => pv4.evaluate(() => navigator.clipboard.readText()), () => '').catch(() => '');
  check(/Respuesta \(descartada\): .*\nReabierta por el autor \(\d{4}-\d\d-\d\d\) tras la respuesta\./.test(copiaR), `«Copiar» en una respuesta reabierta lo dice (${JSON.stringify(copiaR.split('\n').slice(-2))})`);
  await pv4.focus(`.ficha[data-id="${vC}"]`).catch(() => {});
  await pv4.keyboard.press('.');
  await pv4.waitForTimeout(150);
  const enD = await pv4.evaluate((id) => ({ ff: (document.querySelector('.ficha.foco') || {}).getAttribute?.('data-id'), sec: !document.querySelector('#sec-cap-02').hidden, diff: !!document.querySelector('#sec-cap-02 .diff'), boton: !!document.querySelector(`.ficha[data-id="${id}"] [data-accion="cambio"]`) }), vD);
  await pv4.evaluate(() => { const d = document.querySelector('#sec-cap-02 .diff'); if (d) d.remove(); });
  await pv4.keyboard.press('v');
  await pv4.waitForTimeout(100);
  const conV = await pv4.evaluate(() => !!document.querySelector('#sec-cap-02 .diff'));
  check(enD.ff === vD && enD.sec && enD.diff && enD.boton && conV, `llegar a una respuesta cuyo pasaje cambió lleva a él con el antes y el después abiertos; V los vuelve a mostrar (${JSON.stringify({ ...enD, conV })})`);
  await pv4.keyboard.press('a');
  await pv4.waitForTimeout(150);
  const vacia = await pv4.evaluate(() => ({ anuncio: document.querySelector('#anuncio').textContent, fichas: document.querySelectorAll('#lista .ficha').length, revisadas: document.querySelectorAll('#lista .ficha.revisada').length }));
  check((await cuenta()) === '' && /No quedan/.test(vacia.anuncio) && vacia.fichas === 4 && vacia.revisadas === 4, `al terminar lo avisa, y lo revisado sigue a la vista hasta salir de la pestaña (${JSON.stringify(vacia)})`);
  await tocar('.tab[data-tab="todas"]');
  await tocar('#tab-revisar');
  const vuelta = await pv4.evaluate(() => ({ fichas: document.querySelectorAll('#lista .ficha').length, vacio: (document.querySelector('#lista .vacio') || {}).textContent || '' }));
  check(vuelta.fichas === 0 && /No hay respuestas por revisar/.test(vuelta.vacio), `al volver, la bandeja está vacía (${JSON.stringify(vuelta)})`);
  // una respuesta posterior a la revisión vuelve a la bandeja
  await pv4.evaluate(({ k, id }) => { const j = JSON.parse(localStorage.getItem(k)); j[id].respondido = new Date(Date.now() + 60000).toISOString(); j[id].respuesta = 'Lo volví a matizar.'; localStorage.setItem(k, JSON.stringify(j)); }, { k: clave, id: vA });
  await pv4.reload();
  await pv4.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  check((await cuenta()) === '1', 'lo revisado se recuerda al recargar, y una respuesta nueva a lo ya revisado vuelve a la bandeja');
  // en el teléfono no hay margen: la lista de siempre, en la hoja
  await pv4.setViewportSize({ width: 400, height: 800 });
  await pv4.waitForTimeout(150);
  const movilMargen = await pv4.evaluate(() => ({ boton: getComputedStyle(document.querySelector('#b-margen') || document.body).display, margen: !!document.querySelector('#lista.al-margen') }));
  check(movilMargen.boton === 'none' && !movilMargen.margen, `en pantalla estrecha no hay notas al margen (${JSON.stringify(movilMargen)})`);
  check(erroresV.length === 0, `sin errores de consola al revisar y recorrer${erroresV.length ? ': ' + erroresV.join(' | ') : ''}`);
  await ctxV.close();

  // ---------------------------------------------------------------- ancho de teléfono
  const movil = await browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true });
  await movil.addInitScript(sinBase);
  const pm = await movil.newPage();
  await libroAlterado(pm, conCambio);
  await pm.goto(base);
  await pm.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  const anchos = await pm.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  check(anchos[0] <= anchos[1], `sin desborde horizontal a 400 px (${anchos.join(' / ')})`);
  await pm.waitForFunction(() => /Sin base compartida/.test(document.querySelector('#estado').textContent));
  // índice y panel escondidos quedan fuera del orden de Tab; los botones dicen si están abiertos
  await pm.focus('#b-mas');
  const recorrido = [];
  for (let i = 0; i < 8; i++) { await pm.keyboard.press('Tab'); recorrido.push(await activo(pm)); }
  check(recorrido.every((a) => !a.enLateral && a.left >= 0), `a 400 px, Tab no entra en el índice ni en el panel escondidos (${recorrido.map((a) => a.tag + ':' + a.texto.slice(0, 12)).join(' → ')})`);
  const lateralesAntes = await pm.evaluate(() => ({ indice: document.querySelector('#indice').inert, expandido: document.querySelector('#b-indice').getAttribute('aria-expanded'), controla: document.querySelector('#b-indice').getAttribute('aria-controls') }));
  await pm.click('#b-indice');
  const lateralesDespues = await pm.evaluate(() => ({ indice: document.querySelector('#indice').inert, expandido: document.querySelector('#b-indice').getAttribute('aria-expanded') }));
  await pm.keyboard.press('Escape');
  check(lateralesAntes.indice && lateralesAntes.expandido === 'false' && lateralesAntes.controla === 'indice' && !lateralesDespues.indice && lateralesDespues.expandido === 'true' && (await pm.$eval('#b-indice', (b) => b.getAttribute('aria-expanded'))) === 'false', 'el índice cerrado está inerte y su botón expone aria-expanded/aria-controls');
  await pm.evaluate(() => { const k = Object.keys(localStorage).find((x) => /^lector-anotaciones:[a-z0-9-]+$/.test(x)) || 'lector-anotaciones:libro-de-ejemplo'; const p = document.querySelector('article.seccion:not([hidden]) p.bloque[data-pid]'); localStorage.setItem(k, JSON.stringify({ m1: { id: 'm1', tipo: 'subrayado', sid: p.closest('article').id.replace(/^sec-/, ''), pid: p.getAttribute('data-pid'), src: p.getAttribute('data-src'), inicio: 0, fin: 10, cita: p.textContent.slice(0, 10), antes: '', despues: p.textContent.slice(10, 40), color: 'duda', nota: '', estado: 'abierta', creado: '2026-10-01T00:00:00.000Z' } })); });
  await pm.reload();
  await pm.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pm.click('#b-panel');
  await pm.waitForSelector('aside.panel.abierta');
  await pm.click('.ficha .cab button.enlace');
  check(!(await pm.$eval('aside.panel', (a) => a.classList.contains('abierta'))), 'en móvil, «ir al texto» cierra el panel para dejar ver el pasaje');
  // el marcador «cambió» entra en la pantalla con un área táctil suficiente y un toque abre la diferencia
  await pm.goto(base + '#cap-02');
  await pm.waitForSelector('#sec-cap-02:not([hidden]) .marca-cambio');
  const marcaMovil = await pm.$eval('#sec-cap-02 .marca-cambio', (b) => { const r = b.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; return { left: Math.round(r.left), right: Math.round(r.right), ancho: Math.round(r.width), alto: Math.round(r.height), cx, cy, enCentro: document.elementFromPoint(cx, cy) === b }; });
  check(marcaMovil.left >= 0 && marcaMovil.right <= 400 && marcaMovil.ancho >= 32 && marcaMovil.alto >= 32 && marcaMovil.enCentro, `en móvil «cambió» está dentro de la pantalla con área táctil suficiente (x ${marcaMovil.left}–${marcaMovil.right}, ${marcaMovil.ancho}×${marcaMovil.alto})`);
  let tocado = false;
  try { await pm.touchscreen.tap(marcaMovil.cx, marcaMovil.cy); await pm.waitForSelector('.diff', { timeout: 2000 }); tocado = true; } catch { tocado = false; }
  check(tocado, 'y un toque en su centro muestra la diferencia');
  await movil.close();

  // ---------------------------------------------------------------- cajones del teléfono: velo, cierre, foco, notas
  const ctxC = await browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true });
  await ctxC.addInitScript(sinBase);
  const pc = await ctxC.newPage();
  const erroresC = [];
  pc.on('pageerror', (e) => erroresC.push(String(e)));
  pc.on('console', (m) => { if (m.type() === 'error') erroresC.push(m.text()); });
  await pc.goto(base + '#cap-01');
  await pc.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  await pc.waitForFunction(() => /Sin base compartida/.test(document.querySelector('#estado').textContent));
  const tactil = await pc.evaluate(() => matchMedia('(pointer: coarse)').matches);
  // un punto del velo que el cajón abierto no tapa, lejos de su borde (que puede estar todavía deslizándose)
  const tocarFuera = async () => { const pt = await pc.evaluate(() => [[380, 60], [200, 60], [12, 400]].find(([x, y]) => document.elementFromPoint(x, y) === document.querySelector('#velo')) || [380, 60]); await pc.touchscreen.tap(pt[0], pt[1]); };
  const estadoCajon = () => pc.evaluate(() => ({ panel: document.querySelector('#panel').classList.contains('abierta'), indice: document.querySelector('#indice').classList.contains('abierta'), velo: !!document.querySelector('#velo') && !document.querySelector('#velo').hidden, cabecera: !!document.querySelector('header.barra').inert, lectura: !!document.querySelector('#lectura').inert, foco: document.activeElement.id || document.activeElement.tagName, enPanel: !!document.activeElement.closest('#panel') }));
  await pc.click('#b-panel');
  const abiertoP = await estadoCajon();
  const cerrarVisible = await pc.evaluate(() => { const b = document.querySelector('#panel .cerrar'); return !!b && b.getBoundingClientRect().width > 0; });
  check(abiertoP.panel && abiertoP.velo && abiertoP.cabecera && abiertoP.lectura && abiertoP.enPanel && cerrarVisible, `en el teléfono, el panel abierto tiene velo detrás, deja inerte el resto, recibe el foco y muestra «cerrar» (${JSON.stringify(abiertoP)})`);
  const fugas = [];
  for (let i = 0; i < 12; i++) { await pc.keyboard.press('Tab'); fugas.push(await pc.evaluate(() => (document.activeElement.closest('header, #lectura, #indice') ? document.activeElement.tagName + ':' + document.activeElement.textContent.trim().slice(0, 12) : ''))); }
  check(fugas.every((x) => !x), `con el panel abierto, Tab no llega a lo que está detrás (${fugas.filter(Boolean).join(' · ')})`);
  await tocarFuera();
  const trasVelo = await estadoCajon();
  check(!trasVelo.panel && !trasVelo.velo && !trasVelo.cabecera && !trasVelo.lectura && trasVelo.foco === 'b-panel', `tocar fuera del panel (en el velo) lo cierra y devuelve el foco a su botón (${JSON.stringify(trasVelo)})`);
  await pc.click('#b-indice');
  const abiertoI = await estadoCajon();
  if (await pc.$('#indice .cerrar')) await pc.click('#indice .cerrar');
  const trasCerrarI = await estadoCajon();
  check(abiertoI.indice && abiertoI.velo && !trasCerrarI.indice && trasCerrarI.foco === 'b-indice', `el índice se cierra con su botón «×» y el foco vuelve a «Índice» (${JSON.stringify(trasCerrarI)})`);
  // subrayar con nota en el teléfono: la barra va abajo, la nota se abre en el panel y tocar fuera la guarda
  await seleccionar(pc, 30);
  await esperar(pc, () => getComputedStyle(document.querySelector('#sel-tb')).display === 'flex', null, 3000);
  const barraT = await pc.evaluate(() => { const t = document.querySelector('#sel-tb'), r = t.getBoundingClientRect(), b = t.querySelector('.col-btn').getBoundingClientRect(); return { abajo: t.classList.contains('abajo'), bottom: Math.round(r.bottom), alto: Math.round(b.height) }; });
  check(tactil && barraT.abajo && barraT.bottom >= 700 && barraT.alto >= 40, `en pantalla táctil la barra de subrayado va abajo, con botones de 40 px (${JSON.stringify(barraT)}, táctil: ${tactil})`);
  await pc.tap('#sel-nota');
  const notaAbierta = await esperar(pc, () => document.querySelector('#panel').classList.contains('abierta') && document.activeElement.tagName === 'TEXTAREA', null, 3000);
  check(notaAbierta, '«+ con nota» abre el panel con el cursor en la nota');
  await pc.keyboard.type('Nota escrita en el teléfono');
  await tocarFuera();
  const trasNota = await estadoCajon();
  check(!trasNota.panel && !trasNota.velo && trasNota.foco === 'MARK' && (await guardadoLocal(pc, 'Nota escrita en el teléfono')), `tocar fuera tras escribir cierra el panel, guarda la nota y deja el foco en el pasaje nuevo (${JSON.stringify(trasNota)})`);
  // tocar un subrayado abre su ficha; Esc en la nota cierra el panel y devuelve el foco al pasaje
  await pc.tap('article.seccion:not([hidden]) mark.hl');
  const conFicha = await esperar(pc, () => document.querySelector('#panel').classList.contains('abierta') && !!document.querySelector('#panel .ficha.foco'), null, 3000);
  check(conFicha, 'tocar un subrayado abre el panel con su ficha');
  if (conFicha) { await pc.focus('.ficha.foco textarea'); await pc.keyboard.press('Escape'); }
  const trasEscM = await estadoCajon();
  check(!trasEscM.panel && trasEscM.foco === 'MARK', `Esc en la nota cierra el panel y deja el foco en el pasaje (${JSON.stringify(trasEscM)})`);
  // borrar con el panel abierto: «Deshacer» queda a mano, encima del velo
  await pc.click('#b-panel');
  await enFicha(pc, '#panel .ficha', 'button[data-accion="borrar"]');
  await pc.click('#panel .ficha button[data-accion="si"]');
  const undo = await pc.evaluate(() => { const u = document.querySelector('#deshacer'); if (!u) return null; const r = u.getBoundingClientRect(); return { inerte: !!u.closest('[inert]'), dentro: r.width > 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, encima: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === u }; });
  check(!!undo && !undo.inerte && undo.dentro && undo.encima, `con el panel abierto, «Deshacer» sigue visible y se puede tocar (${JSON.stringify(undo)})`);
  if (undo && undo.encima) await pc.click('#deshacer');
  check((await pc.$$('#panel .ficha')).length === 1, 'y deshacer devuelve la ficha');
  // en concentración, tocar un subrayado sale de ella y muestra la ficha (no un velo sin nada)
  await tocarFuera();
  if (!(await esperar(pc, () => document.querySelector('#velo').hidden, null, 1500))) { await tocarFuera(); await esperar(pc, () => document.querySelector('#velo').hidden, null, 1500); }
  await pc.click('#b-mas');
  await pc.click('#b-foco');
  await pc.tap('article.seccion:not([hidden]) mark.hl');
  const concentrado = await pc.evaluate(() => ({ foco: document.querySelector('#app').classList.contains('foco'), panelVisible: document.querySelector('#panel').getClientRects().length > 0 && document.querySelector('#panel').classList.contains('abierta'), cuerpo: document.activeElement === document.body }));
  check(!concentrado.foco && concentrado.panelVisible && !concentrado.cuerpo, `en concentración, tocar un subrayado sale de ella y abre su ficha (${JSON.stringify(concentrado)})`);
  // cambiar el ancho con el panel abierto: al volver a estrecho, el cajón sólo reaparece si el foco sigue en él (una nota
  // a medio escribir); si se siguió leyendo, el texto no queda inerte detrás de un velo
  await pc.setViewportSize({ width: 1280, height: 800 });
  await pc.focus('#panel .ficha textarea');
  await pc.setViewportSize({ width: 400, height: 800 });
  await esperar(pc, () => document.querySelector('#panel').classList.contains('abierta'), null, 2000);  // el cambio de media llega en el cuadro siguiente
  const conNota = await estadoCajon();
  check(conNota.panel && conNota.velo && (await pc.evaluate(() => document.activeElement.tagName)) === 'TEXTAREA', `estrechar la pantalla con una nota en edición deja el panel abierto con el cursor en ella (${JSON.stringify(conNota)})`);
  await pc.setViewportSize({ width: 1280, height: 800 });
  await esperar(pc, () => !document.querySelector('#panel').classList.contains('abierta'), null, 2000);  // el cambio de media llega en el cuadro siguiente
  // seguir leyendo: un toque en un párrafo sin subrayados (un subrayado abriría su ficha, y con ella el panel)
  const puntoLibre = await pc.evaluate(() => { const ps = Array.from(document.querySelectorAll('article.seccion:not([hidden]) p.bloque[data-pid]')).filter((p) => !p.querySelector('mark')); const p = ps[ps.length - 1]; p.scrollIntoView({ block: 'center' }); const r = p.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await pc.mouse.click(puntoLibre.x, puntoLibre.y);
  await pc.setViewportSize({ width: 400, height: 800 });
  await pc.waitForTimeout(150);
  const trasAncho = await estadoCajon();
  check(!trasAncho.panel && !trasAncho.velo && !trasAncho.lectura && !trasAncho.cabecera, `pasar a ancho, seguir leyendo y volver no deja un cajón abierto ni el texto inerte (${JSON.stringify(trasAncho)})`);
  // Esc con «⋯» abierto y el foco en la búsqueda lo cierra
  await pc.click('#b-mas');
  await pc.focus('#buscar');
  await pc.keyboard.press('Escape');
  check(!(await pc.$eval('#herramientas', (h) => h.classList.contains('abierta'))), 'Esc en la búsqueda cierra «⋯»');
  // a 360 px la barra de subrayado cabe en la pantalla
  await pc.setViewportSize({ width: 360, height: 760 });
  await seleccionar(pc, 25);
  await esperar(pc, () => getComputedStyle(document.querySelector('#sel-tb')).display === 'flex', null, 3000);
  const barra360 = await pc.$eval('#sel-tb', (t) => { const r = t.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; });
  check(barra360[0] >= 0 && barra360[1] <= 360, `a 360 px la barra de subrayado cabe en la pantalla (${barra360.join('–')})`);
  await pc.keyboard.press('Escape');
  check(await pc.evaluate(() => getComputedStyle(document.querySelector('#sel-tb')).display === 'none' && getSelection().isCollapsed), 'Esc con una selección la suelta y oculta la barra');
  await pc.setViewportSize({ width: 400, height: 800 });
  const anchosC = await pc.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  check(anchosC[0] <= anchosC[1], `sin desborde horizontal con los cajones nuevos (${anchosC.join(' / ')})`);
  check(erroresC.length === 0, `sin errores de consola en el recorrido del teléfono${erroresC.length ? ': ' + erroresC.join(' | ') : ''}`);
  await ctxC.close();
} finally {
  await browser.close();
  srv.close();
}
console.log(fallas ? `\n${fallas} comprobaciones fallaron` : '\nTodo en orden');
process.exit(fallas ? 1 : 0);
