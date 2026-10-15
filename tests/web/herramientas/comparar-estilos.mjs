// Compara los estilos calculados de dos versiones de la página en los mismos estados (escritorio, teléfono, temas,
// diálogos, alto contraste…): sirve para reorganizar estilos.css sin cambiar lo que se ve. Uso:
//   node tests/web/herramientas/comparar-estilos.mjs antes.html despues.html
// Sale con 0 si todo elemento (y sus ::before/::after) tiene los mismos valores calculados en todos los estados.
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const LIBRO = path.join(RAIZ, 'ejemplo', 'salida', 'libro.json');
const [A, B] = process.argv.slice(2).map((p) => path.resolve(p));
if (!A || !B) {
  console.error('uso: comparar-estilos.mjs antes.html despues.html');
  process.exit(2);
}

function servir(html) {
  return new Promise((res) => {
    const srv = http
      .createServer((q, r) => {
        const u = decodeURIComponent(q.url.split('?')[0].split('#')[0]);
        const f = u === '/' ? html : u === '/libro.json' ? LIBRO : path.join(RAIZ, 'ejemplo', u);
        if (!fs.existsSync(f)) {
          r.writeHead(404);
          return r.end();
        }
        r.writeHead(200, {
          'content-type': f.endsWith('.json')
            ? 'application/json'
            : f.endsWith('.png')
              ? 'image/png'
              : 'text/html; charset=utf-8',
        });
        fs.createReadStream(f).pipe(r);
      })
      .listen(0, () => res(srv));
  });
}

// Cuatro anotaciones con respuestas en el capítulo 1 (una activa al margen), para que haya fichas en todos los estados.
const sembrar = () => {
  window.claude = { use: () => Promise.resolve(null) };
  if (sessionStorage.getItem('sembrado')) return;
  sessionStorage.setItem('sembrado', '1');
  const cap = 'Capítulo 1. Hechos y observaciones';
  const base = { tipo: 'subrayado', sid: 'cap-01', sidTitulo: cap, estado: 'abierta', autor: null, libro: 'x' };
  const a = {
    x1: {
      ...base,
      id: 'x1',
      pid: 'cap-01-b1',
      inicio: 0,
      fin: 29,
      cita: 'Un hecho es lo que se observó',
      antes: '',
      despues: ', no lo que',
      color: 'revisar',
      nota: 'Matizar. #carmen',
      creado: '2026-10-01T00:00:00.000Z',
      respuesta: 'Hecho.',
      cierre: 'atendida',
      respondido: '2026-10-02T00:00:00.000Z',
    },
    x2: {
      ...base,
      id: 'x2',
      pid: 'cap-01-b1',
      inicio: 109,
      fin: 143,
      cita: 'se lee una ficha escrita con prisa',
      antes: 'obvia hasta que ',
      despues: ', donde',
      color: 'duda',
      nota: '',
      creado: '2026-10-01T00:01:00.000Z',
      respuesta: '¿Así?',
      cierre: 'pregunta',
      respondido: '2026-10-02T00:00:00.000Z',
    },
    x3: {
      ...base,
      id: 'x3',
      pid: 'cap-01-b3',
      inicio: 36,
      fin: 80,
      cita: 'Dar por hecho lo que se infirió de una cifra',
      antes: '',
      despues: '.',
      color: 'cortar',
      nota: 'Repite.',
      estado: 'resuelta',
      creado: '2026-10-01T00:02:00.000Z',
    },
    x4: {
      id: 'x4',
      tipo: 'capitulo',
      sid: 'cap-01',
      sidTitulo: cap,
      nota: 'Nota de la sección',
      estado: 'abierta',
      creado: '2026-10-01T00:03:00.000Z',
    },
  };
  localStorage.setItem('lector-anotaciones:libro-de-ejemplo', JSON.stringify(a));
};

