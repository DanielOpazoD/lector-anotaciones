// La revisión independiente de lo funcional de la 0.5 (propuestas, marcas de párrafo, deshacer): cada prueba falló
// con el defecto que nombra y pasa con su arreglo; las que ya pasaban fijan lo que la revisión encontró sano.
import { expect } from '@playwright/test';

import { esperar, seleccionarTexto, enFicha, libroAlterado, paginar, CLAVE_LOCAL, TELEFONO, test } from './ayudas.mjs';

const CITA = 'Un hecho es lo que se observó';
const idDe = (p, cita) => p.evaluate((c) => Object.keys(window.__docs).find((k) => window.__docs[k].cita === c), cita);

test('S1 la propuesta llega a la base (update con sugerencia)', async ({ abrir }) => {
  const p = await abrir({ modo: 'con-base' });
  // flujo 1: P con la selección
  await seleccionarTexto(p, CITA);
  await p.keyboard.press('p');
  await p.keyboard.press('Control+A');
  await p.keyboard.type('Un hecho es lo observado');
  await p.waitForTimeout(1300); // pausa: guardado por la pausa de 900 ms y su eco
  const durante = await p.evaluate(() => ({
    caja: document.activeElement && document.activeElement.value,
    dif: document.querySelector('.ficha.foco .dif-propuesta').textContent,
  }));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  const id = await idDe(p, CITA);
  const r1 = await p.evaluate(
    (id) => ({
      base: window.__docs[id].sugerencia,
      dif: document.querySelector(`.ficha[data-id="${id}"] .dif-propuesta`).textContent,
    }),
    id
  );
  // flujo 2: «Proponer texto» en un subrayado ya guardado
  await seleccionarTexto(p, 'escrita con prisa');
  await p.keyboard.press('3');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const id2 = await idDe(p, 'escrita con prisa');
  await enFicha(p, `.ficha[data-id="${id2}"]`, 'button[data-accion="proponer"]');
  await p.keyboard.press('Control+A');
  await p.keyboard.type('escrita sin prisa');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  const r2 = await p.evaluate(
    (id) => ({
      base: window.__docs[id].sugerencia,
      ficha: (document.querySelector(`.ficha[data-id="${id}"] .dif-propuesta`) || {}).textContent || null,
      boton: !!document.querySelector(`.ficha[data-id="${id}"] [data-accion="proponer"]`),
    }),
    id2
  );
  expect.soft(r1.base, 'P: la base tiene la propuesta').toBe('Un hecho es lo observado');
  expect.soft(r2.base, '«Proponer texto»: la base tiene la propuesta').toBe('escrita sin prisa');
});

test('S2 la diferencia sigue al cuadro que un redibujo repone', async ({ abrir }) => {
  const p = await abrir({ modo: 'con-base' });
  // aislar este defecto del de S1: se añade `sugerencia` a los campos del lector en tiempo de ejecución
  await p.evaluate(() => window.LANucleo.CAMPOS_LECTOR.push('sugerencia'));
  await seleccionarTexto(p, CITA);
  await p.keyboard.press('p');
  await p.waitForTimeout(300);
  const id = await idDe(p, CITA);
  await p.keyboard.type(' y medido');
  // otra sesión cambia la nota antes de la pausa de 900 ms
  await p.evaluate((id) => window.__cambioExterno(id, { nota: 'nota de otra sesión' }), id);
  await p.waitForTimeout(100);
  const tras = await p.evaluate(() => ({
    foco: document.activeElement && document.activeElement.className,
    caja: document.activeElement && document.activeElement.value,
    dif: document.querySelector('.ficha.foco .dif-propuesta').textContent,
  }));
  await p.waitForTimeout(1300);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const reposo = await p.evaluate(
    (id) => ({
      base: window.__docs[id].sugerencia,
      dif: document.querySelector(`.ficha[data-id="${id}"] .dif-propuesta`).textContent,
      ins: Array.from(document.querySelectorAll(`.ficha[data-id="${id}"] .dif-propuesta ins`)).map(
        (x) => x.textContent
      ),
    }),
    id
  );
  expect.soft(tras.dif, 'la diferencia muestra lo que está en el cuadro').not.toBe('Igual a la cita');
  expect.soft(reposo.ins.join('|'), 'en reposo la ficha muestra la propuesta guardada').toContain('medido');
});

