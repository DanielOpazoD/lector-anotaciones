  // ------------------------------------------------------------ lectores con identidad
  function chipAutor(id) {
    var p = PERFILES[id], c = el('span', { 'class': 'autor', title: 'Lector' }, [el('i', { style: 'background:' + ((p && p.color) || 'var(--fg-2)') }), el('span', { text: (p && p.name) || (id === ME ? 'yo' : 'otro lector') })]);
    return c;
  }
  function variosAutores() { var vistos = {}; Object.keys(anots).forEach(function (k) { if (anots[k].autor) vistos[anots[k].autor] = 1; }); return Object.keys(vistos).length > 1; }
  function resolverPerfiles(ids) {
    if (!USER || !USER.profiles) return;
    var nuevos = ids.filter(function (i) { return i && !PERFILES_PEDIDOS[i]; });
    if (!nuevos.length) return;
    nuevos.forEach(function (i) { PERFILES_PEDIDOS[i] = 1; });
    USER.profiles(nuevos).then(function (ps) { var cambio = false; Object.keys(ps || {}).forEach(function (i) { if (!PERFILES[i] || PERFILES[i].name !== ps[i].name) { PERFILES[i] = ps[i]; cambio = true; } }); if (cambio) renderPanel(); }).catch(function () {});
  }
  function pintarEtiquetas(f, a) {
    var ex = f.querySelector('.etiquetas'); if (ex) ex.remove();
    var tags = etiquetasDe(a); if (!tags.length) { renderSelectores(); return; }
    var et = el('div', { 'class': 'etiquetas' });
    tags.forEach(function (t) { var b = el('button', { type: 'button', text: '#' + t, title: 'Filtrar por #' + t }); b.addEventListener('click', function () { filtroEtiqueta = t; renderPanel(); }); et.appendChild(b); });
    var ta = f.querySelector('textarea'); if (ta && ta.nextSibling) f.insertBefore(et, ta.nextSibling); else f.appendChild(et);
    renderSelectores();
  }
  var etiquetasDe = N.etiquetasDe;
  function renderSelectores() {
    var autores = {}, tags = {};
    Object.keys(anots).forEach(function (k) { var a = anots[k]; if (a.autor) autores[a.autor] = 1; etiquetasDe(a).forEach(function (t) { tags[t] = 1; }); });
    var sa = $('#f-autor'), ids = Object.keys(autores);
    sa.hidden = ids.length < 2;
    if (!sa.hidden) {
      resolverPerfiles(ids);
      var actual = filtroAutor; sa.innerHTML = '';
      sa.appendChild(el('option', { value: '', text: 'todos los lectores' }));
      ids.forEach(function (i) { sa.appendChild(el('option', { value: i, text: (PERFILES[i] && PERFILES[i].name) || (i === ME ? 'yo' : 'lector ' + (ids.indexOf(i) + 1)) })); });
      sa.value = ids.indexOf(actual) >= 0 ? actual : ''; filtroAutor = sa.value;
    } else filtroAutor = '';
    var se = $('#f-etiqueta'), ts = Object.keys(tags).sort();
    se.hidden = !ts.length;
    if (!se.hidden) { var act = filtroEtiqueta; se.innerHTML = ''; se.appendChild(el('option', { value: '', text: 'todas las etiquetas' })); ts.forEach(function (t) { se.appendChild(el('option', { value: t, text: '#' + t })); }); se.value = ts.indexOf(act) >= 0 ? act : ''; filtroEtiqueta = se.value; }
    else filtroEtiqueta = '';
  }

