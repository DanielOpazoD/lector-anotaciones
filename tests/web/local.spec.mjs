// Sin base: anotar, guardar en el navegador y reubicar tras un cambio del libro.
import { check, pulsar, enFicha, seleccionar, libroAlterado, conRepetidos, sinErrores, test } from './ayudas.mjs';

// El libro de ejemplo con cuatro párrafos más al final del capítulo 1 (la misma cita con contextos distintos), sin base,
// abierto sin sección en la dirección y ya diciendo «Sin base compartida». Con el portapapeles desde el principio: la
// página sólo lo usa al copiar.
async function sinBaseLista(abrir) {
  const p = await abrir({
    hash: '',
    permisos: ['clipboard-read', 'clipboard-write'],
    preparar: (p) => libroAlterado(p, conRepetidos),
  });
  await p.waitForFunction(() => /Sin base compartida/.test(document.querySelector('#estado').textContent));
  return p;
}

test('Sin base: el título de la pestaña y el índice salen de libro.json, y se abre en la primera sección de nivel 2', async ({
  abrir,
}) => {
  const p = await sinBaseLista(abrir);
  check((await p.title()).startsWith('Lector · '), 'el título de la pestaña sale de libro.json');
  check((await p.$$('nav a.sec')).length >= 5, 'el índice lista las secciones');
  const abierta = await p.$eval('article.seccion:not([hidden]) h1', (h) => h.textContent);
  check(/^Capítulo 1\./.test(abierta), `se abre en la primera sección de nivel 2 (${abierta})`);
  sinErrores(p, 'al abrir sin base', { consola: true });
});

// ------------------------------------------------------------ un subrayado y una nota de la sección
// Un subrayado en «revisar» de los primeros 20 caracteres del primer párrafo, con la barra de selección, y una nota de
// la sección. Devuelve el bloque subrayado, lo guardado en el navegador (clave y anotaciones) y el subrayado guardado.
async function anotadas(abrir) {
  const p = await sinBaseLista(abrir);
  const pid = await seleccionar(p);
  await p.waitForSelector('#sel-tb', { state: 'visible' });
  await p.click('#sel-tb .col-btn[data-c="revisar"]');
  await p.waitForSelector(`[data-pid="${pid}"] mark.hl.c-revisar`);
  await pulsar(p, '#b-nota-cap');
  await p.waitForSelector('.ficha textarea');
  await p.fill('.ficha textarea', 'Nota de prueba de la sección');
  await p.$eval('.ficha textarea', (t) => t.blur());
  const guardado = await p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^lector-anotaciones:[a-z0-9-]+$/.test(x));
    return { clave: k, anots: Object.values(JSON.parse(localStorage.getItem(k) || '{}')) };
  });
  return { p, pid, guardado, sub: guardado.anots.find((a) => a.tipo === 'subrayado') };
}

test('Subrayar y anotar la sección: lo guardado lleva color, bloque, archivo:línea, cita, versión del libro y sección', async ({
  abrir,
}) => {
  const { p, pid, guardado, sub } = await anotadas(abrir);
  // `anotadas` esperó a que la marca se pintara con su color
  check(true, 'subrayar pinta una marca con el color elegido');
  check(/^lector-anotaciones:[a-z0-9-]+$/.test(guardado.clave), `clave local por libro (${guardado.clave})`);
  check(guardado.anots.length === 2, `dos anotaciones guardadas (${guardado.anots.length})`);
  const cap = guardado.anots.find((a) => a.tipo === 'capitulo');
  check(
    sub && sub.color === 'revisar' && sub.pid === pid && /:\d+$/.test(sub.src) && sub.cita.length === 20,
    'el subrayado lleva color, bloque, archivo:línea y cita exacta'
  );
  check(
    sub && typeof sub.libro === 'string' && sub.libro.length >= 10,
    `la anotación registra la versión del libro (${sub && sub.libro})`
  );
  check(
    cap && cap.nota === 'Nota de prueba de la sección' && cap.sid,
    'la nota de sección guarda su texto y su sección'
  );
  sinErrores(p, 'al subrayar y anotar', { consola: true });
});

