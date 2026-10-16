// ------------------------------------------------------------ búsqueda
(function (P, E) {
  // lo que este fragmento ofrece a los demás (las funciones se elevan: están desde el principio)
  P.buscar = buscar;
  function buscar(q) {
    P.cambiarTab('buscar');
    if (P.mqMovil.matches) P.cerrarHerramientas();
    // los resultados son una lista que se desplaza, no fichas al margen
    var box = P.$('#lista');
    box.innerHTML = '';
    box.classList.remove('al-margen');
    P.$('#panel').classList.remove('margen');
    P.soltarMargen();
    q = (q || '').trim();
    if (q.length < 2) {
      box.appendChild(P.el('div', { 'class': 'vacio', text: 'Escribe al menos dos letras.' }));
      return;
    }
    var norm = P.N.normalizar;
    var nq = norm(q),
      n = 0;
    var enAnots = Object.keys(P.anots)
      .map(function (k) {
        return P.anots[k];
      })
      .filter(function (a) {
        return (
          norm((a.nota || '') + ' ' + (a.cita || '') + ' ' + (a.respuesta || '') + ' ' + (a.replica || '')).indexOf(
            nq
          ) >= 0
        );
      });
    enAnots.sort(function (x, y) {
      return P.ordenKey(x) < P.ordenKey(y) ? -1 : 1;
    });
    enAnots.forEach(function (a) {
      var r = P.el('div', { 'class': 'res anot', role: 'button', tabindex: '0' }, [
        P.el('div', { 'class': 'donde', text: 'En tus anotaciones · ' + P.etiqueta(a) }),
        P.el('div', { text: (a.nota || a.cita || '').slice(0, 160) }),
      ]);
      r.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          r.click();
        }
      });
      r.addEventListener('click', function () {
        P.irAAnot(P.anots[a.id] || a, true);
      });
      box.appendChild(r);
    });
    E.SECS.forEach(function (s) {
      s.bloques.forEach(function (b) {
        if (!P.$('[data-pid="' + b.id + '"]')) return;
        var t = P.textoPlano(b.id),
          nt = norm(t),
          i = nt.indexOf(nq);
        if (i < 0) return;
        n++;
        if (n > 200) return;
        var ini = Math.max(0, i - 60),
          fin = Math.min(t.length, i + nq.length + 80);
        var r = P.el('div', { 'class': 'res', role: 'button', tabindex: '0' }, [
          P.el('div', { 'class': 'donde', text: s.titulo + (b.pagina ? ' · p. ' + b.pagina : '') }),
        ]);
        r.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            r.click();
          }
        });
        var frag = P.el('div');
        frag.appendChild(document.createTextNode((ini ? '…' : '') + t.slice(ini, i)));
        frag.appendChild(P.el('b', { text: t.slice(i, i + nq.length) }));
        frag.appendChild(document.createTextNode(t.slice(i + nq.length, fin) + (fin < t.length ? '…' : '')));
        r.appendChild(frag);
        r.addEventListener('click', function () {
          P.irA(s.id, b.id);
          if (P.mqMovil.matches) {
            E.volverA = null;
            P.lateral('panel', false);
          }
          // el foco va al pasaje encontrado (no al campo de búsqueda, que en el teléfono abriría el teclado)
          var n = P.$('[data-pid="' + b.id + '"]');
          if (n) {
            n.setAttribute('tabindex', '-1');
            n.focus({ preventScroll: true });
          }
        });
        box.appendChild(r);
      });
    });
    box.insertBefore(
      P.el('div', {
        'class': 'vacio',
        text:
          (enAnots.length ? enAnots.length + ' en las anotaciones · ' : '') +
          (n
            ? n + (n > 200 ? ' coincidencias en el libro (se muestran 200)' : ' coincidencias en el libro')
            : 'sin coincidencias en el libro'),
      }),
      box.firstChild
    );
    if (P.mqMovil.matches) P.lateral('panel', true);
  }
})(LAPagina, LAEstado);
