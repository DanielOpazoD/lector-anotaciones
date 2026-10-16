// ------------------------------------------------------------ ubicar cada subrayado en esta versión del libro
// La búsqueda vive en el núcleo (nucleo/30-ubicar.js); aquí se le da el texto de cada bloque tal como se ve.
var TXT = {}; // pid -> texto plano del bloque
var UBIC = {}; // id de anotación -> { pid, inicio, fin, estado: 'exacto' | 'reubicado' | 'perdido' }
function textoPlano(pid) {
  if (TXT[pid] === undefined) {
    var w = el('div', { html: ORIG[pid] || '' });
    TXT[pid] = w.textContent;
  }
  return TXT[pid];
}
// huella → [pid…] de los bloques con esa huella, en el orden del libro (se arma al pedirla)
var POR_HUELLA = null;
function bloquesConHuella(h) {
  if (!POR_HUELLA) {
    if (!SECS.length) return []; // el libro todavía no cargó: no se guarda un índice vacío
    POR_HUELLA = {};
    SECS.forEach(function (s) {
      s.bloques.forEach(function (b) {
        if (b.h) (POR_HUELLA[b.h] || (POR_HUELLA[b.h] = [])).push(b.id);
      });
    });
  }
  return POR_HUELLA[h] || [];
}
function ubicar(a) {
  return N.ubicarEn(a, {
    existe: function (pid) {
      return ORIG[pid] !== undefined;
    },
    texto: textoPlano,
    porHuella: function (h) {
      // primero los de la sección de la anotación (un texto repetido se ubica en la suya)
      var todos = bloquesConHuella(h),
        sid = BLOQUE_SEC[a.pid] || a.sid;
      return todos
        .filter(function (p) {
          return BLOQUE_SEC[p] === sid;
        })
        .concat(
          todos.filter(function (p) {
            return BLOQUE_SEC[p] !== sid;
          })
        );
    },
    candidatos: function (x) {
      var sec = SEC_BY_ID[BLOQUE_SEC[x.pid] || x.sid];
      var cand = sec
        ? sec.bloques.map(function (b) {
            return b.id;
          })
        : [];
      return cand.concat(
        Object.keys(ORIG).filter(function (q) {
          return cand.indexOf(q) < 0;
        })
      );
    },
  });
}
function reubicarTodo() {
  UBIC = {};
  Object.keys(anots).forEach(function (k) {
    var u = ubicar(anots[k]);
    if (u) UBIC[k] = u;
  });
}
function pidEfectivo(a) {
  var u = UBIC[a.id];
  return u ? u.pid : a.pid;
}
