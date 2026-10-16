// Pruebas del núcleo de la página (lógica pura, sin navegador): node --test 'tests/js/**/*.test.js'
import test from 'node:test';
import assert from 'node:assert/strict';
import { cargarNucleo } from './nucleo.mjs';

const N = cargarNucleo();
const T = N,
  D = N,
  U = N,
  B = N;

test('slug coincide con util.slug del paquete Python', () => {
  // Valores calculados con lector_anotaciones.util.slug
  const esperado = {
    'Capítulo 1. El hecho clínico': 'capitulo-1-el-hecho-clinico',
    'Ñandú & cía.': 'nandu-cia',
    '  ¿Qué?  ': 'que',
    '': 's',
    'Ελληνικά': 's',
    'Hechos, inferencias e incertidumbre: metacognición, lenguaje y decisión clínica':
      'hechos-inferencias-e-incertidumbre-metac',
    'a--b__c': 'a-b-c',
  };
  for (const [entrada, salida] of Object.entries(esperado)) assert.equal(T.slug(entrada), salida, entrada);
});

test('normalizar quita tildes y pasa a minúsculas', () => {
  assert.equal(T.normalizar('Médico ÁGIL ñandú'), 'medico agil nandu');
});

test('textoDeHtml quita etiquetas y resuelve entidades', () => {
  assert.equal(T.textoDeHtml('<em>a</em> &amp; b &lt;c&gt; &#233;&#x41;'), 'a & b <c> éA');
  assert.equal(T.textoDeHtml('sin &desconocida; cambio'), 'sin &desconocida; cambio');
});

test('igual compara sin importar el orden de las claves', () => {
  assert.ok(T.igual({ a: 1, b: 2 }, { b: 2, a: 1 }));
  assert.ok(!T.igual({ a: 1 }, { a: 2 }));
});

test('etiquetasDe recoge #etiquetas de nota y réplica sin repetir', () => {
  assert.deepEqual(T.etiquetasDe({ nota: 'Ver #Fármacos y #dosis', replica: 'otra #dosis #x' }), ['fármacos', 'dosis']);
});

test('diffPalabras marca lo quitado y lo añadido', () => {
  const d = D.diffPalabras('el perro come pan', 'el gato come pan');
  assert.deepEqual(d, [
    ['=', 'el '],
    ['-', 'perro'],
    ['+', 'gato'],
    ['=', ' come pan'],
  ]);
  const largo = Array(600).fill('x').join(' ');
  assert.deepEqual(
    D.diffPalabras(largo, largo + ' y'),
    [
      ['-', largo],
      ['+', largo + ' y'],
    ],
    'demasiado grande: no compara'
  );
});

function libroDePrueba(textos) {
  return {
    existe: (pid) => Object.prototype.hasOwnProperty.call(textos, pid),
    texto: (pid) => textos[pid],
    candidatos: () => Object.keys(textos),
  };
}

test('ubicar: la cita sigue donde estaba', () => {
  const ctx = libroDePrueba({ 'c-b1': 'Hola mundo cruel' });
  const a = { tipo: 'subrayado', pid: 'c-b1', inicio: 5, fin: 10, cita: 'mundo' };
  assert.deepEqual(U.ubicarEn(a, ctx), { pid: 'c-b1', inicio: 5, fin: 10, estado: 'exacto' });
});

test('ubicar: la cita se movió dentro del mismo bloque', () => {
  const ctx = libroDePrueba({ 'c-b1': 'Ahora dice: hola mundo cruel' });
  const a = { tipo: 'subrayado', pid: 'c-b1', inicio: 5, fin: 10, cita: 'mundo', antes: 'hola ', despues: ' cruel' };
  assert.deepEqual(U.ubicarEn(a, ctx), { pid: 'c-b1', inicio: 17, fin: 22, estado: 'reubicado' });
});

test('ubicar: en otro bloque gana la coincidencia con contexto aunque otra igual aparezca antes', () => {
  const ctx = libroDePrueba({
    'c-b1': 'otro texto',
    'c-b2': 'cuadro habitual, manejo habitual',
    'c-b3': 'tras el cuadro habitual, manejo distinto',
  });
  const a = {
    tipo: 'subrayado',
    pid: 'c-b1',
    inicio: 0,
    fin: 15,
    cita: 'cuadro habitual',
    antes: 'tras el ',
    despues: ', manejo distinto',
  };
  assert.equal(U.ubicarEn(a, ctx).pid, 'c-b3');
});

