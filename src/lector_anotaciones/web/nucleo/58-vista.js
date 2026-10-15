// Núcleo · el estado de la vista en un solo sitio: qué sección se lee, qué pestaña y qué filtros tiene el panel, qué
// ficha está activa, qué se revisó en esta visita a la bandeja y si las fichas van al margen. Sin DOM.
(function (raiz, crear) {
  var N = (raiz.LANucleo = raiz.LANucleo || {}),
    m = crear(N);
  Object.keys(m).forEach(function (k) {
    N[k] = m[k];
  });
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
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
  function crearVista(inicial) {
    var estado = Object.assign({}, INICIAL, { revisadas: {} }, inicial || {}),
      oyentes = [];
    function cambiar(parche) {
      var p = Object.assign({}, parche),
        cambiadas = [];
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
