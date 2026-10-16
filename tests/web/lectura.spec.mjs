// Leer: capas, cambios entre versiones, progreso, concentración, atajos, voz y accesibilidad.
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

test('Capas, cambios, progreso, concentración, atajos, etiquetas, deshacer, búsqueda en notas, figura', async ({
  browser,
}) => {
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx2.addInitScript(sinBase);
  await ctx2.grantPermissions(['clipboard-read', 'clipboard-write']);
  const p2 = await ctx2.newPage();
  const errores2 = [];
  p2.on('pageerror', (e) => errores2.push(String(e)));
  p2.on('console', (m) => {
    if (m.type() === 'error') errores2.push(`${m.text()} (${(m.location() || {}).url || 'sin url'})`);
  });
  // libro.json con un bloque cambiado respecto de la construcción anterior
  await p2.route('**/libro.json', async (route) => {
    const L = JSON.parse(fs.readFileSync(LIBRO, 'utf8'));
    const cap2 = L.secciones.find((s) => /^Capítulo 2/.test(s.titulo));
    const b = cap2.bloques.find((x) => x.t === 'p');
    b.anterior = 'Una inferencia es un salto desde lo observado hacia lo no observado.';
    L.anterior_generado = '2026-01-01';
    L.cambios = 1;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(L) });
  });
  await p2.goto(base + '#cap-02');
  await p2.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await p2.waitForFunction(() => /Sin base compartida/.test(document.querySelector('#estado').textContent));
  check(!(await p2.$eval('#capas', (d) => d.hidden)), 'el menú de capas aparece cuando libro.json las trae');
  await p2.click('#capas > summary');
  const etiquetasCapas = await p2.$$eval('#capas-menu label', (ls) => ls.map((l) => l.textContent));
  check(
    etiquetasCapas.some((t) => /frases largas/.test(t)) && etiquetasCapas.some((t) => /muletillas/.test(t)),
    `el menú lista las capas con sus cuentas (${etiquetasCapas.length})`
  );
  await p2.check('#capas-menu input[data-capa="fl"]');
  await p2.check('#capas-menu input[data-capa="mu"]');
  await p2.waitForSelector('article.seccion:not([hidden]) span.capa.k-fl');
  const nMu = (await p2.$$('article.seccion:not([hidden]) span.capa.k-mu')).length;
  check(nMu >= 1, `las capas activas se pintan sobre el texto (muletillas: ${nMu})`);
  const resumenCapas = await p2.$eval(
    'article.seccion:not([hidden]) .sec-herr span[id^="capas-"]',
    (s) => s.textContent
  );
  check(
    /frases largas/.test(resumenCapas) && /muletillas/.test(resumenCapas),
    `la sección resume sus señales (${resumenCapas})`
  );
  await p2.uncheck('#capas-menu input[data-capa="fl"]');
  check(
    (await p2.$$('article.seccion:not([hidden]) span.capa.k-fl')).length === 0,
    'al apagar una capa, sus marcas desaparecen'
  );
  await p2.keyboard.press('Escape');
  // qué cambió
  check(
    (await p2.$$('article.seccion:not([hidden]) .bloque.cambiado')).length === 1,
    'el bloque cambiado en la última construcción se marca'
  );
  const chipCambio = await p2.$eval('article.seccion:not([hidden]) .sec-herr .chip', (c) => c.textContent);
  check(/1 bloque cambiado/.test(chipCambio), `la sección cuenta sus bloques cambiados (${chipCambio})`);
  await p2.click('article.seccion:not([hidden]) .marca-cambio');
  await p2.waitForSelector('.diff');
  const diff = await p2.$eval('.diff', (d) => ({
    del: Array.from(d.querySelectorAll('del'))
      .map((x) => x.textContent)
      .join('|'),
    ins: Array.from(d.querySelectorAll('ins'))
      .map((x) => x.textContent)
      .join('|'),
  }));
  check(
    /salto/.test(diff.del) && /paso/.test(diff.ins),
    `la diferencia muestra lo quitado y lo añadido (${JSON.stringify(diff).slice(0, 80)})`
  );
  await p2.click('article.seccion:not([hidden]) .marca-cambio');
  check((await p2.$$('.diff')).length === 0, 'volver a pulsar oculta la diferencia');
  // cambió desde tu última lectura (huella guardada distinta)
  const pidCap2 = await p2.$eval('article.seccion:not([hidden]) p.bloque[data-pid]:not(.cambiado)', (n) =>
    n.getAttribute('data-pid')
  );
  await p2.evaluate((pid) => {
    const k = Object.keys(localStorage).find((x) => x.endsWith(':visto'));
    const v = JSON.parse(localStorage.getItem(k) || '{}');
    v[pid] = 'huellavieja';
    localStorage.setItem(k, JSON.stringify(v));
  }, pidCap2);
  await p2.reload();
  await p2.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  check(
    await p2.$eval(
      `[data-pid="${pidCap2}"]`,
      (n) => n.classList.contains('cambiado') && /última lectura/.test(n.querySelector('.marca-cambio').title)
    ),
    'un bloque con huella distinta de la vista se marca como cambiado desde la última lectura'
  );
  // progreso y leída
  await p2.check('article.seccion:not([hidden]) input[data-leida]');
  const prog = await p2.evaluate(() => ({
    leida: !!document.querySelector('nav a.sec.activa.leida'),
    ancho: document.querySelector('nav .progreso[data-grupo="parte-1"] i').style.width,
  }));
  check(
    prog.leida && prog.ancho !== '0%' && prog.ancho !== '',
    `marcar leída actualiza el índice y la barra de progreso (${prog.ancho})`
  );
  await p2.keyboard.press('l');
  check(!(await p2.$('nav a.sec.activa.leida')), 'la tecla L alterna la marca de leída');
  // concentración
  await p2.click('#b-foco');
  const foco = await p2.evaluate(() => ({
    on: document.querySelector('#app').classList.contains('foco'),
    nav: getComputedStyle(document.querySelector('nav.indice')).display,
    panel: getComputedStyle(document.querySelector('aside.panel')).display,
  }));
  check(foco.on && foco.nav === 'none' && foco.panel === 'none', 'el modo concentración oculta índice y panel');
  await p2.keyboard.press('Escape');
  check(
    !(await p2.evaluate(() => document.querySelector('#app').classList.contains('foco'))),
    'Esc sale del modo concentración'
  );
  // atajos: 2 subraya en rojo; ? abre la ayuda
  await seleccionar(p2, 18);
  await p2.keyboard.press('2');
  await p2.waitForSelector('article.seccion:not([hidden]) mark.hl.c-cortar');
  check(true, 'la tecla 2 subraya la selección en «cortar»');
  await p2.keyboard.press('?');
  check(await p2.$eval('#atajos', (a) => a.open), 'la tecla ? muestra los atajos');
  await p2.keyboard.press('Escape');
  // etiquetas en la nota, filtro por etiqueta, búsqueda en notas
  await p2.click('.tab[data-tab="todas"]');
  await p2.fill('.ficha textarea', 'Revisar con #carmen la cinética');
  await p2.$eval('.ficha textarea', (t) => t.blur());
  await p2.waitForSelector('.ficha .etiquetas button');
  check(
    (await p2.$eval('.ficha .etiquetas button', (b) => b.textContent)) === '#carmen' &&
      !(await p2.$eval('#f-etiqueta', (s) => s.hidden)),
    'las #etiquetas de la nota se vuelven chips y un selector'
  );
  await abrirDe(p2, '#f-etiqueta');
  await p2.selectOption('#f-etiqueta', 'carmen');
  check((await p2.$$('.ficha')).length === 1, 'el filtro por etiqueta deja las fichas con esa etiqueta');
  await pulsar(p2, '.filtro[data-f="conservar"]');
  await p2.fill('#buscar', 'cinética');
  await p2.press('#buscar', 'Enter');
  await p2.waitForSelector('.res.anot');
  check(true, 'la búsqueda encuentra el texto de una nota');
  // activar el resultado con el teclado deja el foco en la ficha, no en el cuerpo del documento
  await p2.focus('.res.anot');
  await p2.keyboard.press('Enter');
  await p2.waitForSelector('.ficha.foco textarea');
  const trasEnterRes = await activo(p2);
  check(trasEnterRes.enFoco, `Enter en un resultado de búsqueda lleva el foco a la ficha (${trasEnterRes.tag})`);
  const trasResultado = await p2.evaluate(() => ({
    tab: document.querySelector('.tab.activa').getAttribute('data-tab'),
    filtro: document.querySelector('.filtro.on').getAttribute('data-f'),
    nota: document.querySelector('.ficha.foco textarea').value,
  }));
  check(
    trasResultado.tab !== 'buscar' && trasResultado.filtro === 'todas' && /cinética/.test(trasResultado.nota),
    `pulsar el resultado abre la ficha, saliendo de la búsqueda y del filtro que la escondía (${trasResultado.tab}, ${trasResultado.filtro})`
  );
  // copiar una selección que empieza en un marcador del margen o con la palabra «Cambió» del manuscrito
  const copiaMarcador = await p2.evaluate(async () => {
    const p = document.querySelector('article.seccion:not([hidden]) .bloque.cambiado');
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let tn = w.nextNode();
    while (tn && tn.parentNode.closest('.pg, .marca-cambio')) tn = w.nextNode();
    const r = document.createRange();
    r.setStart(p, 0);
    r.setEnd(tn, Math.min(12, tn.textContent.length));
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    const bruto = r.toString();
    document.querySelector('#sel-copiar').click();
    await new Promise((res) => setTimeout(res, 200));
    return { bruto, copia: await navigator.clipboard.readText() };
  });
  check(
    /^cambió/.test(copiaMarcador.bruto) &&
      copiaMarcador.copia.split('\n')[1] === '«' + copiaMarcador.bruto.replace(/^cambió/, '') + '»',
    `la copia omite el marcador «cambió» del margen (${JSON.stringify(copiaMarcador.copia.split('\n')[1])})`
  );
  const copiaPalabra = await p2.evaluate(async () => {
    const p = Array.from(document.querySelectorAll('article.seccion:not([hidden]) p.bloque')).find((x) =>
      /^Cambió la frase/.test(x.textContent.replace(/^(p\. \d+)?(cambió)?/, ''))
    );
    const tn = Array.from(p.childNodes).find((x) => x.nodeType === 3);
    const r = document.createRange();
    r.setStart(tn, 0);
    r.setEnd(tn, 15);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    document.querySelector('#sel-copiar').click();
    await new Promise((res) => setTimeout(res, 200));
    return navigator.clipboard.readText();
  });
  check(
    copiaPalabra.split('\n')[1] === '«Cambió la frase»',
    `y conserva la palabra «Cambió» cuando es del manuscrito (${JSON.stringify(copiaPalabra.split('\n')[1])})`
  );
  await p2.evaluate(() => window.getSelection().removeAllRanges());
  // copiar varios ítems de una lista y una fila de una tabla conserva los límites
  await p2.evaluate(() => {
    location.hash = '#cap-01';
  });
  await p2.waitForSelector('#sec-cap-01:not([hidden]) ul.bloque');
  const copiaLista = await p2.evaluate(async () => {
    const lis = document.querySelectorAll('#sec-cap-01 ul.bloque li');
    const r = document.createRange();
    r.setStart(lis[0].firstChild, 0);
    r.setEnd(lis[1].firstChild, lis[1].firstChild.textContent.length);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    document.querySelector('#sel-copiar').click();
    await new Promise((res) => setTimeout(res, 200));
    return navigator.clipboard.readText();
  });
  check(
    copiaLista.split('\n').slice(1).join('\n') ===
      '«Dar por hecho lo que alguien contó.\nDar por hecho lo que se infirió de una cifra.»',
    `los ítems copiados van en líneas distintas (${JSON.stringify(copiaLista.split('\n').slice(1).join('|'))})`
  );
  const copiaTabla = await p2.evaluate(async () => {
    const celdas = document.querySelectorAll('#sec-cap-01 .tabla tr:nth-child(2) td');
    const r = document.createRange();
    r.setStart(celdas[0].firstChild, 0);
    r.setEnd(celdas[2].firstChild, celdas[2].firstChild.textContent.length);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    document.querySelector('#sel-copiar').click();
    await new Promise((res) => setTimeout(res, 200));
    return navigator.clipboard.readText();
  });
  check(
    copiaTabla.split('\n')[1] === '«Hecho · ¿Qué vi? · Fiebre de 38,5 °C»',
    `las celdas copiadas llevan separador (${JSON.stringify(copiaTabla.split('\n')[1])})`
  );
  await p2.evaluate(() => window.getSelection().removeAllRanges());
  // selección que termina fuera de los bloques (triple clic en el último párrafo): se subraya y se copia igual
  const ultimoTexto = await p2.evaluate(() => {
    const bloques = document.querySelectorAll('#sec-cap-01 .bloque[data-pid]');
    const p = bloques[bloques.length - 1];
    const tn = Array.from(p.childNodes).find((x) => x.nodeType === 3 && x.textContent.trim());
    const r = document.createRange();
    r.setStart(tn, 0);
    r.setEnd(document.querySelector('#sig'), 0);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    return p.getAttribute('data-pid');
  });
  await p2.waitForSelector('#sel-tb', { state: 'visible' });
  // la copia de esa selección trae sólo el bloque visible, no los de las secciones ocultas que siguen en el DOM
  await p2.click('#sel-copiar');
  const copiaFinal = await p2.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const textoUltimo = await p2.$eval(`[data-pid="${ultimoTexto}"]`, (p) => p.textContent.trim());
  check(
    copiaFinal.split('\n').slice(1).join('\n') === '«' + textoUltimo + '»' &&
      !/00_preliminares\.md:\d+ →/.test(copiaFinal),
    `copiar una selección que sale del último bloque da sólo ese bloque (${copiaFinal.length} caracteres)`
  );
  await p2.keyboard.press('1');
  await p2.waitForSelector(`[data-pid="${ultimoTexto}"] mark.hl.c-revisar`);
  const subrayadoFinal = await p2.evaluate((pid) => {
    const k = Object.keys(localStorage).find((x) => /^lector-anotaciones:[a-z0-9-]+$/.test(x));
    const a = Object.values(JSON.parse(localStorage.getItem(k))).find((x) => x.pid === pid);
    return a && { inicio: a.inicio, fin: a.fin, cita: a.cita };
  }, ultimoTexto);
  check(
    subrayadoFinal &&
      subrayadoFinal.inicio === 0 &&
      subrayadoFinal.fin === subrayadoFinal.cita.length &&
      /separar mejor\.$/.test(subrayadoFinal.cita),
    'una selección que sale del último bloque se recorta a ese bloque entero'
  );
  await p2.evaluate(() => window.getSelection().removeAllRanges());
  // el contorno de foco se mueve con la ficha enfocada
  await p2.click('.tab[data-tab="todas"]');
  const fichas = await p2.$$eval('.ficha', (fs) => fs.map((f) => f.getAttribute('data-id')));
  await p2.click(`.ficha[data-id="${fichas[0]}"] .cab button.enlace`);
  await p2.click('.tab[data-tab="todas"]');
  await p2.click(`.ficha[data-id="${fichas[1]}"] .cab button.enlace`);
  check((await p2.$$('mark.hl.foco')).length <= 1, 'sólo el subrayado de la ficha enfocada lleva contorno');
  // teclado: Enter y Espacio en una marca llevan el foco a su ficha; Enter en un color lo conserva en el botón
  await p2.focus('article.seccion:not([hidden]) mark.hl');
  await p2.keyboard.press('Enter');
  const trasEnterMarca = await activo(p2);
  check(trasEnterMarca.enFoco, `Enter en una marca del texto lleva el foco a la ficha (${trasEnterMarca.tag})`);
  await p2.focus('article.seccion:not([hidden]) mark.hl');
  await p2.keyboard.press(' ');
  const trasEspacio = await activo(p2);
  check(trasEspacio.enFoco, `Espacio en una marca del texto también la activa (${trasEspacio.tag})`);
  const colorAntes = await p2.$eval('.ficha.foco .col-btn.on', (b) => b.getAttribute('data-c'));
  const colorNuevo = colorAntes === 'duda' ? 'conservar' : 'duda';
  await p2.focus(`.ficha.foco .col-btn[data-c="${colorNuevo}"]`);
  await p2.keyboard.press('Enter');
  await p2.waitForSelector(`.ficha.foco .col-btn[data-c="${colorNuevo}"].on`);
  const trasColor = await activo(p2);
  check(
    trasColor.enFoco && trasColor.tag === 'BUTTON' && /col-btn/.test(trasColor.clase) && /\bon\b/.test(trasColor.clase),
    `Enter en un color de la ficha cambia el color y el foco sigue en ese botón (${trasColor.tag} ${trasColor.clase})`
  );
  await p2.focus('.ficha.foco button:has-text("Borrar")');
  await p2.keyboard.press('Enter');
  const trasBorrar = await activo(p2);
  await p2.keyboard.press('Tab');
  const trasTab = await activo(p2);
  await p2.keyboard.press('Enter');
  const trasNo = await activo(p2);
  check(
    trasBorrar.texto === 'Sí' && trasTab.texto === 'No' && trasNo.texto === 'Borrar' && trasNo.enFoco,
    `Enter en «Borrar» enfoca «Sí»; «No» devuelve el foco a «Borrar» (${trasBorrar.texto} / ${trasTab.texto} / ${trasNo.texto})`
  );
  // la barra de selección queda dentro de la ventana aunque la selección sea más alta que la pantalla
  await p2.setViewportSize({ width: 1280, height: 320 });
  await p2.evaluate(() => {
    location.hash = '#cap-01';
  });
  await p2.waitForSelector('#sec-cap-01:not([hidden])');
  await p2.evaluate(() => {
    const bloques = document.querySelectorAll('#sec-cap-01 .bloque[data-pid]');
    const r = document.createRange();
    r.setStart(bloques[0], 0);
    r.setEnd(bloques[bloques.length - 1], bloques[bloques.length - 1].childNodes.length);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    document.querySelector('#lectura').scrollTop = 400;
  });
  await p2.waitForSelector('#sel-tb', { state: 'visible' });
  await p2.waitForTimeout(250);
  const tbRect = await p2.$eval('#sel-tb', (t) => {
    const r = t.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), alto: window.innerHeight };
  });
  check(
    tbRect.top >= 0 && tbRect.bottom <= tbRect.alto,
    `con una selección más alta que la ventana, la barra queda a la vista (top ${tbRect.top}, bottom ${tbRect.bottom}, ventana ${tbRect.alto})`
  );
  await p2.evaluate(() => window.getSelection().removeAllRanges());
  await p2.setViewportSize({ width: 1280, height: 900 });
  await p2.evaluate(() => {
    location.hash = '#cap-02';
  });
  await p2.waitForSelector('#sec-cap-02:not([hidden])');
  // la búsqueda no lee los marcadores del margen como texto
  await p2.evaluate(() => {
    location.hash = '#cap-02';
  });
  await p2.waitForSelector('#sec-cap-02:not([hidden])');
  await p2.fill('#buscar', 'cambió');
  await p2.press('#buscar', 'Enter');
  await p2.waitForSelector('.res');
  const resCambio = await p2.$$eval('.res:not(.anot)', (rs) => rs.map((r) => r.textContent));
  check(
    resCambio.length >= 1 && resCambio.every((t) => !/cambióUna/.test(t)),
    `la búsqueda ignora el marcador «cambió» del margen (${resCambio.length} resultados)`
  );
  // deshacer un borrado
  await p2.click('.tab[data-tab="todas"]');
  const antesBorrar = (await p2.$$('.ficha')).length;
  await enFicha(p2, '.ficha', 'button:has-text("Borrar")');
  await p2.click('.ficha .confirmar button:has-text("Sí")');
  await p2.waitForSelector('#deshacer');
  check((await p2.$$('.ficha')).length === antesBorrar - 1, 'borrar quita la ficha y ofrece deshacer');
  await p2.click('#deshacer');
  await p2.waitForFunction((n) => document.querySelectorAll('.ficha').length === n, antesBorrar);
  check(true, 'deshacer la recupera');
  // figura ampliable y lectura en voz alta
  await p2.goto(base + '#cap-01');
  await p2.waitForSelector('article.seccion:not([hidden]) figure img');
  await p2.click('article.seccion:not([hidden]) figure img');
  check(await p2.$eval('#lightbox', (l) => l.open), 'clic en una figura la amplía');
  await p2.keyboard.press('Escape');
  check(!(await p2.$eval('#lightbox', (l) => l.open)), 'Esc cierra la figura');
  await p2.click('article.seccion:not([hidden]) button[data-escuchar]');
  await p2.waitForTimeout(400); // en un navegador sin voces, el error llega enseguida y el botón vuelve solo
  const txtVoz = await p2.$eval('article.seccion:not([hidden]) button[data-escuchar]', (b) => b.textContent);
  const estadoVoz = await p2.$eval('#estado', (e) => e.textContent);
  check(
    txtVoz === 'Detener' || /voz alta/.test(estadoVoz),
    `escuchar arranca la lectura o avisa que no hay voz (${txtVoz} · ${estadoVoz.slice(0, 50)})`
  );
  if (txtVoz === 'Detener') {
    await p2.click('article.seccion:not([hidden]) button[data-escuchar]');
    check(
      (await p2.$eval('article.seccion:not([hidden]) button[data-escuchar]', (b) => b.textContent)) === 'Escuchar',
      'detener vuelve al estado inicial'
    );
  }
  check(
    errores2.length === 0,
    `sin errores de consola en el segundo recorrido${errores2.length ? ': ' + errores2.join(' | ') : ''}`
  );
  await ctx2.close();
});

