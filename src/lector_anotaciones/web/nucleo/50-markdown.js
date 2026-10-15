// Núcleo · Markdown → secciones y bloques. Es el mismo dialecto y la misma salida que `markdown.py` del paquete
// (la paridad se comprueba en tests/test_paridad_js.py): `#`/`##` abren secciones de nivel 1 y 2, `###`/`####` son
// subtítulos, párrafos, listas `- ` y `1. `, tablas `|`, citas `> `, **negrita**, *cursiva*, y los marcadores
// `[FIGURA: archivo | Leyenda]`, `[PORTADA]…[/PORTADA]` y `[LEGAL]…[/LEGAL]`.
//
// `estadoLibro()` es también el armazón con que los importadores de HTML, EPUB y Word van abriendo secciones y
// añadiendo bloques, para que todos los libros salgan con los mismos ids.
(function (raiz, crear) {
  var N = raiz.LANucleo = raiz.LANucleo || {}, m = crear(N);
  Object.keys(m).forEach(function (k) { N[k] = m[k]; });
})(typeof self !== 'undefined' ? self : globalThis, function (N) {
  'use strict';
  var ROMANOS = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
  var ABRE_BLOQUE = /^(#{1,4} |- |\d+\. |\||> |\[FIGURA|\[\/?PORTADA\]|\[\/?LEGAL\])/;
  var FIGURA = /^\[FIGURA:\s*(\S+)\s*\|\s*(.+)\]$/;
  var SEPARADOR_TABLA = /^\|\s*:?-{2,}/;
  var ITEM_NUMERADO = /^(\d+)\. /;
  var NEGRITA = /\*\*([^*]+)\*\*/g;
  // \w de Python sobre texto: letras y números de cualquier escritura, y el guion bajo
  var CURSIVA = /(?<![\p{L}\p{N}_∗])\*([^*\n]+)\*(?![\p{L}\p{N}_])/gu;

  function dos(n) { return n < 10 ? '0' + n : String(n); }
  // Id estable y legible para una sección; se registra en `usados` para evitar duplicados.
  function seccionId(titulo, usados) {
    var m, base;
    if ((m = /^Capítulo (\d+)\./.exec(titulo))) base = 'cap-' + dos(parseInt(m[1], 10));
    else if ((m = /^Interludio (I{1,3})\./.exec(titulo))) base = 'interludio-' + ROMANOS[m[1]];
    else if ((m = /^PARTE (I{1,3}V?|IV)\./.exec(titulo)) && ROMANOS[m[1]]) base = 'parte-' + ROMANOS[m[1]];
    else if ((m = /^Apéndice ([A-Z])\./.exec(titulo))) base = 'ap-' + m[1].toLowerCase();
    else base = N.slug(titulo.split('.')[0]);
    var sid = base, n = 2;
    while (usados[sid]) { sid = base + '-' + n; n++; }
    usados[sid] = true;
    return sid;
  }
  // Escapa HTML y convierte **negrita** y *cursiva*.
  function inline(s) {
    return N.escaparHtml(s).replace(NEGRITA, '<strong>$1</strong>').replace(CURSIVA, '<em>$1</em>');
  }
  // El armazón del libro: las secciones abiertas y la actual. Un bloque antes de toda sección abre «Preliminares».
  function estadoLibro(figs) {
    var st = { figs: figs === undefined ? 'figs/' : figs, usados: {}, secciones: [], sec: null };
    st.nueva = function (titulo, nivel, src) {
      st.sec = { id: seccionId(titulo, st.usados), titulo: titulo, nivel: nivel, src: src, bloques: [] };
      st.secciones.push(st.sec);
      return st.sec;
    };
    st.bloque = function (t, contenido, src) {
      if (!st.sec) st.nueva('Preliminares', 1, src);
      var b = { id: st.sec.id + '-b' + (st.sec.bloques.length + 1), t: t, html: contenido, src: src };
      st.sec.bloques.push(b);
      return b;
    };
    return st;
  }
  function strip(s) { return s.trim(); }
  function leerMarcado(lines, i, cierre) {
    var buf = [];
    i += 1;
    while (i < lines.length && lines[i].indexOf(cierre) !== 0) { if (lines[i].trim()) buf.push(lines[i].trim()); i++; }
    if (i >= lines.length) throw new Error('falta el cierre ' + cierre);
    return [buf, i + 1];
  }
  function empieza(s, p) { return s.slice(0, p.length) === p; }
  function parseLineas(lines, nombre, st) {
    var i = 0, m, r, buf, items, filas;
    while (i < lines.length) {
      var linea = lines[i], src = nombre + ':' + (i + 1);
      if (!linea.trim()) { i++; continue; }
      if (empieza(linea, '[PORTADA]')) {
        r = leerMarcado(lines, i, '[/PORTADA]'); i = r[1];
        st.nueva('Portada', 1, src);
        st.bloque('portada', r[0].map(inline), src);
        continue;
      }
      if (empieza(linea, '[LEGAL]')) {
        r = leerMarcado(lines, i, '[/LEGAL]'); i = r[1];
        st.nueva('Página legal', 1, src);
        r[0].forEach(function (p) { st.bloque('p', inline(p), src); });
        continue;
      }
      if (empieza(linea, '# ')) { st.nueva(strip(linea.slice(2)), 1, src); i++; continue; }
      if (empieza(linea, '## ')) { st.nueva(strip(linea.slice(3)), 2, src); i++; continue; }
      if (empieza(linea, '### ')) { st.bloque('h3', inline(strip(linea.slice(4))), src); i++; continue; }
      if (empieza(linea, '#### ')) { st.bloque('h4', inline(strip(linea.slice(5))), src); i++; continue; }
      if ((m = FIGURA.exec(linea))) {
        st.bloque('figure', { src: st.figs + m[1], caption: inline(m[2].trim()) }, src);
        i++; continue;
      }
      if (empieza(linea, '- ')) {
        items = [];
        while (i < lines.length && empieza(lines[i], '- ')) { items.push(inline(strip(lines[i].slice(2)))); i++; }
        st.bloque('ul', items, src);
        continue;
      }
      if (ITEM_NUMERADO.test(linea)) {
        items = [];
        while (i < lines.length && (m = ITEM_NUMERADO.exec(lines[i]))) { items.push(inline(strip(lines[i].slice(m[0].length)))); i++; }
        st.bloque('ol', items, src);
        continue;
      }
      if (empieza(linea, '|')) {
        filas = [];
        while (i < lines.length && empieza(lines[i], '|')) {
          if (!SEPARADOR_TABLA.test(lines[i])) filas.push(lines[i].trim().replace(/^\|+|\|+$/g, '').split('|').map(function (c) { return inline(c.trim()); }));
          i++;
        }
        st.bloque('table', filas, src);
        continue;
      }
      if (empieza(linea, '> ')) {
        buf = [];
        while (i < lines.length && empieza(lines[i], '> ')) { buf.push(strip(lines[i].slice(2))); i++; }
        st.bloque('quote', inline(buf.join(' ')), src);
        continue;
      }
      // párrafo: líneas consecutivas no vacías que no abren otro bloque
      buf = [linea.trim()];
      i++;
      while (i < lines.length && lines[i].trim() && !ABRE_BLOQUE.test(lines[i])) { buf.push(lines[i].trim()); i++; }
      st.bloque('p', inline(buf.join(' ')), src);
    }
  }
  // Uno o varios Markdown, en orden: [{ nombre, texto }]. Una sección abierta en un archivo sigue recibiendo bloques
  // si el siguiente empieza sin título, como cuando un libro largo se parte en varios archivos.
  function parsearMarkdown(archivos, figs) {
    var st = estadoLibro(figs);
    archivos.forEach(function (a) {
      var texto = String(a.texto).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
      parseLineas(texto.split('\n'), a.nombre, st);
    });
    return st.secciones;
  }
  return { seccionId: seccionId, inline: inline, estadoLibro: estadoLibro, parsearMarkdown: parsearMarkdown };
});
