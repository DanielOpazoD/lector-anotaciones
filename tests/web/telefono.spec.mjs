// En el teléfono: ancho, cajones con velo, foco y notas.
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

test('Ancho de teléfono', async ({ browser }) => {
  const movil = await browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true });
  await movil.addInitScript(sinBase);
  const pm = await movil.newPage();
  await libroAlterado(pm, conCambio);
  await pm.goto(base);
  await pm.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  const anchos = await pm.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  check(anchos[0] <= anchos[1], `sin desborde horizontal a 400 px (${anchos.join(' / ')})`);
  await pm.waitForFunction(() => /Sin base compartida/.test(document.querySelector('#estado').textContent));
  // índice y panel escondidos quedan fuera del orden de Tab; los botones dicen si están abiertos
  await pm.focus('#b-mas');
  const recorrido = [];
  for (let i = 0; i < 8; i++) {
    await pm.keyboard.press('Tab');
    recorrido.push(await activo(pm));
  }
  check(
    recorrido.every((a) => !a.enLateral && a.left >= 0),
    `a 400 px, Tab no entra en el índice ni en el panel escondidos (${recorrido.map((a) => a.tag + ':' + a.texto.slice(0, 12)).join(' → ')})`
  );
  const lateralesAntes = await pm.evaluate(() => ({
    indice: document.querySelector('#indice').inert,
    expandido: document.querySelector('#b-indice').getAttribute('aria-expanded'),
    controla: document.querySelector('#b-indice').getAttribute('aria-controls'),
  }));
  await pm.click('#b-indice');
  const lateralesDespues = await pm.evaluate(() => ({
    indice: document.querySelector('#indice').inert,
    expandido: document.querySelector('#b-indice').getAttribute('aria-expanded'),
  }));
  await pm.keyboard.press('Escape');
  check(
    lateralesAntes.indice &&
      lateralesAntes.expandido === 'false' &&
      lateralesAntes.controla === 'indice' &&
      !lateralesDespues.indice &&
      lateralesDespues.expandido === 'true' &&
      (await pm.$eval('#b-indice', (b) => b.getAttribute('aria-expanded'))) === 'false',
    'el índice cerrado está inerte y su botón expone aria-expanded/aria-controls'
  );
  await pm.evaluate(() => {
    const k =
      Object.keys(localStorage).find((x) => /^lector-anotaciones:[a-z0-9-]+$/.test(x)) ||
      'lector-anotaciones:libro-de-ejemplo';
    const p = document.querySelector('article.seccion:not([hidden]) p.bloque[data-pid]');
    localStorage.setItem(
      k,
      JSON.stringify({
        m1: {
          id: 'm1',
          tipo: 'subrayado',
          sid: p.closest('article').id.replace(/^sec-/, ''),
          pid: p.getAttribute('data-pid'),
          src: p.getAttribute('data-src'),
          inicio: 0,
          fin: 10,
          cita: p.textContent.slice(0, 10),
          antes: '',
          despues: p.textContent.slice(10, 40),
          color: 'duda',
          nota: '',
          estado: 'abierta',
          creado: '2026-10-01T00:00:00.000Z',
        },
      })
    );
  });
  await pm.reload();
  await pm.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pm.click('#b-panel');
  await pm.waitForSelector('aside.panel.abierta');
  await pm.click('.ficha .cab button.enlace');
  check(
    !(await pm.$eval('aside.panel', (a) => a.classList.contains('abierta'))),
    'en móvil, «ir al texto» cierra el panel para dejar ver el pasaje'
  );
  // el marcador «cambió» entra en la pantalla con un área táctil suficiente y un toque abre la diferencia
  await pm.goto(base + '#cap-02');
  await pm.waitForSelector('#sec-cap-02:not([hidden]) .marca-cambio');
  const marcaMovil = await pm.$eval('#sec-cap-02 .marca-cambio', (b) => {
    const r = b.getBoundingClientRect();
    const cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    return {
      left: Math.round(r.left),
      right: Math.round(r.right),
      ancho: Math.round(r.width),
      alto: Math.round(r.height),
      cx,
      cy,
      enCentro: document.elementFromPoint(cx, cy) === b,
    };
  });
  check(
    marcaMovil.left >= 0 &&
      marcaMovil.right <= 400 &&
      marcaMovil.ancho >= 32 &&
      marcaMovil.alto >= 32 &&
      marcaMovil.enCentro,
    `en móvil «cambió» está dentro de la pantalla con área táctil suficiente (x ${marcaMovil.left}–${marcaMovil.right}, ${marcaMovil.ancho}×${marcaMovil.alto})`
  );
  let tocado = false;
  try {
    await pm.touchscreen.tap(marcaMovil.cx, marcaMovil.cy);
    await pm.waitForSelector('.diff', { timeout: 2000 });
    tocado = true;
  } catch {
    tocado = false;
  }
  check(tocado, 'y un toque en su centro muestra la diferencia');
  await movil.close();
});

