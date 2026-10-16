// Revisar: fichas compactas, recorrido, bandeja «Por revisar» y notas al margen.
import fs from 'node:fs';

import {
  check,
  esperar,
  abrirDe,
  pulsar,
  enFicha,
  seleccionarTexto,
  libroAlterado,
  conCambio,
  CLAVE_LOCAL,
  TELEFONO,
  sinErrores,
  tocar,
  test,
} from './ayudas.mjs';

// ------------------------------------------------------------ cuatro respuestas por revisar
// Cuatro subrayados (dos en un mismo párrafo, uno en la lista, uno en el párrafo del capítulo 2 que cambió) con
// respuestas de quien edita: atendida, pregunta, descartada y atendida con el pasaje reescrito. Sin base.
async function cuatroRespondidas(abrir, base) {
  const p = await abrir({
    permisos: ['clipboard-read', 'clipboard-write'],
    preparar: (p) => libroAlterado(p, conCambio),
  });
  for (const [t, k] of [
    ['Un hecho es lo que se observó', '1'],
    ['se lee una ficha escrita con prisa', '3'],
    ['Dar por hecho lo que se infirió de una cifra', '2'],
  ]) {
    await seleccionarTexto(p, t);
    await p.keyboard.press(k);
    await p.keyboard.press('Escape');
  }
  await p.evaluate(() => {
    location.hash = '#cap-02';
  });
  await esperar(p, () => !document.querySelector('#sec-cap-02').hidden);
  await seleccionarTexto(p, 'un paso desde lo observado');
  await p.keyboard.press('4');
  await p.keyboard.press('Escape');
  const clave = await p.evaluate(() =>
    Object.keys(localStorage).find((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k))
  );
  const leer = () =>
    p.evaluate((k) => {
      const j = JSON.parse(localStorage.getItem(k) || '{}');
      return Object.values(j).sort((a, b) => (a.creado < b.creado ? -1 : 1));
    }, clave);
  const [vA, vB, vC, vD] = (await leer()).map((a) => a.id);
  await p.evaluate(
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
  await p.goto(base + '#cap-01');
  await p.reload();
  await p.waitForSelector('article.seccion:not([hidden]) mark.hl');
  return { p, vA, vB, vC, vD, clave, leer };
}
const fichaActiva = (p) =>
  p.evaluate(() => (document.querySelector('.ficha.foco') || { getAttribute: () => null }).getAttribute('data-id'));
const cuentaRevisar = (p) => p.evaluate(() => (document.querySelector('#n-revisar') || {}).textContent ?? null);

test('Ficha compacta: cada marca abre la suya; en reposo es texto; tocar la nota la activa', async ({
  abrir,
  base,
}) => {
  const { p, vA, vC } = await cuatroRespondidas(abrir, base);
  await p.click(`article.seccion:not([hidden]) mark.hl[data-aids~="${vA}"]`);
  check(
    (await fichaActiva(p)) === vA,
    'en un párrafo con dos subrayados, el clic en el primero abre su ficha y no la del otro'
  );
  const compacta = await p.evaluate(
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
  await tocar(p, `.ficha[data-id="${vC}"] textarea.nota`);
  const tocada = { foco: await fichaActiva(p), cursor: await p.evaluate(() => document.activeElement.id) };
  check(
    tocada.foco === vC && tocada.cursor === `nota-${vC}`,
    `tocar la nota de una ficha en reposo la activa con el cursor en la nota (${JSON.stringify(tocada)})`
  );
  sinErrores(p, 'en las fichas compactas', { consola: true });
});

// Las fichas al margen de la sección visible: su posición respecto del pasaje de `a`, si se enciman y sus alturas.
const alMargen = (p, a) =>
  p.evaluate((a) => {
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
  }, a);

test('Al margen: cada ficha a la altura de su pasaje, sin encimarse, con el texto que se desplaza o crece', async ({
  abrir,
  base,
}) => {
  const { p, vA, vC } = await cuatroRespondidas(abrir, base);
  await p.waitForTimeout(120);
  const m0 = await alMargen(p, vA);
  check(
    m0.capa && m0.n === 3 && Math.abs(m0.desfase) <= 3 && !m0.encimadas,
    `en «Sección», las fichas van al margen a la altura de su pasaje y sin encimarse (${JSON.stringify(m0)})`
  );
  await p.evaluate(() => {
    document.querySelector('#lectura').scrollTop += 90;
  });
  await p.waitForTimeout(120);
  const m1 = await alMargen(p, vA);
  check(
    m1.capa && Math.abs(m1.desfase) <= 3 && m1.tops.every((t, i) => Math.abs(t - (m0.tops[i] - 90)) <= 3),
    `al desplazar el texto, las fichas lo acompañan (${JSON.stringify({ antes: m0.tops, despues: m1.tops })})`
  );
  await p.evaluate(() => {
    document.querySelector('#lectura').scrollTop = 0;
  });
  // el texto cambia de tamaño (o de letra) sin que cambie la ventana: las fichas siguen a su pasaje
  for (let i = 0; i < 3; i++) await pulsar(p, '#aj-mas');
  await p.waitForTimeout(250);
  const mAa = await alMargen(p, vA);
  check(
    mAa.capa && Math.abs(mAa.desfase) <= 3 && !mAa.encimadas,
    `al agrandar el texto con «Aa», las fichas siguen alineadas con su pasaje (${JSON.stringify(mAa)})`
  );
  for (let i = 0; i < 3; i++) await pulsar(p, '#aj-menos');
  await p.evaluate(() => {
    document.querySelector('#ajustes').open = false;
    document.querySelector('#lectura').scrollTop = 0;
  });
  await p.waitForTimeout(150);
  await p.click(`article.seccion:not([hidden]) mark.hl[data-aids~="${vC}"]`);
  const visible = await p.evaluate((id) => {
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
  sinErrores(p, 'al margen', { consola: true });
});

test('«Al margen» se apaga, vuelve a la lista y se recuerda al recargar', async ({ abrir, base }) => {
  const { p } = await cuatroRespondidas(abrir, base);
  const sinMargen =
    (await tocar(p, '#b-margen')) &&
    (await p.evaluate(() => ({
      pulsado: document.querySelector('#b-margen').getAttribute('aria-pressed'),
      margen: !!document.querySelector('#lista.al-margen'),
      guardado: localStorage.getItem('lector-anotaciones.margen'),
    })));
  await p.reload();
  await p.waitForSelector('article.seccion:not([hidden]) mark.hl');
  const margenRecarga = await p.evaluate(() => ({
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
});

test('«Todas» es una lista, Shift+Tab llega a la ficha anterior, y buscar desde el margen da una lista', async ({
  abrir,
  base,
}) => {
  const { p, vA, vB } = await cuatroRespondidas(abrir, base);
  await tocar(p, '.tab[data-tab="todas"]');
  const enTodas = await p.evaluate(() => !!document.querySelector('#lista.al-margen'));
  // hacia atrás con Tab se llega a las acciones de la ficha anterior, aunque esté en reposo
  await p.focus(`.ficha[data-id="${vB}"] .cab button[data-accion="ir"]`).catch(() => {});
  await p.keyboard.press('Shift+Tab');
  const atras = await p.evaluate(() => ({
    accion: document.activeElement.getAttribute('data-accion'),
    ficha: (document.activeElement.closest('.ficha') || { getAttribute: () => null }).getAttribute('data-id'),
    alto: Math.round(document.activeElement.getBoundingClientRect().height),
  }));
  check(
    atras.accion === 'borrar' && atras.ficha === vA && atras.alto > 0,
    `Shift+Tab desde una ficha llega a «Borrar» de la anterior, que se muestra al recibir el foco (${JSON.stringify(atras)})`
  );
  await p.keyboard.press('Escape');
  await tocar(p, '.tab[data-tab="capitulo"]');
  // buscar desde «Sección» al margen: los resultados son una lista que se desplaza
  await p.fill('#buscar', 'de');
  await p.press('#buscar', 'Enter');
  await p.waitForTimeout(100);
  const rBusq = await p.$eval('#lista', (l) => l.getBoundingClientRect());
  await p.mouse.move(rBusq.x + rBusq.width / 2, rBusq.y + 40);
  for (let i = 0; i < 6; i++) await p.mouse.wheel(0, 300);
  await p.waitForTimeout(150);
  const busq = await p.evaluate(() => ({
    res: document.querySelectorAll('#lista .res').length,
    margen: !!document.querySelector('#lista.al-margen, #panel.margen'),
    desplazado: document.querySelector('#panel').scrollTop + document.querySelector('#lista').scrollTop,
  }));
  check(
    busq.res > 8 && !busq.margen && busq.desplazado > 0,
    `buscar desde «Sección» con las notas al margen deja una lista de resultados que se desplaza (${JSON.stringify(busq)})`
  );
  await p.fill('#buscar', '');
  await tocar(p, '.tab[data-tab="capitulo"]');
  check(
    !enTodas && (await p.evaluate(() => !!document.querySelector('#lista.al-margen'))),
    '«Todas» es una lista; al volver a «Sección» las fichas vuelven al margen'
  );
});

test('Recorrer con . y , (y ‹ ›) en el orden del libro, de una sección a otra', async ({ abrir, base }) => {
  const { p, vA, vB, vC, vD } = await cuatroRespondidas(abrir, base);
  await p.focus('#lectura');
  const pos = () =>
    p.evaluate(() => ({
      ff: (document.querySelector('.ficha.foco') || {}).getAttribute?.('data-id') || null,
      pos: (document.querySelector('#anot-pos') || {}).textContent || '',
      sec: Array.from(document.querySelectorAll('article.seccion'))
        .filter((a) => !a.hidden)
        .map((a) => a.id)
        .join(),
    }));
  await p.keyboard.press('.');
  const r1 = await pos();
  for (let i = 0; i < 3; i++) await p.keyboard.press('.');
  const r4 = await pos();
  await p.keyboard.press('.');
  await p.waitForTimeout(150);
  const fin = { ...(await pos()), anuncio: await p.$eval('#anuncio', (n) => n.textContent) };
  await p.keyboard.press(',');
  const r3 = await pos();
  await tocar(p, '#anot-ant');
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
  sinErrores(p, 'al recorrer', { consola: true });
});

test('«Por revisar»: cuenta, A atendida (sin repetir ni a ciegas) y pasa a la siguiente', async ({ abrir, base }) => {
  const { p, vA, vB, leer } = await cuatroRespondidas(abrir, base);
  const enBandeja = await tocar(p, '#tab-revisar');
  const bandeja = await p.evaluate(() => ({
    cab: (document.querySelector('.bandeja-cab') || {}).textContent || '',
    fichas: document.querySelectorAll('#lista .ficha.por-revisar').length,
  }));
  check(
    enBandeja &&
      (await cuentaRevisar(p)) === '4' &&
      /4 respuestas por revisar/.test(bandeja.cab) &&
      bandeja.fichas === 4,
    `«Por revisar» cuenta y lista las respuestas nuevas (${JSON.stringify(bandeja)})`
  );
  await p.keyboard.press('.');
  // A mantenida: la repetición del teclado no resuelve las siguientes sin verlas
  for (let i = 0; i < 3; i++) await p.keyboard.down('a');
  await p.keyboard.up('a');
  const trasRepetir = await leer();
  check(
    !trasRepetir[1].revisado && !trasRepetir[2].revisado,
    `mantener A pulsada resuelve sólo la respuesta a la vista (${JSON.stringify(trasRepetir.map((a) => !!a.revisado))})`
  );
  // en concentración el panel no se ve: A no resuelve a ciegas
  await p.keyboard.press('f');
  await p.keyboard.press('a');
  const aCiegas = (await leer())[1];
  await p.keyboard.press('f');
  check(
    !aCiegas.revisado && aCiegas.estado !== 'resuelta',
    'en concentración, con el panel oculto, A no resuelve nada'
  );
  const trasA = (await leer())[0];
  const despuesA = {
    ff: await fichaActiva(p),
    revisada: await p.evaluate((id) => !!document.querySelector(`#lista .ficha.revisada[data-id="${id}"]`), vA),
  };
  check(
    trasA.estado === 'resuelta' &&
      !!trasA.revisado &&
      despuesA.ff === vB &&
      despuesA.revisada &&
      (await cuentaRevisar(p)) === '3',
    `A deja la respuesta atendida (resuelta y revisada), la mantiene a la vista marcada y pasa a la siguiente (${JSON.stringify({ estado: trasA.estado, revisado: trasA.revisado, ...despuesA })})`
  );
  sinErrores(p, 'al revisar', { consola: true });
});

test('«Por revisar»: contestar la pregunta la revisa; R reabre y «Copiar» lo dice', async ({ abrir, base }) => {
  const { p, vB, vC, leer } = await cuatroRespondidas(abrir, base);
  await tocar(p, '#tab-revisar');
  await tocar(p, `.ficha[data-id="${vB}"] textarea.replica`);
  await p.keyboard.type('Al final del turno');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(100);
  const trasB = (await leer())[1];
  check(
    trasB.replica === 'Al final del turno' && !!trasB.revisado && (await cuentaRevisar(p)) === '3',
    `contestar la pregunta la da por revisada (${JSON.stringify({ replica: trasB.replica, revisado: trasB.revisado })})`
  );
  await p.focus(`.ficha[data-id="${vB}"]`).catch(() => {});
  await p.keyboard.press('.');
  await p.keyboard.press('r');
  const trasR = (await leer())[2];
  const cursorR = await p.evaluate(() => document.activeElement.id);
  check(
    trasR.estado === 'abierta' && !!trasR.revisado && cursorR === `nota-${vC}`,
    `R reabre la respuesta descartada, la da por revisada y deja el cursor en la nota (${JSON.stringify({ estado: trasR.estado, cursorR })})`
  );
  await p.keyboard.type(' Mejor quitarla.');
  await p.keyboard.press('Escape');
  // quien vuelca las anotaciones ve que el autor la devolvió
  const copiaR = await enFicha(p, `.ficha[data-id="${vC}"]`, 'button[data-accion="copiar"]')
    .then(
      () => p.evaluate(() => navigator.clipboard.readText()),
      () => ''
    )
    .catch(() => '');
  check(
    /Respuesta \(descartada\): .*\nReabierta por el autor tras la respuesta\./.test(copiaR),
    `«Copiar» en una respuesta reabierta lo dice (${JSON.stringify(copiaR.split('\n').slice(-2))})`
  );
  sinErrores(p, 'al contestar y reabrir', { consola: true });
});

test('«Por revisar»: el pasaje que cambió se abre con el antes y el después, y al terminar lo avisa', async ({
  abrir,
  base,
}) => {
  const { p, vC, vD } = await cuatroRespondidas(abrir, base);
  await tocar(p, '#tab-revisar');
  // atendidas las dos primeras con A, reabierta la tercera con R, y a la cuarta con .
  await p.keyboard.press('.');
  await p.keyboard.press('a');
  await p.keyboard.press('a');
  await p.keyboard.press('r');
  await p.keyboard.press('Escape');
  await p.focus(`.ficha[data-id="${vC}"]`).catch(() => {});
  await p.keyboard.press('.');
  await p.waitForTimeout(150);
  const enD = await p.evaluate(
    (id) => ({
      ff: (document.querySelector('.ficha.foco') || {}).getAttribute?.('data-id'),
      sec: !document.querySelector('#sec-cap-02').hidden,
      diff: !!document.querySelector('#sec-cap-02 .diff'),
      boton: !!document.querySelector(`.ficha[data-id="${id}"] [data-accion="cambio"]`),
    }),
    vD
  );
  await p.evaluate(() => {
    const d = document.querySelector('#sec-cap-02 .diff');
    if (d) d.remove();
  });
  await p.keyboard.press('v');
  await p.waitForTimeout(100);
  const conV = await p.evaluate(() => !!document.querySelector('#sec-cap-02 .diff'));
  check(
    enD.ff === vD && enD.sec && enD.diff && enD.boton && conV,
    `llegar a una respuesta cuyo pasaje cambió lleva a él con el antes y el después abiertos; V los vuelve a mostrar (${JSON.stringify({ ...enD, conV })})`
  );
  await p.keyboard.press('a');
  await p.waitForTimeout(150);
  const vacia = await p.evaluate(() => ({
    anuncio: document.querySelector('#anuncio').textContent,
    fichas: document.querySelectorAll('#lista .ficha').length,
    revisadas: document.querySelectorAll('#lista .ficha.revisada').length,
  }));
  const opacidad = await p.evaluate(() => {
    const f = document.querySelector('#lista .ficha.revisada');
    return f ? getComputedStyle(f).opacity : null;
  });
  check(opacidad === '1', `lo revisado se marca sin apagar el texto (opacidad ${opacidad})`);
  check(
    (await cuentaRevisar(p)) === '' && /No quedan/.test(vacia.anuncio) && vacia.fichas === 4 && vacia.revisadas === 4,
    `al terminar lo avisa, y lo revisado sigue a la vista hasta salir de la pestaña (${JSON.stringify(vacia)})`
  );
  await tocar(p, '.tab[data-tab="todas"]');
  await tocar(p, '#tab-revisar');
  const vuelta = await p.evaluate(() => ({
    fichas: document.querySelectorAll('#lista .ficha').length,
    vacio: (document.querySelector('#lista .vacio') || {}).textContent || '',
  }));
  check(
    vuelta.fichas === 0 && /No hay respuestas por revisar/.test(vuelta.vacio),
    `al volver, la bandeja está vacía (${JSON.stringify(vuelta)})`
  );
  sinErrores(p, 'al terminar la bandeja', { consola: true });
});

test('Lo revisado se recuerda; una respuesta nueva vuelve a la bandeja; en el teléfono no hay margen', async ({
  abrir,
  base,
}) => {
  const { p, vA, clave } = await cuatroRespondidas(abrir, base);
  // las cuatro revisadas con el teclado (A en cada una, de una a la siguiente), y la página recargada
  await tocar(p, '#tab-revisar');
  await p.keyboard.press('.');
  for (let i = 0; i < 4; i++) await p.keyboard.press('a');
  await p.waitForTimeout(150);
  check((await cuentaRevisar(p)) === '', 'las cuatro quedan revisadas');
  await p.reload();
  await p.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  check((await cuentaRevisar(p)) === '', 'lo revisado se recuerda al recargar');
  await p.evaluate(
    ({ k, id }) => {
      const j = JSON.parse(localStorage.getItem(k));
      j[id].respondido = new Date(Date.now() + 60000).toISOString();
      j[id].respuesta = 'Lo volví a matizar.';
      localStorage.setItem(k, JSON.stringify(j));
    },
    { k: clave, id: vA }
  );
  await p.reload();
  await p.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  check((await cuentaRevisar(p)) === '1', 'una respuesta nueva a lo ya revisado vuelve a la bandeja');
  check(
    (await p.evaluate(() => document.querySelector('#b-panel').textContent.replace(/\s+/g, ' ').trim())) ===
      'Anotaciones (4), 1 respuesta por revisar',
    'el botón del panel en el teléfono dice qué cuenta su número'
  );
  // en el teléfono no hay margen: la lista de siempre, en la hoja
  await p.setViewportSize(TELEFONO.viewport);
  await p.waitForTimeout(150);
  const movilMargen = await p.evaluate(() => ({
    boton: getComputedStyle(document.querySelector('#b-margen') || document.body).display,
    margen: !!document.querySelector('#lista.al-margen'),
  }));
  check(
    movilMargen.boton === 'none' && !movilMargen.margen,
    `en pantalla estrecha no hay notas al margen (${JSON.stringify(movilMargen)})`
  );
});

// ------------------------------------------------------------ casos límite de revisar y recorrer
// Dos bloques del capítulo 2 cuyo texto anterior tenía la misma cita; una nota de sección, una de página (en un libro
// sin páginas) y una general; dos subrayados con respuesta en el capítulo 1 y cinco más en su último párrafo (el que
// cierra el artículo: la pila de fichas pasa de su final). Sin base.
const conDosAnteriores = (L) => {
  const cap2 = L.secciones.find((s) => /^Capítulo 2/.test(s.titulo));
  const b1 = cap2.bloques.find((b) => b.id === 'cap-02-b1'),
    b3 = cap2.bloques.find((b) => b.id === 'cap-02-b3');
  b1.anterior = b1.html + ' Lo que importa realmente es otra cosa.';
  b3.anterior = b3.html.replace('que importa es', 'que importa realmente es');
  L.anterior_generado = '2026-01-01';
  L.cambios = 2;
};
async function casosLimite(abrir) {
  const p = await abrir({ preparar: (p) => libroAlterado(p, conDosAnteriores) });
  for (const [t, k] of [
    ['Un hecho es lo que se observó', '1'],
    ['Dar por hecho lo que se infirió de una cifra', '2'],
    ['Este párrafo', '4'],
    ['cierra el capítulo', '4'],
    ['una idea sencilla', '4'],
    ['escribir mejor', '4'],
    ['separar mejor', '4'],
  ]) {
    await seleccionarTexto(p, t);
    await p.keyboard.press(k);
    await p.keyboard.press('Escape');
  }
  const clave = await p.evaluate(() =>
    Object.keys(localStorage).find((k) => /^lector-anotaciones:[a-z0-9-]+$/.test(k))
  );
  const leer = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), clave);
  const creadas = Object.values(await leer())
    .sort((a, b) => (a.creado < b.creado ? -1 : 1))
    .map((a) => a.id);
  await p.evaluate(
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
      const nota = (id, extra, creado) =>
        Object.assign(
          { id, nota: '', estado: 'abierta', creado: `2026-10-01T00:0${creado}:00.000Z`, autor: null },
          extra
        );
      j.s1 = nota('s1', { tipo: 'capitulo', sid: 'cap-01', sidTitulo: cap1, nota: 'Nota de la sección' }, 0);
      // de otra sección (el prefacio), y antes en el orden: la primera a la que se llega con el filtro «notas»
      j.pg = nota(
        'pg',
        { tipo: 'pagina', pagina: 5, sid: 'prefacio', sidTitulo: 'Prefacio', nota: 'Nota de la página 5' },
        1
      );
      j.g = nota('g', { tipo: 'general', nota: 'Nota general' }, 2);
      j.p = nota(
        'p',
        {
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
          bh: 'viejo0000000',
          respuesta: 'Quité «realmente».',
          cierre: 'atendida',
          respondido: '2026-10-15T10:02:00.000Z',
        },
        3
      );
      localStorage.setItem(k, JSON.stringify(j));
    },
    { k: clave, ids: creadas }
  );
  await p.reload();
  await p.waitForSelector('article.seccion:not([hidden]) mark.hl');
  await p.waitForTimeout(150);
  const [h1, , , , q3] = creadas;
  return { p, h1, q3, leer };
}
// Dónde está un elemento respecto de la lista del panel.
const enLista = (p, sel) =>
  p.evaluate((s) => {
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

test('Al margen con la pila llena: la nota de la sección y la última ficha se ven, y el cursor queda donde se tocó', async ({
  abrir,
}) => {
  const { p, q3 } = await casosLimite(abrir);
  // con el texto arriba del todo, la nota de la sección (anclada al título) se ve entera bajo la cabecera del panel
  const sec = await enLista(p, '#lista.al-margen .ficha[data-id="s1"]');
  check(
    sec && sec.dentro,
    `al margen, la nota de la sección se ve entera con el texto al principio (${JSON.stringify(sec)})`
  );
  // las fichas apiladas más allá del final del artículo se alcanzan desplazando el texto hasta abajo
  await p.evaluate(() => {
    const l = document.querySelector('#lectura');
    l.scrollTop = l.scrollHeight;
  });
  await p.waitForTimeout(150);
  const ultima = await p.evaluate(() => {
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
  await p.evaluate(() => {
    document.querySelector('#lectura').scrollTop = 0;
  });
  await p.waitForTimeout(100);
  // tocar la nota de una ficha que la pila empujó hacia abajo: el cursor queda donde se tocó
  // el texto se desplaza hasta que la ficha queda a media altura (la capa se sincroniza en el cuadro siguiente)
  for (let i = 0; i < 2; i++) {
    await p.evaluate((id) => {
      document.querySelector('#lectura').scrollTop +=
        document.querySelector(`.ficha[data-id="${id}"]`).getBoundingClientRect().top - 400;
    }, q3);
    await p.waitForTimeout(100);
  }
  const rq = await p.$eval(`.ficha[data-id="${q3}"] textarea.nota`, (t) => {
    const r = t.getBoundingClientRect();
    return { x: r.left + 60, y: r.top + 9 };
  });
  await p.mouse.move(rq.x, rq.y);
  await p.mouse.down();
  const cursor0 = await p.$eval(`.ficha[data-id="${q3}"] textarea.nota`, (t) => t.selectionStart);
  await p.mouse.move(rq.x + 1, rq.y);
  await p.mouse.up();
  await p.waitForTimeout(120);
  const cursor1 = await p.evaluate((id) => {
    const t = document.querySelector(`.ficha[data-id="${id}"] textarea.nota`);
    return { fin: t.selectionStart, finSel: t.selectionEnd, foco: document.activeElement === t };
  }, q3);
  check(
    cursor1.foco && Math.abs(cursor1.fin - cursor0) <= 1 && cursor1.finSel === cursor1.fin,
    `tocar la nota de una ficha empujada deja el cursor donde se tocó (${cursor0} → ${JSON.stringify(cursor1)})`
  );
  sinErrores(p, 'con la pila llena');
});

test('En una ficha más alta que la lista, «Borrar» queda a la vista al llegar con Tab', async ({ abrir }) => {
  const { p, h1 } = await casosLimite(abrir);
  await p.setViewportSize({ width: 1280, height: 520 });
  await p.waitForTimeout(150);
  await p.focus(`.ficha[data-id="${h1}"] textarea.nota`);
  let alBorrar = null;
  // se mide un momento después: el navegador desplaza la lista para mostrar el foco y la página lo corrige en el cuadro siguiente
  for (let i = 0; i < 14 && !alBorrar; i++) {
    await p.keyboard.press('Tab');
    if ((await p.evaluate(() => document.activeElement.getAttribute('data-accion'))) === 'borrar') {
      await p.waitForTimeout(150);
      alBorrar = await enLista(p, ':focus');
    }
  }
  check(
    alBorrar && alBorrar.dentro,
    `en una ficha más alta que la lista, «Borrar» queda a la vista al llegar con Tab (${JSON.stringify(alBorrar)})`
  );
});

test('«✓ Atendida» fuera de la bandeja la deja en su sitio; una cita perdida lleva a su bloque', async ({ abrir }) => {
  const { p, h1, leer } = await casosLimite(abrir);
  await enFicha(p, `.ficha[data-id="${h1}"]`, 'button[data-accion="atendida"]');
  await p.waitForTimeout(100);
  const enSitio = await p.evaluate(
    (id) => ({
      tab: document.querySelector('.tab.activa').getAttribute('data-tab'),
      sec: !document.querySelector('#sec-cap-01').hidden,
      foco: (document.activeElement.closest('.ficha') || { getAttribute: () => null }).getAttribute('data-id') === id,
    }),
    h1
  );
  check(
    (await leer())[h1].estado === 'resuelta' &&
      enSitio.tab === 'capitulo' &&
      enSitio.sec &&
      enSitio.foco &&
      (await cuentaRevisar(p)) === '2',
    `«✓ Atendida» en «Sección» la resuelve y deja la ficha donde está, con el foco en ella (${JSON.stringify(enSitio)})`
  );
  // en la bandeja: de una cita perdida se va al bloque donde estaba (por su contexto), no al primero que la tenía
  await p.click('#tab-revisar');
  await p.focus('#lectura');
  await p.keyboard.press('.');
  await p.keyboard.press('a');
  await p.waitForTimeout(150);
  const perdida = await p.evaluate(() => ({
    ff: (document.querySelector('.ficha.foco') || { getAttribute: () => null }).getAttribute('data-id'),
    b3: !!document.querySelector('.diff[data-de="cap-02-b3"]'),
    b1: !!document.querySelector('.diff[data-de="cap-02-b1"]'),
  }));
  check(
    perdida.ff === 'p' && perdida.b3 && !perdida.b1,
    `una cita que ya no está lleva al bloque donde estaba según su contexto (${JSON.stringify(perdida)})`
  );
  // salir de la bandeja por la búsqueda también la vacía de lo revisado
  await p.fill('#buscar', 'hecho');
  await p.press('#buscar', 'Enter');
  await p.click('#tab-revisar');
  const trasBuscar = await p.$$eval('#lista .ficha', (fs) => fs.map((f) => f.getAttribute('data-id')));
  check(
    trasBuscar.length === 1 && trasBuscar[0] === 'p',
    `salir de «Por revisar» por la búsqueda saca lo revisado de la bandeja (${JSON.stringify(trasBuscar)})`
  );
  sinErrores(p, 'al revisar fuera de la bandeja');
});

test('. con un filtro: recorre las notas sin quitarlo, y sigue desde donde estaba la que salió de la lista', async ({
  abrir,
}) => {
  const { p } = await casosLimite(abrir);
  // . con el filtro «notas» en «Sección»: una nota de página sin su página en el texto no quita el filtro
  await pulsar(p, '.filtro[data-f="notas"]');
  await p.focus('#lectura');
  const pasos = [];
  for (let i = 0; i < 3; i++) {
    await p.keyboard.press('.');
    pasos.push(
      await p.evaluate(() => ({
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
  await p.click('.tab[data-tab="todas"]');
  await pulsar(p, '.filtro[data-f="abiertas"]');
  await enFicha(p, '.ficha[data-id="p"]', 'button[data-accion="atendida"]');
  await p.waitForTimeout(100);
  await p.keyboard.press('.');
  const sigue = await fichaActiva(p);
  check(sigue === 'g', `si la actual sale de la lista filtrada, . pasa a la que le seguía (${sigue})`);
  sinErrores(p, 'al recorrer con filtros');
});

// ------------------------------------------------------------ con la base: lo propio, fichas por id
const respondida = (id, nota, autor, creado) => ({
  id,
  tipo: 'general',
  nota,
  estado: 'abierta',
  creado,
  autor,
  respuesta: 'Hecho.',
  cierre: 'atendida',
  respondido: '2026-10-03T10:00:00.000Z',
});
for (const sinId of [false, true])
  test(`Por revisar: ${sinId ? 'sin identidad, sólo lo sin autor' : 'sólo las respuestas propias'}`, async ({
    abrir,
  }) => {
    const p = await abrir({
      hash: '',
      modo: 'con-base',
      semilla: {
        mia: respondida('mia', 'Mía', 'u_me', '2026-10-02T00:00:00.000Z'),
        suya: respondida('suya', 'De otra lectora', 'u_otro', '2026-10-02T01:00:00.000Z'),
      },
      previo: sinId
        ? [
            () => {
              window.__sinUsuario = true;
            },
          ]
        : [],
    });
    await p.waitForTimeout(250);
    const r = await p.evaluate(() => ({
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
  });

const general = (id, nota, creado, extra) =>
  Object.assign({ id, tipo: 'general', nota, estado: 'abierta', creado, autor: 'u_me' }, extra);
// Marca los nodos de las fichas dibujadas; `marcadas` dice cuáles siguen siendo los mismos tras un redibujo.
const marcar = (p) =>
  p.evaluate(() =>
    document.querySelectorAll('#lista .ficha').forEach((f) => {
      f.__marca = 1;
    })
  );
const marcadas = (p) =>
  p.evaluate(() =>
    Object.fromEntries(Array.from(document.querySelectorAll('#lista .ficha')).map((f) => [f.dataset.id, !!f.__marca]))
  );

test('Fichas por id: el panel reutiliza las que no cambiaron y conserva el cuadro que se edita', async ({ abrir }) => {
  const p = await abrir({
    hash: '',
    modo: 'con-base',
    semilla: {
      g1: general('g1', 'Primera nota general', '2026-10-01T00:00:00.000Z'),
      g2: general('g2', 'Segunda nota general', '2026-10-01T00:01:00.000Z'),
      g3: general('g3', 'Tercera nota general', '2026-10-01T00:02:00.000Z'),
    },
  });
  await p.click('.tab[data-tab="todas"]');
  await p.waitForSelector('.ficha[data-id="g3"]');
  // se marcan los nodos dibujados; un redibujo que no cambia nada los deja como están
  await marcar(p);
  await p.evaluate(() =>
    window.__cambioExterno('g2', { respuesta: 'Hecho.', cierre: 'atendida', respondido: '2026-10-02T00:00:00.000Z' })
  );
  await esperar(p, () => !!document.querySelector('.ficha[data-id="g2"] .respuesta'));
  const tras = await marcadas(p);
  check(
    tras.g1 && !tras.g2 && tras.g3,
    `un cambio en una anotación rehace sólo su ficha; las demás son los mismos nodos (${JSON.stringify(tras)})`
  );
  // escribir en g1 mientras llega un cambio de g3: el cuadro es el mismo elemento, con el foco y el cursor donde estaban
  await p.focus('.ficha[data-id="g1"] textarea.nota');
  await p.keyboard.press('End');
  await p.keyboard.type(' (sigo)');
  const cuadro = await p.evaluate(() => {
    const t = document.querySelector('.ficha[data-id="g1"] textarea.nota');
    t.__mismo = 1;
    return t.selectionStart;
  });
  await p.evaluate(() => window.__cambioExterno('g3', { nota: 'Tercera nota, cambiada en otra sesión' }));
  await esperar(p, () => /cambiada en otra sesión/.test(document.querySelector('.ficha[data-id="g3"] textarea').value));
  const enEdicion = await p.evaluate(() => {
    const t = document.querySelector('.ficha[data-id="g1"] textarea.nota');
    return { mismo: !!t.__mismo, foco: document.activeElement === t, cursor: t.selectionStart, valor: t.value };
  });
  check(
    enEdicion.mismo && enEdicion.foco && enEdicion.cursor === cuadro && /\(sigo\)$/.test(enEdicion.valor),
    `el cuadro que se edita sigue siendo el mismo, con el foco y el cursor, cuando llega el cambio de otra anotación (${JSON.stringify(enEdicion)})`
  );
  sinErrores(p, 'al reutilizar fichas');
});

// ------------------------------------------------------------ conversación anterior y propuestas
test('Conversación anterior: el hilo se ve plegado, se copia y se exporta en el formato 2', async ({ abrir }) => {
  const p = await abrir({ permisos: ['clipboard-read', 'clipboard-write'] });
  // un subrayado, una nota de la sección, una de página y una general
  await seleccionarTexto(p, 'Un hecho es lo que se observó');
  await p.keyboard.press('3');
  await p.keyboard.press('Escape');
  await pulsar(p, '#b-nota-cap');
  await p.keyboard.type('Nota de la sección');
  await p.keyboard.press('Escape');
  await abrirDe(p, '#pg-num');
  await p.fill('#pg-num', '4');
  await p.press('#pg-num', 'Enter');
  await p.keyboard.type('Nota de la página 4');
  await p.keyboard.press('Escape');
  await pulsar(p, '#b-nota-gen');
  await p.keyboard.type('Nota general');
  await p.keyboard.press('Escape');
  await p.evaluate((k) => {
    const j = JSON.parse(localStorage.getItem(k));
    const s = Object.values(j).find((a) => a.tipo === 'subrayado');
    Object.assign(s, {
      nota: 'Definición tajante.',
      sugerencia: 'Un hecho es lo observado',
      hilo: [
        {
          de: 'editor',
          texto: 'Quité «es».',
          cierre: 'atendida',
          commit: 'abc1234',
          cuando: '2026-10-03T10:00:00.000Z',
        },
        { de: 'autor', texto: 'No era eso: falta el ejemplo.', cuando: '2026-10-04T08:00:00.000Z' },
      ],
      respuesta: 'Añadí el ejemplo de la fiebre.',
      cierre: 'atendida',
      commit: 'def5678',
      respondido: '2026-10-05T09:00:00.000Z',
    });
    localStorage.setItem(k, JSON.stringify(j));
  }, CLAVE_LOCAL);
  await p.reload();
  await p.waitForSelector('article.seccion:not([hidden]) mark.hl');
  await p.click('.tab[data-tab="todas"]');
  const ficha = await p.evaluate(() => {
    const f = Array.from(document.querySelectorAll('.ficha')).find((x) => x.querySelector('.hilo'));
    if (!f) return null;
    const d = f.querySelector('details.hilo');
    return {
      resumen: d.querySelector('summary').textContent,
      abierto: d.open,
      items: Array.from(d.querySelectorAll('.hilo-item')).map((i) => i.querySelector('.quien').textContent),
      antesDeLaRespuesta: !!(
        d.compareDocumentPosition(f.querySelector('.respuesta')) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
    };
  });
  check(
    ficha &&
      ficha.resumen === 'Conversación anterior (2)' &&
      !ficha.abierto &&
      ficha.items[0] === 'Quien edita · atendida · abc1234 · 2026-10-03' &&
      ficha.items[1] === 'Tú · 2026-10-04' &&
      ficha.antesDeLaRespuesta,
    `la conversación anterior va plegada sobre la respuesta vigente (${JSON.stringify(ficha)})`
  );
  await enFicha(p, '.ficha.c-duda', 'button[data-accion="copiar"]');
  const copia = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    copia.includes(
      '\nAntes, quien edita (atendida, abc1234, 2026-10-03): Quité «es».\nAntes, el autor (2026-10-04): No era eso: falta el ejemplo.\nRespuesta (atendida, def5678): Añadí el ejemplo de la fiebre.'
    ),
    `«Copiar» lleva la conversación en orden antes de la respuesta vigente (${JSON.stringify(copia.split('\n').slice(2, 6))})`
  );
  await p.keyboard.press('Escape');
  await pulsar(p, '#b-copiar');
  const datos = JSON.parse(await p.evaluate(() => navigator.clipboard.readText()).catch(() => '{}'));
  const conHilo = (datos.anotaciones || []).find((a) => a.hilo);
  const notaPg = (datos.anotaciones || []).find((a) => a.tipo === 'pagina');
  check(
    notaPg && notaPg.nota === 'Nota de la página 4',
    `el Enter del número de página no entra en la nota nueva (${JSON.stringify(notaPg && notaPg.nota)})`
  );
  check(
    datos.formato === 2 && conHilo && conHilo.hilo.length === 2 && (datos.anotaciones || []).length === 4,
    `«Copiar todo (JSON)» sale en el formato 2 y conserva el hilo (${JSON.stringify({ formato: datos.formato, n: (datos.anotaciones || []).length })})`
  );
  // con GUARDAR_EXPORTACION=ruta, esta exportación queda como muestra para tests/test_esquemas.py
  if (process.env.GUARDAR_EXPORTACION)
    fs.writeFileSync(process.env.GUARDAR_EXPORTACION, JSON.stringify(datos, null, 2) + '\n');
  sinErrores(p, 'con la conversación anterior');
});

const local = (p) => p.evaluate((k) => Object.values(JSON.parse(localStorage.getItem(k) || '{}')), CLAVE_LOCAL);

test('Proponer otro texto con P: la diferencia, lo que se guarda, la ficha en reposo, lo que se copia', async ({
  abrir,
}) => {
  const p = await abrir({ permisos: ['clipboard-read', 'clipboard-write'] });
  // P con texto seleccionado: subraya (revisar) y abre la propuesta con la cita, con el cursor en ella
  await seleccionarTexto(p, 'Un hecho es lo que se observó');
  await p.keyboard.press('p');
  const abierto = await p.evaluate(() => {
    const t = document.activeElement;
    return {
      cuadro: t && t.classList.contains('sugerencia'),
      valor: t && t.value,
      ficha: t && t.closest('.ficha').className,
    };
  });
  check(
    abierto.cuadro && abierto.valor === 'Un hecho es lo que se observó' && /c-revisar/.test(abierto.ficha),
    `P subraya en «revisar» y abre la propuesta con la cita (${JSON.stringify(abierto)})`
  );
  await p.keyboard.press('Control+A');
  await p.keyboard.type('Un hecho es lo observado');
  const dif = await p.evaluate(() => {
    const d = document.querySelector('.ficha.foco .dif-propuesta');
    return {
      del: Array.from(d.querySelectorAll('del')).map((x) => x.textContent),
      ins: Array.from(d.querySelectorAll('ins')).map((x) => x.textContent),
    };
  });
  check(
    dif.del.join('|') === 'que se observó' && dif.ins.join('|') === 'observado',
    `la diferencia con la cita se ve palabra por palabra mientras se escribe (${JSON.stringify(dif)})`
  );
  await p.keyboard.press('Escape');
  const guardada = (await local(p)).find((a) => a.tipo === 'subrayado');
  check(
    guardada && guardada.sugerencia === 'Un hecho es lo observado',
    `Esc guarda la propuesta (${JSON.stringify(guardada && guardada.sugerencia)})`
  );
  const reposo = await p.evaluate(() => {
    const f = document.querySelector('.ficha.c-revisar');
    return {
      foco: f.classList.contains('foco'),
      cuadro: getComputedStyle(f.querySelector('textarea.sugerencia')).display,
      dif: f.querySelector('.dif-propuesta').offsetHeight > 0,
    };
  });
  check(
    !reposo.foco && reposo.cuadro === 'none' && reposo.dif,
    `en reposo la ficha muestra la diferencia, no el cuadro (${JSON.stringify(reposo)})`
  );
  await enFicha(p, '.ficha.c-revisar', 'button[data-accion="copiar"]');
  const copia = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    copia.includes('«Un hecho es lo que se observó»\nPropuesta: «Un hecho es lo observado»'),
    `«Copiar» lleva la propuesta bajo la cita (${JSON.stringify(copia.split('\n').slice(1, 3))})`
  );
  await p.keyboard.press('Escape');
  await pulsar(p, '#b-copiar-md');
  const md = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(
    md.includes('«Un hecho es lo que se observó»\n  - Propuesta: «Un hecho es lo observado»'),
    '«Copiar todo (Markdown)» lleva la propuesta'
  );
  // al recargar, la propuesta sigue en la ficha
  await p.reload();
  await p.waitForSelector('article.seccion:not([hidden]) mark.hl');
  const tras = await p.evaluate(() => {
    const f = document.querySelector('.ficha.c-revisar');
    return f && f.querySelector('.dif-propuesta') ? f.querySelector('.dif-propuesta').textContent : null;
  });
  check(tras === 'Un hecho es lo que se observóobservado', `la propuesta se conserva al recargar (${tras})`);
  sinErrores(p, 'al proponer con P');
});

test('«Proponer texto» en la ficha: abrirla y salir sin cambios no guarda nada; P con la ficha activa la abre', async ({
  abrir,
}) => {
  const p = await abrir();
  await seleccionarTexto(p, 'escrita con prisa');
  await p.keyboard.press('3');
  await p.keyboard.press('Escape');
  await enFicha(p, '.ficha.c-duda', 'button[data-accion="proponer"]');
  const boton = await p.evaluate(() => {
    const f = document.querySelector('.ficha.c-duda');
    return {
      cuadro: document.activeElement && document.activeElement.classList.contains('sugerencia'),
      valor: document.activeElement && document.activeElement.value,
      sinBoton: !f.querySelector('[data-accion="proponer"]'),
      vacia: f.querySelector('.propuesta').classList.contains('vacia'),
    };
  });
  check(
    boton.cuadro && boton.valor === 'escrita con prisa' && boton.sinBoton && boton.vacia,
    `«Proponer texto» abre la propuesta con la cita y deja de ofrecerse (${JSON.stringify(boton)})`
  );
  await p.keyboard.press('Escape');
  const duda = (await local(p)).find((a) => a.color === 'duda');
  check(duda && !('sugerencia' in duda), 'abrir la propuesta y salir sin cambios no guarda nada');
  // P con una ficha activa abre su propuesta
  await p.evaluate(() => document.querySelector('.ficha.c-duda .cab > span').click());
  await p.evaluate(() => document.querySelector('.ficha.c-duda').focus());
  await p.keyboard.press('p');
  check(
    await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('sugerencia')),
    'P en una ficha activa abre su propuesta'
  );
  sinErrores(p, 'al proponer desde la ficha');
});

// ------------------------------------------------------------ lo que la revisión de la 0.5 encontró en las fichas reutilizadas
// Cada caso falla sin su arreglo.
const tresGenerales = {
  gA: general('gA', 'Nota gA', '2026-10-01T00:00:00.000Z', {
    respuesta: '¿Qué quieres decir?',
    cierre: 'pregunta',
    respondido: '2026-10-02T00:00:00.000Z',
  }),
  gB: general('gB', 'Nota gB', '2026-10-01T00:01:00.000Z', {
    respuesta: 'Hecho.',
    cierre: 'atendida',
    respondido: '2026-10-02T00:00:00.000Z',
  }),
  gC: general('gC', 'Nota gC', '2026-10-01T00:02:00.000Z'),
};

test('Fichas reutilizadas: sin la posición del margen en la lista, y revisadas aunque se haya salido de ellas', async ({
  abrir,
}) => {
  const p = await abrir({ modo: 'con-base', semilla: tresGenerales });
  // 1. dibujadas al margen (pestaña «Sección») y reutilizadas en la lista («Todas»): sin el `top` del margen
  for (const [texto, tecla] of [
    ['Un hecho es lo que se observó', '1'],
    ['se lee una ficha escrita con prisa', '3'],
    ['Dar por hecho lo que se infirió de una cifra', '2'],
  ]) {
    await seleccionarTexto(p, texto);
    await p.keyboard.press(tecla);
    await p.keyboard.press('Escape');
  }
  check(await p.evaluate(() => document.querySelector('#lista').classList.contains('al-margen')), 'al margen');
  await p.click('.tab[data-tab="todas"]');
  const lista = await p.evaluate(() =>
    Array.from(document.querySelectorAll('#lista .ficha')).map((f) => {
      const r = f.getBoundingClientRect();
      return { top: f.style.top, y: Math.round(r.top), fin: Math.round(r.bottom) };
    })
  );
  const huecos = lista.slice(1).map((f, i) => f.y - lista[i].fin);
  check(
    lista.every((f) => f.top === '') && huecos.every((h) => h >= 0 && h < 30),
    `en la lista, las fichas que estuvieron al margen van seguidas, sin su posición de entonces (${JSON.stringify({ tops: lista.map((f) => f.top), huecos })})`
  );
  // 2. contestar una pregunta en la bandeja la revisa; salir con Esc (que reajusta la ficha en su sitio) no deja la
  // ficha vieja como si estuviera al día: el siguiente redibujo la muestra revisada
  await p.click('.tab[data-tab="revisar"]');
  await p.click('.ficha[data-id="gA"] textarea.replica');
  await p.keyboard.type('Que falta un ejemplo.');
  await p.keyboard.press('Escape');
  await p.evaluate(() => window.__cambioExterno('gC', { nota: 'Nota gC cambiada en otra sesión' }));
  await esperar(p, () => !!document.querySelector('.ficha[data-id="gA"].revisada'), null, 2000);
  const gA = await p.evaluate(() => {
    const f = document.querySelector('.ficha[data-id="gA"]');
    return {
      revisada: f.classList.contains('revisada'),
      insignia: (f.querySelector('.nueva') || {}).textContent,
      atendida: !!f.querySelector('[data-accion="atendida"]'),
    };
  });
  check(
    gA.revisada && gA.insignia === '✓ revisada' && !gA.atendida,
    `la pregunta contestada se redibuja revisada aunque se haya salido de su ficha (${JSON.stringify(gA)})`
  );
  sinErrores(p, 'al reutilizar fichas del margen y de la bandeja');
});

test('Fichas reutilizadas: la nota cambiada en concentración se mide; «Copiar» dos veces vuelve a su texto', async ({
  abrir,
}) => {
  const p = await abrir({ modo: 'con-base', semilla: tresGenerales, permisos: ['clipboard-read', 'clipboard-write'] });
  // 3. una nota que cambia mientras el panel no se ve (concentración) se mide al volver a verse
  await p.click('.tab[data-tab="todas"]');
  await p.click('#lectura');
  await p.keyboard.press('f');
  await p.evaluate(() =>
    window.__cambioExterno('gB', { nota: 'Línea uno.\nLínea dos.\nLínea tres.\nLínea cuatro, escrita en otra sesión.' })
  );
  await p.waitForTimeout(150);
  await p.keyboard.press('f');
  const alto = await p.evaluate(() => {
    const t = document.querySelector('.ficha[data-id="gB"] textarea.nota');
    return { cliente: t.clientHeight, contenido: t.scrollHeight };
  });
  check(
    alto.cliente >= alto.contenido - 1,
    `la nota cambiada en concentración se ve entera al salir (${JSON.stringify(alto)})`
  );
  // 4. «Copiar» dos veces seguidas no deja «Copiado» para siempre
  await enFicha(p, '.ficha[data-id="gC"]', '[data-accion="copiar"]');
  await p.click('.ficha[data-id="gC"] [data-accion="copiar"]');
  await p.waitForTimeout(1700);
  check(
    (await p.textContent('.ficha[data-id="gC"] [data-accion="copiar"]')) === 'Copiar',
    '«Copiar» vuelve a su texto tras dos pulsaciones seguidas'
  );
  sinErrores(p, 'al medir y copiar');
});

test('Fichas reutilizadas: el autor que se pone al subir aparece aunque se toque la ficha antes', async ({ abrir }) => {
  const p = await abrir({
    modo: 'con-base',
    semilla: {
      o1: {
        id: 'o1',
        tipo: 'general',
        nota: 'De otra',
        estado: 'abierta',
        creado: '2026-10-01T00:00:00Z',
        autor: 'u_otro',
      },
      m1: { id: 'm1', tipo: 'general', nota: 'Mía', estado: 'abierta', creado: '2026-10-01T00:00:01Z', autor: 'u_me' },
    },
    previo: [
      () => {
        window.__retenerDb = true;
      },
    ],
    esperar: 'bloques',
  });
  await seleccionarTexto(p, 'Un hecho es lo que se observó');
  await p.keyboard.press('1');
  await p.keyboard.press('Escape');
  await p.evaluate(() => window.__soltarDb());
  await p.waitForFunction(() => /^Conectado/.test(document.querySelector('#estado').textContent));
  await p.waitForTimeout(300);
  const id = await p.evaluate(() => Object.keys(window.__docs).find((k) => k !== 'o1' && k !== 'm1'));
  await p.click(`.ficha[data-id="${id}"] .cab > span`);
  await p.keyboard.press('Escape');
  await p.evaluate(() => window.__cambioExterno('o1', { nota: 'De otra (editada)' }));
  const chip = await esperar(p, (id) => !!document.querySelector(`.ficha[data-id="${id}"] .autor`), id, 2000);
  check(chip, 'con dos lectores, la ficha subida al conectar lleva el nombre de quien la hizo');
});

// ------------------------------------------------------------ deshacer
// Con la base: un subrayado recién hecho y una respuesta por revisar.
async function paraDeshacer(abrir) {
  const p = await abrir({
    modo: 'con-base',
    semilla: {
      gB: general('gB', 'Nota gB', '2026-10-01T00:00:00.000Z', {
        respuesta: 'Hecho.',
        cierre: 'atendida',
        respondido: '2026-10-02T00:00:00.000Z',
      }),
    },
  });
  await seleccionarTexto(p, 'Un hecho es lo que se observó');
  await p.keyboard.press('1');
  await p.keyboard.press('Escape');
  const id = await p.evaluate(() => Object.keys(window.__docs).find((k) => k !== 'gB'));
  return {
    p,
    id,
    doc: () => p.evaluate((id) => window.__docs[id], id),
    zona: () => p.evaluate(() => document.querySelector('#deshacer-zona').textContent),
  };
}

test('Deshacer un cambio de color o de estado', async ({ abrir }) => {
  const { p, id, doc, zona } = await paraDeshacer(abrir);
  await enFicha(p, `.ficha[data-id="${id}"]`, 'button[data-c="cortar"]');
  check((await zona()) === 'Color: cortar.Deshacer', `cambiar el color ofrece deshacerlo (${await zona()})`);
  await p.click('#deshacer');
  await esperar(p, (id) => window.__docs[id].color === 'revisar', id, 2000);
  check((await doc()).color === 'revisar', 'deshacer vuelve al color de antes, también en la base');
  check((await zona()) === '', 'y el aviso se va');
  await enFicha(p, `.ficha[data-id="${id}"]`, 'button[data-accion="estado"]');
  check((await zona()) === 'Marcada resuelta.Deshacer', `marcarla resuelta ofrece deshacerlo (${await zona()})`);
  await p.click('#deshacer');
  await esperar(p, (id) => window.__docs[id].estado === 'abierta', id, 2000);
  check((await doc()).estado === 'abierta', 'deshacer la vuelve a abrir');
});

test('Deshacer «Atendida» la devuelve a la bandeja; un cambio después de un borrado reemplaza su aviso', async ({
  abrir,
}) => {
  const { p, id, zona } = await paraDeshacer(abrir);
  await p.click('.tab[data-tab="revisar"]');
  await p.click('.ficha[data-id="gB"] .cab > span');
  await p.keyboard.press('a');
  check((await zona()) === 'Atendida.Deshacer', `«Atendida» ofrece deshacerse (${await zona()})`);
  await p.click('#deshacer');
  const vuelta = await esperar(
    p,
    () => !!document.querySelector('.ficha[data-id="gB"].por-revisar') && window.__docs.gB.estado === 'abierta',
    null,
    2000
  );
  check(vuelta, 'deshacer «Atendida» la deja otra vez por revisar, abierta');
  check((await p.evaluate(() => window.__docs.gB.revisado)) === '', 'sin la revisión que se deshizo');
  await p.click('.tab[data-tab="todas"]');
  await enFicha(p, `.ficha[data-id="${id}"]`, 'button[data-accion="borrar"]');
  await p.click(`.ficha[data-id="${id}"] .confirmar button:has-text("Sí")`);
  check((await zona()) === 'Anotación borrada.Deshacer borrado', 'el borrado ofrece deshacerse');
  await enFicha(p, '.ficha[data-id="gB"]', 'button[data-accion="atendida"]');
  check((await zona()) === 'Atendida.Deshacer', 'un cambio posterior reemplaza el aviso del borrado');
});
