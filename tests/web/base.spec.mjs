// Con la base compartida (simulada): escrituras, rechazos, borradores, migraciones y sólo lectura.
import fs from 'node:fs';

import {
  LIBRO,
  servir,
  check,
  esperar,
  sinBase,
  conBase,
  abrirDe,
  pulsar,
  enFicha,
  seleccionarTexto,
  seleccionar,
  libroAlterado,
  paginar,
  conCambio,
  conRepetidos,
  activo,
  CLAVE_LOCAL,
  guardadoLocal,
  test,
} from './ayudas.mjs';

let srv, base;
test.beforeAll(async () => {
  srv = await servir();
  base = `http://127.0.0.1:${srv.address().port}/`;
});
test.afterAll(() => srv.close());

test('Con base simulada: escribir sin interrupciones', async ({ browser }) => {
  const ctxDb = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxDb.addInitScript(conBase);
  const erroresDb = [];
  const pdb = await ctxDb.newPage();
  pdb.on('pageerror', (e) => erroresDb.push(String(e)));
  await pdb.goto(base);
  await pdb.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pdb.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  check(true, 'con base, la barra dice «Conectado»');
  const pidDb = await seleccionar(pdb);
  await pdb.waitForSelector('#sel-tb', { state: 'visible' });
  await pdb.click('#sel-tb .col-btn[data-c="conservar"]');
  await pdb.waitForSelector(`[data-pid="${pidDb}"] mark.hl.c-conservar`);
  await pdb.waitForFunction(() => Object.values(window.__docs).some((d) => d.tipo === 'subrayado'));
  check(true, 'el subrayado llega a la base');
  const idSub = await pdb.evaluate(() => Object.values(window.__docs).find((d) => d.tipo === 'subrayado').id);

  await pulsar(pdb, '#b-nota-cap');
  await pdb.waitForSelector('.ficha.t-capitulo textarea');
  await pdb.focus('.ficha.t-capitulo textarea');
  await pdb.keyboard.type('Primera parte de la nota', { delay: 10 });
  await pdb.waitForTimeout(1100); // pasa el guardado diferido (900 ms) y su eco
  await pdb.keyboard.type(' y sigo escribiendo', { delay: 10 });
  const activo1 = await pdb.evaluate(() => document.activeElement && document.activeElement.value);
  check(
    activo1 === 'Primera parte de la nota y sigo escribiendo',
    'el eco del guardado no quita el foco ni corta la escritura'
  );
  // Un cambio llegado de otra sesión mientras hay un borrador sin guardar
  await pdb.evaluate((id) => window.__cambioExterno(id, { color: 'duda' }), idSub);
  await pdb.waitForSelector(`[data-pid="${pidDb}"] mark.hl.c-duda`);
  const activo2 = await pdb.evaluate(() => ({
    id: document.activeElement && document.activeElement.id,
    valor: document.activeElement && document.activeElement.value,
    fin: document.activeElement && document.activeElement.selectionStart,
  }));
  check(
    /^nota-/.test(activo2.id) &&
      activo2.valor === 'Primera parte de la nota y sigo escribiendo' &&
      activo2.fin === activo2.valor.length,
    'un cambio externo redibuja el panel sin perder el editor, el borrador ni la posición del cursor'
  );
  await pdb.keyboard.type('.', { delay: 10 });
  await pdb.waitForFunction(() =>
    Object.values(window.__docs).some(
      (d) => d.tipo === 'capitulo' && d.nota === 'Primera parte de la nota y sigo escribiendo.'
    )
  );
  check(true, 'el borrador completo termina guardado en la base');
  check(
    erroresDb.length === 0,
    `sin errores de página con base${erroresDb.length ? ': ' + erroresDb.join(' | ') : ''}`
  );
  await ctxDb.close();
});

test('Migración desde una clave anterior', async ({ browser }) => {
  // Una versión anterior de la página guardaba bajo otra clave; libro.json la declara en claves_anteriores.
  const ctxMig = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxMig.addInitScript(sinBase);
  await ctxMig.addInitScript(() => {
    localStorage.setItem(
      'lector-viejo',
      JSON.stringify({
        vieja1: {
          id: 'vieja1',
          tipo: 'general',
          nota: 'Nota heredada',
          estado: 'abierta',
          creado: '2026-01-01T00:00:00.000Z',
        },
      })
    );
  });
  const pmig = await ctxMig.newPage();
  await pmig.route('**/libro.json', async (route) => {
    const L = JSON.parse(fs.readFileSync(LIBRO, 'utf8'));
    L.claves_anteriores = ['lector-viejo'];
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(L) });
  });
  await pmig.goto(base);
  await pmig.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pmig.waitForFunction(() => /recuperadas/.test(document.querySelector('#estado').textContent));
  await pmig.click('.tab[data-tab="todas"]');
  const heredada = await pmig.$$eval('.ficha textarea', (ts) => ts.map((t) => t.value));
  check(heredada.includes('Nota heredada'), 'las anotaciones de la clave anterior aparecen tras cargar');
  const claves = await pmig.evaluate(() => ({
    vieja: localStorage.getItem('lector-viejo'),
    nueva: Object.keys(localStorage).find((k) => /^lector-anotaciones:/.test(k) && !/:ultima$/.test(k)),
  }));
  check(claves.vieja === null && !!claves.nueva, 'quedan bajo la clave nueva y la vieja se retira');
  await ctxMig.close();
});

test('Migración con el almacenamiento lleno', async ({ browser }) => {
  // Si la copia nueva no se puede escribir, la clave vieja debe seguir ahí (es la única copia) y la barra avisar.
  const ctxLleno = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxLleno.addInitScript(sinBase);
  await ctxLleno.addInitScript(() => {
    localStorage.setItem(
      'lector-viejo',
      JSON.stringify({
        vieja1: {
          id: 'vieja1',
          tipo: 'general',
          nota: 'Nota heredada',
          estado: 'abierta',
          creado: '2026-01-01T00:00:00.000Z',
        },
      })
    );
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (/^lector-anotaciones:/.test(k) && !/:ultima$/.test(k))
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      return original.call(this, k, v);
    };
  });
  const plleno = await ctxLleno.newPage();
  await plleno.route('**/libro.json', async (route) => {
    const L = JSON.parse(fs.readFileSync(LIBRO, 'utf8'));
    L.claves_anteriores = ['lector-viejo'];
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(L) });
  });
  await plleno.goto(base);
  await plleno.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await plleno.waitForFunction(() => /No se pudieron guardar/.test(document.querySelector('#estado').textContent));
  const llenoEstado = await plleno.evaluate(() => ({
    vieja: localStorage.getItem('lector-viejo'),
    nueva: Object.keys(localStorage).find((k) => /^lector-anotaciones:/.test(k) && !/:ultima$/.test(k)) || null,
  }));
  check(
    llenoEstado.vieja !== null && llenoEstado.nueva === null,
    'si la copia nueva no se puede escribir, la clave vieja se conserva y la barra avisa'
  );
  await plleno.click('.tab[data-tab="todas"]');
  check(
    (await plleno.$$eval('.ficha textarea', (ts) => ts.map((t) => t.value))).includes('Nota heredada'),
    'y las anotaciones heredadas siguen visibles en esa sesión'
  );
  await ctxLleno.close();
});

