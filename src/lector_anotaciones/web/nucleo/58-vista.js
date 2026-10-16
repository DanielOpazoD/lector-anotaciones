// Núcleo · el estado de la vista en un solo sitio: qué sección se lee, qué pestaña y qué filtros tiene el panel, qué
// ficha está activa, qué se revisó en esta visita a la bandeja y si las fichas van al margen. Sin DOM.
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
  /**
   * Quien escucha cambios de la vista (`alCambiar`).
   * @typedef {object} OyenteVista
   * @property {(keyof EstadoVista)[] | null} claves las que le interesan (null: todas)
   * @property {(cambiadas: string[], estado: EstadoVista) => void} fn a quién avisar
   */

  /** @type {EstadoVista} */
  var INICIAL = {
    secActual: null,
    tab: 'capitulo',
    filtro: 'todas',
    filtroAutor: '',
    filtroEtiqueta: '',
    fichaFoco: null,
    revisadas: {}, // ids revisados en esta visita a «Por revisar»: siguen a la vista, marcados, hasta salir de la pestaña
    margen: true,
  };
  // `estado` es el objeto vivo (se lee directamente, nunca se escribe); `cambiar(parche)` es la única forma de cambiarlo:
  // aplica las reglas, avisa a quien escucha esas claves y devuelve las que cambiaron.
  /**
   * @param {Partial<EstadoVista>} [inicial]
   * @returns {Vista}
   */
  function crearVista(inicial) {
    // `cambiar` lo lee y escribe también por nombre de clave, ya comprobada contra INICIAL
    var estado = /** @type {EstadoVista & Record<string, unknown>} */ (
        Object.assign({}, INICIAL, { revisadas: {} }, inicial || {})
      ),
      oyentes = /** @type {OyenteVista[]} */ ([]);
    /**
     * @param {Partial<EstadoVista>} parche
     * @returns {string[]}
     */
    function cambiar(parche) {
      var p = /** @type {Record<string, unknown>} */ (Object.assign({}, parche)),
        cambiadas = /** @type {string[]} */ ([]);
      // regla: al salir de «Por revisar», lo revisado en esta visita deja la bandeja (sea cual sea el camino de salida)
      if ('tab' in p && estado.tab === 'revisar' && p.tab !== 'revisar' && !('revisadas' in p)) p.revisadas = {};
      Object.keys(p).forEach(function (k) {
        if (!(k in INICIAL)) throw new Error('vista: clave desconocida ' + k);
        if (estado[k] !== p[k]) {
          estado[k] = p[k];
          cambiadas.push(k);
        }
      });
      if (cambiadas.length)
        oyentes.slice().forEach(function (o) {
          if (
            !o.claves ||
            o.claves.some(function (c) {
              return cambiadas.indexOf(c) >= 0;
            })
          )
            o.fn(cambiadas, estado);
        });
      return cambiadas;
    }
    return {
      estado: estado,
      cambiar: cambiar,
      // `claves`: lista de claves que interesan (null: todas). Devuelve una función que deja de escuchar.
      alCambiar: function (claves, fn) {
        var o = { claves: claves, fn: fn };
        oyentes.push(o);
        return function () {
          var i = oyentes.indexOf(o);
          if (i >= 0) oyentes.splice(i, 1);
        };
      },
      quitarFiltros: function () {
        return cambiar({ filtro: 'todas', filtroAutor: '', filtroEtiqueta: '' });
      },
      revisada: function (id) {
        if (estado.revisadas[id]) return false;
        var r = Object.assign({}, estado.revisadas);
        r[id] = 1;
        return cambiar({ revisadas: r }).length > 0;
      },
    };
  }
  return { crearVista: crearVista };
});
