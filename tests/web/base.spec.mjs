// Con la base compartida (simulada): escrituras, rechazos, borradores, migraciones y sólo lectura.
import {
  check,
  esperar,
  abrirDe,
  pulsar,
  enFicha,
  seleccionar,
  libroAlterado,
  paginar,
  CLAVE_LOCAL,
  sinErrores,
  test,
} from './ayudas.mjs';

// Guiones de inicio (`previo`) para la base simulada: que no conecte hasta `__soltarDb()`, o que quien abre sea un
// lector de sólo lectura.
const retenerDb = () => {
  window.__retenerDb = true;
};
const soloLectura = () => {
  window.__soloLectura = true;
};
// Lo que una sesión dejó en el navegador: la copia del libro y la lista de campos sin subir de cada borrador.
const copiaLocal = (p) =>
  p.evaluate(
    (clave) => ({ copia: localStorage.getItem(clave), campos: localStorage.getItem(clave + ':campos') }),
    CLAVE_LOCAL
  );
// Guion de inicio que pone esa copia (y su lista, si la hay) en el navegador una sola vez: las recargas no la reponen.
const sembrarCopia = ([clave, e]) => {
  if (!sessionStorage.getItem('sembrado')) {
    sessionStorage.setItem('sembrado', '1');
    localStorage.setItem(clave, e.copia);
    if (e.campos) localStorage.setItem(clave + ':campos', e.campos);
  }
};
// Subraya («revisar») el comienzo del primer párrafo mientras la base, retenida, todavía conecta.
async function subrayarMientrasConecta(p) {
  await p.waitForFunction(() => /Conectando/.test(document.querySelector('#estado').textContent));
  const pid = await seleccionar(p, 10);
  await p.waitForSelector('#sel-tb', { state: 'visible' });
  await p.click('#sel-tb .col-btn[data-c="revisar"]');
  await p.waitForSelector(`[data-pid="${pid}"] mark.hl`);
}