test('S3 el cuadro abierto con «Proponer texto» sobrevive a un redibujo y conserva el foco', async ({ abrir }) => {
  const p = await abrir({ modo: 'con-base' });
  await p.evaluate(() => window.LANucleo.CAMPOS_LECTOR.push('sugerencia')); // aislar de S1
  await seleccionarTexto(p, 'escrita con prisa');
  await p.keyboard.press('3');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const id = await idDe(p, 'escrita con prisa');
  await enFicha(p, `.ficha[data-id="${id}"]`, 'button[data-accion="proponer"]');
  await p.keyboard.type(' y sin pausa');
  await p.evaluate((id) => window.__cambioExterno(id, { nota: 'nota de otra sesión' }), id);
  await p.waitForTimeout(100);
  const tras = await p.evaluate(
    (id) => ({
      activo: document.activeElement.tagName + '.' + document.activeElement.className,
      cuadro: !!document.querySelector(`.ficha[data-id="${id}"] textarea.sugerencia`),
      hash: location.hash,
    }),
    id
  );
  await p.keyboard.type('j'); // la siguiente tecla que escribe
  const despues = await p.evaluate(() => location.hash);
  await p.waitForTimeout(1200);
  const final = await p.evaluate(
    (id) => ({
      base: window.__docs[id].sugerencia,
      fichaMuestra: !!document.querySelector(`.ficha[data-id="${id}"] .dif-propuesta`),
      boton: !!document.querySelector(`.ficha[data-id="${id}"] [data-accion="proponer"]`),
    }),
    id
  );
  expect.soft(tras.cuadro, 'el cuadro sigue en la ficha').toBe(true);
  expect.soft(tras.activo, 'el foco sigue en el cuadro').toContain('sugerencia');
  expect.soft(despues, '«j» no cambia de sección').toBe(tras.hash);
});

test('S4 la marca de párrafo lleva el punto «por revisar» con la base (pintada antes de conocer al usuario)', async ({
  abrir,
}) => {
  const p = await abrir({
    contexto: TELEFONO,
    modo: 'con-base',
    semilla: {
      s1: {
        id: 's1',
        tipo: 'subrayado',
        sid: 'cap-01',
        sidTitulo: 'Capítulo 1. Hechos y observaciones',
        pid: 'cap-01-b1',
        src: 'x.md:1',
        inicio: 0,
        fin: 29,
        cita: 'Un hecho es lo que se observó',
        antes: '',
        despues: ', no lo que se concluyó de la ',
        color: 'duda',
        nota: '',
        estado: 'resuelta',
        creado: '2026-10-01T00:00:00.000Z',
        autor: 'u_me',
        respuesta: 'Hecho.',
        cierre: 'atendida',
        respondido: '2026-10-02T00:00:00.000Z',
      },
    },
  });
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const m = document.querySelector('[data-pid="cap-01-b1"] .marca-anot');
    return {
      cuenta: document.querySelector('#n-revisar').textContent,
      marca: m && m.className,
      etiqueta: m && m.getAttribute('aria-label'),
    };
  });
  expect.soft(r.cuenta, 'la página la cuenta por revisar').toBe('1');
  expect.soft(r.marca, 'la marca lleva el punto').toContain('por-revisar');
});

test('S5 tras un rechazo que ya devolvió el color no se ofrece deshacer', async ({ abrir }) => {
  const p = await abrir({ modo: 'con-base' });
  await seleccionarTexto(p, CITA);
  await p.keyboard.press('1');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const id = await idDe(p, CITA);
  await p.evaluate(() => (window.__rechazar = 'quota_exceeded'));
  await enFicha(p, `.ficha[data-id="${id}"]`, 'button[data-c="cortar"]');
  await p.waitForTimeout(600);
  const r = await p.evaluate(
    (id) => ({
      zona: document.querySelector('#deshacer-zona').textContent,
      clase: document.querySelector(`.ficha[data-id="${id}"]`).className,
      estado: document.querySelector('#estado').textContent,
    }),
    id
  );
  expect.soft(r.zona, 'tras el rechazo no se ofrece deshacer un cambio que no ocurrió').toBe('');
});

