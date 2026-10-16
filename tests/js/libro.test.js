// Pruebas del armado de libros en el núcleo: Markdown, huellas, validación, ZIP y texto plano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { cargarNucleo } from './nucleo.mjs';

const N = cargarNucleo();
const inflar = (b) => Promise.resolve(new Uint8Array(inflateRawSync(b)));

test('sha1 coincide con node:crypto (ASCII, acentos, emoji, vacío, varios bloques de 64 bytes)', () => {
  for (const s of [
    '',
    'abc',
    'Capítulo 1. El hecho clínico',
    '😀 «comillas» ñ',
    'x'.repeat(1000),
    'a'.repeat(55),
    'a'.repeat(56),
    'a'.repeat(64),
  ]) {
    assert.equal(N.sha1(s), createHash('sha1').update(s, 'utf8').digest('hex'), JSON.stringify(s.slice(0, 20)));
  }
});

test('parsearMarkdown: secciones, ids, bloques y src como markdown.py', () => {
  const md = [
    '# PARTE I. Lo que se ve',
    '',
    '## Capítulo 1. Hechos',
    '',
    'Un párrafo con **negrita** y *cursiva*',
    'que sigue.',
    '',
    '### Sub',
    '',
    '- uno',
    '- dos',
    '',
    '1. a',
    '1. b',
    '',
    '| A | B |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '> cita',
    '> larga',
    '',
    '[FIGURA: f.png | Leyenda *x*]',
  ].join('\n');
  const secs = N.parsearMarkdown([{ nombre: 'a.md', texto: md }], 'figs/');
  assert.deepEqual(
    secs.map((s) => [s.id, s.nivel]),
    [
      ['parte-1', 1],
      ['cap-01', 2],
    ]
  );
  const b = secs[1].bloques;
  assert.deepEqual(
    b.map((x) => x.t),
    ['p', 'h3', 'ul', 'ol', 'table', 'quote', 'figure']
  );
  assert.equal(b[0].html, 'Un párrafo con <strong>negrita</strong> y <em>cursiva</em> que sigue.');
  assert.equal(b[0].src, 'a.md:5');
  assert.equal(b[0].id, 'cap-01-b1');
  assert.deepEqual(b[4].html, [
    ['A', 'B'],
    ['1', '2'],
  ]);
  assert.equal(b[5].html, 'cita larga');
  assert.deepEqual(b[6].html, { src: 'figs/f.png', caption: 'Leyenda <em>x</em>' });
});

test('parsearMarkdown: un bloque antes del primer título abre «Preliminares»; secciones repetidas se numeran', () => {
  const secs = N.parsearMarkdown([{ nombre: 'x.md', texto: 'Hola\n\n# Uno\n\n# Uno\n\ntexto' }]);
  assert.deepEqual(
    secs.map((s) => s.id),
    ['preliminares', 'uno', 'uno-2']
  );
});

test('parsearMarkdown: [PORTADA] sin cierre es un error legible', () => {
  assert.throws(
    () => N.parsearMarkdown([{ nombre: 'x.md', texto: '[PORTADA]\nTítulo' }]),
    /falta el cierre \[\/PORTADA\]/
  );
});

test('armarLibro: huellas del texto que muestra la página y libro válido', () => {
  const secs = N.parsearMarkdown([{ nombre: 'a.md', texto: '## Capítulo 1. A\n\nTexto &amp; más\n\n- x\n- y' }]);
  const libro = N.armarLibro(secs, { titulo: 'Mi libro', autor: 'Yo', fuentes: ['a.md'] });
  assert.equal(libro.formato, 2);
  assert.equal(libro.id, 'mi-libro');
  assert.equal(libro.inicio, 'cap-01');
  const p = libro.secciones[0].bloques[0];
  assert.equal(N.textoRender(p), 'Texto &amp; más');
  assert.equal(p.h, createHash('sha1').update('Texto &amp; más').digest('hex').slice(0, 12));
  assert.equal(libro.secciones[0].bloques[1].h, createHash('sha1').update('xy').digest('hex').slice(0, 12));
  assert.deepEqual(N.validarLibro(libro), []);
});

