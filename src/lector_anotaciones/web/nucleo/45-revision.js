// Núcleo · revisar respuestas y recorrer anotaciones. Sin DOM.
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
  // Una respuesta (de Claude o de quien edita las fuentes) está por revisar si es de una anotación propia —o sin autor,
  // como las de un navegador sin identidad— y el autor no revisó todavía esa respuesta. `respondido` lo escribe quien
  // responde, con su reloj; `revisado`, la página al marcarla atendida, reabrirla o contestar la pregunta, y guarda el
  // `respondido` de la respuesta revisada (`marcaRevision`), no la hora del navegador: así no se comparan dos relojes,
  // y cualquier `respondido` distinto —también uno anterior— es una respuesta nueva. Sin identidad conocida (`yo`
  // nulo) sólo cuentan las anotaciones sin autor: las de otros lectores no son para revisar aquí.
  /**
   * @param {Anotacion | null | undefined} a
   * @param {string | null} yo
   */
  function porRevisar(a, yo) {
    if (!a || !(a.respuesta || a.cierre)) return false;
    if (a.autor && a.autor !== yo) return false;
    if (!a.revisado) return true;
    return !!a.respondido && a.respondido !== a.revisado;
  }
  // Lo que se guarda en `revisado` al revisar: el `respondido` de la respuesta, o la hora si no lo trae.
  /**
   * @param {Anotacion | null | undefined} a
   * @param {string} ahora
   * @returns {string}
   */
  function marcaRevision(a, ahora) {
    return (a && a.respondido) || ahora;
  }
  // La posición a la que se pasa desde `actual` (id) en `lista` (en orden) al avanzar `d` (+1 o −1); -1 si ya no hay
  // más en esa dirección. Si la actual ya no está en la lista (un filtro la sacó) y se da `orden` (la clave de orden
  // de la actual y la función que la calcula para cada elemento), se sigue desde donde estaba; si no, desde el
  // principio (o el final al retroceder).
  /**
   * @template {{ id: string }} T
   * @param {T[]} lista
   * @param {string | null} actual
   * @param {number} d
   * @param {{ de: (x: T) => number, clave: number | null }} [orden]
   */
  function vecina(lista, actual, d, orden) {
    var i = -1,
      k;
    for (k = 0; k < lista.length; k++)
      if (lista[k].id === actual) {
        i = k;
        break;
      }
    if (i < 0 && orden && orden.clave !== null && orden.clave !== undefined) {
      if (d > 0) {
        for (k = 0; k < lista.length; k++) if (orden.de(lista[k]) > orden.clave) return k;
      } else {
        for (k = lista.length - 1; k >= 0; k--) if (orden.de(lista[k]) < orden.clave) return k;
      }
      return -1;
    }
    var j = i < 0 ? (d > 0 ? 0 : lista.length - 1) : i + d;
    return j >= 0 && j < lista.length ? j : -1;
  }
  // Respondida (sin pregunta: atendida, descartada o sin cierre) y devuelta por el autor desde «Por revisar» (como
  // `reabierta` en exportar.py).
  /** @param {Anotacion} a */
  function reabierta(a) {
    return !!a.revisado && !!(a.respuesta || a.cierre) && a.cierre !== 'pregunta' && a.estado !== 'resuelta';
  }
  // Una entrada anterior de la conversación, como texto (como `linea_hilo` en exportar.py).
  /** @param {NonNullable<Anotacion['hilo']>[number]} h */
  function lineaHilo(h) {
    var detalle = [h.cierre, h.commit, (h.cuando || '').slice(0, 10)].filter(Boolean).join(', ');
    return (
      'Antes, ' +
      (h.de === 'editor' ? 'quien edita' : 'el autor') +
      (detalle ? ' (' + detalle + ')' : '') +
      ': ' +
      (h.texto || '').trim().replace(/\n/g, ' ')
    );
  }
  // Lo que un subrayado propone en lugar de su cita (`sugerencia`, sin espacios en los extremos), o '' si no propone
  // nada: sin propuesta, vacía o igual a la cita (como `propuesta` en exportar.py).
  /** @param {Anotacion | null | undefined} a */
  function propuesta(a) {
    var s = a && a.tipo === 'subrayado' && typeof a.sugerencia === 'string' ? a.sugerencia.trim() : '';
    return s && a && s !== (a.cita || '').trim() ? s : '';
  }
  return {
    propuesta: propuesta,
    porRevisar: porRevisar,
    marcaRevision: marcaRevision,
    vecina: vecina,
    reabierta: reabierta,
    lineaHilo: lineaHilo,
  };
});
