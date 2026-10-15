// Revisar: fichas compactas, recorrido, bandeja «Por revisar» y notas al margen.
import fs from 'node:fs';

import { test } from '@playwright/test';

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
} from './ayudas.mjs';

let srv, base;
test.beforeAll(async () => {
  srv = await servir();
  base = `http://127.0.0.1:${srv.address().port}/`;
});
test.afterAll(() => srv.close());

test('Fichas compactas, recorrido, bandeja de revisión y notas al margen (escritorio)', async ({ browser }) => {
  // Cuatro subrayados (dos en un mismo párrafo, uno en la lista, uno en el párrafo del capítulo 2 que cambió) con
  // respuestas de quien edita: atendida, pregunta, descartada y atendida con el pasaje reescrito.
  const ctxV = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxV.addInitScript(sinBase);
  await ctxV.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pv4 = await ctxV.newPage();
  const erroresV = [];
  pv4.on('pageerror', (e) => erroresV.push(String(e)));
  pv4.on('console', (m) => {
    if (m.type() === 'error') erroresV.push(m.text());
  });
  await libroAlterado(pv4, conCambio);
  await pv4.goto(base + '#cap-01');
  await pv4.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  // lo que la versión anterior no tenga no detiene el resto: el clic que no encuentra su botón se anota y sigue
  const tocar = (sel) =>
    pv4.click(sel, { timeout: 2000 }).then(
      () => true,
      () => false
    );
  for (const [t, k] of [
    ['Un hecho es lo que se observó', '1'],
    ['se lee una ficha escrita con prisa', '3'],
    ['Dar por hecho lo que se infirió de una cifra', '2'],
  ]) {
    await seleccionarTexto(pv4, t);
    await pv4.keyboard.press(k);
    await pv4.keyboard.press('Escape');
  }
  await pv4.evaluate(() => {
    location.hash = '#cap-02';
  });
  await esperar(pv4, () => !document.querySelector('#sec-cap-02').hidden);
  await seleccionarTexto(pv4, 'un paso desde lo observado');
  await pv4.keyboard.press('4');
  await pv4.keyboard.press('Escape');
  const clave = await pv4.evaluate(() =>
    Object.keys(localStorage).find((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k))
  );
  const leer = () =>
    pv4.evaluate((k) => {
      const j = JSON.parse(localStorage.getItem(k) || '{}');
      return Object.values(j).sort((a, b) => (a.creado < b.creado ? -1 : 1));
    }, clave);
  const [vA, vB, vC, vD] = (await leer()).map((a) => a.id);
  await pv4.evaluate(
    ({ k, ids }) => {
      const j = JSON.parse(localStorage.getItem(k));
      const [a, b, c, d] = ids;
      Object.assign(j[a], {
        nota: 'Definición demasiado tajante; matizar con un ejemplo clínico.',
        respuesta: 'Añadí el ejemplo de la fiebre referida.',
        cierre: 'atendida',
        commit: 'a1b2c3d',
        respondido: '2026-10-15T12:00:00Z',
      });
      Object.assign(j[b], {
        respuesta: '¿Prefieres «con prisa» o «al final del turno»?',
        cierre: 'pregunta',
        respondido: '2026-10-15T12:10:00Z',
      });
      Object.assign(j[c], {
        nota: 'Repite la idea del párrafo anterior.',
        respuesta: 'Lo dejé: la lista resume el párrafo.',
        cierre: 'descartada',
        respondido: '2026-10-15T12:05:00Z',
        estado: 'resuelta',
      });
      // el reloj de quien responde va dos minutos adelantado respecto del navegador
      Object.assign(j[d], {
        respuesta: 'Cambié «salto» por «paso».',
        cierre: 'atendida',
        respondido: new Date(Date.now() + 120000).toISOString(),
        bh: 'viejo0000000',
      });
      localStorage.setItem(k, JSON.stringify(j));
    },
    { k: clave, ids: [vA, vB, vC, vD] }
  );
  await pv4.goto(base + '#cap-01');
  await pv4.reload();
  await pv4.waitForSelector('article.seccion:not([hidden]) mark.hl');
  // cada marca abre su anotación, aunque el párrafo tenga dos
  await pv4.click(`article.seccion:not([hidden]) mark.hl[data-aids~="${vA}"]`);
  check(
    (await pv4.evaluate(() => (document.querySelector('.ficha.foco') || {}).getAttribute?.('data-id'))) === vA,
    'en un párrafo con dos subrayados, el clic en el primero abre su ficha y no la del otro'
  );
  // ficha compacta: en reposo la nota se lee como texto, sin marco ni botones; activa, con ellos
  const compacta = await pv4.evaluate(
    (ids) => {
      const f = (id) => document.querySelector(`.ficha[data-id="${id}"]`);
      const ta = (id) => f(id) && f(id).querySelector('textarea.nota');
      const marco = (id) => (ta(id) ? getComputedStyle(ta(id)).borderTopColor : null);
      const acc = (id) => (f(id) ? Math.round(f(id).querySelector('.acciones').getBoundingClientRect().height) : null);
      return { reposoMarco: marco(ids.c), reposoAcc: acc(ids.c), activaMarco: marco(ids.a), activaAcc: acc(ids.a) };
    },
    { a: vA, c: vC }
  );
  check(
    compacta.reposoMarco === 'rgba(0, 0, 0, 0)' &&
      compacta.reposoAcc === 0 &&
      compacta.activaMarco !== 'rgba(0, 0, 0, 0)' &&
      compacta.activaAcc > 0,
    `en reposo la ficha es texto (nota sin marco, sin botones); activa muestra el cuadro y las acciones (${JSON.stringify(compacta)})`
  );
  await tocar(`.ficha[data-id="${vC}"] textarea.nota`);
  const tocada = await pv4.evaluate(
    (id) => ({
      foco: (document.querySelector('.ficha.foco') || {}).getAttribute?.('data-id'),
      cursor: document.activeElement.id,
    }),
    vC
  );
  check(
    tocada.foco === vC && tocada.cursor === `nota-${vC}`,
    `tocar la nota de una ficha en reposo la activa con el cursor en la nota (${JSON.stringify(tocada)})`
  );
  await pv4.keyboard.press('Escape');
  // al margen: la ficha a la altura de su pasaje, sin encimarse, y acompaña al texto cuando se desplaza
  const alMargen = () =>
    pv4.evaluate((a) => {
      const capa = document.querySelector('#lista.al-margen .capa-margen');
      if (!capa) return { capa: false };
      const fs = Array.from(capa.querySelectorAll('.ficha'))
        .map((f) => {
          const r = f.getBoundingClientRect();
          return { id: f.getAttribute('data-id'), top: r.top, bottom: r.bottom };
        })
        .sort((x, y) => x.top - y.top);
      const m = document.querySelector(`mark.hl[data-aids~="${a}"]`).getBoundingClientRect();
      const fa = fs.find((x) => x.id === a);
      return {
        capa: true,
        n: fs.length,
        desfase: fa ? Math.round(fa.top - m.top) : null,
        encimadas: fs.some((x, i) => i > 0 && x.top < fs[i - 1].bottom + 6),
        tops: fs.map((x) => Math.round(x.top)),
      };
    }, vA);
  await pv4.waitForTimeout(120);
  const m0 = await alMargen();
  check(
    m0.capa && m0.n === 3 && Math.abs(m0.desfase) <= 3 && !m0.encimadas,
    `en «Sección», las fichas van al margen a la altura de su pasaje y sin encimarse (${JSON.stringify(m0)})`
  );
  await pv4.evaluate(() => {
    document.querySelector('#lectura').scrollTop += 90;
  });
  await pv4.waitForTimeout(120);
  const m1 = await alMargen();
  check(
    m1.capa && Math.abs(m1.desfase) <= 3 && m1.tops.every((t, i) => Math.abs(t - (m0.tops[i] - 90)) <= 3),
    `al desplazar el texto, las fichas lo acompañan (${JSON.stringify({ antes: m0.tops, despues: m1.tops })})`
  );
  await pv4.evaluate(() => {
    document.querySelector('#lectura').scrollTop = 0;
  });
  // el texto cambia de tamaño (o de letra) sin que cambie la ventana: las fichas siguen a su pasaje
  await pulsar(pv4, '#aj-mas');
  await pulsar(pv4, '#aj-mas');
  await pulsar(pv4, '#aj-mas');
  await pv4.waitForTimeout(250);
  const mAa = await alMargen();
  await pv4.evaluate(() => {
    document.querySelector('#ajustes').open = false;
  });
  check(
    mAa.capa && Math.abs(mAa.desfase) <= 3 && !mAa.encimadas,
    `al agrandar el texto con «Aa», las fichas siguen alineadas con su pasaje (${JSON.stringify(mAa)})`
  );
  await pulsar(pv4, '#aj-menos');
  await pulsar(pv4, '#aj-menos');
  await pulsar(pv4, '#aj-menos');
  await pv4.evaluate(() => {
    document.querySelector('#ajustes').open = false;
    document.querySelector('#lectura').scrollTop = 0;
  });
  await pv4.waitForTimeout(150);
  await pv4.click(`article.seccion:not([hidden]) mark.hl[data-aids~="${vC}"]`);
  const visible = await pv4.evaluate((id) => {
    const f = document.querySelector(`.ficha[data-id="${id}"]`),
      l = document.querySelector('#lista').getBoundingClientRect();
    if (!f) return null;
    const r = f.getBoundingClientRect();
    return { foco: f.classList.contains('foco'), dentro: r.top >= l.top - 1 && r.top < l.bottom - 40 };
  }, vC);
  check(
    visible && visible.foco && visible.dentro,
    `la ficha activa al margen queda a la vista (${JSON.stringify(visible)})`
  );
  await pv4.keyboard.press('Escape');
  const sinMargen =
    (await tocar('#b-margen')) &&
    (await pv4.evaluate(() => ({
      pulsado: document.querySelector('#b-margen').getAttribute('aria-pressed'),
      margen: !!document.querySelector('#lista.al-margen'),
      guardado: localStorage.getItem('lector-anotaciones.margen'),
    })));
  await pv4.reload();
  await pv4.waitForSelector('article.seccion:not([hidden]) mark.hl');
  const margenRecarga = await pv4.evaluate(() => ({
    margen: !!document.querySelector('#lista.al-margen'),
    fichas: document.querySelectorAll('#lista .ficha').length,
  }));
  check(
    sinMargen &&
      sinMargen.pulsado === 'false' &&
      !sinMargen.margen &&
      sinMargen.guardado === '0' &&
      !margenRecarga.margen &&
      margenRecarga.fichas === 3,
    `«Al margen» se apaga, vuelve a la lista y se recuerda al recargar (${JSON.stringify({ sinMargen, margenRecarga })})`
  );
  await tocar('#b-margen');
  await tocar('.tab[data-tab="todas"]');
  const enTodas = await pv4.evaluate(() => !!document.querySelector('#lista.al-margen'));
  // hacia atrás con Tab se llega a las acciones de la ficha anterior, aunque esté en reposo
  await pv4.focus(`.ficha[data-id="${vB}"] .cab button[data-accion="ir"]`).catch(() => {});
  await pv4.keyboard.press('Shift+Tab');
  const atras = await pv4.evaluate(() => ({
    accion: document.activeElement.getAttribute('data-accion'),
    ficha: (document.activeElement.closest('.ficha') || { getAttribute: () => null }).getAttribute('data-id'),
    alto: Math.round(document.activeElement.getBoundingClientRect().height),
  }));
  check(
    atras.accion === 'borrar' && atras.ficha === vA && atras.alto > 0,
    `Shift+Tab desde una ficha llega a «Borrar» de la anterior, que se muestra al recibir el foco (${JSON.stringify(atras)})`
  );
  await pv4.keyboard.press('Escape');
  await tocar('.tab[data-tab="capitulo"]');
  // buscar desde «Sección» al margen: los resultados son una lista que se desplaza
  await pv4.fill('#buscar', 'de');
  await pv4.press('#buscar', 'Enter');
  await pv4.waitForTimeout(100);
  const rBusq = await pv4.$eval('#lista', (l) => l.getBoundingClientRect());
  await pv4.mouse.move(rBusq.x + rBusq.width / 2, rBusq.y + 40);
  for (let i = 0; i < 6; i++) await pv4.mouse.wheel(0, 300);
  await pv4.waitForTimeout(150);
  const busq = await pv4.evaluate(() => ({
    res: document.querySelectorAll('#lista .res').length,
    margen: !!document.querySelector('#lista.al-margen, #panel.margen'),
    desplazado: document.querySelector('#panel').scrollTop + document.querySelector('#lista').scrollTop,
  }));
  check(
    busq.res > 8 && !busq.margen && busq.desplazado > 0,
    `buscar desde «Sección» con las notas al margen deja una lista de resultados que se desplaza (${JSON.stringify(busq)})`
  );
  await pv4.fill('#buscar', '');
  await tocar('.tab[data-tab="capitulo"]');
  check(
    !enTodas && (await pv4.evaluate(() => !!document.querySelector('#lista.al-margen'))),
    '«Todas» es una lista; al volver a «Sección» las fichas vuelven al margen'
  );
  // recorrer con . y , en el orden del libro, de una sección a otra
  await pv4.focus('#lectura');
  const pos = () =>
    pv4.evaluate(() => ({
      ff: (document.querySelector('.ficha.foco') || {}).getAttribute?.('data-id') || null,
      pos: (document.querySelector('#anot-pos') || {}).textContent || '',
      sec: Array.from(document.querySelectorAll('article.seccion'))
        .filter((a) => !a.hidden)
        .map((a) => a.id)
        .join(),
    }));
  await pv4.keyboard.press('.');
  const r1 = await pos();
  await pv4.keyboard.press('.');
  await pv4.keyboard.press('.');
  await pv4.keyboard.press('.');
  const r4 = await pos();
  await pv4.keyboard.press('.');
  await pv4.waitForTimeout(150);
  const fin = { ...(await pos()), anuncio: await pv4.$eval('#anuncio', (n) => n.textContent) };
  await pv4.keyboard.press(',');
  const r3 = await pos();
  await tocar('#anot-ant');
  const r2 = await pos();
  check(
    r1.ff === vA &&
      r1.pos === '1 de 4' &&
      r4.ff === vD &&
      r4.sec === 'sec-cap-02' &&
      r4.pos === '4 de 4' &&
      fin.ff === vD &&
      /última/.test(fin.anuncio) &&
      r3.ff === vC &&
      r3.sec === 'sec-cap-01' &&
      r2.ff === vB,
    `. y , (y ‹ ›) recorren las anotaciones en orden, cambian de sección y avisan al llegar al final (${JSON.stringify({ r1, r4, fin, r3, r2 })})`
  );
  await pv4.keyboard.press('Escape');
  // bandeja «Por revisar»: cuenta, A atendida, contestar la pregunta, R reabrir, ver el cambio
  const cuenta = () => pv4.evaluate(() => (document.querySelector('#n-revisar') || {}).textContent ?? null);
  const enBandeja = await tocar('#tab-revisar');
  const bandeja = await pv4.evaluate(() => ({
    cab: (document.querySelector('.bandeja-cab') || {}).textContent || '',
    fichas: document.querySelectorAll('#lista .ficha.por-revisar').length,
  }));
  check(
    enBandeja && (await cuenta()) === '4' && /4 respuestas por revisar/.test(bandeja.cab) && bandeja.fichas === 4,
    `«Por revisar» cuenta y lista las respuestas nuevas (${JSON.stringify(bandeja)})`
  );
  await pv4.keyboard.press('.');
  // A mantenida: la repetición del teclado no resuelve las siguientes sin verlas
  await pv4.keyboard.down('a');
  await pv4.keyboard.down('a');
  await pv4.keyboard.down('a');
  await pv4.keyboard.up('a');
  const trasRepetir = await leer();
  check(
    !trasRepetir[1].revisado && !trasRepetir[2].revisado,
    `mantener A pulsada resuelve sólo la respuesta a la vista (${JSON.stringify(trasRepetir.map((a) => !!a.revisado))})`
  );
  // en concentración el panel no se ve: A no resuelve a ciegas
  await pv4.keyboard.press('f');
  await pv4.keyboard.press('a');
  const aCiegas = (await leer())[1];
  await pv4.keyboard.press('f');
  check(
    !aCiegas.revisado && aCiegas.estado !== 'resuelta',
    'en concentración, con el panel oculto, A no resuelve nada'
  );
  const trasA = (await leer())[0];
  const despuesA = await pv4.evaluate(
    (id) => ({
      ff: (document.querySelector('.ficha.foco') || {}).getAttribute?.('data-id'),
      revisada: !!document.querySelector(`#lista .ficha.revisada[data-id="${id}"]`),
    }),
    vA
  );
  check(
    trasA.estado === 'resuelta' &&
      !!trasA.revisado &&
      despuesA.ff === vB &&
      despuesA.revisada &&
      (await cuenta()) === '3',
    `A deja la respuesta atendida (resuelta y revisada), la mantiene a la vista marcada y pasa a la siguiente (${JSON.stringify({ estado: trasA.estado, revisado: trasA.revisado, ...despuesA })})`
  );
  await tocar(`.ficha[data-id="${vB}"] textarea.replica`);
  await pv4.keyboard.type('Al final del turno');
  await pv4.keyboard.press('Escape');
  await pv4.waitForTimeout(100);
  const trasB = (await leer())[1];
  check(
    trasB.replica === 'Al final del turno' && !!trasB.revisado && (await cuenta()) === '2',
    `contestar la pregunta la da por revisada (${JSON.stringify({ replica: trasB.replica, revisado: trasB.revisado })})`
  );
  await pv4.focus(`.ficha[data-id="${vB}"]`).catch(() => {});
  await pv4.keyboard.press('.');
  await pv4.keyboard.press('r');
  const trasR = (await leer())[2];
  const cursorR = await pv4.evaluate(() => document.activeElement.id);
  check(
    trasR.estado === 'abierta' && !!trasR.revisado && cursorR === `nota-${vC}`,
    `R reabre la respuesta descartada, la da por revisada y deja el cursor en la nota (${JSON.stringify({ estado: trasR.estado, cursorR })})`
  );
  await pv4.keyboard.type(' Mejor quitarla.');
  await pv4.keyboard.press('Escape');
  // quien vuelca las anotaciones ve que el autor la devolvió
  const copiaR = await enFicha(pv4, `.ficha[data-id="${vC}"]`, 'button[data-accion="copiar"]')
    .then(
      () => pv4.evaluate(() => navigator.clipboard.readText()),
      () => ''
    )
    .catch(() => '');
  check(
    /Respuesta \(descartada\): .*\nReabierta por el autor tras la respuesta\./.test(copiaR),
    `«Copiar» en una respuesta reabierta lo dice (${JSON.stringify(copiaR.split('\n').slice(-2))})`
  );
  await pv4.focus(`.ficha[data-id="${vC}"]`).catch(() => {});
  await pv4.keyboard.press('.');
  await pv4.waitForTimeout(150);
  const enD = await pv4.evaluate(
    (id) => ({
      ff: (document.querySelector('.ficha.foco') || {}).getAttribute?.('data-id'),
      sec: !document.querySelector('#sec-cap-02').hidden,
      diff: !!document.querySelector('#sec-cap-02 .diff'),
      boton: !!document.querySelector(`.ficha[data-id="${id}"] [data-accion="cambio"]`),
    }),
    vD
  );
  await pv4.evaluate(() => {
    const d = document.querySelector('#sec-cap-02 .diff');
    if (d) d.remove();
  });
  await pv4.keyboard.press('v');
  await pv4.waitForTimeout(100);
  const conV = await pv4.evaluate(() => !!document.querySelector('#sec-cap-02 .diff'));
  check(
    enD.ff === vD && enD.sec && enD.diff && enD.boton && conV,
    `llegar a una respuesta cuyo pasaje cambió lleva a él con el antes y el después abiertos; V los vuelve a mostrar (${JSON.stringify({ ...enD, conV })})`
  );
  await pv4.keyboard.press('a');
  await pv4.waitForTimeout(150);
  const vacia = await pv4.evaluate(() => ({
    anuncio: document.querySelector('#anuncio').textContent,
    fichas: document.querySelectorAll('#lista .ficha').length,
    revisadas: document.querySelectorAll('#lista .ficha.revisada').length,
  }));
  const opacidad = await pv4.evaluate(() => {
    const f = document.querySelector('#lista .ficha.revisada');
    return f ? getComputedStyle(f).opacity : null;
  });
  check(opacidad === '1', `lo revisado se marca sin apagar el texto (opacidad ${opacidad})`);
  check(
    (await cuenta()) === '' && /No quedan/.test(vacia.anuncio) && vacia.fichas === 4 && vacia.revisadas === 4,
    `al terminar lo avisa, y lo revisado sigue a la vista hasta salir de la pestaña (${JSON.stringify(vacia)})`
  );
  await tocar('.tab[data-tab="todas"]');
  await tocar('#tab-revisar');
  const vuelta = await pv4.evaluate(() => ({
    fichas: document.querySelectorAll('#lista .ficha').length,
    vacio: (document.querySelector('#lista .vacio') || {}).textContent || '',
  }));
  check(
    vuelta.fichas === 0 && /No hay respuestas por revisar/.test(vuelta.vacio),
    `al volver, la bandeja está vacía (${JSON.stringify(vuelta)})`
  );
  // una respuesta posterior a la revisión vuelve a la bandeja
  await pv4.evaluate(
    ({ k, id }) => {
      const j = JSON.parse(localStorage.getItem(k));
      j[id].respondido = new Date(Date.now() + 60000).toISOString();
      j[id].respuesta = 'Lo volví a matizar.';
      localStorage.setItem(k, JSON.stringify(j));
    },
    { k: clave, id: vA }
  );
  await pv4.reload();
  await pv4.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  check(
    (await cuenta()) === '1',
    'lo revisado se recuerda al recargar, y una respuesta nueva a lo ya revisado vuelve a la bandeja'
  );
  check(
    (await pv4.evaluate(() => document.querySelector('#b-panel').textContent.replace(/\s+/g, ' ').trim())) ===
      'Anotaciones (4), 1 respuesta por revisar',
    'el botón del panel en el teléfono dice qué cuenta su número'
  );
  // en el teléfono no hay margen: la lista de siempre, en la hoja
  await pv4.setViewportSize({ width: 400, height: 800 });
  await pv4.waitForTimeout(150);
  const movilMargen = await pv4.evaluate(() => ({
    boton: getComputedStyle(document.querySelector('#b-margen') || document.body).display,
    margen: !!document.querySelector('#lista.al-margen'),
  }));
  check(
    movilMargen.boton === 'none' && !movilMargen.margen,
    `en pantalla estrecha no hay notas al margen (${JSON.stringify(movilMargen)})`
  );
  check(
    erroresV.length === 0,
    `sin errores de consola al revisar y recorrer${erroresV.length ? ': ' + erroresV.join(' | ') : ''}`
  );
  await ctxV.close();
});