test('validarLibro señala ids fuera de patrón, src sin línea y páginas que retroceden', () => {
  const libro = {
    secciones: [
      {
        id: 's',
        bloques: [
          { id: 's-b2', t: 'p', html: 'x', src: 'a', h: '1', pagina: 5 },
          { id: 's-b2', t: 'p', html: 'y', src: 'a:1', h: '2', pagina: 3 },
        ],
      },
    ],
  };
  const p = N.validarLibro(libro).join(' | ');
  assert.match(p, /fuera de patrón: s-b2 \(esperado s-b1\)/);
  assert.match(p, /src sin línea/);
  assert.match(p, /repetido: s-b2/);
  assert.match(p, /retrocede/);
  assert.deepEqual(N.validarLibro({}), ['no es un libro.json (falta la lista de secciones)']);
});

test('libroAMarkdown vuelve a leerse como el mismo libro', () => {
  const md =
    '# PARTE I. Uno\n\n## Capítulo 1. A\n\nTexto con **negrita**.\n\n### Sub\n\n- a\n- b\n\n1. x\n2. y\n\n> cita\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n';
  const a = N.armarLibro(N.parsearMarkdown([{ nombre: 'a.md', texto: md }]), { titulo: 'L' });
  const b = N.armarLibro(N.parsearMarkdown([{ nombre: 'a.md', texto: N.libroAMarkdown(a) }]), { titulo: 'L' });
  const forma = (l) => l.secciones.map((s) => [s.id, s.titulo, s.bloques.map((x) => [x.t, x.h])]);
  assert.deepEqual(forma(b), forma(a));
});

// ZIP mínimo (método 0 y 8) para probar el lector sin archivos de muestra
function zip(entradas) {
  const partes = [],
    central = [];
  let off = 0;
  for (const [nombre, texto, comprimir] of entradas) {
    const datos = Buffer.from(texto, 'utf8'),
      cuerpo = comprimir ? deflateRawSync(datos) : datos,
      n = Buffer.from(nombre);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0);
    loc.writeUInt16LE(comprimir ? 8 : 0, 8);
    loc.writeUInt32LE(cuerpo.length, 18);
    loc.writeUInt32LE(datos.length, 22);
    loc.writeUInt16LE(n.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(comprimir ? 8 : 0, 10);
    cen.writeUInt32LE(cuerpo.length, 20);
    cen.writeUInt32LE(datos.length, 24);
    cen.writeUInt16LE(n.length, 28);
    cen.writeUInt32LE(off, 42);
    partes.push(loc, n, cuerpo);
    central.push(cen, n);
    off += 30 + n.length + cuerpo.length;
  }
  const cd = Buffer.concat(central),
    fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(cd.length, 12);
  fin.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...partes, cd, fin]));
}

test('abrirZip lee entradas guardadas y comprimidas, y rechaza lo que no es ZIP', async () => {
  const z = N.abrirZip(
    zip([
      ['mimetype', 'application/epub+zip', false],
      ['OEBPS/cap 1.xhtml', '<p>¡Hola, «mundo»!</p>'.repeat(50), true],
    ]),
    inflar
  );
  assert.deepEqual(z.nombres, ['mimetype', 'OEBPS/cap 1.xhtml']);
  assert.equal(await z.texto('mimetype'), 'application/epub+zip');
  assert.equal(await z.texto('OEBPS/cap 1.xhtml'), '<p>¡Hola, «mundo»!</p>'.repeat(50));
  await assert.rejects(z.texto('no-existe'), /falta no-existe/);
  assert.throws(() => N.abrirZip(new Uint8Array([1, 2, 3]), inflar), /no es un archivo ZIP/);
});

