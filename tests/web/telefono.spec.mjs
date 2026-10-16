// En el teléfono: ancho, cajones con velo, foco y notas, concentración y marcas de párrafo.
import {
  check,
  esperar,
  enFicha,
  seleccionarTexto,
  seleccionar,
  libroAlterado,
  conCambio,
  activo,
  CLAVE_LOCAL,
  guardadoLocal,
  sinErrores,
  TELEFONO,
  test,
} from './ayudas.mjs';

const BLOQUES = 'article.seccion:not([hidden]) .bloque[data-pid]';
const PARRAFOS = 'article.seccion:not([hidden]) p.bloque[data-pid]';
// La página ya dice que no hay base compartida.
const sinBaseCompartida = (p) =>
  p.waitForFunction(() => /Sin base compartida/.test(document.querySelector('#estado').textContent));
// El ancho del documento y el de la ventana: sin desborde horizontal, el primero no pasa del segundo.
const anchos = (p) => p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);

// ------------------------------------------------------------ ancho de teléfono
// A 400 px, sin base, en la portada, con un párrafo del capítulo 2 cambiado (para el marcador «cambió»).
const alAncho = (abrir) => abrir({ hash: '', contexto: TELEFONO, preparar: (p) => libroAlterado(p, conCambio) });

test('A 400 px no hay desborde, y el índice y el panel escondidos quedan fuera del orden de Tab e inertes', async ({
  abrir,
}) => {
  const p = await alAncho(abrir);
  const a = await anchos(p);
  check(a[0] <= a[1], `sin desborde horizontal a 400 px (${a.join(' / ')})`);
  await sinBaseCompartida(p);
  // índice y panel escondidos quedan fuera del orden de Tab; los botones dicen si están abiertos
  await p.focus('#b-mas');
  const recorrido = [];
  for (let i = 0; i < 8; i++) {
    await p.keyboard.press('Tab');
    recorrido.push(await activo(p));
  }
  check(
    recorrido.every((x) => !x.enLateral && x.left >= 0),
    `a 400 px, Tab no entra en el índice ni en el panel escondidos (${recorrido.map((x) => x.tag + ':' + x.texto.slice(0, 12)).join(' → ')})`
  );
  const lateralesAntes = await p.evaluate(() => ({
    indice: document.querySelector('#indice').inert,
    expandido: document.querySelector('#b-indice').getAttribute('aria-expanded'),
    controla: document.querySelector('#b-indice').getAttribute('aria-controls'),
  }));
  await p.click('#b-indice');
  const lateralesDespues = await p.evaluate(() => ({
    indice: document.querySelector('#indice').inert,
    expandido: document.querySelector('#b-indice').getAttribute('aria-expanded'),
  }));
  await p.keyboard.press('Escape');
  check(
    lateralesAntes.indice &&
      lateralesAntes.expandido === 'false' &&
      lateralesAntes.controla === 'indice' &&
      !lateralesDespues.indice &&
      lateralesDespues.expandido === 'true' &&
      (await p.$eval('#b-indice', (b) => b.getAttribute('aria-expanded'))) === 'false',
    'el índice cerrado está inerte y su botón expone aria-expanded/aria-controls'
  );
});

test('En el teléfono, «ir al texto» cierra el panel para dejar ver el pasaje', async ({ abrir }) => {
  const p = await alAncho(abrir);
  await sinBaseCompartida(p);
  // un subrayado en el primer párrafo visible, sembrado en la copia local como lo hacía la prueba original
  await p.evaluate(() => {
    const k =
      Object.keys(localStorage).find((x) => /^lector-anotaciones:[a-z0-9-]+$/.test(x)) ||
      'lector-anotaciones:libro-de-ejemplo';
    const par = document.querySelector('article.seccion:not([hidden]) p.bloque[data-pid]');
    localStorage.setItem(
      k,
      JSON.stringify({
        m1: {
          id: 'm1',
          tipo: 'subrayado',
          sid: par.closest('article').id.replace(/^sec-/, ''),
          pid: par.getAttribute('data-pid'),
          src: par.getAttribute('data-src'),
          inicio: 0,
          fin: 10,
          cita: par.textContent.slice(0, 10),
          antes: '',
          despues: par.textContent.slice(10, 40),
          color: 'duda',
          nota: '',
          estado: 'abierta',
          creado: '2026-10-01T00:00:00.000Z',
        },
      })
    );
  });
  await p.reload();
  await p.waitForSelector(BLOQUES);
  await p.click('#b-panel');
  await p.waitForSelector('aside.panel.abierta');
  await p.click('.ficha .cab button.enlace');
  check(
    !(await p.$eval('aside.panel', (a) => a.classList.contains('abierta'))),
    'en móvil, «ir al texto» cierra el panel para dejar ver el pasaje'
  );
});

