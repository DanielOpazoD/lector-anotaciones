  var LIBRO = null, SECS = [], SEC_BY_ID = {}, BLOQUE_SEC = {}, ORIG = {};
  var anots = {};           // id -> anotación
  var db = null, col = null, modo = 'cargando';
  var secActual = null, tab = 'capitulo', filtro = 'todas', fichaFoco = null;
  var LOCAL_KEY = 'lector-anotaciones';  // se completa con el id del libro al cargarlo
  var BLOQUES = {};         // id de bloque -> bloque de libro.json
  var USER = null, ME = null, PERFILES = {}, PERFILES_PEDIDOS = {};
  var CAPAS_ON = {}, VISTO = {}, LEIDAS = {}, filtroAutor = '', filtroEtiqueta = '';
  var ultimoBorrado = null, lectura = null;
  var SOLO_LECTURA = false, pendientesBase = [], respaldoHoy = null, respaldoBloqueado = false;
  var ESCRIBIENDO = 0;      // escrituras en la base todavía sin respuesta (antes de recargar para abrir otro libro)
  var SIN_GUARDAR = {};     // id -> código del último rechazo de una anotación que la base todavía no tiene
  var RESPALDO_MAX = 180 * 1024;  // bytes de cada documento de respaldo ya envuelto, con margen (la base admite 256 KiB)
  var N = window.LANucleo;  // lógica pura (nucleo/*.js), probada con node --test
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var el = function (tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  };
  var ahora = function () { return new Date().toISOString(); };
  var uid = function () { return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  // En sólo lectura, todo mensaje de la barra lo recuerda («Conectado · N anotaciones · sólo lectura»), para que el eco
  // de la base no pise el aviso.
  var estado = function (t, aviso) { var e = $('#estado'); if (SOLO_LECTURA && !/sólo lectura/i.test(t)) t += ' · sólo lectura'; e.textContent = t; e.className = aviso ? 'aviso' : ''; };
  var lsGet = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var igual = N.igual;
  var lsSet = function (k, v) { try { localStorage.setItem(k, v); return localStorage.getItem(k) === v; } catch (e) { return false; } };
  var enCurso = function (p) { ESCRIBIENDO++; var fin = function () { ESCRIBIENDO--; }; p.then(fin, fin); return p; };
  var bytesJSON = function (v) { var s = JSON.stringify(v); return window.TextEncoder ? new TextEncoder().encode(s).length : unescape(encodeURIComponent(s)).length; };

