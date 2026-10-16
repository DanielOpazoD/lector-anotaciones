(function (P, E) {
  E.LIBRO = null;
  E.SECS = [];
  var SEC_BY_ID = {};
  var BLOQUE_SEC = {};
  var POS_BLOQUE = {}; // id de bloque → su posición en la sección
  var ORIG = {};
  P.SEC_BY_ID = SEC_BY_ID;
  P.BLOQUE_SEC = BLOQUE_SEC;
  P.POS_BLOQUE = POS_BLOQUE;
  P.ORIG = ORIG;
  E.db = null;
  E.col = null;
  E.modo = 'cargando';
  E.LOCAL_KEY = 'lector-anotaciones'; // se completa con el id del libro al cargarlo
  var BLOQUES = {}; // id de bloque -> bloque de libro.json
  P.BLOQUES = BLOQUES;
  E.USER = null;
  E.ME = null;
  var PERFILES = {};
  var PERFILES_PEDIDOS = {};
  P.PERFILES = PERFILES;
  P.PERFILES_PEDIDOS = PERFILES_PEDIDOS;
  E.CAPAS_ON = {};
  E.VISTO = {};
  E.LEIDAS = {};
  E.ultimoBorrado = null;
  E.lectura = null;
  E.SOLO_LECTURA = false;
  E.respaldoHoy = null;
  E.respaldoBloqueado = false;
  E.avisoRevisar = false; // ya se anunció en esta visita que hay respuestas por revisar
  E.ESCRIBIENDO = 0; // escrituras en la base todavía sin respuesta (antes de recargar para abrir otro libro)
  var RESPALDO_MAX = 180 * 1024; // bytes de cada documento de respaldo ya envuelto, con margen (la base admite 256 KiB)
  P.RESPALDO_MAX = RESPALDO_MAX;
  var N = window.LANucleo; // lógica pura (nucleo/*.js), probada con node --test
  P.N = N;
  // La sincronía de las anotaciones (nucleo/65-sincronia.js) es dueña de su estado: las anotaciones, los campos que el
  // lector cambió, lo «sin guardar», lo que está en vuelo o ya en la base y la cola de subida. `anots` es su mapa de
  // anotaciones (id → anotación), el mismo objeto.
  var SINC = N.crearSincronia();
  P.SINC = SINC;
  var anots = SINC.anots;
  P.anots = anots;
  // El estado de la vista (nucleo/58-vista.js): sección, pestaña, filtros, ficha activa, revisadas, margen. `V` es el
  // objeto vivo, que se lee directamente; se cambia sólo con `VISTA.cambiar({...})`, que aplica las reglas (al salir de
  // «Por revisar» se vacía lo revisado) y avisa a quien escucha.
  var VISTA = N.crearVista();
  P.VISTA = VISTA;
  var V = VISTA.estado;
  P.V = V;
  /** @returns {any} */
  var $ = function (s, r) {
    return (r || document).querySelector(s);
  };
  P.$ = $;
  /** @returns {any[]} */
  var $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };
  P.$$ = $$;
  var el = function (tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs)
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') e.textContent = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
        else e.setAttribute(k, attrs[k]);
      });
    (kids || []).forEach(function (c) {
      if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  };
  P.el = el;
  var ahora = function () {
    return new Date().toISOString();
  };
  P.ahora = ahora;
  var uid = function () {
    return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };
  P.uid = uid;
  // En sólo lectura, todo mensaje de la barra lo recuerda («Conectado · N anotaciones · sólo lectura»), para que el eco
  // de la base no pise el aviso.
  // Los avisos (errores, cambios de modo) se anuncian además a los lectores de pantalla desde una región viva fuera de la
  // barra, que sigue en el árbol de accesibilidad aunque la barra quede inerte; los mensajes de rutina («Guardado…»,
  // «Conectado…») sólo se muestran.
  var estado = function (t, aviso) {
    var e = $('#estado');
    if (E.SOLO_LECTURA && !/sólo lectura/i.test(t)) t += ' · sólo lectura';
    e.textContent = t;
    e.className = aviso ? 'aviso' : '';
    if (aviso) anunciar(t);
  };
  P.estado = estado;
  var anunciar = function (t) {
    var r = $('#anuncio');
    if (!r) return;
    r.textContent = '';
    setTimeout(function () {
      r.textContent = t;
    }, 60);
  };
  P.anunciar = anunciar;
  var lsGet = function (k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  };
  P.lsGet = lsGet;
  var igual = N.igual;
  var lsSet = function (k, v) {
    try {
      localStorage.setItem(k, v);
      return localStorage.getItem(k) === v;
    } catch (e) {
      return false;
    }
  };
  P.lsSet = lsSet;
  var enCurso = function (p) {
    E.ESCRIBIENDO++;
    var fin = function () {
      E.ESCRIBIENDO--;
    };
    p.then(fin, fin);
    return p;
  };
  P.enCurso = enCurso;
  var bytesJSON = function (v) {
    var s = JSON.stringify(v);
    return window.TextEncoder ? new TextEncoder().encode(s).length : unescape(encodeURIComponent(s)).length;
  };
  P.bytesJSON = bytesJSON;
})(LAPagina, LAEstado);
