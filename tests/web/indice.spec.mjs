// El índice lateral: con muchas partes y capítulos se recorre hasta la última entrada (en el teléfono, sin que la
// cabecera del cajón tape la entrada a la que se llega), y las partes se pliegan, se recuerdan y se despliegan solas al
// llegar a uno de sus capítulos.
import { check, esperar, libroAlterado, seleccionarTexto, sinErrores, ESCRITORIO, TELEFONO, test } from './ayudas.mjs';

// Doce partes de quince capítulos, entre un prefacio y unos apéndices: 200 entradas.
const muchasPartes = (L) => {
  const sec = (id, titulo, nivel) => ({
    id,
    titulo,
    nivel,
    src: 'x.md:1',
    bloques: [{ id: id + '-b1', t: 'p', html: 'Texto de ' + titulo + '.', src: 'x.md:1', h: '0'.repeat(12) }],
  });
  const secs = [sec('prefacio', 'Prefacio', 1)];
  const romanos = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  for (let i = 1, c = 0; i <= 12; i++) {
    secs.push(sec('parte-' + i, `PARTE ${romanos[i - 1]}. Una parte con su título`, 1));
    for (let j = 0; j < 15; j++, c++) secs.push(sec('cap-' + (c + 1), `Capítulo ${c + 1}. Uno de tantos capítulos`, 2));
  }
  'ABCDEF'.split('').forEach((k) => secs.push(sec('ap-' + k, `Apéndice ${k}. Material`, 1)));
  secs.push(sec('ultima', 'Referencias', 1));
  L.secciones = secs;
  L.inicio = 'prefacio';
  L.capas = {};
};

// El cajón del índice en el teléfono, abierto y quieto (se desliza desde la izquierda).
async function abrirIndice(p) {
  await p.click('#b-indice');
  await esperar(p, () => document.querySelector('nav.indice').getBoundingClientRect().left === 0);
}
// La entrada se ve entera dentro de lo visible del índice, y es ella (no otra cosa encima) la que recibe un toque.
const aLaVista = (p, sid) =>
  p.evaluate((sid) => {
    const a = document.querySelector(`nav a.sec[data-sid="${sid}"]`);
    const r = a.getBoundingClientRect(),
      n = document.querySelector('nav.indice').getBoundingClientRect();
    const encima = document.elementFromPoint(r.left + 8, (r.top + r.bottom) / 2);
    return r.top >= n.top && r.bottom <= Math.min(n.bottom, innerHeight) && !!encima && a.contains(encima);
  }, sid);

for (const [donde, contexto] of [
  ['en escritorio', ESCRITORIO],
  ['en el teléfono', TELEFONO],
]) {
  test(`Un índice de 200 entradas se recorre hasta la última ${donde}`, async ({ abrir }) => {
    const p = await abrir({ contexto, hash: '#prefacio', preparar: (p) => libroAlterado(p, muchasPartes) });
    const telefono = contexto === TELEFONO;
    if (telefono) await abrirIndice(p);
    await p.hover('nav a.sec[data-sid="prefacio"]');
    // la rueda (o el dedo) sobre el índice lo desplaza a él hasta el final, sin mover la página ni la lectura
    await p.mouse.wheel(0, 30000);
    const alFinal = await esperar(p, () => {
      const n = document.querySelector('nav.indice');
      return n.scrollTop > 0 && Math.abs(n.scrollTop + n.clientHeight - n.scrollHeight) < 2;
    });
    const quietas = await p.evaluate(
      () => document.scrollingElement.scrollTop === 0 && document.querySelector('#lectura').scrollTop === 0
    );
    check(alFinal && quietas, `el índice se desplaza solo, hasta el final (página y lectura quietas: ${quietas})`);
    check(await aLaVista(p, 'ultima'), 'la última entrada queda entera a la vista y se puede tocar');
    await p.click('nav a.sec[data-sid="ultima"]');
    check(await p.isVisible('#sec-ultima'), 'y lleva a su sección');
    if (telefono) {
      // de vuelta a un capítulo de más arriba: su entrada no queda bajo la cabecera fija del cajón
      await p.evaluate(() => {
        location.hash = '#cap-20';
      });
      await esperar(p, () => !document.querySelector('#sec-cap-20').hidden);
      await abrirIndice(p);
      check(await aLaVista(p, 'cap-20'), 'la entrada activa se ve entera bajo la cabecera del cajón');
      // con su parte plegada, al volver a abrir el índice el foco va a la cabecera de la parte, no a algo oculto
      await p.click('nav .parte[data-parte="parte-2"] button.grupo');
      await p.keyboard.press('Escape');
      await esperar(p, () => !document.querySelector('nav.indice').classList.contains('abierta'));
      await abrirIndice(p);
      const foco = await p.evaluate(() => {
        const a = document.activeElement;
        return a.matches('button.grupo') ? a.closest('.parte').getAttribute('data-parte') : a.outerHTML.slice(0, 60);
      });
      check(foco === 'parte-2', `el foco va a la cabecera de la parte plegada (${foco})`);
    }
    sinErrores(p, 'al recorrer un índice largo ' + donde);
  });
}