test('Revisar y recorrer: casos límite (escritorio)', async ({ browser }) => {
  // Dos bloques del capítulo 2 cuyo texto anterior tenía la misma cita; una nota de sección, una de página (en un libro
  // sin páginas) y una general; dos subrayados con respuesta en el capítulo 1 y cinco más en su último párrafo (el que
  // cierra el artículo: la pila de fichas pasa de su final).
  const conDosAnteriores = (L) => {
    const cap2 = L.secciones.find((s) => /^Capítulo 2/.test(s.titulo));
    const b1 = cap2.bloques.find((b) => b.id === 'cap-02-b1'),
      b3 = cap2.bloques.find((b) => b.id === 'cap-02-b3');
    b1.anterior = b1.html + ' Lo que importa realmente es otra cosa.';
    b3.anterior = b3.html.replace('que importa es', 'que importa realmente es');
    L.anterior_generado = '2026-01-01';
    L.cambios = 2;
  };
  const ctxL = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxL.addInitScript(sinBase);
  const pl = await ctxL.newPage();
  const erroresL = [];
  pl.on('pageerror', (e) => erroresL.push(String(e)));
  await libroAlterado(pl, conDosAnteriores);
  await pl.goto(base + '#cap-01');
  await pl.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  const citasL = [
    ['Un hecho es lo que se observó', '1'],
    ['Dar por hecho lo que se infirió de una cifra', '2'],
    ['Este párrafo', '4'],
    ['cierra el capítulo', '4'],
    ['una idea sencilla', '4'],
    ['escribir mejor', '4'],
    ['separar mejor', '4'],
  ];
  for (const [t, k] of citasL) {
    await seleccionarTexto(pl, t);
    await pl.keyboard.press(k);
    await pl.keyboard.press('Escape');
  }
  const claveCL = await pl.evaluate(() =>
    Object.keys(localStorage).find((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k))
  );
  const leerL = () => pl.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), claveCL);
  const creadas = Object.values(await leerL())
    .sort((a, b) => (a.creado < b.creado ? -1 : 1))
    .map((a) => a.id);
  const [h1, h2, q1, q2, q3] = creadas;
  await pl.evaluate(
    ({ k, ids }) => {
      const j = JSON.parse(localStorage.getItem(k));
      const [h1, h2, ...qs] = ids;
      const cap1 = 'Capítulo 1. Hechos y observaciones',
        cap2 = 'Capítulo 2. Inferencias';
      Object.assign(j[h1], {
        nota: 'Primera línea de una nota larga.\nSegunda.\nTercera.\nCuarta.\nQuinta.\nSexta.\nSéptima.\nOctava.',
        respuesta:
          'Una respuesta larga que ocupa varias líneas del panel para que la ficha activa sea más alta que lo que se ve de la lista cuando la ventana es baja, y así poner a prueba el recorrido con Tab por sus controles.',
        cierre: 'atendida',
        respondido: '2026-10-15T10:00:00.000Z',
      });
      Object.assign(j[h2], {
        respuesta: 'Quité la cifra.',
        cierre: 'atendida',
        respondido: '2026-10-15T10:01:00.000Z',
      });
      qs.forEach((id, i) => {
        j[id].nota = `Nota ${i + 1}: un texto de prueba con palabras suficientes para poner el cursor en medio.`;
      });
      j.s1 = {
        id: 's1',
        tipo: 'capitulo',
        sid: 'cap-01',
        sidTitulo: cap1,
        nota: 'Nota de la sección',
        estado: 'abierta',
        creado: '2026-10-01T00:00:00.000Z',
        autor: null,
      };
      // de otra sección (el prefacio), y antes en el orden: la primera a la que se llega con el filtro «notas»
      j.pg = {
        id: 'pg',
        tipo: 'pagina',
        pagina: 5,
        sid: 'prefacio',
        sidTitulo: 'Prefacio',
        nota: 'Nota de la página 5',
        estado: 'abierta',
        creado: '2026-10-01T00:01:00.000Z',
        autor: null,
      };
      j.g = {
        id: 'g',
        tipo: 'general',
        nota: 'Nota general',
        estado: 'abierta',
        creado: '2026-10-01T00:02:00.000Z',
        autor: null,
      };
      j.p = {
        id: 'p',
        tipo: 'subrayado',
        sid: 'cap-02',
        sidTitulo: cap2,
        pid: 'cap-02-b3',
        src: 'cap2.md:5',
        inicio: 21,
        fin: 38,
        cita: 'importa realmente',
        antes: 'La incertidumbre que ',
        despues: ' es la que cambiaría',
        color: 'duda',
        nota: '',
        estado: 'abierta',
        creado: '2026-10-01T00:03:00.000Z',
        bh: 'viejo0000000',
        autor: null,
        respuesta: 'Quité «realmente».',
        cierre: 'atendida',
        respondido: '2026-10-15T10:02:00.000Z',
      };
      localStorage.setItem(k, JSON.stringify(j));
    },
    { k: claveCL, ids: creadas }
  );
  await pl.reload();
  await pl.waitForSelector('article.seccion:not([hidden]) mark.hl');
  await pl.waitForTimeout(150);
  const caja = (sel) =>
    pl.evaluate((s) => {
      const n = document.querySelector(s),
        l = document.querySelector('#lista').getBoundingClientRect();
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        lTop: Math.round(l.top),
        lBottom: Math.round(l.bottom),
        dentro: r.top >= l.top - 1 && r.bottom <= l.bottom + 1,
      };
    }, sel);
  // con el texto arriba del todo, la nota de la sección (anclada al título) se ve entera bajo la cabecera del panel
  const sec = await caja('#lista.al-margen .ficha[data-id="s1"]');
  check(
    sec && sec.dentro,
    `al margen, la nota de la sección se ve entera con el texto al principio (${JSON.stringify(sec)})`
  );
  // las fichas apiladas más allá del final del artículo se alcanzan desplazando el texto hasta abajo
  await pl.evaluate(() => {
    const l = document.querySelector('#lectura');
    l.scrollTop = l.scrollHeight;
  });
  await pl.waitForTimeout(150);
  const ultima = await pl.evaluate(() => {
    const fs = Array.from(document.querySelectorAll('.capa-margen .ficha'))
      .map((f) => f.getBoundingClientRect())
      .sort((a, b) => a.top - b.top);
    const l = document.querySelector('#lista').getBoundingClientRect();
    const u = fs[fs.length - 1];
    return u ? { bottom: Math.round(u.bottom), lBottom: Math.round(l.bottom), n: fs.length } : null;
  });
  check(
    ultima && ultima.n === 8 && ultima.bottom <= ultima.lBottom + 1,
    `con el texto al final, la última ficha apilada se ve (${JSON.stringify(ultima)})`
  );
  await pl.evaluate(() => {
    document.querySelector('#lectura').scrollTop = 0;
  });
  await pl.waitForTimeout(100);
  // tocar la nota de una ficha que la pila empujó hacia abajo: el cursor queda donde se tocó
  // el texto se desplaza hasta que la ficha queda a media altura (la capa se sincroniza en el cuadro siguiente)
  for (let i = 0; i < 2; i++) {
    await pl.evaluate((id) => {
      document.querySelector('#lectura').scrollTop +=
        document.querySelector(`.ficha[data-id="${id}"]`).getBoundingClientRect().top - 400;
    }, q3);
    await pl.waitForTimeout(100);
  }
  const rq = await pl.$eval(`.ficha[data-id="${q3}"] textarea.nota`, (t) => {
    const r = t.getBoundingClientRect();
    return { x: r.left + 60, y: r.top + 9 };
  });
  await pl.mouse.move(rq.x, rq.y);
  await pl.mouse.down();
  const cursor0 = await pl.$eval(`.ficha[data-id="${q3}"] textarea.nota`, (t) => t.selectionStart);
  await pl.mouse.move(rq.x + 1, rq.y);
  await pl.mouse.up();
  await pl.waitForTimeout(120);
  const cursor1 = await pl.evaluate((id) => {
    const t = document.querySelector(`.ficha[data-id="${id}"] textarea.nota`);
    return { fin: t.selectionStart, finSel: t.selectionEnd, foco: document.activeElement === t };
  }, q3);
  check(
    cursor1.foco && Math.abs(cursor1.fin - cursor0) <= 1 && cursor1.finSel === cursor1.fin,
    `tocar la nota de una ficha empujada deja el cursor donde se tocó (${cursor0} → ${JSON.stringify(cursor1)})`
  );
  await pl.keyboard.press('Escape');
  // ventana baja y una ficha más alta que la lista: con Tab, cada control que recibe el foco se ve
  await pl.setViewportSize({ width: 1280, height: 520 });
  await pl.waitForTimeout(150);
  await pl.focus(`.ficha[data-id="${h1}"] textarea.nota`);
  let alBorrar = null;
  // se mide un momento después: el navegador desplaza la lista para mostrar el foco y la página lo corrige en el cuadro siguiente
  for (let i = 0; i < 14 && !alBorrar; i++) {
    await pl.keyboard.press('Tab');
    if ((await pl.evaluate(() => document.activeElement.getAttribute('data-accion'))) === 'borrar') {
      await pl.waitForTimeout(150);
      alBorrar = await caja(':focus');
    }
  }
  check(
    alBorrar && alBorrar.dentro,
    `en una ficha más alta que la lista, «Borrar» queda a la vista al llegar con Tab (${JSON.stringify(alBorrar)})`
  );
  await pl.keyboard.press('Escape');
  await pl.setViewportSize({ width: 1280, height: 900 });
  await pl.waitForTimeout(150);
  // «✓ Atendida» fuera de la bandeja deja la ficha donde está
  const cuentaL = () => pl.evaluate(() => document.querySelector('#n-revisar').textContent);
  await enFicha(pl, `.ficha[data-id="${h1}"]`, 'button[data-accion="atendida"]');
  await pl.waitForTimeout(100);
  const enSitio = await pl.evaluate(
    (id) => ({
      tab: document.querySelector('.tab.activa').getAttribute('data-tab'),
      sec: !document.querySelector('#sec-cap-01').hidden,
      foco: (document.activeElement.closest('.ficha') || { getAttribute: () => null }).getAttribute('data-id') === id,
    }),
    h1
  );
  check(
    (await leerL())[h1].estado === 'resuelta' &&
      enSitio.tab === 'capitulo' &&
      enSitio.sec &&
      enSitio.foco &&
      (await cuentaL()) === '2',
    `«✓ Atendida» en «Sección» la resuelve y deja la ficha donde está, con el foco en ella (${JSON.stringify(enSitio)})`
  );
  // en la bandeja: de una cita perdida se va al bloque donde estaba (por su contexto), no al primero que la tenía
  await pl.click('#tab-revisar');
  await pl.focus('#lectura');
  await pl.keyboard.press('.');
  await pl.keyboard.press('a');
  await pl.waitForTimeout(150);
  const perdida = await pl.evaluate(() => ({
    ff: (document.querySelector('.ficha.foco') || { getAttribute: () => null }).getAttribute('data-id'),
    b3: !!document.querySelector('.diff[data-de="cap-02-b3"]'),
    b1: !!document.querySelector('.diff[data-de="cap-02-b1"]'),
  }));
  check(
    perdida.ff === 'p' && perdida.b3 && !perdida.b1,
    `una cita que ya no está lleva al bloque donde estaba según su contexto (${JSON.stringify(perdida)})`
  );
  // salir de la bandeja por la búsqueda también la vacía de lo revisado
  await pl.fill('#buscar', 'hecho');
  await pl.press('#buscar', 'Enter');
  await pl.click('#tab-revisar');
  const trasBuscar = await pl.$$eval('#lista .ficha', (fs) => fs.map((f) => f.getAttribute('data-id')));
  check(
    trasBuscar.length === 1 && trasBuscar[0] === 'p',
    `salir de «Por revisar» por la búsqueda saca lo revisado de la bandeja (${JSON.stringify(trasBuscar)})`
  );
  await pl.fill('#buscar', '');
  // . con el filtro «notas» en «Sección»: una nota de página sin su página en el texto no quita el filtro
  await pl.click('.tab[data-tab="capitulo"]');
  await pl.keyboard.press('Escape');
  await pulsar(pl, '.filtro[data-f="notas"]');
  await pl.focus('#lectura');
  const pasos = [];
  for (let i = 0; i < 3; i++) {
    await pl.keyboard.press('.');
    pasos.push(
      await pl.evaluate(() => ({
        f: document.querySelector('.filtro.on').getAttribute('data-f'),
        ff: (document.querySelector('#lista .ficha.foco') || { getAttribute: () => null }).getAttribute('data-id'),
      }))
    );
  }
  check(
    pasos.every((x) => x.f === 'notas' && x.ff) &&
      pasos
        .map((x) => x.ff)
        .sort()
        .join() === 'g,pg,s1',
    `. recorre las notas sin quitar el filtro y cada ficha a la que llega se ve (${JSON.stringify(pasos)})`
  );
  // . después de que la actual salió de la lista: sigue desde donde estaba, no desde el principio
  await pl.click('.tab[data-tab="todas"]');
  await pulsar(pl, '.filtro[data-f="abiertas"]');
  await enFicha(pl, '.ficha[data-id="p"]', 'button[data-accion="atendida"]');
  await pl.waitForTimeout(100);
  await pl.keyboard.press('.');
  const sigue = await pl.evaluate(() =>
    (document.querySelector('#lista .ficha.foco') || { getAttribute: () => null }).getAttribute('data-id')
  );
  check(sigue === 'g', `si la actual sale de la lista filtrada, . pasa a la que le seguía (${sigue})`);
  check(
    erroresL.length === 0,
    `sin errores de consola en los casos límite${erroresL.length ? ': ' + erroresL.join(' | ') : ''}`
  );
  await ctxL.close();
});

