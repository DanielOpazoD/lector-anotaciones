// ------------------------------------------------------------ libro
(function (P, E) {
  // lo que este fragmento ofrece a los demás (las funciones se elevan: están desde el principio)
  P.renderLibro = renderLibro;
  P.irA = irA;
  P.mover = mover;
  function renderLibro() {
    var ind = P.$('#indice-lista');
    ind.innerHTML = '';
    var lect = P.$('#lectura');
    lect.innerHTML = '';
    var grupo = null;
    E.SECS.forEach(function (s) {
      P.SEC_BY_ID[s.id] = s;
      if (s.nivel === 1) {
        grupo = P.el('div', { 'class': 'grupo', text: s.titulo.replace(/\.\s.*$/, '') });
        ind.appendChild(grupo);
        ind.appendChild(P.el('div', { 'class': 'progreso', 'data-grupo': s.id }, [P.el('i')]));
      }
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
      ind.appendChild(a);
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
    var act = P.$('nav a.sec.activa');
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
    try {
      history.replaceState(null, '', '#' + sid);
    } catch (e) {}
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
      } catch (e) {}
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