test('ubicar: una cita corta repetida sin contexto no se adivina', () => {
  const ctx = libroDePrueba({ 'c-b1': 'nada', 'c-b2': 'dar por hecho', 'c-b3': 'no dar por hecho' });
  const a = { tipo: 'subrayado', pid: 'c-b9', inicio: 0, fin: 13, cita: 'dar por hecho' };
  assert.equal(U.ubicarEn(a, ctx).estado, 'perdido');
});

test('ubicar: una cita larga y única se encuentra aunque no tenga contexto', () => {
  const cita = 'una frase bastante larga que sólo aparece una vez en todo el libro';
  const ctx = libroDePrueba({ 'c-b1': 'nada', 'c-b2': 'Antes. ' + cita + ' Después.' });
  const a = { tipo: 'subrayado', pid: 'c-b7', inicio: 0, fin: cita.length, cita, antes: 'x', despues: 'y' };
  assert.deepEqual(U.ubicarEn(a, ctx), { pid: 'c-b2', inicio: 7, fin: 7 + cita.length, estado: 'reubicado' });
});

test('ubicar: por la huella, el mismo bloque con otro id (se insertó uno antes) es una ubicación exacta', () => {
  const textos = { 'c-b1': 'Párrafo nuevo insertado', 'c-b2': 'Hola mundo cruel', 'c-b3': 'Otro' };
  const huellas = { h1: ['c-b2'], hx: [] };
  const ctx = { ...libroDePrueba(textos), porHuella: (h) => huellas[h] || [] };
  const a = { tipo: 'subrayado', pid: 'c-b1', inicio: 5, fin: 10, cita: 'mundo', bh: 'h1' };
  assert.deepEqual(U.ubicarEn(a, ctx), { pid: 'c-b2', inicio: 5, fin: 10, estado: 'exacto' });
  // sin huella (o con una que ya no está), se busca por la cita y su contexto, y lo dice
  assert.equal(U.ubicarEn({ ...a, bh: 'hx', antes: 'Hola ', despues: ' cruel' }, ctx).estado, 'reubicado');
  assert.equal(U.ubicarEn({ ...a, bh: undefined, antes: 'Hola ', despues: ' cruel' }, ctx).estado, 'reubicado');
  // el bloque con la huella ya no tiene la cita en su lugar (datos viejos): tampoco es exacta
  assert.equal(U.ubicarEn({ ...a, inicio: 0, fin: 5 }, ctx).estado !== 'exacto', true);
});

test('ubicar: lo que no es subrayado no se ubica', () => {
  assert.equal(U.ubicarEn({ tipo: 'general' }, libroDePrueba({})), null);
});

test('marcarCampos suma sólo los campos del lector que cambiaron', () => {
  const m = B.marcarCampos(
    {},
    { nota: 'a', color: 'duda', respuesta: 'x' },
    { nota: 'b', color: 'duda', respuesta: 'y' }
  );
  assert.deepEqual(m, { nota: true });
});

test('fundirBorrador: el borrador aporta sus campos y la base el resto', () => {
  const base = {
    id: 'x',
    nota: 'vieja',
    replica: 'nueva de otra sesión',
    respuesta: 'r',
    estado: 'resuelta',
    editado: '1',
  };
  const borrador = { id: 'x', nota: 'mía', replica: 'vieja', estado: 'abierta', editado: '2' };
  assert.deepEqual(B.fundirBorrador(base, borrador, { nota: true }), {
    id: 'x',
    nota: 'mía',
    replica: 'nueva de otra sesión',
    respuesta: 'r',
    estado: 'resuelta',
    editado: '2',
  });
  // sin lista de campos: sólo textos, nunca color ni estado
  assert.equal(B.fundirBorrador(base, borrador, null).estado, 'resuelta');
});