test('S6 deshacer no escribe estado null cuando no había estado', async ({ abrir }) => {
  const p = await abrir({
    modo: 'con-base',
    semilla: {
      g1: { id: 'g1', tipo: 'general', nota: 'Sin estado', creado: '2026-10-01T00:00:00.000Z', autor: 'u_me' },
    },
  });
  await p.click('.tab[data-tab="todas"]');
  await enFicha(p, '.ficha[data-id="g1"]', 'button[data-accion="estado"]');
  await p.click('#deshacer');
  await p.waitForTimeout(400);
  const d = await p.evaluate(() => JSON.stringify(window.__docs.g1));
  expect.soft(JSON.parse(d).estado, 'estado no es null').not.toBe(null);
});

test('S7 deshacer no pisa un cambio posterior de otra sesión', async ({ abrir }) => {
  const p = await abrir({ modo: 'con-base' });
  await seleccionarTexto(p, CITA);
  await p.keyboard.press('1');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const id = await idDe(p, CITA);
  await enFicha(p, `.ficha[data-id="${id}"]`, 'button[data-c="cortar"]');
  await p.waitForTimeout(200);
  await p.evaluate((id) => window.__cambioExterno(id, { color: 'duda', editado: '2030-01-01T00:00:00.000Z' }), id);
  await p.waitForTimeout(200);
  const antes = await p.evaluate(() => document.querySelector('#deshacer-zona').textContent);
  await p.click('#deshacer');
  await p.waitForTimeout(300);
  const d = await p.evaluate((id) => window.__docs[id].color, id);
  expect.soft(d, 'deshacer no pisa el «duda» que puso otra sesión').toBe('duda');
});

test('S8 la marca no entra en un título y en una lista va dentro del ítem', async ({ abrir }) => {
  const p = await abrir({ contexto: TELEFONO });
  await p.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  await seleccionarTexto(p, 'Tres maneras');
  await p.keyboard.press('1');
  await p.keyboard.press('Escape');
  await seleccionarTexto(p, 'Dar por hecho lo que alguien contó');
  await p.keyboard.press('2');
  await p.keyboard.press('Escape');
  const h = await p.locator('[data-pid="cap-01-b2"]').ariaSnapshot();
  const ul = await p.locator('[data-pid="cap-01-b3"]').ariaSnapshot();
  const nombre = await p.evaluate(() => {
    const m = document.querySelector('[data-pid="cap-01-b3"] .marca-anot');
    return { padre: m && m.parentElement.tagName, etiqueta: m && m.getAttribute('aria-label') };
  });
  expect.soft(h, 'el nombre del título no lleva la cuenta').not.toContain('anotación');
  expect.soft(nombre, 'en una lista, la marca va en el primer ítem y dice «lista»').toEqual({
    padre: 'LI',
    etiqueta: '1 anotación en esta lista',
  });
});

test('S9 la diferencia de la propuesta para lectores de pantalla', async ({ abrir }) => {
  const p = await abrir();
  await p.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  await seleccionarTexto(p, CITA);
  await p.keyboard.press('p');
  await p.keyboard.press('Control+A');
  await p.keyboard.type('Un hecho es lo observado');
  await p.keyboard.press('Escape');
  const snap = await p.locator('.ficha.c-revisar .propuesta').ariaSnapshot();
  expect.soft(snap, 'lo quitado se expone como borrado').toContain('deletion');
  expect.soft(snap, 'lo añadido, como inserción').toContain('insertion');
});

test('S10 borrada en otra sesión o en sólo lectura, deshacer deja de ofrecerse', async ({ abrir }) => {
  const p = await abrir({ modo: 'con-base' });
  await seleccionarTexto(p, CITA);
  await p.keyboard.press('1');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const id = await idDe(p, CITA);
  await enFicha(p, `.ficha[data-id="${id}"]`, 'button[data-c="cortar"]');
  await p.waitForTimeout(200);
  // otra sesión la borra (la base simulada emite «removed» a la página)
  await p.evaluate((id) => window.claude.use('db').then((d) => d.collection('anotaciones').doc(id).delete()), id);
  await p.waitForTimeout(200);
  const zona = await p.evaluate(() => document.querySelector('#deshacer-zona').textContent);
  expect.soft(zona, 'borrada en otra sesión, su cambio ya no se ofrece deshacer').toBe('');
  // sólo lectura: un rechazo de permiso tras ofrecer deshacer
  await seleccionarTexto(p, 'escrita con prisa');
  await p.keyboard.press('3');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const id2 = await idDe(p, 'escrita con prisa');
  await enFicha(p, `.ficha[data-id="${id2}"]`, 'button[data-accion="estado"]');
  await p.evaluate(() => (window.__rechazar = 'not_granted'));
  await enFicha(p, `.ficha[data-id="${id2}"]`, 'button[data-c="cortar"]').catch(() => {});
  await p.waitForTimeout(400);
  const sl = await p.evaluate(() => ({
    soloLectura: document.body.classList.contains('solo-lectura'),
    zona: document.querySelector('#deshacer-zona').textContent,
  }));
  expect.soft(sl, 'en sólo lectura no se ofrece deshacer').toEqual({ soloLectura: true, zona: '' });
});