test('Lectura en voz alta: cambiar de sección mientras suena', async ({ browser }) => {
  const ctxVoz = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxVoz.addInitScript(sinBase);
  await ctxVoz.addInitScript(() => {
    // Un sintetizador que acepta hablar y nunca termina, para probar el estado sin depender de voces reales.
    window.SpeechSynthesisUtterance = function (t) {
      this.text = t;
    };
    // cancel() dispara «interrupted» en la locución en curso, como hace Chromium
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speak: function (u) {
          this.actual = u;
          if (u.onstart) u.onstart();
        },
        cancel: function () {
          var u = this.actual;
          this.actual = null;
          if (u && u.onerror)
            setTimeout(function () {
              u.onerror({ error: 'interrupted' });
            }, 0);
        },
        getVoices: function () {
          return [];
        },
      },
      configurable: true,
    });
  });
  const pv = await ctxVoz.newPage();
  await pv.goto(base + '#cap-01');
  await pv.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  await pv.click('#sec-cap-01 button[data-escuchar]');
  check(
    (await pv.$eval('#sec-cap-01 button[data-escuchar]', (b) => b.textContent)) === 'Detener' &&
      (await pv.$$('#sec-cap-01 .bloque.leyendo')).length === 1,
    'escuchar ilumina el párrafo que suena'
  );
  await pv.evaluate(() => {
    location.hash = '#cap-02';
  });
  await pv.waitForSelector('#sec-cap-02:not([hidden])');
  await pv.click('#sec-cap-02 button[data-escuchar]');
  const botones = await pv.evaluate(() => ({
    uno: document.querySelector('#sec-cap-01 button[data-escuchar]').textContent,
    dos: document.querySelector('#sec-cap-02 button[data-escuchar]').textContent,
    leyendo: document.querySelectorAll('#sec-cap-02 .bloque.leyendo').length,
  }));
  check(
    botones.uno === 'Escuchar' && botones.dos === 'Detener' && botones.leyendo === 1,
    `escuchar otra sección cambia la lectura en vez de sólo detenerla (${botones.uno} / ${botones.dos})`
  );
  await pv.waitForTimeout(50);
  check(
    !/No se pudo leer/.test(await pv.$eval('#estado', (e) => e.textContent)) &&
      (await pv.$eval('#sec-cap-02 button[data-escuchar]', (b) => b.textContent)) === 'Detener',
    'la interrupción que provoca cancelar no se toma por un fallo'
  );
  await pv.click('#sec-cap-02 button[data-escuchar]');
  check(
    (await pv.$eval('#sec-cap-02 button[data-escuchar]', (b) => b.textContent)) === 'Escuchar',
    'pulsar en la misma sección detiene'
  );
  await pv.click('#sec-cap-02 button[data-escuchar]');
  await pv.evaluate(() => {
    location.hash = '#cap-01';
  });
  await pv.waitForSelector('#sec-cap-01:not([hidden])');
  check(
    (await pv.$eval('#sec-cap-02 button[data-escuchar]', (b) => b.textContent)) === 'Escuchar' &&
      (await pv.$$('.bloque.leyendo')).length === 0,
    'cambiar de sección detiene la lectura'
  );
  await ctxVoz.close();
});