test('Tras recargar, el subrayado vuelve; los filtros, la búsqueda y «Copiar todo (JSON)» cuentan con lo guardado', async ({
  abrir,
}) => {
  const { p, pid } = await anotadas(abrir);
  await p.reload();
  await p.waitForSelector(`[data-pid="${pid}"] mark.hl.c-revisar`);
  check(true, 'tras recargar, el subrayado vuelve a pintarse');
  await pulsar(p, '.filtro[data-f="notas"]');
  check((await p.$$('.ficha')).length === 1, 'el filtro «notas de página/sección» deja una ficha');
  await pulsar(p, '.filtro[data-f="todas"]');
  check((await p.$$('.ficha')).length === 2, 'el filtro «todas» muestra las dos');
  await p.fill('#buscar', 'inferencia');
  await p.press('#buscar', 'Enter');
  await p.waitForSelector('.res');
  check((await p.$$('.res')).length >= 1, 'la búsqueda encuentra coincidencias');
  await pulsar(p, '#b-copiar');
  const copiado = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const json = (() => {
    try {
      return JSON.parse(copiado);
    } catch {
      return null;
    }
  })();
  check(
    json && Array.isArray(json.anotaciones) && json.anotaciones.length === 2,
    'Copiar todo (JSON) produce {libro, anotaciones[]}'
  );
  sinErrores(p, 'al recargar, filtrar, buscar y exportar', { consola: true });
});

test('«Copiar» en una ficha da su referencia y la cita; en la barra de selección, la referencia y el texto', async ({
  abrir,
}) => {
  const { p, sub } = await anotadas(abrir);
  await p.click('.tab[data-tab="todas"]');
  await enFicha(p, `.ficha[data-id="${sub.id}"]`, 'button:has-text("Copiar")');
  const unaCopia = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    unaCopia.startsWith('[revisar] ') && unaCopia.includes(`· ${sub.src}`) && unaCopia.includes(`«${sub.cita}»`),
    'Copiar en una ficha da color, sección, página, archivo:línea y la cita'
  );
  await seleccionar(p, 25);
  await p.waitForSelector('#sel-tb', { state: 'visible' });
  await p.click('#sel-copiar');
  const selCopia = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    /^\[Capítulo 1\..*· 00_preliminares\.md:\d+\]\n«.{25}»$/.test(selCopia),
    `Copiar en la barra de selección da la referencia y el texto (${JSON.stringify(selCopia).slice(0, 80)}…)`
  );
  sinErrores(p, 'al copiar una ficha y una selección', { consola: true });
});

