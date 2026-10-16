// ------------------------------------------------------------ lectores con identidad
(function (P, E) {
  // lo que este fragmento ofrece a los demás (las funciones se elevan: están desde el principio)
  P.chipAutor = chipAutor;
  P.variosAutores = variosAutores;
  P.resolverPerfiles = resolverPerfiles;
  P.etiquetasFicha = etiquetasFicha;
  P.pintarEtiquetas = pintarEtiquetas;
  P.renderSelectores = renderSelectores;
  // El lector de una anotación, con el perfil que se tenga de él (`yo`: es quien lee). Puro: lo usa la ficha al dibujar.
  function chipAutor(perfil, yo) {
    return P.el('span', { 'class': 'autor', title: 'Lector' }, [
      P.el('i', { style: 'background:' + ((perfil && perfil.color) || 'var(--fg-2)') }),
      P.el('span', { text: (perfil && perfil.name) || (yo ? 'yo' : 'otro lector') }),
    ]);
  }
  function variosAutores() {
    var vistos = {};
    Object.keys(P.anots).forEach(function (k) {
      if (P.anots[k].autor) vistos[P.anots[k].autor] = 1;
    });
    return Object.keys(vistos).length > 1;
  }
  function resolverPerfiles(ids) {
    if (!E.USER || !E.USER.profiles) return;
    var nuevos = ids.filter(function (i) {
      return i && !P.PERFILES_PEDIDOS[i];
    });
    if (!nuevos.length) return;
    nuevos.forEach(function (i) {
      P.PERFILES_PEDIDOS[i] = 1;
    });
    E.USER.profiles(nuevos)
      .then(function (ps) {
        var cambio = false;
        Object.keys(ps || {}).forEach(function (i) {
          if (!P.PERFILES[i] || P.PERFILES[i].name !== ps[i].name) {
            P.PERFILES[i] = ps[i];
            cambio = true;
          }
        });
        if (cambio) P.renderPanel();
      })
      .catch(function (e) {
        P.fallo('perfiles', e);
      });
  }
  // Las etiquetas de la nota (#así), como botones que filtran por ellas; null si no tiene. Puro: lo usa la ficha al dibujar.
  function etiquetasFicha(a) {
    var tags = etiquetasDe(a);
    if (!tags.length) return null;
    var et = P.el('div', { 'class': 'etiquetas' });
    tags.forEach(function (t) {
      var b = P.el('button', { type: 'button', text: '#' + t, title: 'Filtrar por #' + t });
      b.addEventListener('click', function () {
        P.VISTA.cambiar({ filtroEtiqueta: t });
        P.renderPanel();
      });
      et.appendChild(b);
    });
    return et;
  }
  // Tras guardar una nota sin redibujar la ficha: sus etiquetas, al día, tras el cuadro de la nota, y los selectores.
  function pintarEtiquetas(f, a) {
    var ex = f.querySelector('.etiquetas');
    if (ex) ex.remove();
    var et = etiquetasFicha(a),
      ta = f.querySelector('textarea');
    if (et) f.insertBefore(et, ta ? ta.nextSibling : null);
    renderSelectores();
  }
  var etiquetasDe = P.N.etiquetasDe;
  P.etiquetasDe = etiquetasDe;
  function renderSelectores() {
    var autores = {},
      tags = {};
    Object.keys(P.anots).forEach(function (k) {
      var a = P.anots[k];
      if (a.autor) autores[a.autor] = 1;
      etiquetasDe(a).forEach(function (t) {
        tags[t] = 1;
      });
    });
    var sa = P.$('#f-autor'),
      ids = Object.keys(autores);
    sa.hidden = ids.length < 2;
    if (!sa.hidden) {
      resolverPerfiles(ids);
      var actual = P.V.filtroAutor;
      sa.innerHTML = '';
      sa.appendChild(P.el('option', { value: '', text: 'todos los lectores' }));
      ids.forEach(function (i) {
        sa.appendChild(
          P.el('option', {
            value: i,
            text: (P.PERFILES[i] && P.PERFILES[i].name) || (i === E.ME ? 'yo' : 'lector ' + (ids.indexOf(i) + 1)),
          })
        );
      });
      sa.value = ids.indexOf(actual) >= 0 ? actual : '';
      P.VISTA.cambiar({ filtroAutor: sa.value });
    } else P.VISTA.cambiar({ filtroAutor: '' });
    var se = P.$('#f-etiqueta'),
      ts = Object.keys(tags).sort();
    se.hidden = !ts.length;
    if (!se.hidden) {
      var act = P.V.filtroEtiqueta;
      se.innerHTML = '';
      se.appendChild(P.el('option', { value: '', text: 'todas las etiquetas' }));
      ts.forEach(function (t) {
        se.appendChild(P.el('option', { value: t, text: '#' + t }));
      });
      se.value = ts.indexOf(act) >= 0 ? act : '';
      P.VISTA.cambiar({ filtroEtiqueta: se.value });
    } else P.VISTA.cambiar({ filtroEtiqueta: '' });
  }
})(LAPagina, LAEstado);
