  // ------------------------------------------------------------ barra de selección
  var tb = $('#sel-tb');
  var mqTactil = window.matchMedia ? window.matchMedia('(pointer: coarse)') : { matches: false };
  function ocultarTb() { tb.style.display = 'none'; }
  function mostrarTb() {
    var sel = window.getSelection(); if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { ocultarTb(); return; }
    var r = sel.getRangeAt(0), ex = extremosDeRango(r); if (!ex.pA || !ex.pB) { ocultarTb(); return; }
    var rect = r.getBoundingClientRect(); if (!rect.width && !rect.height) { ocultarTb(); return; }
    tb.style.display = 'flex';
    // En pantallas táctiles la barra va anclada abajo y con botones grandes: encima de la selección está el menú
    // nativo (copiar, buscar…) y los tiradores, que la taparían.
    tb.classList.toggle('abajo', !!mqTactil.matches);
    if (mqTactil.matches) return;
    var w = tb.offsetWidth || 220, h = tb.offsetHeight || 40;
    var left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), window.innerWidth - w - 8);
    // Encima de la selección; si no cabe, debajo; y siempre dentro de la ventana (una selección más alta que la
    // pantalla, tras un arrastre con desplazamiento, desborda por los dos lados).
    var top = rect.top - h - 8; if (top < 8) top = rect.bottom + 8;
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    tb.style.left = left + 'px'; tb.style.top = top + 'px';
  }
  document.addEventListener('selectionchange', function () { clearTimeout(window.__selT); window.__selT = setTimeout(mostrarTb, 180); });
  $$('#sel-tb .col-btn').forEach(function (b) { b.addEventListener('mousedown', function (ev) { ev.preventDefault(); }); b.addEventListener('click', function () { crearSubrayado(b.getAttribute('data-c'), false); }); });
  $('#sel-nota').addEventListener('mousedown', function (ev) { ev.preventDefault(); });
  $('#sel-nota').addEventListener('click', function () { crearSubrayado('revisar', true); });
  $('#sel-copiar').addEventListener('mousedown', function (ev) { ev.preventDefault(); });
  $('#sel-copiar').addEventListener('click', function () { copiarSeleccion(this); });

  // ------------------------------------------------------------ pestañas y filtros del panel
  // Las pestañas siguen el patrón de WAI-ARIA: una sola en el orden de Tab, flechas para moverse entre ellas.
  function marcarTab() {
    $$('.tab').forEach(function (t) { var on = t.getAttribute('data-tab') === tab; t.classList.toggle('activa', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; });
    $('#lista').setAttribute('aria-labelledby', 'tab-' + tab);
  }
  // El resumen junto a «Filtros» dice qué está escondiendo fichas aunque el desplegable esté cerrado.
  function marcarFiltro() {
    $$('.filtro').forEach(function (x) { var on = x.getAttribute('data-f') === filtro; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    var partes = [];
    if (filtro !== 'todas') { var b = $('.filtro[data-f="' + filtro + '"]'); partes.push(b ? b.textContent : filtro); }
    if (filtroAutor) { var o = $('#f-autor').selectedOptions; partes.push(o && o[0] ? o[0].textContent : 'un lector'); }
    if (filtroEtiqueta) partes.push('#' + filtroEtiqueta);
    $('#filtro-resumen').textContent = partes.length ? '· ' + partes.join(', ') : '';
  }
  function quitarFiltros() { filtro = 'todas'; filtroAutor = ''; filtroEtiqueta = ''; }
  $$('.tab').forEach(function (t) { t.addEventListener('click', function () { tab = t.getAttribute('data-tab'); marcarTab(); if (tab === 'buscar') buscar($('#buscar').value); else renderPanel(); }); });
  $('.tabs').addEventListener('keydown', function (ev) {
    var ts = $$('.tab'), i = ts.indexOf(document.activeElement); if (i < 0) return;
    var j = ev.key === 'ArrowRight' ? i + 1 : ev.key === 'ArrowLeft' ? i - 1 : ev.key === 'Home' ? 0 : ev.key === 'End' ? ts.length - 1 : null;
    if (j === null) return;
    ev.preventDefault(); j = (j + ts.length) % ts.length; ts[j].focus(); ts[j].click();
  });
  $$('.filtro').forEach(function (f) { f.addEventListener('click', function () { filtro = f.getAttribute('data-f'); if (tab === 'buscar') { tab = 'todas'; marcarTab(); } renderPanel(); }); });

  // ------------------------------------------------------------ controles
  $('#b-nota-cap').addEventListener('click', notaSeccion);
  $('#b-nota-gen').addEventListener('click', notaGeneral);
  $('#b-nota-pg').addEventListener('click', function () { notaPagina($('#pg-num').value, secActual); });
  $('#pg-num').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') notaPagina($('#pg-num').value, secActual); });
  $('#b-copiar').addEventListener('click', function () { copiar(exportarJSON(), this); });
  $('#b-copiar-md').addEventListener('click', function () { copiar(exportarMD(), this); });
  $('#buscar').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') buscar(this.value); });

  // ------------------------------------------------------------ índice y panel en pantalla estrecha
  // Son cajones que se deslizan sobre el texto. Cerrados quedan fuera de la vista e inertes (fuera del orden de Tab y
  // del árbol de accesibilidad). Abierto uno, el resto de la página queda detrás de un velo: tocar fuera lo cierra, el
  // teclado no se escapa a lo que no se ve, y al cerrarlo el foco vuelve a donde estaba.
  var mqMovil = window.matchMedia ? window.matchMedia('(max-width: 1000px)') : { matches: false };
  var volverA = null;
  function cajonAbierto() {
    if (!mqMovil.matches) return null;
    return ['indice', 'panel'].filter(function (c) { return $('#' + c).classList.contains('abierta'); })[0] || null;
  }
  function sincronizarLaterales() {
    var abierto = cajonAbierto();
    ['indice', 'panel'].forEach(function (cual) {
      var n = $('#' + cual);
      n.inert = !!mqMovil.matches && cual !== abierto;
      $('#b-' + cual).setAttribute('aria-expanded', cual === abierto ? 'true' : 'false');
    });
    $('#velo').hidden = !abierto; $('#velo').classList.toggle('claro', abierto === 'panel');
    $('#lectura').classList.toggle('con-hoja', abierto === 'panel');
    $('header.barra').inert = !!abierto;
    $('#lectura').inert = !!abierto;
  }
  // `origen`: a dónde vuelve el foco al cerrar, si no es el control que lo abrió (el pasaje de una nota recién creada).
  function lateral(cual, abierto, origen) {
    var n = $('#' + cual), antes = n.classList.contains('abierta');
    var ahora = abierto === 'alternar' ? !antes : !!abierto;
    if (ahora === antes) return;
    var activo = document.activeElement;
    if (ahora && mqMovil.matches) {
      var otro = $('#' + (cual === 'indice' ? 'panel' : 'indice'));
      if (otro.classList.contains('abierta')) otro.classList.remove('abierta');
      else volverA = origen || (activo && activo !== document.body ? activo : null);
    }
    n.classList.toggle('abierta', ahora);
    sincronizarLaterales();
    if (!mqMovil.matches) return;
    if (ahora) {
      if (!n.contains(document.activeElement)) {
        var dentro = cual === 'indice' ? $('a.sec.activa', n) || $('a.sec', n) : $('.tab.activa', n);
        (dentro || $('.cerrar', n)).focus({ preventScroll: true });
      }
    } else if (n.contains(activo) || !activo || activo === document.body) {
      var destino = volverA && document.contains(volverA) && !volverA.closest('.cajon, [inert]') ? volverA : null;
      if (!destino && cual === 'panel' && fichaFoco) destino = $('mark.hl[data-aids~="' + fichaFoco + '"]');
      (destino || $('#b-' + cual)).focus({ preventScroll: true });
      volverA = null;
    }
  }
  function cerrarCajones() { var c = cajonAbierto(); if (c) lateral(c, false); }
  if (mqMovil.addEventListener) mqMovil.addEventListener('change', sincronizarLaterales); else if (mqMovil.addListener) mqMovil.addListener(sincronizarLaterales);
  sincronizarLaterales();
  $('#b-indice').addEventListener('click', function () { lateral('indice', 'alternar'); });
  $('#b-panel').addEventListener('click', function () { lateral('panel', 'alternar'); });
  $$('[data-cerrar]').forEach(function (b) { b.addEventListener('click', function () { lateral(b.getAttribute('data-cerrar'), false); }); });
  $('#velo').addEventListener('click', function () { cerrarCajones(); salirDeFicha(); });
  $('#b-mas').addEventListener('click', function () { var on = $('#herramientas').classList.toggle('abierta'); this.setAttribute('aria-expanded', on ? 'true' : 'false'); });

  // ------------------------------------------------------------ salir de una ficha
  // Deja de resaltar la ficha y su pasaje sin redibujar nada, para no mover el foco ni el desplazamiento; lo escrito en
  // la nota ya se guardó al perder el foco.
  function salirDeFicha() {
    if (!fichaFoco) return;
    fichaFoco = null;
    $$('.ficha.foco, mark.hl.foco').forEach(function (n) { n.classList.remove('foco'); });
  }
  // Esc o Ctrl+Enter dentro de una nota: se guarda (al perder el foco), se sale de la ficha y el foco vuelve al pasaje
  // subrayado, o a la ficha si no tiene pasaje; en pantalla estrecha se cierra además el panel.
  function volverAlTexto(id) {
    var m = $('mark.hl[data-aids~="' + id + '"]'), f = $('.ficha[data-id="' + id + '"]');
    if (cajonAbierto() === 'panel') { volverA = m || null; lateral('panel', false); }
    else if (m) m.focus({ preventScroll: true });
    else if (f) f.focus({ preventScroll: true });
    salirDeFicha();
  }

  // ------------------------------------------------------------ diálogos (atajos, figura ampliada)
  // <dialog> modal: el navegador atrapa el foco, deja inerte el resto y cierra con Esc; un clic en el fondo también cierra.
  function abrirDialogo(d) { if (d.open) return; try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
  function cerrarDialogo(d) { if (!d.open) return; try { d.close(); } catch (e) { d.removeAttribute('open'); } }
  function alternarAtajos() { var d = $('#atajos'); if (d.open) cerrarDialogo(d); else abrirDialogo(d); }
  $('#atajos').addEventListener('click', function (ev) { if (ev.target === this || ev.target.closest('.cerrar')) cerrarDialogo(this); });
  $('#lightbox').addEventListener('click', function () { cerrarDialogo(this); });
  $('#b-atajos').addEventListener('click', alternarAtajos);
  $('#lectura').addEventListener('click', function (ev) {
    var img = ev.target.closest('figure img'); if (!img) return;
    var lb = $('#lightbox'), cap = img.closest('figure').querySelector('figcaption');
    $('img', lb).src = img.src; $('img', lb).alt = cap ? cap.textContent : 'Figura';
    abrirDialogo(lb);
  });

  $('#f-autor').addEventListener('change', function () { filtroAutor = this.value; renderPanel(); });
  $('#f-etiqueta').addEventListener('change', function () { filtroEtiqueta = this.value; renderPanel(); });
  $('#b-foco').addEventListener('click', function () { alternarFoco(); });
  function alternarFoco() { var on = $('#app').classList.toggle('foco'); lsSet(LOCAL_KEY + ':foco', on ? '1' : ''); $('#b-foco').textContent = on ? 'Salir de concentración' : 'Concentración'; $('#b-foco').setAttribute('aria-pressed', on ? 'true' : 'false'); }
  var COLOR_TECLA = { '1': 'revisar', '2': 'cortar', '3': 'duda', '4': 'conservar' };
  document.addEventListener('keydown', function (ev) {
    var tg = ev.target || {}, tagName = tg.tagName || '';
    if ($('dialog[open]')) return;  // el diálogo abierto atiende su propio Esc
    if (/TEXTAREA|SELECT/.test(tagName) || (tagName === 'INPUT' && !/checkbox|radio|button/.test(tg.type || ''))) return;
    if (ev.metaKey || ev.ctrlKey) return;
    var sel = window.getSelection(), haySel = sel && sel.rangeCount && !sel.isCollapsed && ancestroPid(sel.getRangeAt(0).startContainer);
    if (ev.key === 'ArrowRight' && ev.altKey) mover(1); else if (ev.key === 'ArrowLeft' && ev.altKey) mover(-1);
    else if (ev.key === 'Escape') {
      // de a una capa por vez: menú abierto, cajón, concentración, ficha
      var menu = $$('details.menu-det[open]');
      if (menu.length) { menu.forEach(function (d) { d.open = false; $('summary', d).focus({ preventScroll: true }); }); return; }
      ocultarTb();
      if (lectura) { try { window.speechSynthesis.cancel(); } catch (e) {} detenerLectura(); }
      if (cajonAbierto()) { cerrarCajones(); salirDeFicha(); return; }
      if ($('#app').classList.contains('foco')) { alternarFoco(); return; }
      salirDeFicha();
    }
    else if (COLOR_TECLA[ev.key] && haySel) { ev.preventDefault(); crearSubrayado(COLOR_TECLA[ev.key], false); }
    else if ((ev.key === 'n' || ev.key === 'N') && haySel) { ev.preventDefault(); crearSubrayado('revisar', true); }
    else if ((ev.key === 'c' || ev.key === 'C') && haySel) { ev.preventDefault(); copiarSeleccion($('#sel-copiar')); }
    else if (ev.key === 'j' || ev.key === 'J') mover(1);
    else if (ev.key === 'k' || ev.key === 'K') mover(-1);
    else if (ev.key === 'l' || ev.key === 'L') alternarLeida(secActual);
    else if (ev.key === 'f' || ev.key === 'F') alternarFoco();
    else if (ev.key === '?') alternarAtajos();
  });
  // Un clic fuera cierra lo que flota: la barra de subrayado (si ya no hay selección), los menús de la barra y la ficha
  // en edición. Fuera de una ficha quiere decir en el texto o en el fondo, no en un control: el botón que crea otra
  // nota, por ejemplo, la enfoca él mismo.
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!tb.contains(t)) { var s = window.getSelection(); if (!s || s.isCollapsed) ocultarTb(); }
    $$('details.menu-det[open]').forEach(function (d) { if (!d.contains(t)) d.open = false; });
    if (fichaFoco && t && t.closest && !t.closest('.ficha, mark.hl, #sel-tb, dialog, #velo, button, a, input, select, textarea, label, summary, .res')) salirDeFicha();
  });
  // El enlace «Saltar al texto» lleva el foco a la lectura sin tocar el ancla (que guarda la sección abierta).
  $('.saltar').addEventListener('click', function (ev) { ev.preventDefault(); $('#lectura').focus(); });
  window.addEventListener('hashchange', function () { var h = (location.hash || '').replace('#', ''); if (SEC_BY_ID[h] && h !== secActual) irA(h); });
