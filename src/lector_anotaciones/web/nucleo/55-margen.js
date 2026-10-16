// Núcleo · notas al margen: dónde va cada ficha para quedar a la altura de su pasaje sin pisarse con las vecinas. Sin DOM.
(function (raiz, crear) {
  var N = (raiz.LANucleo = raiz.LANucleo || {}),
    m = crear(N);
  Object.keys(m).forEach(function (k) {
    N[k] = m[k];
  });
})(typeof self !== 'undefined' ? self : globalThis, function (N) {
  'use strict';
  // items: [{ id, y, h }] (y: altura del pasaje, h: alto de la ficha; y = null si no tiene pasaje a la vista). Como los
  // comentarios de un procesador de texto: cada ficha va a la altura de su pasaje; si choca con la anterior, baja. La
  // activa manda: queda exactamente junto a su pasaje, las de abajo se corren hacia abajo y las de arriba hacia arriba.
  // Las que no tienen pasaje van al final, en su orden. Devuelve { tops: { id: top }, alto }.
  function apilar(items, activo, separacion) {
    var gap = separacion === undefined ? 8 : separacion,
      conY = [],
      sinY = [];
    items.forEach(function (it, i) {
      (it.y === null || it.y === undefined || !isFinite(it.y) ? sinY : conY).push({
        id: it.id,
        y: it.y,
        h: it.h,
        i: i,
      });
    });
    conY.sort(function (a, b) {
      return a.y - b.y || a.i - b.i;
    });
    var fin = conY.length ? conY[conY.length - 1].y : 0;
    sinY.forEach(function (it, k) {
      it.y = fin + 1 + k;
      conY.push(it);
    });
    var k = -1,
      i,
      fondo,
      techo;
    for (i = 0; i < conY.length; i++)
      if (conY[i].id === activo) {
        k = i;
        break;
      }
    if (k < 0) {
      fondo = -Infinity;
      conY.forEach(function (it) {
        it.top = Math.max(it.y, fondo);
        fondo = it.top + it.h + gap;
      });
    } else {
      conY[k].top = conY[k].y;
      fondo = conY[k].top + conY[k].h + gap;
      for (i = k + 1; i < conY.length; i++) {
        conY[i].top = Math.max(conY[i].y, fondo);
        fondo = conY[i].top + conY[i].h + gap;
      }
      techo = conY[k].top - gap;
      for (i = k - 1; i >= 0; i--) {
        conY[i].top = Math.min(conY[i].y, techo - conY[i].h);
        techo = conY[i].top - gap;
      }
    }
    var tops = {},
      alto = 0;
    conY.forEach(function (it) {
      tops[it.id] = it.top;
      alto = Math.max(alto, it.top + it.h);
    });
    return { tops: tops, alto: alto };
  }
  return { apilar: apilar };
});