test('Con base y usuario: respuesta de quien edita, lectores, respaldo', async ({ browser }) => {
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx3.addInitScript(() => {
    window.__semilla = {
      grande: {
        id: 'grande',
        tipo: 'general',
        nota: 'x'.repeat(199500),
        estado: 'resuelta',
        creado: '2026-09-30T00:00:00.000Z',
        autor: 'u_otro',
      },
      ajena: {
        id: 'ajena',
        tipo: 'general',
        nota: 'Nota de otra lectora',
        estado: 'abierta',
        creado: '2026-10-01T00:00:00.000Z',
        autor: 'u_otro',
      },
      conpregunta: {
        id: 'conpregunta',
        tipo: 'general',
        nota: '¿Conviene mover el caso?',
        estado: 'abierta',
        creado: '2026-10-02T00:00:00.000Z',
        autor: 'u_me',
        respuesta: '¿Al inicio del capítulo o al final?',
        cierre: 'pregunta',
        respondido: '2026-10-03T10:00:00.000Z',
      },
      atendida: {
        id: 'atendida',
        tipo: 'general',
        nota: 'Quitar el adjetivo',
        estado: 'resuelta',
        creado: '2026-10-02T01:00:00.000Z',
        autor: 'u_me',
        respuesta: 'Quitado en el párrafo 3.',
        cierre: 'atendida',
        commit: 'abc1234',
        respondido: '2026-10-03T10:00:00.000Z',
      },
      // comillas, saltos y emoji: 56 000 unidades UTF-16 que, escapadas dentro del respaldo, pesan 104 000 bytes; con
      // «mediana» caben en una parte por unidades (176 000 < 180 KiB) pero no por bytes (224 000)
      rara: {
        id: 'rara',
        tipo: 'general',
        nota: '"ñ\n😀'.repeat(8000),
        estado: 'abierta',
        creado: '2026-10-02T02:00:00.000Z',
        autor: 'u_me',
      },
      mediana: {
        id: 'mediana',
        tipo: 'general',
        nota: 'x'.repeat(120000),
        estado: 'abierta',
        creado: '2026-10-02T03:00:00.000Z',
        autor: 'u_me',
      },
    };
  });
  await ctx3.addInitScript(conBase);
  const p3 = await ctx3.newPage();
  const errores3 = [];
  p3.on('pageerror', (e) => errores3.push(String(e)));
  await p3.goto(base);
  await p3.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await p3.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  await p3.click('.tab[data-tab="todas"]');
  await p3.waitForFunction(() => document.querySelectorAll('.ficha').length === 6);
  const fichaPregunta = await p3.$eval('.ficha[data-id="conpregunta"]', (f) => ({
    pregunta: f.classList.contains('cierre-pregunta'),
    cierre: (f.querySelector('.cierre') || {}).textContent,
    respuesta: (f.querySelector('.respuesta') || {}).textContent,
    replica: !!f.querySelector('textarea.replica'),
  }));
  check(
    fichaPregunta.pregunta &&
      fichaPregunta.cierre === 'pregunta' &&
      /Al inicio del capítulo/.test(fichaPregunta.respuesta) &&
      fichaPregunta.replica,
    'una respuesta con pregunta se muestra con su cierre y un cuadro para replicar'
  );
  const fichaAtendida = await p3.$eval('.ficha[data-id="atendida"]', (f) => ({
    cierre: (f.querySelector('.cierre') || {}).textContent,
    quien: (f.querySelector('.respuesta .quien') || {}).textContent,
    resuelta: f.classList.contains('resuelta'),
  }));
  check(
    fichaAtendida.cierre === 'atendida' && /abc1234/.test(fichaAtendida.quien) && fichaAtendida.resuelta,
    'una anotación atendida muestra el cierre y el commit'
  );
  await p3.fill('.ficha[data-id="conpregunta"] textarea.replica', 'Al inicio.');
  await p3.$eval('.ficha[data-id="conpregunta"] textarea.replica', (t) => t.blur());
  await p3.waitForFunction(() => window.__docs.conpregunta && window.__docs.conpregunta.replica === 'Al inicio.');
  check(true, 'la réplica del autor queda guardada en la base');
  await pulsar(p3, '.filtro[data-f="preguntas"]');
  check((await p3.$$('.ficha')).length === 1, 'el filtro «preguntas» deja sólo la pregunta');
  await pulsar(p3, '.filtro[data-f="respondidas"]');
  check((await p3.$$('.ficha')).length === 2, 'el filtro «con respuesta» deja las respondidas');
  await pulsar(p3, '.filtro[data-f="todas"]');
  check(
    !(await p3.$('.ficha[data-id="ajena"] .cab button.enlace')) &&
      (await p3.$eval('.ficha[data-id="conpregunta"] .acciones button', (b) => b.tagName)) === 'BUTTON',
    'las notas generales no llevan «ir al texto» y los controles son botones'
  );
  await pulsar(p3, '.filtro[data-f="todas"]');
  await p3.waitForFunction(() =>
    Array.from(document.querySelectorAll('.ficha[data-id="ajena"] .autor span')).some(
      (s) => s.textContent === 'Lectora Invitada'
    )
  );
  check(true, 'la ficha de otra lectora lleva su nombre resuelto por la capacidad user');
  check(
    !(await p3.$eval('#f-autor', (s) => s.hidden)) &&
      (await p3.$$eval('#f-autor option', (os) => os.map((o) => o.textContent))).includes('Lectora Invitada'),
    'con varios lectores aparece el selector de lector'
  );
  await abrirDe(p3, '#f-autor');
  await p3.selectOption('#f-autor', 'u_otro');
  check((await p3.$$('.ficha')).length === 2, 'el filtro por lector deja sus anotaciones');
  await abrirDe(p3, '#f-autor');
  await p3.selectOption('#f-autor', '');
  const pid3 = await seleccionar(p3, 12);
  await p3.waitForSelector('#sel-tb', { state: 'visible' });
  await p3.click('#sel-tb .col-btn[data-c="duda"]');
  await p3.waitForFunction(() => Object.values(window.__docs).some((d) => d.tipo === 'subrayado'));
  const mio = await p3.evaluate(() => Object.values(window.__docs).find((d) => d.tipo === 'subrayado'));
  check(
    mio.autor === 'u_me' && typeof mio.bh === 'string' && mio.bh.length === 12,
    'un subrayado nuevo lleva autor y la huella del bloque'
  );
  await p3.waitForFunction(
    () => window.__colecciones.respaldos && Object.values(window.__colecciones.respaldos).some((d) => d.libro)
  );
  const respaldo = await p3.evaluate(() =>
    Object.values(window.__colecciones.respaldos).find((d) => d.partes !== undefined && d.libro)
  );
  check(
    respaldo.partes >= 2 &&
      respaldo.n >= 4 &&
      (await p3.evaluate(() => Object.keys(window.__colecciones.respaldos).length)) === respaldo.partes + 1,
    `el respaldo diario se trocea en documentos pequeños (${respaldo.partes} partes, ${respaldo.n} anotaciones)`
  );
  // el tope se mide en bytes del documento ya envuelto (las comillas y los saltos se escapan otra vez; ñ y emoji ocupan 2–4 bytes)
  const pesos = await p3.evaluate(() =>
    Object.values(window.__colecciones.respaldos)
      .filter((d) => d.anotaciones)
      .map((d) => new TextEncoder().encode(JSON.stringify(d)).length)
  );
  check(
    pesos.length === respaldo.partes && pesos.every((b) => b <= 180 * 1024),
    `cada parte del respaldo pesa menos de 180 KiB medida en bytes (${pesos.join(', ')})`
  );
  const respaldadas = await p3.evaluate(() =>
    Object.values(window.__colecciones.respaldos)
      .filter((d) => d.anotaciones)
      .map((d) => JSON.parse(d.anotaciones).map((a) => a.id))
      .flat()
  );
  check(
    respaldo.omitidas === 1 &&
      !respaldadas.includes('grande') &&
      respaldadas.includes('rara') &&
      respaldadas.includes('mediana') &&
      respaldadas.length === respaldo.n,
    `la anotación que no cabe ni sola queda fuera y el índice la cuenta (omitidas ${respaldo.omitidas}, respaldadas ${respaldadas.length})`
  );
  await p3.evaluate(() => {
    window.__colecciones.respaldos = {};
    Object.keys(localStorage)
      .filter((k) => k.endsWith(':respaldo'))
      .forEach((k) => localStorage.removeItem(k));
  });
  await p3.fill('.ficha[data-id="conpregunta"] textarea.replica', 'Al inicio, confirmado.');
  await p3.$eval('.ficha[data-id="conpregunta"] textarea.replica', (t) => t.blur());
  await p3.waitForFunction(() => Object.values(window.__colecciones.respaldos || {}).some((d) => d.libro) || true);
  await p3.waitForTimeout(150);
  check(
    (await p3.evaluate(() => Object.keys(window.__colecciones.respaldos || {}).length)) === 0,
    'editar una nota el mismo día no repite el respaldo (ya se hizo hoy)'
  );
  const copiaResp = await (async () => {
    await ctx3.grantPermissions(['clipboard-read', 'clipboard-write']);
    await enFicha(p3, '.ficha[data-id="atendida"]', 'button:has-text("Copiar")');
    return p3.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  })();
  check(
    /Respuesta \(atendida, abc1234\): Quitado en el párrafo 3\./.test(copiaResp),
    'copiar una ficha incluye la respuesta y su cierre'
  );
  // quien edita responde otra vez y su escritura todavía no llega a la página (la foto viene en camino): lo que el
  // lector hace entre tanto escribe sólo sus campos y no pisa la respuesta nueva
  await p3.evaluate(() => {
    Object.assign(window.__docs.atendida, {
      respuesta: 'Quitado también en el párrafo 5.',
      respondido: '2026-10-04T09:00:00.000Z',
      commit: 'def5678',
    });
  });
  await enFicha(p3, '.ficha[data-id="atendida"]', 'button[data-accion="reabrir"]');
  await esperar(p3, () => window.__docs.atendida.estado === 'abierta', null, 2000);
  const carrera = await p3.evaluate(() => ({
    estado: window.__docs.atendida.estado,
    respuesta: window.__docs.atendida.respuesta,
    commit: window.__docs.atendida.commit,
    revisado: window.__docs.atendida.revisado,
  }));
  check(
    carrera.estado === 'abierta' &&
      carrera.respuesta === 'Quitado también en el párrafo 5.' &&
      carrera.commit === 'def5678' &&
      carrera.revisado === '2026-10-03T10:00:00.000Z',
    `reabrir mientras llega otra respuesta escribe sólo los campos del lector y no pisa la respuesta nueva (${JSON.stringify(carrera)})`
  );
  // una escritura nueva rechazada por la base sin ser de permiso (la base está llena) no se pierde ni se da por guardada:
  // sigue a la vista marcada «sin guardar», con copia en el navegador, y la página sigue editable
  await p3.evaluate(() => {
    window.__rechazar = 'quota_exceeded';
  });
  await seleccionar(p3, 8);
  await p3.waitForSelector('#sel-tb', { state: 'visible' });
  await p3.click('#sel-tb .col-btn[data-c="cortar"]');
  const llenaAvisada = await esperar(p3, () =>
    /No se pudo guardar en la base \(quota_exceeded\)/.test(document.querySelector('#estado').textContent)
  );
  const llena = await p3.evaluate(() => ({
    marca: document.querySelectorAll('mark.hl.c-cortar').length,
    ficha: !!document.querySelector('.ficha.sin-guardar.c-cortar .aviso-guardar'),
    enBase: Object.values(window.__docs).some((d) => d.color === 'cortar'),
    local: Object.keys(localStorage).some(
      (k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /cortar/.test(localStorage.getItem(k))
    ),
    sl: document.body.classList.contains('solo-lectura'),
    intentos: window.__intentos.anotaciones,
  }));
  check(
    llenaAvisada && llena.marca === 1 && llena.ficha && !llena.enBase && llena.local && !llena.sl,
    `si la base rechaza la escritura por estar llena, la anotación sigue aquí marcada «sin guardar», con copia en el navegador, y la página sigue editable (avisada en 5 s ${llenaAvisada}, marcas ${llena.marca}, en base ${llena.enBase})`
  );
  // un cambio de color o de estado rechazado vuelve a lo que la base tiene: `previa` se toma antes de mutar
  await p3.evaluate(() => {
    window.getSelection().removeAllRanges();
    document.querySelector('#estado').textContent = '';
  });
  await enFicha(p3, `.ficha[data-id="${mio.id}"]`, '.col-btn[data-c="revisar"]');
  await p3.waitForFunction(() =>
    /No se pudo guardar \(quota_exceeded\)/.test(document.querySelector('#estado').textContent)
  );
  const colorRechazado = await p3.evaluate(
    (id) => ({
      marca: !!document.querySelector(`mark.hl.c-duda[data-aids~="${id}"]`),
      marcaNueva: !!document.querySelector(`mark.hl.c-revisar[data-aids~="${id}"]`),
      boton: document.querySelector(`.ficha[data-id="${id}"] .col-btn.on`).getAttribute('data-c'),
      ficha: document.querySelector(`.ficha[data-id="${id}"]`).classList.contains('c-duda'),
      base: window.__docs[id].color,
    }),
    mio.id
  );
  check(
    colorRechazado.marca &&
      !colorRechazado.marcaNueva &&
      colorRechazado.boton === 'duda' &&
      colorRechazado.ficha &&
      colorRechazado.base === 'duda',
    `un cambio de color rechazado vuelve al color que la base tiene (marca ${colorRechazado.marca}, botón ${colorRechazado.boton}, base ${colorRechazado.base})`
  );
  await p3.evaluate(() => {
    document.querySelector('#estado').textContent = '';
  });
  await enFicha(p3, `.ficha[data-id="${mio.id}"]`, 'button[data-accion="estado"]');
  await p3.waitForFunction(() =>
    /No se pudo guardar \(quota_exceeded\)/.test(document.querySelector('#estado').textContent)
  );
  const estadoRechazado = await p3.evaluate(
    (id) => ({
      resuelta: document.querySelector(`.ficha[data-id="${id}"]`).classList.contains('resuelta'),
      boton: document.querySelector(`.ficha[data-id="${id}"] button[data-accion="estado"]`).textContent,
      base: window.__docs[id].estado,
    }),
    mio.id
  );
  check(
    !estadoRechazado.resuelta && estadoRechazado.boton === 'Resuelta' && estadoRechazado.base === 'abierta',
    `un cambio de estado rechazado vuelve al estado que la base tiene (${estadoRechazado.boton}, base ${estadoRechazado.base})`
  );
  // una nota rechazada mientras se escribe no se pierde: el borrador sigue en el cuadro (con el foco), la ficha queda
  // «sin guardar» con reintento y copia local, y la base conserva lo suyo hasta que el reintento la actualiza
  await p3.evaluate(() => {
    document.querySelector('#estado').textContent = '';
  });
  await p3.focus('.ficha[data-id="atendida"] textarea');
  await p3.keyboard.type(' y el adverbio', { delay: 10 });
  const borradorAvisado = await esperar(
    p3,
    () =>
      /sigue aquí/.test(document.querySelector('#estado').textContent) &&
      !!document.querySelector('.ficha[data-id="atendida"].sin-guardar')
  );
  const notaRechazada = await p3.evaluate(() => ({
    cuadro: document.querySelector('.ficha[data-id="atendida"] textarea').value,
    foco: document.activeElement.id,
    base: window.__docs.atendida.nota,
    reintentar: !!document.querySelector('.ficha[data-id="atendida"] button[data-accion="reintentar"]'),
    local: Object.keys(localStorage).some(
      (k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /adverbio/.test(localStorage.getItem(k))
    ),
  }));
  check(
    borradorAvisado &&
      notaRechazada.cuadro === 'Quitar el adjetivo y el adverbio' &&
      notaRechazada.foco === 'nota-atendida' &&
      notaRechazada.base === 'Quitar el adjetivo' &&
      notaRechazada.reintentar &&
      notaRechazada.local,
    `una nota rechazada conserva el borrador en el cuadro con el foco, marcada «sin guardar» con reintento y copia local, y la base sigue con lo suyo (${JSON.stringify(notaRechazada.cuadro)}, base ${JSON.stringify(notaRechazada.base)})`
  );
  await p3.evaluate(() => {
    window.__rechazar = null;
    window.getSelection().removeAllRanges();
  });
  await p3.click('.ficha[data-id="atendida"] button[data-accion="reintentar"]');
  const reintentada = await esperar(
    p3,
    () =>
      window.__docs.atendida.nota === 'Quitar el adjetivo y el adverbio' &&
      !document.querySelector('.ficha[data-id="atendida"].sin-guardar')
  );
  check(reintentada, 'reintentar desde la ficha lleva el borrador a la base y quita la marca');
  await p3.$eval('.ficha[data-id="atendida"] textarea', (t) => t.blur());
  await enFicha(p3, '.ficha[data-id="ajena"]', 'button:has-text("Borrar")');
  await p3.click('.ficha[data-id="ajena"] .confirmar button:has-text("Sí")');
  await p3.waitForFunction(
    () => !window.__docs.ajena && /^Conectado/.test(document.querySelector('#estado').textContent)
  );
  check(!!(await p3.$('#deshacer')), 'el enlace de deshacer sobrevive al eco de la base que confirma el borrado');
  await p3.click('#deshacer');
  await p3.waitForFunction(() => !!window.__docs.ajena);
  check(true, 'deshacer devuelve la anotación a la base');
  check(
    errores3.length === 0,
    `sin errores de página con base y usuario${errores3.length ? ': ' + errores3.join(' | ') : ''}`
  );
  await ctx3.close();
});

test('Un borrador que no subió sobrevive a la recarga', async ({ browser }) => {
  // la copia local es más reciente que la versión de la base: al recargar manda el borrador y vuelve a subir
  const ctxBr = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxBr.addInitScript(() => {
    // en la segunda carga la base ya trae la respuesta que otra sesión escribió mientras el borrador esperaba
    const carga = (Number(sessionStorage.getItem('carga')) || 0) + 1;
    sessionStorage.setItem('carga', String(carga));
    const otra =
      carga >= 2
        ? { respuesta: 'Atendido en otra sesión', cierre: 'atendida', editado: '2026-10-01T00:00:00.000Z' }
        : {};
    window.__semilla = {
      borrador: Object.assign(
        {
          id: 'borrador',
          tipo: 'general',
          nota: 'Texto original',
          estado: 'abierta',
          creado: '2026-10-01T00:00:00.000Z',
          editado: '2026-10-01T00:00:00.000Z',
          autor: 'u_me',
        },
        otra
      ),
    };
  });
  await ctxBr.addInitScript(conBase);
  const pbr = await ctxBr.newPage();
  await pbr.goto(base);
  await pbr.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pbr.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  await pbr.click('.tab[data-tab="todas"]');
  await pbr.evaluate(() => {
    window.__rechazar = 'unavailable';
  });
  await pbr.focus('.ficha[data-id="borrador"] textarea');
  await pbr.keyboard.type(' y añadido', { delay: 10 });
  const brMarcado = await esperar(pbr, () => !!document.querySelector('.ficha[data-id="borrador"].sin-guardar'));
  check(brMarcado, 'un borrador rechazado queda marcado «sin guardar»');
  // un cambio de otra sesión que llega mientras tanto se funde debajo del borrador sin pisarlo
  await pbr.evaluate(() =>
    window.__cambioExterno('borrador', { respuesta: 'Respondida mientras tanto', cierre: 'pregunta' })
  );
  await pbr
    .waitForSelector(
      '.ficha[data-id="borrador"] .respuesta, .ficha[data-id="borrador"] .resp, .ficha[data-id="borrador"]'
    )
    .catch(() => {});
  const brFundido = await pbr.evaluate(() => ({
    cuadro: (document.querySelector('.ficha[data-id="borrador"] textarea') || {}).value,
    sinGuardar: !!document.querySelector('.ficha[data-id="borrador"].sin-guardar'),
    respuesta: /Respondida mientras tanto/.test(document.querySelector('.ficha[data-id="borrador"]').textContent),
  }));
  check(
    brFundido.cuadro === 'Texto original y añadido' && brFundido.sinGuardar && brFundido.respuesta,
    `un cambio externo mientras hay borrador se muestra sin pisar el borrador (${JSON.stringify(brFundido)})`
  );
  await pbr.reload();
  await pbr.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  const brSubido = await esperar(
    pbr,
    () => window.__docs.borrador && window.__docs.borrador.nota === 'Texto original y añadido',
    null,
    10000
  );
  await pbr.click('.tab[data-tab="todas"]');
  const brTras = await pbr.evaluate(() => ({
    cuadro: (document.querySelector('.ficha[data-id="borrador"] textarea') || {}).value,
    sinGuardar: !!document.querySelector('.ficha[data-id="borrador"].sin-guardar'),
    local: Object.keys(localStorage).some(
      (k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /borrador/.test(localStorage.getItem(k))
    ),
    respuesta: window.__docs.borrador.respuesta,
    cierre: window.__docs.borrador.cierre,
  }));
  check(
    brSubido && brTras.cuadro === 'Texto original y añadido' && !brTras.sinGuardar && !brTras.local,
    `al recargar, el borrador local más reciente que la base manda, sube y suelta la copia local (${JSON.stringify(brTras.cuadro)})`
  );
  check(
    brTras.respuesta === 'Atendido en otra sesión' && brTras.cierre === 'atendida',
    `y lo que otra sesión escribió entre tanto (respuesta, cierre) se conserva al subir el borrador (${brTras.respuesta}, ${brTras.cierre})`
  );
  await ctxBr.close();
});

test('Un borrador editado sin base conserva la lista de campos', async ({ browser }) => {
  // borrador recuperado con la lista {nota}; se abre sin base y se escribe la réplica: la lista guardada debe sumar
  // la réplica, y al conectar después deben subir la nota y la réplica sin pisar la respuesta de la base
  const claveL = CLAVE_LOCAL;
  const borradorX = {
    id: 'x',
    tipo: 'general',
    nota: 'Nota en borrador',
    estado: 'abierta',
    cierre: 'pregunta',
    respuesta: '¿Por qué?',
    creado: '2026-10-01T00:00:00.000Z',
    editado: '2026-10-05T00:00:00.000Z',
    autor: 'u_me',
  };
  const ctxOff = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxOff.addInitScript(sinBase);
  await ctxOff.addInitScript(
    ([clave, x]) => {
      if (!sessionStorage.getItem('sembrado')) {
        sessionStorage.setItem('sembrado', '1');
        localStorage.setItem(clave, JSON.stringify({ x }));
        localStorage.setItem(clave + ':campos', JSON.stringify({ x: { nota: true } }));
      }
    },
    [claveL, borradorX]
  );
  const poff = await ctxOff.newPage();
  await poff.goto(base);
  await poff.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await poff.click('.tab[data-tab="todas"]');
  await poff.waitForSelector('#nota-x-replica');
  await poff.fill('#nota-x-replica', 'Porque lo dice la guía');
  await poff.$eval('#nota-x-replica', (t) => t.blur());
  const offLocal = await poff.evaluate(
    (clave) => ({
      campos: JSON.parse(localStorage.getItem(clave + ':campos') || '{}'),
      copia: JSON.parse(localStorage.getItem(clave) || '{}'),
    }),
    claveL
  );
  check(
    offLocal.campos.x &&
      offLocal.campos.x.nota &&
      offLocal.campos.x.replica &&
      offLocal.copia.x.replica === 'Porque lo dice la guía',
    `sin base, la lista de campos guardada suma la réplica (${JSON.stringify(offLocal.campos.x)})`
  );
  const estadoOff = await poff.evaluate(
    (clave) => ({ copia: localStorage.getItem(clave), campos: localStorage.getItem(clave + ':campos') }),
    claveL
  );
  await ctxOff.close();
  const ctxOn = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxOn.addInitScript(() => {
    window.__semilla = {
      x: {
        id: 'x',
        tipo: 'general',
        nota: 'Nota original',
        estado: 'resuelta',
        cierre: 'pregunta',
        respuesta: '¿Por qué? Ampliada en otra sesión',
        creado: '2026-10-01T00:00:00.000Z',
        editado: '2026-10-02T00:00:00.000Z',
        autor: 'u_me',
      },
    };
  });
  await ctxOn.addInitScript(conBase);
  await ctxOn.addInitScript(
    ([clave, e]) => {
      if (!sessionStorage.getItem('sembrado')) {
        sessionStorage.setItem('sembrado', '1');
        localStorage.setItem(clave, e.copia);
        localStorage.setItem(clave + ':campos', e.campos);
      }
    },
    [claveL, estadoOff]
  );
  const pon = await ctxOn.newPage();
  await pon.goto(base);
  const onSubido = await esperar(
    pon,
    () => window.__docs && window.__docs.x && window.__docs.x.replica === 'Porque lo dice la guía',
    null,
    10000
  );
  const onBase = await pon.evaluate(
    (clave) => ({
      x: window.__docs.x,
      copia: localStorage.getItem(clave),
      campos: JSON.parse(localStorage.getItem(clave + ':campos') || '{}'),
    }),
    claveL
  );
  check(
    onSubido &&
      onBase.x.nota === 'Nota en borrador' &&
      onBase.x.respuesta === '¿Por qué? Ampliada en otra sesión' &&
      onBase.x.estado === 'resuelta',
    `al conectar suben la nota y la réplica del borrador, y la respuesta y el estado de la base se conservan (${JSON.stringify({ nota: onBase.x.nota, estado: onBase.x.estado })})`
  );
  const sueltas = await esperar(
    pon,
    (clave) =>
      !JSON.parse(localStorage.getItem(clave) || '{}').x &&
      !JSON.parse(localStorage.getItem(clave + ':campos') || '{}').x,
    claveL
  );
  check(sueltas, 'y la copia local y su lista de campos se sueltan una vez subidas');
  await ctxOn.close();
});

test('Deshacer un borrado sin base devuelve la lista de campos', async ({ browser }) => {
  const claveL = CLAVE_LOCAL;
  // borrador y con lista {color} (cambio de color sin subir); sin base se borra y se deshace; al conectar, el color
  // del borrador debe subir sobre la copia más vieja de la base
  const ctxDz = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxDz.addInitScript(sinBase);
  await ctxDz.addInitScript((clave) => {
    if (!sessionStorage.getItem('sembrado')) {
      sessionStorage.setItem('sembrado', '1');
      localStorage.setItem(
        clave,
        JSON.stringify({
          y: {
            id: 'y',
            tipo: 'general',
            nota: 'Nota de y',
            color: 'duda',
            estado: 'abierta',
            creado: '2026-10-01T00:00:00.000Z',
            editado: '2026-10-05T00:00:00.000Z',
            autor: 'u_me',
          },
        })
      );
      localStorage.setItem(clave + ':campos', JSON.stringify({ y: { color: true } }));
    }
  }, claveL);
  const pdz = await ctxDz.newPage();
  await pdz.goto(base);
  await pdz.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pdz.click('.tab[data-tab="todas"]');
  await enFicha(pdz, '.ficha[data-id="y"]', 'button:has-text("Borrar")');
  await pdz.click('.ficha[data-id="y"] .confirmar button:has-text("Sí")');
  await pdz.waitForSelector('#deshacer');
  await pdz.click('#deshacer');
  await pdz.waitForSelector('.ficha[data-id="y"]');
  const dzLocal = await pdz.evaluate(
    (clave) => ({
      campos: JSON.parse(localStorage.getItem(clave + ':campos') || '{}'),
      copia: JSON.parse(localStorage.getItem(clave) || '{}'),
    }),
    claveL
  );
  check(
    dzLocal.campos.y && dzLocal.campos.y.color && dzLocal.copia.y,
    `deshacer un borrado sin base devuelve la anotación y su lista de campos (${JSON.stringify(dzLocal.campos)})`
  );
  const dzEstado = await pdz.evaluate(
    (clave) => ({ copia: localStorage.getItem(clave), campos: localStorage.getItem(clave + ':campos') }),
    claveL
  );
  await ctxDz.close();
  const ctxDz2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxDz2.addInitScript(() => {
    window.__semilla = {
      y: {
        id: 'y',
        tipo: 'general',
        nota: 'Nota de y',
        color: 'revisar',
        estado: 'abierta',
        creado: '2026-10-01T00:00:00.000Z',
        editado: '2026-10-02T00:00:00.000Z',
        autor: 'u_me',
      },
    };
  });
  await ctxDz2.addInitScript(conBase);
  await ctxDz2.addInitScript(
    ([clave, e]) => {
      if (!sessionStorage.getItem('sembrado')) {
        sessionStorage.setItem('sembrado', '1');
        localStorage.setItem(clave, e.copia);
        if (e.campos) localStorage.setItem(clave + ':campos', e.campos);
      }
    },
    [claveL, dzEstado]
  );
  const pdz2 = await ctxDz2.newPage();
  await pdz2.goto(base);
  const dzSubido = await esperar(
    pdz2,
    () => window.__docs && window.__docs.y && window.__docs.y.color === 'duda',
    null,
    10000
  );
  check(
    dzSubido,
    `al conectar, el color cambiado sin base sube aunque la anotación se borrara y se recuperara (${await pdz2.evaluate(() => window.__docs.y && window.__docs.y.color)})`
  );
  await ctxDz2.close();
});

test('Anotar mientras conecta no borra la lista de otro borrador', async ({ browser }) => {
  const claveL = CLAVE_LOCAL;
  // la copia local trae el borrador x con lista {nota}; se anota algo mientras la base conecta (eso escribe la lista);
  // al conectar, x debe subir sólo su nota, sin pisar la réplica más reciente que otra sesión dejó en la base
  const ctxLst = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxLst.addInitScript(() => {
    window.__retenerDb = true;
    window.__semilla = {
      x: {
        id: 'x',
        tipo: 'general',
        nota: 'Nota base',
        replica: 'Réplica nueva de otra sesión',
        cierre: 'pregunta',
        respuesta: '¿Por qué?',
        estado: 'abierta',
        creado: '2026-10-01T00:00:00.000Z',
        editado: '2026-10-02T00:00:00.000Z',
        autor: 'u_me',
      },
    };
  });
  await ctxLst.addInitScript(conBase);
  await ctxLst.addInitScript((clave) => {
    if (!sessionStorage.getItem('sembrado')) {
      sessionStorage.setItem('sembrado', '1');
      localStorage.setItem(
        clave,
        JSON.stringify({
          x: {
            id: 'x',
            tipo: 'general',
            nota: 'Nota del borrador',
            replica: 'Réplica vieja',
            cierre: 'pregunta',
            respuesta: '¿Por qué?',
            estado: 'abierta',
            creado: '2026-10-01T00:00:00.000Z',
            editado: '2026-10-05T00:00:00.000Z',
            autor: 'u_me',
          },
        })
      );
      localStorage.setItem(clave + ':campos', JSON.stringify({ x: { nota: true }, ajena9: { nota: true } }));
    }
  }, claveL);
  const plst = await ctxLst.newPage();
  await plst.goto(base);
  await plst.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await plst.waitForFunction(() => /Conectando/.test(document.querySelector('#estado').textContent));
  const pidLst = await seleccionar(plst, 10);
  await plst.waitForSelector('#sel-tb', { state: 'visible' });
  await plst.click('#sel-tb .col-btn[data-c="revisar"]');
  await plst.waitForSelector(`[data-pid="${pidLst}"] mark.hl`);
  const listaIntacta = await plst.evaluate(
    (clave) => JSON.parse(localStorage.getItem(clave + ':campos') || '{}'),
    claveL
  );
  check(
    listaIntacta.x && listaIntacta.x.nota && listaIntacta.ajena9,
    `anotar mientras la base conecta no borra la lista de campos de los borradores aún no cargados (${JSON.stringify(listaIntacta)})`
  );
  await plst.evaluate(() => window.__soltarDb());
  const lstSubido = await esperar(
    plst,
    () => window.__docs && window.__docs.x && window.__docs.x.nota === 'Nota del borrador',
    null,
    10000
  );
  const lstBase = await plst.evaluate(
    (clave) => ({ x: window.__docs.x, campos: JSON.parse(localStorage.getItem(clave + ':campos') || '{}') }),
    claveL
  );
  check(
    lstSubido && lstBase.x.replica === 'Réplica nueva de otra sesión',
    `al conectar, el borrador sube su nota y la réplica más reciente de la base se conserva (${JSON.stringify(lstBase.x.replica)})`
  );
  check(
    !lstBase.campos.x && !!lstBase.campos.ajena9,
    `y su lista se suelta, mientras la de otra anotación no cargada se conserva (${JSON.stringify(lstBase.campos)})`
  );
  await ctxLst.close();
});

test('La nota de otro lector rechazada por falta de permiso', async ({ browser }) => {
  // can('data.write') resuelve null (host antiguo, visitante de fuera): la página deja escribir y es el rechazo
  // invalid_argument de la base el que decide: la nota vuelve a lo guardado y la página pasa a sólo lectura.
  const ctxF = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxF.addInitScript(() => {
    window.__semilla = {
      ajena: {
        id: 'ajena',
        tipo: 'general',
        nota: 'Nota de otra lectora',
        estado: 'abierta',
        creado: '2026-10-01T00:00:00.000Z',
        autor: 'u_otro',
      },
    };
  });
  await ctxF.addInitScript(conBase);
  await ctxF.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pf = await ctxF.newPage();
  await pf.goto(base);
  await pf.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pf.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  check(
    await pf.$eval('#sl-chip', (c) => getComputedStyle(c).display === 'none'),
    'con permiso de escritura el chip «sólo lectura» no se ve'
  );
  await pf.click('.tab[data-tab="todas"]');
  await pf.waitForSelector('.ficha[data-id="ajena"] textarea');
  await pf.evaluate(() => {
    window.__rechazar = 'invalid_argument';
  });
  await pf.fill('.ficha[data-id="ajena"] textarea', 'Nota de otra lectora, cambiada sin permiso');
  await pf.$eval('.ficha[data-id="ajena"] textarea', (t) => t.blur());
  await pf.waitForFunction(() => document.body.classList.contains('solo-lectura'));
  await pulsar(pf, '#b-copiar');
  const exportadoF = await pf.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const fantasma = await pf.evaluate(() => ({
    texto: (document.querySelector('.ficha[data-id="ajena"] .nota-texto') || {}).textContent,
    sinGuardar: !!document.querySelector('.ficha[data-id="ajena"].sin-guardar'),
    cuadro: !!document.querySelector('.ficha textarea'),
    base: window.__docs.ajena.nota,
    chip: getComputedStyle(document.querySelector('#sl-chip')).display !== 'none',
    tb: document.querySelector('#sel-tb').getAttribute('aria-label'),
    estado: document.querySelector('#estado').textContent,
  }));
  check(
    fantasma.texto === 'Nota de otra lectora, cambiada sin permiso' &&
      fantasma.sinGuardar &&
      !fantasma.cuadro &&
      fantasma.base === 'Nota de otra lectora' &&
      (() => {
        try {
          const j = JSON.parse(exportadoF);
          const a = j.anotaciones.find((x) => x.id === 'ajena');
          return a.nota === 'Nota de otra lectora, cambiada sin permiso' && a.sin_guardar === 'invalid_argument';
        } catch (e) {
          return false;
        }
      })(),
    `una nota rechazada por falta de permiso conserva el borrador marcado «sin guardar», se exporta con esa señal, la base no cambia y la página pasa a sólo lectura (${JSON.stringify(fantasma.texto)})`
  );
  check(
    fantasma.chip && fantasma.tb === 'Copiar la selección' && /sólo lectura/i.test(fantasma.estado),
    `el modo sólo lectura se señala con el chip, la barra de selección y el estado (${fantasma.estado.slice(0, 60)})`
  );
  await pf.evaluate(() => window.__cambioExterno('ajena', { estado: 'resuelta' }));
  await pf.waitForSelector('.ficha[data-id="ajena"].resuelta');
  check(
    /^Conectado .*sólo lectura/.test(await pf.$eval('#estado', (e) => e.textContent)),
    `un cambio llegado de fuera no borra el aviso de sólo lectura (${await pf.$eval('#estado', (e) => e.textContent)})`
  );
  await ctxF.close();
});

test('Rechazo transitorio: reintento, conservación y reintento manual', async ({ browser }) => {
  // Lo que aquí no ocurre a tiempo es una FALLA con nombre, no un abort a los 30 s.
  const ctxRe = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxRe.addInitScript(conBase);
  const pre = await ctxRe.newPage();
  const erroresRe = [];
  pre.on('pageerror', (e) => erroresRe.push(String(e)));
  await pre.goto(base);
  await pre.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pre.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  // la base rechaza una sola vez con unavailable: la página reintenta sola (segundo intento) y la anotación llega
  await pre.evaluate(() => {
    window.__rechazarUnaVez = 'unavailable';
    window.__intentos = {};
  });
  await pulsar(pre, '#b-nota-cap');
  await pre.waitForSelector('.ficha.t-capitulo textarea');
  const reintentado = await esperar(
    pre,
    () => window.__intentos.anotaciones === 2 && Object.values(window.__docs).some((d) => d.tipo === 'capitulo')
  );
  const reintento = await pre.evaluate(() => ({
    intentos: window.__intentos.anotaciones,
    sinGuardar: document.querySelectorAll('.ficha.sin-guardar').length,
    enBase: Object.values(window.__docs).some((d) => d.tipo === 'capitulo'),
  }));
  check(
    reintentado && reintento.intentos === 2 && reintento.sinGuardar === 0,
    `un rechazo transitorio se reintenta una vez tras un retardo corto y la anotación llega a la base (${reintento.intentos} intentos en 5 s, en base ${reintento.enBase})`
  );
  await pre.fill('.ficha.t-capitulo textarea', 'Nota de sección valiosa');
  await pre.$eval('.ficha.t-capitulo textarea', (t) => t.blur());
  check(
    await esperar(pre, () =>
      Object.values(window.__docs).some((d) => d.tipo === 'capitulo' && d.nota === 'Nota de sección valiosa')
    ),
    'la nota escrita después llega a la base'
  );
  const idCap = await pre.evaluate(
    () => (Object.values(window.__docs).find((d) => d.tipo === 'capitulo') || Object.values(window.__docs)[0] || {}).id
  );
  // la base sigue sin responder: la anotación nueva no se pierde (memoria, ficha marcada, copia local, reintento a mano)
  await pre.evaluate(() => {
    window.__rechazar = 'unavailable';
    window.__intentos = {};
  });
  await pulsar(pre, '#b-nota-gen');
  const conservadaVisible = await esperar(pre, () => !!document.querySelector('.ficha.sin-guardar.t-general textarea'));
  check(
    conservadaVisible,
    'si el reintento también falla, la anotación nueva sigue a la vista marcada «sin guardar» (en 5 s)'
  );
  if (conservadaVisible) {
    await pre.focus('.ficha.sin-guardar.t-general textarea');
    await pre.keyboard.type('Texto que no se pierde', { delay: 5 });
    await pre.$eval('.ficha.sin-guardar.t-general textarea', (t) => t.blur());
    const enLocal = await esperar(pre, () =>
      Object.keys(localStorage).some(
        (k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /Texto que no se pierde/.test(localStorage.getItem(k))
      )
    );
    const conservada2 = await pre.evaluate(() => ({
      intentos: window.__intentos.anotaciones,
      cuadro: document.querySelector('.ficha.sin-guardar.t-general textarea').value,
      aviso: document.querySelector('.ficha.sin-guardar.t-general .aviso-guardar').textContent,
      reintentar: !!document.querySelector('.ficha.sin-guardar.t-general button[data-accion="reintentar"]'),
      enBase: Object.values(window.__docs).some((d) => d.tipo === 'general'),
      estado: document.querySelector('#estado').textContent,
    }));
    check(
      enLocal &&
        conservada2.intentos >= 2 &&
        conservada2.cuadro === 'Texto que no se pierde' &&
        /unavailable/.test(conservada2.aviso) &&
        conservada2.reintentar &&
        !conservada2.enBase &&
        /sigue aquí y en este navegador/.test(conservada2.estado),
      `la anotación conservada tiene su texto, la marca «sin guardar», copia en el navegador y reintento (${conservada2.intentos} intentos, en el navegador ${enLocal})`
    );
    await pre.evaluate(() => {
      window.__rechazar = null;
    });
    await pre.click('.ficha.sin-guardar.t-general button[data-accion="reintentar"]');
    check(
      await esperar(
        pre,
        () =>
          Object.values(window.__docs).some((d) => d.tipo === 'general' && d.nota === 'Texto que no se pierde') &&
          !document.querySelector('.ficha.sin-guardar') &&
          !Object.keys(localStorage).some(
            (k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /Texto que no se pierde/.test(localStorage.getItem(k))
          )
      ),
      'reintentar desde la ficha la sube con su texto, quita la marca y la retira de la copia local'
    );
  }
  // deshacer un borrado cuando la base no responde: la anotación con su nota no se pierde
  await pre.evaluate(() => {
    window.__rechazar = null;
  });
  await enFicha(pre, `.ficha[data-id="${idCap}"]`, 'button:has-text("Borrar")');
  await pre.click(`.ficha[data-id="${idCap}"] .confirmar button:has-text("Sí")`);
  await pre.waitForFunction((id) => !window.__docs[id] && !!document.querySelector('#deshacer'), idCap);
  await pre.evaluate(() => {
    window.__rechazar = 'unavailable';
  });
  await pre.click('#deshacer');
  const deshechaVisible = await esperar(
    pre,
    (id) => !!document.querySelector(`.ficha[data-id="${id}"].sin-guardar textarea`),
    idCap
  );
  const deshecha = await pre.evaluate(
    (id) => ({
      cuadro: (document.querySelector(`.ficha[data-id="${id}"] textarea`) || {}).value,
      local: Object.keys(localStorage).some(
        (k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /Nota de sección valiosa/.test(localStorage.getItem(k))
      ),
      enBase: !!window.__docs[id],
    }),
    idCap
  );
  check(
    deshechaVisible && deshecha.cuadro === 'Nota de sección valiosa' && deshecha.local && !deshecha.enBase,
    `si la base rechaza «Deshacer borrado», la anotación recuperada se conserva con su nota en memoria y en el navegador (a la vista ${deshechaVisible}, en el navegador ${deshecha.local})`
  );
  if (deshechaVisible) {
    await pre.evaluate(() => {
      window.__rechazar = null;
    });
    await pre.click(`.ficha[data-id="${idCap}"] button[data-accion="reintentar"]`);
    check(
      await esperar(pre, (id) => !!window.__docs[id] && window.__docs[id].nota === 'Nota de sección valiosa', idCap),
      'y reintentar la devuelve a la base'
    );
  }
  check(
    erroresRe.length === 0,
    `sin errores de página en los reintentos${erroresRe.length ? ': ' + erroresRe.join(' | ') : ''}`
  );
  await ctxRe.close();
});

test('Las clausuras de la ficha leen la anotación viva', async ({ browser }) => {
  // Un guardado silencioso (nota, réplica) sustituye el objeto en memoria sin redibujar el panel: «Copiar» y los
  // botones de color y estado de esa misma ficha deben llevar lo recién escrito, no la copia con que se dibujó.
  const ctxCl = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxCl.addInitScript(conBase);
  await ctxCl.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pcl = await ctxCl.newPage();
  await pcl.goto(base);
  await pcl.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pcl.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  await pulsar(pcl, '#b-nota-gen');
  await pcl.waitForSelector('.ficha.t-general textarea');
  await pcl.fill('.ficha.t-general textarea', 'Nota escrita después de crearla');
  await pcl.$eval('.ficha.t-general textarea', (t) => t.blur());
  check(
    await esperar(pcl, () =>
      Object.values(window.__docs).some((d) => d.tipo === 'general' && d.nota === 'Nota escrita después de crearla')
    ),
    'la nota general escrita tras crearla llega a la base'
  );
  await enFicha(pcl, '.ficha.t-general', 'button[data-accion="copiar"]');
  const copiaViva = await pcl.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    /^\[nota general\] General\nNota: Nota escrita después de crearla$/.test(copiaViva),
    `«Copiar» en la ficha lleva la nota recién escrita (${JSON.stringify(copiaViva)})`
  );
  await seleccionar(pcl, 14);
  await pcl.waitForSelector('#sel-tb', { state: 'visible' });
  await pcl.click('#sel-tb .col-btn[data-c="revisar"]');
  check(
    await esperar(pcl, () => Object.values(window.__docs).some((d) => d.tipo === 'subrayado')),
    'el subrayado llega a la base'
  );
  await pcl.fill('.ficha.t-subrayado textarea', 'Nota del subrayado');
  await pcl.$eval('.ficha.t-subrayado textarea', (t) => t.blur());
  check(
    await esperar(pcl, () =>
      Object.values(window.__docs).some((d) => d.tipo === 'subrayado' && d.nota === 'Nota del subrayado')
    ),
    'la nota del subrayado llega a la base'
  );
  await enFicha(pcl, '.ficha.t-subrayado', '.col-btn[data-c="conservar"]');
  const colorYNota = await esperar(pcl, () =>
    Object.values(window.__docs).some((d) => d.tipo === 'subrayado' && d.color === 'conservar')
  );
  const subrayadoCl = await pcl.evaluate(() => {
    const d = Object.values(window.__docs).find((x) => x.tipo === 'subrayado');
    return { color: d.color, nota: d.nota, cuadro: document.querySelector('.ficha.t-subrayado textarea').value };
  });
  check(
    colorYNota &&
      subrayadoCl.color === 'conservar' &&
      subrayadoCl.nota === 'Nota del subrayado' &&
      subrayadoCl.cuadro === 'Nota del subrayado',
    `cambiar el color tras escribir la nota manda a la base el color y la nota (color ${subrayadoCl.color}, nota ${JSON.stringify(subrayadoCl.nota)})`
  );
  await enFicha(pcl, '.ficha.t-subrayado', 'button[data-accion="estado"]');
  check(
    await esperar(pcl, () =>
      Object.values(window.__docs).some(
        (d) =>
          d.tipo === 'subrayado' &&
          d.estado === 'resuelta' &&
          d.color === 'conservar' &&
          d.nota === 'Nota del subrayado'
      )
    ),
    'y cambiar el estado conserva color y nota'
  );
  await ctxCl.close();
});

test('Un rechazo de permiso no retira de la vista lo que la base no tiene', async ({ browser }) => {
  // Una anotación nueva rechazada con not_granted queda marcada «sin guardar», con copia en el navegador, en una
  // página que pasa a sólo lectura y lo dice; se puede copiar, sola o con «Copiar todo», con esa señal.
  const ctxNG = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxNG.addInitScript(conBase);
  await ctxNG.grantPermissions(['clipboard-read', 'clipboard-write']);
  const png = await ctxNG.newPage();
  await png.goto(base);
  await png.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await png.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  await png.evaluate(() => {
    window.__rechazar = 'not_granted';
  });
  await seleccionar(png, 10);
  await png.waitForSelector('#sel-tb', { state: 'visible' });
  await png.click('#sel-tb .col-btn[data-c="duda"]');
  const negadaVisible = await esperar(
    png,
    () => document.body.classList.contains('solo-lectura') && !!document.querySelector('.ficha.sin-guardar.t-subrayado')
  );
  const negada = await png.evaluate(() => ({
    marca: document.querySelectorAll('mark.hl.c-duda').length,
    aviso: (document.querySelector('.ficha.sin-guardar .aviso-guardar') || {}).textContent || '',
    reintentar: !!document.querySelector('.ficha button[data-accion="reintentar"]'),
    cuadro: !!document.querySelector('.ficha textarea'),
    enBase: Object.values(window.__docs).some((d) => d.tipo === 'subrayado'),
    local: Object.keys(localStorage).some(
      (k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /subrayado/.test(localStorage.getItem(k))
    ),
    estado: document.querySelector('#estado').textContent,
    cuenta: document.querySelector('#n-panel').textContent,
  }));
  check(
    negadaVisible &&
      negada.marca === 1 &&
      /not_granted/.test(negada.aviso) &&
      !negada.reintentar &&
      !negada.cuadro &&
      !negada.enBase &&
      negada.local,
    `una anotación nueva rechazada por permiso sigue a la vista marcada «sin guardar», con copia en el navegador, sin reintentar y en sólo lectura (a la vista ${negadaVisible}, marcas ${negada.marca}, en el navegador ${negada.local})`
  );
  check(
    /No se pudo guardar en la base \(not_granted\)/.test(negada.estado) &&
      /copia tus anotaciones/.test(negada.estado) &&
      /sólo lectura/.test(negada.estado),
    `la barra dice que no se pudo guardar y que se puede copiar (${negada.estado})`
  );
  const copiaNegada = negadaVisible
    ? await enFicha(png, '.ficha.sin-guardar', 'button[data-accion="copiar"]')
        .then(() => png.evaluate(() => navigator.clipboard.readText()))
        .catch(() => '')
    : '';
  await pulsar(png, '#b-copiar');
  const todoNegado = await png.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  await pulsar(png, '#b-copiar-md');
  const todoNegadoMD = await png.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    /sin guardar en la base \(not_granted\)/.test(copiaNegada) &&
      /"sin_guardar": "not_granted"/.test(todoNegado) &&
      /sin guardar en la base \(not_granted\)/.test(todoNegadoMD),
    `«Copiar» en la ficha y «Copiar todo» la incluyen con la señal de que la base no la tiene (${JSON.stringify(copiaNegada.split('\n')[0])})`
  );
  await ctxNG.close();
  // «Deshacer borrado» rechazado por permiso, con el borrado ya confirmado: la nota no se pierde
  const ctxND = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxND.addInitScript(() => {
    window.__semilla = {
      valiosa: {
        id: 'valiosa',
        tipo: 'general',
        nota: 'Nota valiosa con mucho trabajo',
        estado: 'abierta',
        creado: '2026-10-01T00:00:00.000Z',
        autor: 'u_me',
      },
    };
  });
  await ctxND.addInitScript(conBase);
  const pnd = await ctxND.newPage();
  await pnd.goto(base);
  await pnd.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pnd.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  await pnd.click('.tab[data-tab="todas"]');
  await enFicha(pnd, '.ficha[data-id="valiosa"]', 'button:has-text("Borrar")');
  await pnd.click('.ficha[data-id="valiosa"] .confirmar button:has-text("Sí")');
  await pnd.waitForFunction(() => !window.__docs.valiosa && !!document.querySelector('#deshacer'));
  await pnd.evaluate(() => {
    window.__rechazar = 'not_granted';
  });
  await pnd.click('#deshacer');
  const deshechaNegadaVisible = await esperar(
    pnd,
    () =>
      document.body.classList.contains('solo-lectura') &&
      !!document.querySelector('.ficha[data-id="valiosa"].sin-guardar')
  );
  const deshechaNegada = await pnd.evaluate(() => ({
    texto: (document.querySelector('.ficha[data-id="valiosa"] .nota-texto') || {}).textContent,
    aviso: (document.querySelector('.ficha[data-id="valiosa"] .aviso-guardar') || {}).textContent || '',
    enBase: !!window.__docs.valiosa,
    local: Object.keys(localStorage).some(
      (k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /Nota valiosa con mucho trabajo/.test(localStorage.getItem(k))
    ),
    estado: document.querySelector('#estado').textContent,
  }));
  check(
    deshechaNegadaVisible &&
      deshechaNegada.texto === 'Nota valiosa con mucho trabajo' &&
      /not_granted/.test(deshechaNegada.aviso) &&
      !deshechaNegada.enBase &&
      deshechaNegada.local &&
      /No se pudo guardar en la base \(not_granted\)/.test(deshechaNegada.estado),
    `un «Deshacer borrado» rechazado por permiso conserva la anotación con su nota, marcada y en el navegador (a la vista ${deshechaNegadaVisible}, en el navegador ${deshechaNegada.local})`
  );
  await ctxND.close();
});

test('Anotar mientras la base todavía conecta', async ({ browser }) => {
  const ctxTarde = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxTarde.addInitScript(() => {
    window.__retenerDb = true;
  });
  await ctxTarde.addInitScript(conBase);
  const pt = await ctxTarde.newPage();
  await pt.goto(base);
  await pt.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pt.waitForFunction(() => /Conectando/.test(document.querySelector('#estado').textContent));
  const pidTarde = await seleccionar(pt, 10);
  await pt.waitForSelector('#sel-tb', { state: 'visible' });
  await pt.click('#sel-tb .col-btn[data-c="revisar"]');
  await pt.waitForSelector(`[data-pid="${pidTarde}"] mark.hl`);
  check(
    /sólo en este navegador/.test(await pt.$eval('#estado', (e) => e.textContent)),
    'antes de conectar, la anotación se guarda en el navegador y se dice'
  );
  await pt.evaluate(() => window.__soltarDb());
  await pt.waitForFunction(
    () => Object.values(window.__docs).some((d) => d.tipo === 'subrayado' && d.autor === 'u_me'),
    null,
    { timeout: 10000 }
  );
  check(true, 'al conectar, lo anotado mientras tanto sube a la base con su autor');
  const sinLocal = await pt.evaluate(
    () => !Object.keys(localStorage).some((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k))
  );
  check(sinLocal, 'y la copia del navegador se retira para que no vuelva duplicada');
  await ctxTarde.close();
  // si la subida de una pendiente falla, la anotación no se pierde: sigue en memoria y en el navegador
  const ctxTarde2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxTarde2.addInitScript(() => {
    window.__retenerDb = true;
    window.__rechazar = 'unavailable';
  });
  await ctxTarde2.addInitScript(conBase);
  const pt2 = await ctxTarde2.newPage();
  await pt2.goto(base);
  await pt2.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pt2.waitForFunction(() => /Conectando/.test(document.querySelector('#estado').textContent));
  const pidTarde2 = await seleccionar(pt2, 10);
  await pt2.waitForSelector('#sel-tb', { state: 'visible' });
  await pt2.click('#sel-tb .col-btn[data-c="revisar"]');
  await pt2.waitForSelector(`[data-pid="${pidTarde2}"] mark.hl`);
  await pt2.evaluate(() => window.__soltarDb());
  await pt2.waitForFunction(() => /no pudo subir/.test(document.querySelector('#estado').textContent), null, {
    timeout: 10000,
  });
  const conservada = await pt2.evaluate(() => ({
    marca: !!document.querySelector('mark.hl'),
    local: Object.keys(localStorage).some(
      (k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /subrayado/.test(localStorage.getItem(k))
    ),
    enBase: Object.values(window.__docs).some((d) => d.tipo === 'subrayado'),
  }));
  check(
    conservada.marca && conservada.local && !conservada.enBase,
    'una pendiente que no pudo subir sigue en memoria y en el navegador, y la barra lo dice'
  );
  // si la base rechaza el borrado, vuelve a la memoria y la copia local la sigue teniendo (no se pierde al recargar)
  await pt2.click('.tab[data-tab="todas"]');
  await enFicha(pt2, '.ficha', 'button:has-text("Borrar")');
  await pt2.click('.ficha .confirmar button:has-text("Sí")');
  await pt2.waitForFunction(() => /No se pudo borrar/.test(document.querySelector('#estado').textContent), null, {
    timeout: 10000,
  });
  const trasRechazo = await pt2.evaluate(() => ({
    marca: !!document.querySelector('mark.hl'),
    ficha: !!document.querySelector('.ficha'),
    deshacer: !!document.querySelector('#deshacer'),
    local: Object.keys(localStorage)
      .filter((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k))
      .map((k) => localStorage.getItem(k))
      .join(''),
  }));
  check(
    trasRechazo.marca && trasRechazo.ficha && /subrayado/.test(trasRechazo.local) && !trasRechazo.deshacer,
    'si la base rechaza el borrado de una pendiente, vuelve a la memoria, la copia local la conserva y no se ofrece deshacer'
  );
  // borrarla de verdad la saca también de la copia local: al recargar no vuelve
  await pt2.evaluate(() => {
    window.__rechazar = null;
  });
  await enFicha(pt2, '.ficha', 'button:has-text("Borrar")');
  await pt2.click('.ficha .confirmar button:has-text("Sí")');
  await pt2.waitForSelector('#deshacer');
  await pt2.waitForFunction(
    () =>
      !Object.keys(localStorage)
        .filter((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k))
        .some((k) => /subrayado/.test(localStorage.getItem(k))),
    null,
    { timeout: 10000 }
  );
  check(true, 'borrar una pendiente que no subió la retira también de la copia local, una vez que la base confirma');
  await pt2.reload();
  await pt2.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pt2.evaluate(() => window.__soltarDb());
  await pt2.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent), null, {
    timeout: 10000,
  });
  check((await pt2.$$('mark.hl')).length === 0, 'y al recargar no resucita');
  await ctxTarde2.close();
  // lo que quedó en el navegador en otra sesión (sin conexión, o con subida fallida) se recupera al conectar:
  // sube lo que la base no tiene; en lo que la base ya tenía, manda la base
  const ctxRecarga = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxRecarga.addInitScript(() => {
    window.__retenerDb = true;
    window.__semilla = {
      vieja: {
        id: 'vieja',
        tipo: 'general',
        nota: 'Versión de la base',
        estado: 'abierta',
        creado: '2026-10-02T00:00:00.000Z',
        editado: '2026-10-03T00:00:00.000Z',
        autor: 'u_me',
      },
    };
  });
  await ctxRecarga.addInitScript(conBase);
  await ctxRecarga.addInitScript((clave) => {
    localStorage.setItem(
      clave,
      JSON.stringify({
        huerfana: {
          id: 'huerfana',
          tipo: 'general',
          nota: 'Quedó sólo en el navegador',
          estado: 'abierta',
          creado: '2026-10-02T00:00:00.000Z',
          editado: '2026-10-02T00:00:00.000Z',
        },
        vieja: {
          id: 'vieja',
          tipo: 'general',
          nota: 'Copia local atrasada',
          estado: 'abierta',
          creado: '2026-10-02T00:00:00.000Z',
          editado: '2026-10-02T00:00:00.000Z',
          autor: 'u_me',
        },
        ajena: {
          id: 'ajena',
          tipo: 'general',
          nota: 'De otra lectora, ya borrada en la base',
          estado: 'abierta',
          creado: '2026-10-02T00:00:00.000Z',
          editado: '2026-10-02T00:00:00.000Z',
          autor: 'u_otro',
        },
      })
    );
  }, CLAVE_LOCAL);
  const pr = await ctxRecarga.newPage();
  await pr.goto(base);
  await pr.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pr.waitForFunction(() => /Conectando/.test(document.querySelector('#estado').textContent));
  const pidRec = await seleccionar(pr, 10);
  await pr.waitForSelector('#sel-tb', { state: 'visible' });
  await pr.click('#sel-tb .col-btn[data-c="revisar"]');
  await pr.waitForSelector(`[data-pid="${pidRec}"] mark.hl`);
  const localAntesDeConectar = await pr.evaluate(
    (clave) => Object.keys(JSON.parse(localStorage.getItem(clave) || '{}')),
    CLAVE_LOCAL
  );
  check(
    localAntesDeConectar.length === 4 && ['ajena', 'huerfana', 'vieja'].every((k) => localAntesDeConectar.includes(k)),
    `anotar mientras la base conecta no pisa lo que ya había en la copia local (${localAntesDeConectar.join()})`
  );
  await pr.evaluate(() => window.__soltarDb());
  await pr.waitForFunction(
    () =>
      window.__docs &&
      window.__docs.huerfana &&
      window.__docs.huerfana.autor === 'u_me' &&
      Object.values(window.__docs).some((d) => d.tipo === 'subrayado' && d.autor === 'u_me'),
    null,
    { timeout: 10000 }
  );
  check(
    true,
    'al conectar suben la anotación que quedó en el navegador en otra sesión y la hecha mientras conectaba, con su autor'
  );
  await pr.waitForFunction(
    (clave) => {
      const j = JSON.parse(localStorage.getItem(clave) || '{}');
      return !j.huerfana && !j.vieja && !Object.values(j).some((a) => a.tipo === 'subrayado');
    },
    CLAVE_LOCAL,
    { timeout: 10000 }
  );
  await pr.click('.tab[data-tab="todas"]');
  const recuperada = await pr.evaluate(
    (clave) => ({
      ficha: !!document.querySelector('.ficha[data-id="huerfana"]'),
      vieja: (document.querySelector('.ficha[data-id="vieja"] textarea') || {}).value || '',
      viejaEnBase: window.__docs.vieja.nota,
      ajenaVisible: !!document.querySelector('.ficha[data-id="ajena"]') || !!window.__docs.ajena,
      local: Object.keys(JSON.parse(localStorage.getItem(clave) || '{}')),
    }),
    CLAVE_LOCAL
  );
  check(recuperada.ficha, 'la recuperada aparece en el panel y sale de la copia local una vez subida');
  check(
    recuperada.vieja === 'Versión de la base' && recuperada.viejaEnBase === 'Versión de la base',
    'una copia local atrasada de algo que la base ya tiene no pisa la versión de la base'
  );
  check(
    !recuperada.ajenaVisible && recuperada.local.join() === 'ajena',
    `la copia local de una anotación de otra cuenta no se carga ni se sube, pero se conserva para cuando vuelva su autora (${recuperada.local.join()})`
  );
  await ctxRecarga.close();
});

test('Sólo lectura de verdad', async ({ browser }) => {
  const ctxSL = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxSL.addInitScript(() => {
    window.__soloLectura = true;
    window.__semilla = {
      nota1: {
        id: 'nota1',
        tipo: 'general',
        nota: 'Nota visible en sólo lectura',
        estado: 'abierta',
        creado: '2026-10-01T00:00:00.000Z',
        autor: 'u_otro',
      },
      notapg: {
        id: 'notapg',
        tipo: 'pagina',
        pagina: 2,
        sid: 'cap-01',
        sidTitulo: 'Capítulo 1',
        nota: 'Nota de la página 2',
        estado: 'abierta',
        creado: '2026-10-01T01:00:00.000Z',
        autor: 'u_otro',
      },
    };
  });
  await ctxSL.addInitScript(conBase);
  const psl = await ctxSL.newPage();
  await libroAlterado(psl, paginar);
  await psl.goto(base);
  await psl.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await psl.waitForFunction(() => document.body.classList.contains('solo-lectura'));
  await psl.click('.tab[data-tab="todas"]');
  await psl.waitForSelector('.ficha[data-id="nota1"] .nota-texto');
  check(
    (await psl.$eval('.ficha[data-id="nota1"] .nota-texto', (n) => n.textContent)) === 'Nota visible en sólo lectura' &&
      !(await psl.$('.ficha textarea')),
    'en sólo lectura la nota se ve como texto'
  );
  // los números de página siguen en el margen, sin acción, con el punto de «página con nota»; el «p.» del panel no queda suelto
  const pgsSL = await psl.evaluate(() => ({
    pgs: Array.from(document.querySelectorAll('#sec-cap-01 .pg')).map((p) => ({
      visible: getComputedStyle(p).display !== 'none',
      inactivo: p.disabled,
      pg: p.getAttribute('data-pg'),
      conNota: p.classList.contains('con-nota'),
    })),
    confirmar: getComputedStyle(document.querySelector('.panel-cab .confirmar')).display,
    chip: !document.querySelector('#sl-chip').hidden,
    atajo: getComputedStyle(document.querySelector('#atajos .anotar')).display,
    tb: document.querySelector('#sel-tb').getAttribute('aria-label'),
  }));
  check(
    pgsSL.pgs.length >= 2 &&
      pgsSL.pgs.every((p) => p.visible && p.inactivo) &&
      pgsSL.pgs
        .filter((p) => p.conNota)
        .map((p) => p.pg)
        .join() === '2',
    `en sólo lectura los números de página siguen a la vista, sin acción y con el punto de página con nota (${pgsSL.pgs.map((p) => p.pg + (p.conNota ? '●' : '')).join(' ')})`
  );
  check(
    pgsSL.confirmar === 'none' && pgsSL.chip && pgsSL.atajo === 'none' && pgsSL.tb === 'Copiar la selección',
    `el «p.» del panel se oculta entero, el chip se ve, la ayuda calla los atajos de anotar y la barra dice copiar (${pgsSL.tb})`
  );
  await psl.evaluate(() => window.__cambioExterno('nota1', { nota: 'Nota visible en sólo lectura (editada fuera)' }));
  await psl.waitForFunction(() =>
    /editada fuera/.test(document.querySelector('.ficha[data-id="nota1"] .nota-texto').textContent)
  );
  check(
    /^Conectado .*sólo lectura/.test(await psl.$eval('#estado', (e) => e.textContent)),
    `tras un cambio externo, el estado conserva el aviso de sólo lectura (${await psl.$eval('#estado', (e) => e.textContent)})`
  );
  await seleccionar(psl, 10);
  await psl.waitForSelector('#sel-tb', { state: 'visible' });
  const tbSL = await psl.evaluate(() => ({
    color: getComputedStyle(document.querySelector('#sel-tb .col-btn')).display,
    copiar: getComputedStyle(document.querySelector('#sel-copiar')).display,
  }));
  check(tbSL.color === 'none' && tbSL.copiar !== 'none', 'la barra de selección sólo ofrece copiar');
  await psl.keyboard.press('1');
  await psl.waitForTimeout(200);
  check(
    (await psl.$$('mark.hl')).length === 0 &&
      !(await psl.evaluate(() => Object.values(window.__docs).some((d) => d.tipo === 'subrayado'))),
    'los atajos no anotan en sólo lectura'
  );
  await ctxSL.close();
  // quien anotó mientras conectaba y resulta ser de sólo lectura no pierde su única copia: queda en el navegador y vuelve al recargar
  const ctxSLTarde = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxSLTarde.addInitScript(() => {
    window.__retenerDb = true;
    window.__soloLectura = true;
  });
  await ctxSLTarde.addInitScript(conBase);
  await ctxSLTarde.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pst = await ctxSLTarde.newPage();
  await pst.goto(base);
  await pst.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pst.waitForFunction(() => /Conectando/.test(document.querySelector('#estado').textContent));
  const pidSLT = await seleccionar(pst, 10);
  await pst.waitForSelector('#sel-tb', { state: 'visible' });
  await pst.click('#sel-tb .col-btn[data-c="revisar"]');
  await pst.waitForSelector(`[data-pid="${pidSLT}"] mark.hl`);
  await pst.evaluate(() => window.__soltarDb());
  await pst.waitForFunction(() => document.body.classList.contains('solo-lectura'), null, { timeout: 10000 });
  await pst.waitForTimeout(300);
  // lo que no pudo subir queda marcado «sin guardar» (sin reintento, que no cabe en sólo lectura) y la barra lo dice
  const marcadaSL = (p) =>
    p.evaluate(() => ({
      marca: !!document.querySelector('mark.hl'),
      ficha: !!document.querySelector('.ficha.sin-guardar.t-subrayado'),
      aviso: (document.querySelector('.ficha.sin-guardar .aviso-guardar') || {}).textContent || '',
      reintentar: !!document.querySelector('.ficha button[data-accion="reintentar"]'),
      local: Object.keys(localStorage).some(
        (k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /subrayado/.test(localStorage.getItem(k))
      ),
      enBase: Object.values(window.__docs).some((d) => d.tipo === 'subrayado'),
      estado: document.querySelector('#estado').textContent,
    }));
  const antesRecarga = await marcadaSL(pst);
  check(
    antesRecarga.local &&
      !antesRecarga.enBase &&
      antesRecarga.ficha &&
      /sólo lectura/.test(antesRecarga.aviso) &&
      !antesRecarga.reintentar &&
      /no puede subir/.test(antesRecarga.estado) &&
      /Copiar todo/.test(antesRecarga.estado),
    `lo anotado antes de saber que se es de sólo lectura no sube y queda marcado «sin guardar», con aviso en la barra (${antesRecarga.estado.slice(0, 70)})`
  );
  await pst.reload();
  await pst.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pst.evaluate(() => window.__soltarDb());
  await pst.waitForFunction(() => document.body.classList.contains('solo-lectura'), null, { timeout: 10000 });
  await pst.waitForTimeout(300);
  const trasRecarga = await marcadaSL(pst);
  check(
    trasRecarga.marca &&
      trasRecarga.local &&
      !trasRecarga.enBase &&
      trasRecarga.ficha &&
      /sólo lectura/.test(trasRecarga.aviso) &&
      /no puede subir/.test(trasRecarga.estado),
    'se conserva en el navegador y vuelve al recargar, otra vez marcada'
  );
  await pulsar(pst, '#b-copiar');
  const todoSL = await pst.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const fichaSL = trasRecarga.ficha
    ? await enFicha(pst, '.ficha.sin-guardar', 'button[data-accion="copiar"]')
        .then(() => pst.evaluate(() => navigator.clipboard.readText()))
        .catch(() => '')
    : '';
  check(
    /"sin_guardar": "sólo lectura"/.test(todoSL) && /sin guardar en la base \(sólo lectura\)/.test(fichaSL),
    `«Copiar todo» y «Copiar» en la ficha la incluyen con la señal de que la base no la tiene (${JSON.stringify(fichaSL.split('\n')[0])})`
  );
  await ctxSLTarde.close();
});