test('Por revisar: sólo lo propio, y sin identidad, sólo lo sin autor', async ({ browser }) => {
  const semillaRevisar = () => {
    window.__semilla = {
      mia: {
        id: 'mia',
        tipo: 'general',
        nota: 'Mía',
        estado: 'abierta',
        creado: '2026-10-02T00:00:00.000Z',
        autor: 'u_me',
        respuesta: 'Hecho.',
        cierre: 'atendida',
        respondido: '2026-10-03T10:00:00.000Z',
      },
      suya: {
        id: 'suya',
        tipo: 'general',
        nota: 'De otra lectora',
        estado: 'abierta',
        creado: '2026-10-02T01:00:00.000Z',
        autor: 'u_otro',
        respuesta: 'Hecho también.',
        cierre: 'atendida',
        respondido: '2026-10-03T10:00:00.000Z',
      },
    };
  };
  for (const sinId of [false, true]) {
    const cx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await cx.addInitScript(semillaRevisar);
    if (sinId)
      await cx.addInitScript(() => {
        window.__sinUsuario = true;
      });
    await cx.addInitScript(conBase);
    const px = await cx.newPage();
    await px.goto(base);
    await px.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
    await px.waitForTimeout(250);
    const r = await px.evaluate(() => ({
      estado: document.querySelector('#estado').textContent,
      cuenta: document.querySelector('#n-revisar').textContent,
      anuncio: document.querySelector('#anuncio').textContent,
    }));
    if (!sinId)
      check(
        /· 1 respuesta por revisar/.test(r.estado) && r.cuenta === '1' && !/2 respuestas/.test(r.anuncio),
        `al conectar se cuentan y anuncian sólo las respuestas propias (${JSON.stringify(r)})`
      );
    else
      check(
        !/por revisar/.test(r.estado) && r.cuenta === '' && !/por revisar/.test(r.anuncio),
        `sin identidad no se ofrece revisar las respuestas de anotaciones con autor (${JSON.stringify(r)})`
      );
    await cx.close();
  }
});
