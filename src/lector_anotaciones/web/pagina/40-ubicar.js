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
function ubicar(a) {
  return N.ubicarEn(a, {
    existe: function (pid) {
      return ORIG[pid] !== undefined;
    },
    texto: textoPlano,
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