test('porRevisar: respuestas propias que el autor no revisó', () => {
  const base = { id: 'x', autor: 'yo', respuesta: 'Hecho', respondido: '2026-10-10T10:00:00Z' };
  assert.equal(N.porRevisar(base, 'yo'), true);
  assert.equal(N.porRevisar({ ...base, revisado: N.marcaRevision(base, 'ahora') }, 'yo'), false, 'revisada');
  assert.equal(
    N.marcaRevision(base, 'ahora'),
    '2026-10-10T10:00:00Z',
    'se guarda el respondido revisado, no la hora del navegador'
  );
  // el reloj de quien responde no se compara con el del navegador: otra respuesta es otro `respondido`, aunque sea anterior
  assert.equal(
    N.porRevisar({ ...base, respondido: '2026-10-10T09:58:00Z', revisado: '2026-10-10T10:00:00Z' }, 'yo'),
    true,
    'una respuesta nueva con un reloj atrasado vuelve a la bandeja'
  );
  assert.equal(N.porRevisar({ ...base, autor: 'otra' }, 'yo'), false, 'las de otros lectores no');
  assert.equal(N.porRevisar({ ...base, autor: null }, 'yo'), true, 'las sin autor sí');
  assert.equal(N.porRevisar({ ...base, autor: 'otra' }, null), false, 'sin identidad, las de otros lectores tampoco');
  assert.equal(N.porRevisar({ ...base, autor: null }, null), true, 'sin identidad, las sin autor sí');
  assert.equal(N.porRevisar({ id: 'y', nota: 'sin respuesta' }, 'yo'), false);
  const sinFecha = { id: 'z', cierre: 'pregunta', respuesta: '¿?' };
  assert.equal(
    N.porRevisar({ ...sinFecha, revisado: N.marcaRevision(sinFecha, '2026-10-01T00:00:00Z') }, null),
    false,
    'sin fecha de respuesta, revisada es revisada'
  );
  assert.ok(N.CAMPOS_LECTOR.includes('revisado'), 'revisado viaja con los borradores');
});

test('vecina: siguiente y anterior, con o sin actual, y los bordes', () => {
  const L = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(N.vecina(L, 'b', 1), 2);
  assert.equal(N.vecina(L, 'b', -1), 0);
  assert.equal(N.vecina(L, 'c', 1), -1);
  assert.equal(N.vecina(L, 'a', -1), -1);
  assert.equal(N.vecina(L, null, 1), 0);
  assert.equal(N.vecina(L, 'fuera', -1), 2);
  assert.equal(N.vecina([], null, 1), -1);
  // la actual salió de la lista (un filtro): se sigue desde su lugar en el orden, no desde el principio
  const orden = { de: (x) => x.k, clave: 2 };
  const M = [
    { id: 'a', k: 1 },
    { id: 'c', k: 3 },
    { id: 'd', k: 4 },
  ];
  assert.equal(N.vecina(M, 'b', 1, orden), 1);
  assert.equal(N.vecina(M, 'b', -1, orden), 0);
  assert.equal(N.vecina(M, 'e', 1, { de: (x) => x.k, clave: 5 }), -1);
  assert.equal(N.vecina(M, 'z', -1, { de: (x) => x.k, clave: 0 }), -1);
});

test('apilar: cada ficha a la altura de su pasaje, sin pisarse, y la activa manda', () => {
  const items = [
    { id: 'a', y: 100, h: 50 },
    { id: 'b', y: 120, h: 50 },
    { id: 'c', y: 400, h: 30 },
    { id: 'd', y: null, h: 20 },
  ];
  const sin = N.apilar(items, null, 10).tops;
  assert.deepEqual(sin, { a: 100, b: 160, c: 400, d: 440 });
  const conB = N.apilar(items, 'b', 10).tops;
  assert.equal(conB.b, 120, 'la activa queda junto a su pasaje');
  assert.equal(conB.a, 60, 'la de arriba sube para dejarle sitio');
  assert.equal(conB.c, 400);
  const r = N.apilar(
    [
      { id: 'x', y: 0, h: 40 },
      { id: 'y', y: 0, h: 40 },
    ],
    'y',
    8
  );
  assert.deepEqual(r.tops, { x: -48, y: 0 });
  assert.equal(r.alto, 40);
});

test('propuesta: el texto que un subrayado propone, salvo vacío o igual a la cita', () => {
  const s = { id: 'a', tipo: 'subrayado', cita: 'lo que se observó' };
  assert.equal(N.propuesta({ ...s, sugerencia: ' lo observado ' }), 'lo observado');
  assert.equal(N.propuesta({ ...s, sugerencia: 'lo que se observó ' }), '');
  assert.equal(N.propuesta({ ...s, sugerencia: '' }), '');
  assert.equal(N.propuesta(s), '');
  assert.equal(N.propuesta({ id: 'b', tipo: 'pagina', sugerencia: 'x' }), '', 'sólo los subrayados proponen');
});
