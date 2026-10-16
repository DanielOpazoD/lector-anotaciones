// «Copiar diagnóstico»: lo que hace falta para entender un problema sin ver la pantalla. Los fallos que la página pasa
// por alto a propósito (un almacenamiento bloqueado, una voz que no está…) ya no se pierden: quedan en el diagnóstico.
import fs from 'node:fs';
import path from 'node:path';

import { check, esperar, pulsar, seleccionarTexto, sinErrores, libroAlterado, CLAVE_LOCAL, test } from './ayudas.mjs';

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

// La base la escribe cualquier colaborador: lo que llega entra tal cual (la base manda) y la página lo muestra como
// puede, sin romperse; lo que no tiene la forma de una anotación queda en el diagnóstico.
const general = (id, extra) =>
  Object.assign({ id, tipo: 'general', nota: 'Nota ' + id, estado: 'abierta', creado: '2026-10-01T00:00:00Z' }, extra);
const RAROS = {
  bien: general('bien'),
  sincita: { id: 'sincita', tipo: 'subrayado', pid: 'cap-01-b1', inicio: 0, fin: 4, color: 'duda', nota: 'sin cita' },
  numeros: general('numeros', { nota: 42, replica: 7, respuesta: 3, cierre: 'pregunta', respondido: '2026-10-02' }),
  hilos: general('hilos', { hilo: [{}, 5, null], respuesta: 'r', cierre: 'atendida' }),
  hiloNulo: general('hiloNulo', { hilo: null }),
  tipoRaro: general('tipoRaro', { tipo: 'otra', color: ['a', 'b'], nota: { de: 'otro programa' } }),
  sugerencia: {
    id: 'sugerencia',
    tipo: 'subrayado',
    pid: 'cap-01-b1',
    inicio: 0,
    fin: 8,
    cita: 'Un hecho',
    sugerencia: 9,
  },
};

test('Documentos raros de la base: entran, la página los muestra sin romperse y el diagnóstico los nombra', async ({
  abrir,
}) => {
  const p = await abrir({ modo: 'con-base', permisos: ['clipboard-read', 'clipboard-write'], semilla: RAROS });
  await p.click('.tab[data-tab="todas"]');
  const fichas = await p.$$eval('#lista .ficha', (fs) => fs.map((f) => f.getAttribute('data-id')).sort());
  check(
    fichas.join() === Object.keys(RAROS).sort().join(),
    `el panel muestra todas, también las raras (${JSON.stringify(fichas)})`
  );
  await pulsar(p, '#b-copiar-md');
  const md = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(md.includes('Nota bien') && md.includes('42'), '«Copiar todo (Markdown)» funciona con ellas');
  await pulsar(p, '#b-diagnostico');
  const texto = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    texto.includes('· base: sincita no tiene la forma de una anotación: subrayado sin pasaje o sin cita') &&
      texto.includes('· base: tipoRaro no tiene la forma de una anotación: tipo desconocido: otra') &&
      !texto.includes('base: hiloNulo') &&
      !texto.includes('base: bien'),
    `el diagnóstico nombra las que no tienen la forma de una anotación, y sólo ésas (${JSON.stringify(texto.split('\n').slice(7))})`
  );
  sinErrores(p, 'con documentos raros en la base');
});

// Lo que encontró la revisión de la 0.6: dejar fuera un documento raro hacía que una copia local más vieja de la misma
// anotación subiera entera y borrara la respuesta de quien edita.
test('Un documento raro de la base no se pisa con una copia local más vieja', async ({ abrir }) => {
  const enBase = general('x1', {
    nota: 'nota que está en la base',
    estado: 'resuelta',
    editado: '2026-10-02T00:00:00.000Z',
    autor: 'u_me',
    respuesta: 'Hecho: reescrito el párrafo',
    cierre: 'atendida',
    commit: 1234567, // no es texto
    respondido: '2026-10-02T10:00:00.000Z',
  });
  const local = general('x1', { nota: 'borrador local viejo', editado: '2026-10-01T00:05:00.000Z', autor: 'u_me' });
  const p = await abrir({
    modo: 'con-base',
    semilla: { x1: enBase },
    previo: [
      [
        ([k, v]) => {
          if (location.protocol.startsWith('http')) localStorage.setItem(k, JSON.stringify(v));
        },
        [CLAVE_LOCAL, { x1: local }],
      ],
    ],
  });
  await p.waitForTimeout(600); // lo que sube al conectar, si sube, sube en seguida
  const doc = await p.evaluate(() => window.__docs.x1);
  check(
    doc.respuesta === 'Hecho: reescrito el párrafo' && doc.nota === 'nota que está en la base',
    `la base conserva la respuesta de quien edita (${JSON.stringify(doc)})`
  );
});

// Lo que encontró la revisión de la 0.6: el mensaje de un error de JSON cita un trozo de lo que se leía, y lo que se lee
// del navegador son anotaciones; el diagnóstico guarda sólo el nombre del error.
test('Un error al leer del navegador no lleva al diagnóstico el texto de una nota', async ({ abrir }) => {
  const p = await abrir({
    permisos: ['clipboard-read', 'clipboard-write'],
    // la clave de una versión anterior de la página, rota a mitad de una nota
    preparar: (p) =>
      libroAlterado(p, (L) => {
        L.claves_anteriores = ['lector-vieja'];
      }),
    previo: [
      () => {
        if (location.protocol.startsWith('http'))
          localStorage.setItem('lector-vieja', '{"x1": {"nota": "una nota muy privada sobre el paciente');
      },
    ],
  });
  await pulsar(p, '#b-diagnostico');
  const texto = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    /· claves anteriores: lector-vieja: SyntaxError/.test(texto),
    `el fallo queda anotado (${JSON.stringify(texto.split('\n').slice(7))})`
  );
  check(!/privada|paciente/.test(texto), 'sin el texto de la nota');
});
