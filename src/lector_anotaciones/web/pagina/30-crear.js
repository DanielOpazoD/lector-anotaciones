// ------------------------------------------------------------ anotaciones: creación
function base(tipo, sid) {
  var s = SEC_BY_ID[sid] || {};
  return {
    id: uid(),
    tipo: tipo,
    sid: sid || null,
    sidTitulo: s.titulo || null,
    nota: '',
    estado: 'abierta',
    creado: ahora(),
    editado: ahora(),
    libro: LIBRO ? LIBRO.generado : null,
    autor: ME,
  };
}
function notaPagina(pg, sid) {
  if (SOLO_LECTURA) return;
  pg = parseInt(pg, 10);
  if (!pg) return;
  var ex = Object.keys(anots)
    .map(function (k) {
      return anots[k];
    })
    .filter(function (a) {
      return a.tipo === 'pagina' && a.pagina === pg;
    })[0];
  if (ex) {
    enfocar(ex.id);
    return;
  }
  var a = base('pagina', sid || secActual);
  a.pagina = pg;
  guardar(a);
  enfocar(a.id, true);
}
function notaSeccion() {
  if (SOLO_LECTURA) return;
  var ex = Object.keys(anots)
    .map(function (k) {
      return anots[k];
    })
    .filter(function (a) {
      return a.tipo === 'capitulo' && a.sid === secActual;
    })[0];
  if (ex) {
    enfocar(ex.id);
    return;
  }
  var a = base('capitulo', secActual);
  guardar(a);
  enfocar(a.id, true);
}
function notaGeneral() {
  var a = base('general', null);
  guardar(a);
  enfocar(a.id, true);
}

function offsetEn(para, node, off) {
  var r = document.createRange();
  r.setStart(para, 0);
  r.setEnd(node, off);
  return r.toString().length;
}
// Un triple clic en el último párrafo, o un arrastre hasta debajo del texto, deja el extremo del rango
// fuera de los bloques (en el título, en los botones de navegación…): se recorta al primer o último
// bloque que la selección abarca, con el bloque completo por ese lado.
function extremosDeRango(r) {
  var paras = $$('article.seccion:not([hidden]) [data-pid]');
  var pA = ancestroPid(r.startContainer),
    pB = ancestroPid(r.endContainer),
    aFuera = !pA,
    bFuera = !pB;
  var dentro = function (p) {
    try {
      return r.comparePoint(p, 0);
    } catch (e) {
      return 1;
    }
  };
  if (!pA)
    pA =
      paras.filter(function (p) {
        return dentro(p) === 0;
      })[0] || null;
  if (!pB) {
    var antes = paras.filter(function (p) {
      return dentro(p) <= 0;
    });
    pB = antes.length ? antes[antes.length - 1] : null;
  }
  return { paras: paras, pA: pA, pB: pB, aFuera: aFuera, bFuera: bFuera };
}
function crearSubrayado(color, conNota) {
  if (SOLO_LECTURA) return;
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  var range = sel.getRangeAt(0);
  var ex = extremosDeRango(range),
    pA = ex.pA,
    pB = ex.pB,
    paras = ex.paras;
  if (!pA || !pB) return;
  var iA = paras.indexOf(pA),
    iB = paras.indexOf(pB);
  if (iA < 0 || iB < 0) return;
  if (iA > iB) {
    var tmp = pA;
    pA = pB;
    pB = tmp;
    var ti = iA;
    iA = iB;
    iB = ti;
  }
  var grupo = iA !== iB ? uid() : null,
    primero = null;
  for (var i = iA; i <= iB; i++) {
    var p = paras[i],
      txt = p.textContent,
      ini = 0,
      fin = txt.length;
    if (i === iA && !ex.aFuera) ini = offsetEn(p, range.startContainer, range.startOffset);
    if (i === iB && !ex.bFuera) fin = offsetEn(p, range.endContainer, range.endOffset);
    var lp = 0,
      c = p.firstChild;
    while (c && c.classList && (c.classList.contains('pg') || c.classList.contains('marca-cambio'))) {
      lp += c.textContent.length;
      c = c.nextSibling;
    }
    if (lp) {
      if (i === iA) ini = Math.max(0, ini - lp);
      if (i === iB) fin = Math.max(0, fin - lp);
      txt = txt.slice(lp);
      fin = Math.min(fin, txt.length);
    }
    if (fin <= ini) continue;
    var a = base('subrayado', secActual);
    a.pid = p.getAttribute('data-pid');
    a.src = p.getAttribute('data-src');
    a.pagina = parseInt(p.getAttribute('data-pg') || '0', 10) || null;
    a.bh = (BLOQUES[a.pid] || {}).h || null;
    a.inicio = ini;
    a.fin = fin;
    a.cita = txt.slice(ini, fin);
    a.antes = txt.slice(Math.max(0, ini - 30), ini);
    a.despues = txt.slice(fin, fin + 30);
    a.color = color;
    if (grupo) a.grupo = grupo;
    guardar(a);
    if (!primero) primero = a.id;
  }
  sel.removeAllRanges();
  ocultarTb();
  if (primero) enfocar(primero, !!conNota);
}
function ancestroPid(n) {
  while (n && n.nodeType !== 1) n = n.parentNode;
  return n ? n.closest('[data-pid]') : null;
}
