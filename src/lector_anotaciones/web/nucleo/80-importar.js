// Núcleo · importar un libro desde archivos: Markdown o texto, HTML, EPUB, Word (.docx) o un libro.json del lector.
//
// Todo termina en las mismas secciones y bloques que produce el Markdown (estadoLibro) y se arma con armarLibro, así
// que un libro importado se anota igual que uno construido con la línea de órdenes. Del HTML de afuera sólo se
// conserva el texto, la negrita y la cursiva: nada del archivo se inserta como HTML en la página. Las figuras de EPUB
// y Word entran como imágenes data: si caben (por imagen y en total); si no, queda su leyenda.
//
// Necesita un analizador de XML/HTML: `opciones.parsear(texto, tipo) → Document` (DOMParser en el navegador).
(function (raiz, crear) {
  var N = raiz.LANucleo = raiz.LANucleo || {}, m = crear(N);
  Object.keys(m).forEach(function (k) { N[k] = m[k]; });
})(typeof self !== 'undefined' ? self : globalThis, function (N) {
  'use strict';
  var IMAGEN_MAX = 300 * 1024, IMAGENES_MAX = 4 * 1024 * 1024;
  var TIPOS_IMAGEN = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };

  function extension(nombre) { var m = /\.([a-z0-9]+)$/i.exec(nombre || ''); return m ? m[1].toLowerCase() : ''; }
  function hijos(n) { return Array.prototype.slice.call(n.childNodes || []); }
  function local(n) { return (n.localName || n.nodeName || '').toLowerCase(); }
  function espacios(s) { return s.replace(/\s+/g, ' ').trim(); }
  function envolver(tag, s) { return s.trim() ? '<' + tag + '>' + s + '</' + tag + '>' : s; }
  function base64(bytes) {
    var s = '', i;
    for (i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
  }
  // Texto de un archivo: UTF-8 (o UTF-16 con su marca); si no lo es, el juego de caracteres que declare un HTML o, en
  // su defecto, windows-1252 (lo que guardan el Bloc de notas «ANSI» y Word como página web), con un aviso.
  function decodificarTexto(bytes, nombre, avisos) {
    var dec = function (cs, fatal) { return new TextDecoder(cs, fatal ? { fatal: true } : undefined).decode(bytes); };
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return dec('utf-16le');
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return dec('utf-16be');
    try { return dec('utf-8', true); } catch (e) { /* no es UTF-8 */ }
    var cab = '', i, cs = 'windows-1252';
    for (i = 0; i < Math.min(bytes.length, 4096); i++) cab += String.fromCharCode(bytes[i]);
    var m = /<meta[^>]+charset\s*=\s*["']?([\w:.-]+)/i.exec(cab) || /<\?xml[^>]+encoding\s*=\s*["']([\w:.-]+)/i.exec(cab);
    if (m && !/^utf-?8$/i.test(m[1])) cs = m[1];
    var texto;
    try { texto = dec(cs); } catch (e) { cs = 'windows-1252'; texto = dec(cs); }
    avisos.push(nombre + ' no está en UTF-8: se leyó como ' + cs + '.');
    return texto;
  }
  function textoLibre(n) { return espacios(n ? (n.textContent || '') : ''); }
  // Rutas dentro de un ZIP: relativa a la carpeta de `desde`, sin «..» ni fragmento.
  function resolver(desde, href) {
    href = String(href || '').split('#')[0];
    try { href = decodeURIComponent(href); } catch (e) { /* se usa tal cual */ }
    if (!href) return '';
    var partes = desde.split('/').slice(0, -1);
    href.split('/').forEach(function (p) { if (p === '..') partes.pop(); else if (p && p !== '.') partes.push(p); });
    return partes.join('/');
  }
  // Imágenes: se piden durante el recorrido y se resuelven al final, respetando los topes; la huella de una figura sólo
  // depende de su leyenda, así que poner la imagen después no cambia nada.
  function colaImagenes(leer, avisos) {
    var pendientes = [];
    return {
      enTexto: 0,  // imágenes metidas entre el texto de un párrafo, que no se pueden mostrar como figura
      pedir: function (b, ruta) { b.html.src = ''; if (ruta) pendientes.push({ b: b, ruta: ruta }); },
      resolver: function () {
        var yo = this, total = 0, omitidas = 0;
        return pendientes.reduce(function (p, x) {
          return p.then(function () {
            var tipo = TIPOS_IMAGEN[extension(x.ruta)];
            if (!tipo) { omitidas++; return; }
            return leer(x.ruta).then(function (bytes) {
              if (!bytes || bytes.length > IMAGEN_MAX || total + bytes.length > IMAGENES_MAX) { omitidas++; return; }
              total += bytes.length;
              x.b.html.src = 'data:' + tipo + ';base64,' + base64(bytes);
            }, function () { omitidas++; });
          });
        }, Promise.resolve()).then(function () {
          if (yo.enTexto) avisos.push(yo.enTexto + (yo.enTexto === 1 ? ' imagen dentro del texto de un párrafo se omitió.' : ' imágenes dentro del texto de un párrafo se omitieron.'));
          if (omitidas) avisos.push(omitidas + (omitidas === 1 ? ' figura quedó' : ' figuras quedaron') + ' sólo con su leyenda (imagen ausente, de formato no admitido o demasiado grande).');
        });
      }
    };
  }
  // Niveles de título en uso → qué es sección (nivel 1 o 2) y qué subtítulo (h3, h4). Con un solo nivel, cada título
  // es una sección de nivel 2 (capítulos sin partes).
  function mapaNiveles(usados) {
    var l = Object.keys(usados).map(Number).sort(function (a, b) { return a - b; }), m = {};
    if (l.length === 1) { m[l[0]] = { sec: 2 }; return m; }
    l.forEach(function (n, i) { m[n] = i === 0 ? { sec: 1 } : i === 1 ? { sec: 2 } : { t: i === 2 ? 'h3' : 'h4' }; });
    return m;
  }

  // ------------------------------------------------------------------ HTML (archivos sueltos y capítulos de EPUB)
  var EN_LINEA = /^(a|abbr|b|bdi|bdo|cite|code|data|dfn|em|font|i|kbd|mark|q|s|samp|small|span|strike|strong|sub|sup|time|tt|u|var|wbr|br|img|ins|del|label|ruby|rt|rp)$/;
  var OMITIR = /^(script|style|noscript|template|head|title|meta|link|svg|math|iframe|object|button|input|select|textarea|hr|nav)$/;
  function enLinea(n) {
    if (n.nodeType === 3 || n.nodeType === 4) return N.escaparHtml(n.nodeValue);
    if (n.nodeType !== 1) return '';
    var t = local(n);
    if (t === 'br' || t === 'wbr') return ' ';
    if (t === 'img' || t === 'del' || t === 'rt' || t === 'rp' || OMITIR.test(t)) return '';
    var dentro = hijos(n).map(enLinea).join('');
    if (t === 'strong' || t === 'b') return envolver('strong', dentro);
    if (t === 'em' || t === 'i' || t === 'cite' || t === 'dfn' || t === 'var') return envolver('em', dentro);
    // un bloque dentro de una celda, un ítem o un título (párrafos, listas anidadas, HTML sin saltos de línea) no
    // pega su texto al vecino
    return EN_LINEA.test(t) ? dentro : ' ' + dentro + ' ';
  }
  function htmlEnLinea(n) { return espacios(hijos(n).map(enLinea).join('')); }
  function textoEnLinea(n) { return espacios(N.textoDeHtml(htmlEnLinea(n))); }
  // las filas de una tabla, sin las de las tablas anidadas en sus celdas (que ya van en el texto de la celda)
  function filasHtml(tabla) {
    var filas = [];
    hijos(tabla).forEach(function (x) { if (x.nodeType !== 1) return; var t = local(x); if (t === 'tr') filas.push(x); else if (t === 'thead' || t === 'tbody' || t === 'tfoot') hijos(x).forEach(function (y) { if (y.nodeType === 1 && local(y) === 'tr') filas.push(y); }); });
    return filas;
  }
  function nivelTitulo(n) { var m = /^h([1-6])$/.exec(local(n)); return m && textoLibre(n) ? parseInt(m[1], 10) : 0; }
  function nivelesHtml(doc, usados) {
    ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(function (h, i) { var ns = doc.getElementsByTagName(h); for (var k = 0; k < ns.length; k++) if (textoLibre(ns[k])) { usados[i + 1] = 1; break; } });
  }
  // Recorre el cuerpo de un documento HTML y agrega sus bloques al libro. `ctx`: { st, niveles, nombre, imagenes,
  // rutaImagen(src) → ruta en el ZIP o null }.
  function bloquesHtml(cuerpo, ctx) {
    var st = ctx.st, orden = 0;
    var src = function () { orden++; return ctx.nombre + ':' + orden; };
    var parrafo = function (h) { h = espacios(h); if (N.textoDeHtml(h).trim()) st.bloque('p', h, src()); };
    var figura = function (img, leyenda) {
      var b = st.bloque('figure', { src: '', caption: leyenda || N.escaparHtml(espacios(img.getAttribute('alt') || img.getAttribute('title') || '')) || 'Figura' }, src());
      ctx.imagenes.pedir(b, ctx.rutaImagen(img.getAttribute('src') || img.getAttribute('xlink:href') || ''));
    };
    function contenedor(nodo) {
      var pendiente = '';
      var soltar = function () { if (pendiente) { parrafo(pendiente); pendiente = ''; } };
      hijos(nodo).forEach(function (n) {
        if (n.nodeType === 3 || n.nodeType === 4) { pendiente += N.escaparHtml(n.nodeValue); return; }
        if (n.nodeType !== 1) return;
        var t = local(n);
        if (OMITIR.test(t)) return;
        if (t === 'img') { soltar(); figura(n, ''); return; }
        if (EN_LINEA.test(t)) {
          // una imagen dentro de un enlace o un span: sola, es una figura; entre texto, se omite y se avisa
          var dentroImgs = n.getElementsByTagName ? n.getElementsByTagName('img') : [];
          if (dentroImgs.length && !textoLibre(n)) { soltar(); for (var q = 0; q < dentroImgs.length; q++) figura(dentroImgs[q], ''); return; }
          ctx.imagenes.enTexto += dentroImgs.length;
          pendiente += enLinea(n); return;
        }
        soltar();
        var nv = nivelTitulo(n);
        if (nv) {
          var dest = ctx.niveles[nv] || { t: 'h4' };
          if (dest.sec) st.nueva(textoEnLinea(n), dest.sec, src());
          else st.bloque(dest.t, htmlEnLinea(n), src());
          return;
        }
        if (t === 'p' || t === 'dt' || t === 'dd' || t === 'caption' || t === 'address') {
          var imgs = n.getElementsByTagName('img');
          if (imgs.length && !textoLibre(n)) { for (var k = 0; k < imgs.length; k++) figura(imgs[k], ''); return; }
          ctx.imagenes.enTexto += imgs.length;
          parrafo(htmlEnLinea(n)); return;
        }
        if (t === 'pre') { parrafo(N.escaparHtml(n.textContent || '')); return; }
        if (t === 'ul' || t === 'ol') {
          var items = hijos(n).filter(function (x) { return x.nodeType === 1 && local(x) === 'li'; }).map(htmlEnLinea).filter(function (h) { return N.textoDeHtml(h).trim(); });
          if (items.length) st.bloque(t, items, src());
          return;
        }
        if (t === 'blockquote') {
          var q = espacios(hijos(n).map(function (x) { return x.nodeType === 1 && !EN_LINEA.test(local(x)) ? ' ' + htmlEnLinea(x) + ' ' : enLinea(x); }).join(''));
          if (N.textoDeHtml(q).trim()) st.bloque('quote', q, src());
          return;
        }
        if (t === 'table') {
          var filas = [], trs = filasHtml(n);
          for (var r = 0; r < trs.length; r++) {
            var celdas = hijos(trs[r]).filter(function (x) { return x.nodeType === 1 && (local(x) === 'td' || local(x) === 'th'); }).map(htmlEnLinea);
            if (celdas.length) filas.push(celdas);
          }
          if (filas.length) st.bloque('table', filas, src());
          return;
        }
        if (t === 'figure') {
          var img = n.getElementsByTagName('img')[0], cap = n.getElementsByTagName('figcaption')[0];
          if (img) { figura(img, cap ? htmlEnLinea(cap) : ''); return; }
          contenedor(n); return;
        }
        if (t === 'li') { parrafo(htmlEnLinea(n)); return; }
        contenedor(n);  // div, section, article, body…
      });
      soltar();
    }
    contenedor(cuerpo);
  }
  function documentoHtml(texto, parsear, xhtml) {
    var doc = null;
    if (xhtml) { doc = parsear(texto, 'application/xhtml+xml'); if (doc.getElementsByTagName('parsererror').length) doc = null; }
    return doc || parsear(texto, 'text/html');
  }
  function cuerpoDe(doc) { return doc.getElementsByTagName('body')[0] || doc.documentElement; }

  function importarHtml(archivos, opciones) {
    var avisos = [], st = N.estadoLibro(''), usados = {}, docs = archivos.map(function (a) { var d = documentoHtml(decodificarTexto(a.bytes, a.nombre, avisos), opciones.parsear, extension(a.nombre) === 'xhtml'); nivelesHtml(d, usados); return { nombre: a.nombre, doc: d }; });
    var niveles = mapaNiveles(usados), imagenes = colaImagenes(function () { return Promise.reject(new Error('sin imágenes')); }, avisos);
    docs.forEach(function (x) { bloquesHtml(cuerpoDe(x.doc), { st: st, niveles: niveles, nombre: x.nombre, imagenes: imagenes, rutaImagen: function () { return null; } }); });
    var primero = docs[0] && docs[0].doc, t = primero && primero.getElementsByTagName('title')[0];
    var autor = primero && primero.querySelector ? primero.querySelector('meta[name="author"]') : null;
    return imagenes.resolver().then(function () {
      return { secciones: st.secciones, meta: { titulo: t ? textoLibre(t) : '', autor: autor ? autor.getAttribute('content') || '' : '' }, avisos: avisos };
    });
  }

  // ------------------------------------------------------------------ EPUB
  function primeroNS(doc, nombre) {
    var ns = doc.getElementsByTagNameNS ? doc.getElementsByTagNameNS('*', nombre) : [];
    return ns.length ? ns[0] : doc.getElementsByTagName(nombre)[0] || null;
  }
  function todosNS(doc, nombre) {
    var ns = doc.getElementsByTagNameNS ? doc.getElementsByTagNameNS('*', nombre) : [];
    return Array.prototype.slice.call(ns.length ? ns : doc.getElementsByTagName(nombre));
  }
  function importarEpub(archivo, opciones) {
    var avisos = [], zip = N.abrirZip(archivo.bytes, opciones.inflar), xml = function (t) { return opciones.parsear(t, 'application/xml'); };
    return zip.texto('META-INF/container.xml').then(function (c) {
      var rf = primeroNS(xml(c), 'rootfile'), opf = rf && rf.getAttribute('full-path');
      if (!opf) throw new Error('EPUB sin rootfile en META-INF/container.xml');
      return zip.texto(opf).then(function (t) { return { ruta: opf, doc: xml(t) }; });
    }).then(function (opf) {
      var manifiesto = {}, porRuta = {};
      todosNS(opf.doc, 'item').forEach(function (it) {
        var x = { id: it.getAttribute('id'), ruta: resolver(opf.ruta, it.getAttribute('href')), tipo: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' };
        manifiesto[x.id] = x; porRuta[x.ruta] = x;
      });
      var spine = primeroNS(opf.doc, 'spine'), orden = todosNS(opf.doc, 'itemref').filter(function (r) { return r.getAttribute('linear') !== 'no'; })
        .map(function (r) { return manifiesto[r.getAttribute('idref')]; }).filter(function (x) { return x && /html|xml/.test(x.tipo); });
      if (!orden.length) throw new Error('EPUB sin capítulos en el orden de lectura (spine)');
      var meta = { titulo: textoLibre(primeroNS(opf.doc, 'title')), autor: textoLibre(primeroNS(opf.doc, 'creator')) };
      // títulos del índice del EPUB, para los capítulos que no traen encabezado propio
      var etiquetas = {}, nav = Object.keys(manifiesto).map(function (k) { return manifiesto[k]; }).filter(function (x) { return /\bnav\b/.test(x.props); })[0];
      var ncx = (spine && manifiesto[spine.getAttribute('toc')]) || Object.keys(manifiesto).map(function (k) { return manifiesto[k]; }).filter(function (x) { return x.tipo === 'application/x-dtbncx+xml'; })[0];
      var indice = nav ? zip.texto(nav.ruta).then(function (t) {
        var d = documentoHtml(t, opciones.parsear, true);
        todosNS(d, 'a').forEach(function (a) { var r = resolver(nav.ruta, a.getAttribute('href')); if (r && !etiquetas[r]) etiquetas[r] = textoLibre(a); });
      }, function () {}) : ncx ? zip.texto(ncx.ruta).then(function (t) {
        todosNS(xml(t), 'navPoint').forEach(function (p) {
          var c = primeroNS(p, 'content'), l = primeroNS(p, 'text'), r = c ? resolver(ncx.ruta, c.getAttribute('src')) : '';
          if (r && !etiquetas[r] && l) etiquetas[r] = textoLibre(l);
        });
      }, function () {}) : Promise.resolve();
      return indice.then(function () {
        return Promise.all(orden.map(function (x) { return zip.texto(x.ruta).then(function (t) { return { x: x, doc: documentoHtml(t, opciones.parsear, true) }; }); }));
      }).then(function (docs) {
        var st = N.estadoLibro(''), usados = {};
        docs.forEach(function (d) { nivelesHtml(d.doc, usados); });
        var niveles = mapaNiveles(usados), imagenes = colaImagenes(function (r) { return zip.tiene(r) ? zip.bytes(r) : Promise.reject(new Error('falta')); }, avisos);
        docs.forEach(function (d) {
          var cuerpo = cuerpoDe(d.doc), conTitulo = false;
          Object.keys(niveles).forEach(function (n) { if (niveles[n].sec && cuerpo.getElementsByTagName('h' + n).length) conTitulo = true; });
          if (!conTitulo && etiquetas[d.x.ruta] && textoLibre(cuerpo)) st.nueva(etiquetas[d.x.ruta], 2, d.x.ruta.split('/').pop() + ':0');
          bloquesHtml(cuerpo, { st: st, niveles: niveles, nombre: d.x.ruta.split('/').pop(), imagenes: imagenes, rutaImagen: function (s) { return s && !/^(data|https?):/i.test(s) ? resolver(d.x.ruta, s) : null; } });
        });
        return imagenes.resolver().then(function () { return { secciones: st.secciones, meta: meta, avisos: avisos }; });
      });
    });
  }

  // ------------------------------------------------------------------ Word (.docx)
  var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  function wAttr(n, nombre) { return n ? (n.getAttributeNS(W, nombre) || n.getAttribute('w:' + nombre) || '') : ''; }
  function wHijo(n, nombre) { if (!n) return null; nombre = nombre.toLowerCase(); for (var c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && local(c) === nombre) return c; return null; }
  function wActivo(n) { if (!n) return false; var v = wAttr(n, 'val').toLowerCase(); return v !== '0' && v !== 'false' && v !== 'off' && v !== 'none'; }
  function importarDocx(archivo, opciones) {
    var avisos = [], zip = N.abrirZip(archivo.bytes, opciones.inflar), xml = function (t) { return opciones.parsear(t, 'application/xml'); };
    var opcional = function (r) { return zip.tiene(r) ? zip.texto(r).then(xml) : Promise.resolve(null); };
    if (!zip.tiene('word/document.xml')) return Promise.reject(new Error('no es un documento de Word (.docx): falta word/document.xml'));
    return Promise.all([zip.texto('word/document.xml').then(xml), opcional('word/styles.xml'), opcional('word/numbering.xml'), opcional('word/_rels/document.xml.rels'), opcional('docProps/core.xml')]).then(function (r) {
      var doc = r[0], estilos = {}, formatos = {}, rels = {};
      // estilos: nombre, nivel de esquema y numeración, heredados por basedOn
      if (r[1]) todosNS(r[1], 'style').forEach(function (s) {
        var ppr = wHijo(s, 'pPr'), ol = wHijo(ppr, 'outlineLvl'), base = wHijo(s, 'basedOn');
        estilos[wAttr(s, 'styleId')] = { nombre: wAttr(wHijo(s, 'name'), 'val').toLowerCase(), esquema: ol ? parseInt(wAttr(ol, 'val'), 10) : null, num: !!wHijo(ppr, 'numPr'), base: base ? wAttr(base, 'val') : null };
      });
      var estilo = function (id) {
        var e = estilos[id], vistos = {}, out = { nombre: e ? e.nombre : String(id || '').toLowerCase(), esquema: null, num: false };
        while (e && !vistos[id]) { vistos[id] = 1; if (out.esquema === null && e.esquema !== null) out.esquema = e.esquema; out.num = out.num || e.num; id = e.base; e = estilos[id]; }
        return out;
      };
      // numeración: numId → ¿lista ordenada?
      if (r[2]) {
        var abstractos = {};
        todosNS(r[2], 'abstractNum').forEach(function (a) { var lv = {}; todosNS(a, 'lvl').forEach(function (l) { lv[wAttr(l, 'ilvl')] = wAttr(wHijo(l, 'numFmt'), 'val'); }); abstractos[wAttr(a, 'abstractNumId')] = lv; });
        todosNS(r[2], 'num').forEach(function (n) { formatos[wAttr(n, 'numId')] = abstractos[wAttr(wHijo(n, 'abstractNumId'), 'val')] || {}; });
      }
      if (r[3]) todosNS(r[3], 'Relationship').forEach(function (x) { rels[x.getAttribute('Id')] = resolver('word/document.xml', x.getAttribute('Target')); });
      var meta = { titulo: r[4] ? textoLibre(primeroNS(r[4], 'title')) : '', autor: r[4] ? textoLibre(primeroNS(r[4], 'creator')) : '', subtitulo: '' };
      var cuerpo = primeroNS(doc, 'body');
      if (!cuerpo) throw new Error('documento de Word sin cuerpo');
      // párrafos y tablas del cuerpo, en orden (los controles de contenido se abren). Una tabla de una sola columna es
      // un marco de maquetación (una figura con su leyenda, un recuadro): se recorre su contenido como texto corrido.
      var piezas = [], directos = function (n, nombre) { return hijos(n).filter(function (x) { return x.nodeType === 1 && local(x) === nombre; }); };
      var esMarco = function (tbl) { var filas = directos(tbl, 'tr'); return filas.length > 0 && filas.every(function (tr) { return directos(tr, 'tc').length === 1; }); };
      (function recorrer(n) {
        for (var c = n.firstChild; c; c = c.nextSibling) {
          if (c.nodeType !== 1) continue;
          var t = local(c);
          if (t === 'p') piezas.push(c);
          else if (t === 'tbl') { if (esMarco(c)) directos(c, 'tr').forEach(function (tr) { directos(tr, 'tc').forEach(recorrer); }); else piezas.push(c); }
          else if (t === 'sdt' || t === 'sdtcontent' || t === 'customxml') recorrer(c);
        }
      })(cuerpo);
      // título de cada párrafo: estilo Heading/Título n o nivel de esquema
      var nivelDe = function (p) {
        var ppr = wHijo(p, 'pPr'), est = estilo(wAttr(wHijo(ppr, 'pStyle'), 'val')), m = /^(heading|t[ií]tulo|encabezado)\s*(\d)$/.exec(est.nombre), ol = wHijo(ppr, 'outlineLvl');
        if (m) return parseInt(m[2], 10);
        var v = ol ? parseInt(wAttr(ol, 'val'), 10) : est.esquema;
        return v !== null && v >= 0 && v < 9 ? v + 1 : 0;  // el nivel 9 es texto normal
      };
      var segmentos = function (p) {
        var segs = [];
        (function recorrer(n, b, i) {
          for (var c = n.firstChild; c; c = c.nextSibling) {
            if (c.nodeType !== 1) continue;
            var t = local(c);
            if (t === 'del' || t === 'movefrom' || t === 'ppr' || t === 'instrtext' || t === 'footnotereference' || t === 'endnotereference') continue;
            if (t === 'r') {
              var rpr = wHijo(c, 'rPr'), rs = wAttr(wHijo(rpr, 'rStyle'), 'val').toLowerCase();
              var bb = b || wActivo(wHijo(rpr, 'b')) || /strong|fuerte|negrita/.test(rs), ii = i || wActivo(wHijo(rpr, 'i')) || /emphasis|[ée]nfasis|cursiva/.test(rs);
              for (var x = c.firstChild; x; x = x.nextSibling) {
                if (x.nodeType !== 1) continue;
                var tx = local(x);
                if (tx === 't') segs.push({ s: x.textContent, b: bb, i: ii });
                else if (tx === 'tab' || tx === 'br' || tx === 'cr') segs.push({ s: ' ', b: bb, i: ii });
                else if (tx === 'nobreakhyphen') segs.push({ s: '-', b: bb, i: ii });
              }
            } else recorrer(c, b, i);  // hyperlink, ins, moveTo, smartTag, fldSimple, sdt…
          }
        })(p, false, false);
        return segs;
      };
      var enLineaW = function (p) {
        var out = '', act = null;
        segmentos(p).forEach(function (g) {
          if (act && act.b === g.b && act.i === g.i) act.s += g.s;
          else { if (act) out += pintar(act); act = { s: g.s, b: g.b, i: g.i }; }
        });
        if (act) out += pintar(act);
        return espacios(out);
        function pintar(g) { var h = N.escaparHtml(g.s); if (g.i) h = envolver('em', h); if (g.b) h = envolver('strong', h); return h; }
      };
      var usados = {};
      piezas.forEach(function (p) { if (local(p) === 'p') { var n = nivelDe(p); if (n && textoLibre(p)) usados[n] = 1; } });
      var niveles = mapaNiveles(usados), st = N.estadoLibro(''), nombre = archivo.nombre, orden = 0, lista = null, cita = null;
      var imagenes = colaImagenes(function (ruta) { return zip.tiene(ruta) ? zip.bytes(ruta) : Promise.reject(new Error('falta')); }, avisos);
      var src = function () { return nombre + ':' + orden; };
      var cerrar = function () {
        if (lista && lista.items.length) st.bloque(lista.t, lista.items, lista.src);
        if (cita && cita.partes.length) st.bloque('quote', cita.partes.join(' '), cita.src);
        lista = null; cita = null;
      };
      var ultimaFigura = null;
      piezas.forEach(function (p) {
        orden++;
        if (local(p) === 'tbl') {
          cerrar(); ultimaFigura = null;
          var filas = directos(p, 'tr').map(function (tr) { return hijos(tr).filter(function (c) { return c.nodeType === 1 && local(c) === 'tc'; }).map(function (tc) { return espacios(todosNS(tc, 'p').map(enLineaW).join(' ')); }); }).filter(function (f) { return f.length; });
          if (filas.length) st.bloque('table', filas, src());
          return;
        }
        var ppr = wHijo(p, 'pPr'), est = estilo(wAttr(wHijo(ppr, 'pStyle'), 'val')), h = enLineaW(p), texto = N.textoDeHtml(h).trim();
        var blips = todosNS(p, 'blip');
        if (blips.length && !texto) {
          cerrar();
          blips.forEach(function (bl) {
            var dp = todosNS(p, 'docPr')[0], ley = dp ? espacios(dp.getAttribute('descr') || dp.getAttribute('title') || '') : '';
            var b = st.bloque('figure', { src: '', caption: N.escaparHtml(ley) || 'Figura' }, src());
            b.sinLeyenda = !ley;
            var id = bl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') || bl.getAttribute('r:embed');
            imagenes.pedir(b, rels[id] || null);
            ultimaFigura = b;
          });
          return;
        }
        if (!texto) return;
        imagenes.enTexto += blips.length;
        if (/^(title|t[ií]tulo)$/.test(est.nombre)) { cerrar(); if (!meta.titulo) meta.titulo = texto; ultimaFigura = null; return; }
        if (/^(subtitle|subt[ií]tulo)$/.test(est.nombre)) { cerrar(); if (!meta.subtitulo) meta.subtitulo = texto; return; }
        // la leyenda que sigue a una imagen es su pie, no un párrafo aparte
        if (ultimaFigura && (/caption|descripci[oó]n|ep[ií]grafe|leyenda/.test(est.nombre) || /^(Figura|Fig\.|Figure|Imagen|Tabla)\s/.test(texto))) {
          if (ultimaFigura.sinLeyenda) { ultimaFigura.html.caption = h; delete ultimaFigura.sinLeyenda; ultimaFigura = null; return; }
        }
        if (ultimaFigura) delete ultimaFigura.sinLeyenda;
        ultimaFigura = null;
        var nv = nivelDe(p);
        if (nv) {
          cerrar();
          var dest = niveles[nv] || { t: 'h4' };
          if (dest.sec) st.nueva(texto, dest.sec, src()); else st.bloque(dest.t, h, src());
          return;
        }
        var numPr = wHijo(ppr, 'numPr'), numIdP = numPr ? wAttr(wHijo(numPr, 'numId'), 'val') : null;
        // numId 0 en el párrafo es la forma de Word de quitarle la numeración que hereda del estilo
        if ((numPr && numIdP !== '0') || (!numPr && est.num)) {
          var numId = wAttr(wHijo(numPr, 'numId'), 'val'), ilvl = wAttr(wHijo(numPr, 'ilvl'), 'val') || '0', fmt = (formatos[numId] || {})[ilvl] || 'bullet';
          var t = fmt === 'bullet' || fmt === 'none' ? 'ul' : 'ol';
          if (cita) cerrar();
          if (lista && lista.t !== t) cerrar();
          if (!lista) lista = { t: t, items: [], src: src() };
          lista.items.push(h);
          return;
        }
        if (/quote|cita/.test(est.nombre)) {
          if (lista) cerrar();
          if (!cita) cita = { partes: [], src: src() };
          cita.partes.push(h);
          return;
        }
        cerrar();
        st.bloque('p', h, src());
      });
      cerrar();
      st.secciones.forEach(function (s) { s.bloques.forEach(function (b) { delete b.sinLeyenda; }); });
      return imagenes.resolver().then(function () { return { secciones: st.secciones, meta: meta, avisos: avisos }; });
    });
  }

  // ------------------------------------------------------------------ texto plano y Markdown
  // En un .txt, las líneas sueltas del tipo «CAPÍTULO III» o «Chapter 3. Título» se toman como títulos de sección.
  var TITULO_TXT = /^(cap[ií]tulo|chapter|parte|part|libro|book|pr[oó]logo|prologue|ep[ií]logo|epilogue|introducci[oó]n|introduction)\b[^\n]{0,80}$/i;
  function txtAMarkdown(texto) {
    var lineas = String(texto).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
    return lineas.map(function (l, i) {
      var sola = (i === 0 || !lineas[i - 1].trim()) && (i === lineas.length - 1 || !lineas[i + 1].trim());
      return sola && TITULO_TXT.test(l.trim()) ? '## ' + l.trim() : l;
    }).join('\n');
  }

  // ------------------------------------------------------------------ entrada única
  // archivos: [{ nombre, bytes: Uint8Array }]. opciones: { parsear, inflar, titulo, autor, figs }.
  // → Promise<{ libro, avisos, origen }>; rechaza con un Error de mensaje legible.
  function importarLibro(archivos, opciones) {
    opciones = opciones || {};
    if (!archivos || !archivos.length) return Promise.reject(new Error('no hay archivos'));
    archivos = archivos.slice().sort(function (a, b) { return a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0; });
    // las imágenes que acompañan a un Markdown resuelven sus [FIGURA: archivo | …]
    var figuras = {};
    archivos = archivos.filter(function (a) { if (TIPOS_IMAGEN[extension(a.nombre)]) { figuras[a.nombre.split('/').pop()] = a.bytes; return false; } return true; });
    if (!archivos.length) return Promise.reject(new Error('elige el texto del libro (las imágenes sólo acompañan a un Markdown)'));
    var tipos = {}, grupo = function (e) { return /^(md|markdown|txt|text)$/.test(e) ? 'md' : /^(html|htm|xhtml)$/.test(e) ? 'html' : e; };
    archivos.forEach(function (a) { tipos[grupo(extension(a.nombre))] = 1; });
    var tipo = Object.keys(tipos);
    if (tipo.length > 1) return Promise.reject(new Error('importa un solo tipo de archivo a la vez (' + tipo.join(', ') + ')'));
    tipo = tipo[0];
    if ((tipo === 'epub' || tipo === 'docx' || tipo === 'json') && archivos.length > 1) return Promise.reject(new Error('importa un solo archivo .' + tipo + ' a la vez'));
    var trabajo;
    try {
      if (tipo === 'json') {
        var libro = JSON.parse(N.decodificarUtf8(archivos[0].bytes).replace(/^﻿/, ''));
        var problemas = N.validarLibro(libro);
        if (problemas.length) throw new Error('el libro.json no es válido: ' + problemas.slice(0, 3).join('; ') + (problemas.length > 3 ? '…' : ''));
        return Promise.resolve({ libro: N.sanearLibro(libro), avisos: [], origen: 'libro.json' });
      }
      if (tipo === 'md') {
        var avisosMd = [], secciones = N.parsearMarkdown(archivos.map(function (a) {
          var t = decodificarTexto(a.bytes, a.nombre, avisosMd); return { nombre: a.nombre, texto: /\.te?xt$/i.test(a.nombre) ? txtAMarkdown(t) : t };
        }), '');
        var cola = colaImagenes(function (r) { return figuras[r] ? Promise.resolve(figuras[r]) : Promise.reject(new Error('falta')); }, avisosMd);
        secciones.forEach(function (s) { s.bloques.forEach(function (b) { if (b.t === 'figure') cola.pedir(b, b.html.src); }); });
        trabajo = cola.resolver().then(function () { return { secciones: secciones, meta: {}, avisos: avisosMd }; });
      } else if (tipo === 'html') trabajo = importarHtml(archivos, opciones);
      else if (tipo === 'epub') trabajo = importarEpub(archivos[0], opciones);
      else if (tipo === 'docx') trabajo = importarDocx(archivos[0], opciones);
      else return Promise.reject(new Error('formato no admitido: .' + (extension(archivos[0].nombre) || '?') + ' (usa Markdown, texto, HTML, EPUB, Word .docx o libro.json)'));
    } catch (e) { return Promise.reject(e instanceof Error ? e : new Error(String(e))); }
    return trabajo.then(function (r) {
      var cuenta = r.secciones.reduce(function (n, s) { return n + s.bloques.length; }, 0);
      if (!cuenta) throw new Error('no se encontró texto en ' + (archivos.length === 1 ? archivos[0].nombre : 'los archivos'));
      var libro = N.armarLibro(r.secciones, {
        titulo: opciones.titulo || r.meta.titulo || '', subtitulo: r.meta.subtitulo || '', autor: opciones.autor || r.meta.autor || '',
        fuentes: archivos.map(function (a) { return a.nombre; })
      });
      return { libro: libro, avisos: r.avisos, origen: tipo };
    });
  }
  return { importarLibro: importarLibro, txtAMarkdown: txtAMarkdown, mapaNiveles: mapaNiveles };
});