// ------------------------------------------------------------ reubicación tras reconstruir el libro
// Sobre lo de `anotadas`, se simula lo que pasa al reconstruir libro.json: la misma cita con desplazamientos viejos, la
// misma cita atribuida al bloque siguiente (un párrafo insertado antes), y una cita que ya no existe; luego se recarga.
async function reubicadas(abrir) {
  const { p, pid, guardado, sub } = await anotadas(abrir);
  const pidSiguiente = await p.evaluate((pid) => {
    const todos = Array.from(document.querySelectorAll('article.seccion:not([hidden]) p.bloque[data-pid]')).map((b) =>
      b.getAttribute('data-pid')
    );
    return todos[todos.indexOf(pid) + 1];
  }, pid);
  await p.evaluate(
    ({ clave, pid, pidSiguiente }) => {
      const j = JSON.parse(localStorage.getItem(clave));
      const s = Object.values(j).find((a) => a.tipo === 'subrayado');
      const movida = Object.assign({}, s, { id: 'movida', inicio: s.inicio + 7, fin: s.fin + 7 });
      // atribuida al bloque siguiente y con otra huella (el bloque cambió): se busca por la cita y lo dice
      const corrida = Object.assign({}, s, {
        id: 'corrida',
        pid: pidSiguiente,
        src: 'viejo.md:1',
        color: 'duda',
        bh: 'viejo0000000',
      });
      // atribuida al bloque siguiente pero con la huella de su bloque, que no cambió (sólo se le corrió el id): exacta
      const desplazada = Object.assign({}, s, { id: 'desplazada', pid: pidSiguiente, src: 'viejo.md:2' });
      const perdida = Object.assign({}, s, {
        id: 'perdida',
        cita: 'frase que no existe en ningún bloque del libro',
        color: 'cortar',
      });
      // «Dar por hecho» aparece en tres ítems de la lista del capítulo 1 y en ningún otro sitio: sin contexto es ambigua
      const repetida = Object.assign({}, s, {
        id: 'repetida',
        pid: 'cap-01-b99',
        cita: 'Dar por hecho',
        antes: '',
        despues: '',
        inicio: 0,
        fin: 13,
        color: 'duda',
      });
      // con contexto, una cita repetida se encuentra aunque otra igual aparezca en un bloque anterior
      const txtSig = document.querySelector('[data-pid="' + pidSiguiente + '"]').textContent;
      const conctx = Object.assign({}, s, {
        id: 'conctx',
        pid: 'cap-01-b99',
        cita: txtSig.slice(3, 20),
        antes: txtSig.slice(0, 3),
        despues: txtSig.slice(20, 50),
        inicio: 3,
        fin: 20,
        color: 'conservar',
      });
      // la cita aparece sin su contexto en tres bloques anteriores y con él en el cuarto: hay que recorrerlos todos
      const triple = Object.assign({}, s, {
        id: 'triple',
        cita: 'la inferencia tramposa',
        antes: 'Contexto previo ',
        despues: ' contexto posterior',
        inicio: 0,
        fin: 22,
        color: 'duda',
      });
      j.movida = movida;
      j.corrida = corrida;
      j.desplazada = desplazada;
      j.perdida = perdida;
      j.repetida = repetida;
      j.conctx = conctx;
      j.triple = triple;
      localStorage.setItem(clave, JSON.stringify(j));
    },
    { clave: guardado.clave, pid, pidSiguiente }
  );
  await p.reload();
  await p.waitForSelector(`[data-pid="${pid}"] mark.hl`);
  await pulsar(p, '.filtro[data-f="todas"]');
  return { p, pid, pidSiguiente, clave: guardado.clave, sub };
}

test('Reubicación: la marca vuelve a su cita aunque el bloque o la posición se hayan corrido, y no adivina la que no está o es ambigua', async ({
  abrir,
}) => {
  const { p, pid, pidSiguiente, sub } = await reubicadas(abrir);
  const marcas = await p.$$eval(`[data-pid="${pid}"] mark.hl`, (ms) =>
    ms.map((m) => ({ ids: m.getAttribute('data-aids').split(' '), texto: m.textContent }))
  );
  const cubren = (id) =>
    marcas
      .filter((m) => m.ids.includes(id))
      .map((m) => m.texto)
      .join('');
  check(
    cubren('movida') === sub.cita,
    `con desplazamientos viejos, la marca vuelve a cubrir la cita exacta («${cubren('movida')}»)`
  );
  check(cubren('corrida') === sub.cita, 'atribuida al bloque siguiente, la marca vuelve al bloque donde está la cita');
  check(cubren('desplazada') === sub.cita, 'con el id corrido y el bloque intacto, la huella la devuelve a su bloque');
  check(cubren('perdida') === '', 'una cita que ya no existe no pinta nada');
  check(cubren('repetida') === '', 'una cita corta que aparece en varios bloques sin contexto no se adivina');
  const marcasCtx = await p.$$eval('article.seccion:not([hidden]) mark.hl', (ms) =>
    ms
      .filter((m) => m.getAttribute('data-aids').split(' ').includes('conctx'))
      .map((m) => m.closest('[data-pid]').getAttribute('data-pid'))
  );
  check(
    marcasCtx.length === 1 && marcasCtx[0] === pidSiguiente,
    `una cita repetida pero con contexto se reubica en el bloque correcto aunque otro igual aparezca antes (${marcasCtx.join(',')})`
  );
  const corridaEnSiguiente = await p.$$eval(
    `[data-pid="${pidSiguiente}"] mark.hl`,
    (ms) => ms.filter((m) => m.getAttribute('data-aids').split(' ').includes('corrida')).length
  );
  check(corridaEnSiguiente === 0, 'y la anotación corrida no se pinta en el bloque equivocado');
  const marcasTriple = await p.$$eval('article.seccion:not([hidden]) mark.hl', (ms) =>
    ms
      .filter((m) => m.getAttribute('data-aids').split(' ').includes('triple'))
      .map((m) => m.closest('[data-pid]').getAttribute('data-pid'))
  );
  check(
    marcasTriple.length === 1 && marcasTriple[0] === 'cap-01-b93',
    `una cita repetida sin contexto en tres bloques se reubica en el cuarto, donde el contexto coincide (${marcasTriple.join(',') || 'ninguna'})`
  );
  sinErrores(p, 'al reubicar las marcas', { consola: true });
});

