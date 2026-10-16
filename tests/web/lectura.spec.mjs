// Leer: capas, cambios entre versiones, progreso, concentración, atajos, voz y accesibilidad.
import {
  check,
  pulsar,
  abrirDe,
  enFicha,
  seleccionar,
  libroAlterado,
  conCambio,
  activo,
  guardadoLocal,
  sinErrores,
  test,
} from './ayudas.mjs';

// La página sin base, ya lista y diciéndolo («Sin base compartida»).
async function sinBaseLista(abrir, op = {}) {
  const p = await abrir(op);
  await p.waitForFunction(() => /Sin base compartida/.test(document.querySelector('#estado').textContent));
  return p;
}

// ------------------------------------------------------------ un libro con un bloque cambiado
// El libro de ejemplo con el primer párrafo del capítulo 2 cambiado respecto de la construcción anterior, sin base y
// con el portapapeles; se abre en `hash`.
const conUnCambio = (abrir, hash = '#cap-02') =>
  sinBaseLista(abrir, {
    hash,
    permisos: ['clipboard-read', 'clipboard-write'],
    preparar: (p) => libroAlterado(p, conCambio),
  });
// La tecla 2 subraya en «cortar» los primeros 18 caracteres del primer párrafo de la sección abierta.
async function cortarCon2(p) {
  await seleccionar(p, 18);
  await p.keyboard.press('2');
  await p.waitForSelector('article.seccion:not([hidden]) mark.hl.c-cortar');
}
// Selecciona desde el principio del último bloque del capítulo 1 hasta el enlace a la sección siguiente (como un triple
// clic en el último párrafo): la selección termina fuera de los bloques. Devuelve el pid del bloque.
const hastaElFinal = (p) =>
  p.evaluate(() => {
    const bloques = document.querySelectorAll('#sec-cap-01 .bloque[data-pid]');
    const b = bloques[bloques.length - 1];
    const tn = Array.from(b.childNodes).find((x) => x.nodeType === 3 && x.textContent.trim());
    const r = document.createRange();
    r.setStart(tn, 0);
    r.setEnd(document.querySelector('#sig'), 0);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    return b.getAttribute('data-pid');
  });
// Los dos subrayados que el recorrido anterior tenía al probar el teclado y el borrado: el de la tecla 2 al principio
// del capítulo 2 y el de la tecla 1 sobre una selección que sale del último bloque del capítulo 1 (la nota con
// #etiqueta que llevaba el primero no cuenta aquí). Queda en el capítulo 1, sin selección.
async function dosSubrayados(abrir) {
  const p = await conUnCambio(abrir);
  await cortarCon2(p);
  await p.evaluate(() => {
    location.hash = '#cap-01';
  });
  await p.waitForSelector('#sec-cap-01:not([hidden]) ul.bloque');
  const pid = await hastaElFinal(p);
  await p.waitForSelector('#sel-tb', { state: 'visible' });
  await p.keyboard.press('1');
  await p.waitForSelector(`[data-pid="${pid}"] mark.hl.c-revisar`);
  await p.evaluate(() => window.getSelection().removeAllRanges());
  return p;
}

test('Capas: el menú las lista con sus cuentas, las pinta sobre el texto, las resume y las apaga', async ({
  abrir,
}) => {
  const p = await conUnCambio(abrir);
  check(!(await p.$eval('#capas', (d) => d.hidden)), 'el menú de capas aparece cuando libro.json las trae');
  await p.click('#capas > summary');
  const etiquetasCapas = await p.$$eval('#capas-menu label', (ls) => ls.map((l) => l.textContent));
  check(
    etiquetasCapas.some((t) => /frases largas/.test(t)) && etiquetasCapas.some((t) => /muletillas/.test(t)),
    `el menú lista las capas con sus cuentas (${etiquetasCapas.length})`
  );
  await p.check('#capas-menu input[data-capa="fl"]');
  await p.check('#capas-menu input[data-capa="mu"]');
  await p.waitForSelector('article.seccion:not([hidden]) span.capa.k-fl');
  const nMu = (await p.$$('article.seccion:not([hidden]) span.capa.k-mu')).length;
  check(nMu >= 1, `las capas activas se pintan sobre el texto (muletillas: ${nMu})`);
  const resumenCapas = await p.$eval(
    'article.seccion:not([hidden]) .sec-herr span[id^="capas-"]',
    (s) => s.textContent
  );
  check(
    /frases largas/.test(resumenCapas) && /muletillas/.test(resumenCapas),
    `la sección resume sus señales (${resumenCapas})`
  );
  await p.uncheck('#capas-menu input[data-capa="fl"]');
  check(
    (await p.$$('article.seccion:not([hidden]) span.capa.k-fl')).length === 0,
    'al apagar una capa, sus marcas desaparecen'
  );
  sinErrores(p, 'con las capas', { consola: true });
});

