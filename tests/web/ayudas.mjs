// Ayudas de las pruebas de la página (tests/web/*.spec.mjs): sirven web/index.html con el libro de ejemplo; las pruebas recorren
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
// Uso: npx playwright test (antes: lector-anotaciones construir ejemplo/fuentes --salida ejemplo/salida/libro.json)
// Variables: LIBRO_JSON, FIGS_DIR, CHROMIUM (ruta a un ejecutable de Chromium, opcional), LISTAR=1.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test as base, expect } from '@playwright/test';

import { reducir, guardar as guardarCobertura } from './herramientas/cobertura.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// `test` de todas las pruebas: un error sin capturar en cualquier página de cualquier contexto que la prueba abra la
// hace fallar, aunque la prueba no lo mire (cada una abre sus contextos con `browser.newContext`). Con COBERTURA=1,
// además, cada página recoge su cobertura V8, que se reduce por fragmento de las fuentes (herramientas/cobertura.mjs).
const COBERTURA = !!process.env.COBERTURA;
async function recoger(paginas, cobertura) {
  for (const p of paginas.splice(0)) {
    try {
      cobertura.push(...(await p.coverage.stopJSCoverage()));
    } catch {
      // la página ya se cerró: su cobertura se perdió con ella
    }
  }
}
export const test = base.extend({
  sinErroresDePagina: [
    async ({ browser }, use, testInfo) => {
      const errores = [],
        cobertura = [],
        abiertas = [];
      const original = browser.newContext;
      browser.newContext = async function (...args) {
        const ctx = await original.apply(this, args);
        if (COBERTURA) {
          const paginas = [],
            nueva = ctx.newPage.bind(ctx),
            cerrar = ctx.close.bind(ctx);
          ctx.newPage = async () => {
            const p = await nueva();
            await p.coverage.startJSCoverage({ resetOnNavigation: false });
            paginas.push(p);
            return p;
          };
          ctx.close = async (...a) => {
            await recoger(paginas, cobertura);
            return cerrar(...a);
          };
          abiertas.push(paginas);
        }
        // los guiones de inicio de las pruebas corren también en la página en blanco que precede a la navegación, donde
        // leer el almacenamiento está prohibido: sus errores (sin ninguna línea de la página servida) no son de la página
        ctx.on('weberror', (e) => {
          const pila = String((e.error() && e.error().stack) || e.error());
          if (/^SecurityError: Failed to read the '(local|session)Storage'/.test(pila) && !/https?:\/\//.test(pila))
            return;
          errores.push(pila);
        });
        return ctx;
      };
      try {
        await use(errores);
      } finally {
        browser.newContext = original;
        if (COBERTURA) {
          for (const paginas of abiertas) await recoger(paginas, cobertura);
          guardarCobertura(testInfo.titlePath.slice(1).join(' · '), reducir(cobertura));
        }
      }
      expect(errores, 'errores de página sin capturar').toEqual([]);
    },
    { auto: true },
  ],
  // La dirección de la página servida con el libro de ejemplo: un servidor por proceso de pruebas.
  base: [
    async ({}, use) => {
      const srv = await servir();
      await use(`http://127.0.0.1:${srv.address().port}/`);
      await new Promise((r) => srv.close(r));
    },
    { scope: 'worker' },
  ],
  // `abrir(opciones)`: un contexto nuevo con la página abierta y lista; todos se cierran solos al terminar la prueba.
  // La página trae su contexto (`p.context()`) para abrir otra pestaña o cambiar permisos. Opciones:
  //   hash        dónde se abre ('#cap-01'); null: no navega (la prueba lo hace)
  //   contexto    tamaño y lo demás de `browser.newContext` (ESCRITORIO; TELEFONO)
  //   modo        'sin-base' (por omisión), 'con-base' (la base simulada) o 'ninguno' (la prueba pone `window.claude`)
  //   semilla     anotaciones que la base simulada ya tiene al conectar
  //   previo      guiones de inicio que corren antes que la base: funciones, o [función, argumento]
  //   permisos    los que se conceden al contexto (portapapeles…)
  //   preparar    `async (p) => …` antes de navegar: rutas, reloj, oyentes
  //   esperar     'conectado' (por omisión con base), 'bloques' (sin ella) o null
  abrir: async ({ browser, base }, use) => {
    const abiertos = [];
    await use(async (op = {}) => {
      const ctx = await browser.newContext(op.contexto || ESCRITORIO);
      abiertos.push(ctx);
      if (op.permisos) await ctx.grantPermissions(op.permisos);
      if (op.semilla)
        await ctx.addInitScript((s) => {
          window.__semilla = s;
        }, op.semilla);
      for (const g of op.previo || []) await (Array.isArray(g) ? ctx.addInitScript(g[0], g[1]) : ctx.addInitScript(g));
      const modo = op.modo || 'sin-base';
      if (modo !== 'ninguno') await ctx.addInitScript(modo === 'con-base' ? conBase : sinBase);
      const p = await ctx.newPage();
      // lo que la página deja escapar, para las pruebas que lo comprueban: errores sin capturar y errores de consola
      p.errores = [];
      p.consola = [];
      p.on('pageerror', (e) => p.errores.push(String(e)));
      p.on('console', (m) => {
        if (m.type() === 'error') p.consola.push(m.text());
      });
      if (op.preparar) await op.preparar(p);
      if (op.hash === null) return p;
      await p.goto(base + (op.hash === undefined ? '#cap-01' : op.hash));
      const espera = op.esperar !== undefined ? op.esperar : modo === 'con-base' ? 'conectado' : 'bloques';
      if (espera === 'conectado') await conectado(p);
      else if (espera === 'bloques') await p.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
      return p;
    });
    for (const c of abiertos) await c.close().catch(() => {});
  },
});
export const ESCRITORIO = { viewport: { width: 1280, height: 900 } };
export const TELEFONO = { viewport: { width: 400, height: 800 }, hasTouch: true };
// Sin errores de página (ni de consola, con `consola`) en lo que la prueba hizo con `p`.
export function sinErrores(p, que, { consola = false } = {}) {
  const e = consola ? p.errores.concat(p.consola) : p.errores;
  check(
    e.length === 0,
    `sin errores ${consola ? 'de consola' : 'de página'} ${que}${e.length ? ': ' + e.join(' | ') : ''}`
  );
}
// Un clic que no detiene la prueba si el elemento no aparece en dos segundos: dice si ocurrió.
export const tocar = (p, sel) =>
  p.click(sel, { timeout: 2000 }).then(
    () => true,
    () => false
  );
// La base simulada ya conectó (y la página lo dice).
export const conectado = (p) =>
  p.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
export const LIBRO = process.env.LIBRO_JSON || path.join(RAIZ, 'ejemplo', 'salida', 'libro.json');
const FIGS = process.env.FIGS_DIR || path.join(RAIZ, 'ejemplo', 'figs');
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

export function servir() {
  if (!fs.existsSync(LIBRO))
    throw new Error(`No existe ${LIBRO}. Construye el ejemplo primero (ver ejemplo/README.md).`);
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const ruta = new URL(req.url, 'http://x').pathname;
      let archivo = null;
      if (ruta === '/' || ruta === '/index.html') archivo = path.join(RAIZ, 'web', 'index.html');
      else if (ruta === '/libro.json') archivo = LIBRO;
      else if (ruta.startsWith('/figs/')) archivo = path.join(FIGS, path.basename(ruta));
      if (!archivo || !fs.existsSync(archivo)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
      fs.createReadStream(archivo).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// Una comprobación que no detiene la prueba: si falla, la prueba termina en rojo con este mensaje y sigue con las
// demás comprobaciones. Con LISTAR=1 se escriben todas, como hacía el guion anterior.
export function check(cond, msg) {
  if (process.env.LISTAR) console.log(`${cond ? 'ok   ' : 'FALLA'} ${msg}`);
  expect.soft(!!cond, msg).toBe(true);
}
// Espera a que `fn` se cumpla en la página y dice si ocurrió: lo que no debe tardar se comprueba con un plazo corto
// y un `check` que nombre lo que no pasó, en vez de abortar la prueba entera a los 30 s.
export async function esperar(page, fn, arg = null, plazo = 5000) {
  try {
    await page.waitForFunction(fn, arg, { timeout: plazo });
    return true;
  } catch {
    return false;
  }
}

// Sin base: window.claude.use('db') devuelve null.
export const sinBase = () => {
  window.claude = { use: () => Promise.resolve(null) };
};

// Base simulada en memoria con la misma superficie que usa la página: collection().doc().set/delete y
// onSnapshot con docChanges(). Cada escritura se devuelve como eco asíncrono, como hace la base real.
export const conBase = () => {
  // Colecciones separadas (anotaciones, respaldos…), ecos asíncronos y un usuario con perfil.
  const cols = {};
  const oyentes = {};
  const coleccion = (nombre) => (cols[nombre] = cols[nombre] || {});
  const snap = (nombre, cambios) => ({
    metadata: { fromCache: false },
    docChanges: () => cambios.map((c) => ({ type: c.type, doc: { id: c.id, data: () => coleccion(nombre)[c.id] } })),
  });
  // window.__ecos cuenta las fotos que la base ya entregó: una prueba espera así al eco de una escritura
  window.__ecos = 0;
  const emitir = (nombre, cambios) => {
    (oyentes[nombre] || []).forEach((cb) => cb(snap(nombre, cambios)));
    window.__ecos++;
  };
  const sembrar = window.__semilla || {};
  Object.keys(sembrar).forEach((id) => {
    coleccion('anotaciones')[id] = sembrar[id];
  });
  // window.__rechazar rechaza toda escritura con ese código; window.__rechazarUnaVez sólo la siguiente (para probar
  // el reintento); window.__intentos cuenta los set por colección.
  window.__intentos = {};
  const db = {
    collection: (nombre) => ({
      doc: (id) => ({
        set: (data) => {
          window.__intentos[nombre] = (window.__intentos[nombre] || 0) + 1;
          const rechazo = window.__rechazar || window.__rechazarUnaVez;
          window.__rechazarUnaVez = null;
          if (rechazo) return Promise.reject({ code: rechazo, message: 'simulado' });
          const docs = coleccion(nombre);
          const existia = !!docs[id];
          docs[id] = JSON.parse(JSON.stringify(data));
          setTimeout(() => emitir(nombre, [{ type: existia ? 'modified' : 'added', id }]), 30);
          return Promise.resolve();
        },
        // merge sobre un documento que existe; sin él, rechaza como la base real
        update: (data) => {
          window.__intentos[nombre] = (window.__intentos[nombre] || 0) + 1;
          window.__updates = (window.__updates || 0) + 1;
          const rechazo = window.__rechazar || window.__rechazarUnaVez;
          window.__rechazarUnaVez = null;
          if (rechazo) return Promise.reject({ code: rechazo, message: 'simulado' });
          const docs = coleccion(nombre);
          if (!docs[id]) return Promise.reject({ code: 'invalid_argument', message: 'no existe' });
          Object.assign(docs[id], JSON.parse(JSON.stringify(data)));
          setTimeout(() => emitir(nombre, [{ type: 'modified', id }]), 30);
          return Promise.resolve();
        },
        delete: () => {
          if (window.__rechazar) return Promise.reject({ code: window.__rechazar, message: 'simulado' });
          delete coleccion(nombre)[id];
          setTimeout(() => emitir(nombre, [{ type: 'removed', id }]), 30);
          return Promise.resolve();
        },
      }),
      onSnapshot: (cb) => {
        (oyentes[nombre] = oyentes[nombre] || []).push(cb);
        cb(
          snap(
            nombre,
            Object.keys(coleccion(nombre)).map((id) => ({ type: 'added', id }))
          )
        );
        return () => {};
      },
    }),
  };
  const nombres = { u_me: 'Yo Mismo', u_otro: 'Lectora Invitada' };
  const user = {
    id: () => Promise.resolve('u_me'),
    can: () => Promise.resolve(window.__soloLectura ? false : null),
    profiles: (ids) =>
      Promise.resolve(
        Object.fromEntries(
          (Array.isArray(ids) ? ids : [ids]).map((i) => [
            i,
            {
              id: i,
              name: nombres[i] || '',
              color: i === 'u_me' ? '#3d5a6c' : '#8c2f2f',
              avatarUrl: '',
              email: null,
              isMe: i === 'u_me',
              guest: i === 'u_otro',
            },
          ])
        )
      ),
  };
  // Con `__retenerDb`, la base no conecta hasta que la prueba llama a `__soltarDb()`: lo que la prueba hace «mientras
  // conecta» no compite con un plazo fijo (que bajo carga podía vencer antes de que la prueba actuara).
  let soltar = () => {};
  const conectada = window.__retenerDb ? new Promise((r) => (soltar = r)) : Promise.resolve();
  window.__soltarDb = () => soltar();
  window.claude = {
    use: (n) =>
      n === 'db'
        ? conectada.then(() => db)
        : new Promise((res) => setTimeout(() => res(n === 'user' && !window.__sinUsuario ? user : null), 0)),
  };
  window.__docs = coleccion('anotaciones');
  window.__colecciones = cols;
  window.__cambioExterno = (id, parche) => {
    Object.assign(coleccion('anotaciones')[id], parche);
    emitir('anotaciones', [{ type: 'modified', id }]);
  };
};

// Los filtros y la exportación viven en desplegables del panel: se abren antes de usarlos.
export async function abrirDe(page, sel) {
  await page.evaluate((s) => {
    const n = document.querySelector(s);
    const d = n && n.closest('details');
    if (d) d.open = true;
  }, sel);
}
export async function pulsar(page, sel) {
  await abrirDe(page, sel);
  await page.click(sel);
}

// Las acciones de una ficha compacta aparecen al activarla (tocándola): se activa antes de pulsar una.
export async function enFicha(page, selFicha, selBoton) {
  await page.evaluate((sel) => {
    const f = document.querySelector(sel);
    if (f && !f.classList.contains('foco')) f.querySelector('.cab > span').click();
  }, selFicha);
  await page.click(`${selFicha} ${selBoton}`);
}

// Selecciona un texto dado dentro de la sección visible.
export async function seleccionarTexto(page, t) {
  return page.evaluate((t) => {
    for (const b of document.querySelectorAll('article.seccion:not([hidden]) [data-pid]')) {
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const i = n.nodeValue.indexOf(t);
        if (i >= 0) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + t.length);
          const s = window.getSelection();
          s.removeAllRanges();
          s.addRange(r);
          return true;
        }
      }
    }
    return false;
  }, t);
}
export async function seleccionar(page, n = 20) {
  // Selecciona los primeros n caracteres del primer párrafo visible y devuelve su pid.
  return page.evaluate((n) => {
    const p = document.querySelector('article.seccion:not([hidden]) p.bloque[data-pid]');
    const tn = Array.from(p.childNodes).find((x) => x.nodeType === 3 && x.textContent.length > n);
    const r = document.createRange();
    r.setStart(tn, 0);
    r.setEnd(tn, n);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    return p.getAttribute('data-pid');
  }, n);
}

