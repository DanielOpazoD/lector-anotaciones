// Cobertura de la página en el navegador, por fragmento de las fuentes (pagina/*.js y nucleo/*.js).
//
// Con COBERTURA=1, cada prueba de navegador recoge la cobertura V8 de sus páginas (ayudas.mjs) y la deja reducida en
// cobertura/web/<prueba>.json: por fragmento, las líneas que se ejecutaron y las funciones que corrieron. Este guion
// las junta y escribe el informe:
//
//   COBERTURA=1 npx playwright test && node tests/web/herramientas/cobertura.mjs [--minimo 80]
//
// Una línea cuenta si es código (no vacía, no sólo comentario ni sólo cierre de llaves) y su primer carácter se
// ejecutó al menos una vez. La cobertura es un detector de lo que ninguna prueba toca, no un objetivo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WEB = path.join(RAIZ, 'src', 'lector_anotaciones', 'web');
export const SALIDA = path.join(RAIZ, 'cobertura', 'web');

// Los fragmentos en el orden en que el empaquetador los concatena: primero el núcleo, después la página.
function fragmentos() {
  const lista = [];
  for (const carpeta of ['nucleo', 'pagina'])
    for (const nombre of fs
      .readdirSync(path.join(WEB, carpeta))
      .filter((n) => n.endsWith('.js'))
      .sort())
      lista.push({ archivo: `${carpeta}/${nombre}`, texto: fs.readFileSync(path.join(WEB, carpeta, nombre), 'utf8') });
  return lista;
}

// Las líneas de código de un texto (desde 1): ni vacías, ni sólo comentario, ni sólo cierres.
export function lineasDeCodigo(texto) {
  const out = [];
  texto.split('\n').forEach((l, i) => {
    const t = l.trim();
    if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || /^[\])};,]+$/.test(t)) return;
    out.push(i + 1);
  });
  return out;
}

// Reduce las entradas de `page.coverage.stopJSCoverage()` a { archivo: { lineas: [n…], funciones: { 'línea nombre': 1 } } }.
export function reducir(entradas) {
  const frags = fragmentos(),
    out = {};
  for (const e of entradas) {
    const fuente = e.source || '';
    // dónde empieza cada fragmento dentro del guion (están concatenados tal cual, en orden)
    let desde = 0;
    const ubicados = [];
    for (const f of frags) {
      const i = fuente.indexOf(f.texto, desde);
      if (i < 0) continue;
      ubicados.push({ ...f, inicio: i, fin: i + f.texto.length });
      desde = i + f.texto.length;
    }
    if (!ubicados.length) continue;
    // cuenta por carácter: los tramos de fuera primero, los de dentro los corrigen
    const cuentas = new Int32Array(fuente.length).fill(-1);
    const tramos = [];
    for (const fn of e.functions) for (const r of fn.ranges) tramos.push(r);
    tramos.sort((a, b) => b.endOffset - b.startOffset - (a.endOffset - a.startOffset));
    for (const r of tramos) cuentas.fill(r.count, r.startOffset, Math.min(r.endOffset, fuente.length));
    for (const f of ubicados) {
      const reg = (out[f.archivo] = out[f.archivo] || { lineas: new Set(), funciones: {} });
      const lineas = f.texto.split('\n');
      let pos = f.inicio;
      lineas.forEach((l, i) => {
        const primero = l.search(/\S/);
        if (primero >= 0 && cuentas[pos + primero] > 0) reg.lineas.add(i + 1);
        pos += l.length + 1;
      });
      for (const fn of e.functions) {
        const r = fn.ranges[0];
        if (!fn.functionName || r.startOffset < f.inicio || r.startOffset >= f.fin) continue;
        const linea = f.texto.slice(0, r.startOffset - f.inicio).split('\n').length;
        const clave = `${linea} ${fn.functionName}`;
        reg.funciones[clave] = Math.max(reg.funciones[clave] || 0, r.count > 0 ? 1 : 0);
      }
    }
  }
  const json = {};
  for (const [k, v] of Object.entries(out))
    json[k] = { lineas: [...v.lineas].sort((a, b) => a - b), funciones: v.funciones };
  return json;
}

export function guardar(nombre, reducido) {
  fs.mkdirSync(SALIDA, { recursive: true });
  const archivo = path.join(SALIDA, nombre.replace(/[^\w.-]+/g, '_').slice(0, 120) + '.json');
  fs.writeFileSync(archivo, JSON.stringify(reducido));
}

// Junta lo de todas las pruebas y escribe el informe.
function informe(minimo) {
  const archivos = fs.existsSync(SALIDA) ? fs.readdirSync(SALIDA).filter((n) => n.endsWith('.json')) : [];
  if (!archivos.length) {
    console.error('no hay cobertura recogida: corre antes COBERTURA=1 npx playwright test');
    process.exit(2);
  }
  const junto = {};
  for (const n of archivos) {
    const d = JSON.parse(fs.readFileSync(path.join(SALIDA, n), 'utf8'));
    for (const [archivo, v] of Object.entries(d)) {
      const reg = (junto[archivo] = junto[archivo] || { lineas: new Set(), funciones: {} });
      v.lineas.forEach((l) => reg.lineas.add(l));
      for (const [k, c] of Object.entries(v.funciones)) reg.funciones[k] = Math.max(reg.funciones[k] || 0, c);
    }
  }
  let total = 0,
    cubiertas = 0;
  const filas = [];
  for (const f of fragmentos()) {
    const codigo = lineasDeCodigo(f.texto),
      reg = junto[f.archivo] || { lineas: new Set(), funciones: {} };
    const si = codigo.filter((l) => reg.lineas.has(l)).length;
    total += codigo.length;
    cubiertas += si;
    const nunca = Object.entries(reg.funciones)
      .filter(([, c]) => !c)
      .map(([k]) => k);
    filas.push({ archivo: f.archivo, codigo: codigo.length, si, nunca });
  }
  const pct = (a, b) => (b ? (100 * a) / b : 100).toFixed(1);
  const lineas = [
    `| fragmento | líneas de código | cubiertas | % | funciones nunca ejecutadas |`,
    `|---|---:|---:|---:|---|`,
  ];
  for (const r of filas)
    lineas.push(
      `| ${r.archivo} | ${r.codigo} | ${r.si} | ${pct(r.si, r.codigo)} | ${r.nunca.slice(0, 12).join(', ')}${r.nunca.length > 12 ? ` … (${r.nunca.length})` : ''} |`
    );
  lineas.push(`| **total** | ${total} | ${cubiertas} | **${pct(cubiertas, total)}** | |`);
  const texto = lineas.join('\n') + '\n';
  fs.writeFileSync(path.join(RAIZ, 'cobertura', 'web.md'), texto);
  console.log(texto);
  const t = Number(pct(cubiertas, total));
  if (minimo && t < minimo) {
    console.error(`cobertura de la página ${t} % por debajo del mínimo ${minimo} %`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf('--minimo');
  informe(i > 0 ? Number(process.argv[i + 1]) : 0);
}