test('Qué cambió: el bloque se marca y se cuenta, su diferencia se abre y se cierra, la huella vieja también marca, y la búsqueda no lee el marcador', async ({
  abrir,
}) => {
  const p = await conUnCambio(abrir);
  check(
    (await p.$$('article.seccion:not([hidden]) .bloque.cambiado')).length === 1,
    'el bloque cambiado en la última construcción se marca'
  );
  const chipCambio = await p.$eval('article.seccion:not([hidden]) .sec-herr .chip', (c) => c.textContent);
  check(/1 bloque cambiado/.test(chipCambio), `la sección cuenta sus bloques cambiados (${chipCambio})`);
  await p.click('article.seccion:not([hidden]) .marca-cambio');
  await p.waitForSelector('.diff');
  const diff = await p.$eval('.diff', (d) => ({
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
  await p.click('article.seccion:not([hidden]) .marca-cambio');
  check((await p.$$('.diff')).length === 0, 'volver a pulsar oculta la diferencia');
  // cambió desde tu última lectura (huella guardada distinta)
  const pidCap2 = await p.$eval('article.seccion:not([hidden]) p.bloque[data-pid]:not(.cambiado)', (n) =>
    n.getAttribute('data-pid')
  );
  await p.evaluate((pid) => {
    const k = Object.keys(localStorage).find((x) => x.endsWith(':visto'));
    const v = JSON.parse(localStorage.getItem(k) || '{}');
    v[pid] = 'huellavieja';
    localStorage.setItem(k, JSON.stringify(v));
  }, pidCap2);
  await p.reload();
  await p.waitForSelector('article.seccion:not([hidden]) .bloque[data-pid]');
  check(
    await p.$eval(
      `[data-pid="${pidCap2}"]`,
      (n) => n.classList.contains('cambiado') && /última lectura/.test(n.querySelector('.marca-cambio').title)
    ),
    'un bloque con huella distinta de la vista se marca como cambiado desde la última lectura'
  );
  // la búsqueda no lee como texto los marcadores del margen (ahora, los de los dos bloques)
  await p.fill('#buscar', 'cambió');
  await p.press('#buscar', 'Enter');
  await p.waitForSelector('.res');
  const resCambio = await p.$$eval('.res:not(.anot)', (rs) => rs.map((r) => r.textContent));
  check(
    resCambio.length >= 1 && resCambio.every((t) => !/cambióUna/.test(t)),
    `la búsqueda ignora el marcador «cambió» del margen (${resCambio.length} resultados)`
  );
  sinErrores(p, 'al ver qué cambió', { consola: true });
});

test('Leída con la casilla y con L, concentración (Esc sale), y las teclas 2 y ?', async ({ abrir }) => {
  const p = await conUnCambio(abrir);
  // progreso y leída
  await p.check('article.seccion:not([hidden]) input[data-leida]');
  const prog = await p.evaluate(() => ({
    leida: !!document.querySelector('nav a.sec.activa.leida'),
    ancho: document.querySelector('nav .progreso[data-grupo="parte-1"] i').style.width,
  }));
  check(
    prog.leida && prog.ancho !== '0%' && prog.ancho !== '',
    `marcar leída actualiza el índice y la barra de progreso (${prog.ancho})`
  );
  await p.keyboard.press('l');
  check(!(await p.$('nav a.sec.activa.leida')), 'la tecla L alterna la marca de leída');
  // concentración
  await p.click('#b-foco');
  const foco = await p.evaluate(() => ({
    on: document.querySelector('#app').classList.contains('foco'),
    nav: getComputedStyle(document.querySelector('nav.indice')).display,
    panel: getComputedStyle(document.querySelector('aside.panel')).display,
  }));
  check(foco.on && foco.nav === 'none' && foco.panel === 'none', 'el modo concentración oculta índice y panel');
  await p.keyboard.press('Escape');
  check(
    !(await p.evaluate(() => document.querySelector('#app').classList.contains('foco'))),
    'Esc sale del modo concentración'
  );
  // atajos: 2 subraya en rojo; ? abre la ayuda
  await cortarCon2(p);
  check(true, 'la tecla 2 subraya la selección en «cortar»');
  await p.keyboard.press('?');
  check(await p.$eval('#atajos', (a) => a.open), 'la tecla ? muestra los atajos');
  sinErrores(p, 'con el progreso, la concentración y los atajos', { consola: true });
});

test('Las #etiquetas de la nota dan chips, selector y filtro; buscar en las notas y abrir el resultado con Enter', async ({
  abrir,
}) => {
  const p = await conUnCambio(abrir);
  await cortarCon2(p);
  await p.click('.tab[data-tab="todas"]');
  await p.fill('.ficha textarea', 'Revisar con #carmen la cinética');
  await p.$eval('.ficha textarea', (t) => t.blur());
  await p.waitForSelector('.ficha .etiquetas button');
  check(
    (await p.$eval('.ficha .etiquetas button', (b) => b.textContent)) === '#carmen' &&
      !(await p.$eval('#f-etiqueta', (s) => s.hidden)),
    'las #etiquetas de la nota se vuelven chips y un selector'
  );
  await abrirDe(p, '#f-etiqueta');
  await p.selectOption('#f-etiqueta', 'carmen');
  check((await p.$$('.ficha')).length === 1, 'el filtro por etiqueta deja las fichas con esa etiqueta');
  await pulsar(p, '.filtro[data-f="conservar"]');
  await p.fill('#buscar', 'cinética');
  await p.press('#buscar', 'Enter');
  await p.waitForSelector('.res.anot');
  check(true, 'la búsqueda encuentra el texto de una nota');
  // activar el resultado con el teclado deja el foco en la ficha, no en el cuerpo del documento
  await p.focus('.res.anot');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.ficha.foco textarea');
  const trasEnterRes = await activo(p);
  check(trasEnterRes.enFoco, `Enter en un resultado de búsqueda lleva el foco a la ficha (${trasEnterRes.tag})`);
  const trasResultado = await p.evaluate(() => ({
    tab: document.querySelector('.tab.activa').getAttribute('data-tab'),
    filtro: document.querySelector('.filtro.on').getAttribute('data-f'),
    nota: document.querySelector('.ficha.foco textarea').value,
  }));
  check(
    trasResultado.tab !== 'buscar' && trasResultado.filtro === 'todas' && /cinética/.test(trasResultado.nota),
    `pulsar el resultado abre la ficha, saliendo de la búsqueda y del filtro que la escondía (${trasResultado.tab}, ${trasResultado.filtro})`
  );
  sinErrores(p, 'con las etiquetas y la búsqueda en notas', { consola: true });
});

// ------------------------------------------------------------ copiar una selección
test('Copiar una selección omite el marcador «cambió» del margen y conserva la palabra «Cambió» del manuscrito', async ({
  abrir,
}) => {
  const p = await conUnCambio(abrir);
  const copiaMarcador = await p.evaluate(async () => {
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
  const copiaPalabra = await p.evaluate(async () => {
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
  sinErrores(p, 'al copiar junto al marcador «cambió»', { consola: true });
});

test('Copiar varios ítems de una lista o una fila de una tabla conserva sus límites', async ({ abrir }) => {
  const p = await conUnCambio(abrir, '#cap-01');
  await p.waitForSelector('#sec-cap-01:not([hidden]) ul.bloque');
  const copiaLista = await p.evaluate(async () => {
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
  const copiaTabla = await p.evaluate(async () => {
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
  sinErrores(p, 'al copiar una lista y una tabla', { consola: true });
});

test('Una selección que sale del último bloque se copia y se subraya recortada a ese bloque', async ({ abrir }) => {
  const p = await conUnCambio(abrir, '#cap-01');
  await p.waitForSelector('#sec-cap-01:not([hidden]) ul.bloque');
  const ultimoTexto = await hastaElFinal(p);
  await p.waitForSelector('#sel-tb', { state: 'visible' });
  // la copia de esa selección trae sólo el bloque visible, no los de las secciones ocultas que siguen en el DOM
  await p.click('#sel-copiar');
  const copiaFinal = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const textoUltimo = await p.$eval(`[data-pid="${ultimoTexto}"]`, (b) => b.textContent.trim());
  check(
    copiaFinal.split('\n').slice(1).join('\n') === '«' + textoUltimo + '»' &&
      !/00_preliminares\.md:\d+ →/.test(copiaFinal),
    `copiar una selección que sale del último bloque da sólo ese bloque (${copiaFinal.length} caracteres)`
  );
  await p.keyboard.press('1');
  await p.waitForSelector(`[data-pid="${ultimoTexto}"] mark.hl.c-revisar`);
  const subrayadoFinal = await p.evaluate((pid) => {
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
  sinErrores(p, 'con una selección que sale del último bloque', { consola: true });
});

test('Con una selección más alta que la ventana, la barra de selección queda a la vista', async ({ abrir }) => {
  const p = await conUnCambio(abrir, '#cap-01');
  await p.setViewportSize({ width: 1280, height: 320 });
  await p.evaluate(() => {
    const bloques = document.querySelectorAll('#sec-cap-01 .bloque[data-pid]');
    const r = document.createRange();
    r.setStart(bloques[0], 0);
    r.setEnd(bloques[bloques.length - 1], bloques[bloques.length - 1].childNodes.length);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    document.querySelector('#lectura').scrollTop = 400;
  });
  await p.waitForSelector('#sel-tb', { state: 'visible' });
  await p.waitForTimeout(250);
  const tbRect = await p.$eval('#sel-tb', (t) => {
    const r = t.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), alto: window.innerHeight };
  });
  check(
    tbRect.top >= 0 && tbRect.bottom <= tbRect.alto,
    `con una selección más alta que la ventana, la barra queda a la vista (top ${tbRect.top}, bottom ${tbRect.bottom}, ventana ${tbRect.alto})`
  );
  sinErrores(p, 'con la barra de selección en una ventana baja', { consola: true });
});

// ------------------------------------------------------------ teclado y borrado, con dos subrayados
test('Teclado: un solo contorno de foco; Enter y Espacio en una marca llevan a su ficha; el foco sigue en el color y en «Borrar»', async ({
  abrir,
}) => {
  const p = await dosSubrayados(abrir);
  // el contorno de foco se mueve con la ficha enfocada
  await p.click('.tab[data-tab="todas"]');
  const fichas = await p.$$eval('.ficha', (fs) => fs.map((f) => f.getAttribute('data-id')));
  await p.click(`.ficha[data-id="${fichas[0]}"] .cab button.enlace`);
  await p.click('.tab[data-tab="todas"]');
  await p.click(`.ficha[data-id="${fichas[1]}"] .cab button.enlace`);
  check((await p.$$('mark.hl.foco')).length <= 1, 'sólo el subrayado de la ficha enfocada lleva contorno');
  // teclado: Enter y Espacio en una marca llevan el foco a su ficha; Enter en un color lo conserva en el botón
  await p.focus('article.seccion:not([hidden]) mark.hl');
  await p.keyboard.press('Enter');
  const trasEnterMarca = await activo(p);
  check(trasEnterMarca.enFoco, `Enter en una marca del texto lleva el foco a la ficha (${trasEnterMarca.tag})`);
  await p.focus('article.seccion:not([hidden]) mark.hl');
  await p.keyboard.press(' ');
  const trasEspacio = await activo(p);
  check(trasEspacio.enFoco, `Espacio en una marca del texto también la activa (${trasEspacio.tag})`);
  const colorAntes = await p.$eval('.ficha.foco .col-btn.on', (b) => b.getAttribute('data-c'));
  const colorNuevo = colorAntes === 'duda' ? 'conservar' : 'duda';
  await p.focus(`.ficha.foco .col-btn[data-c="${colorNuevo}"]`);
  await p.keyboard.press('Enter');
  await p.waitForSelector(`.ficha.foco .col-btn[data-c="${colorNuevo}"].on`);
  const trasColor = await activo(p);
  check(
    trasColor.enFoco && trasColor.tag === 'BUTTON' && /col-btn/.test(trasColor.clase) && /\bon\b/.test(trasColor.clase),
    `Enter en un color de la ficha cambia el color y el foco sigue en ese botón (${trasColor.tag} ${trasColor.clase})`
  );
  await p.focus('.ficha.foco button:has-text("Borrar")');
  await p.keyboard.press('Enter');
  const trasBorrar = await activo(p);
  await p.keyboard.press('Tab');
  const trasTab = await activo(p);
  await p.keyboard.press('Enter');
  const trasNo = await activo(p);
  check(
    trasBorrar.texto === 'Sí' && trasTab.texto === 'No' && trasNo.texto === 'Borrar' && trasNo.enFoco,
    `Enter en «Borrar» enfoca «Sí»; «No» devuelve el foco a «Borrar» (${trasBorrar.texto} / ${trasTab.texto} / ${trasNo.texto})`
  );
  sinErrores(p, 'con el teclado en marcas y fichas', { consola: true });
});

test('Borrar una ficha la quita y ofrece deshacer; deshacer la recupera', async ({ abrir }) => {
  const p = await dosSubrayados(abrir);
  await p.click('.tab[data-tab="todas"]');
  const antesBorrar = (await p.$$('.ficha')).length;
  await enFicha(p, '.ficha', 'button:has-text("Borrar")');
  await p.click('.ficha .confirmar button:has-text("Sí")');
  await p.waitForSelector('#deshacer');
  check((await p.$$('.ficha')).length === antesBorrar - 1, 'borrar quita la ficha y ofrece deshacer');
  await p.click('#deshacer');
  await p.waitForFunction((n) => document.querySelectorAll('.ficha').length === n, antesBorrar);
  check(true, 'deshacer la recupera');
  sinErrores(p, 'al borrar y deshacer', { consola: true });
});

// ------------------------------------------------------------ figura y voz
test('Una figura se amplía con un clic y Esc la cierra; «Escuchar» lee o avisa que no hay voz', async ({ abrir }) => {
  const p = await conUnCambio(abrir, '#cap-01');
  await p.waitForSelector('article.seccion:not([hidden]) figure img');
  await p.click('article.seccion:not([hidden]) figure img');
  check(await p.$eval('#lightbox', (l) => l.open), 'clic en una figura la amplía');
  await p.keyboard.press('Escape');
  check(!(await p.$eval('#lightbox', (l) => l.open)), 'Esc cierra la figura');
  await p.click('article.seccion:not([hidden]) button[data-escuchar]');
  await p.waitForTimeout(400); // en un navegador sin voces, el error llega enseguida y el botón vuelve solo
  const txtVoz = await p.$eval('article.seccion:not([hidden]) button[data-escuchar]', (b) => b.textContent);
  const estadoVoz = await p.$eval('#estado', (e) => e.textContent);
  check(
    txtVoz === 'Detener' || /voz alta/.test(estadoVoz),
    `escuchar arranca la lectura o avisa que no hay voz (${txtVoz} · ${estadoVoz.slice(0, 50)})`
  );
  if (txtVoz === 'Detener') {
    await p.click('article.seccion:not([hidden]) button[data-escuchar]');
    check(
      (await p.$eval('article.seccion:not([hidden]) button[data-escuchar]', (b) => b.textContent)) === 'Escuchar',
      'detener vuelve al estado inicial'
    );
  }
  sinErrores(p, 'con la figura y la voz', { consola: true });
});

// Un sintetizador que acepta hablar y nunca termina, para probar el estado sin depender de voces reales.
const sintetizador = () => {
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
};

test('Lectura en voz alta: cambiar de sección mientras suena', async ({ abrir }) => {
  const p = await abrir({ previo: [sintetizador] });
  await p.click('#sec-cap-01 button[data-escuchar]');
  check(
    (await p.$eval('#sec-cap-01 button[data-escuchar]', (b) => b.textContent)) === 'Detener' &&
      (await p.$$('#sec-cap-01 .bloque.leyendo')).length === 1,
    'escuchar ilumina el párrafo que suena'
  );
  await p.evaluate(() => {
    location.hash = '#cap-02';
  });
  await p.waitForSelector('#sec-cap-02:not([hidden])');
  await p.click('#sec-cap-02 button[data-escuchar]');
  const botones = await p.evaluate(() => ({
    uno: document.querySelector('#sec-cap-01 button[data-escuchar]').textContent,
    dos: document.querySelector('#sec-cap-02 button[data-escuchar]').textContent,
    leyendo: document.querySelectorAll('#sec-cap-02 .bloque.leyendo').length,
  }));
  check(
    botones.uno === 'Escuchar' && botones.dos === 'Detener' && botones.leyendo === 1,
    `escuchar otra sección cambia la lectura en vez de sólo detenerla (${botones.uno} / ${botones.dos})`
  );
  await p.waitForTimeout(50);
  check(
    !/No se pudo leer/.test(await p.$eval('#estado', (e) => e.textContent)) &&
      (await p.$eval('#sec-cap-02 button[data-escuchar]', (b) => b.textContent)) === 'Detener',
    'la interrupción que provoca cancelar no se toma por un fallo'
  );
  await p.click('#sec-cap-02 button[data-escuchar]');
  check(
    (await p.$eval('#sec-cap-02 button[data-escuchar]', (b) => b.textContent)) === 'Escuchar',
    'pulsar en la misma sección detiene'
  );
  await p.click('#sec-cap-02 button[data-escuchar]');
  await p.evaluate(() => {
    location.hash = '#cap-01';
  });
  await p.waitForSelector('#sec-cap-01:not([hidden])');
  check(
    (await p.$eval('#sec-cap-02 button[data-escuchar]', (b) => b.textContent)) === 'Escuchar' &&
      (await p.$$('.bloque.leyendo')).length === 0,
    'cambiar de sección detiene la lectura'
  );
});

// ------------------------------------------------------------ accesibilidad y salir de las fichas (escritorio)
test('Accesibilidad: el estado se anuncia, pestañas y filtros dicen su estado, y lo primero de Tab es «Saltar al texto»', async ({
  abrir,
}) => {
  const p = await sinBaseLista(abrir);
  const aria = await p.evaluate(() => ({
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
  const salto = await p.evaluate(() => {
    const s = document.querySelector('a.saltar');
    const primero = document.querySelector(
      'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'
    );
    return !!s && primero === s;
  });
  if (salto) {
    await p.focus('a.saltar');
    await p.keyboard.press('Enter');
  }
  check(
    salto && (await p.evaluate(() => document.activeElement.id)) === 'lectura',
    'lo primero del orden de Tab es «Saltar al texto», que lleva el foco a la lectura'
  );
  sinErrores(p, 'en los roles y «Saltar al texto»', { consola: true });
});

test('Las pestañas se recorren con flechas; un filtro sin resultados se resume y ofrece quitarlo', async ({
  abrir,
}) => {
  const p = await sinBaseLista(abrir);
  await p.focus('.tab.activa');
  await p.keyboard.press('ArrowRight');
  const tabTras = await p.evaluate(() => ({
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
  // un filtro sin resultados (en «Todas», sin anotaciones) lo dice y ofrece quitarlo
  await pulsar(p, '.filtro[data-f="duda"]');
  const filtrada = await p.evaluate(() => ({
    pulsado: document.querySelector('.filtro[data-f="duda"]').getAttribute('aria-pressed'),
    resumen: (document.querySelector('#filtro-resumen') || {}).textContent || '',
    quitar: !!Array.from(document.querySelectorAll('#lista button')).find((b) => /Quitar filtros/.test(b.textContent)),
  }));
  check(
    filtrada.pulsado === 'true' && /duda/.test(filtrada.resumen) && filtrada.quitar,
    `el filtro activo se anuncia, se resume junto a «Filtros» y, sin resultados, ofrece quitarlo (${JSON.stringify(filtrada)})`
  );
  if (filtrada.quitar) await p.click('#lista button.enlace');
  check(
    (await p.$eval('.filtro.on', (b) => b.getAttribute('data-f'))) === 'todas',
    '«Quitar filtros» vuelve a mostrarlo todo'
  );
  sinErrores(p, 'en las pestañas y los filtros', { consola: true });
});

// N con los primeros 25 caracteres del primer párrafo seleccionados: subraya y abre la nota.
async function notaConN(p) {
  await seleccionar(p, 25);
  await p.keyboard.press('n');
  await p.waitForSelector('.ficha.foco textarea');
}
// Un clic en el centro del último párrafo sin subrayados de la sección: en el texto, fuera de la ficha.
async function clicFuera(p) {
  const pOtro = await p.evaluate(() => {
    const ps = Array.from(document.querySelectorAll('article.seccion:not([hidden]) p.bloque[data-pid]')).filter(
      (b) => !b.querySelector('mark')
    );
    const b = ps[ps.length - 1];
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await p.mouse.click(pOtro.x, pOtro.y);
}
// Un subrayado con su nota, hecho con N, y ya fuera de su ficha (con la nota guardada).
async function conNota(abrir) {
  const p = await sinBaseLista(abrir);
  await notaConN(p);
  await p.keyboard.type('Nota que se guarda al salir');
  await clicFuera(p);
  return p;
}

test('N abre la nota del subrayado; la ficha nombra su categoría; un clic en el texto sale y la guarda', async ({
  abrir,
}) => {
  const p = await sinBaseLista(abrir);
  await notaConN(p);
  check(
    await p.evaluate(() => document.activeElement.tagName === 'TEXTAREA'),
    'N abre la nota del subrayado con el cursor en ella'
  );
  await p.keyboard.type('Nota que se guarda al salir');
  const cab = await p.evaluate(() => ({
    cat: (document.querySelector('.ficha.foco .cab .cat') || {}).textContent || '',
    pulsados: document.querySelectorAll('.ficha.foco .col-btn[aria-pressed="true"]').length,
  }));
  check(
    cab.cat === 'revisar' && cab.pulsados === 1,
    `la ficha nombra su categoría (no sólo el color) y el color actual se anuncia pulsado (${JSON.stringify(cab)})`
  );
  await clicFuera(p);
  const fuera = await p.evaluate(() => ({
    ficha: document.querySelectorAll('.ficha.foco').length,
    marca: document.querySelectorAll('mark.hl.foco').length,
  }));
  check(
    fuera.ficha === 0 && fuera.marca === 0 && (await guardadoLocal(p, 'Nota que se guarda al salir')),
    `un clic en el texto, fuera de la ficha, sale de ella y la nota queda guardada (${JSON.stringify(fuera)})`
  );
  sinErrores(p, 'al anotar con N y salir con un clic', { consola: true });
});

test('Esc y Ctrl+Enter en la nota la guardan y devuelven el foco al pasaje; Esc en la ficha también sale', async ({
  abrir,
}) => {
  const p = await conNota(abrir);
  await p.click('article.seccion:not([hidden]) mark.hl');
  check((await p.$$('.ficha.foco')).length === 1, 'clic en el subrayado vuelve a su ficha');
  await p.click('.ficha.foco textarea');
  await p.keyboard.press('End');
  await p.keyboard.type(' (y más)');
  await p.keyboard.press('Escape');
  const trasEsc = await p.evaluate(() => ({
    tag: document.activeElement.tagName,
    foco: document.querySelectorAll('.ficha.foco, mark.hl.foco').length,
  }));
  check(
    trasEsc.tag === 'MARK' && trasEsc.foco === 0 && (await guardadoLocal(p, '(y más)')),
    `Esc en la nota la guarda, sale de la ficha y devuelve el foco al pasaje (${JSON.stringify(trasEsc)})`
  );
  // Enter en el pasaje vuelve a la ficha; Ctrl+Enter en la nota sale igual; Esc fuera de la nota también sale
  await p.keyboard.press('Enter');
  await p.focus('.ficha.foco textarea');
  await p.keyboard.press('End');
  await p.keyboard.type('!');
  await p.keyboard.press('Control+Enter');
  const trasCtrl = await p.evaluate(() => ({
    tag: document.activeElement.tagName,
    foco: document.querySelectorAll('.ficha.foco').length,
    nota: (document.querySelector('.ficha textarea') || {}).value,
  }));
  check(
    trasCtrl.tag === 'MARK' && trasCtrl.foco === 0 && /!$/.test(trasCtrl.nota || ''),
    `Ctrl+Enter en la nota guarda y vuelve al texto (${JSON.stringify(trasCtrl)})`
  );
  await p.keyboard.press('Enter');
  await p.keyboard.press('Escape');
  check((await p.$$('.ficha.foco')).length === 0, 'Esc con la ficha enfocada (fuera de la nota) sale de ella');
  sinErrores(p, 'al salir de la ficha con el teclado', { consola: true });
});

test('Atajos y figura ampliada como diálogos modales: un clic fuera o Esc los cierran y el foco vuelve', async ({
  abrir,
}) => {
  const p = await sinBaseLista(abrir);
  await p.keyboard.press('?');
  const dlg = await p.evaluate(() => {
    const d = document.querySelector('#atajos');
    return { abierto: !!d.open, modal: d.matches(':modal'), foco: !!document.activeElement.closest('#atajos') };
  });
  await p.mouse.click(5, 5);
  check(
    dlg.abierto && dlg.modal && dlg.foco && !(await p.$eval('#atajos', (d) => !!d.open)),
    `? abre los atajos como diálogo modal con el foco adentro, y un clic en el fondo lo cierra (${JSON.stringify(dlg)})`
  );
  await p.click('#b-atajos');
  const bordeAtajos = await p.$eval('#atajos', (d) => {
    const r = d.getBoundingClientRect();
    return { x: r.left + 4, y: r.top + 4 };
  });
  await p.mouse.click(bordeAtajos.x, bordeAtajos.y);
  check(
    await p.$eval('#atajos', (d) => !!d.open),
    'un clic en el relleno del diálogo (dentro de su recuadro) no lo cierra'
  );
  await p.keyboard.press('Escape');
  check(
    !(await p.$eval('#atajos', (d) => !!d.open)) && (await p.evaluate(() => document.activeElement.id)) === 'b-atajos',
    'Esc cierra los atajos y el foco vuelve a su botón'
  );
  // figura ampliada con texto alternativo; un clic la cierra
  await p.click('article.seccion:not([hidden]) figure img');
  const lb = await p.evaluate(() => ({
    abierto: !!document.querySelector('#lightbox').open,
    alt: document.querySelector('#lightbox img').alt,
  }));
  await p.mouse.click(640, 450);
  check(
    lb.abierto && lb.alt.length > 3 && !(await p.$eval('#lightbox', (d) => !!d.open)),
    `la figura ampliada lleva su leyenda como texto alternativo y un clic la cierra (${lb.alt.slice(0, 40)})`
  );
  sinErrores(p, 'en los atajos y la figura', { consola: true });
});

// ------------------------------------------------------------ ajustes de lectura
const tamTexto = (p) =>
  p.$eval('article.seccion:not([hidden]) p.bloque', (b) => parseFloat(getComputedStyle(b).fontSize));
// «Aa»: A+ dos veces (de 100 a 120 %), tema oscuro y letra sans, con el menú abierto; dice si el menú respondió.
async function ajustarLectura(p) {
  try {
    await p.click('#ajustes > summary');
    await p.click('#aj-mas');
    await p.click('#aj-mas');
    await p.check('input[name="aj-tema"][value="dark"]');
    await p.check('input[name="aj-letra"][value="sans"]');
    return true;
  } catch {
    return false;
  }
}
// El menor contraste (WCAG) entre el texto y su fondo de los elementos dados.
const contrasteMinimo = (p, sels) =>
  p.evaluate((sels) => {
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
    return Math.min(...sels.map((q) => ratio(document.querySelector(q))));
  }, sels);

test('«Aa» agranda el texto y el título y cambia tema y letra, con contraste en oscuro; A+ se detiene en el tope; Esc cierra el menú', async ({
  abrir,
}) => {
  const p = await sinBaseLista(abrir);
  const tam0 = await tamTexto(p);
  const ajustesOk = await ajustarLectura(p);
  const tam1 = await tamTexto(p);
  const oscuro = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const letra = await p.$eval('article.seccion:not([hidden]) p.bloque', (b) => getComputedStyle(b).fontFamily);
  // contraste del texto sobre la tinta (pestaña activa, sección activa) en tema oscuro
  const contrasteOscuro = await contrasteMinimo(p, ['.tab.activa', 'nav a.sec.activa']);
  check(
    contrasteOscuro >= 4.5,
    `en tema oscuro el texto sobre la tinta tiene contraste suficiente (${contrasteOscuro.toFixed(2)}:1)`
  );
  for (let i = 0; i < 2; i++) await p.click('#aj-mas'); // de 120 % al tope (145 %)
  check(
    (await p.evaluate(() => document.activeElement.id)) === 'aj-mas' &&
      (await p.$eval('#aj-mas', (b) => b.getAttribute('aria-disabled'))) === 'true',
    'A+ al tope queda deshabilitado sin perder el foco'
  );
  for (let i = 0; i < 2; i++) await p.click('#aj-menos');
  await p.keyboard.press('Escape');
  const menuCerrado = await p.evaluate(
    () => !document.querySelector('#ajustes').open && document.activeElement.tagName === 'SUMMARY'
  );
  check(
    ajustesOk && tam1 > tam0 && oscuro === 'rgb(21, 23, 27)' && /Plex/.test(letra) && menuCerrado,
    `«Aa» agranda el texto, cambia tema y letra, y Esc cierra el menú con el foco en su botón (${tam0} → ${tam1} px, ${oscuro})`
  );
  const subtitulo = await p.$eval('article.seccion:not([hidden]) h1.sec-titulo', (h) =>
    parseFloat(getComputedStyle(h).fontSize)
  );
  check(subtitulo > 28, `el título de la sección también crece con «Aa» (${subtitulo} px)`);
  sinErrores(p, 'con los ajustes de lectura', { consola: true });
});

test('Los ajustes de lectura se recuerdan al recargar, y «sistema» devuelve el tema', async ({ abrir }) => {
  const p = await sinBaseLista(abrir);
  const ajustesOk = await ajustarLectura(p);
  const tam1 = await tamTexto(p);
  await p.keyboard.press('Escape');
  await p.reload();
  await p.waitForSelector('article.seccion:not([hidden]) p.bloque[data-pid]');
  check(
    (await tamTexto(p)) === tam1 &&
      (await p.evaluate(() => document.documentElement.getAttribute('data-tema-lector'))) === 'dark',
    'los ajustes de lectura se recuerdan al recargar'
  );
  if (ajustesOk) {
    await p.click('#ajustes > summary');
    await p.check('input[name="aj-tema"][value=""]');
  }
  check(
    !(await p.evaluate(() => document.documentElement.hasAttribute('data-tema-lector'))),
    '«sistema» devuelve el tema al del sistema'
  );
  sinErrores(p, 'al recordar los ajustes', { consola: true });
});

test('El botón de concentración dice si está activo; al borrar, el foco queda en el panel, y al deshacer, en la anotación', async ({
  abrir,
}) => {
  const p = await conNota(abrir);
  await p.click('#b-foco');
  const focoPulsado = await p.$eval('#b-foco', (b) => b.getAttribute('aria-pressed'));
  await p.click('#b-foco');
  check(
    focoPulsado === 'true' && (await p.$eval('#b-foco', (b) => b.getAttribute('aria-pressed'))) === 'false',
    'el botón de concentración anuncia si está activo'
  );
  await enFicha(p, '.ficha', 'button[data-accion="borrar"]');
  await p.click('.ficha button[data-accion="si"]');
  const trasBorrarA = await p.evaluate(() => ({
    foco: document.activeElement !== document.body && !!document.activeElement.closest('#panel'),
    deshacer: !!document.querySelector('#deshacer'),
  }));
  check(
    trasBorrarA.foco && trasBorrarA.deshacer,
    `al borrar, el foco queda en el panel y aparece «Deshacer» (${JSON.stringify(trasBorrarA)})`
  );
  await p.click('#deshacer');
  check(
    await p.evaluate(
      () => document.activeElement !== document.body && !!document.activeElement.closest('.ficha, mark')
    ),
    'tras deshacer, el foco queda en la anotación recuperada'
  );
  sinErrores(p, 'al borrar y deshacer con el foco', { consola: true });
});
