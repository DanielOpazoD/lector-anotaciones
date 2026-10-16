// «Copiar diagnóstico»: lo que hace falta para entender un problema sin ver la pantalla. Los fallos que la página pasa
// por alto a propósito (un almacenamiento bloqueado, una voz que no está…) ya no se pierden: quedan en el diagnóstico.
import fs from 'node:fs';
import path from 'node:path';

import { check, esperar, pulsar, seleccionarTexto, test } from './ayudas.mjs';

const VERSION = /^version = "([^"]+)"/m.exec(fs.readFileSync(path.resolve('pyproject.toml'), 'utf8'))[1];

test('«Copiar diagnóstico» lleva la versión, el estado y los fallos pasados por alto, sin el texto de las notas', async ({
  abrir,
}) => {
  const p = await abrir({
    permisos: ['clipboard-read', 'clipboard-write'],
    // un navegador que no deja reescribir la dirección: la página sigue, y el fallo queda anotado
    previo: [
      () => {
        history.replaceState = () => {
          throw new Error('replaceState bloqueado');
        };
      },
    ],
  });
  await seleccionarTexto(p, 'Un hecho es lo que se observó');
  await p.keyboard.press('n');
  await p.keyboard.type('Una nota que no debe salir del navegador');
  await p.keyboard.press('Escape');
  await p.focus('#lectura');
  await p.keyboard.press('j');
  await esperar(p, () => document.querySelector('article.seccion:not([hidden])').id === 'sec-cap-02');
  await pulsar(p, '#b-diagnostico');
  const texto = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const lineas = texto.split('\n');
  check(lineas[0].startsWith('Diagnóstico del lector de anotaciones ('), `empieza por lo que es (${lineas[0]})`);
  check(texto.includes(`Página: lector-anotaciones ${VERSION}\n`), `dice la versión de la página (${lineas[1]})`);
  check(/\nLibro: Libro de ejemplo \(libro-de-ejemplo, generado /.test(texto), `dice qué libro (${lineas[2]})`);
  check(/\nAnotaciones: 1 · sin guardar: 0 · /.test(texto), `cuenta las anotaciones (${lineas[4]})`);
  check(
    lineas.some((l) => /^- \S+ · historial: replaceState bloqueado$/.test(l)),
    `lleva el fallo que la página pasó por alto (${JSON.stringify(lineas.slice(7))})`
  );
  check(!texto.includes('Una nota que no debe salir'), 'no lleva el texto de las anotaciones');
  check(
    (await p.evaluate(() => document.querySelector('article.seccion:not([hidden])').id)) === 'sec-cap-02',
    'el fallo no impidió cambiar de sección'
  );
});

// La base la escribe cualquier colaborador: un documento sin forma de anotación no entra (ni rompe el panel de los
// demás) y queda en el diagnóstico.
test('Un documento de la base sin forma de anotación no entra, no rompe el panel y queda en el diagnóstico', async ({
  abrir,
}) => {
  const p = await abrir({
    modo: 'con-base',
    permisos: ['clipboard-read', 'clipboard-write'],
    semilla: {
      bien: { id: 'bien', tipo: 'general', nota: 'Una nota que sí', estado: 'abierta', creado: '2026-10-01T00:00:00Z' },
      malo: { id: 'malo', tipo: 'subrayado', pid: 'cap-01-b1', inicio: 0, fin: 4, color: 'duda', nota: 'sin cita' },
    },
  });
  await p.click('.tab[data-tab="todas"]');
  const fichas = await p.$$eval('#lista .ficha', (fs) => fs.map((f) => f.getAttribute('data-id')));
  check(fichas.join() === 'bien', `el panel muestra lo válido y deja fuera lo otro (${JSON.stringify(fichas)})`);
  await pulsar(p, '#b-diagnostico');
  const texto = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    texto.includes('· base: malo no es una anotación válida: subrayado sin pasaje o sin cita'),
    `el diagnóstico dice qué documento no entró y por qué (${JSON.stringify(texto.split('\n').slice(7))})`
  );
});
