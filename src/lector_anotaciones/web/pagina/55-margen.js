// ------------------------------------------------------------ notas al margen (escritorio, pestaña «Sección»)
// Las fichas de la sección se colocan a la altura de su pasaje, como los comentarios de un procesador de texto, y
// acompañan al texto cuando se desplaza. La lista no se desplaza por su cuenta: una capa con las fichas se corre lo
// mismo que el artículo (una sola transformación por cuadro), y el orden de las fichas en el documento —el del
// teclado y el de los lectores de pantalla— sigue siendo el del libro.
var MARGEN_KEY = 'lector-anotaciones.margen';
var margenPref = lsGet(MARGEN_KEY) !== '0';
var margenCuadro = 0,
  margenTemporizador = 0;
function margenActivo() {
  return margenPref && !mqMovil.matches && tab === 'capitulo' && !$('#app').classList.contains('foco');
}
function articuloActual() {
  var art = $('#sec-' + secActual);
  return art && !art.hidden ? art : null;
}
// El elemento del texto junto al que va la ficha: la marca del subrayado (o su bloque, si la cita se movió o se
// reescribió), el número de página de una nota de página, el título de la sección para una nota de sección.
function anclaDe(a, art) {
  if (a.tipo === 'subrayado') {
    var m = $('mark.hl[data-aids~="' + a.id + '"]', art);
    if (m) return m;
    var pid = pidEfectivo(a) || cambioDe(a);
    return pid ? $('[data-pid="' + pid + '"]', art) : null;
  }
  if (a.tipo === 'pagina') return $('.pg[data-pg="' + a.pagina + '"]', art);
  return $('h1.sec-titulo', art);
}
// Las fichas se colocan en coordenadas del artículo (y = 0 en su borde superior). Ninguna queda más arriba de
// `piso`: lo que, con el texto al principio, queda bajo la cabecera del panel (las de la sección, el título, un
// pasaje al comienzo); así se ven todas con el texto arriba del todo y, al bajar, se van con él.
var artConAlto = null; // el artículo al que se le alargó el alto para alcanzar las últimas fichas
function colocarMargen() {
  var box = $('#lista'),
    capa = $('.capa-margen', box),
    art = articuloActual(),
    lect = $('#lectura');
  if (!capa || !art) return;
  observarArticulo(art);
  var ref = art.getBoundingClientRect().top,
    rb = box.getBoundingClientRect();
  var piso = rb.top - (ref + lect.scrollTop) + 8;
  var fichas = $$('.ficha', capa),
    items = fichas.map(function (f) {
      var id = f.getAttribute('data-id'),
        a = anots[id],
        n = a ? anclaDe(a, art) : null,
        r = n ? n.getBoundingClientRect() : null;
      var y = r && (r.width || r.height) ? Math.max(r.top - ref, piso) : null;
      // la activa tampoco queda por encima de lo que se ve ahora de la lista; si es más alta que la lista, puede subir lo
      // que le sobra, para que con el texto desplazado se vea su final (las acciones, a las que se llega con Tab)
      var h = f.offsetHeight;
      if (id === fichaFoco && y !== null) y = Math.max(y, rb.top - ref + 8 - Math.max(0, h + 16 - rb.height));
      return { id: id, y: y, h: h };
    });
  // las que no tienen dónde anclarse van al final, y nunca sobre el piso
  if (
    !items.some(function (it) {
      return it.y !== null;
    }) &&
    items.length
  )
    items[0].y = piso;
  var lugar = N.apilar(items, fichaFoco, 8);
  fichas.forEach(function (f) {
    f.style.top = Math.round(lugar.tops[f.getAttribute('data-id')]) + 'px';
  });
  capa.style.height = Math.max(0, Math.round(lugar.alto)) + 'px';
  // si las fichas pasan del final del artículo, el artículo se alarga (alto mínimo) lo justo para llevarlas a la vista
  alargar(art, Math.round(lugar.alto + 16));
  sincronizarMargen();
}
function alargar(art, alto) {
  if (artConAlto && artConAlto !== art) {
    artConAlto.style.minHeight = '';
    artConAlto = null;
  }
  var v = alto ? alto + 'px' : '';
  if (art.style.minHeight !== v) art.style.minHeight = v;
  artConAlto = alto ? art : null;
}
function sincronizarMargen() {
  var box = $('#lista'),
    capa = $('.capa-margen', box),
    art = articuloActual();
  if (!capa || !art) return;
  capa.style.transform =
    'translateY(' + Math.round(art.getBoundingClientRect().top - box.getBoundingClientRect().top) + 'px)';
}
// Fuera del margen el artículo vuelve a su alto.
function soltarMargen() {
  if (artConAlto) {
    artConAlto.style.minHeight = '';
    artConAlto = null;
  }
}
// Para cambios que mueven el texto o las fichas (una imagen que carga, una nota que crece, un diff que se abre, el
// tamaño o la letra del texto, una fuente que llega tarde, la cabecera del panel que crece).
function colocarMargenPronto() {
  if (!$('#lista .capa-margen')) return;
  clearTimeout(margenTemporizador);
  margenTemporizador = setTimeout(function () {
    if (punteroAbajo) colocarAlSoltar = true;
    else colocarMargen();
  }, 60);
}
var observador =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(function () {
          colocarMargenPronto();
        })
      : null,
  observado = null;
