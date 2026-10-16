// Los módulos de la página: de pagina/*.js saca lo que cada fragmento ofrece (P.x = …), el estado compartido (E.x = …)
// y lo que cada uno usa de los demás, y escribe
//
//   src/lector_anotaciones/web/tipos/pagina.d.ts   las interfaces Pagina y Estado, con los tipos que infiere tsc
//   docs/MODULOS.md                                 qué ofrece cada fragmento y de quién depende
//
// Uso: node herramientas/modulos.mjs            (escribe)
//      node herramientas/modulos.mjs --comprobar (falla si lo escrito no está al día; lo corre la CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';
import ts from 'typescript';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(RAIZ, 'src', 'lector_anotaciones', 'web');
const DTS = path.join(WEB, 'tipos', 'pagina.d.ts');
const DOC = path.join(RAIZ, 'docs', 'MODULOS.md');

const lista = (c) =>
  fs
    .readdirSync(path.join(WEB, c))
    .filter((n) => n.endsWith('.js'))
    .sort()
    .map((n) => path.join(WEB, c, n));

// Un programa sin pagina.d.ts (P y E sin tipo) para inferir los tipos de lo que se exporta.
function programa(extra) {
  const archivos = [
    ...lista('nucleo'),
    ...lista('pagina'),
    path.join(WEB, 'tipos', 'globales.d.ts'),
    '/virtual/stub.d.ts',
  ];
  const textos = { '/virtual/stub.d.ts': extra };
  const opciones = {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    strictNullChecks: true,
    target: ts.ScriptTarget.ES2020,
    lib: ['lib.es2020.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  };
  const host = ts.createCompilerHost(opciones);
  const leer = host.readFile.bind(host),
    existe = host.fileExists.bind(host),
    fuente = host.getSourceFile.bind(host);
  host.readFile = (f) => textos[f] ?? leer(f);
  host.fileExists = (f) => textos[f] !== undefined || existe(f);
  host.getSourceFile = (f, v) =>
    textos[f] !== undefined ? ts.createSourceFile(f, textos[f], v, true) : fuente(f, v, undefined, undefined);
  return ts.createProgram(archivos, opciones, host);
}

// El cuerpo del módulo de un fragmento: (function (P, E) { … })(LAPagina, LAEstado);
function cuerpo(sf) {
  for (const st of sf.statements) {
    const e = ts.isExpressionStatement(st) ? st.expression : null;
    if (e && ts.isCallExpression(e)) {
      let fn = e.expression;
      while (ts.isParenthesizedExpression(fn)) fn = fn.expression;
      if (ts.isFunctionExpression(fn) && fn.parameters.length === 2) return fn.body.statements;
    }
  }
  throw new Error(`${path.basename(sf.fileName)} no es un módulo (function (P, E) { … })(LAPagina, LAEstado)`);
}
const asignacion = (st, ns) =>
  ts.isExpressionStatement(st) &&
  ts.isBinaryExpression(st.expression) &&
  st.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
  ts.isPropertyAccessExpression(st.expression.left) &&
  ts.isIdentifier(st.expression.left.expression) &&
  st.expression.left.expression.text === ns
    ? st.expression
    : null;

function analizar() {
  const prog = programa('declare var LAPagina: any;\ndeclare var LAEstado: any;\n');
  const tc = prog.getTypeChecker();
  const texto = (t) =>
    tc.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType);
  // En un .js los parámetros sin JSDoc son opcionales: la función se escribe así, para que la d.ts no los vuelva
  // obligatorios. Lo que no se puede nombrar fuera del fragmento (`typeof x`, `import(…)`) queda como any.
  const imprimir = (t) => {
    const firmas = t.getCallSignatures();
    let s;
    if (firmas.length && !t.getProperties().length) {
      const f = firmas[0];
      const params = f.getParameters().map((p) => {
        const d = p.valueDeclaration;
        const resto = d && ts.isParameter(d) && d.dotDotDotToken;
        const tp = tc.getTypeOfSymbolAtLocation(p, d || f.getDeclaration());
        return resto ? `...${p.name}: ${texto(tp)}` : `${p.name}?: ${texto(tc.getNonNullableType(tp))}`;
      });
      s = `(${params.join(', ')}) => ${texto(f.getReturnType())}`;
    } else s = texto(t);
    // un objeto que empieza vacío (`var x = {}`) es un mapa que se llena después
    if (s === '{}') return 'Record<string, any>';
    return /typeof |import\(/.test(s) ? 'any' : s;
  };
  const ofrece = {}, // nombre → { archivo, tipo }
    estado = {}, // nombre → { archivo, tipos: Set }
    usa = {}; // archivo → { P: Set, E: Set }
  for (const f of lista('pagina')) {
    const sf = prog.getSourceFile(f);
    const nombre = path.basename(f);
    usa[nombre] = { P: new Set(), E: new Set() };
    for (const st of cuerpo(sf)) {
      // el estado se declara donde se le da su primer valor en el nivel del módulo
      const e = asignacion(st, 'E');
      if (e) {
        const x = e.left.name.text;
        if (estado[x] && estado[x].declarado)
          throw new Error(`E.${x} se declara dos veces (${estado[x].archivo} y ${nombre})`);
        estado[x] = { archivo: nombre, tipos: (estado[x] && estado[x].tipos) || new Set(), declarado: true };
      }
      const a = asignacion(st, 'P');
      if (!a) continue;
      const x = a.left.name.text;
      if (ofrece[x]) throw new Error(`P.${x} se ofrece dos veces (${ofrece[x].archivo} y ${nombre})`);
      ofrece[x] = { archivo: nombre, tipo: imprimir(tc.getBaseTypeOfLiteralType(tc.getTypeAtLocation(a.right))) };
    }
    // todo E.x = … (el primero dice de qué fragmento es) y todo uso de P.x y E.x
    (function visitar(n) {
      if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && /^[PE]$/.test(n.expression.text)) {
        const ns = n.expression.text,
          x = n.name.text;
        usa[nombre][ns].add(x);
        if (
          ns === 'E' &&
          ts.isBinaryExpression(n.parent) &&
          n.parent.left === n &&
          n.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
        ) {
          const reg = (estado[x] = estado[x] || { archivo: nombre, tipos: new Set() });
          const t = tc.getWidenedType(tc.getTypeAtLocation(n.parent.right));
          reg.tipos.add(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined) ? 'null' : imprimir(t));
        }
      }
      ts.forEachChild(n, visitar);
    })(sf);
  }
  for (const f of Object.keys(usa)) {
    for (const x of usa[f].P) if (!ofrece[x]) throw new Error(`${f} usa P.${x}, que nadie ofrece`);
    for (const x of usa[f].E) if (!estado[x]) throw new Error(`${f} usa E.${x}, que nadie asigna`);
  }
  return { ofrece, estado, usa };
}

