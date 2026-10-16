// Núcleo · ubicar un subrayado en la versión actual del libro. Sin DOM: el texto de cada bloque se pide a `ctx`.
//
// Los ids de bloque son posicionales: si se inserta un párrafo y se reconstruye el libro, los ids posteriores de
// esa sección cambian. Por eso nunca se pinta un subrayado sin comprobar que la cita guardada sigue en el lugar
// guardado; si no, se busca (primero en el bloque, luego en la sección, luego en el libro, exigiendo contexto
// fuera del bloque) y, si no aparece, se declara perdido. Nada de esto modifica la anotación guardada.
(function (raiz, crear) {
  var N = (raiz.LANucleo = raiz.LANucleo || {}),
    m = crear(N);
  Object.keys(m).forEach(function (k) {
    N[k] = m[k];
  });
})(typeof self !== 'undefined' ? self : globalThis, function (N) {
  'use strict';
  // Índice de la cita en `txt`, desambiguado con el contexto: { i, puntos } (puntos de 0 a 2) o null.
  function buscarCita(txt, a) {
    if (!a.cita) return null;
    var mejor = null;
    for (var k = txt.indexOf(a.cita); k >= 0; k = txt.indexOf(a.cita, k + 1)) {
      var p = 0;
      if (a.antes && txt.slice(Math.max(0, k - a.antes.length), k) === a.antes) p += 1;
      if (a.despues && txt.slice(k + a.cita.length, k + a.cita.length + a.despues.length) === a.despues) p += 1;
      if (!mejor || p > mejor.puntos) mejor = { i: k, puntos: p };
    }
    return mejor;
  }
  // ctx: { existe(pid) → bool, texto(pid) → string, candidatos(a) → [pid…] en orden: la sección, luego el libro,
  // porHuella(h) → [pid…] de los bloques con esa huella, en el mismo orden (opcional) }.
  // Devuelve { pid, inicio, fin, estado: 'exacto' | 'reubicado' | 'perdido' }, o null si no es un subrayado.
  // El orden: la cita donde estaba; si no, el bloque con la misma huella que cuando se anotó (`bh`: el mismo texto,
  // aunque su id haya cambiado porque se insertaron o quitaron bloques antes), donde la ubicación sigue siendo exacta;
  // si no, la búsqueda por la cita y su contexto, en su bloque y después fuera.
  function ubicarEn(a, ctx) {
    if (a.tipo !== 'subrayado' || !a.pid) return null;
    var existe = ctx.existe(a.pid),
      txt = existe ? ctx.texto(a.pid) : '';
    if (existe && txt.slice(a.inicio, a.fin) === a.cita)
      return { pid: a.pid, inicio: a.inicio, fin: a.fin, estado: 'exacto' };
    if (a.bh && ctx.porHuella) {
      var mismos = ctx.porHuella(a.bh);
      for (var k = 0; k < mismos.length; k++)
        if (mismos[k] !== a.pid && ctx.texto(mismos[k]).slice(a.inicio, a.fin) === a.cita)
          return { pid: mismos[k], inicio: a.inicio, fin: a.fin, estado: 'exacto' };
    }
    var m = existe ? buscarCita(txt, a) : null;
    if (m) return { pid: a.pid, inicio: m.i, fin: m.i + a.cita.length, estado: 'reubicado' };
    // Fuera del bloque original: vale una coincidencia con contexto; sin contexto (la cita ocupaba el bloque
    // entero, o es larga) vale sólo si es la única en todo el libro.
    var candidatos = ctx.candidatos(a),
      sinContexto = !a.antes && !a.despues,
      hallazgos = [],
      mejor = null;
    for (var c = 0; c < candidatos.length; c++) {
      var p = candidatos[c];
      if (p === a.pid) continue;
      var m2 = buscarCita(ctx.texto(p), a);
      if (!m2) continue;
      var h = { pid: p, inicio: m2.i, fin: m2.i + a.cita.length, puntos: m2.puntos };
      if (m2.puntos > 0 && (!mejor || m2.puntos > mejor.puntos)) mejor = h;
      hallazgos.push(h);
    }
    if (mejor) return { pid: mejor.pid, inicio: mejor.inicio, fin: mejor.fin, estado: 'reubicado' };
    if (hallazgos.length === 1 && (sinContexto || a.cita.length >= 40))
      return { pid: hallazgos[0].pid, inicio: hallazgos[0].inicio, fin: hallazgos[0].fin, estado: 'reubicado' };
    return { pid: null, inicio: 0, fin: 0, estado: 'perdido' };
  }
  return { buscarCita: buscarCita, ubicarEn: ubicarEn };
});