test('Cajones del teléfono: velo, cierre, foco, notas', async ({ browser }) => {
  const ctxC = await browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true });
  await ctxC.addInitScript(sinBase);
  const pc = await ctxC.newPage();
  const erroresC = [];
  pc.on('pageerror', (e) => erroresC.push(String(e)));
  pc.on('console', (m) => {
    if (m.type() === 'error') erroresC.push(m.text());
  });
  await pc.goto(base + '#cap-01');
  await pc.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  await pc.waitForFunction(() => /Sin base compartida/.test(document.querySelector('#estado').textContent));
  const tactil = await pc.evaluate(() => matchMedia('(pointer: coarse)').matches);
  // un punto del velo que el cajón abierto no tapa, lejos de su borde (que puede estar todavía deslizándose)
  const tocarFuera = async () => {
    const pt = await pc.evaluate(
      () =>
        [
          [380, 60],
          [200, 60],
          [12, 400],
        ].find(([x, y]) => document.elementFromPoint(x, y) === document.querySelector('#velo')) || [380, 60]
    );
    await pc.touchscreen.tap(pt[0], pt[1]);
  };
  const estadoCajon = () =>
    pc.evaluate(() => ({
      panel: document.querySelector('#panel').classList.contains('abierta'),
      indice: document.querySelector('#indice').classList.contains('abierta'),
      velo: !!document.querySelector('#velo') && !document.querySelector('#velo').hidden,
      cabecera: !!document.querySelector('header.barra').inert,
      lectura: !!document.querySelector('#lectura').inert,
      foco: document.activeElement.id || document.activeElement.tagName,
      enPanel: !!document.activeElement.closest('#panel'),
    }));
  await pc.click('#b-panel');
  const abiertoP = await estadoCajon();
  const cerrarVisible = await pc.evaluate(() => {
    const b = document.querySelector('#panel .cerrar');
    return !!b && b.getBoundingClientRect().width > 0;
  });
  check(
    abiertoP.panel && abiertoP.velo && abiertoP.cabecera && abiertoP.lectura && abiertoP.enPanel && cerrarVisible,
    `en el teléfono, el panel abierto tiene velo detrás, deja inerte el resto, recibe el foco y muestra «cerrar» (${JSON.stringify(abiertoP)})`
  );
  const fugas = [];
  for (let i = 0; i < 12; i++) {
    await pc.keyboard.press('Tab');
    fugas.push(
      await pc.evaluate(() =>
        document.activeElement.closest('header, #lectura, #indice')
          ? document.activeElement.tagName + ':' + document.activeElement.textContent.trim().slice(0, 12)
          : ''
      )
    );
  }
  check(
    fugas.every((x) => !x),
    `con el panel abierto, Tab no llega a lo que está detrás (${fugas.filter(Boolean).join(' · ')})`
  );
  await tocarFuera();
  const trasVelo = await estadoCajon();
  check(
    !trasVelo.panel && !trasVelo.velo && !trasVelo.cabecera && !trasVelo.lectura && trasVelo.foco === 'b-panel',
    `tocar fuera del panel (en el velo) lo cierra y devuelve el foco a su botón (${JSON.stringify(trasVelo)})`
  );
  await pc.click('#b-indice');
  const abiertoI = await estadoCajon();
  if (await pc.$('#indice .cerrar')) await pc.click('#indice .cerrar');
  const trasCerrarI = await estadoCajon();
  check(
    abiertoI.indice && abiertoI.velo && !trasCerrarI.indice && trasCerrarI.foco === 'b-indice',
    `el índice se cierra con su botón «×» y el foco vuelve a «Índice» (${JSON.stringify(trasCerrarI)})`
  );
  // subrayar con nota en el teléfono: la barra va abajo, la nota se abre en el panel y tocar fuera la guarda
  await seleccionar(pc, 30);
  await esperar(pc, () => getComputedStyle(document.querySelector('#sel-tb')).display === 'flex', null, 3000);
  const barraT = await pc.evaluate(() => {
    const t = document.querySelector('#sel-tb'),
      r = t.getBoundingClientRect(),
      b = t.querySelector('.col-btn').getBoundingClientRect();
    return { abajo: t.classList.contains('abajo'), bottom: Math.round(r.bottom), alto: Math.round(b.height) };
  });
  check(
    tactil && barraT.abajo && barraT.bottom >= 700 && barraT.alto >= 40,
    `en pantalla táctil la barra de subrayado va abajo, con botones de 40 px (${JSON.stringify(barraT)}, táctil: ${tactil})`
  );
  await pc.tap('#sel-nota');
  const notaAbierta = await esperar(
    pc,
    () =>
      document.querySelector('#panel').classList.contains('abierta') && document.activeElement.tagName === 'TEXTAREA',
    null,
    3000
  );
  check(notaAbierta, '«+ con nota» abre el panel con el cursor en la nota');
  await pc.keyboard.type('Nota escrita en el teléfono');
  await tocarFuera();
  const trasNota = await estadoCajon();
  check(
    !trasNota.panel &&
      !trasNota.velo &&
      trasNota.foco === 'MARK' &&
      (await guardadoLocal(pc, 'Nota escrita en el teléfono')),
    `tocar fuera tras escribir cierra el panel, guarda la nota y deja el foco en el pasaje nuevo (${JSON.stringify(trasNota)})`
  );
  // tocar un subrayado abre su ficha; Esc en la nota cierra el panel y devuelve el foco al pasaje
  await pc.tap('article.seccion:not([hidden]) mark.hl');
  const conFicha = await esperar(
    pc,
    () =>
      document.querySelector('#panel').classList.contains('abierta') && !!document.querySelector('#panel .ficha.foco'),
    null,
    3000
  );
  check(conFicha, 'tocar un subrayado abre el panel con su ficha');
  if (conFicha) {
    await pc.focus('.ficha.foco textarea');
    await pc.keyboard.press('Escape');
  }
  const trasEscM = await estadoCajon();
  check(
    !trasEscM.panel && trasEscM.foco === 'MARK',
    `Esc en la nota cierra el panel y deja el foco en el pasaje (${JSON.stringify(trasEscM)})`
  );
  // borrar con el panel abierto: «Deshacer» queda a mano, encima del velo
  await pc.click('#b-panel');
  await enFicha(pc, '#panel .ficha', 'button[data-accion="borrar"]');
  await pc.click('#panel .ficha button[data-accion="si"]');
  const undo = await pc.evaluate(() => {
    const u = document.querySelector('#deshacer');
    if (!u) return null;
    const r = u.getBoundingClientRect();
    return {
      inerte: !!u.closest('[inert]'),
      dentro: r.width > 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
      encima: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === u,
    };
  });
  check(
    !!undo && !undo.inerte && undo.dentro && undo.encima,
    `con el panel abierto, «Deshacer» sigue visible y se puede tocar (${JSON.stringify(undo)})`
  );
  if (undo && undo.encima) await pc.click('#deshacer');
  check((await pc.$$('#panel .ficha')).length === 1, 'y deshacer devuelve la ficha');
  // en concentración, tocar un subrayado sale de ella y muestra la ficha (no un velo sin nada)
  await tocarFuera();
  if (!(await esperar(pc, () => document.querySelector('#velo').hidden, null, 1500))) {
    await tocarFuera();
    await esperar(pc, () => document.querySelector('#velo').hidden, null, 1500);
  }
  await pc.click('#b-mas');
  await pc.click('#b-foco');
  await pc.tap('article.seccion:not([hidden]) mark.hl');
  const concentrado = await pc.evaluate(() => ({
    foco: document.querySelector('#app').classList.contains('foco'),
    panelVisible:
      document.querySelector('#panel').getClientRects().length > 0 &&
      document.querySelector('#panel').classList.contains('abierta'),
    cuerpo: document.activeElement === document.body,
  }));
  check(
    !concentrado.foco && concentrado.panelVisible && !concentrado.cuerpo,
    `en concentración, tocar un subrayado sale de ella y abre su ficha (${JSON.stringify(concentrado)})`
  );
  // cambiar el ancho con el panel abierto: al volver a estrecho, el cajón sólo reaparece si el foco sigue en él (una nota
  // a medio escribir); si se siguió leyendo, el texto no queda inerte detrás de un velo
  await pc.setViewportSize({ width: 1280, height: 800 });
  await pc.focus('#panel .ficha textarea');
  await pc.setViewportSize({ width: 400, height: 800 });
  await esperar(pc, () => document.querySelector('#panel').classList.contains('abierta'), null, 2000); // el cambio de media llega en el cuadro siguiente
  const conNota = await estadoCajon();
  check(
    conNota.panel && conNota.velo && (await pc.evaluate(() => document.activeElement.tagName)) === 'TEXTAREA',
    `estrechar la pantalla con una nota en edición deja el panel abierto con el cursor en ella (${JSON.stringify(conNota)})`
  );
  await pc.setViewportSize({ width: 1280, height: 800 });
  await esperar(pc, () => !document.querySelector('#panel').classList.contains('abierta'), null, 2000); // el cambio de media llega en el cuadro siguiente
  // seguir leyendo: un toque en un párrafo sin subrayados (un subrayado abriría su ficha, y con ella el panel)
  const puntoLibre = await pc.evaluate(() => {
    const ps = Array.from(document.querySelectorAll('article.seccion:not([hidden]) p.bloque[data-pid]')).filter(
      (p) => !p.querySelector('mark')
    );
    const p = ps[ps.length - 1];
    p.scrollIntoView({ block: 'center' });
    const r = p.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await pc.mouse.click(puntoLibre.x, puntoLibre.y);
  await pc.setViewportSize({ width: 400, height: 800 });
  await pc.waitForTimeout(150);
  const trasAncho = await estadoCajon();
  check(
    !trasAncho.panel && !trasAncho.velo && !trasAncho.lectura && !trasAncho.cabecera,
    `pasar a ancho, seguir leyendo y volver no deja un cajón abierto ni el texto inerte (${JSON.stringify(trasAncho)})`
  );
  // Esc con «⋯» abierto y el foco en la búsqueda lo cierra
  await pc.click('#b-mas');
  await pc.focus('#buscar');
  await pc.keyboard.press('Escape');
  check(!(await pc.$eval('#herramientas', (h) => h.classList.contains('abierta'))), 'Esc en la búsqueda cierra «⋯»');
  // a 360 px la barra de subrayado cabe en la pantalla
  await pc.setViewportSize({ width: 360, height: 760 });
  await seleccionar(pc, 25);
  await esperar(pc, () => getComputedStyle(document.querySelector('#sel-tb')).display === 'flex', null, 3000);
  const barra360 = await pc.$eval('#sel-tb', (t) => {
    const r = t.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.right)];
  });
  check(
    barra360[0] >= 0 && barra360[1] <= 360,
    `a 360 px la barra de subrayado cabe en la pantalla (${barra360.join('–')})`
  );
  await pc.keyboard.press('Escape');
  check(
    await pc.evaluate(
      () => getComputedStyle(document.querySelector('#sel-tb')).display === 'none' && getSelection().isCollapsed
    ),
    'Esc con una selección la suelta y oculta la barra'
  );
  await pc.setViewportSize({ width: 400, height: 800 });
  const anchosC = await pc.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  check(anchosC[0] <= anchosC[1], `sin desborde horizontal con los cajones nuevos (${anchosC.join(' / ')})`);
  check(
    erroresC.length === 0,
    `sin errores de consola en el recorrido del teléfono${erroresC.length ? ': ' + erroresC.join(' | ') : ''}`
  );
  await ctxC.close();
});