function tipoEstado(tipos) {
  const t = [...tipos].filter((x) => x !== 'null');
  if (!t.length || t.includes('any')) return 'any';
  return [...new Set(t)].join(' | ') + (tipos.has('null') ? ' | null' : '');
}

function escribir({ ofrece, estado, usa }) {
  const porArchivo = (reg) => {
    const g = {};
    for (const [x, v] of Object.entries(reg)) (g[v.archivo] = g[v.archivo] || []).push(x);
    return g;
  };
  const dts = [
    '// Generado por herramientas/modulos.mjs a partir de pagina/*.js: no se edita a mano (npm run modulos).',
    '',
    '/** Lo que cada fragmento de la página ofrece a los demás (LAPagina, `P` dentro de cada módulo). */',
    'interface Pagina {',
  ];
  const ofreceArch = porArchivo(ofrece);
  for (const a of Object.keys(ofreceArch).sort()) {
    dts.push(`  // ${a}`);
    for (const x of ofreceArch[a]) dts.push(`  ${x}: ${ofrece[x].tipo};`);
  }
  dts.push(
    '}',
    '',
    '/** El estado que los fragmentos comparten y reasignan (LAEstado, `E` dentro de cada módulo). */',
    'interface Estado {'
  );
  const estadoArch = porArchivo(estado);
  for (const a of Object.keys(estadoArch).sort()) {
    dts.push(`  // ${a}`);
    for (const x of estadoArch[a]) dts.push(`  ${x}: ${tipoEstado(estado[x].tipos)};`);
  }
  dts.push('}', '', 'declare var LAPagina: Pagina;', 'declare var LAEstado: Estado;', '');

  const doc = [
    '# Los módulos de la página',
    '',
    'Generado por `herramientas/modulos.mjs` (`npm run modulos`); la CI comprueba que esté al día.',
    '',
    'Cada fragmento de `src/lector_anotaciones/web/pagina/` es un módulo: `(function (P, E) { … })(LAPagina, LAEstado)`.',
    'Lo que declara es privado; lo que otro fragmento necesita lo ofrece en `P` (funciones y valores que no cambian), y',
    'el estado que varios comparten y reasignan vive en `E`. Los tipos de ambos están en `tipos/pagina.d.ts`, así que',
    'usar algo que nadie ofrece es un error de `npm run tipos`.',
    '',
    `En total: ${Object.keys(ofrece).length} cosas ofrecidas y ${Object.keys(estado).length} de estado compartido.`,
    '',
    '## Estado compartido (`E`)',
    '',
    '| nombre | se declara en | lo usan |',
    '|---|---|---|',
  ];
  for (const x of Object.keys(estado).sort((a, b) => a.localeCompare(b))) {
    const quien = Object.keys(usa).filter((f) => usa[f].E.has(x));
    doc.push(`| \`${x}\` | ${estado[x].archivo} | ${quien.join(', ')} |`);
  }
  doc.push('', '## Fragmentos', '');
  for (const f of Object.keys(usa)) {
    const ofrecidos = (ofreceArch[f] || []).slice().sort((a, b) => a.localeCompare(b));
    const deps = {};
    for (const x of usa[f].P) {
      const de = ofrece[x].archivo;
      if (de !== f) (deps[de] = deps[de] || []).push(x);
    }
    doc.push(`### ${f}`, '');
    doc.push(ofrecidos.length ? `Ofrece: ${ofrecidos.map((x) => '`' + x + '`').join(', ')}.` : 'No ofrece nada.', '');
    const lineas = Object.keys(deps)
      .sort()
      .map(
        (d) =>
          `- de ${d}: ${deps[d]
            .sort((a, b) => a.localeCompare(b))
            .map((x) => '`' + x + '`')
            .join(', ')}`
      );
    doc.push(...(lineas.length ? ['Usa:', '', ...lineas] : ['No usa nada de otros fragmentos.']), '');
  }
  return { dts: dts.join('\n'), doc: doc.join('\n') };
}

const salida = escribir(analizar());
salida.dts = await prettier.format(salida.dts, { ...(await prettier.resolveConfig(DTS)), parser: 'typescript' });
if (process.argv.includes('--comprobar')) {
  const viejos = [DTS, DOC].map((f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''));
  if (viejos[0] !== salida.dts || viejos[1] !== salida.doc) {
    console.error('tipos/pagina.d.ts o docs/MODULOS.md no están al día: corre npm run modulos');
    process.exit(1);
  }
  console.log('ok: los módulos de la página y sus tipos están al día');
} else {
  fs.writeFileSync(DTS, salida.dts);
  fs.writeFileSync(DOC, salida.doc);
  console.log(`ok ${path.relative(RAIZ, DTS)} y ${path.relative(RAIZ, DOC)}`);
}
