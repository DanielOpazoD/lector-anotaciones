// La ficha es función de (anotación, vista): lo que se le cambia en el sitio (activarla, dejarla, abrir el cuadro de la
// propuesta) pasa por `vistaEnSitio` y un redibujo la reutiliza tal cual; lo que cambia su vista la rehace.
import { check, esperar, seleccionarTexto, test } from './ayudas.mjs';

const g = (id, autor, creado) => ({ id, tipo: 'general', nota: 'Nota ' + id, estado: 'abierta', creado, autor });

test('Activar, dejar y abrir la propuesta no rehacen la ficha; un redibujo la reutiliza con lo que muestra', async ({
  abrir,
}) => {
  const p = await abrir({
    modo: 'con-base',
    semilla: { g1: g('g1', 'u_me', '2026-10-01T00:00:00Z'), g2: g('g2', 'u_otro', '2026-10-01T00:01:00Z') },
  });
  await seleccionarTexto(p, 'Un hecho es lo que se observó');
  await p.keyboard.press('1');
  await p.keyboard.press('Escape');
  const s = await p.evaluate(() => Object.keys(window.__docs).find((k) => k !== 'g1' && k !== 'g2'));
  await p.click('.tab[data-tab="todas"]');
  await p.waitForSelector(`.ficha[data-id="${s}"]`);
  await p.evaluate(() =>
    document.querySelectorAll('#lista .ficha').forEach((f) => {
      f.__marca = 1;
    })
  );
  // con g1 activa, un cambio de otra anotación redibuja el panel: g1 sigue siendo el mismo nodo, activo
  await p.click('.ficha[data-id="g1"] .cab > span');
  await p.evaluate(() => window.__cambioExterno('g2', { nota: 'Nota g2, primer cambio' }));
  await esperar(p, () => /primer/.test(document.querySelector('.ficha[data-id="g2"] textarea.nota').value));
  const activa = await p.evaluate(() => {
    const f = document.querySelector('.ficha[data-id="g1"]');
    return { mismo: !!f.__marca, foco: f.classList.contains('foco') };
  });
  check(activa.mismo && activa.foco, `la ficha activa no se rehace por estar activa (${JSON.stringify(activa)})`);
  // pasar de g1 al subrayado, abrir su propuesta (P), sin escribir nada, y salir con Esc
  await p.click(`.ficha[data-id="${s}"] .cab > span`);
  await p.keyboard.press('p');
  await p.waitForSelector(`.ficha[data-id="${s}"] textarea.sugerencia`);
  await p.keyboard.press('Escape');
  // un cambio de otra anotación redibuja el panel
  await p.evaluate(() => window.__cambioExterno('g2', { nota: 'Nota g2, cambiada en otra sesión' }));
  await esperar(p, () => /cambiada/.test(document.querySelector('.ficha[data-id="g2"] textarea.nota').value));
  const r = await p.evaluate((s) => {
    const f = (id) => document.querySelector(`.ficha[data-id="${id}"]`);
    return {
      g1: !!f('g1').__marca,
      g2: !!f('g2').__marca,
      s: !!f(s).__marca,
      focos: document.querySelectorAll('#lista .ficha.foco').length,
      cuadro: !!f(s).querySelector('textarea.sugerencia'),
      proponer: !!f(s).querySelector('[data-accion="proponer"]'),
      lector: (f('g2').querySelector('.autor') || {}).textContent,
    };
  }, s);
  check(r.g1 && r.s && !r.g2, `sólo se rehace la ficha que cambió (${JSON.stringify(r)})`);
  check(r.focos === 0, 'ninguna queda marcada activa después de dejarla');
  check(r.cuadro && !r.proponer, 'el cuadro de la propuesta abierta sigue ahí, sin «Proponer texto»');
  check(r.lector === 'Lectora Invitada', `la ficha rehecha lleva el nombre de la otra lectora (${r.lector})`);
  // la propuesta abierta también sobrevive a una ficha rehecha: un cambio del propio subrayado
  await p.evaluate((s) => window.__cambioExterno(s, { nota: 'Con nota' }), s);
  await esperar(p, (s) => !document.querySelector(`.ficha[data-id="${s}"]`).__marca, s);
  check(
    await p.evaluate((s) => !!document.querySelector(`.ficha[data-id="${s}"] textarea.sugerencia`), s),
    'rehecha por un cambio suyo, la ficha vuelve con el cuadro de la propuesta abierto'
  );
});