test('S11 el aviso de deshacer un cambio llega a los lectores de pantalla', async ({ abrir }) => {
  const p = await abrir();
  await p.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  await seleccionarTexto(p, CITA);
  await p.keyboard.press('1');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  await p.evaluate(() => (document.querySelector('#anuncio').textContent = ''));
  await enFicha(p, '.ficha.c-revisar', 'button[data-c="cortar"]');
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => ({
    zona: document.querySelector('#deshacer-zona').textContent,
    zonaRol:
      document.querySelector('#deshacer-zona').getAttribute('role') ||
      document.querySelector('#deshacer-zona').getAttribute('aria-live'),
    anuncio: document.querySelector('#anuncio').textContent,
  }));
  await p.click('#deshacer');
  await p.waitForTimeout(300);
  const r2 = await p.evaluate(() => document.querySelector('#anuncio').textContent);
  expect.soft(r.anuncio, 'se anuncia que se puede deshacer').toBe('Color: cortar. Se puede deshacer.');
  expect.soft(r2, 'y que se deshizo').toBe('Cambio deshecho');
});

test('S12 copiar y subrayar con número de página y marca de párrafo (teléfono)', async ({ abrir }) => {
  const p = await abrir({
    contexto: TELEFONO,
    permisos: ['clipboard-read', 'clipboard-write'],
    preparar: (p) => libroAlterado(p, paginar),
  });
  await p.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid] .pg');
  await seleccionarTexto(p, 'escrita con prisa');
  await p.keyboard.press('3');
  await p.keyboard.press('Escape');
  // seleccionar desde el principio del bloque (antes del número y la marca) hasta una palabra
  const hijos = await p.evaluate(() =>
    Array.from(document.querySelector('[data-pid="cap-01-b1"]').childNodes)
      .slice(0, 4)
      .map((n) => (n.nodeType === 1 ? n.className || n.tagName : JSON.stringify(n.nodeValue.slice(0, 15))))
  );
  await p.evaluate(() => {
    const par = document.querySelector('[data-pid="cap-01-b1"]');
    const w = document.createTreeWalker(par, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode()) && n.nodeValue.indexOf('Un hecho') < 0) {}
    const r = document.createRange();
    r.setStart(par, 0);
    r.setEnd(n, n.nodeValue.indexOf('Un hecho') + 8);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await p.keyboard.press('c');
  await p.waitForTimeout(200);
  const copia = await p.evaluate(() => navigator.clipboard.readText()).catch((e) => String(e));
  await p.evaluate(() => {
    const par = document.querySelector('[data-pid="cap-01-b1"]');
    const w = document.createTreeWalker(par, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode()) && n.nodeValue.indexOf('Un hecho') < 0) {}
    const r = document.createRange();
    r.setStart(par, 0);
    r.setEnd(n, n.nodeValue.indexOf('Un hecho') + 8);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await p.keyboard.press('2');
  await p.keyboard.press('Escape');
  const a = await p.evaluate(
    (k) => Object.values(JSON.parse(localStorage.getItem(k))).find((x) => x.color === 'cortar'),
    CLAVE_LOCAL
  );
  expect.soft(a && a.cita).toBe('Un hecho');
  expect.soft(copia).toContain('«Un hecho»');
});

test('S13 el foco en una marca sobrevive al repintado por una foto de la base', async ({ abrir }) => {
  const p = await abrir({ contexto: TELEFONO, modo: 'con-base' });
  await seleccionarTexto(p, CITA);
  await p.keyboard.press('1');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const id = await idDe(p, CITA);
  // también con una marca de subrayado, para saber si es previo
  const res = {};
  for (const sel of ['[data-pid="cap-01-b1"] .marca-anot', '[data-pid="cap-01-b1"] mark.hl']) {
    await p.focus(sel);
    const antes = await p.evaluate(() => document.activeElement.className);
    await p.evaluate((id) => window.__cambioExterno(id, { nota: 'remota ' + Math.random() }), id);
    await p.waitForTimeout(150);
    res[sel] = {
      antes,
      despues: await p.evaluate(() => document.activeElement.tagName + '.' + document.activeElement.className),
    };
  }
  expect
    .soft(res['[data-pid="cap-01-b1"] .marca-anot'].despues, 'el foco vuelve a la marca de párrafo')
    .toContain('marca-anot');
  expect.soft(res['[data-pid="cap-01-b1"] mark.hl'].despues, 'y a la marca del subrayado').toContain('MARK.hl');
});

test('S14 cita larga: cambiar una palabra de un párrafo de ~300 palabras se ve como una palabra', async ({ abrir }) => {
  const largo = Array.from({ length: 300 }, (_, i) => 'palabra' + i).join(' ');
  const p = await abrir({
    contexto: { viewport: { width: 1400, height: 900 } },
    preparar: (p) =>
      libroAlterado(p, (L) => {
        const cap1 = L.secciones.find((s) => /^Capítulo 1/.test(s.titulo));
        cap1.bloques[0].html = largo;
      }),
  });
  await p.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  await seleccionarTexto(p, largo);
  await p.keyboard.press('p');
  await p.evaluate(() => {
    const ta = document.activeElement;
    ta.value = ta.value.replace('palabra150', 'PALABRA');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const f = document.querySelector('.ficha.c-revisar');
    const d = f.querySelector('.dif-propuesta');
    return {
      del: Array.from(d.querySelectorAll('del')).map((x) => x.textContent.length),
      ins: Array.from(d.querySelectorAll('ins')).map((x) => x.textContent.length),
      altoDif: Math.round(d.getBoundingClientRect().height),
      altoFicha: Math.round(f.getBoundingClientRect().height),
      cita: f.querySelector('.cita').textContent.length,
    };
  });
  expect.soft(r.del, 'una palabra cambiada se muestra como una palabra').toEqual([10]);
});

test('S15 margen: la propuesta que crece no monta fichas', async ({ abrir }) => {
  const p = await abrir({ contexto: { viewport: { width: 1400, height: 900 } } });
  await p.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  await seleccionarTexto(p, 'La diferencia parece obvia');
  await p.keyboard.press('2');
  await p.keyboard.press('Escape');
  await seleccionarTexto(p, CITA);
  await p.keyboard.press('p');
  await p.keyboard.press('End');
  for (let i = 0; i < 8; i++) await p.keyboard.type(' y una línea más de propuesta para que crezca el cuadro ' + i);
  await p.waitForTimeout(400);
  const solapan = () =>
    p.evaluate(() => {
      const fs = Array.from(document.querySelectorAll('#lista .ficha')).map((f) => f.getBoundingClientRect());
      fs.sort((a, b) => a.top - b.top);
      const out = [];
      for (let i = 1; i < fs.length; i++)
        if (fs[i].top < fs[i - 1].bottom - 1) out.push([Math.round(fs[i - 1].bottom), Math.round(fs[i].top)]);
      return { margen: document.querySelector('#lista').classList.contains('al-margen'), n: fs.length, solapes: out };
    });
  const escribiendo = await solapan();
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  const reposo = await solapan();
  expect.soft(escribiendo.solapes).toEqual([]);
  expect.soft(reposo.solapes).toEqual([]);
});

test('S16 contestar la pregunta en la réplica quita el punto «por revisar» de la marca', async ({ abrir }) => {
  // la copia local con la pregunta, sembrada una sola vez (no en cada recarga)
  const sembrar = ([k]) => {
    if (sessionStorage.getItem('s16')) return;
    sessionStorage.setItem('s16', '1');
    localStorage.setItem(
      k,
      JSON.stringify({
        q1: {
          id: 'q1',
          tipo: 'subrayado',
          sid: 'cap-01',
          sidTitulo: 'Capítulo 1. Hechos y observaciones',
          pid: 'cap-01-b1',
          src: 'x.md:1',
          inicio: 0,
          fin: 29,
          cita: 'Un hecho es lo que se observó',
          antes: '',
          despues: ', no lo que se concluyó de la ',
          color: 'duda',
          nota: '',
          estado: 'abierta',
          creado: '2026-10-01T00:00:00.000Z',
          respuesta: '¿Observado por quién?',
          cierre: 'pregunta',
          respondido: '2026-10-02T00:00:00.000Z',
        },
      })
    );
  };
  const p = await abrir({ contexto: TELEFONO, previo: [[sembrar, [CLAVE_LOCAL]]], esperar: null });
  await p.waitForSelector('[data-pid="cap-01-b1"] .marca-anot');
  const antes = await p.evaluate(() => document.querySelector('[data-pid="cap-01-b1"] .marca-anot').className);
  await p.tap('[data-pid="cap-01-b1"] .marca-anot');
  await p.waitForSelector('.ficha.foco textarea.replica');
  await p.fill('.ficha.foco textarea.replica', 'Por la enfermera de turno.');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const despues = await p.evaluate(() => ({
    marca: document.querySelector('[data-pid="cap-01-b1"] .marca-anot').className,
    etiqueta: document.querySelector('[data-pid="cap-01-b1"] .marca-anot').getAttribute('aria-label'),
    cuenta: document.querySelector('#n-revisar').textContent,
  }));
  expect.soft(despues.marca, 'sin el punto tras contestar').not.toContain('por-revisar');
});

test('S17 propuesta rechazada y conservada en el navegador: al recargar sube', async ({ abrir }) => {
  const p = await abrir({
    modo: 'con-base',
    semilla: {
      s1: {
        id: 's1',
        tipo: 'subrayado',
        sid: 'cap-01',
        sidTitulo: 'Capítulo 1. Hechos y observaciones',
        pid: 'cap-01-b1',
        src: 'x.md:1',
        inicio: 0,
        fin: 29,
        cita: 'Un hecho es lo que se observó',
        antes: '',
        despues: ', no lo que se concluyó de la ',
        color: 'duda',
        nota: '',
        estado: 'abierta',
        creado: '2026-10-01T00:00:00.000Z',
        editado: '2026-10-01T00:00:00.000Z',
        autor: 'u_me',
      },
    },
  });
  await p.evaluate(() => (window.__rechazar = 'unavailable'));
  await enFicha(p, '.ficha[data-id="s1"]', 'button[data-accion="proponer"]');
  await p.keyboard.press('Control+A');
  await p.keyboard.type('Un hecho es lo observado');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(1000);
  const r1 = await p.evaluate(
    (k) => ({
      local: (JSON.parse(localStorage.getItem(k) || '{}').s1 || {}).sugerencia,
      campos: localStorage.getItem(k + ':campos'),
      ficha: document.querySelector('.ficha[data-id="s1"]').className,
    }),
    CLAVE_LOCAL
  );
  await p.reload();
  await p.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  await p.waitForTimeout(800);
  const r2 = await p.evaluate(() => ({
    base: window.__docs.s1.sugerencia,
    dif: (document.querySelector('.ficha[data-id="s1"] .dif-propuesta') || {}).textContent || null,
  }));
  expect.soft(r2.base, 'la propuesta conservada sube al recargar').toBe('Un hecho es lo observado');
});

test('S18 en «Por revisar», tras un redibujo, la tecla «a» escrita en la propuesta no revisa la anotación', async ({
  abrir,
}) => {
  const p = await abrir({
    modo: 'con-base',
    semilla: {
      s1: {
        id: 's1',
        tipo: 'subrayado',
        sid: 'cap-01',
        sidTitulo: 'Capítulo 1. Hechos y observaciones',
        pid: 'cap-01-b1',
        src: 'x.md:1',
        inicio: 0,
        fin: 29,
        cita: 'Un hecho es lo que se observó',
        antes: '',
        despues: ', no lo que se concluyó de la ',
        color: 'duda',
        nota: 'revisar',
        estado: 'resuelta',
        creado: '2026-10-01T00:00:00.000Z',
        editado: '2026-10-01T00:00:00.000Z',
        autor: 'u_me',
        respuesta: 'Cambiado.',
        cierre: 'atendida',
        respondido: '2026-10-02T00:00:00.000Z',
      },
    },
  });
  await p.click('.tab[data-tab="revisar"]');
  await enFicha(p, '.ficha[data-id="s1"]', 'button[data-accion="proponer"]');
  await p.keyboard.type(' por la mañana');
  await p.evaluate(() => window.__cambioExterno('s1', { commit: 'abc123' })); // quien edita añade el commit
  await p.waitForTimeout(100);
  const activo = await p.evaluate(() => document.activeElement.tagName);
  await p.keyboard.type('a'); // sigue escribiendo «a…»
  await p.waitForTimeout(300);
  const d = await p.evaluate(() => ({
    estado: window.__docs.s1.estado,
    revisado: window.__docs.s1.revisado,
    zona: document.querySelector('#deshacer-zona').textContent,
  }));
  expect.soft(d.revisado, 'una tecla perdida no revisa la anotación').toBeUndefined();
});

for (const ancho of [320, 360]) {
  test(`S19 barra de selección con «Proponer» a ${ancho} px`, async ({ abrir }) => {
    const p = await abrir({ contexto: { viewport: { width: ancho, height: 700 }, hasTouch: true } });
    await seleccionarTexto(p, CITA);
    await p.evaluate(() => document.dispatchEvent(new Event('selectionchange')));
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const tb = document.querySelector('#sel-tb'),
        c = tb.getBoundingClientRect();
      const botones = Array.from(tb.querySelectorAll('button')).map((b) => {
        const x = b.getBoundingClientRect();
        return { id: b.id || b.getAttribute('data-c'), l: x.left, r: x.right, t: x.top, b: x.bottom };
      });
      const encimados = botones.flatMap((x, i) =>
        botones
          .slice(i + 1)
          .filter((y) => x.l < y.r - 1 && y.l < x.r - 1 && x.t < y.b - 1 && y.t < x.b - 1)
          .map((y) => x.id + '/' + y.id)
      );
      return {
        visible: getComputedStyle(tb).display !== 'none',
        dentro: c.left >= 0 && c.right <= innerWidth,
        sinDesborde: tb.scrollWidth <= tb.clientWidth,
        proponer: botones.some((x) => x.id === 'sel-proponer'),
        fuera: botones.filter((x) => x.l < c.left - 1 || x.r > c.right + 1).map((x) => x.id),
        chicos: botones.filter((x) => x.r - x.l < 40 || x.b - x.t < 40).map((x) => x.id),
        encimados,
        pagina: document.documentElement.scrollWidth <= innerWidth,
      };
    });
    expect.soft(r.visible && r.proponer, 'la barra aparece con «Proponer»').toBe(true);
    expect.soft(r.dentro && r.sinDesborde && r.pagina, 'la barra cabe en la pantalla, sin desborde').toBe(true);
    expect.soft(r.fuera, 'ningún botón se sale de la barra').toEqual([]);
    expect.soft(r.chicos, 'los botones miden al menos 40 px para el dedo').toEqual([]);
    expect.soft(r.encimados, 'ningún botón se encima a otro').toEqual([]);
  });
}

test('S20 temporizador de un aviso reemplazado y doble clic en Deshacer', async ({ abrir }) => {
  const p = await abrir({ modo: 'con-base' });
  await seleccionarTexto(p, CITA);
  await p.keyboard.press('1');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const id = await idDe(p, CITA);
  await enFicha(p, `.ficha[data-id="${id}"]`, 'button[data-c="cortar"]');
  await p.waitForTimeout(5000);
  await enFicha(p, `.ficha[data-id="${id}"]`, 'button[data-c="duda"]');
  await p.waitForTimeout(4000); // 9 s desde el primero, 4 s desde el segundo
  const zona = await p.evaluate(() => document.querySelector('#deshacer-zona').textContent);
  await p.evaluate(() => (window.__intentos = {}));
  await p.dblclick('#deshacer');
  await p.waitForTimeout(400);
  const r = await p.evaluate(
    (id) => ({ color: window.__docs[id].color, escrituras: window.__intentos.anotaciones || 0 }),
    id
  );
  expect.soft(zona).toBe('Color: duda.Deshacer');
  expect.soft(r.color).toBe('cortar');
});