function observarArticulo(art) {
  if (!observador || observado === art) return;
  if (observado) observador.unobserve(observado);
  observador.observe(art);
  observado = art;
}
if (observador) observador.observe($('#lista'));
// Mientras el botón del puntero está abajo, las fichas no se reacomodan: la que se está tocando no se mueve bajo él
// (el cursor quedaría en otro sitio de la nota, o el clic fuera de la ficha). Se reacomodan al soltar.
var punteroAbajo = false,
  colocarAlSoltar = false;
document.addEventListener(
  'pointerdown',
  function () {
    punteroAbajo = true;
  },
  true
);
var alSoltar = function () {
  if (!punteroAbajo) return;
  punteroAbajo = false;
  // después del clic (que todavía tiene que llegar a donde se soltó), no antes
  if (colocarAlSoltar) {
    colocarAlSoltar = false;
    setTimeout(function () {
      if ($('#lista .capa-margen')) {
        colocarMargen();
        if (fichaFoco) asegurarVisibleMargen(fichaFoco);
      }
    }, 0);
  }
};
document.addEventListener('pointerup', alSoltar, true);
document.addEventListener('pointercancel', alSoltar, true);
window.addEventListener('blur', alSoltar);
// Activar una ficha al margen: se reacomodan las fichas y se lleva la activa a la vista (al soltar, si se tocó).
function reacomodarPorActivar(id) {
  if (punteroAbajo) {
    colocarAlSoltar = true;
    return;
  }
  colocarMargen();
  asegurarVisibleMargen(id);
}
// La ficha activa queda a la vista: si está por encima o por debajo de lo que se ve de la lista (su pasaje cerca del
// borde de la ventana, o una ficha a la que se llegó con Tab), se desplaza el texto, y la ficha con él.
function asegurarVisibleMargen(id) {
  var f = $('.capa-margen .ficha[data-id="' + id + '"]', $('#lista'));
  if (f) asegurarVisible(f, true);
}
// `n` (una ficha o un control dentro de ella) a la vista desplazando el texto. Con `cabeza`, si no cabe entera, manda
// su borde superior.
function asegurarVisible(n, cabeza) {
  var box = $('#lista'),
    lect = $('#lectura');
  var rb = box.getBoundingClientRect(),
    rf = n.getBoundingClientRect(),
    d = 0;
  if (rf.top < rb.top + 8) d = rf.top - rb.top - 16;
  else if (rf.bottom > rb.bottom - 8)
    d = cabeza ? Math.min(rf.bottom - rb.bottom + 16, rf.top - rb.top - 16) : rf.bottom - rb.bottom + 16;
  if (d) {
    lect.scrollTop += d;
    sincronizarMargen();
  }
}
$('#lectura').addEventListener(
  'scroll',
  function () {
    if (margenCuadro || !$('#lista .capa-margen')) return;
    margenCuadro = requestAnimationFrame(function () {
      margenCuadro = 0;
      sincronizarMargen();
    });
  },
  { passive: true }
);
// el foco no desplaza la lista al margen (eso desalinearía las fichas): se corrige y se desplaza el texto
$('#lista').addEventListener('scroll', function () {
  if (!$('.capa-margen', this) || !this.scrollTop) return;
  this.scrollTop = 0;
  var a = document.activeElement;
  if (a && this.contains(a) && a !== this) asegurarVisible(a, false);
  else if (fichaFoco) asegurarVisibleMargen(fichaFoco);
});
// con el teclado, el control que recibe el foco (el cuadro de la respuesta, «Borrar»…) se ve aunque la ficha sea más
// alta que la lista
$('#lista').addEventListener('focusin', function (ev) {
  if (!$('.capa-margen', this) || ev.target === this || punteroAbajo) return;
  var t = ev.target;
  requestAnimationFrame(function () {
    if (document.activeElement === t && t.isConnected) asegurarVisible(t, false);
  });
});
$('#panel').addEventListener('scroll', function () {
  if (this.classList.contains('margen') && this.scrollTop) this.scrollTop = 0;
});
$('#lectura').addEventListener(
  'load',
  function (ev) {
    if (ev.target && ev.target.tagName === 'IMG') colocarMargenPronto();
  },
  true
);
// Al cambiar el ancho de la ventana se reajustan las notas (una vez por cuadro, y sólo si cambió el ancho: el alto
// no cambia cómo se parten sus líneas).
var anchoPrevio = window.innerWidth,
  cuadroAncho = 0;
window.addEventListener('resize', function () {
  if (cuadroAncho) return;
  cuadroAncho = requestAnimationFrame(function () {
    cuadroAncho = 0;
    if (window.innerWidth === anchoPrevio) {
      if (margenActivo()) colocarMargenPronto();
      return;
    }
    anchoPrevio = window.innerWidth;
    ajustarTextareas();
    if (margenActivo()) colocarMargenPronto();
  });
});
$('#b-margen').setAttribute('aria-pressed', margenPref ? 'true' : 'false');
$('#b-margen').addEventListener('click', function () {
  margenPref = !margenPref;
  lsSet(MARGEN_KEY, margenPref ? '1' : '0');
  this.setAttribute('aria-pressed', margenPref ? 'true' : 'false');
  renderPanel();
});
