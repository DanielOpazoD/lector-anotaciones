// Núcleo · armar y validar un libro.json (formato 2), como `construir.py` cuando no hay PDF ni capas: huella de cada
// bloque (SHA-1 del texto que muestra la página, 12 cifras), páginas vacías y los datos del libro. También vuelve a
// escribir un libro como Markdown del dialecto del lector, para seguir trabajándolo con la línea de órdenes.
(function (raiz, crear) {
  var N = raiz.LANucleo = raiz.LANucleo || {}, m = crear(N);
  Object.keys(m).forEach(function (k) { N[k] = m[k]; });
})(typeof self !== 'undefined' ? self : globalThis, function (N) {
  'use strict';
  var FORMATO = 2;

  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var b = unescape(encodeURIComponent(s)), out = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  }
  // SHA-1 sin dependencias (síncrono, igual en el navegador y en Node): la huella no protege nada, sólo identifica.
  function sha1(texto) {
    var bytes = utf8(texto), n = bytes.length, total = ((n + 9 + 63) >> 6) << 6, m = new Uint8Array(total);
    m.set(bytes); m[n] = 0x80;
    var bits = n * 8;
    m[total - 4] = (bits >>> 24) & 255; m[total - 3] = (bits >>> 16) & 255; m[total - 2] = (bits >>> 8) & 255; m[total - 1] = bits & 255;
    m[total - 8] = Math.floor(n / 0x20000000) & 255;  // bits altos de la longitud (libros de más de 512 MB, por si acaso)
    var h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0, w = new Int32Array(80);
    for (var o = 0; o < total; o += 64) {
      for (var i = 0; i < 16; i++) w[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
      for (i = 16; i < 80; i++) { var x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31); }
      var a = h0, b = h1, c = h2, d = h3, e = h4;
      for (i = 0; i < 80; i++) {
        var f, k;
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = b ^ c ^ d; k = 0xca62c1d6; }
        var t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0;
        e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
    }
    return [h0, h1, h2, h3, h4].map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
  }
  // Los trozos de texto con que la página compone el bloque: uno por ítem o celda, o uno solo (`partes_render`).
  function partesRender(b) {
    var h = b.html;
    if (typeof h === 'string') return [N.textoDeHtml(h)];
    if (Array.isArray(h)) {
      var partes = [];
      h.forEach(function (x) { if (Array.isArray(x)) x.forEach(function (c) { partes.push(N.textoDeHtml(c)); }); else partes.push(N.textoDeHtml(x)); });
      return partes;
    }
    if (h && typeof h === 'object') return [N.textoDeHtml(h.caption || '')];
    return [];
  }
  // El texto del bloque tal como lo muestra la página: el sistema de coordenadas de los subrayados.
  function textoRender(b) { return partesRender(b).join(''); }
  function huella(texto) { return sha1(texto).slice(0, 12); }
  function hoyLocal() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  // Secciones ya parseadas (con ids) → libro.json. meta: { titulo, subtitulo, autor, fuentes, generador, generado }.
  function armarLibro(secciones, meta) {
    meta = meta || {};
    secciones.forEach(function (sec) {
      sec.bloques.forEach(function (b) { b.h = huella(textoRender(b)); b.pagina = null; });
      sec.pagina = null;
    });
    var titulo = meta.titulo || (secciones.length ? secciones[0].titulo : 'Libro');
    var nivel2 = secciones.filter(function (s) { return s.nivel === 2; })[0];
    return {
      formato: FORMATO,
      generador: meta.generador || 'lector-anotaciones (página)',
      id: N.slug(titulo),
      titulo: titulo,
      subtitulo: meta.subtitulo || '',
      autor: meta.autor || '',
      generado: meta.generado || hoyLocal(),
      fuentes: meta.fuentes || [],
      paginas_fisicas: null,
      desfase_paginas: 0,
      inicio: nivel2 ? nivel2.id : (secciones.length ? secciones[0].id : null),
      claves_anteriores: [],
      anterior_generado: null,
      cambios: 0,
      capas: {},
      secciones: secciones
    };
  }
  var ID_BLOQUE = /^(.+)-b(\d+)$/;
  var ID_SEGURO = /^[A-Za-z0-9_-]+$/;  // los ids van en selectores, rutas de la base y claves: sin comillas ni barras
  // Las invariantes de las que dependen los subrayados (`validar` de construir.py), más la forma básica que la página
  // necesita para mostrar un libro que llega de fuera: devuelve la lista de problemas.
  function validarLibro(libro) {
    var problemas = [], vistos = {}, ultima = 0;
    if (!libro || typeof libro !== 'object' || !Array.isArray(libro.secciones)) return ['no es un libro.json (falta la lista de secciones)'];
    libro.secciones.forEach(function (sec) {
      if (!sec || typeof sec.id !== 'string' || !Array.isArray(sec.bloques)) { problemas.push('sección sin id o sin bloques'); return; }
      if (!ID_SEGURO.test(sec.id)) problemas.push('id de sección con caracteres no admitidos: ' + sec.id);
      if (vistos[sec.id]) problemas.push('id de sección repetido: ' + sec.id);
      vistos[sec.id] = true;
      sec.bloques.forEach(function (b, i) {
        ['id', 't', 'html', 'src'].forEach(function (k) { if (!(k in b)) problemas.push('bloque sin «' + k + '» en ' + sec.id); });
        if (!('h' in b)) problemas.push('bloque sin «h» en ' + sec.id);
        var m = ID_BLOQUE.exec(b.id || '');
        if (!m || m[1] !== sec.id || parseInt(m[2], 10) !== i + 1) problemas.push('id de bloque fuera de patrón: ' + b.id + ' (esperado ' + sec.id + '-b' + (i + 1) + ')');
        if (vistos[b.id]) problemas.push('id de bloque repetido: ' + b.id);
        vistos[b.id] = true;
        if (!/^.+:\d+$/.test(b.src || '')) problemas.push('src sin línea en ' + b.id + ': ' + b.src);
        var p = b.pagina;
        if (p !== null && p !== undefined) { if (p < ultima) problemas.push('página retrocede en ' + b.id + ': ' + p + ' tras ' + ultima); ultima = Math.max(ultima, p); }
      });
    });
    if (!libro.secciones.length) problemas.push('el libro no tiene secciones');
    return problemas;
  }

  // Un libro que no es el de la página (importado de un archivo, o leído de la base, donde cualquier colaborador puede
  // escribir) se muestra con innerHTML: de su HTML sólo pasan el texto, <strong> y <em>, sin atributos; los signos < y >
  // sueltos quedan escapados. Las imágenes, sólo con ruta relativa o como data:image. Es lo mismo que produce el
  // Markdown, así que un libro legítimo no cambia (ni sus huellas).
  var ETIQUETA = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  function escaparSignos(x) { return x.replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function sanearHtml(h) {
    var s = String(h === null || h === undefined ? '' : h), out = '', i = 0, m;
    ETIQUETA.lastIndex = 0;
    while ((m = ETIQUETA.exec(s))) {
      out += escaparSignos(s.slice(i, m.index));
      var t = m[1].toLowerCase();
      if (t === 'strong' || t === 'em') out += '<' + (m[0][1] === '/' ? '/' : '') + t + '>';
      i = m.index + m[0].length;
    }
    return out + escaparSignos(s.slice(i));
  }
  // ruta relativa a la página (sin esquema, sin barra inicial —que con dos sería otro sitio— y sin barras invertidas, que
  // el navegador toma por barras) o una imagen incrustada
  var IMAGEN_SEGURA = /^(data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+|(?![\/\\])[^:\\]*)$/;
  function sanearLibro(libro) {
    (libro.secciones || []).forEach(function (s) {
      s.titulo = String(s.titulo || '');
      (s.bloques || []).forEach(function (b) {
        // la forma que cada tipo de bloque espera, aunque el archivo traiga otra
        var h = b.html, t = b.t, lista = Array.isArray(h) ? h : [];
        if (t === 'figure') b.html = h && typeof h === 'object' && !Array.isArray(h) ? { src: IMAGEN_SEGURA.test(String(h.src || '')) ? String(h.src || '') : '', caption: sanearHtml(h.caption) } : { src: '', caption: '' };
        else if (t === 'table') b.html = lista.map(function (f) { return Array.isArray(f) ? f.map(sanearHtml) : [sanearHtml(f)]; });
        else if (t === 'ul' || t === 'ol' || t === 'portada') b.html = lista.map(function (x) { return sanearHtml(Array.isArray(x) ? x.join(' ') : x); });
        else b.html = typeof h === 'string' ? sanearHtml(h) : '';
      });
    });
    return libro;
  }
  // HTML del lector (sólo <strong>, <em> y texto escapado) → Markdown en línea.
  function mdEnLinea(h) {
    return N.textoDeHtml(String(h || '').replace(/<\/?strong>/g, '**').replace(/<\/?em>/g, '*').replace(/<br\s*\/?>/g, ' '));
  }
  // El libro como Markdown del dialecto del lector: lo que `lector-anotaciones construir` vuelve a leer.
  function libroAMarkdown(libro) {
    var out = [];
    libro.secciones.forEach(function (s) {
      if (s.titulo === 'Portada' && s.bloques.length === 1 && s.bloques[0].t === 'portada') {
        out.push('[PORTADA]'); s.bloques[0].html.forEach(function (l) { out.push(mdEnLinea(l)); }); out.push('[/PORTADA]', ''); return;
      }
      out.push((s.nivel === 1 ? '# ' : '## ') + s.titulo, '');
      s.bloques.forEach(function (b) {
        var h = b.html;
        if (b.t === 'h3') out.push('### ' + mdEnLinea(h));
        else if (b.t === 'h4') out.push('#### ' + mdEnLinea(h));
        else if (b.t === 'ul') h.forEach(function (x) { out.push('- ' + mdEnLinea(x)); });
        else if (b.t === 'ol') h.forEach(function (x, i) { out.push((i + 1) + '. ' + mdEnLinea(x)); });
        else if (b.t === 'quote') out.push('> ' + mdEnLinea(h));
        else if (b.t === 'table') h.forEach(function (fila, i) { out.push('| ' + fila.map(mdEnLinea).join(' | ') + ' |'); if (i === 0) out.push('|' + fila.map(function () { return ' --- '; }).join('|') + '|'); });
        else if (b.t === 'figure') out.push('[FIGURA: ' + (/^data:/.test(h.src || '') || !h.src ? 'figura' : String(h.src).replace(/^.*\//, '')) + ' | ' + (mdEnLinea(h.caption) || 'Figura') + ']');
        else if (b.t === 'portada') h.forEach(function (l) { out.push(mdEnLinea(l)); });
        else out.push(mdEnLinea(h));
        out.push('');
      });
    });
    return out.join('\n');
  }
  return { sanearHtml: sanearHtml, sanearLibro: sanearLibro, sha1: sha1, partesRender: partesRender, textoRender: textoRender, huella: huella, armarLibro: armarLibro, validarLibro: validarLibro, libroAMarkdown: libroAMarkdown };
});
