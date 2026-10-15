// Pruebas del núcleo de la página (lógica pura, sin navegador): node --test 'tests/js/**/*.test.js'
import test from 'node:test';
import assert from 'node:assert/strict';
import { cargarNucleo } from './nucleo.mjs';

const N = cargarNucleo();
const T = N, D = N, U = N, B = N;

test('slug coincide con util.slug del paquete Python', () => {
  // Valores calculados con lector_anotaciones.util.slug
  const esperado = {
    'Capítulo 1. El hecho clínico': 'capitulo-1-el-hecho-clinico',
    'Ñandú & cía.': 'nandu-cia',
    '  ¿Qué?  ': 'que',
    '': 's',
    'Ελληνικά': 's',
    'Hechos, inferencias e incertidumbre: metacognición, lenguaje y decisión clínica': 'hechos-inferencias-e-incertidumbre-metac',
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
  assert.deepEqual(d, [['=', 'el '], ['-', 'perro'], ['+', 'gato'], ['=', ' come pan']]);
  const largo = Array(600).fill('x').join(' ');
  assert.deepEqual(D.diffPalabras(largo, largo + ' y'), [['-', largo], ['+', largo + ' y']], 'demasiado grande: no compara');
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
  const ctx = libroDePrueba({ 'c-b1': 'otro texto', 'c-b2': 'cuadro habitual, manejo habitual', 'c-b3': 'tras el cuadro habitual, manejo distinto' });
  const a = { tipo: 'subrayado', pid: 'c-b1', inicio: 0, fin: 15, cita: 'cuadro habitual', antes: 'tras el ', despues: ', manejo distinto' };
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

test('ubicar: lo que no es subrayado no se ubica', () => {
  assert.equal(U.ubicarEn({ tipo: 'general' }, libroDePrueba({})), null);
});

test('marcarCampos suma sólo los campos del lector que cambiaron', () => {
  const m = B.marcarCampos({}, { nota: 'a', color: 'duda', respuesta: 'x' }, { nota: 'b', color: 'duda', respuesta: 'y' });
  assert.deepEqual(m, { nota: true });
});

test('fundirBorrador: el borrador aporta sus campos y la base el resto', () => {
  const base = { id: 'x', nota: 'vieja', replica: 'nueva de otra sesión', respuesta: 'r', estado: 'resuelta', editado: '1' };
  const borrador = { id: 'x', nota: 'mía', replica: 'vieja', estado: 'abierta', editado: '2' };
  assert.deepEqual(B.fundirBorrador(base, borrador, { nota: true }), { id: 'x', nota: 'mía', replica: 'nueva de otra sesión', respuesta: 'r', estado: 'resuelta', editado: '2' });
  // sin lista de campos: sólo textos, nunca color ni estado
  assert.equal(B.fundirBorrador(base, borrador, null).estado, 'resuelta');
});