// ------------------------------------------------------------ escribir con la base
test('Con la base: ni el eco del guardado ni un cambio de fuera interrumpen la nota que se escribe', async ({
  abrir,
}) => {
  const p = await abrir({ hash: '', modo: 'con-base' });
  check(true, 'con base, la barra dice «Conectado»');
  const pid = await seleccionar(p);
  await p.waitForSelector('#sel-tb', { state: 'visible' });
  await p.click('#sel-tb .col-btn[data-c="conservar"]');
  await p.waitForSelector(`[data-pid="${pid}"] mark.hl.c-conservar`);
  await p.waitForFunction(() => Object.values(window.__docs).some((d) => d.tipo === 'subrayado'));
  check(true, 'el subrayado llega a la base');
  const idSub = await p.evaluate(() => Object.values(window.__docs).find((d) => d.tipo === 'subrayado').id);
  await pulsar(p, '#b-nota-cap');
  await p.waitForSelector('.ficha.t-capitulo textarea');
  await p.focus('.ficha.t-capitulo textarea');
  await p.keyboard.type('Primera parte de la nota', { delay: 10 });
  await p.waitForTimeout(1100); // pasa el guardado diferido (900 ms) y su eco
  await p.keyboard.type(' y sigo escribiendo', { delay: 10 });
  const activo1 = await p.evaluate(() => document.activeElement && document.activeElement.value);
  check(
    activo1 === 'Primera parte de la nota y sigo escribiendo',
    'el eco del guardado no quita el foco ni corta la escritura'
  );
  // un cambio llegado de otra sesión mientras hay un borrador sin guardar
  await p.evaluate((id) => window.__cambioExterno(id, { color: 'duda' }), idSub);
  await p.waitForSelector(`[data-pid="${pid}"] mark.hl.c-duda`);
  const activo2 = await p.evaluate(() => ({
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
  await p.keyboard.type('.', { delay: 10 });
  await p.waitForFunction(() =>
    Object.values(window.__docs).some(
      (d) => d.tipo === 'capitulo' && d.nota === 'Primera parte de la nota y sigo escribiendo.'
    )
  );
  check(true, 'el borrador completo termina guardado en la base');
  sinErrores(p, 'con base');
});

// ------------------------------------------------------------ migración desde una clave anterior
// Una versión anterior de la página guardaba bajo otra clave; libro.json la declara en `claves_anteriores`.
const conClaveAnterior = (L) => {
  L.claves_anteriores = ['lector-viejo'];
};
const sembrarClaveVieja = () => {
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
};
// La copia nueva no cabe (almacenamiento lleno); la última posición sí se puede escribir.
const almacenamientoLleno = () => {
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (/^lector-anotaciones:/.test(k) && !/:ultima$/.test(k))
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    return original.call(this, k, v);
  };
};

test('Migración: lo guardado bajo la clave anterior aparece y pasa a la clave nueva', async ({ abrir }) => {
  const p = await abrir({
    hash: '',
    previo: [sembrarClaveVieja],
    preparar: (p) => libroAlterado(p, conClaveAnterior),
  });
  await p.waitForFunction(() => /recuperadas/.test(document.querySelector('#estado').textContent));
  await p.click('.tab[data-tab="todas"]');
  const heredada = await p.$$eval('.ficha textarea', (ts) => ts.map((t) => t.value));
  check(heredada.includes('Nota heredada'), 'las anotaciones de la clave anterior aparecen tras cargar');
  const claves = await p.evaluate(() => ({
    vieja: localStorage.getItem('lector-viejo'),
    nueva: Object.keys(localStorage).find((k) => /^lector-anotaciones:/.test(k) && !/:ultima$/.test(k)),
  }));
  check(claves.vieja === null && !!claves.nueva, 'quedan bajo la clave nueva y la vieja se retira');
});

test('Migración con el almacenamiento lleno: la clave vieja se conserva, la barra avisa y lo heredado se ve', async ({
  abrir,
}) => {
  // si la copia nueva no se puede escribir, la clave vieja debe seguir ahí: es la única copia
  const p = await abrir({
    hash: '',
    previo: [sembrarClaveVieja, almacenamientoLleno],
    preparar: (p) => libroAlterado(p, conClaveAnterior),
  });
  await p.waitForFunction(() => /No se pudieron guardar/.test(document.querySelector('#estado').textContent));
  const llenoEstado = await p.evaluate(() => ({
    vieja: localStorage.getItem('lector-viejo'),
    nueva: Object.keys(localStorage).find((k) => /^lector-anotaciones:/.test(k) && !/:ultima$/.test(k)) || null,
  }));
  check(
    llenoEstado.vieja !== null && llenoEstado.nueva === null,
    'si la copia nueva no se puede escribir, la clave vieja se conserva y la barra avisa'
  );
  await p.click('.tab[data-tab="todas"]');
  check(
    (await p.$$eval('.ficha textarea', (ts) => ts.map((t) => t.value))).includes('Nota heredada'),
    'y las anotaciones heredadas siguen visibles en esa sesión'
  );
});

// ------------------------------------------------------------ con base y usuario
// Seis notas generales de dos lectores: una ajena, una con pregunta, una atendida con commit y tres que ponen a prueba
// el respaldo (una que no cabe ni sola, una que pesa en bytes mucho más que en unidades, una mediana).
const SEMILLA_USUARIO = {
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
// Con la base y el usuario, en «Todas» con las seis fichas dibujadas. `op` suma opciones de `abrir` (permisos).
async function conUsuario(abrir, op = {}) {
  const p = await abrir({ hash: '', modo: 'con-base', semilla: SEMILLA_USUARIO, ...op });
  await p.click('.tab[data-tab="todas"]');
  await p.waitForFunction(() => document.querySelectorAll('.ficha').length === 6);
  return p;
}
// Además, por la interfaz y en este orden: la réplica a la pregunta (la primera escritura propia, que dispara el respaldo
// diario) y un subrayado nuevo en «duda»; espera a que el respaldo esté escrito, para que un rechazo posterior no lo
// alcance. Devuelve el subrayado como lo guardó la base.
async function conSubrayado(abrir) {
  const p = await conUsuario(abrir);
  await p.fill('.ficha[data-id="conpregunta"] textarea.replica', 'Al inicio.');
  await p.$eval('.ficha[data-id="conpregunta"] textarea.replica', (t) => t.blur());
  await p.waitForFunction(() => window.__docs.conpregunta && window.__docs.conpregunta.replica === 'Al inicio.');
  await seleccionar(p, 12);
  await p.waitForSelector('#sel-tb', { state: 'visible' });
  await p.click('#sel-tb .col-btn[data-c="duda"]');
  await p.waitForFunction(() => Object.values(window.__docs).some((d) => d.tipo === 'subrayado'));
  const mio = await p.evaluate(() => Object.values(window.__docs).find((d) => d.tipo === 'subrayado'));
  await p.waitForFunction(
    () => window.__colecciones.respaldos && Object.values(window.__colecciones.respaldos).some((d) => d.libro)
  );
  return { p, mio };
}

test('Respuestas de quien edita: la pregunta y la atendida con su cierre, la réplica se guarda y los filtros las separan', async ({
  abrir,
}) => {
  const p = await conUsuario(abrir);
  const fichaPregunta = await p.$eval('.ficha[data-id="conpregunta"]', (f) => ({
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
  const fichaAtendida = await p.$eval('.ficha[data-id="atendida"]', (f) => ({
    cierre: (f.querySelector('.cierre') || {}).textContent,
    quien: (f.querySelector('.respuesta .quien') || {}).textContent,
    resuelta: f.classList.contains('resuelta'),
  }));
  check(
    fichaAtendida.cierre === 'atendida' && /abc1234/.test(fichaAtendida.quien) && fichaAtendida.resuelta,
    'una anotación atendida muestra el cierre y el commit'
  );
  await p.fill('.ficha[data-id="conpregunta"] textarea.replica', 'Al inicio.');
  await p.$eval('.ficha[data-id="conpregunta"] textarea.replica', (t) => t.blur());
  await p.waitForFunction(() => window.__docs.conpregunta && window.__docs.conpregunta.replica === 'Al inicio.');
  check(true, 'la réplica del autor queda guardada en la base');
  await pulsar(p, '.filtro[data-f="preguntas"]');
  check((await p.$$('.ficha')).length === 1, 'el filtro «preguntas» deja sólo la pregunta');
  await pulsar(p, '.filtro[data-f="respondidas"]');
  check((await p.$$('.ficha')).length === 2, 'el filtro «con respuesta» deja las respondidas');
  await pulsar(p, '.filtro[data-f="todas"]');
  check(
    !(await p.$('.ficha[data-id="ajena"] .cab button.enlace')) &&
      (await p.$eval('.ficha[data-id="conpregunta"] .acciones button', (b) => b.tagName)) === 'BUTTON',
    'las notas generales no llevan «ir al texto» y los controles son botones'
  );
  sinErrores(p, 'con las respuestas de quien edita');
});

test('Varios lectores: la ficha ajena lleva su nombre y aparece el selector de lector, que filtra', async ({
  abrir,
}) => {
  const p = await conUsuario(abrir);
  await pulsar(p, '.filtro[data-f="todas"]');
  await p.waitForFunction(() =>
    Array.from(document.querySelectorAll('.ficha[data-id="ajena"] .autor span')).some(
      (s) => s.textContent === 'Lectora Invitada'
    )
  );
  check(true, 'la ficha de otra lectora lleva su nombre resuelto por la capacidad user');
  check(
    !(await p.$eval('#f-autor', (s) => s.hidden)) &&
      (await p.$$eval('#f-autor option', (os) => os.map((o) => o.textContent))).includes('Lectora Invitada'),
    'con varios lectores aparece el selector de lector'
  );
  await abrirDe(p, '#f-autor');
  await p.selectOption('#f-autor', 'u_otro');
  check((await p.$$('.ficha')).length === 2, 'el filtro por lector deja sus anotaciones');
  sinErrores(p, 'con varios lectores');
});

test('Un subrayado nuevo lleva autor y huella; el respaldo diario se trocea por bytes, deja fuera lo que no cabe y no se repite', async ({
  abrir,
}) => {
  const { p, mio } = await conSubrayado(abrir);
  check(
    mio.autor === 'u_me' && typeof mio.bh === 'string' && mio.bh.length === 12,
    'un subrayado nuevo lleva autor y la huella del bloque'
  );
  const respaldo = await p.evaluate(() =>
    Object.values(window.__colecciones.respaldos).find((d) => d.partes !== undefined && d.libro)
  );
  check(
    respaldo.partes >= 2 &&
      respaldo.n >= 4 &&
      (await p.evaluate(() => Object.keys(window.__colecciones.respaldos).length)) === respaldo.partes + 1,
    `el respaldo diario se trocea en documentos pequeños (${respaldo.partes} partes, ${respaldo.n} anotaciones)`
  );
  // el tope se mide en bytes del documento ya envuelto (las comillas y los saltos se escapan otra vez; ñ y emoji ocupan 2–4 bytes)
  const pesos = await p.evaluate(() =>
    Object.values(window.__colecciones.respaldos)
      .filter((d) => d.anotaciones)
      .map((d) => new TextEncoder().encode(JSON.stringify(d)).length)
  );
  check(
    pesos.length === respaldo.partes && pesos.every((b) => b <= 180 * 1024),
    `cada parte del respaldo pesa menos de 180 KiB medida en bytes (${pesos.join(', ')})`
  );
  const respaldadas = await p.evaluate(() =>
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
  // sin el respaldo ni su marca en el navegador, sólo la memoria de la página sabe que ya se hizo hoy
  await p.evaluate(() => {
    window.__colecciones.respaldos = {};
    Object.keys(localStorage)
      .filter((k) => k.endsWith(':respaldo'))
      .forEach((k) => localStorage.removeItem(k));
  });
  await p.fill('.ficha[data-id="conpregunta"] textarea.replica', 'Al inicio, confirmado.');
  await p.$eval('.ficha[data-id="conpregunta"] textarea.replica', (t) => t.blur());
  await p.waitForFunction(() => Object.values(window.__colecciones.respaldos || {}).some((d) => d.libro) || true);
  await p.waitForTimeout(150);
  check(
    (await p.evaluate(() => Object.keys(window.__colecciones.respaldos || {}).length)) === 0,
    'editar una nota el mismo día no repite el respaldo (ya se hizo hoy)'
  );
  sinErrores(p, 'con el respaldo diario');
});

test('«Copiar» lleva la respuesta y su cierre; reabrir mientras llega otra respuesta no la pisa', async ({ abrir }) => {
  const p = await conUsuario(abrir, { permisos: ['clipboard-read', 'clipboard-write'] });
  await enFicha(p, '.ficha[data-id="atendida"]', 'button:has-text("Copiar")');
  const copiaResp = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    /Respuesta \(atendida, abc1234\): Quitado en el párrafo 3\./.test(copiaResp),
    'copiar una ficha incluye la respuesta y su cierre'
  );
  // quien edita responde otra vez y su escritura todavía no llega a la página (la foto viene en camino): lo que el
  // lector hace entre tanto escribe sólo sus campos y no pisa la respuesta nueva
  await p.evaluate(() => {
    Object.assign(window.__docs.atendida, {
      respuesta: 'Quitado también en el párrafo 5.',
      respondido: '2026-10-04T09:00:00.000Z',
      commit: 'def5678',
    });
  });
  await enFicha(p, '.ficha[data-id="atendida"]', 'button[data-accion="reabrir"]');
  await esperar(p, () => window.__docs.atendida.estado === 'abierta', null, 2000);
  const carrera = await p.evaluate(() => ({
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
  sinErrores(p, 'al copiar y reabrir');
});

test('Con la base llena: un subrayado nuevo sigue a la vista «sin guardar», con copia local, y la página sigue editable', async ({
  abrir,
}) => {
  const { p } = await conSubrayado(abrir);
  // una escritura nueva rechazada sin ser de permiso (la base está llena) no se pierde ni se da por guardada
  await p.evaluate(() => {
    window.__rechazar = 'quota_exceeded';
  });
  await seleccionar(p, 8);
  await p.waitForSelector('#sel-tb', { state: 'visible' });
  await p.click('#sel-tb .col-btn[data-c="cortar"]');
  const llenaAvisada = await esperar(p, () =>
    /No se pudo guardar en la base \(quota_exceeded\)/.test(document.querySelector('#estado').textContent)
  );
  const llena = await p.evaluate(() => ({
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
  sinErrores(p, 'con la base llena, al subrayar');
});

test('Con la base llena: un cambio de color o de estado rechazado vuelve a lo que la base tiene', async ({ abrir }) => {
  const { p, mio } = await conSubrayado(abrir);
  // `previa` se toma antes de mutar: lo rechazado vuelve a lo que la base tiene
  await p.evaluate(() => {
    window.__rechazar = 'quota_exceeded';
    window.getSelection().removeAllRanges();
    document.querySelector('#estado').textContent = '';
  });
  await enFicha(p, `.ficha[data-id="${mio.id}"]`, '.col-btn[data-c="revisar"]');
  await p.waitForFunction(() =>
    /No se pudo guardar \(quota_exceeded\)/.test(document.querySelector('#estado').textContent)
  );
  const colorRechazado = await p.evaluate(
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
  await p.evaluate(() => {
    document.querySelector('#estado').textContent = '';
  });
  await enFicha(p, `.ficha[data-id="${mio.id}"]`, 'button[data-accion="estado"]');
  await p.waitForFunction(() =>
    /No se pudo guardar \(quota_exceeded\)/.test(document.querySelector('#estado').textContent)
  );
  const estadoRechazado = await p.evaluate(
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
  sinErrores(p, 'con la base llena, al cambiar color y estado');
});

test('Con la base llena: la nota rechazada conserva el borrador con el foco y «Reintentar» la sube', async ({
  abrir,
}) => {
  const { p } = await conSubrayado(abrir);
  // el borrador sigue en el cuadro (con el foco), la ficha queda «sin guardar» con reintento y copia local, y la base
  // conserva lo suyo hasta que el reintento la actualiza
  await p.evaluate(() => {
    window.__rechazar = 'quota_exceeded';
    window.getSelection().removeAllRanges();
    document.querySelector('#estado').textContent = '';
  });
  await p.focus('.ficha[data-id="atendida"] textarea');
  await p.keyboard.type(' y el adverbio', { delay: 10 });
  const borradorAvisado = await esperar(
    p,
    () =>
      /sigue aquí/.test(document.querySelector('#estado').textContent) &&
      !!document.querySelector('.ficha[data-id="atendida"].sin-guardar')
  );
  const notaRechazada = await p.evaluate(() => ({
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
  await p.evaluate(() => {
    window.__rechazar = null;
    window.getSelection().removeAllRanges();
  });
  await p.click('.ficha[data-id="atendida"] button[data-accion="reintentar"]');
  const reintentada = await esperar(
    p,
    () =>
      window.__docs.atendida.nota === 'Quitar el adjetivo y el adverbio' &&
      !document.querySelector('.ficha[data-id="atendida"].sin-guardar')
  );
  check(reintentada, 'reintentar desde la ficha lleva el borrador a la base y quita la marca');
  sinErrores(p, 'con la base llena, al escribir la nota');
});

test('Deshacer un borrado: el enlace sobrevive al eco de la base y devuelve la anotación', async ({ abrir }) => {
  const p = await conUsuario(abrir);
  await enFicha(p, '.ficha[data-id="ajena"]', 'button:has-text("Borrar")');
  const ecos = await p.evaluate(() => window.__ecos);
  await p.click('.ficha[data-id="ajena"] .confirmar button:has-text("Sí")');
  // la base borra en el acto, pero su eco llega después: se espera a que llegue
  const eco = await esperar(p, (n) => !window.__docs.ajena && window.__ecos > n, ecos, 2000);
  check(eco && !!(await p.$('#deshacer')), 'el enlace de deshacer sobrevive al eco de la base que confirma el borrado');
  await p.click('#deshacer');
  check(await esperar(p, () => !!window.__docs.ajena, null, 2000), 'deshacer devuelve la anotación a la base');
  sinErrores(p, 'al deshacer un borrado');
});

// ------------------------------------------------------------ borradores que no subieron
// En la segunda carga la base ya trae la respuesta que otra sesión escribió mientras el borrador esperaba.
const borradorConOtraSesion = () => {
  const carga = (Number(sessionStorage.getItem('carga')) || 0) + 1;
  sessionStorage.setItem('carga', String(carga));
  const otra =
    carga >= 2 ? { respuesta: 'Atendido en otra sesión', cierre: 'atendida', editado: '2026-10-01T00:00:00.000Z' } : {};
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
};

test('Un borrador rechazado queda «sin guardar», un cambio de fuera no lo pisa y al recargar sube sin perder lo ajeno', async ({
  abrir,
}) => {
  // la copia local es más reciente que la versión de la base: al recargar manda el borrador y vuelve a subir
  const p = await abrir({ hash: '', modo: 'con-base', previo: [borradorConOtraSesion] });
  await p.click('.tab[data-tab="todas"]');
  await p.evaluate(() => {
    window.__rechazar = 'unavailable';
  });
  await p.focus('.ficha[data-id="borrador"] textarea');
  await p.keyboard.type(' y añadido', { delay: 10 });
  const brMarcado = await esperar(p, () => !!document.querySelector('.ficha[data-id="borrador"].sin-guardar'));
  check(brMarcado, 'un borrador rechazado queda marcado «sin guardar»');
  // un cambio de otra sesión que llega mientras tanto se funde debajo del borrador sin pisarlo
  await p.evaluate(() =>
    window.__cambioExterno('borrador', { respuesta: 'Respondida mientras tanto', cierre: 'pregunta' })
  );
  await p
    .waitForSelector(
      '.ficha[data-id="borrador"] .respuesta, .ficha[data-id="borrador"] .resp, .ficha[data-id="borrador"]'
    )
    .catch(() => {});
  const brFundido = await p.evaluate(() => ({
    cuadro: (document.querySelector('.ficha[data-id="borrador"] textarea') || {}).value,
    sinGuardar: !!document.querySelector('.ficha[data-id="borrador"].sin-guardar'),
    respuesta: /Respondida mientras tanto/.test(document.querySelector('.ficha[data-id="borrador"]').textContent),
  }));
  check(
    brFundido.cuadro === 'Texto original y añadido' && brFundido.sinGuardar && brFundido.respuesta,
    `un cambio externo mientras hay borrador se muestra sin pisar el borrador (${JSON.stringify(brFundido)})`
  );
  await p.reload();
  await p.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  const brSubido = await esperar(
    p,
    () => window.__docs.borrador && window.__docs.borrador.nota === 'Texto original y añadido',
    null,
    10000
  );
  await p.click('.tab[data-tab="todas"]');
  const brTras = await p.evaluate(() => ({
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
});

// ------------------------------------------------------------ la lista de campos de un borrador, sin base y al conectar
// El borrador x, recuperado con la lista {nota}, se abre sin base y se le escribe la réplica: la lista guardada debe sumar
// la réplica, y al conectar después deben subir la nota y la réplica sin pisar la respuesta de la base.
const BORRADOR_X = {
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
// Sin base, con el borrador x en el navegador: se escribe su réplica. Devuelve la página y lo que quedó en el navegador.
async function replicaSinBase(abrir) {
  const semilla = { copia: JSON.stringify({ x: BORRADOR_X }), campos: JSON.stringify({ x: { nota: true } }) };
  const p = await abrir({ hash: '', previo: [[sembrarCopia, [CLAVE_LOCAL, semilla]]] });
  await p.click('.tab[data-tab="todas"]');
  await p.waitForSelector('#nota-x-replica');
  await p.fill('#nota-x-replica', 'Porque lo dice la guía');
  await p.$eval('#nota-x-replica', (t) => t.blur());
  return { p, estado: await copiaLocal(p) };
}

test('Sin base, la réplica de un borrador se suma a su lista de campos', async ({ abrir }) => {
  const { p } = await replicaSinBase(abrir);
  const offLocal = await p.evaluate(
    (clave) => ({
      campos: JSON.parse(localStorage.getItem(clave + ':campos') || '{}'),
      copia: JSON.parse(localStorage.getItem(clave) || '{}'),
    }),
    CLAVE_LOCAL
  );
  check(
    offLocal.campos.x &&
      offLocal.campos.x.nota &&
      offLocal.campos.x.replica &&
      offLocal.copia.x.replica === 'Porque lo dice la guía',
    `sin base, la lista de campos guardada suma la réplica (${JSON.stringify(offLocal.campos.x)})`
  );
});

test('Al conectar, el borrador hecho sin base sube nota y réplica sin pisar la base, y suelta su copia y su lista', async ({
  abrir,
}) => {
  const { p: sinBase, estado } = await replicaSinBase(abrir);
  await sinBase.context().close();
  const p = await abrir({
    hash: '',
    modo: 'con-base',
    semilla: {
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
    },
    previo: [[sembrarCopia, [CLAVE_LOCAL, estado]]],
    esperar: null,
  });
  const onSubido = await esperar(
    p,
    () => window.__docs && window.__docs.x && window.__docs.x.replica === 'Porque lo dice la guía',
    null,
    10000
  );
  const onBase = await p.evaluate(
    (clave) => ({
      x: window.__docs.x,
      copia: localStorage.getItem(clave),
      campos: JSON.parse(localStorage.getItem(clave + ':campos') || '{}'),
    }),
    CLAVE_LOCAL
  );
  check(
    onSubido &&
      onBase.x.nota === 'Nota en borrador' &&
      onBase.x.respuesta === '¿Por qué? Ampliada en otra sesión' &&
      onBase.x.estado === 'resuelta',
    `al conectar suben la nota y la réplica del borrador, y la respuesta y el estado de la base se conservan (${JSON.stringify({ nota: onBase.x.nota, estado: onBase.x.estado })})`
  );
  const sueltas = await esperar(
    p,
    (clave) =>
      !JSON.parse(localStorage.getItem(clave) || '{}').x &&
      !JSON.parse(localStorage.getItem(clave + ':campos') || '{}').x,
    CLAVE_LOCAL
  );
  check(sueltas, 'y la copia local y su lista de campos se sueltan una vez subidas');
});

// ------------------------------------------------------------ deshacer un borrado sin base
// El borrador y, con la lista {color} (un cambio de color sin subir), se borra sin base y se deshace: al conectar, el
// color del borrador debe subir sobre la copia más vieja de la base. Devuelve la página y lo que quedó en el navegador.
async function borradoYDeshechoSinBase(abrir) {
  const y = {
    id: 'y',
    tipo: 'general',
    nota: 'Nota de y',
    color: 'duda',
    estado: 'abierta',
    creado: '2026-10-01T00:00:00.000Z',
    editado: '2026-10-05T00:00:00.000Z',
    autor: 'u_me',
  };
  const semilla = { copia: JSON.stringify({ y }), campos: JSON.stringify({ y: { color: true } }) };
  const p = await abrir({ hash: '', previo: [[sembrarCopia, [CLAVE_LOCAL, semilla]]] });
  await p.click('.tab[data-tab="todas"]');
  await enFicha(p, '.ficha[data-id="y"]', 'button:has-text("Borrar")');
  await p.click('.ficha[data-id="y"] .confirmar button:has-text("Sí")');
  await p.waitForSelector('#deshacer');
  await p.click('#deshacer');
  await p.waitForSelector('.ficha[data-id="y"]');
  return { p, estado: await copiaLocal(p) };
}

test('Sin base, deshacer un borrado devuelve la anotación con su lista de campos', async ({ abrir }) => {
  const { p } = await borradoYDeshechoSinBase(abrir);
  const dzLocal = await p.evaluate(
    (clave) => ({
      campos: JSON.parse(localStorage.getItem(clave + ':campos') || '{}'),
      copia: JSON.parse(localStorage.getItem(clave) || '{}'),
    }),
    CLAVE_LOCAL
  );
  check(
    dzLocal.campos.y && dzLocal.campos.y.color && dzLocal.copia.y,
    `deshacer un borrado sin base devuelve la anotación y su lista de campos (${JSON.stringify(dzLocal.campos)})`
  );
});

test('Al conectar, el color cambiado sin base sube aunque la anotación se borrara y se recuperara', async ({
  abrir,
}) => {
  const { p: sinBase, estado } = await borradoYDeshechoSinBase(abrir);
  await sinBase.context().close();
  const p = await abrir({
    hash: '',
    modo: 'con-base',
    semilla: {
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
    },
    previo: [[sembrarCopia, [CLAVE_LOCAL, estado]]],
    esperar: null,
  });
  const dzSubido = await esperar(
    p,
    () => window.__docs && window.__docs.y && window.__docs.y.color === 'duda',
    null,
    10000
  );
  check(
    dzSubido,
    `al conectar, el color cambiado sin base sube aunque la anotación se borrara y se recuperara (${await p.evaluate(() => window.__docs.y && window.__docs.y.color)})`
  );
});

// ------------------------------------------------------------ anotar mientras conecta, con otro borrador pendiente
test('Anotar mientras conecta no borra la lista de otro borrador, que sube sólo su nota al conectar', async ({
  abrir,
}) => {
  // la copia local trae el borrador x con lista {nota}; se anota algo mientras la base conecta (eso escribe la lista);
  // al conectar, x debe subir sólo su nota, sin pisar la réplica más reciente que otra sesión dejó en la base
  const local = {
    copia: JSON.stringify({
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
    }),
    campos: JSON.stringify({ x: { nota: true }, ajena9: { nota: true } }),
  };
  const p = await abrir({
    hash: '',
    modo: 'con-base',
    semilla: {
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
    },
    previo: [retenerDb, [sembrarCopia, [CLAVE_LOCAL, local]]],
    esperar: 'bloques',
  });
  await subrayarMientrasConecta(p);
  const listaIntacta = await p.evaluate(
    (clave) => JSON.parse(localStorage.getItem(clave + ':campos') || '{}'),
    CLAVE_LOCAL
  );
  check(
    listaIntacta.x && listaIntacta.x.nota && listaIntacta.ajena9,
    `anotar mientras la base conecta no borra la lista de campos de los borradores aún no cargados (${JSON.stringify(listaIntacta)})`
  );
  await p.evaluate(() => window.__soltarDb());
  const lstSubido = await esperar(
    p,
    () => window.__docs && window.__docs.x && window.__docs.x.nota === 'Nota del borrador',
    null,
    10000
  );
  const lstBase = await p.evaluate(
    (clave) => ({ x: window.__docs.x, campos: JSON.parse(localStorage.getItem(clave + ':campos') || '{}') }),
    CLAVE_LOCAL
  );
  check(
    lstSubido && lstBase.x.replica === 'Réplica nueva de otra sesión',
    `al conectar, el borrador sube su nota y la réplica más reciente de la base se conserva (${JSON.stringify(lstBase.x.replica)})`
  );
  check(
    !lstBase.campos.x && !!lstBase.campos.ajena9,
    `y su lista se suelta, mientras la de otra anotación no cargada se conserva (${JSON.stringify(lstBase.campos)})`
  );
});

// ------------------------------------------------------------ permisos
test('La nota de otro lector rechazada por falta de permiso se queda «sin guardar» y la página pasa a sólo lectura', async ({
  abrir,
}) => {
  // can('data.write') resuelve null (host antiguo, visitante de fuera): la página deja escribir y es el rechazo
  // invalid_argument de la base el que decide: la nota vuelve a lo guardado y la página pasa a sólo lectura.
  const p = await abrir({
    hash: '',
    modo: 'con-base',
    semilla: {
      ajena: {
        id: 'ajena',
        tipo: 'general',
        nota: 'Nota de otra lectora',
        estado: 'abierta',
        creado: '2026-10-01T00:00:00.000Z',
        autor: 'u_otro',
      },
    },
    permisos: ['clipboard-read', 'clipboard-write'],
  });
  check(
    await p.$eval('#sl-chip', (c) => getComputedStyle(c).display === 'none'),
    'con permiso de escritura el chip «sólo lectura» no se ve'
  );
  await p.click('.tab[data-tab="todas"]');
  await p.waitForSelector('.ficha[data-id="ajena"] textarea');
  await p.evaluate(() => {
    window.__rechazar = 'invalid_argument';
  });
  await p.fill('.ficha[data-id="ajena"] textarea', 'Nota de otra lectora, cambiada sin permiso');
  await p.$eval('.ficha[data-id="ajena"] textarea', (t) => t.blur());
  await p.waitForFunction(() => document.body.classList.contains('solo-lectura'));
  await pulsar(p, '#b-copiar');
  const exportadoF = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const fantasma = await p.evaluate(() => ({
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
  await p.evaluate(() => window.__cambioExterno('ajena', { estado: 'resuelta' }));
  await p.waitForSelector('.ficha[data-id="ajena"].resuelta');
  check(
    /^Conectado .*sólo lectura/.test(await p.$eval('#estado', (e) => e.textContent)),
    `un cambio llegado de fuera no borra el aviso de sólo lectura (${await p.$eval('#estado', (e) => e.textContent)})`
  );
});

// ------------------------------------------------------------ rechazos transitorios
// Lo que aquí no ocurre a tiempo es una FALLA con nombre, no un abort a los 30 s.
test('Un rechazo transitorio se reintenta solo y la anotación llega a la base', async ({ abrir }) => {
  const p = await abrir({ hash: '', modo: 'con-base' });
  // la base rechaza una sola vez con unavailable: la página reintenta sola (segundo intento) y la anotación llega
  await p.evaluate(() => {
    window.__rechazarUnaVez = 'unavailable';
    window.__intentos = {};
  });
  await pulsar(p, '#b-nota-cap');
  await p.waitForSelector('.ficha.t-capitulo textarea');
  const reintentado = await esperar(
    p,
    () => window.__intentos.anotaciones === 2 && Object.values(window.__docs).some((d) => d.tipo === 'capitulo')
  );
  const reintento = await p.evaluate(() => ({
    intentos: window.__intentos.anotaciones,
    sinGuardar: document.querySelectorAll('.ficha.sin-guardar').length,
    enBase: Object.values(window.__docs).some((d) => d.tipo === 'capitulo'),
  }));
  check(
    reintentado && reintento.intentos === 2 && reintento.sinGuardar === 0,
    `un rechazo transitorio se reintenta una vez tras un retardo corto y la anotación llega a la base (${reintento.intentos} intentos en 5 s, en base ${reintento.enBase})`
  );
  await p.fill('.ficha.t-capitulo textarea', 'Nota de sección valiosa');
  await p.$eval('.ficha.t-capitulo textarea', (t) => t.blur());
  check(
    await esperar(p, () =>
      Object.values(window.__docs).some((d) => d.tipo === 'capitulo' && d.nota === 'Nota de sección valiosa')
    ),
    'la nota escrita después llega a la base'
  );
  sinErrores(p, 'en el reintento automático');
});

// La nota de sección «Nota de sección valiosa», escrita por la interfaz como en la prueba del reintento automático pero
// sin su rechazo transitorio, que no cambia lo que la base termina teniendo. Devuelve la página y el id de la nota.
async function conNotaDeSeccion(abrir) {
  const p = await abrir({ hash: '', modo: 'con-base' });
  await pulsar(p, '#b-nota-cap');
  await p.waitForSelector('.ficha.t-capitulo textarea');
  await p.waitForFunction(() => Object.values(window.__docs).some((d) => d.tipo === 'capitulo'));
  await p.fill('.ficha.t-capitulo textarea', 'Nota de sección valiosa');
  await p.$eval('.ficha.t-capitulo textarea', (t) => t.blur());
  await p.waitForFunction(() =>
    Object.values(window.__docs).some((d) => d.tipo === 'capitulo' && d.nota === 'Nota de sección valiosa')
  );
  const idCap = await p.evaluate(
    () => (Object.values(window.__docs).find((d) => d.tipo === 'capitulo') || Object.values(window.__docs)[0] || {}).id
  );
  return { p, idCap };
}

test('Si el reintento también falla, la anotación nueva se conserva «sin guardar» y se sube a mano', async ({
  abrir,
}) => {
  const { p } = await conNotaDeSeccion(abrir);
  // la base sigue sin responder: la anotación nueva no se pierde (memoria, ficha marcada, copia local, reintento a mano)
  await p.evaluate(() => {
    window.__rechazar = 'unavailable';
    window.__intentos = {};
  });
  await pulsar(p, '#b-nota-gen');
  const conservadaVisible = await esperar(p, () => !!document.querySelector('.ficha.sin-guardar.t-general textarea'));
  check(
    conservadaVisible,
    'si el reintento también falla, la anotación nueva sigue a la vista marcada «sin guardar» (en 5 s)'
  );
  if (conservadaVisible) {
    await p.focus('.ficha.sin-guardar.t-general textarea');
    await p.keyboard.type('Texto que no se pierde', { delay: 5 });
    await p.$eval('.ficha.sin-guardar.t-general textarea', (t) => t.blur());
    const enLocal = await esperar(p, () =>
      Object.keys(localStorage).some(
        (k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k) && /Texto que no se pierde/.test(localStorage.getItem(k))
      )
    );
    const conservada2 = await p.evaluate(() => ({
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
    await p.evaluate(() => {
      window.__rechazar = null;
    });
    await p.click('.ficha.sin-guardar.t-general button[data-accion="reintentar"]');
    check(
      await esperar(
        p,
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
  sinErrores(p, 'al conservar y reintentar a mano');
});

test('Si la base rechaza «Deshacer borrado», la nota recuperada se conserva y el reintento la devuelve', async ({
  abrir,
}) => {
  const { p, idCap } = await conNotaDeSeccion(abrir);
  // deshacer un borrado cuando la base no responde: la anotación con su nota no se pierde
  await enFicha(p, `.ficha[data-id="${idCap}"]`, 'button:has-text("Borrar")');
  await p.click(`.ficha[data-id="${idCap}"] .confirmar button:has-text("Sí")`);
  await p.waitForFunction((id) => !window.__docs[id] && !!document.querySelector('#deshacer'), idCap);
  await p.evaluate(() => {
    window.__rechazar = 'unavailable';
  });
  await p.click('#deshacer');
  const deshechaVisible = await esperar(
    p,
    (id) => !!document.querySelector(`.ficha[data-id="${id}"].sin-guardar textarea`),
    idCap
  );
  const deshecha = await p.evaluate(
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
    await p.evaluate(() => {
      window.__rechazar = null;
    });
    await p.click(`.ficha[data-id="${idCap}"] button[data-accion="reintentar"]`);
    check(
      await esperar(p, (id) => !!window.__docs[id] && window.__docs[id].nota === 'Nota de sección valiosa', idCap),
      'y reintentar la devuelve a la base'
    );
  }
  sinErrores(p, 'al deshacer un borrado rechazado');
});

// ------------------------------------------------------------ las clausuras de la ficha
test('Las acciones de la ficha leen la anotación viva: «Copiar», color y estado llevan lo recién escrito', async ({
  abrir,
}) => {
  // Un guardado silencioso (nota, réplica) sustituye el objeto en memoria sin redibujar el panel: «Copiar» y los
  // botones de color y estado de esa misma ficha deben llevar lo recién escrito, no la copia con que se dibujó.
  const p = await abrir({ hash: '', modo: 'con-base', permisos: ['clipboard-read', 'clipboard-write'] });
  await pulsar(p, '#b-nota-gen');
  await p.waitForSelector('.ficha.t-general textarea');
  await p.fill('.ficha.t-general textarea', 'Nota escrita después de crearla');
  await p.$eval('.ficha.t-general textarea', (t) => t.blur());
  check(
    await esperar(p, () =>
      Object.values(window.__docs).some((d) => d.tipo === 'general' && d.nota === 'Nota escrita después de crearla')
    ),
    'la nota general escrita tras crearla llega a la base'
  );
  await enFicha(p, '.ficha.t-general', 'button[data-accion="copiar"]');
  const copiaViva = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    /^\[nota general\] General\nNota: Nota escrita después de crearla$/.test(copiaViva),
    `«Copiar» en la ficha lleva la nota recién escrita (${JSON.stringify(copiaViva)})`
  );
  await seleccionar(p, 14);
  await p.waitForSelector('#sel-tb', { state: 'visible' });
  await p.click('#sel-tb .col-btn[data-c="revisar"]');
  check(
    await esperar(p, () => Object.values(window.__docs).some((d) => d.tipo === 'subrayado')),
    'el subrayado llega a la base'
  );
  await p.fill('.ficha.t-subrayado textarea', 'Nota del subrayado');
  await p.$eval('.ficha.t-subrayado textarea', (t) => t.blur());
  check(
    await esperar(p, () =>
      Object.values(window.__docs).some((d) => d.tipo === 'subrayado' && d.nota === 'Nota del subrayado')
    ),
    'la nota del subrayado llega a la base'
  );
  await enFicha(p, '.ficha.t-subrayado', '.col-btn[data-c="conservar"]');
  const colorYNota = await esperar(p, () =>
    Object.values(window.__docs).some((d) => d.tipo === 'subrayado' && d.color === 'conservar')
  );
  const subrayadoCl = await p.evaluate(() => {
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
  await enFicha(p, '.ficha.t-subrayado', 'button[data-accion="estado"]');
  check(
    await esperar(p, () =>
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
});

// ------------------------------------------------------------ un rechazo de permiso no retira lo que la base no tiene
test('Una anotación nueva rechazada por permiso sigue a la vista «sin guardar» y se copia con esa señal', async ({
  abrir,
}) => {
  // queda marcada «sin guardar», con copia en el navegador, en una página que pasa a sólo lectura y lo dice; se puede
  // copiar, sola o con «Copiar todo», con esa señal
  const p = await abrir({ hash: '', modo: 'con-base', permisos: ['clipboard-read', 'clipboard-write'] });
  await p.evaluate(() => {
    window.__rechazar = 'not_granted';
  });
  await seleccionar(p, 10);
  await p.waitForSelector('#sel-tb', { state: 'visible' });
  await p.click('#sel-tb .col-btn[data-c="duda"]');
  const negadaVisible = await esperar(
    p,
    () => document.body.classList.contains('solo-lectura') && !!document.querySelector('.ficha.sin-guardar.t-subrayado')
  );
  const negada = await p.evaluate(() => ({
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
    ? await enFicha(p, '.ficha.sin-guardar', 'button[data-accion="copiar"]')
        .then(() => p.evaluate(() => navigator.clipboard.readText()))
        .catch(() => '')
    : '';
  await pulsar(p, '#b-copiar');
  const todoNegado = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  await pulsar(p, '#b-copiar-md');
  const todoNegadoMD = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    /sin guardar en la base \(not_granted\)/.test(copiaNegada) &&
      /"sin_guardar": "not_granted"/.test(todoNegado) &&
      /sin guardar en la base \(not_granted\)/.test(todoNegadoMD),
    `«Copiar» en la ficha y «Copiar todo» la incluyen con la señal de que la base no la tiene (${JSON.stringify(copiaNegada.split('\n')[0])})`
  );
});

test('«Deshacer borrado» rechazado por permiso, con el borrado ya confirmado, no pierde la nota', async ({ abrir }) => {
  const p = await abrir({
    hash: '',
    modo: 'con-base',
    semilla: {
      valiosa: {
        id: 'valiosa',
        tipo: 'general',
        nota: 'Nota valiosa con mucho trabajo',
        estado: 'abierta',
        creado: '2026-10-01T00:00:00.000Z',
        autor: 'u_me',
      },
    },
  });
  await p.click('.tab[data-tab="todas"]');
  await enFicha(p, '.ficha[data-id="valiosa"]', 'button:has-text("Borrar")');
  await p.click('.ficha[data-id="valiosa"] .confirmar button:has-text("Sí")');
  await p.waitForFunction(() => !window.__docs.valiosa && !!document.querySelector('#deshacer'));
  await p.evaluate(() => {
    window.__rechazar = 'not_granted';
  });
  await p.click('#deshacer');
  const deshechaNegadaVisible = await esperar(
    p,
    () =>
      document.body.classList.contains('solo-lectura') &&
      !!document.querySelector('.ficha[data-id="valiosa"].sin-guardar')
  );
  const deshechaNegada = await p.evaluate(() => ({
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
});

// ------------------------------------------------------------ anotar mientras la base todavía conecta
test('Lo anotado mientras la base conecta se guarda en el navegador y sube al conectar, sin quedar duplicado', async ({
  abrir,
}) => {
  const p = await abrir({ hash: '', modo: 'con-base', previo: [retenerDb], esperar: 'bloques' });
  await subrayarMientrasConecta(p);
  check(
    /sólo en este navegador/.test(await p.$eval('#estado', (e) => e.textContent)),
    'antes de conectar, la anotación se guarda en el navegador y se dice'
  );
  await p.evaluate(() => window.__soltarDb());
  await p.waitForFunction(
    () => Object.values(window.__docs).some((d) => d.tipo === 'subrayado' && d.autor === 'u_me'),
    null,
    { timeout: 10000 }
  );
  check(true, 'al conectar, lo anotado mientras tanto sube a la base con su autor');
  const sinLocal = await p.evaluate(
    () => !Object.keys(localStorage).some((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k))
  );
  check(sinLocal, 'y la copia del navegador se retira para que no vuelva duplicada');
});

test('Una pendiente que no pudo subir se conserva; su borrado rechazado no la pierde y el confirmado no la resucita', async ({
  abrir,
}) => {
  // si la subida de una pendiente falla, la anotación no se pierde: sigue en memoria y en el navegador
  const rechazarTodo = () => {
    window.__rechazar = 'unavailable';
  };
  const p = await abrir({ hash: '', modo: 'con-base', previo: [retenerDb, rechazarTodo], esperar: 'bloques' });
  await subrayarMientrasConecta(p);
  await p.evaluate(() => window.__soltarDb());
  await p.waitForFunction(() => /no pudo subir/.test(document.querySelector('#estado').textContent), null, {
    timeout: 10000,
  });
  const conservada = await p.evaluate(() => ({
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
  await p.click('.tab[data-tab="todas"]');
  await enFicha(p, '.ficha', 'button:has-text("Borrar")');
  await p.click('.ficha .confirmar button:has-text("Sí")');
  await p.waitForFunction(() => /No se pudo borrar/.test(document.querySelector('#estado').textContent), null, {
    timeout: 10000,
  });
  const trasRechazo = await p.evaluate(() => ({
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
  await p.evaluate(() => {
    window.__rechazar = null;
  });
  await enFicha(p, '.ficha', 'button:has-text("Borrar")');
  await p.click('.ficha .confirmar button:has-text("Sí")');
  await p.waitForSelector('#deshacer');
  await p.waitForFunction(
    () =>
      !Object.keys(localStorage)
        .filter((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k))
        .some((k) => /subrayado/.test(localStorage.getItem(k))),
    null,
    { timeout: 10000 }
  );
  check(true, 'borrar una pendiente que no subió la retira también de la copia local, una vez que la base confirma');
  await p.reload();
  await p.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await p.evaluate(() => window.__soltarDb());
  await p.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent), null, {
    timeout: 10000,
  });
  check((await p.$$('mark.hl')).length === 0, 'y al recargar no resucita');
});

// ------------------------------------------------------------ recuperar al conectar lo que quedó en el navegador
// Lo que quedó en el navegador en otra sesión (sin conexión, o con subida fallida): una anotación que la base no tiene,
// una copia atrasada de otra que sí tiene y una de otra cuenta, ya borrada en la base.
const LOCAL_DE_OTRA_SESION = {
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
};

test('Al conectar se recupera lo que quedó en el navegador: sube lo que la base no tiene y en lo demás manda la base', async ({
  abrir,
}) => {
  const p = await abrir({
    hash: '',
    modo: 'con-base',
    semilla: {
      vieja: {
        id: 'vieja',
        tipo: 'general',
        nota: 'Versión de la base',
        estado: 'abierta',
        creado: '2026-10-02T00:00:00.000Z',
        editado: '2026-10-03T00:00:00.000Z',
        autor: 'u_me',
      },
    },
    // la copia sin lista de campos; la prueba no recarga, así que sembrarla una sola vez equivale a sembrarla en cada carga
    previo: [retenerDb, [sembrarCopia, [CLAVE_LOCAL, { copia: JSON.stringify(LOCAL_DE_OTRA_SESION) }]]],
    esperar: 'bloques',
  });
  await subrayarMientrasConecta(p);
  const localAntesDeConectar = await p.evaluate(
    (clave) => Object.keys(JSON.parse(localStorage.getItem(clave) || '{}')),
    CLAVE_LOCAL
  );
  check(
    localAntesDeConectar.length === 4 && ['ajena', 'huerfana', 'vieja'].every((k) => localAntesDeConectar.includes(k)),
    `anotar mientras la base conecta no pisa lo que ya había en la copia local (${localAntesDeConectar.join()})`
  );
  await p.evaluate(() => window.__soltarDb());
  await p.waitForFunction(
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
  await p.waitForFunction(
    (clave) => {
      const j = JSON.parse(localStorage.getItem(clave) || '{}');
      return !j.huerfana && !j.vieja && !Object.values(j).some((a) => a.tipo === 'subrayado');
    },
    CLAVE_LOCAL,
    { timeout: 10000 }
  );
  await p.click('.tab[data-tab="todas"]');
  const recuperada = await p.evaluate(
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
});

// ------------------------------------------------------------ sólo lectura de verdad
// Un lector de sólo lectura, con páginas en el capítulo 1 y dos notas ajenas (una general y una de la página 2), en
// «Todas» con las notas dibujadas.
async function enSoloLectura(abrir) {
  const p = await abrir({
    hash: '',
    modo: 'con-base',
    semilla: {
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
    },
    previo: [soloLectura],
    preparar: (p) => libroAlterado(p, paginar),
    esperar: 'bloques',
  });
  await p.waitForFunction(() => document.body.classList.contains('solo-lectura'));
  await p.click('.tab[data-tab="todas"]');
  await p.waitForSelector('.ficha[data-id="nota1"] .nota-texto');
  return p;
}

test('Sólo lectura: la nota es texto, las páginas quedan sin acción, nada invita a anotar y el aviso sobrevive al eco', async ({
  abrir,
}) => {
  const p = await enSoloLectura(abrir);
  check(
    (await p.$eval('.ficha[data-id="nota1"] .nota-texto', (n) => n.textContent)) === 'Nota visible en sólo lectura' &&
      !(await p.$('.ficha textarea')),
    'en sólo lectura la nota se ve como texto'
  );
  // los números de página siguen en el margen, sin acción, con el punto de «página con nota»; el «p.» del panel no queda suelto
  const pgsSL = await p.evaluate(() => ({
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
  await p.evaluate(() => window.__cambioExterno('nota1', { nota: 'Nota visible en sólo lectura (editada fuera)' }));
  await p.waitForFunction(() =>
    /editada fuera/.test(document.querySelector('.ficha[data-id="nota1"] .nota-texto').textContent)
  );
  check(
    /^Conectado .*sólo lectura/.test(await p.$eval('#estado', (e) => e.textContent)),
    `tras un cambio externo, el estado conserva el aviso de sólo lectura (${await p.$eval('#estado', (e) => e.textContent)})`
  );
});

test('Sólo lectura: la barra de selección sólo ofrece copiar y los atajos no anotan', async ({ abrir }) => {
  const p = await enSoloLectura(abrir);
  await seleccionar(p, 10);
  await p.waitForSelector('#sel-tb', { state: 'visible' });
  const tbSL = await p.evaluate(() => ({
    color: getComputedStyle(document.querySelector('#sel-tb .col-btn')).display,
    copiar: getComputedStyle(document.querySelector('#sel-copiar')).display,
  }));
  check(tbSL.color === 'none' && tbSL.copiar !== 'none', 'la barra de selección sólo ofrece copiar');
  await p.keyboard.press('1');
  await p.waitForTimeout(200);
  check(
    (await p.$$('mark.hl')).length === 0 &&
      !(await p.evaluate(() => Object.values(window.__docs).some((d) => d.tipo === 'subrayado'))),
    'los atajos no anotan en sólo lectura'
  );
});

// Lo que no pudo subir: marcado «sin guardar» (sin reintento, que no cabe en sólo lectura), en el navegador y en la barra.
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

test('Sólo lectura sabida tarde: lo anotado mientras conectaba queda marcado, vuelve al recargar y se copia con la señal', async ({
  abrir,
}) => {
  // quien anotó mientras conectaba y resulta ser de sólo lectura no pierde su única copia: queda en el navegador
  const p = await abrir({
    hash: '',
    modo: 'con-base',
    previo: [retenerDb, soloLectura],
    permisos: ['clipboard-read', 'clipboard-write'],
    esperar: 'bloques',
  });
  await subrayarMientrasConecta(p);
  await p.evaluate(() => window.__soltarDb());
  await p.waitForFunction(() => document.body.classList.contains('solo-lectura'), null, { timeout: 10000 });
  await p.waitForTimeout(300);
  const antesRecarga = await marcadaSL(p);
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
  await p.reload();
  await p.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await p.evaluate(() => window.__soltarDb());
  await p.waitForFunction(() => document.body.classList.contains('solo-lectura'), null, { timeout: 10000 });
  await p.waitForTimeout(300);
  const trasRecarga = await marcadaSL(p);
  check(
    trasRecarga.marca &&
      trasRecarga.local &&
      !trasRecarga.enBase &&
      trasRecarga.ficha &&
      /sólo lectura/.test(trasRecarga.aviso) &&
      /no puede subir/.test(trasRecarga.estado),
    'se conserva en el navegador y vuelve al recargar, otra vez marcada'
  );
  await pulsar(p, '#b-copiar');
  const todoSL = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const fichaSL = trasRecarga.ficha
    ? await enFicha(p, '.ficha.sin-guardar', 'button[data-accion="copiar"]')
        .then(() => p.evaluate(() => navigator.clipboard.readText()))
        .catch(() => '')
    : '';
  check(
    /"sin_guardar": "sólo lectura"/.test(todoSL) && /sin guardar en la base \(sólo lectura\)/.test(fichaSL),
    `«Copiar todo» y «Copiar» en la ficha la incluyen con la señal de que la base no la tiene (${JSON.stringify(fichaSL.split('\n')[0])})`
  );
});
