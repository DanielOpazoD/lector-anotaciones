// Núcleo · borradores que la base todavía no tiene: qué campos cambió el lector y cómo se funden. Sin DOM.
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
  // Lo que el lector edita en la página; el resto (respuesta, cierre, commit…) lo escribe quien edita las fuentes.
  /** @type {(keyof Anotacion)[]} */
  var CAMPOS_LECTOR = ['nota', 'replica', 'sugerencia', 'color', 'estado', 'revisado'];
  // Suma a `marcas` (objeto campo → true) los campos del lector que difieren entre `antes` y `despues`.
  /**
   * @param {Record<string, boolean>} marcas
   * @param {Anotacion} antes
   * @param {Anotacion} despues
   */
  function marcarCampos(marcas, antes, despues) {
    CAMPOS_LECTOR.forEach(function (k) {
      if (antes[k] !== despues[k]) marcas[k] = true;
    });
    return marcas;
  }
  // Un borrador que no subió aporta sólo los campos que el lector cambió (si no se sabe cuáles, la nota y la
  // réplica); respuesta, cierre y demás los manda la base, para que recuperar el borrador no borre lo que otra
  // sesión escribió entre tanto.
  /**
   * @param {Anotacion} deBase
   * @param {Anotacion} borrador
   * @param {Record<string, boolean> | null} [campos]
   * @returns {Anotacion}
   */
  function fundirBorrador(deBase, borrador, campos) {
    var r = Object.assign({}, deBase),
      lista = /** @type {(keyof Anotacion)[]} */ (
        campos && Object.keys(campos).length ? Object.keys(campos) : ['nota', 'replica']
      );
    lista.forEach(function (c) {
      if (borrador[c] !== undefined && borrador[c] !== deBase[c]) copiarCampo(r, borrador, c);
    });
    r.editado = borrador.editado || r.editado;
    return r;
  }
  // Un campo de una anotación a otra, por su nombre (genérica para que TypeScript sepa que es el mismo campo).
  /**
   * @template {keyof Anotacion} K
   * @param {Anotacion} destino
   * @param {Anotacion} origen
   * @param {K} k
   */
  function copiarCampo(destino, origen, k) {
    destino[k] = origen[k];
  }
  // Lo que le falta a un documento de fuera (la base la escribe cualquier colaborador) para ser una anotación que la
  // página pueda mostrar sin romperse, según esquemas/anotacion.schema.json; null si no le falta nada. No juzga el
  // contenido: sólo la forma de lo que la página lee.
  var TEXTOS = ['nota', 'sugerencia', 'respuesta', 'replica', 'cita', 'antes', 'despues', 'commit', 'respondido'];
  var TEXTOS_MAS = ['revisado', 'creado', 'editado', 'src', 'grupo', 'bh', 'color', 'estado', 'cierre'];
  /**
   * @param {any} a
   * @returns {string | null}
   */
  function problemaDeAnotacion(a) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) return 'no es un objeto';
    if (['subrayado', 'pagina', 'capitulo', 'general'].indexOf(a.tipo) < 0) return 'tipo desconocido: ' + a.tipo;
    var mal = TEXTOS.concat(TEXTOS_MAS).filter(function (k) {
      return a[k] !== undefined && a[k] !== null && typeof a[k] !== 'string';
    });
    if (mal.length) return 'no es texto: ' + mal.join(', ');
    if (
      ['sid', 'sidTitulo', 'autor', 'libro'].some(function (k) {
        return a[k] !== undefined && a[k] !== null && typeof a[k] !== 'string';
      })
    )
      return 'sección, autor o libro que no es texto';
    /** @param {any} h */
    var entradaValida = function (h) {
      return h && typeof h === 'object' && typeof h.texto === 'string';
    };
    if (a.hilo !== undefined && !(Array.isArray(a.hilo) && a.hilo.every(entradaValida)))
      return 'conversación anterior mal formada';
    if (a.tipo === 'subrayado') {
      if (typeof a.pid !== 'string' || typeof a.cita !== 'string') return 'subrayado sin pasaje o sin cita';
      if (!Number.isInteger(a.inicio) || !Number.isInteger(a.fin)) return 'subrayado sin inicio o fin';
    }
    if (a.tipo === 'pagina' && a.pagina !== null && !Number.isInteger(a.pagina)) return 'nota de página sin página';
    return null;
  }
  return {
    problemaDeAnotacion: problemaDeAnotacion,
    CAMPOS_LECTOR: CAMPOS_LECTOR,
    marcarCampos: marcarCampos,
    fundirBorrador: fundirBorrador,
  };
});
