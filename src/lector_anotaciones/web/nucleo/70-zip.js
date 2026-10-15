// Núcleo · lectura de archivos ZIP (EPUB y Word son ZIP). Sin dependencias: se lee el directorio central y cada
// entrada se descomprime con la función `inflar(bytes) → Promise<Uint8Array>` que se le pase (en el navegador,
// DecompressionStream('deflate-raw'); en Node, zlib). Admite entradas guardadas (método 0) y comprimidas (método 8).
(function (raiz, crear) {
  var N = raiz.LANucleo = raiz.LANucleo || {}, m = crear(N);
  Object.keys(m).forEach(function (k) { N[k] = m[k]; });
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  var FIN_DIRECTORIO = 0x06054b50, ENTRADA_CENTRAL = 0x02014b50, CABECERA_LOCAL = 0x04034b50;
  function u16(b, i) { return b[i] | (b[i + 1] << 8); }
  function u32(b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; }
  function decodificar(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }
  function inflarNavegador(datos) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('este navegador no descomprime ZIP (falta DecompressionStream)'));
    var flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(flujo).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  // bytes: Uint8Array con el ZIP entero. Devuelve { nombres, tiene(n), bytes(n), texto(n) }; lanza si no es un ZIP.
  function abrirZip(bytes, inflar) {
    inflar = inflar || inflarNavegador;
    var fin = -1;
    for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) { if (u32(bytes, i) === FIN_DIRECTORIO) { fin = i; break; } }
    if (fin < 0) throw new Error('no es un archivo ZIP (EPUB y Word lo son)');
    var total = u16(bytes, fin + 10), p = u32(bytes, fin + 16), entradas = {}, nombres = [];
    for (var n = 0; n < total; n++) {
      if (u32(bytes, p) !== ENTRADA_CENTRAL) throw new Error('directorio del ZIP dañado');
      var metodo = u16(bytes, p + 10), comprimido = u32(bytes, p + 20), largoNombre = u16(bytes, p + 28);
      var largoExtra = u16(bytes, p + 30), largoComentario = u16(bytes, p + 32), local = u32(bytes, p + 42);
      var nombre = decodificar(bytes.subarray(p + 46, p + 46 + largoNombre));
      entradas[nombre] = { metodo: metodo, comprimido: comprimido, local: local };
      nombres.push(nombre);
      p += 46 + largoNombre + largoExtra + largoComentario;
    }
    function leer(nombre) {
      var e = entradas[nombre];
      if (!e) return Promise.reject(new Error('falta ' + nombre + ' dentro del archivo'));
      if (u32(bytes, e.local) !== CABECERA_LOCAL) return Promise.reject(new Error('entrada dañada: ' + nombre));
      var ini = e.local + 30 + u16(bytes, e.local + 26) + u16(bytes, e.local + 28), datos = bytes.subarray(ini, ini + e.comprimido);
      if (e.metodo === 0) return Promise.resolve(datos);
      if (e.metodo === 8) return Promise.resolve(inflar(datos));
      return Promise.reject(new Error('compresión no admitida (método ' + e.metodo + ') en ' + nombre));
    }
    return {
      nombres: nombres,
      tiene: function (nombre) { return !!entradas[nombre]; },
      bytes: leer,
      texto: function (nombre) { return leer(nombre).then(decodificar); }
    };
  }
  return { abrirZip: abrirZip, decodificarUtf8: decodificar };
});