test('txtAMarkdown convierte las líneas sueltas de capítulo en títulos de sección', () => {
  const md = N.txtAMarkdown(
    'Prólogo\n\nTexto del prólogo\nen dos líneas.\n\nCAPÍTULO I\n\nEra una vez.\n\n- guion de diálogo'
  );
  assert.match(md, /^## Prólogo$/m);
  assert.match(md, /^## CAPÍTULO I$/m);
  const secs = N.parsearMarkdown([{ nombre: 'l.txt', texto: md }]);
  assert.deepEqual(
    secs.map((s) => s.titulo),
    ['Prólogo', 'CAPÍTULO I']
  );
  assert.equal(secs[0].bloques[0].html, 'Texto del prólogo en dos líneas.');
});

test('importarLibro: Markdown con su imagen, libro.json válido e inválido, formatos mezclados', async () => {
  const enc = (s) => new TextEncoder().encode(s);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const r = await N.importarLibro(
    [
      { nombre: 'b.md', bytes: enc('## Capítulo 2. B\n\nDos') },
      {
        nombre: 'a.md',
        bytes: enc('# Libro\n\n## Capítulo 1. A\n\nUno\n\n[FIGURA: f.png | Una figura]\n\n[FIGURA: falta.png | Otra]'),
      },
      { nombre: 'f.png', bytes: png },
    ],
    {}
  );
  assert.equal(r.libro.titulo, 'Libro');
  assert.deepEqual(
    r.libro.secciones.map((s) => s.id),
    ['libro', 'cap-01', 'cap-02']
  );
  const figs = r.libro.secciones[1].bloques.filter((b) => b.t === 'figure');
  assert.match(figs[0].html.src, /^data:image\/png;base64,/);
  assert.equal(figs[1].html.src, '');
  assert.match(r.avisos.join(' '), /1 figura quedó sólo con su leyenda/);
  const json = await N.importarLibro([{ nombre: 'libro.json', bytes: enc(JSON.stringify(r.libro)) }], {});
  assert.equal(json.libro.id, 'libro');
  await assert.rejects(
    N.importarLibro([{ nombre: 'x.json', bytes: enc('{"secciones":[{"id":"s","bloques":[{"id":"mal"}]}]}') }], {}),
    /no es válido/
  );
  await assert.rejects(
    N.importarLibro(
      [
        { nombre: 'a.md', bytes: enc('x') },
        { nombre: 'b.docx', bytes: enc('x') },
      ],
      {}
    ),
    /un solo tipo/
  );
  await assert.rejects(N.importarLibro([{ nombre: 'a.pdf', bytes: enc('x') }], {}), /formato no admitido: \.pdf/);
  await assert.rejects(N.importarLibro([{ nombre: 'a.md', bytes: enc('   \n\n') }], {}), /no se encontró texto/);
});

test('sanearHtml deja sólo texto, <strong> y <em>; sanearLibro filtra imágenes externas', () => {
  assert.equal(N.sanearHtml('a <strong class="x">b</strong> <em>c</em> d'), 'a <strong>b</strong> <em>c</em> d');
  assert.equal(N.sanearHtml('<img src=x onerror=alert(1)>hola<script>alert(2)</script>'), 'holaalert(2)');
  assert.equal(N.sanearHtml('2 < 3 > 1 &amp; <scr<script>ipt>'), '2 &lt; 3 &gt; 1 &amp; ipt&gt;');
  assert.equal(N.sanearHtml('<!-- x --> y'), '&lt;!-- x --&gt; y');
  const md = N.armarLibro(
    N.parsearMarkdown([
      {
        nombre: 'a.md',
        texto:
          '## A\n\nTexto *con* **todo** & <signos>\n\n- uno\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n[FIGURA: f.png | Ley *x*]',
      },
    ]),
    { titulo: 'L' }
  );
  const antes = JSON.stringify(md);
  assert.equal(JSON.stringify(N.sanearLibro(JSON.parse(antes))), antes, 'un libro legítimo no cambia');
  const malo = {
    secciones: [
      {
        id: 's',
        titulo: 'T',
        bloques: [
          { id: 's-b1', t: 'figure', html: { src: 'javascript:alert(1)', caption: '<b onclick=x>c</b>' } },
          { id: 's-b2', t: 'figure', html: { src: 'https://rastreo.example/x.png', caption: 'c' } },
          { id: 's-b3', t: 'figure', html: { src: 'data:image/png;base64,AAAA', caption: 'c' } },
          { id: 's-b4', t: 'p', html: { raro: 1 } },
        ],
      },
    ],
  };
  const b = N.sanearLibro(malo).secciones[0].bloques;
  assert.deepEqual(
    b.map((x) => x.html.src),
    ['', '', 'data:image/png;base64,AAAA', undefined]
  );
  assert.equal(b[0].html.caption, 'c');
});

test('las figuras de un libro de afuera sólo admiten rutas relativas o data:image; los ids peligrosos no pasan', () => {
  const fig = (src) =>
    N.sanearLibro({ secciones: [{ id: 's', bloques: [{ id: 's-b1', t: 'figure', html: { src, caption: 'c' } }] }] })
      .secciones[0].bloques[0].html.src;
  assert.equal(fig('figs/a.png'), 'figs/a.png');
  assert.equal(fig('//evil.example/baliza.png'), '');
  assert.equal(fig('/figs/a.png'), '');
  assert.equal(fig('\\\\evil.example\\a.png'), '');
  assert.equal(fig('figs\\a.png'), '');
  assert.equal(fig('http://evil.example/a.png'), '');
  assert.match(N.validarLibro({ secciones: [{ id: 'x"]', bloques: [] }] }).join(' '), /caracteres no admitidos/);
});

test('importar texto que no está en UTF-8: windows-1252 con aviso, o el charset que declare el HTML', async () => {
  const cp1252 = (s) =>
    Uint8Array.from(Array.from(s, (c) => ({ 'ñ': 0xf1, 'ó': 0xf3, 'Í': 0xcd, 'á': 0xe1 })[c] || c.charCodeAt(0)));
  const r = await N.importarLibro(
    [{ nombre: 'viejo.txt', bytes: cp1252('CAPÍTULO I\n\nEl niño soñó con acción.') }],
    {}
  );
  assert.equal(r.libro.secciones[0].titulo, 'CAPÍTULO I');
  assert.equal(r.libro.secciones[0].bloques[0].html, 'El niño soñó con acción.');
  assert.match(r.avisos.join(' '), /viejo\.txt no está en UTF-8: se leyó como windows-1252/);
  const utf16 = new Uint8Array([
    0xff,
    0xfe,
    ...Array.from('## A\n\nñandú', (c) => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8]).flat(),
  ]);
  const r16 = await N.importarLibro([{ nombre: 'u16.md', bytes: utf16 }], {});
  assert.equal(r16.libro.secciones[0].bloques[0].html, 'ñandú');
  assert.deepEqual(r16.avisos, []);
});

// Lo que encontró el tipado estricto del núcleo (0.6): un libro de fuera con secciones o bloques que no son objetos se
// informa como inválido, no hace saltar un TypeError (que la biblioteca no reconocía y repetía en cada carga).
test('validarLibro y sanearLibro con secciones o bloques que no son objetos: se informa, no se lanza', () => {
  for (const malo of [null, 3, 'texto', ['a']]) {
    const libro = { secciones: [{ id: 'cap-01', titulo: 'C', bloques: [malo] }, null] };
    assert.doesNotThrow(() => N.sanearLibro(libro), `sanear con ${JSON.stringify(malo)}`);
    const p = N.validarLibro(libro);
    assert.ok(p.includes('bloque 1 de cap-01 no es un objeto'), `${JSON.stringify(malo)}: ${p.join(' | ')}`);
    assert.ok(p.includes('sección sin id o sin bloques'));
  }
});

// La revisión de la 0.6: un libro de la biblioteca con secciones o bloques que no son listas tampoco hace lanzar a
// sanearLibro (que corre antes que validarLibro).
test('sanearLibro con secciones o bloques que no son listas: no lanza, y validarLibro lo informa', () => {
  for (const libro of [
    { secciones: [{ id: 'a', titulo: 'A', bloques: {} }] },
    { secciones: [{ id: 'a', bloques: 'x' }] },
    { secciones: { a: 1 } },
  ]) {
    assert.doesNotThrow(() => N.sanearLibro(libro), JSON.stringify(libro));
    assert.ok(N.validarLibro(libro).length > 0, JSON.stringify(libro));
  }
});
