  // ------------------------------------------------------------ libro
  function renderLibro() {
    var ind = $('#indice-lista'); ind.innerHTML = '';
    var lect = $('#lectura'); lect.innerHTML = '';
    var grupo = null;
    SECS.forEach(function (s) {
      SEC_BY_ID[s.id] = s;
      if (s.nivel === 1) { grupo = el('div', { 'class': 'grupo', text: s.titulo.replace(/\.\s.*$/, '') }); ind.appendChild(grupo); ind.appendChild(el('div', { 'class': 'progreso', 'data-grupo': s.id }, [el('i')])); }
      var a = el('a', { 'class': 'sec', href: '#' + s.id, 'data-sid': s.id }, [
        el('span', { text: s.nivel === 2 ? s.titulo : (s.nivel === 1 && /^PARTE/.test(s.titulo) ? s.titulo.replace(/^PARTE [IV]+\.\s*/, '') : s.titulo) }),
        el('span', { 'class': 'n', text: s.pagina ? String(s.pagina) : '' })
      ]);
      a.addEventListener('click', function (ev) { ev.preventDefault(); irA(s.id); });
      ind.appendChild(a);
      var art = el('article', { 'class': 'seccion', id: 'sec-' + s.id, hidden: '' });
      art.appendChild(el('h1', { 'class': 'sec-titulo', text: s.titulo }));
      art.appendChild(el('div', { 'class': 'sec-meta' }, [
        el('span', { 'class': 'chip', text: s.pagina ? 'desde la p. ' + s.pagina : 'sin paginación' }),
        el('span', { text: s.bloques.length + ' bloques' }),
        el('span', { id: 'meta-' + s.id })
      ]));
      art.appendChild(herramientasSeccion(s));
      var pagPrev = null;
      s.bloques.forEach(function (b) {
        BLOQUE_SEC[b.id] = s.id; BLOQUES[b.id] = b;
        var node = renderBloque(b);
        if (b.pagina && b.pagina !== pagPrev) {
          var pg = el('button', { 'class': 'pg', type: 'button', 'data-pg': b.pagina, text: 'p. ' + b.pagina, title: 'Nota para la página ' + b.pagina });
          pg.addEventListener('click', function () { notaPagina(b.pagina, s.id); });
          node.insertBefore(pg, node.firstChild);
          pagPrev = b.pagina;
        }
        art.appendChild(node);
        marcarCambio(b, node);
      });
      lect.appendChild(art);
    });
    var pie = el('div', { 'class': 'nav-pie' }, [
      el('button', { 'class': 'btn', type: 'button', id: 'ant', text: '← Anterior' }),
      el('button', { 'class': 'btn', type: 'button', id: 'sig', text: 'Siguiente →' })
    ]);
    lect.appendChild(pie);
    $('#ant').addEventListener('click', function () { mover(-1); });
    $('#sig').addEventListener('click', function () { mover(1); });
  }
  function renderBloque(b) {
    var n;
    if (b.t === 'p') n = el('p', { 'class': 'bloque', html: b.html });
    else if (b.t === 'h3') n = el('h2', { 'class': 'bloque', html: b.html });
    else if (b.t === 'h4') n = el('h3', { 'class': 'bloque', html: b.html });
    else if (b.t === 'quote') n = el('blockquote', { 'class': 'bloque', html: b.html });
    else if (b.t === 'ul' || b.t === 'ol') { n = el(b.t, { 'class': 'bloque' }); b.html.forEach(function (it) { n.appendChild(el('li', { html: it })); }); }
    // una figura importada sin imagen (ausente o demasiado grande) conserva su leyenda
    else if (b.t === 'figure') { n = el('figure', { 'class': 'bloque' }, [b.html.src ? el('img', { src: b.html.src, alt: '', loading: 'lazy' }) : el('div', { 'class': 'fig-ausente', text: 'Figura sin imagen' }), el('figcaption', { html: b.html.caption })]); }
    else if (b.t === 'table') {
      var t = el('table'); b.html.forEach(function (fila, i) { var tr = el('tr'); fila.forEach(function (c) { tr.appendChild(el(i ? 'td' : 'th', { html: c })); }); t.appendChild(tr); });
      n = el('div', { 'class': 'bloque tabla' }, [t]);
    }
    else if (b.t === 'portada') { n = el('div', { 'class': 'bloque portada' }); var cls = ['t1', 't2', 't3', 'autor', 'anio']; b.html.forEach(function (l, i) { n.appendChild(el('div', { 'class': cls[i] || '', html: l })); }); }
    else n = el('div', { 'class': 'bloque', html: String(b.html) });
    n.setAttribute('data-pid', b.id);
    n.setAttribute('data-src', b.src);
    if (b.pagina) n.setAttribute('data-pg', b.pagina);
    ORIG[b.id] = n.innerHTML;
    return n;
  }
  function irA(sid, pid) {
    if (!SEC_BY_ID[sid]) return;
    secActual = sid;
    $$('article.seccion').forEach(function (a) { a.hidden = a.id !== 'sec-' + sid; });
    $$('nav a.sec').forEach(function (a) { var on = a.getAttribute('data-sid') === sid; a.classList.toggle('activa', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var act = $('nav a.sec.activa'); if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
    try { history.replaceState(null, '', '#' + sid); } catch (e) {}
    lsSet(LOCAL_KEY + ':ultima', sid);
    var lect = $('#lectura');
    if (pid) { var n = $('[data-pid="' + pid + '"]'); if (n) { n.scrollIntoView({ block: 'center' }); n.classList.add('flash'); setTimeout(function () { n.classList.remove('flash'); }, 1700); } }
    else lect.scrollTop = 0;
    lateral('indice', false);
    if (lectura && lectura.sid !== sid) { try { window.speechSynthesis.cancel(); } catch (e) {} detenerLectura(); }
    if (tab === 'capitulo') renderPanel();
    registrarVisto(sid);
    var i = SECS.findIndex(function (s) { return s.id === sid; });
    $('#ant').disabled = i <= 0; $('#sig').disabled = i >= SECS.length - 1;
  }
  function mover(d) { var i = SECS.findIndex(function (s) { return s.id === secActual; }); var j = i + d; if (SECS[j]) irA(SECS[j].id); }

