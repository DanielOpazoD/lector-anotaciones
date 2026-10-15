  // ------------------------------------------------------------ notas al margen (escritorio, pestaña «Sección»)
  // Las fichas de la sección se colocan a la altura de su pasaje, como los comentarios de un procesador de texto, y
  // acompañan al texto cuando se desplaza. La lista no se desplaza por su cuenta: una capa con las fichas se corre lo
  // mismo que el artículo (una sola transformación por cuadro), y el orden de las fichas en el documento —el del
  // teclado y el de los lectores de pantalla— sigue siendo el del libro.
  var MARGEN_KEY = 'lector-anotaciones.margen';
  var margenPref = lsGet(MARGEN_KEY) !== '0';
  var margenCuadro = 0, margenTemporizador = 0;
  function margenActivo() { return margenPref && !mqMovil.matches && tab === 'capitulo' && !$('#app').classList.contains('foco'); }
  function articuloActual() { var art = $('#sec-' + secActual); return art && !art.hidden ? art : null; }
  // El elemento del texto junto al que va la ficha: la marca del subrayado (o su bloque, si la cita se movió o se
  // reescribió), el número de página de una nota de página, el título de la sección para una nota de sección.
  function anclaDe(a, art) {
    if (a.tipo === 'subrayado') {
      var m = $('mark.hl[data-aids~="' + a.id + '"]', art); if (m) return m;
      var pid = pidEfectivo(a) || cambioDe(a);
      return pid ? $('[data-pid="' + pid + '"]', art) : null;
    }
    if (a.tipo === 'pagina') return $('.pg[data-pg="' + a.pagina + '"]', art);
    return $('h1.sec-titulo', art);
  }
  function colocarMargen() {
    var box = $('#lista'), capa = $('.capa-margen', box), art = articuloActual();
    if (!capa || !art) return;
    var ref = art.getBoundingClientRect().top, desfase = ref - box.getBoundingClientRect().top;
    var fichas = $$('.ficha', capa), items = fichas.map(function (f) {
      var id = f.getAttribute('data-id'), a = anots[id], n = a ? anclaDe(a, art) : null, r = n ? n.getBoundingClientRect() : null;
      var y = r && (r.width || r.height) ? r.top - ref : null;
      // la activa nunca queda por encima de lo que se ve de la lista (su pasaje arriba del todo, bajo la cabecera)
      if (id === fichaFoco && y !== null) y = Math.max(y, 8 - desfase);
      return { id: id, y: y, h: f.offsetHeight };
    });
    var lugar = N.apilar(items, fichaFoco, 8);
    fichas.forEach(function (f) { f.style.top = Math.round(lugar.tops[f.getAttribute('data-id')]) + 'px'; });
    capa.style.height = Math.max(0, Math.round(lugar.alto)) + 'px';
    sincronizarMargen();
  }
  function sincronizarMargen() {
    var box = $('#lista'), capa = $('.capa-margen', box), art = articuloActual();
    if (!capa || !art) return;
    capa.style.transform = 'translateY(' + Math.round(art.getBoundingClientRect().top - box.getBoundingClientRect().top) + 'px)';
  }
  // Para cambios que mueven el texto o las fichas (una imagen que carga, una nota que crece, un diff que se abre).
  function colocarMargenPronto() {
    if (!$('#lista .capa-margen')) return;
    clearTimeout(margenTemporizador);
    margenTemporizador = setTimeout(colocarMargen, 60);
  }
  // La ficha activa queda a la vista: si está por encima o por debajo de lo que se ve de la lista (su pasaje cerca del
  // borde de la ventana, o una ficha a la que se llegó con Tab), se desplaza el texto, y la ficha con él.
  function asegurarVisibleMargen(id) {
    var box = $('#lista'), f = $('.capa-margen .ficha[data-id="' + id + '"]', box), lect = $('#lectura');
    if (!f) return;
    var rb = box.getBoundingClientRect(), rf = f.getBoundingClientRect(), d = 0;
    if (rf.top < rb.top + 8) d = rf.top - rb.top - 16;
    else if (rf.bottom > rb.bottom - 8) d = Math.min(rf.bottom - rb.bottom + 16, rf.top - rb.top - 16);
    if (d) { lect.scrollTop += d; sincronizarMargen(); }
  }
  $('#lectura').addEventListener('scroll', function () {
    if (margenCuadro || !$('#lista .capa-margen')) return;
    margenCuadro = requestAnimationFrame(function () { margenCuadro = 0; sincronizarMargen(); });
  }, { passive: true });
  // el foco no desplaza la lista al margen (eso desalinearía las fichas): se corrige y se desplaza el texto
  $('#lista').addEventListener('scroll', function () {
    if (!$('.capa-margen', this) || !this.scrollTop) return;
    this.scrollTop = 0;
    if (fichaFoco) asegurarVisibleMargen(fichaFoco);
  });
  $('#panel').addEventListener('scroll', function () { if (this.classList.contains('margen') && this.scrollTop) this.scrollTop = 0; });
  $('#lectura').addEventListener('load', function (ev) { if (ev.target && ev.target.tagName === 'IMG') colocarMargenPronto(); }, true);
  window.addEventListener('resize', function () { ajustarTextareas(); if (margenActivo()) colocarMargenPronto(); });
  $('#b-margen').setAttribute('aria-pressed', margenPref ? 'true' : 'false');
  $('#b-margen').addEventListener('click', function () {
    margenPref = !margenPref;
    lsSet(MARGEN_KEY, margenPref ? '1' : '0');
    this.setAttribute('aria-pressed', margenPref ? 'true' : 'false');
    renderPanel();
  });
