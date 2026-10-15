// Núcleo · revisar respuestas y recorrer anotaciones. Sin DOM.
(function (raiz, crear) {
  var N = raiz.LANucleo = raiz.LANucleo || {}, m = crear(N);
  Object.keys(m).forEach(function (k) { N[k] = m[k]; });
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  // Una respuesta (de Claude o de quien edita las fuentes) está por revisar si es de una anotación propia —o sin autor,
  // como las de un navegador sin identidad— y llegó después de la última revisión del autor. `revisado` lo escribe la
  // página al marcarla atendida, reabrirla o contestar una pregunta; `respondido`, quien responde.
  function porRevisar(a, yo) {
    if (!a || !(a.respuesta || a.cierre)) return false;
    if (a.autor && yo && a.autor !== yo) return false;
    if (!a.revisado) return true;
    if (!a.respondido) return false;
    // instantes, no textos: «12:00:00Z», «12:00:00.000Z» y «09:00:00-03:00» son la misma hora
    var r = Date.parse(a.respondido), v = Date.parse(a.revisado);
    return isNaN(r) || isNaN(v) ? a.revisado < a.respondido : v < r;
  }
  // La posición a la que se pasa desde `actual` (id) en `lista` (en orden) al avanzar `d` (+1 o −1): sin una actual en
  // la lista, la primera (o la última al retroceder); -1 si ya no hay más en esa dirección.
  function vecina(lista, actual, d) {
    var i = -1;
    for (var k = 0; k < lista.length; k++) if (lista[k].id === actual) { i = k; break; }
    var j = i < 0 ? (d > 0 ? 0 : lista.length - 1) : i + d;
    return j >= 0 && j < lista.length ? j : -1;
  }
  return { porRevisar: porRevisar, vecina: vecina };
});
