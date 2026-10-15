// ------------------------------------------------------------ búsqueda
function buscar(q) {
  cambiarTab('buscar');
  marcarTab();
  if (mqMovil.matches) cerrarHerramientas();
  // los resultados son una lista que se desplaza, no fichas al margen
  var box = $('#lista');
  box.innerHTML = '';
  box.classList.remove('al-margen');
  $('#panel').classList.remove('margen');
  soltarMargen();
  q = (q || '').trim();
  if (q.length < 2) {
    box.appendChild(el('div', { 'class': 'vacio', text: 'Escribe al menos dos letras.' }));
    return;
  }
  var norm = N.normalizar;
  var nq = norm(q),
    n = 0;
  var enAnots = Object.keys(anots)
    .map(function (k) {
      return anots[k];
    })
    .filter(function (a) {
      return (
        norm((a.nota || '') + ' ' + (a.cita || '') + ' ' + (a.respuesta || '') + ' ' + (a.replica || '')).indexOf(nq) >=
        0
      );
    });
  enAnots.sort(function (x, y) {
    return ordenKey(x) < ordenKey(y) ? -1 : 1;
  });
  enAnots.forEach(function (a) {
    var r = el('div', { 'class': 'res anot', role: 'button', tabindex: '0' }, [
      el('div', { 'class': 'donde', text: 'En tus anotaciones · ' + etiqueta(a) }),
      el('div', { text: (a.nota || a.cita || '').slice(0, 160) }),
    ]);
    r.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        r.click();
      }
    });
    r.addEventListener('click', function () {
      irAAnot(anots[a.id] || a, true);
    });
    box.appendChild(r);
  });
  SECS.forEach(function (s) {
    s.bloques.forEach(function (b) {
      if (!$('[data-pid="' + b.id + '"]')) return;
      var t = textoPlano(b.id),
        nt = norm(t),
        i = nt.indexOf(nq);
      if (i < 0) return;
      n++;
      if (n > 200) return;
      var ini = Math.max(0, i - 60),
        fin = Math.min(t.length, i + nq.length + 80);
      var r = el('div', { 'class': 'res', role: 'button', tabindex: '0' }, [
        el('div', { 'class': 'donde', text: s.titulo + (b.pagina ? ' · p. ' + b.pagina : '') }),
      ]);
      r.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          r.click();
        }
      });
      var frag = el('div');
      frag.appendChild(document.createTextNode((ini ? '…' : '') + t.slice(ini, i)));
      frag.appendChild(el('b', { text: t.slice(i, i + nq.length) }));
      frag.appendChild(document.createTextNode(t.slice(i + nq.length, fin) + (fin < t.length ? '…' : '')));
      r.appendChild(frag);
      r.addEventListener('click', function () {
        irA(s.id, b.id);
        if (mqMovil.matches) {
          volverA = null;
          lateral('panel', false);
        }
        // el foco va al pasaje encontrado (no al campo de búsqueda, que en el teléfono abriría el teclado)
        var n = $('[data-pid="' + b.id + '"]');
        if (n) {
          n.setAttribute('tabindex', '-1');
          n.focus({ preventScroll: true });
        }
      });
      box.appendChild(r);
    });
  });
  box.insertBefore(
    el('div', {
      'class': 'vacio',
      text:
        (enAnots.length ? enAnots.length + ' en las anotaciones · ' : '') +
        (n
          ? n + (n > 200 ? ' coincidencias en el libro (se muestran 200)' : ' coincidencias en el libro')
          : 'sin coincidencias en el libro'),
    }),
    box.firstChild
  );
  if (mqMovil.matches) lateral('panel', true);
}
