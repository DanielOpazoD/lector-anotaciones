// Estado de la vista (nucleo/58-vista.js): una sola fuente, reglas al cambiar y avisos a quien escucha.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cargarNucleo } from './nucleo.mjs';

const N = cargarNucleo();

test('cambiar: aplica, devuelve lo que cambió y avisa sólo a quien escucha esas claves', () => {
  const V = N.crearVista();
  assert.equal(V.estado.tab, 'capitulo');
  const vistos = [];
  V.alCambiar(['tab'], (c) => vistos.push(['tab', c]));
  V.alCambiar(null, (c) => vistos.push(['todo', c]));
  assert.deepEqual(V.cambiar({ tab: 'todas', filtro: 'duda' }), ['tab', 'filtro']);
  assert.deepEqual(vistos, [
    ['tab', ['tab', 'filtro']],
    ['todo', ['tab', 'filtro']],
  ]);
  assert.deepEqual(V.cambiar({ tab: 'todas' }), [], 'sin cambio, sin aviso');
  assert.equal(vistos.length, 2);
  V.cambiar({ filtro: 'todas' });
  assert.equal(vistos.length, 3, 'filtro no interesa al oyente de tab');
});

test('regla: salir de «Por revisar» por cualquier camino vacía lo revisado', () => {
  const V = N.crearVista();
  V.cambiar({ tab: 'revisar' });
  assert.equal(V.revisada('a'), true);
  assert.equal(V.revisada('a'), false, 'ya estaba');
  V.cambiar({ fichaFoco: 'a' });
  assert.deepEqual(V.estado.revisadas, { a: 1 }, 'cambiar otra cosa no la vacía');
  assert.deepEqual(V.cambiar({ tab: 'buscar' }), ['tab', 'revisadas']);
  assert.deepEqual(V.estado.revisadas, {});
});

test('quitarFiltros, claves desconocidas y dejar de escuchar', () => {
  const V = N.crearVista({ filtro: 'duda', filtroAutor: 'u', filtroEtiqueta: 'x' });
  let n = 0;
  const fuera = V.alCambiar(['filtro'], () => n++);
  assert.deepEqual(V.quitarFiltros(), ['filtro', 'filtroAutor', 'filtroEtiqueta']);
  fuera();
  V.cambiar({ filtro: 'notas' });
  assert.equal(n, 1);
  assert.throws(() => V.cambiar({ tabb: 'x' }), /clave desconocida/);
});
