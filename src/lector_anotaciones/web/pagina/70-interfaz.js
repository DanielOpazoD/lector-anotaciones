  // ------------------------------------------------------------ barra de selección
  var tb = $('#sel-tb');
  function ocultarTb() { tb.style.display = 'none'; }
  function mostrarTb() {
    var sel = window.getSelection(); if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { ocultarTb(); return; }
    var r = sel.getRangeAt(0), ex = extremosDeRango(r); if (!ex.pA || !ex.pB) { ocultarTb(); return; }
    var rect = r.getBoundingClientRect(); if (!rect.width && !rect.height) { ocultarTb(); return; }
    tb.style.display = 'flex';
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

  // ------------------------------------------------------------ controles
  $$('.tab').forEach(function (t) { t.addEventListener('click', function () { tab = t.getAttribute('data-tab'); $$('.tab').forEach(function (x) { x.classList.toggle('activa', x === t); }); if (tab === 'buscar') buscar($('#buscar').value); else renderPanel(); }); });
  $$('.filtro').forEach(function (f) { f.addEventListener('click', function () { filtro = f.getAttribute('data-f'); $$('.filtro').forEach(function (x) { x.classList.toggle('on', x === f); }); if (tab === 'buscar') { tab = 'todas'; $$('.tab').forEach(function (x) { x.classList.toggle('activa', x.getAttribute('data-tab') === 'todas'); }); } renderPanel(); }); });
  $('#b-nota-cap').addEventListener('click', notaSeccion);
  $('#b-nota-gen').addEventListener('click', notaGeneral);
  $('#b-nota-pg').addEventListener('click', function () { notaPagina($('#pg-num').value, secActual); });
  $('#pg-num').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') notaPagina($('#pg-num').value, secActual); });
  $('#b-copiar').addEventListener('click', function () { copiar(exportarJSON(), this); });
  $('#b-copiar-md').addEventListener('click', function () { copiar(exportarMD(), this); });
  $('#buscar').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') buscar(this.value); });
  // Índice y panel en pantalla estrecha: fuera de la vista cuando están cerrados, y entonces inertes (fuera del orden
  // de Tab y del árbol de accesibilidad); sus botones dicen si están abiertos.
  var mqMovil = window.matchMedia ? window.matchMedia('(max-width: 1000px)') : { matches: false };
  function sincronizarLaterales() {
    ['indice', 'panel'].forEach(function (cual) {
      var n = $('#' + cual), abierto = n.classList.contains('abierta');
      n.inert = !!mqMovil.matches && !abierto;
      $('#b-' + cual).setAttribute('aria-expanded', abierto ? 'true' : 'false');
    });
  }
  function lateral(cual, abierto) {
    var n = $('#' + cual);
    n.classList.toggle('abierta', abierto === 'alternar' ? !n.classList.contains('abierta') : !!abierto);
    sincronizarLaterales();
  }
  if (mqMovil.addEventListener) mqMovil.addEventListener('change', sincronizarLaterales); else if (mqMovil.addListener) mqMovil.addListener(sincronizarLaterales);
  sincronizarLaterales();
  $('#b-indice').addEventListener('click', function () { lateral('indice', 'alternar'); lateral('panel', false); });
  $('#b-panel').addEventListener('click', function () { lateral('panel', 'alternar'); lateral('indice', false); });
  $('#f-autor').addEventListener('change', function () { filtroAutor = this.value; renderPanel(); });
  $('#f-etiqueta').addEventListener('change', function () { filtroEtiqueta = this.value; renderPanel(); });
  $('#b-foco').addEventListener('click', function () { alternarFoco(); });
  $('#b-atajos').addEventListener('click', function () { $('#atajos').classList.toggle('abierto'); });
  $('#lightbox').addEventListener('click', function () { this.classList.remove('abierto'); });
  $('#lectura').addEventListener('click', function (ev) { var img = ev.target.closest('figure img'); if (img) { $('#lightbox img').src = img.src; $('#lightbox').classList.add('abierto'); } });
  function alternarFoco() { var on = $('#app').classList.toggle('foco'); lsSet(LOCAL_KEY + ':foco', on ? '1' : ''); $('#b-foco').textContent = on ? 'Salir de concentración' : 'Concentración'; }
  var COLOR_TECLA = { '1': 'revisar', '2': 'cortar', '3': 'duda', '4': 'conservar' };
  document.addEventListener('keydown', function (ev) {
    var tg = ev.target || {}, tagName = tg.tagName || '';
    if (/TEXTAREA|SELECT/.test(tagName) || (tagName === 'INPUT' && !/checkbox|radio|button/.test(tg.type || ''))) return;
    if (ev.metaKey || ev.ctrlKey) return;
    var sel = window.getSelection(), haySel = sel && sel.rangeCount && !sel.isCollapsed && ancestroPid(sel.getRangeAt(0).startContainer);
    if (ev.key === 'ArrowRight' && ev.altKey) mover(1); else if (ev.key === 'ArrowLeft' && ev.altKey) mover(-1);
    else if (ev.key === 'Escape') { ocultarTb(); lateral('indice', false); lateral('panel', false); $('#lightbox').classList.remove('abierto'); $('#atajos').classList.remove('abierto'); $('#capas').open = false; if (lectura) { try { window.speechSynthesis.cancel(); } catch (e) {} detenerLectura(); } if ($('#app').classList.contains('foco')) alternarFoco(); }
    else if (COLOR_TECLA[ev.key] && haySel) { ev.preventDefault(); crearSubrayado(COLOR_TECLA[ev.key], false); }
    else if ((ev.key === 'n' || ev.key === 'N') && haySel) { ev.preventDefault(); crearSubrayado('revisar', true); }
    else if ((ev.key === 'c' || ev.key === 'C') && haySel) { ev.preventDefault(); copiarSeleccion($('#sel-copiar')); }
    else if (ev.key === 'j' || ev.key === 'J') mover(1);
    else if (ev.key === 'k' || ev.key === 'K') mover(-1);
    else if (ev.key === 'l' || ev.key === 'L') alternarLeida(secActual);
    else if (ev.key === 'f' || ev.key === 'F') alternarFoco();
    else if (ev.key === '?') $('#atajos').classList.toggle('abierto');
  });
  document.addEventListener('click', function (ev) { if (!tb.contains(ev.target)) { var s = window.getSelection(); if (!s || s.isCollapsed) ocultarTb(); } if (!$('#capas').contains(ev.target)) $('#capas').open = false; });
  window.addEventListener('hashchange', function () { var h = (location.hash || '').replace('#', ''); if (SEC_BY_ID[h] && h !== secActual) irA(h); });

