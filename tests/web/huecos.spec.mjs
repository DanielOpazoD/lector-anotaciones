// Lo que la medición de cobertura de la 0.6 encontró sin ninguna prueba: recorrer secciones, abrir un resultado de la
// búsqueda, la copia en Markdown de las notas que no son subrayados, el aviso de «Deshacer» que se va solo y una
// selección que empieza en el título de la sección.
import { check, esperar, pulsar, enFicha, seleccionarTexto, CLAVE_LOCAL, test } from './ayudas.mjs';

const PORTAPAPELES = ['clipboard-read', 'clipboard-write'];
const visible = (p) => p.evaluate(() => document.querySelector('article.seccion:not([hidden])').id);

test('Recorrer las secciones con J y K y con ‹ ›, sin pasar de los extremos', async ({ abrir }) => {
  const p = await abrir({ permisos: PORTAPAPELES });
  await p.focus('#lectura');
  await p.keyboard.press('j');
  await esperar(p, () => document.querySelector('article.seccion:not([hidden])').id === 'sec-cap-02');
  check((await visible(p)) === 'sec-cap-02', 'J pasa a la sección siguiente');
  await p.keyboard.press('k');
  await esperar(p, () => document.querySelector('article.seccion:not([hidden])').id === 'sec-cap-01');
  check((await visible(p)) === 'sec-cap-01', 'K vuelve a la anterior');
  await p.click('#sig');
  check((await visible(p)) === 'sec-cap-02', '‹ › hacen lo mismo con el ratón');
  await p.evaluate(() => {
    location.hash = '#glosario';
  });
  await esperar(p, () => document.querySelector('article.seccion:not([hidden])').id === 'sec-glosario');
  const fin = await p.evaluate(() => ({
    sig: document.querySelector('#sig').disabled,
    ant: document.querySelector('#ant').disabled,
  }));
  await p.focus('#lectura');
  await p.keyboard.press('j');
  check(fin.sig && !fin.ant && (await visible(p)) === 'sec-glosario', 'en la última sección, «siguiente» no hace nada');
});

test('Un resultado de la búsqueda en el libro lleva al pasaje, con el foco en él', async ({ abrir }) => {
  const p = await abrir({ hash: '#prefacio' });
  await p.fill('#buscar', 'escrita con prisa');
  await p.press('#buscar', 'Enter');
  await p.waitForSelector('#lista .res:not(.anot)');
  await p.click('#lista .res:not(.anot)');
  const r = await p.evaluate(() => ({
    seccion: document.querySelector('article.seccion:not([hidden])').id,
    foco: document.activeElement && document.activeElement.getAttribute('data-pid'),
  }));
  check(
    r.seccion === 'sec-cap-01' && r.foco === 'cap-01-b1',
    `el resultado abre la sección y enfoca el párrafo (${JSON.stringify(r)})`
  );
});

test('«Copiar todo (Markdown)» lleva las notas de sección y generales', async ({ abrir }) => {
  const p = await abrir({ permisos: PORTAPAPELES });
  await pulsar(p, '#b-nota-cap');
  await p.keyboard.type('Falta un ejemplo en la sección');
  await p.keyboard.press('Escape');
  await pulsar(p, '#b-nota-gen');
  await p.keyboard.type('Revisar el título');
  await p.keyboard.press('Escape');
  await enFicha(p, '.ficha.t-general', 'button[data-accion="estado"]');
  await pulsar(p, '#b-copiar-md');
  const md = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(md.includes('- [capitulo] Falta un ejemplo en la sección'), 'la nota de sección, con su tipo');
  check(md.includes('- [general, resuelta] Revisar el título'), 'la general, con su estado');
});

test('El aviso de «Deshacer» se va solo a los ocho segundos y devuelve el foco', async ({ abrir }) => {
  const p = await abrir({ preparar: (p) => p.clock.install() });
  await seleccionarTexto(p, 'Un hecho es lo que se observó');
  await p.keyboard.press('1');
  await p.keyboard.press('Escape');
  await enFicha(p, '.ficha.c-revisar', 'button[data-c="cortar"]');
  await p.focus('#deshacer');
  await p.clock.fastForward(7000);
  check((await p.textContent('#deshacer-zona')) === 'Color: cortar.Deshacer', 'a los siete segundos sigue ahí');
  await p.clock.fastForward(1500);
  const r = await p.evaluate(() => ({
    zona: document.querySelector('#deshacer-zona').textContent,
    foco: document.activeElement && (document.activeElement.id || document.activeElement.className),
  }));
  check(
    r.zona === '' && r.foco !== '' && r.foco !== 'deshacer',
    `a los ocho se va y el foco no se pierde (${JSON.stringify(r)})`
  );
});

test('Una selección que empieza en el título de la sección subraya desde el principio del párrafo', async ({
  abrir,
}) => {
  const p = await abrir();
  await p.evaluate(() => {
    const art = document.querySelector('article.seccion:not([hidden])');
    const titulo = art.querySelector('h1.sec-titulo').firstChild;
    const parrafo = art.querySelector('[data-pid="cap-01-b1"]');
    const w = document.createTreeWalker(parrafo, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = w.nextNode()) && t.nodeValue.indexOf('Un hecho') < 0);
    const r = document.createRange();
    r.setStart(titulo, 3);
    r.setEnd(t, t.nodeValue.indexOf('Un hecho') + 'Un hecho'.length);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await p.keyboard.press('1');
  const a = await p.evaluate(
    (k) => Object.values(JSON.parse(localStorage.getItem(k) || '{}')).find((x) => x.tipo === 'subrayado'),
    CLAVE_LOCAL
  );
  check(
    a && a.pid === 'cap-01-b1' && a.inicio === 0 && a.cita === 'Un hecho',
    `el subrayado empieza en el párrafo, no en el título (${JSON.stringify(a && { pid: a.pid, inicio: a.inicio, cita: a.cita })})`
  );
});
