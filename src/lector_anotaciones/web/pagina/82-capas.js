// ------------------------------------------------------------ capas editoriales
function renderCapasMenu() {
  var det = $('#capas'),
    menu = $('#capas-menu'),
    claves = Object.keys(LIBRO.capas || {});
  det.hidden = !claves.length;
  if (det.hidden) return;
  menu.innerHTML = '';
  var total = {};
  SECS.forEach(function (s) {
    s.bloques.forEach(function (b) {
      if (b.m)
        Object.keys(b.m).forEach(function (k) {
          total[k] = (total[k] || 0) + b.m[k].length;
        });
    });
  });
  claves.forEach(function (k) {
    var cb = el('input', { type: 'checkbox', 'data-capa': k });
    cb.checked = !!CAPAS_ON[k];
    cb.addEventListener('change', function () {
      CAPAS_ON[k] = cb.checked;
      lsSet(LOCAL_KEY + ':capas', JSON.stringify(CAPAS_ON));
      pintarTodo();
      renderResumenCapas();
    });
    menu.appendChild(
      el('label', {}, [
        cb,
        el('span', { 'class': 'muestra capa k-' + k }),
        el('span', { text: LIBRO.capas[k] + ' (' + (total[k] || 0) + ')' }),
      ])
    );
  });
  renderResumenCapas();
}
function renderResumenCapas() {
  SECS.forEach(function (s) {
    var sp = $('#capas-' + s.id);
    if (!sp) return;
    var cuenta = {};
    s.bloques.forEach(function (b) {
      if (b.m)
        Object.keys(b.m).forEach(function (k) {
          if (CAPAS_ON[k]) cuenta[k] = (cuenta[k] || 0) + b.m[k].length;
        });
    });
    var partes = Object.keys(cuenta).map(function (k) {
      return cuenta[k] + ' ' + ((LIBRO.capas || {})[k] || k).replace(/ \(.*\)$/, '');
    });
    sp.textContent = partes.length ? partes.join(' · ') : '';
  });
}
