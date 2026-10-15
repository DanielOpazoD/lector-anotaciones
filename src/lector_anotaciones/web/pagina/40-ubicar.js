  // ------------------------------------------------------------ ubicar cada subrayado en esta versión del libro
  // Los ids de bloque son posicionales: si se inserta un párrafo y se reconstruye libro.json, los ids
  // posteriores de esa sección cambian. Por eso nunca se pinta un subrayado sin comprobar que la cita
  // guardada sigue en el lugar guardado; si no, se busca (primero en el bloque, luego en la sección,
  // luego en el libro, exigiendo contexto fuera del bloque) y, si no aparece, se declara perdido y la
  // ficha lo dice, con la cita a la vista. Nada de esto modifica la anotación guardada.
  var TXT = {};   // pid -> texto plano del bloque
  var UBIC = {};  // id de anotación -> { pid, inicio, fin, estado: 'exacto' | 'reubicado' | 'perdido' }
  function textoPlano(pid) {
    if (TXT[pid] === undefined) { var w = el('div', { html: ORIG[pid] || '' }); TXT[pid] = w.textContent; }
    return TXT[pid];
  }
  function buscarCita(txt, a) {
    // índice de la cita en txt, desambiguado con el contexto; devuelve { i, puntos } o null
    if (!a.cita) return null;
    var mejor = null;
    for (var k = txt.indexOf(a.cita); k >= 0; k = txt.indexOf(a.cita, k + 1)) {
      var p = 0;
      if (a.antes && txt.slice(Math.max(0, k - a.antes.length), k) === a.antes) p += 1;
      if (a.despues && txt.slice(k + a.cita.length, k + a.cita.length + a.despues.length) === a.despues) p += 1;
      if (!mejor || p > mejor.puntos) mejor = { i: k, puntos: p };
    }
    return mejor;
  }
  function ubicar(a) {
    if (a.tipo !== 'subrayado' || !a.pid) return null;
    var existe = ORIG[a.pid] !== undefined, txt = existe ? textoPlano(a.pid) : '';
    if (existe && txt.slice(a.inicio, a.fin) === a.cita) return { pid: a.pid, inicio: a.inicio, fin: a.fin, estado: 'exacto' };
    var m = existe ? buscarCita(txt, a) : null;
    if (m) return { pid: a.pid, inicio: m.i, fin: m.i + a.cita.length, estado: 'reubicado' };
    var sec = SEC_BY_ID[BLOQUE_SEC[a.pid] || a.sid];
    var candidatos = sec ? sec.bloques.map(function (b) { return b.id; }) : [];
    candidatos = candidatos.concat(Object.keys(ORIG).filter(function (p) { return candidatos.indexOf(p) < 0; }));
    // Fuera del bloque original: vale una coincidencia con contexto; sin contexto (la cita ocupaba el bloque
    // entero, o es larga) vale sólo si es la única en todo el libro.
    var sinContexto = !a.antes && !a.despues, hallazgos = [], mejor = null;
    for (var c = 0; c < candidatos.length; c++) {
      var p = candidatos[c]; if (p === a.pid) continue;
      var m2 = buscarCita(textoPlano(p), a);
      if (!m2) continue;
      var h = { pid: p, inicio: m2.i, fin: m2.i + a.cita.length, estado: 'reubicado', puntos: m2.puntos };
      if (m2.puntos > 0 && (!mejor || m2.puntos > mejor.puntos)) mejor = h;
      hallazgos.push(h);
    }
    if (mejor) return { pid: mejor.pid, inicio: mejor.inicio, fin: mejor.fin, estado: 'reubicado' };
    if (hallazgos.length === 1 && (sinContexto || a.cita.length >= 40)) return { pid: hallazgos[0].pid, inicio: hallazgos[0].inicio, fin: hallazgos[0].fin, estado: 'reubicado' };
    return { pid: null, inicio: 0, fin: 0, estado: 'perdido' };
  }
  function reubicarTodo() { UBIC = {}; Object.keys(anots).forEach(function (k) { var u = ubicar(anots[k]); if (u) UBIC[k] = u; }); }
  function pidEfectivo(a) { var u = UBIC[a.id]; return u ? u.pid : a.pid; }

