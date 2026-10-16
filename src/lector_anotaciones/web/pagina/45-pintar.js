// ------------------------------------------------------------ pintar subrayados
function pintar(a) {
  var pid = pidEfectivo(a);
  if (pid) pintarPid(pid);
  marcasPagina();
}
// Repintar un bloque rehace sus marcas: si el foco del teclado estaba en una (o en la marca de párrafo), vuelve a la
// marca equivalente en vez de caer al cuerpo del documento.
function pintarPid(pid) {
  var n = $('[data-pid="' + pid + '"]');
  if (!n) return;
  var act = /** @type {Element} */ (document.activeElement),
    volver = null;
  if (act && act !== n && n.contains(act))
    volver = act.classList.contains('marca-anot')
      ? '.marca-anot'
      : act.getAttribute('data-aids')
        ? 'mark.hl[data-aids="' + act.getAttribute('data-aids') + '"]'
        : null;
  repintar(n, pid);
  var x = volver && $(volver, n);
  if (x) x.focus({ preventScroll: true });
}
function repintar(n, pid) {
  // Los marcadores del margen (página, «cambió») viven dentro del bloque pero no son texto del libro:
  // se apartan, se repone el HTML original y se vuelven a poner, con sus escuchas intactas. La marca de párrafo con la
  // cuenta de anotaciones se rehace cada vez.
  var extras = Array.prototype.slice.call(n.children).filter(function (c) {
    return esMarcador(c) && !c.classList.contains('marca-anot');
  });
  n.innerHTML = ORIG[pid];
  extras
    .slice()
    .reverse()
    .forEach(function (x) {
      n.insertBefore(x, n.firstChild);
    });
  var pgn = {
    contains: function (t) {
      return extras.some(function (x) {
        return x.contains(t);
      });
    },
  };
  var lista = Object.keys(anots)
    .map(function (k) {
      return anots[k];
    })
    .filter(function (a) {
      return a.tipo === 'subrayado' && UBIC[a.id] && UBIC[a.id].pid === pid;
    })
    .map(function (a) {
      return {
        id: a.id,
        color: a.color,
        estado: a.estado,
        creado: a.creado,
        inicio: UBIC[a.id].inicio,
        fin: UBIC[a.id].fin,
      };
    });
  // la marca de párrafo: no en los títulos (cambiaría su nombre accesible); en una lista, dentro del primer ítem
  if (lista.length && !/^H\d$/.test(n.tagName)) {
    var marca = marcaParrafo(lista, n.tagName);
    extras.push(marca); // `pgn` mira `extras`: el texto de la marca (ninguno) tampoco se pinta
    var item = /^(UL|OL)$/.test(n.tagName) ? $('li', n) : null;
    if (item) item.insertBefore(marca, item.firstChild);
    else n.insertBefore(marca, extras.length > 1 ? extras[extras.length - 2].nextSibling : n.firstChild);
  }
  var capas = capasActivas(pid);
  if (!lista.length && !capas.length) return;
  var lim = {};
  lista.forEach(function (a) {
    lim[a.inicio] = 1;
    lim[a.fin] = 1;
  });
  capas.forEach(function (c) {
    lim[c.inicio] = 1;
    lim[c.fin] = 1;
  });
  var cortes = Object.keys(lim)
    .map(Number)
    .sort(function (x, y) {
      return x - y;
    });
  var walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT, null),
    nodos = [],
    t;
  while ((t = walker.nextNode())) {
    if (pgn && pgn.contains(t)) continue;
    nodos.push(t);
  }
  var pos = 0;
  nodos.forEach(function (tn) {
    var texto = tn.nodeValue || '',
      ini = pos,
      fin = pos + texto.length;
    pos = fin;
    var puntos = [ini]
      .concat(
        cortes.filter(function (c) {
          return c > ini && c < fin;
        })
      )
      .concat([fin]);
    var frag = document.createDocumentFragment();
    for (var i = 0; i < puntos.length - 1; i++) {
      var a0 = puntos[i],
        a1 = puntos[i + 1],
        seg = texto.slice(a0 - ini, a1 - ini);
      var cubren = lista.filter(function (a) {
        return a.inicio <= a0 && a.fin >= a1;
      });
      var ks = capas
        .filter(function (c) {
          return c.inicio <= a0 && c.fin >= a1;
        })
        .map(function (c) {
          return c.k;
        });
      var nodo;
      if (cubren.length) {
        cubren.sort(function (x, y) {
          return (x.creado || '') < (y.creado || '') ? -1 : 1;
        });
        var top = cubren[cubren.length - 1];
        nodo = el('mark', {
          'class':
            'hl c-' +
            top.color +
            (top.estado === 'resuelta' ? ' resuelta' : '') +
            (V.fichaFoco === top.id ? ' foco' : ''),
          'data-aids': cubren
            .map(function (a) {
              return a.id;
            })
            .join(' '),
          text: seg,
          tabindex: '0',
          role: 'button',
        });
        abrirConMarca(nodo, top.id);
      } else nodo = document.createTextNode(seg);
      if (ks.length) {
        var sp = el('span', {
          'class':
            'capa ' +
            ks
              .map(function (k) {
                return 'k-' + k;
              })
              .join(' '),
          title: ks
            .map(function (k) {
              return (LIBRO.capas || {})[k] || k;
            })
            .join(' · '),
        });
        sp.appendChild(nodo);
        nodo = sp;
      }
      frag.appendChild(nodo);
    }
    if (tn.parentNode) tn.parentNode.replaceChild(frag, tn);
  });
}
// Lo que vive al principio de un bloque sin ser texto del libro: el número de página, «cambió» y la marca de párrafo.
function esMarcador(c) {
  return !!c.classList && /(^|\s)(pg|marca-cambio|marca-anot)(\s|$)/.test(c.className);
}
// La marca de párrafo (en pantalla estrecha, donde no hay notas al margen): cuántas anotaciones tiene el bloque, con
// el color de la primera y un punto si alguna tiene una respuesta por revisar; tocarla abre la primera. La cuenta va
// en un atributo que el estilo muestra: no es texto del bloque, así que no cambia los desplazamientos de las citas,
// lo que se copia ni lo que se lee en voz alta. Las ids van en `data-ids`, para poner al día el punto sin repintar.
var NOMBRE_BLOQUE = { P: 'párrafo', BLOCKQUOTE: 'cita', UL: 'lista', OL: 'lista' };
function marcaParrafo(lista, etiquetaHtml) {
  var orden = lista.slice().sort(function (x, y) {
    return x.inicio - y.inicio;
  });
  var b = el('button', {
    'class': 'marca-anot c-' + (orden[0].color || 'revisar'),
    type: 'button',
    'data-n': String(orden.length),
    'data-ids': orden
      .map(function (x) {
        return x.id;
      })
      .join(' '),
    'data-que': NOMBRE_BLOQUE[etiquetaHtml] || 'bloque',
  });
  ponerAlDiaMarca(b);
  abrirConMarca(b, orden[0].id);
  return b;
}
function ponerAlDiaMarca(b) {
  var ids = (b.getAttribute('data-ids') || '').split(' '),
    n = ids.length,
    que = b.getAttribute('data-que') || 'bloque',
    pend = ids.some(function (id) {
      return !!anots[id] && porRevisar(anots[id]);
    });
  b.classList.toggle('por-revisar', pend);
  var cuenta = n + (n === 1 ? ' anotación' : ' anotaciones');
  b.setAttribute(
    'aria-label',
    cuenta +
      ' en ' +
      (que === 'cita' || que === 'lista' ? 'esta ' : 'este ') +
      que +
      (pend ? ', con respuesta por revisar' : '')
  );
  b.title = cuenta + (pend ? ' (respuesta por revisar)' : '');
}
// El punto «por revisar» de las marcas, al día con quién lee y con lo revisado (sin repintar los bloques).
function refrescarMarcas() {
  $$('.marca-anot').forEach(ponerAlDiaMarca);
}
// Cada marca abre su propia anotación. (Con la variable del bucle en la clausura, todas las marcas de un párrafo
// abrían la última pintada.)
function abrirConMarca(nodo, id) {
  nodo.addEventListener('click', function (ev) {
    ev.stopPropagation();
    enfocar(id, false, true);
  });
  nodo.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      enfocar(id, false, true);
    }
  });
}
function pintarTodo() {
  reubicarTodo();
  var pids = {};
  Object.keys(UBIC).forEach(function (k) {
    if (UBIC[k].pid) pids[UBIC[k].pid] = 1;
  });
  var hayCapas = Object.keys(CAPAS_ON).some(function (k) {
    return CAPAS_ON[k];
  });
  Object.keys(ORIG).forEach(function (pid) {
    var n = $('[data-pid="' + pid + '"]');
    if (pids[pid] || (n && n.querySelector('mark.hl, span.capa')) || (hayCapas && BLOQUES[pid] && BLOQUES[pid].m))
      pintarPid(pid);
  });
  marcasPagina();
}
function capasActivas(pid) {
  var b = BLOQUES[pid],
    out = [];
  if (!b || !b.m) return out;
  Object.keys(b.m).forEach(function (k) {
    if (CAPAS_ON[k])
      b.m[k].forEach(function (r) {
        out.push({ k: k, inicio: r[0], fin: r[1] });
      });
  });
  return out;
}
function marcasPagina() {
  var con = {};
  Object.keys(anots).forEach(function (k) {
    var a = anots[k];
    if (a.tipo === 'pagina' && a.pagina) con[a.pagina] = 1;
  });
  $$('.pg').forEach(function (p) {
    p.classList.toggle('con-nota', !!con[p.getAttribute('data-pg')]);
  });
}