// Todos los estilos calculados, por ruta en el DOM; se toman también ::before y ::after.
const capturar = () => {
  const ruta = (e) => {
    const p = [];
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
      const i = n.parentElement ? Array.prototype.indexOf.call(n.parentElement.children, n) : 0;
      p.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + ':' + i);
    }
    return p.join('>');
  };
  const out = {};
  // ordenadas: Chrome enumera las propiedades personalizadas en un orden que cambia de una carga a otra
  const props = Array.from(getComputedStyle(document.documentElement)).sort();
  document.querySelectorAll('*').forEach((e) => {
    if (e.closest('script, style, head')) return;
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(e, pseudo);
      if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue;
      out[ruta(e) + (pseudo || '')] = props.map((p) => p + ':' + cs.getPropertyValue(p)).join('\n');
    }
  });
  return out;
};

const ESTADOS = [
  {
    nombre: 'escritorio · margen con ficha activa',
    vista: [1280, 900],
    hacer: async (p) => {
      await p.click('mark.hl[data-aids~="x2"]');
    },
  },
  {
    nombre: 'escritorio · Todas',
    vista: [1280, 900],
    hacer: async (p) => {
      await p.click('#tab-todas');
    },
  },
  {
    nombre: 'escritorio · Por revisar',
    vista: [1280, 900],
    hacer: async (p) => {
      await p.click('#tab-revisar');
      await p.keyboard.press('.');
    },
  },
  {
    nombre: 'escritorio · tema oscuro, sin serifa, 120 %',
    vista: [1280, 900],
    hacer: async (p) => {
      await p.evaluate(() => {
        localStorage.setItem(
          'lector-anotaciones.ajustes',
          JSON.stringify({ escala: 1.2, tema: 'dark', letra: 'sans' })
        );
      });
      await p.reload();
      await p.waitForSelector('mark.hl');
    },
  },
  {
    nombre: 'escritorio · tema claro forzado',
    vista: [1280, 900],
    hacer: async (p) => {
      await p.evaluate(() => {
        localStorage.setItem('lector-anotaciones.ajustes', JSON.stringify({ tema: 'light' }));
      });
      await p.reload();
      await p.waitForSelector('mark.hl');
    },
  },
  {
    nombre: 'escritorio · concentración',
    vista: [1280, 900],
    hacer: async (p) => {
      await p.focus('#lectura');
      await p.keyboard.press('f');
    },
  },
  {
    nombre: 'escritorio · menús y filtros abiertos',
    vista: [1280, 900],
    hacer: async (p) => {
      await p.evaluate(() => {
        document.querySelectorAll('details').forEach((d) => {
          d.open = true;
        });
      });
    },
  },
  {
    nombre: 'escritorio · atajos',
    vista: [1280, 900],
    hacer: async (p) => {
      await p.focus('#lectura');
      await p.keyboard.press('?');
    },
  },
  {
    nombre: 'escritorio · selección y sólo lectura',
    vista: [1280, 900],
    hacer: async (p) => {
      await p.evaluate(() => {
        const b = document.querySelector('article.seccion:not([hidden]) p.bloque[data-pid]');
        const n = b.querySelectorAll('mark')[0].nextSibling;
        const r = document.createRange();
        r.setStart(n, 2);
        r.setEnd(n, 12);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        document.dispatchEvent(new Event('selectionchange'));
      });
      await p.mouse.move(700, 260);
      await p.mouse.down();
      await p.mouse.up();
      await p.waitForTimeout(100);
      await p.evaluate(() => document.body.classList.add('solo-lectura'));
    },
  },
  {
    nombre: 'teléfono · hoja de anotaciones',
    vista: [400, 800],
    tactil: true,
    hacer: async (p) => {
      await p.tap('#b-panel');
      await p.waitForTimeout(400);
    },
  },
  {
    nombre: 'teléfono · índice y ⋯',
    vista: [400, 800],
    tactil: true,
    hacer: async (p) => {
      await p.tap('#b-indice');
      await p.waitForTimeout(400);
      await p.evaluate(() => document.querySelector('#herramientas').classList.add('abierta'));
    },
  },
  {
    nombre: 'teléfono · barra de selección',
    vista: [400, 800],
    tactil: true,
    hacer: async (p) => {
      await p.evaluate(() => {
        const b = document.querySelector('article.seccion:not([hidden]) p.bloque[data-pid]');
        const n = b.querySelectorAll('mark')[0].nextSibling;
        const r = document.createRange();
        r.setStart(n, 2);
        r.setEnd(n, 12);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
      });
      await p.waitForTimeout(700);
    },
  },
  {
    nombre: 'escritorio · alto contraste',
    vista: [1280, 900],
    medios: { forcedColors: 'active' },
    hacer: async () => {},
  },
  {
    nombre: 'escritorio · tema del sistema oscuro',
    vista: [1280, 900],
    medios: { colorScheme: 'dark' },
    hacer: async () => {},
  },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const tomar = async (html, e) => {
  const srv = await servir(html);
  const ctx = await browser.newContext({
    viewport: { width: e.vista[0], height: e.vista[1] },
    hasTouch: !!e.tactil,
    isMobile: !!e.tactil,
    reducedMotion: 'reduce',
  });
  await ctx.addInitScript(sembrar);
  const p = await ctx.newPage();
  if (e.medios) await p.emulateMedia(e.medios);
  await p.goto(`http://127.0.0.1:${srv.address().port}/#cap-01`);
  await p.waitForSelector('article.seccion:not([hidden]) mark.hl');
  await p.waitForTimeout(200);
  await e.hacer(p);
  await p.waitForTimeout(300);
  const r = await p.evaluate(capturar);
  await ctx.close();
  srv.close();
  return r;
};
// Igual salvo medidas que difieren en menos de 0,6 px (el texto de la barra de estado lleva la hora y mueve anchos
// en fracciones de píxel): mismo esqueleto no numérico y cada número dentro de la tolerancia.
const NUM = /-?\d+(?:\.\d+)?(?=px)/g;
const casiIgual = (x, y) => {
  if (x === y) return true;
  if (x === undefined || y === undefined || x.replace(NUM, '#') !== y.replace(NUM, '#')) return false;
  const nx = x.match(NUM) || [],
    ny = y.match(NUM) || [];
  return nx.every((v, i) => Math.abs(parseFloat(v) - parseFloat(ny[i])) < 0.6);
};
const mismoEstilo = (x, y) => {
  if (x === y) return true;
  if (!x || !y) return false;
  const lx = x.split('\n'),
    ly = y.split('\n');
  return lx.length === ly.length && lx.every((v, i) => casiIgual(v, ly[i]));
};
let diferencias = 0;
for (const e of ESTADOS) {
  const [a, b] = [await tomar(A, e), await tomar(B, e)];
  const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
  let n = 0;
  for (const k of claves) {
    if (mismoEstilo(a[k], b[k])) continue;
    n++;
    if (n <= 6) {
      // las propiedades van en el mismo orden en las dos capturas: se comparan línea a línea
      const la = (a[k] || '').split('\n'),
        lb = (b[k] || '').split('\n');
      const dif = la.map((x, i) => [x, lb[i]]).filter(([x, y]) => !casiIgual(x, y));
      console.log(
        `  ${e.nombre} · ${k.split('>').slice(-3).join('>')}${!a[k] ? ' (sólo después)' : !b[k] ? ' (sólo antes)' : ''} · ${la.length}/${lb.length} propiedades`
      );
      dif.slice(0, 6).forEach(([x, y]) => console.log(`    ${String(x).slice(0, 140)}  →  ${String(y).slice(0, 140)}`));
    }
  }
  console.log(
    `${n ? 'DIFIERE' : 'igual  '} ${e.nombre}: ${Object.keys(a).length} elementos${n ? ', ' + n + ' con diferencias' : ''}`
  );
  diferencias += n;
}
await browser.close();
console.log(diferencias ? `\n${diferencias} diferencias` : '\nSin diferencias');
process.exit(diferencias ? 1 : 0);
