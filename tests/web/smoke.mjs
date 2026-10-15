// Prueba de humo de la página con Playwright: sirve web/index.html con el libro de ejemplo,
// simula un navegador sin base compartida (window.claude.use → null) y recorre el flujo del autor:
// subrayar, dejar una nota de sección, recargar y comprobar que todo persiste; filtros, búsqueda,
// ancho de teléfono sin desborde y ningún error de consola.
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

const srv = await servir();
const base = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { window.claude = { use: () => Promise.resolve(null) }; });
  const errores = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(`${m.text()} (${(m.location() || {}).url || 'sin url'})`);
  });

  await page.goto(base);
  await page.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await page.waitForFunction(() => /Sin base compartida/.test(document.querySelector('#estado').textContent));
  check((await page.title()).startsWith('Lector · '), 'el título de la pestaña sale de libro.json');
  check((await page.$$('nav a.sec')).length >= 5, 'el índice lista las secciones');
  const abierta = await page.$eval('article.seccion:not([hidden]) h1', (h) => h.textContent);
  check(/^Capítulo 1\./.test(abierta), `se abre en la primera sección de nivel 2 (${abierta})`);

  // 1. Subrayar veinte caracteres del primer párrafo.
  const pid = await page.evaluate(() => {
    const p = document.querySelector('article.seccion:not([hidden]) p.bloque[data-pid]');
    const tn = Array.from(p.childNodes).find((n) => n.nodeType === 3 && n.textContent.length > 20);
    const r = document.createRange(); r.setStart(tn, 0); r.setEnd(tn, 20);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    return p.getAttribute('data-pid');
  });
  await page.waitForSelector('#sel-tb', { state: 'visible' });
  await page.click('#sel-tb .col-btn[data-c="revisar"]');
  await page.waitForSelector(`[data-pid="${pid}"] mark.hl.c-revisar`);
  check(true, 'subrayar pinta una marca con el color elegido');

  // 2. Nota de la sección.
  await page.click('#b-nota-cap');
  await page.waitForSelector('.ficha textarea');
  await page.fill('.ficha textarea', 'Nota de prueba de la sección');
  await page.$eval('.ficha textarea', (t) => t.blur());

  // 3. Lo guardado en el navegador tiene la forma que lee `exportar`.
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
  check(cap && cap.nota === 'Nota de prueba de la sección' && cap.sid, 'la nota de sección guarda su texto y su sección');

  // 4. Persistencia tras recargar y filtros.
  await page.reload();
  await page.waitForSelector(`[data-pid="${pid}"] mark.hl.c-revisar`);
  check(true, 'tras recargar, el subrayado vuelve a pintarse');
  await page.click('.filtro[data-f="notas"]');
  check((await page.$$('.ficha')).length === 1, 'el filtro «notas de página/sección» deja una ficha');
  await page.click('.filtro[data-f="todas"]');
  check((await page.$$('.ficha')).length === 2, 'el filtro «todas» muestra las dos');

  // 5. Búsqueda.
  await page.fill('#buscar', 'inferencia');
  await page.press('#buscar', 'Enter');
  await page.waitForSelector('.res');
  check((await page.$$('.res')).length >= 1, 'la búsqueda encuentra coincidencias');

  // 6. Exportación en JSON (lo que el autor copia y `exportar` lee).
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('#b-copiar');
  const copiado = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const json = (() => { try { return JSON.parse(copiado); } catch { return null; } })();
  check(json && Array.isArray(json.anotaciones) && json.anotaciones.length === 2, 'Copiar todo (JSON) produce {libro, anotaciones[]}');

  check(errores.length === 0, `sin errores de consola${errores.length ? ': ' + errores.join(' | ') : ''}`);

  // 7. Ancho de teléfono: sin desborde horizontal.
  const movil = await browser.newContext({ viewport: { width: 400, height: 800 } });
  await movil.addInitScript(() => { window.claude = { use: () => Promise.resolve(null) }; });
  const pm = await movil.newPage();
  await pm.goto(base);
  await pm.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  const anchos = await pm.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  check(anchos[0] <= anchos[1], `sin desborde horizontal a 400 px (${anchos.join(' / ')})`);
  await movil.close();
} finally {
  await browser.close();
  srv.close();
}
console.log(fallas ? `\n${fallas} comprobaciones fallaron` : '\nTodo en orden');
process.exit(fallas ? 1 : 0);
