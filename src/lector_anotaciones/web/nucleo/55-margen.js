// Núcleo · notas al margen: dónde va cada ficha para quedar a la altura de su pasaje sin pisarse con las vecinas. Sin DOM.
// La envoltura de cada archivo del núcleo: `crear` recibe el núcleo (con lo de los archivos anteriores) y devuelve lo
// suyo, que se le añade; cada función devuelta se revisa contra su firma en `Nucleo` (tipos/globales.d.ts).
/** @type {(raiz: any, crear: (N: Nucleo) => Partial<Nucleo>) => void} */ (
  function (raiz, crear) {
    var N = /** @type {any} */ (raiz.LANucleo = raiz.LANucleo || {}),
      m = /** @type {any} */ (crear(N));
    Object.keys(m).forEach(function (k) {
      N[k] = m[k];
    });
  }
)(typeof self !== 'undefined' ? self : globalThis, function (N) {
  'use strict';
  // items: [{ id, y, h }] (y: altura del pasaje, h: alto de la ficha; y = null si no tiene pasaje a la vista). Como los
  // comentarios de un procesador de texto: cada ficha va a la altura de su pasaje; si choca con la anterior, baja. La
  // activa manda: queda exactamente junto a su pasaje, las de abajo se corren hacia abajo y las de arriba hacia arriba.
  // Las que no tienen pasaje van al final, en su orden. Devuelve { tops: { id: top }, alto }.
  /**
   * @param {{ id: string, y: number | null, h: number }[]} items
   * @param {string | null} activo
   * @param {number} [separacion]
   */
  function apilar(items, activo, separacion) {
    /** @typedef {{ id: string, y: number, h: number, i: number, top: number }} Pieza */
    var gap = separacion === undefined ? 8 : separacion;
    /** @type {Pieza[]} */
    var conY = [];
    /** @type {Pieza[]} */
    var sinY = [];
    items.forEach(function (it, i) {
      (it.y === null || it.y === undefined || !isFinite(it.y) ? sinY : conY).push({
        id: it.id,
        y: /** @type {number} */ (it.y), // sin pasaje: se le da su lugar al final, abajo
        h: it.h,
        i: i,
        top: 0, // se calcula abajo
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
      /** @type {number} */ i,
      /** @type {number} */ fondo,
      /** @type {number} */ techo;
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
    /** @type {Record<string, number>} */
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