test('Una parte se pliega con su cabecera y lo recuerda; llegar a uno de sus capítulos la despliega', async ({
  abrir,
}) => {
  const p = await abrir();
  await seleccionarTexto(p, 'Un hecho es lo que se observó');
  await p.keyboard.press('1');
  await p.keyboard.press('Escape');
  await p.click('nav a.sec[data-sid="prefacio"]');
  const cabeceras = await p.$$eval('nav button.grupo', (bs) => bs.map((b) => b.textContent));
  check(cabeceras.length === 1 && /^PARTE I/.test(cabeceras[0]), `sólo las partes llevan cabecera (${cabeceras})`);
  const cab = 'nav .parte[data-parte="parte-1"] button.grupo';
  const estado = () =>
    p.evaluate(() => {
      const g = document.querySelector('nav .parte[data-parte="parte-1"]');
      const visto = (s) => !!g.querySelector(s) && g.querySelector(s).getClientRects().length > 0;
      return {
        expandida: g.querySelector('button.grupo').getAttribute('aria-expanded'),
        capitulo: visto('a.sec[data-sid="cap-01"]'),
        parte: visto('a.sec[data-sid="parte-1"]'),
        cuenta: visto('button.grupo .cuenta') ? g.querySelector('button.grupo .cuenta').textContent : '',
      };
    });
  check(
    JSON.stringify(await estado()) === '{"expandida":"true","capitulo":true,"parte":true,"cuenta":""}',
    'desplegada por omisión, sin cuenta en la cabecera'
  );
  await p.click(cab);
  const plegada = await estado();
  check(
    JSON.stringify(plegada) === '{"expandida":"false","capitulo":false,"parte":true,"cuenta":"1"}',
    `plegada: se ocultan sus capítulos, su entrada sigue y la cabecera cuenta sus anotaciones (${JSON.stringify(plegada)})`
  );
  await p.focus(cab);
  await p.keyboard.press('Enter');
  check((await estado()).expandida === 'true', 'con el teclado se despliega (Enter)…');
  await p.keyboard.press(' ');
  check((await estado()).expandida === 'false', '…y se pliega (espacio)');
  await p.reload();
  await p.waitForSelector('nav a.sec');
  check((await estado()).expandida === 'false', 'al volver a abrir la página sigue plegada');
  await p.evaluate(() => {
    location.hash = '#cap-02';
  });
  await esperar(p, () => !document.querySelector('#sec-cap-02').hidden);
  const llegada = await p.evaluate(() => ({
    expandida: document.querySelector('nav .parte[data-parte="parte-1"] button.grupo').getAttribute('aria-expanded'),
    activa: document.querySelector('nav a.sec.activa').getAttribute('data-sid'),
  }));
  check(
    llegada.expandida === 'true' && llegada.activa === 'cap-02',
    `llegar a un capítulo de una parte plegada la despliega (${JSON.stringify(llegada)})`
  );
  check(await p.isVisible('nav a.sec[data-sid="cap-02"]'), 'y su entrada, la activa, se ve');
  await p.reload();
  await p.waitForSelector('nav a.sec');
  check((await estado()).expandida === 'true', 'desplegarla así también se recuerda');
  check(!(await p.$('#b-plegar-todas')), 'con una sola parte no hay «Plegar todas las partes»');
  sinErrores(p, 'al plegar y desplegar una parte');
});

test('«Plegar todas las partes» deja el índice largo en su esqueleto, y lo devuelve', async ({ abrir }) => {
  const p = await abrir({ hash: '#prefacio', preparar: (p) => libroAlterado(p, muchasPartes) });
  const resumen = () =>
    p.evaluate(() => ({
      boton: document.querySelector('#b-plegar-todas').textContent,
      plegadas: document.querySelectorAll('nav .parte.plegada').length,
      visibles: Array.from(document.querySelectorAll('nav a.sec')).filter((a) => a.getClientRects().length).length,
    }));
  const antes = await resumen();
  check(
    antes.boton === 'Plegar todas las partes' && antes.plegadas === 0 && antes.visibles === 200,
    JSON.stringify(antes)
  );
  await p.click('#b-plegar-todas');
  const plegado = await resumen();
  check(
    plegado.boton === 'Desplegar todas las partes' && plegado.plegadas === 12 && plegado.visibles === 20,
    `plegadas las doce, quedan a la vista las 20 entradas que no son capítulos (${JSON.stringify(plegado)})`
  );
  await p.click('nav .parte[data-parte="parte-3"] button.grupo');
  check((await resumen()).boton === 'Plegar todas las partes', 'con una desplegada, el botón vuelve a plegar');
  await p.click('#b-plegar-todas');
  await p.click('#b-plegar-todas');
  const despues = await resumen();
  check(
    despues.plegadas === 0 && despues.visibles === 200,
    `y desplegar todas las devuelve (${JSON.stringify(despues)})`
  );
  sinErrores(p, 'al plegar y desplegar todas las partes');
});