// libro.json alterado al vuelo: `fn(L)` lo modifica antes de servirlo a esa página.
export async function libroAlterado(page, fn) {
  await page.route('**/libro.json', async (route) => {
    const L = JSON.parse(fs.readFileSync(LIBRO, 'utf8'));
    fn(L);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(L) });
  });
}
// Páginas en el capítulo 1 (el ejemplo no trae): tres bloques por página.
export const paginar = (L) => {
  const cap1 = L.secciones.find((s) => /^Capítulo 1/.test(s.titulo));
  cap1.pagina = 1;
  cap1.bloques.forEach((b, i) => {
    b.pagina = 1 + Math.floor(i / 3);
  });
};
// Un bloque del capítulo 2 cambiado respecto de la construcción anterior.
export const conCambio = (L) => {
  const cap2 = L.secciones.find((s) => /^Capítulo 2/.test(s.titulo));
  const b = cap2.bloques.find((x) => x.t === 'p');
  b.anterior = 'Una inferencia es un salto desde lo observado hacia lo no observado.';
  L.anterior_generado = '2026-01-01';
  L.cambios = 1;
};
// Cuatro párrafos más al final del capítulo 1: la misma cita en tres de ellos con otro contexto, y el contexto exacto en el cuarto.
export const conRepetidos = (L) => {
  const cap1 = L.secciones.find((s) => /^Capítulo 1/.test(s.titulo));
  [
    'Primero, la inferencia tramposa se disfraza.',
    'Después, la inferencia tramposa se repite.',
    'Al final, la inferencia tramposa se olvida.',
    'Contexto previo la inferencia tramposa contexto posterior.',
  ].forEach((t, i) => {
    cap1.bloques.push({ id: `cap-01-b9${i}`, t: 'p', html: t, src: `extra.md:${i + 1}`, h: `h${i}`.padEnd(12, '0') });
  });
};
export const activo = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    const r = a ? a.getBoundingClientRect() : null;
    return {
      tag: a ? a.tagName : null,
      texto: a ? a.textContent.trim().slice(0, 30) : '',
      clase: a ? a.className : '',
      enFicha: !!(a && a.closest('.ficha')),
      enFoco: !!(a && a.closest('.ficha.foco')),
      enLateral: !!(a && a.closest('#indice, #panel')),
      left: r ? Math.round(r.left) : null,
    };
  });

// La clave local del libro de ejemplo (`lector-anotaciones:<id>`), para sembrar o leer lo guardado en el navegador.
export const CLAVE_LOCAL = 'lector-anotaciones:' + (JSON.parse(fs.readFileSync(LIBRO, 'utf8')).id || 'libro');
// ¿Hay en la copia local de algún libro una anotación con este texto?
export const guardadoLocal = (page, texto) =>
  page.evaluate(
    (t) =>
      Object.keys(localStorage).some(
        (k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && (localStorage.getItem(k) || '').includes(t)
      ),
    texto
  );
