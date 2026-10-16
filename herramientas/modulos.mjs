// Los módulos de la página: de pagina/*.js saca lo que cada fragmento ofrece (P.x = …), el estado compartido (E.x = …)
// y lo que cada uno usa de los demás, comprueba que la ficha se dibuje sólo con (anotación, vista), y escribe
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

// Un programa sin pagina.d.ts (P y E sin tipo, salvo el núcleo en P.N) para inferir los tipos de lo que se exporta.
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

// Dos pasadas: la primera, con E sin tipo, encuentra el estado y el tipo que declara cada uno; la segunda infiere lo que
// ofrece P sabiendo ya esos tipos (así una función que devuelve E.LIBRO devuelve un Libro, no any).
function analizar(declarados = {}) {
  const tiposE = Object.entries(declarados)
    .map(([x, t]) => `${x}: ${t}; `)
    .join('');
  const prog = programa(
    `declare var LAPagina: { N: Nucleo; [k: string]: any };\ndeclare var LAEstado: { ${tiposE}[k: string]: any };\n`
  );
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
      // el estado se declara donde se le da su primer valor en el nivel del módulo; si ese valor lleva un tipo
      // (`E.x = /** @type {T} */ (valor);`), ése es su tipo, y tsc comprueba las demás asignaciones contra él
      const e = asignacion(st, 'E');
      if (e) {
        const x = e.left.name.text;
        if (estado[x] && estado[x].declarado)
          throw new Error(`E.${x} se declara dos veces (${estado[x].archivo} y ${nombre})`);
        const conTipo =
          ts.isParenthesizedExpression(e.right) && ts.getJSDocTags(e.right).some((t) => ts.isJSDocTypeTag(t));
        estado[x] = {
          archivo: nombre,
          tipos: (estado[x] && estado[x].tipos) || new Set(),
          declarado: true,
          tipo: conTipo ? texto(tc.getTypeAtLocation(e.right)) : null,
        };
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
  comprobarDibujo(prog, tc);
  for (const f of Object.keys(usa)) {
    for (const x of usa[f].P) if (!ofrece[x]) throw new Error(`${f} usa P.${x}, que nadie ofrece`);
    for (const x of usa[f].E) if (!estado[x]) throw new Error(`${f} usa E.${x}, que nadie asigna`);
  }
  return { ofrece, estado, usa };
}

// La ficha es función de la anotación y de su vista (la reúne `vistaDeFicha`, 50-panel.js, y su JSON es la firma con
// que se reutiliza el nodo): en 52-ficha.js, lo que corre al dibujar no lee nada más. Corre al dibujar el cuerpo de cada
// función del módulo que no es una acción, y lo que ese cuerpo llama en el momento: las funciones que pasa a forEach,
// map, replace…, las que guarda en una variable o declara dentro y llama, las de otros fragmentos que llama, y los
// ayudantes puros de P (cuyos cuerpos se revisan igual, para que «puro» no sea sólo un nombre). No corre al dibujar lo
// que queda para después: manejadores de eventos, temporizadores, funciones que devuelve o que pone en un objeto. Una
// llamada a algo que no se puede revisar (una función recibida, un alias) también es un error: si la ficha necesita algo
// más, va a la vista.
const DIBUJO = {
  archivo: '52-ficha.js',
  acciones: new Set(['abrirPropuesta', 'cursorAlFinal', 'vigente']), // corren después, desde un manejador o un atajo
  puros: new Set(['el', 'etiqueta', 'N', 'diffPalabras', 'chipAutor', 'etiquetasFicha']), // de P, sin estado
  nucleo: new Set(['N', 'diffPalabras']), // del núcleo, que no ve la página: puros por construcción
  documento: new Set(['createTextNode', 'createElement', 'createDocumentFragment']),
  globales: new Set(['window', 'localStorage', 'sessionStorage', 'location', 'navigator', 'LAPagina', 'LAEstado']),
};
const ITERAN = new Set([
  'forEach',
  'map',
  'filter',
  'some',
  'every',
  'reduce',
  'reduceRight',
  'find',
  'findIndex',
  'flatMap',
  'sort',
  'replace',
  'from',
]);

function comprobarDibujo(prog, tc) {
  const errores = [];
  const fuentes = lista('pagina').map((f) => prog.getSourceFile(f));
  const ficha = fuentes.find((f) => path.basename(f.fileName) === DIBUJO.archivo);
  const lugar = (f, n) => `${path.basename(f.fileName)}:${f.getLineAndCharacterOfPosition(n.getStart(f)).line + 1}`;
  const delModulo = new Map(fuentes.map((f) => [f, new Set(cuerpo(f).filter(ts.isFunctionDeclaration))]));
  for (const st of cuerpo(ficha))
    if (ts.isVariableStatement(st))
      errores.push(`${lugar(ficha, st)}: ${DIBUJO.archivo} no guarda estado propio (nada de variables del módulo)`);
  // qué se revisa: las funciones de la ficha que no son acciones, y los ayudantes puros de los demás fragmentos
  const raices = [];
  for (const fn of delModulo.get(ficha))
    if (!DIBUJO.acciones.has(fn.name.text)) raices.push({ f: ficha, fn, quien: fn.name.text });
  const hallados = new Set();
  for (const f of fuentes)
    for (const st of cuerpo(f)) {
      if (f !== ficha && ts.isFunctionDeclaration(st) && st.name && DIBUJO.puros.has(st.name.text)) {
        raices.push({ f, fn: st, quien: 'P.' + st.name.text });
        hallados.add(st.name.text);
      }
      if (ts.isVariableStatement(st))
        for (const d of st.declarationList.declarations)
          if (
            ts.isIdentifier(d.name) &&
            DIBUJO.puros.has(d.name.text) &&
            d.initializer &&
            ts.isFunctionLike(d.initializer)
          ) {
            raices.push({ f, fn: d.initializer, quien: 'P.' + d.name.text });
            hallados.add(d.name.text);
          }
    }
  for (const x of DIBUJO.puros)
    if (!DIBUJO.nucleo.has(x) && !hallados.has(x)) errores.push(`P.${x} figura entre los puros, pero no se encontró`);
  const revisadas = new Set();
  for (const { f, fn, quien } of raices) revisar(f, fn, quien);
  if (errores.length)
    throw new Error(`la ficha debe dibujarse sólo con (anotación, vista):\n  ${errores.join('\n  ')}`);

  function revisar(f, fn, quien) {
    if (revisadas.has(fn)) return;
    revisadas.add(fn);
    const guardadas = new Map(); // nombre → función declarada o guardada dentro, que corre si se llama al dibujar
    const mal = (n, que) => errores.push(`${lugar(f, n)}: ${quien} ${que} al dibujar`);
    // lo que una referencia a una función nombra: qué hacer si se llama (o se pasa a forEach…) al dibujar
    const alLlamar = (n, id) => {
      const x = id.text;
      if (DIBUJO.acciones.has(x)) return mal(n, `llama a la acción ${x}`);
      if (guardadas.has(x)) return recorrer(guardadas.get(x).body);
      const sim = tc.getSymbolAtLocation(id),
        d = sim && sim.declarations && sim.declarations[0];
      if (!d) return mal(n, `llama a ${x}, que no se sabe qué es`);
      if (d.getSourceFile().isDeclarationFile) return; // del lenguaje o del navegador: String, parseInt…
      const fd = d.getSourceFile();
      if (ts.isFunctionDeclaration(d) && delModulo.get(fd) && delModulo.get(fd).has(d)) {
        if (fd !== ficha) revisar(fd, d, quien + ' → ' + x); // de otro fragmento: corre ahora, se revisa igual
        return; // las de la ficha se revisan por su cuenta
      }
      // un alias de un ayudante puro: `var etiquetasDe = P.N.etiquetasDe`
      if (ts.isVariableDeclaration(d) && d.initializer && ts.isPropertyAccessExpression(d.initializer)) {
        let raiz = d.initializer;
        while (ts.isPropertyAccessExpression(raiz.expression)) raiz = raiz.expression;
        if (ts.isIdentifier(raiz.expression) && raiz.expression.text === 'P' && DIBUJO.puros.has(raiz.name.text))
          return;
      }
      mal(n, `llama a ${x}, que no se puede revisar`);
    };
    const recorrer = (n) => {
      if (!n) return;
      if (ts.isFunctionDeclaration(n) && n.name) {
        guardadas.set(n.name.text, n); // declarada dentro: corre si se llama
        return;
      }
      if (ts.isFunctionLike(n)) {
        const pa = n.parent;
        if (ts.isCallExpression(pa) && pa.arguments.includes(n) && ITERAN.has(nombreLlamado(pa))) recorrer(n.body);
        else if (ts.isVariableDeclaration(pa) && pa.initializer === n && ts.isIdentifier(pa.name))
          guardadas.set(pa.name.text, n);
        return; // lo demás queda para después
      }
      if (ts.isCallExpression(n)) {
        if (ts.isIdentifier(n.expression)) alLlamar(n, n.expression);
        // una función nombrada que se pasa a forEach, map…: corre ahora
        if (ITERAN.has(nombreLlamado(n))) for (const arg of n.arguments) if (ts.isIdentifier(arg)) alLlamar(n, arg);
      }
      if ((ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) && ts.isIdentifier(n.expression)) {
        const ns = n.expression.text,
          x = ts.isPropertyAccessExpression(n) ? n.name.text : '[…]';
        if (ns === 'E') mal(n, `lee E.${x} (el estado va en la vista)`);
        if (ns === 'P' && !DIBUJO.puros.has(x)) mal(n, `usa P.${x} (sólo ayudantes puros; el estado va en la vista)`);
        if (ns === 'document' && !DIBUJO.documento.has(x)) mal(n, `lee document.${x}`);
      }
      if (ts.isIdentifier(n)) {
        if (DIBUJO.globales.has(n.text)) mal(n, `usa ${n.text}`);
        // P o E sueltos (un alias, `var est = E`): no se puede seguir lo que se lee con ellos
        const pa = n.parent;
        if (
          (n.text === 'P' || n.text === 'E') &&
          !((ts.isPropertyAccessExpression(pa) || ts.isElementAccessExpression(pa)) && pa.expression === n)
        )
          mal(n, `usa ${n.text} sin más (un alias no se puede revisar)`);
      }
      if (n.kind === ts.SyntaxKind.ThisKeyword) mal(n, 'usa this');
      ts.forEachChild(n, recorrer);
    };
    recorrer(fn.body);
  }
}
// El nombre de lo que se llama: `xs.forEach(…)` → forEach, `Array.from(…)` → from, `f(…)` → f.
function nombreLlamado(llamada) {
  const c = llamada.expression;
  return ts.isPropertyAccessExpression(c) ? c.name.text : ts.isIdentifier(c) ? c.text : '';
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
    for (const x of estadoArch[a]) dts.push(`  ${x}: ${estado[x].tipo || tipoEstado(estado[x].tipos)};`);
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
    `La ficha de una anotación es función de la anotación y de su vista: \`vistaDeFicha\` (50-panel.js) reúne todo lo`,
    'demás que decide lo que muestra, su JSON es la firma con que se reutiliza el nodo y `vistaEnSitio` es el único',
    `camino para cambiar una ficha sin redibujarla. En ${DIBUJO.archivo}, lo que corre al dibujar sólo usa la anotación, la`,
    `vista y ayudantes puros (${[...DIBUJO.puros].map((x) => '`P.' + x + '`').join(', ')}); las acciones`,
    `(${[...DIBUJO.acciones].map((x) => '`' + x + '`').join(', ')}) y los manejadores de eventos corren después.`,
    'Este guion lo comprueba.',
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

const primera = analizar();
const salida = escribir(
  analizar(
    Object.fromEntries(
      Object.entries(primera.estado)
        .filter(([, v]) => v.tipo)
        .map(([x, v]) => [x, v.tipo])
    )
  )
);
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
