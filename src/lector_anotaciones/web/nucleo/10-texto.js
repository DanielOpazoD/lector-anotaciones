// Núcleo · texto: normalización, identificadores y comparación de objetos. Sin DOM.
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
  // Minúsculas y sin diacríticos: la forma con que se busca en el libro y en las notas.
  /** @param {unknown} s */
  function normalizar(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }
  // Igual que `util.slug` del paquete Python: ASCII en minúsculas separado por guiones, nunca vacío.
  /**
   * @param {unknown} s
   * @param {number} [maximo]
   */
  function slug(s, maximo) {
    maximo = maximo || 40;
    var t = String(s || '')
      .normalize('NFKD')
      .replace(/[^\x00-\x7f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    t = t.slice(0, maximo).replace(/-+$/, '');
    return t || 's';
  }
  /** @type {Record<string, string>} */
  var ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  // El texto de un fragmento HTML generado por el lector (etiquetas fuera, entidades resueltas), como
  // `html.unescape(texto_plano(...))` en Python: es el sistema de coordenadas de subrayados y capas.
  /** @param {unknown} h */
  function textoDeHtml(h) {
    return String(h || '')
      .replace(/<[^>]+>/g, '')
      .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (todo, e) {
        if (e[0] === '#') {
          var n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : todo;
        }
        return Object.prototype.hasOwnProperty.call(ENTIDADES, e.toLowerCase()) ? ENTIDADES[e.toLowerCase()] : todo;
      });
  }
  // Un campo como texto para mostrarlo, sea lo que sea lo que trae (un documento de la base lo escribió cualquiera):
  // nunca lanza. null o ausente: ''.
  /** @param {unknown} x */
  function comoTexto(x) {
    if (typeof x === 'string') return x;
    if (x === null || x === undefined) return '';
    if (typeof x === 'number' || typeof x === 'boolean') return String(x);
    try {
      return JSON.stringify(x) || '';
    } catch (e) {
      return '';
    }
  }
  /** @param {unknown} s */
  function escaparHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // Una copia con las claves en orden (sólo el primer nivel), para comparar objetos por su JSON.
  /** @param {any} o cualquier valor; sólo los objetos se copian */
  function ordenado(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return o;
    /** @type {Record<string, unknown>} */
    var r = {};
    Object.keys(o)
      .sort()
      .forEach(function (k) {
        r[k] = o[k];
      });
    return r;
  }
  /**
   * @param {unknown} a
   * @param {unknown} b
   */
  function igual(a, b) {
    return JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b));
  }
  // Las #etiquetas de la nota y la réplica, en minúsculas y sin repetir.
  /** @param {Anotacion | null | undefined} a */
  function etiquetasDe(a) {
    var out = [],
      re = /#([\p{L}\d_-]{2,})/gu,
      m,
      txt = ((a && a.nota) || '') + ' ' + ((a && a.replica) || '');
    while ((m = re.exec(txt))) {
      var t = m[1].toLowerCase();
      if (out.indexOf(t) < 0) out.push(t);
    }
    return out;
  }
  return {
    normalizar: normalizar,
    slug: slug,
    textoDeHtml: textoDeHtml,
    comoTexto: comoTexto,
    escaparHtml: escaparHtml,
    ordenado: ordenado,
    igual: igual,
    etiquetasDe: etiquetasDe,
  };
});