test('En el teléfono, el marcador «cambió» entra en la pantalla con área táctil suficiente, y un toque muestra la diferencia', async ({
  abrir,
  base,
}) => {
  const p = await alAncho(abrir);
  // se llega al capítulo 2 desde la portada, como en el recorrido original
  await p.goto(base + '#cap-02');
  await p.waitForSelector('#sec-cap-02:not([hidden]) .marca-cambio');
  const marcaMovil = await p.$eval('#sec-cap-02 .marca-cambio', (b) => {
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
    await p.touchscreen.tap(marcaMovil.cx, marcaMovil.cy);
    await p.waitForSelector('.diff', { timeout: 2000 });
    tocado = true;
  } catch {
    tocado = false;
  }
  check(tocado, 'y un toque en su centro muestra la diferencia');
});

// ------------------------------------------------------------ cajones: velo, cierre, foco y notas
// El teléfono de los cajones es el de la prueba original: además, `isMobile`.
const MOVIL = { ...TELEFONO, isMobile: true };
// En el teléfono, sin base, en el capítulo 1.
async function enElTelefono(abrir) {
  const p = await abrir({ contexto: MOVIL });
  await p.waitForSelector(PARRAFOS);
  await sinBaseCompartida(p);
  return p;
}
// Toca un punto del velo que el cajón abierto no tapa, lejos de su borde (que puede estar todavía deslizándose).
async function tocarFuera(p) {
  const pt = await p.evaluate(
    () =>
      [
        [380, 60],
        [200, 60],
        [12, 400],
      ].find(([x, y]) => document.elementFromPoint(x, y) === document.querySelector('#velo')) || [380, 60]
  );
  await p.touchscreen.tap(pt[0], pt[1]);
}
// Qué cajón está abierto, si se ve el velo, qué queda inerte y dónde está el foco.
const estadoCajon = (p) =>
  p.evaluate(() => ({
    panel: document.querySelector('#panel').classList.contains('abierta'),
    indice: document.querySelector('#indice').classList.contains('abierta'),
    velo: !!document.querySelector('#velo') && !document.querySelector('#velo').hidden,
    cabecera: !!document.querySelector('header.barra').inert,
    lectura: !!document.querySelector('#lectura').inert,
    foco: document.activeElement.id || document.activeElement.tagName,
    enPanel: !!document.activeElement.closest('#panel'),
  }));
// En el teléfono, un subrayado con nota hecho desde la barra táctil al principio del primer párrafo, y guardado al
// tocar fuera. Devuelve lo que se vio en cada paso: si la pantalla es táctil, la barra de subrayado, si la nota se abrió
// en el panel, el cajón tras tocar fuera y si la nota quedó guardada.
async function conNotaEnElTelefono(abrir) {
  const p = await enElTelefono(abrir);
  const tactil = await p.evaluate(() => matchMedia('(pointer: coarse)').matches);
  await seleccionar(p, 30);
  await esperar(p, () => getComputedStyle(document.querySelector('#sel-tb')).display === 'flex', null, 3000);
  const barra = await p.evaluate(() => {
    const t = document.querySelector('#sel-tb'),
      r = t.getBoundingClientRect(),
      b = t.querySelector('.col-btn').getBoundingClientRect();
    return { abajo: t.classList.contains('abajo'), bottom: Math.round(r.bottom), alto: Math.round(b.height) };
  });
  await p.tap('#sel-nota');
  const notaAbierta = await esperar(
    p,
    () =>
      document.querySelector('#panel').classList.contains('abierta') && document.activeElement.tagName === 'TEXTAREA',
    null,
    3000
  );
  await p.keyboard.type('Nota escrita en el teléfono');
  await tocarFuera(p);
  const trasNota = await estadoCajon(p);
  const guardada = await guardadoLocal(p, 'Nota escrita en el teléfono');
  return { p, tactil, barra, notaAbierta, trasNota, guardada };
}
// Entra en concentración desde «⋯» y toca el subrayado.
async function concentrarYTocar(p) {
  await p.click('#b-mas');
  await p.click('#b-foco');
  await p.tap('article.seccion:not([hidden]) mark.hl');
}

test('El panel en el teléfono: velo detrás, el resto inerte, el foco dentro sin escaparse con Tab; tocar el velo lo cierra', async ({
  abrir,
}) => {
  const p = await enElTelefono(abrir);
  await p.click('#b-panel');
  const abiertoP = await estadoCajon(p);
  const cerrarVisible = await p.evaluate(() => {
    const b = document.querySelector('#panel .cerrar');
    return !!b && b.getBoundingClientRect().width > 0;
  });
  check(
    abiertoP.panel && abiertoP.velo && abiertoP.cabecera && abiertoP.lectura && abiertoP.enPanel && cerrarVisible,
    `en el teléfono, el panel abierto tiene velo detrás, deja inerte el resto, recibe el foco y muestra «cerrar» (${JSON.stringify(abiertoP)})`
  );
  const fugas = [];
  for (let i = 0; i < 12; i++) {
    await p.keyboard.press('Tab');
    fugas.push(
      await p.evaluate(() =>
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
  await tocarFuera(p);
  const trasVelo = await estadoCajon(p);
  check(
    !trasVelo.panel && !trasVelo.velo && !trasVelo.cabecera && !trasVelo.lectura && trasVelo.foco === 'b-panel',
    `tocar fuera del panel (en el velo) lo cierra y devuelve el foco a su botón (${JSON.stringify(trasVelo)})`
  );
  sinErrores(p, 'con el panel del teléfono', { consola: true });
});

test('El índice en el teléfono se cierra con su «×» y el foco vuelve a «Índice»', async ({ abrir }) => {
  const p = await enElTelefono(abrir);
  await p.click('#b-indice');
  const abiertoI = await estadoCajon(p);
  if (await p.$('#indice .cerrar')) await p.click('#indice .cerrar');
  const trasCerrarI = await estadoCajon(p);
  check(
    abiertoI.indice && abiertoI.velo && !trasCerrarI.indice && trasCerrarI.foco === 'b-indice',
    `el índice se cierra con su botón «×» y el foco vuelve a «Índice» (${JSON.stringify(trasCerrarI)})`
  );
  sinErrores(p, 'con el índice del teléfono', { consola: true });
});

test('Subrayar con nota en el teléfono: la barra va abajo con botones grandes, la nota se abre en el panel y tocar fuera la guarda', async ({
  abrir,
}) => {
  const { p, tactil, barra, notaAbierta, trasNota, guardada } = await conNotaEnElTelefono(abrir);
  check(
    tactil && barra.abajo && barra.bottom >= 700 && barra.alto >= 40,
    `en pantalla táctil la barra de subrayado va abajo, con botones de 40 px (${JSON.stringify(barra)}, táctil: ${tactil})`
  );
  check(notaAbierta, '«+ con nota» abre el panel con el cursor en la nota');
  check(
    !trasNota.panel && !trasNota.velo && trasNota.foco === 'MARK' && guardada,
    `tocar fuera tras escribir cierra el panel, guarda la nota y deja el foco en el pasaje nuevo (${JSON.stringify(trasNota)})`
  );
  sinErrores(p, 'al subrayar con nota en el teléfono', { consola: true });
});

test('Tocar un subrayado en el teléfono abre el panel con su ficha; Esc en la nota lo cierra y deja el foco en el pasaje', async ({
  abrir,
}) => {
  const { p } = await conNotaEnElTelefono(abrir);
  await p.tap('article.seccion:not([hidden]) mark.hl');
  const conFicha = await esperar(
    p,
    () =>
      document.querySelector('#panel').classList.contains('abierta') && !!document.querySelector('#panel .ficha.foco'),
    null,
    3000
  );
  check(conFicha, 'tocar un subrayado abre el panel con su ficha');
  if (conFicha) {
    await p.focus('.ficha.foco textarea');
    await p.keyboard.press('Escape');
  }
  const trasEscM = await estadoCajon(p);
  check(
    !trasEscM.panel && trasEscM.foco === 'MARK',
    `Esc en la nota cierra el panel y deja el foco en el pasaje (${JSON.stringify(trasEscM)})`
  );
  sinErrores(p, 'al tocar un subrayado en el teléfono', { consola: true });
});

test('Borrar con el panel abierto en el teléfono: «Deshacer» sigue visible encima del velo y devuelve la ficha', async ({
  abrir,
}) => {
  // el panel cerrado y el foco en el pasaje, como los dejaba Esc en la nota en el recorrido original
  const { p } = await conNotaEnElTelefono(abrir);
  await p.click('#b-panel');
  await enFicha(p, '#panel .ficha', 'button[data-accion="borrar"]');
  await p.click('#panel .ficha button[data-accion="si"]');
  const undo = await p.evaluate(() => {
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
  if (undo && undo.encima) await p.click('#deshacer');
  check((await p.$$('#panel .ficha')).length === 1, 'y deshacer devuelve la ficha');
  sinErrores(p, 'al borrar y deshacer en el teléfono', { consola: true });
});

test('En concentración, tocar un subrayado en el teléfono sale de ella y abre su ficha', async ({ abrir }) => {
  // el panel ya está cerrado: en el recorrido original se cerraba tocando fuera tras deshacer un borrado
  const { p } = await conNotaEnElTelefono(abrir);
  await concentrarYTocar(p);
  const concentrado = await p.evaluate(() => ({
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
  sinErrores(p, 'al salir de la concentración en el teléfono', { consola: true });
});

test('Cambiar el ancho con el panel abierto: el cajón sólo reaparece con una nota a medio escribir, y el texto no queda inerte', async ({
  abrir,
}) => {
  const { p } = await conNotaEnElTelefono(abrir);
  // el panel abierto con la ficha del subrayado, como lo dejaba tocarlo en concentración en el recorrido original
  await concentrarYTocar(p);
  // al volver a estrecho, el cajón sólo reaparece si el foco sigue en él (una nota a medio escribir); si se siguió
  // leyendo, el texto no queda inerte detrás de un velo
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.focus('#panel .ficha textarea');
  await p.setViewportSize({ width: 400, height: 800 });
  await esperar(p, () => document.querySelector('#panel').classList.contains('abierta'), null, 2000); // el cambio de media llega en el cuadro siguiente
  const conNota = await estadoCajon(p);
  check(
    conNota.panel && conNota.velo && (await p.evaluate(() => document.activeElement.tagName)) === 'TEXTAREA',
    `estrechar la pantalla con una nota en edición deja el panel abierto con el cursor en ella (${JSON.stringify(conNota)})`
  );
  await p.setViewportSize({ width: 1280, height: 800 });
  await esperar(p, () => !document.querySelector('#panel').classList.contains('abierta'), null, 2000); // el cambio de media llega en el cuadro siguiente
  // seguir leyendo: un toque en un párrafo sin subrayados (un subrayado abriría su ficha, y con ella el panel)
  const puntoLibre = await p.evaluate(() => {
    const ps = Array.from(document.querySelectorAll('article.seccion:not([hidden]) p.bloque[data-pid]')).filter(
      (x) => !x.querySelector('mark')
    );
    const par = ps[ps.length - 1];
    par.scrollIntoView({ block: 'center' });
    const r = par.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await p.mouse.click(puntoLibre.x, puntoLibre.y);
  await p.setViewportSize({ width: 400, height: 800 });
  await p.waitForTimeout(150);
  const trasAncho = await estadoCajon(p);
  check(
    !trasAncho.panel && !trasAncho.velo && !trasAncho.lectura && !trasAncho.cabecera,
    `pasar a ancho, seguir leyendo y volver no deja un cajón abierto ni el texto inerte (${JSON.stringify(trasAncho)})`
  );
  // la comprobación de desborde del final del recorrido original, también tras abrir y cerrar cajones cambiando el ancho
  const a = await anchos(p);
  check(a[0] <= a[1], `sin desborde horizontal con los cajones nuevos (${a.join(' / ')})`);
  sinErrores(p, 'al cambiar el ancho con el panel abierto', { consola: true });
});

test('En pantalla estrecha: Esc en la búsqueda cierra «⋯»; a 360 px la barra de subrayado cabe y Esc la suelta', async ({
  abrir,
}) => {
  // con el subrayado del recorrido original al principio del primer párrafo: la selección cae en el texto que le sigue
  const { p } = await conNotaEnElTelefono(abrir);
  await p.click('#b-mas');
  await p.focus('#buscar');
  await p.keyboard.press('Escape');
  check(!(await p.$eval('#herramientas', (h) => h.classList.contains('abierta'))), 'Esc en la búsqueda cierra «⋯»');
  await p.setViewportSize({ width: 360, height: 760 });
  await seleccionar(p, 25);
  await esperar(p, () => getComputedStyle(document.querySelector('#sel-tb')).display === 'flex', null, 3000);
  const barra360 = await p.$eval('#sel-tb', (t) => {
    const r = t.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.right)];
  });
  check(
    barra360[0] >= 0 && barra360[1] <= 360,
    `a 360 px la barra de subrayado cabe en la pantalla (${barra360.join('–')})`
  );
  await p.keyboard.press('Escape');
  check(
    await p.evaluate(
      () => getComputedStyle(document.querySelector('#sel-tb')).display === 'none' && getSelection().isCollapsed
    ),
    'Esc con una selección la suelta y oculta la barra'
  );
  await p.setViewportSize({ width: 400, height: 800 });
  const a = await anchos(p);
  check(a[0] <= a[1], `sin desborde horizontal con los cajones nuevos (${a.join(' / ')})`);
  sinErrores(p, 'en pantalla estrecha', { consola: true });
});

// ------------------------------------------------------------ concentración
test('En el teléfono, la concentración esconde la barra de índice y anotaciones', async ({ abrir }) => {
  const p = await abrir({ hash: '', contexto: TELEFONO });
  const antes = await p.evaluate(() => getComputedStyle(document.querySelector('#movil-barra')).display);
  await p.focus('#lectura');
  await p.keyboard.press('f');
  const despues = await p.evaluate(() => getComputedStyle(document.querySelector('#movil-barra')).display);
  check(
    antes === 'flex' && despues === 'none',
    `la concentración esconde la barra del teléfono (${antes} → ${despues})`
  );
});

// ------------------------------------------------------------ marcas de párrafo
const MARCADO = 'article.seccion:not([hidden]) p.bloque:has(mark.hl)';
// La marca del primer párrafo con subrayados: su cuenta, su etiqueta, su color, si se ve y el texto del párrafo.
const marcaDe = (p) =>
  p.evaluate((s) => {
    const par = document.querySelector(s);
    const m = par && par.querySelector('.marca-anot');
    return m
      ? {
          n: m.getAttribute('data-n'),
          etiqueta: m.getAttribute('aria-label'),
          color: m.className,
          vista: getComputedStyle(m).display,
          texto: par.textContent,
        }
      : null;
  }, MARCADO);
// En el teléfono, en el capítulo 1: dos subrayados en el primer párrafo, «duda» y, antes en el texto, «revisar».
// Devuelve también el texto del párrafo antes de subrayar.
async function dosEnUnParrafo(abrir) {
  const p = await abrir({ contexto: TELEFONO });
  await p.waitForSelector(PARRAFOS);
  const textoAntes = await p.evaluate(
    () => document.querySelector('article.seccion:not([hidden]) p.bloque[data-pid]').textContent
  );
  for (const [texto, tecla] of [
    ['escrita con prisa', '3'],
    ['Un hecho es lo que se observó', '1'],
  ]) {
    await seleccionarTexto(p, texto);
    await p.keyboard.press(tecla);
    await p.keyboard.press('Escape');
  }
  return { p, textoAntes };
}
// Un tercer subrayado («cortar») en el mismo párrafo, con la marca ya puesta.
async function tercero(p) {
  await seleccionarTexto(p, 'La diferencia parece obvia');
  await p.keyboard.press('2');
  await p.keyboard.press('Escape');
}

test('Marca de párrafo en el teléfono: la cuenta y el color de la primera anotación, sin añadir texto; subrayar con ella puesta no corre los desplazamientos', async ({
  abrir,
}) => {
  const { p, textoAntes } = await dosEnUnParrafo(abrir);
  const m1 = await marcaDe(p);
  check(
    m1 &&
      m1.n === '2' &&
      m1.etiqueta === '2 anotaciones en este párrafo' &&
      /c-revisar/.test(m1.color) &&
      m1.vista !== 'none',
    `el párrafo lleva su marca con la cuenta y el color de la primera anotación (${JSON.stringify(m1)})`
  );
  check(m1 && m1.texto === textoAntes, 'la marca no añade texto al párrafo');
  // con la marca puesta, un subrayado nuevo guarda la cita exacta y sus desplazamientos
  await tercero(p);
  const nueva = await p.evaluate(
    ({ k, s }) => {
      const a = Object.values(JSON.parse(localStorage.getItem(k) || '{}')).find((x) => x.color === 'cortar');
      const par = document.querySelector(s).cloneNode(true);
      par.querySelectorAll('.pg, .marca-cambio, .marca-anot').forEach((x) => x.remove());
      return a && { cita: a.cita, inicio: a.inicio, esperado: par.textContent.indexOf('La diferencia parece obvia') };
    },
    { k: CLAVE_LOCAL, s: MARCADO }
  );
  check(
    nueva && nueva.cita === 'La diferencia parece obvia' && nueva.inicio === nueva.esperado,
    `subrayar con la marca puesta no corre los desplazamientos (${JSON.stringify(nueva)})`
  );
  check((await marcaDe(p)).n === '3', 'la cuenta sube con el subrayado nuevo');
});

test('Marca de párrafo en el teléfono: tocarla abre la primera anotación; avisa de una respuesta por revisar; en pantalla ancha no se ve', async ({
  abrir,
}) => {
  const { p } = await dosEnUnParrafo(abrir);
  await tercero(p);
  // tocarla abre el panel en la primera anotación del párrafo (la del principio)
  await p.tap(`${MARCADO} .marca-anot`);
  const abierta = await p.evaluate(() => {
    const f = document.querySelector('.ficha.foco');
    return {
      panel: document.querySelector('#panel').classList.contains('abierta'),
      cita: f && f.querySelector('.cita') ? f.querySelector('.cita').textContent : null,
    };
  });
  check(
    abierta.panel && abierta.cita === 'Un hecho es lo que se observó',
    `tocar la marca abre el panel en la primera anotación del párrafo (${JSON.stringify(abierta)})`
  );
  // una respuesta por revisar en el párrafo pone un punto en la marca, y lo dice
  await p.evaluate((k) => {
    const j = JSON.parse(localStorage.getItem(k));
    const a = Object.values(j).find((x) => x.color === 'duda');
    Object.assign(a, { respuesta: 'Hecho.', cierre: 'atendida', respondido: '2026-10-05T00:00:00.000Z' });
    localStorage.setItem(k, JSON.stringify(j));
  }, CLAVE_LOCAL);
  await p.reload();
  await p.waitForSelector(`${MARCADO} .marca-anot`);
  const conRespuesta = await marcaDe(p);
  check(
    /por-revisar/.test(conRespuesta.color) && /con respuesta por revisar$/.test(conRespuesta.etiqueta),
    `la marca avisa de la respuesta por revisar (${JSON.stringify(conRespuesta)})`
  );
  await p.setViewportSize({ width: 1280, height: 900 });
  check((await marcaDe(p)).vista === 'none', 'en pantalla ancha (con notas al margen) la marca no se ve');
});
