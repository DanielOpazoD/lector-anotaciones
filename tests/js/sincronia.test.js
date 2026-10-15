// Sincronía de las anotaciones (nucleo/65-sincronia.js): las decisiones que antes sólo se probaban en el navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cargarNucleo } from './nucleo.mjs';

const N = cargarNucleo();
const T0 = '2026-10-01T00:00:00.000Z',
  T1 = '2026-10-02T00:00:00.000Z',
  T2 = '2026-10-03T00:00:00.000Z';
const anot = (id, extra = {}) => ({ id, tipo: 'general', nota: 'n', estado: 'abierta', creado: T0, ...extra });

test('cambiar: una nueva no tiene versión previa; una que la base tiene, sí, y marca los campos del lector', () => {
  const S = N.crearSincronia();
  const r1 = S.cambiar(anot('a'), T1);
  assert.deepEqual(r1, { previa: null, nueva: true });
  S.enBase.a = 1;
  const r2 = S.cambiar({ ...S.anots.a, nota: 'otra', color: 'duda' }, T2);
  assert.equal(r2.nueva, false);
  assert.equal(r2.previa.nota, 'n', 'la previa es una copia de lo que había');
  assert.deepEqual(S.campos.a, { nota: true, color: true });
  assert.equal(S.anots.a.editado, T2);
});

test('escritura: set para lo que la base no tiene; update con sólo los campos del lector para lo que sí', () => {
  const S = N.crearSincronia();
  S.cambiar(anot('a'), T1);
  assert.equal(S.escritura('a').modo, 'set');
  S.alConfirmar('a', S.anots.a);
  S.cambiar({ ...S.anots.a, estado: 'resuelta', revisado: 'r1' }, T2);
  const e = S.escritura('a');
  assert.equal(e.modo, 'update');
  assert.deepEqual(e.datos, { editado: T2, estado: 'resuelta', revisado: 'r1' }, 'ni respuesta ni cierre: no se pisan');
  S.sinGuardar.a = 'unavailable';
  assert.equal(S.escritura('a').modo, 'set', 'una conservada «sin guardar» sube entera');
  assert.equal(S.escritura('nada'), null);
});

test('alConfirmar: la base la tiene, las marcas confirmadas se limpian y la copia local sobra si no se editó después', () => {
  const S = N.crearSincronia();
  S.cambiar(anot('a'), T1);
  S.sinGuardar.a = 'unavailable';
  S.enVuelo.a = 1;
  const escrita = S.anots.a;
  const r = S.alConfirmar('a', escrita);
  assert.deepEqual(r, { estabaSinGuardar: true, soltarCopia: true });
  assert.ok(S.enBase.a && !S.enVuelo.a && !S.sinGuardar.a);
  // editada mientras subía: la copia local se conserva
  S.sinGuardar.a = 'unavailable';
  S.cambiar({ ...escrita, nota: 'después' }, T2);
  assert.equal(S.alConfirmar('a', escrita).soltarCopia, false);
  assert.deepEqual(S.campos.a, { nota: true }, 'lo editado después de la escritura conserva su marca');
});

test('alRechazar: vuelve a la previa, o conserva «sin guardar» lo que la base no tiene; el permiso pasa a sólo lectura', () => {
  const S = N.crearSincronia();
  S.cambiar(anot('a'), T1);
  S.alConfirmar('a', S.anots.a);
  const { previa } = S.cambiar({ ...S.anots.a, color: 'cortar' }, T2);
  const r1 = S.alRechazar('a', 'quota_exceeded', previa, 'guardar');
  assert.equal(S.anots.a.color, undefined, 'vuelve a lo que la base tiene');
  assert.deepEqual(r1, { permiso: false, conservada: false, restaurada: previa });
  assert.equal(S.campos.a, undefined);
  S.cambiar(anot('b'), T1);
  const r2 = S.alRechazar('b', 'not_granted', null, 'guardar');
  assert.ok(r2.permiso && r2.conservada);
  assert.equal(S.sinGuardar.b, 'not_granted');
  assert.ok(S.anots.b && S.pendientes.includes('b'), 'lo nuevo no se retira: queda en memoria y en la cola');
  assert.equal(
    S.alRechazar('c', 'invalid_argument', { nota: 'x'.repeat(300000) }, 'guardar').permiso,
    false,
    'demasiado grande no es permiso'
  );
  assert.equal(S.alRechazar('c', 'invalid_argument', null, 'respaldo').permiso, false);
});

test('esTransitorio: unavailable, resource_exhausted, sin código o desconocido; lo demás, no', () => {
  for (const c of ['unavailable', 'resource_exhausted', undefined, 'algo_nuevo'])
    assert.equal(N.esTransitorio(c), true, c);
  for (const c of ['not_granted', 'quota_exceeded', 'invalid_argument', 'revoked'])
    assert.equal(N.esTransitorio(c), false, c);
});

