// ------------------------------------------------------------ capas editoriales
(function (P, E) {
  // lo que este fragmento ofrece a los demás (las funciones se elevan: están desde el principio)
  P.renderCapasMenu = renderCapasMenu;
  function renderCapasMenu() {
    var det = P.$('#capas'),
      menu = P.$('#capas-menu'),
      claves = Object.keys(E.LIBRO.capas || {});
    det.hidden = !claves.length;
    if (det.hidden) return;
    menu.innerHTML = '';
    var total = {};
    E.SECS.forEach(function (s) {
      s.bloques.forEach(function (b) {
        if (b.m)
          Object.keys(b.m).forEach(function (k) {
            total[k] = (total[k] || 0) + b.m[k].length;
          });
      });
    });
    claves.forEach(function (k) {
      var cb = P.el('input', { type: 'checkbox', 'data-capa': k });
      cb.checked = !!E.CAPAS_ON[k];
      cb.addEventListener('change', function () {
        E.CAPAS_ON[k] = cb.checked;
        P.lsSet(E.LOCAL_KEY + ':capas', JSON.stringify(E.CAPAS_ON));
        P.pintarTodo();
        renderResumenCapas();
      });
      menu.appendChild(
        P.el('label', {}, [
          cb,
          P.el('span', { 'class': 'muestra capa k-' + k }),
          P.el('span', { text: E.LIBRO.capas[k] + ' (' + (total[k] || 0) + ')' }),
        ])
      );
    });
    renderResumenCapas();
  }
  function renderResumenCapas() {
    E.SECS.forEach(function (s) {
      var sp = P.$('#capas-' + s.id);
      if (!sp) return;
      var cuenta = {};
      s.bloques.forEach(function (b) {
        if (b.m)
          Object.keys(b.m).forEach(function (k) {
            if (E.CAPAS_ON[k]) cuenta[k] = (cuenta[k] || 0) + b.m[k].length;
          });
      });
      var partes = Object.keys(cuenta).map(function (k) {
        return cuenta[k] + ' ' + ((E.LIBRO.capas || {})[k] || k).replace(/ \(.*\)$/, '');
      });
      sp.textContent = partes.length ? partes.join(' · ') : '';
    });
  }
})(LAPagina, LAEstado);