test('Accesibilidad y salir de las fichas (escritorio)', async ({ browser }) => {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxA.addInitScript(sinBase);
  const pa = await ctxA.newPage();
  const erroresA = [];
  pa.on('pageerror', (e) => erroresA.push(String(e)));
  pa.on('console', (m) => {
    if (m.type() === 'error') erroresA.push(m.text());
  });
  await pa.goto(base + '#cap-01');
  await pa.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  await pa.waitForFunction(() => /Sin base compartida/.test(document.querySelector('#estado').textContent));
  const aria = await pa.evaluate(() => ({
    estado:
      document.querySelector('#anuncio') && !document.querySelector('#anuncio').closest('#app')
        ? document.querySelector('#anuncio').getAttribute('role')
        : null,
    tabs: (document.querySelector('.tabs') || {}).getAttribute
      ? document.querySelector('.tabs').getAttribute('role')
      : null,
    seleccionadas: document.querySelectorAll('.tab[aria-selected="true"]').length,
    actual: (document.querySelector('nav a.sec[aria-current="page"]') || {}).className || '',
    filtros: document.querySelectorAll('.filtro[aria-pressed]').length,
  }));
  check(
    aria.estado === 'status' &&
      aria.tabs === 'tablist' &&
      aria.seleccionadas === 1 &&
      /activa/.test(aria.actual) &&
      aria.filtros >= 9,
    `el estado se anuncia, pestañas y filtros exponen su estado y el índice marca la sección actual (${JSON.stringify(aria)})`
  );
  const salto = await pa.evaluate(() => {
    const s = document.querySelector('a.saltar');
    const primero = document.querySelector(
      'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'
    );
    return !!s && primero === s;
  });
  if (salto) {
    await pa.focus('a.saltar');
    await pa.keyboard.press('Enter');
  }
  check(
    salto && (await pa.evaluate(() => document.activeElement.id)) === 'lectura',
    'lo primero del orden de Tab es «Saltar al texto», que lleva el foco a la lectura'
  );
  // pestañas con flechas
  await pa.focus('.tab.activa');
  await pa.keyboard.press('ArrowRight');
  const tabTras = await pa.evaluate(() => ({
    foco: document.activeElement.getAttribute('data-tab'),
    sel: (document.querySelector('.tab[aria-selected="true"]') || { getAttribute: () => null }).getAttribute(
      'data-tab'
    ),
    lista: document.querySelector('#lista').getAttribute('aria-labelledby'),
  }));
  check(
    tabTras.foco === 'todas' && tabTras.sel === 'todas' && tabTras.lista === 'tab-todas',
    `→ pasa a la pestaña siguiente y la selecciona (${JSON.stringify(tabTras)})`
  );
  // un filtro sin resultados lo dice y ofrece quitarlo
  await pulsar(pa, '.filtro[data-f="duda"]');
  const filtrada = await pa.evaluate(() => ({
    pulsado: document.querySelector('.filtro[data-f="duda"]').getAttribute('aria-pressed'),
    resumen: (document.querySelector('#filtro-resumen') || {}).textContent || '',
    quitar: !!Array.from(document.querySelectorAll('#lista button')).find((b) => /Quitar filtros/.test(b.textContent)),
  }));
  check(
    filtrada.pulsado === 'true' && /duda/.test(filtrada.resumen) && filtrada.quitar,
    `el filtro activo se anuncia, se resume junto a «Filtros» y, sin resultados, ofrece quitarlo (${JSON.stringify(filtrada)})`
  );
  if (filtrada.quitar) await pa.click('#lista button.enlace');
  check(
    (await pa.$eval('.filtro.on', (b) => b.getAttribute('data-f'))) === 'todas',
    '«Quitar filtros» vuelve a mostrarlo todo'
  );
  // subrayar con nota y salir con un clic en el texto
  await pa.click('.tab[data-tab="capitulo"]');
  await seleccionar(pa, 25);
  await pa.keyboard.press('n');
  await pa.waitForSelector('.ficha.foco textarea');
  check(
    await pa.evaluate(() => document.activeElement.tagName === 'TEXTAREA'),
    'N abre la nota del subrayado con el cursor en ella'
  );
  await pa.keyboard.type('Nota que se guarda al salir');
  const cab = await pa.evaluate(() => ({
    cat: (document.querySelector('.ficha.foco .cab .cat') || {}).textContent || '',
    pulsados: document.querySelectorAll('.ficha.foco .col-btn[aria-pressed="true"]').length,
  }));
  check(
    cab.cat === 'revisar' && cab.pulsados === 1,
    `la ficha nombra su categoría (no sólo el color) y el color actual se anuncia pulsado (${JSON.stringify(cab)})`
  );
  // el centro de otro párrafo, sin subrayados
  const pOtro = await pa.evaluate(() => {
    const ps = Array.from(document.querySelectorAll('article.seccion:not([hidden]) p.bloque[data-pid]')).filter(
      (p) => !p.querySelector('mark')
    );
    const p = ps[ps.length - 1];
    p.scrollIntoView({ block: 'center' });
    const r = p.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await pa.mouse.click(pOtro.x, pOtro.y);
  const fuera = await pa.evaluate(() => ({
    ficha: document.querySelectorAll('.ficha.foco').length,
    marca: document.querySelectorAll('mark.hl.foco').length,
  }));
  check(
    fuera.ficha === 0 && fuera.marca === 0 && (await guardadoLocal(pa, 'Nota que se guarda al salir')),
    `un clic en el texto, fuera de la ficha, sale de ella y la nota queda guardada (${JSON.stringify(fuera)})`
  );
  // Esc en la nota guarda, sale y devuelve el foco al pasaje
  await pa.click('article.seccion:not([hidden]) mark.hl');
  check((await pa.$$('.ficha.foco')).length === 1, 'clic en el subrayado vuelve a su ficha');
  await pa.click('.ficha.foco textarea');
  await pa.keyboard.press('End');
  await pa.keyboard.type(' (y más)');
  await pa.keyboard.press('Escape');
  const trasEsc = await pa.evaluate(() => ({
    tag: document.activeElement.tagName,
    foco: document.querySelectorAll('.ficha.foco, mark.hl.foco').length,
  }));
  check(
    trasEsc.tag === 'MARK' && trasEsc.foco === 0 && (await guardadoLocal(pa, '(y más)')),
    `Esc en la nota la guarda, sale de la ficha y devuelve el foco al pasaje (${JSON.stringify(trasEsc)})`
  );
  // Enter en el pasaje vuelve a la ficha; Ctrl+Enter en la nota sale igual; Esc fuera de la nota también sale
  await pa.keyboard.press('Enter');
  await pa.focus('.ficha.foco textarea');
  await pa.keyboard.press('End');
  await pa.keyboard.type('!');
  await pa.keyboard.press('Control+Enter');
  const trasCtrl = await pa.evaluate(() => ({
    tag: document.activeElement.tagName,
    foco: document.querySelectorAll('.ficha.foco').length,
    nota: (document.querySelector('.ficha textarea') || {}).value,
  }));
  check(
    trasCtrl.tag === 'MARK' && trasCtrl.foco === 0 && /!$/.test(trasCtrl.nota || ''),
    `Ctrl+Enter en la nota guarda y vuelve al texto (${JSON.stringify(trasCtrl)})`
  );
  await pa.keyboard.press('Enter');
  await pa.keyboard.press('Escape');
  check((await pa.$$('.ficha.foco')).length === 0, 'Esc con la ficha enfocada (fuera de la nota) sale de ella');
  // atajos: diálogo modal que se cierra con un clic en el fondo o con Esc, y devuelve el foco
  await pa.keyboard.press('?');
  const dlg = await pa.evaluate(() => {
    const d = document.querySelector('#atajos');
    return { abierto: !!d.open, modal: d.matches(':modal'), foco: !!document.activeElement.closest('#atajos') };
  });
  await pa.mouse.click(5, 5);
  check(
    dlg.abierto && dlg.modal && dlg.foco && !(await pa.$eval('#atajos', (d) => !!d.open)),
    `? abre los atajos como diálogo modal con el foco adentro, y un clic en el fondo lo cierra (${JSON.stringify(dlg)})`
  );
  await pa.click('#b-atajos');
  const bordeAtajos = await pa.$eval('#atajos', (d) => {
    const r = d.getBoundingClientRect();
    return { x: r.left + 4, y: r.top + 4 };
  });
  await pa.mouse.click(bordeAtajos.x, bordeAtajos.y);
  check(
    await pa.$eval('#atajos', (d) => !!d.open),
    'un clic en el relleno del diálogo (dentro de su recuadro) no lo cierra'
  );
  await pa.keyboard.press('Escape');
  check(
    !(await pa.$eval('#atajos', (d) => !!d.open)) &&
      (await pa.evaluate(() => document.activeElement.id)) === 'b-atajos',
    'Esc cierra los atajos y el foco vuelve a su botón'
  );
  // figura ampliada con texto alternativo; un clic la cierra
  await pa.click('article.seccion:not([hidden]) figure img');
  const lb = await pa.evaluate(() => ({
    abierto: !!document.querySelector('#lightbox').open,
    alt: document.querySelector('#lightbox img').alt,
  }));
  await pa.mouse.click(640, 450);
  check(
    lb.abierto && lb.alt.length > 3 && !(await pa.$eval('#lightbox', (d) => !!d.open)),
    `la figura ampliada lleva su leyenda como texto alternativo y un clic la cierra (${lb.alt.slice(0, 40)})`
  );
  // ajustes de lectura: tamaño, tema y letra, recordados al recargar
  const tamTexto = () =>
    pa.$eval('article.seccion:not([hidden]) p.bloque', (p) => parseFloat(getComputedStyle(p).fontSize));
  const tam0 = await tamTexto();
  let ajustesOk = false;
  try {
    await pa.click('#ajustes > summary');
    await pa.click('#aj-mas');
    await pa.click('#aj-mas');
    await pa.check('input[name="aj-tema"][value="dark"]');
    await pa.check('input[name="aj-letra"][value="sans"]');
    ajustesOk = true;
  } catch {
    ajustesOk = false;
  }
  const tam1 = await tamTexto();
  const oscuro = await pa.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const letra = await pa.$eval('article.seccion:not([hidden]) p.bloque', (p) => getComputedStyle(p).fontFamily);
  // contraste del texto sobre la tinta (pestaña activa, sección activa, botón primario) en tema oscuro
  const contrasteOscuro = await pa.evaluate(() => {
    const lum = (c) => {
      const v = c
        .match(/\d+(\.\d+)?/g)
        .slice(0, 3)
        .map(Number)
        .map((x) => {
          x /= 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const ratio = (n) => {
      const cs = getComputedStyle(n);
      const a = lum(cs.color),
        b = lum(cs.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    return Math.min(...['.tab.activa', 'nav a.sec.activa'].map((q) => ratio(document.querySelector(q))));
  });
  check(
    contrasteOscuro >= 4.5,
    `en tema oscuro el texto sobre la tinta tiene contraste suficiente (${contrasteOscuro.toFixed(2)}:1)`
  );
  for (let i = 0; i < 2; i++) await pa.click('#aj-mas'); // de 120 % al tope (145 %)
  check(
    (await pa.evaluate(() => document.activeElement.id)) === 'aj-mas' &&
      (await pa.$eval('#aj-mas', (b) => b.getAttribute('aria-disabled'))) === 'true',
    'A+ al tope queda deshabilitado sin perder el foco'
  );
  for (let i = 0; i < 2; i++) await pa.click('#aj-menos');
  await pa.keyboard.press('Escape');
  const menuCerrado = await pa.evaluate(
    () => !document.querySelector('#ajustes').open && document.activeElement.tagName === 'SUMMARY'
  );
  check(
    ajustesOk && tam1 > tam0 && oscuro === 'rgb(21, 23, 27)' && /Plex/.test(letra) && menuCerrado,
    `«Aa» agranda el texto, cambia tema y letra, y Esc cierra el menú con el foco en su botón (${tam0} → ${tam1} px, ${oscuro})`
  );
  const subtitulo = await pa.$eval('article.seccion:not([hidden]) h1.sec-titulo', (h) =>
    parseFloat(getComputedStyle(h).fontSize)
  );
  check(subtitulo > 28, `el título de la sección también crece con «Aa» (${subtitulo} px)`);
  await pa.reload();
  await pa.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  check(
    (await tamTexto()) === tam1 &&
      (await pa.evaluate(() => document.documentElement.getAttribute('data-tema-lector'))) === 'dark',
    'los ajustes de lectura se recuerdan al recargar'
  );
  if (ajustesOk) {
    await pa.click('#ajustes > summary');
    await pa.check('input[name="aj-tema"][value=""]');
  }
  check(
    !(await pa.evaluate(() => document.documentElement.hasAttribute('data-tema-lector'))),
    '«sistema» devuelve el tema al del sistema'
  );
  await pa.mouse.click(640, 450);
  // concentración anuncia su estado; borrar no deja el foco perdido
  await pa.click('#b-foco');
  const focoPulsado = await pa.$eval('#b-foco', (b) => b.getAttribute('aria-pressed'));
  await pa.click('#b-foco');
  check(
    focoPulsado === 'true' && (await pa.$eval('#b-foco', (b) => b.getAttribute('aria-pressed'))) === 'false',
    'el botón de concentración anuncia si está activo'
  );
  await enFicha(pa, '.ficha', 'button[data-accion="borrar"]');
  await pa.click('.ficha button[data-accion="si"]');
  const trasBorrarA = await pa.evaluate(() => ({
    foco: document.activeElement !== document.body && !!document.activeElement.closest('#panel'),
    deshacer: !!document.querySelector('#deshacer'),
  }));
  check(
    trasBorrarA.foco && trasBorrarA.deshacer,
    `al borrar, el foco queda en el panel y aparece «Deshacer» (${JSON.stringify(trasBorrarA)})`
  );
  await pa.click('#deshacer');
  check(
    await pa.evaluate(
      () => document.activeElement !== document.body && !!document.activeElement.closest('.ficha, mark')
    ),
    'tras deshacer, el foco queda en la anotación recuperada'
  );
  check(
    erroresA.length === 0,
    `sin errores de consola en el recorrido de accesibilidad${erroresA.length ? ': ' + erroresA.join(' | ') : ''}`
  );
  await ctxA.close();
});
