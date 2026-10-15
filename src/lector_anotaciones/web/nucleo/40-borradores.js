// Núcleo · borradores que la base todavía no tiene: qué campos cambió el lector y cómo se funden. Sin DOM.
(function (raiz, crear) {
  var N = raiz.LANucleo = raiz.LANucleo || {}, m = crear(N);
  Object.keys(m).forEach(function (k) { N[k] = m[k]; });
})(typeof self !== 'undefined' ? self : globalThis, function (N) {
  'use strict';
  // Lo que el lector edita en la página; el resto (respuesta, cierre, commit…) lo escribe quien edita las fuentes.
  var CAMPOS_LECTOR = ['nota', 'replica', 'color', 'estado', 'revisado'];
  // Suma a `marcas` (objeto campo → true) los campos del lector que difieren entre `antes` y `despues`.
  function marcarCampos(marcas, antes, despues) {
    CAMPOS_LECTOR.forEach(function (k) { if (antes[k] !== despues[k]) marcas[k] = true; });
    return marcas;
  }
  // Un borrador que no subió aporta sólo los campos que el lector cambió (si no se sabe cuáles, la nota y la
  // réplica); respuesta, cierre y demás los manda la base, para que recuperar el borrador no borre lo que otra
  // sesión escribió entre tanto.
  function fundirBorrador(deBase, borrador, campos) {
    var r = Object.assign({}, deBase), lista = campos && Object.keys(campos).length ? Object.keys(campos) : ['nota', 'replica'];
    lista.forEach(function (c) { if (borrador[c] !== undefined && borrador[c] !== deBase[c]) r[c] = borrador[c]; });
    r.editado = borrador.editado || r.editado;
    return r;
  }
  return { CAMPOS_LECTOR: CAMPOS_LECTOR, marcarCampos: marcarCampos, fundirBorrador: fundirBorrador };
});
