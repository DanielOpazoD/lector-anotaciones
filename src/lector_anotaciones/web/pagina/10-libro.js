// ------------------------------------------------------------ libro
(function (P, E) {
  // lo que este fragmento ofrece a los demás (las funciones se elevan: están desde el principio)
  P.renderLibro = renderLibro;
  P.irA = irA;
  P.mover = mover;
  // Las partes plegadas del índice (id de la parte → 1), recordadas en este navegador para cada libro.
  /** @type {Record<string, number>} */
  var PLEGADAS = {};
  function renderLibro() {
    var ind = P.$('#indice-lista');
    ind.innerHTML = '';
    var lect = P.$('#lectura');
    lect.innerHTML = '';
    PLEGADAS = P.lsJSON(E.LOCAL_KEY + ':plegadas');
    // Una parte es una sección de nivel 1 seguida de otras de nivel mayor: su cabecera la pliega y la despliega; su
    // barra de progreso y su propia entrada quedan a la vista y lo que se pliega son sus capítulos. Una sección de
    // nivel 1 sin capítulos es sólo su entrada.
    /** @type {HTMLElement | null} */
    var caps = null;
    E.SECS.forEach(function (s, i) {
      P.SEC_BY_ID[s.id] = s;
      var a = P.el('a', { 'class': 'sec', href: '#' + s.id, 'data-sid': s.id }, [
        P.el('span', {
          text:
            s.nivel === 2
              ? s.titulo
              : s.nivel === 1 && /^PARTE/.test(s.titulo)
                ? s.titulo.replace(/^PARTE [IV]+\.\s*/, '')
                : s.titulo,
        }),
        P.el('span', { 'class': 'n', text: s.pagina ? String(s.pagina) : '' }),
      ]);
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        irA(s.id);
      });
      var sig = E.SECS[i + 1];
      if (s.nivel === 1 && sig && (sig.nivel || 0) > 1) {
        var lista = P.el('div', { 'class': 'capitulos', id: 'indice-' + s.id });
        caps = lista;
        var cab = P.el('button', { 'class': 'grupo', type: 'button', 'aria-controls': lista.id }, [
          P.el('span', { text: s.titulo.replace(/\.\s.*$/, '') }),
        ]);
        var parte = P.el('div', { 'class': 'parte', 'data-parte': s.id }, [
          cab,
          P.el('div', { 'class': 'progreso', 'data-grupo': s.id }, [P.el('i')]),
          a,
          lista,
        ]);
        cab.addEventListener('click', function () {
          plegarParte(s.id, !parte.classList.contains('plegada'));
        });
        pliegue(parte, !!PLEGADAS[s.id]);
        ind.appendChild(parte);
      } else {
        if (s.nivel === 1) caps = null;
        (caps || ind).appendChild(a);
      }
      var art = P.el('article', { 'class': 'seccion', id: 'sec-' + s.id, hidden: '' });
      art.appendChild(P.el('h1', { 'class': 'sec-titulo', text: s.titulo }));
      art.appendChild(
        P.el('div', { 'class': 'sec-meta' }, [
          P.el('span', { 'class': 'chip', text: s.pagina ? 'desde la p. ' + s.pagina : 'sin paginación' }),
          P.el('span', { text: s.bloques.length + ' bloques' }),
          P.el('span', { id: 'meta-' + s.id }),
        ])
      );
      art.appendChild(P.herramientasSeccion(s));
      var pagPrev = null;
      s.bloques.forEach(function (b, i) {
        P.BLOQUE_SEC[b.id] = s.id;
        P.POS_BLOQUE[b.id] = i;
        P.BLOQUES[b.id] = b;
        var node = renderBloque(b);
        if (b.pagina && b.pagina !== pagPrev) {
          var pg = P.el('button', {
            'class': 'pg',
            type: 'button',
            'data-pg': b.pagina,
            text: 'p. ' + b.pagina,
            title: 'Nota para la página ' + b.pagina,
          });
          pg.addEventListener('click', function () {
            P.notaPagina(b.pagina, s.id);
          });
          node.insertBefore(pg, node.firstChild);
          pagPrev = b.pagina;
        }
        art.appendChild(node);
        P.marcarCambio(b, node);
      });
      lect.appendChild(art);
    });
    if (P.$$('.parte', ind).length > 1) {
      var todas = P.el('button', { 'class': 'enlace', type: 'button', id: 'b-plegar-todas' });
      todas.addEventListener('click', function () {
        var plegar = P.$$('nav .parte').some(function (g) {
          return !g.classList.contains('plegada');
        });
        P.$$('nav .parte').forEach(function (g) {
          plegarParte(g.getAttribute('data-parte') || '', plegar);
        });
      });
      ind.insertBefore(P.el('div', { 'class': 'indice-herr' }, [todas]), ind.firstChild);
      rotularTodas();
    }
    var pie = P.el('div', { 'class': 'nav-pie' }, [
      P.el('button', { 'class': 'btn', type: 'button', id: 'ant', text: '← Anterior' }),
      P.el('button', { 'class': 'btn', type: 'button', id: 'sig', text: 'Siguiente →' }),
    ]);
    lect.appendChild(pie);
    P.$('#ant').addEventListener('click', function () {
      mover(-1);
    });
    P.$('#sig').addEventListener('click', function () {
      mover(1);
    });
  }
  function renderBloque(b) {
    var n;
    if (b.t === 'p') n = P.el('p', { 'class': 'bloque', html: b.html });
    else if (b.t === 'h3') n = P.el('h2', { 'class': 'bloque', html: b.html });
    else if (b.t === 'h4') n = P.el('h3', { 'class': 'bloque', html: b.html });
    else if (b.t === 'quote') n = P.el('blockquote', { 'class': 'bloque', html: b.html });
    else if (b.t === 'ul' || b.t === 'ol') {
      n = P.el(b.t, { 'class': 'bloque' });
      b.html.forEach(function (it) {
        n.appendChild(P.el('li', { html: it }));
      });
    }
    // una figura importada sin imagen (ausente o demasiado grande) conserva su leyenda
    else if (b.t === 'figure') {
      n = P.el('figure', { 'class': 'bloque' }, [
        b.html.src
          ? P.el('img', { src: b.html.src, alt: '', loading: 'lazy' })
          : P.el('div', { 'class': 'fig-ausente', text: 'Figura sin imagen' }),
        P.el('figcaption', { html: b.html.caption }),
      ]);
    } else if (b.t === 'table') {
      var t = P.el('table');
      b.html.forEach(function (fila, i) {
        var tr = P.el('tr');
        fila.forEach(function (c) {
          tr.appendChild(P.el(i ? 'td' : 'th', { html: c }));
        });
        t.appendChild(tr);
      });
      n = P.el('div', { 'class': 'bloque tabla' }, [t]);
    } else if (b.t === 'portada') {
      n = P.el('div', { 'class': 'bloque portada' });
      var cls = ['t1', 't2', 't3', 'autor', 'anio'];
      b.html.forEach(function (l, i) {
        n.appendChild(P.el('div', { 'class': cls[i] || '', html: l }));
      });
    } else n = P.el('div', { 'class': 'bloque', html: String(b.html) });
    n.setAttribute('data-pid', b.id);
    n.setAttribute('data-src', b.src);
    if (b.pagina) n.setAttribute('data-pg', b.pagina);
    P.ORIG[b.id] = n.innerHTML;
    return n;
  }
  // Una parte del índice, plegada o desplegada (sólo lo que se ve).
  /** @param {HTMLElement} g @param {boolean} plegada */
  function pliegue(g, plegada) {
    g.classList.toggle('plegada', plegada);
    P.$('.capitulos', g).hidden = plegada;
    P.$('.grupo', g).setAttribute('aria-expanded', plegada ? 'false' : 'true');
  }
  // Pliega o despliega una parte del índice y lo recuerda en este navegador.
  /** @param {string} id @param {boolean} plegada */
  function plegarParte(id, plegada) {
    var g = P.$('nav .parte[data-parte="' + id + '"]');
    if (!g || g.classList.contains('plegada') === plegada) return;
    pliegue(g, plegada);
    if (plegada) PLEGADAS[id] = 1;
    else delete PLEGADAS[id];
    P.lsSet(E.LOCAL_KEY + ':plegadas', JSON.stringify(PLEGADAS));
    rotularTodas();
  }
  function rotularTodas() {
    var b = P.$('#b-plegar-todas');
    if (b)
      b.textContent = P.$$('nav .parte').some(function (g) {
        return !g.classList.contains('plegada');
      })
        ? 'Plegar todas las partes'
        : 'Desplegar todas las partes';
  }
  function irA(sid, pid) {
    if (!P.SEC_BY_ID[sid]) return;
    P.VISTA.cambiar({ secActual: sid });
    P.$$('article.seccion').forEach(function (a) {
      a.hidden = a.id !== 'sec-' + sid;
    });
    P.$$('nav a.sec').forEach(function (a) {
      var on = a.getAttribute('data-sid') === sid;
      a.classList.toggle('activa', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    var act = P.$('nav a.sec.activa'),
      oculta = act && act.closest('.capitulos[hidden]');
    if (oculta) plegarParte(oculta.parentNode.getAttribute('data-parte'), false);
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
    try {
      history.replaceState(null, '', '#' + sid);
    } catch (e) {
      P.fallo('historial', e);
    }
    P.lsSet(E.LOCAL_KEY + ':ultima', sid);
    var lect = P.$('#lectura');
    if (pid) {
      var n = P.$('[data-pid="' + pid + '"]');
      if (n) {
        n.scrollIntoView({ block: 'center' });
        n.classList.add('flash');
        setTimeout(function () {
          n.classList.remove('flash');
        }, 1700);
      }
    } else lect.scrollTop = 0;
    P.lateral('indice', false);
    if (E.lectura && E.lectura.sid !== sid) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        P.fallo('voz', e);
      }
      P.detenerLectura();
    }
    if (P.V.tab === 'capitulo') P.renderPanel();
    P.registrarVisto(sid);
    var i = E.SECS.findIndex(function (s) {
      return s.id === sid;
    });
    P.$('#ant').disabled = i <= 0;
    P.$('#sig').disabled = i >= E.SECS.length - 1;
  }
  function mover(d) {
    var i = E.SECS.findIndex(function (s) {
      return s.id === P.V.secActual;
    });
    var j = i + d;
    if (E.SECS[j]) irA(E.SECS[j].id);
  }
})(LAPagina, LAEstado);