test('Reubicación: las fichas dicen si se reubicaron o se perdieron, y lo guardado no cambia', async ({ abrir }) => {
  const { p, pidSiguiente, clave, sub } = await reubicadas(abrir);
  const avisos = await p.$$eval('.ficha', (fs) =>
    fs.map((f) => [f.getAttribute('data-id'), (f.querySelector('.aviso-ubic') || {}).textContent || ''])
  );
  const aviso = (id) => (avisos.find((x) => x[0] === id) || [])[1] || '';
  check(
    /^Reubicado/.test(aviso('movida')) && /^Reubicado/.test(aviso('corrida')) && /otro bloque/.test(aviso('corrida')),
    'las fichas reubicadas lo dicen'
  );
  check(/^No encontrado/.test(aviso('perdida')), 'la ficha perdida lo dice y conserva la cita');
  check(
    aviso('desplazada') === '',
    `si sólo se corrió el id de su bloque (mismo texto, misma huella), la ficha no lleva aviso (${aviso('desplazada')})`
  );
  check(aviso(sub.id) === '', 'la anotación intacta no lleva aviso');
  const guardadoDespues = await p.evaluate((clave) => JSON.parse(localStorage.getItem(clave)), clave);
  check(
    guardadoDespues.movida.inicio === sub.inicio + 7 && guardadoDespues.corrida.pid === pidSiguiente,
    'la reubicación no modifica lo guardado'
  );
  sinErrores(p, 'con los avisos de reubicación', { consola: true });
});

test('«Copiar» en una ficha reubicada da el bloque de hoy y lo dice; en la perdida, la referencia original', async ({
  abrir,
}) => {
  const { p, sub } = await reubicadas(abrir);
  await enFicha(p, '.ficha[data-id="corrida"]', 'button:has-text("Copiar")');
  const copiaCorrida = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    copiaCorrida.startsWith(`[duda] ${sub.sidTitulo} ·`) &&
      copiaCorrida.includes(`· ${sub.src} ·`) &&
      copiaCorrida.includes('reubicado') &&
      copiaCorrida.includes('(antes viejo.md:1)'),
    `Copiar en una ficha reubicada da el bloque actual y avisa (${JSON.stringify(copiaCorrida).slice(0, 110)}…)`
  );
  await enFicha(p, '.ficha[data-id="desplazada"]', 'button:has-text("Copiar")');
  const copiaDesplazada = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    copiaDesplazada.includes(`· ${sub.src}\n`) &&
      !copiaDesplazada.includes('reubicado') &&
      !copiaDesplazada.includes('viejo.md'),
    `Copiar en una ficha cuyo bloque sólo cambió de id da el bloque actual, sin aviso (${JSON.stringify(copiaDesplazada).slice(0, 90)}…)`
  );
  await enFicha(p, '.ficha[data-id="perdida"]', 'button:has-text("Copiar")');
  const copiaPerdida = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    copiaPerdida.includes('no encontrado en esta versión del libro') && copiaPerdida.includes(`· ${sub.src}`),
    'Copiar en una ficha perdida conserva la referencia original y lo declara'
  );
  sinErrores(p, 'al copiar fichas reubicadas', { consola: true });
});