test('quitar y alBorrar: devuelve lo necesario para deshacer y limpia la cola y las marcas', () => {
  const S = N.crearSincronia();
  S.cambiar(anot('a'), T1);
  S.alConfirmar('a', S.anots.a);
  S.cambiar({ ...S.anots.a, color: 'duda' }, T2);
  S.sinGuardar.a = 'unavailable';
  S.pendientes.push('a');
  const q = S.quitar('a');
  assert.deepEqual(q.campos, { color: true });
  assert.equal(q.marca, 'unavailable');
  assert.ok(!S.anots.a && !S.sinGuardar.a);
  S.alBorrar('a');
  assert.ok(!S.enBase.a && !S.pendientes.includes('a') && !S.campos.a);
  assert.equal(S.quitar('nada'), null);
});

test('alFoto: entra lo nuevo, sale lo borrado, y un borrador sin guardar se funde encima de lo que llega', () => {
  const S = N.crearSincronia();
  assert.equal(S.alFoto([{ tipo: 'added', id: 'a', datos: anot('a') }]), true);
  assert.ok(S.enBase.a);
  assert.equal(S.alFoto([{ tipo: 'modified', id: 'a', datos: anot('a') }]), false, 'el eco idéntico no cambia nada');
  S.cambiar({ ...S.anots.a, nota: 'mía' }, T2);
  S.sinGuardar.a = 'unavailable';
  S.alFoto([{ tipo: 'modified', id: 'a', datos: anot('a', { respuesta: 'Hecho.', cierre: 'atendida' }) }]);
  assert.equal(S.anots.a.nota, 'mía', 'el borrador del lector no se pisa');
  assert.equal(S.anots.a.respuesta, 'Hecho.', 'y lo que escribió quien edita entra');
  assert.equal(S.alFoto([{ tipo: 'removed', id: 'a' }]), true);
  assert.ok(!S.anots.a && !S.enBase.a);
});

test('fusionarLocal: manda la memoria salvo un borrador local más reciente, que se funde; el filtro deja fuera lo ajeno', () => {
  const S = N.crearSincronia();
  S.alFoto([{ tipo: 'added', id: 'a', datos: anot('a', { editado: T1, respuesta: 'Base.' }) }]);
  S.alFoto([{ tipo: 'added', id: 'b', datos: anot('b', { editado: T2 }) }]);
  const local = {
    a: anot('a', { editado: T2, nota: 'local' }),
    b: anot('b', { editado: T1, nota: 'vieja' }),
    c: anot('c', { autor: 'otra' }),
    d: anot('d'),
  };
  const r = S.fusionarLocal(local, { a: { nota: true } }, (id, x) => x.autor !== 'otra');
  assert.deepEqual(r, { nuevas: ['a', 'd'], existentes: ['b'] });
  assert.equal(S.anots.a.nota, 'local');
  assert.equal(S.anots.a.respuesta, 'Base.', 'lo de la base se conserva bajo el borrador');
  assert.equal(S.anots.b.nota, 'n', 'una copia local más vieja no pisa la memoria');
  assert.ok(!S.anots.c, 'lo de otra cuenta queda fuera');
  assert.deepEqual(S.campos.a, { nota: true });
});

test('subida inicial: la cola recibe lo recuperado, sube con autor y separa lo que subió de lo que falló', () => {
  const S = N.crearSincronia();
  S.alFoto([{ tipo: 'added', id: 'a', datos: anot('a') }]);
  S.cambiar(anot('x'), T1);
  S.pendientes.push('x');
  const sobran = S.alRecuperar({ nuevas: ['y'], existentes: ['a', 'x'] });
  assert.deepEqual(sobran, ['a'], 'lo que la base ya tenía sobra en la copia local');
  S.anots.y = anot('y');
  const ids = S.tomarPendientes('u_me');
  assert.deepEqual(ids, ['x', 'y']);
  assert.equal(S.anots.x.autor, 'u_me');
  assert.deepEqual(S.pendientes, []);
  const escritas = { x: S.anots.x, y: S.anots.y };
  S.anots.y = { ...S.anots.y, nota: 'editada mientras subía' };
  const r = S.alSubir(ids, [true, true], escritas);
  assert.deepEqual(r, { soltar: ['x'], fallidas: [] });
  const r2 = S.alSubir(['z'], ['unavailable'], { z: anot('z') });
  assert.deepEqual(r2.fallidas, ['z']);
  assert.equal(S.sinGuardar.z, 'unavailable');
});

test('sólo lectura: lo que espera subir queda «sin guardar»', () => {
  const S = N.crearSincronia();
  S.cambiar(anot('a'), T1);
  S.pendientes.push('a', 'fantasma');
  assert.deepEqual(S.marcarSinSubir(), ['a']);
  assert.equal(S.sinGuardar.a, 'sólo lectura');
});

test('migrarClaves: copia lo de claves anteriores sin pisar lo que ya hay', () => {
  const local = { a: anot('a', { nota: 'actual' }) };
  const n = N.migrarClaves(local, { vieja: { a: anot('a', { nota: 'vieja' }), b: anot('b') }, otra: null });
  assert.equal(n, 1);
  assert.equal(local.a.nota, 'actual');
  assert.ok(local.b);
});
