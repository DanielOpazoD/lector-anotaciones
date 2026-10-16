// ------------------------------------------------------------ barra de selección
(function (P, E) {
  // lo que este fragmento ofrece a los demás (las funciones se elevan: están desde el principio)
  P.ocultarTb = ocultarTb;
  P.marcarFiltro = marcarFiltro;
  P.quitarFiltros = quitarFiltros;
  P.enfocable = enfocable;
  P.cerrarHerramientas = cerrarHerramientas;
  P.lateral = lateral;
  P.volverAlTexto = volverAlTexto;
  P.abrirDialogo = abrirDialogo;
  P.cerrarDialogo = cerrarDialogo;
  P.alternarFoco = alternarFoco;
  var tb = P.$('#sel-tb');
  var mqTactil = window.matchMedia ? window.matchMedia('(pointer: coarse)') : { matches: false };
  function ocultarTb() {
    tb.style.display = 'none';
  }
  // ¿La selección toca algún bloque del texto? Lo que la barra de subrayado y los atajos aceptan.
  function selDeTexto(sel) {
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    var ex = P.extremosDeRango(sel.getRangeAt(0));
    return !!(ex.pA && ex.pB);
  }
  function mostrarTb() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      ocultarTb();
      return;
    }
    var r = sel.getRangeAt(0),
      ex = P.extremosDeRango(r);
    if (!ex.pA || !ex.pB) {
      ocultarTb();
      return;
    }
    var rect = r.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      ocultarTb();
      return;
    }
    tb.style.display = 'flex';
    // En pantallas táctiles la barra va anclada abajo y con botones grandes: encima de la selección está el menú
    // nativo (copiar, buscar…) y los tiradores, que la taparían.
    tb.classList.toggle('abajo', !!mqTactil.matches);
    if (mqTactil.matches) return;
    var w = tb.offsetWidth || 220,
      h = tb.offsetHeight || 40;
    var left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), window.innerWidth - w - 8);
    // Encima de la selección; si no cabe, debajo; y siempre dentro de la ventana (una selección más alta que la
    // pantalla, tras un arrastre con desplazamiento, desborda por los dos lados).
    var top = rect.top - h - 8;
    if (top < 8) top = rect.bottom + 8;
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    tb.style.left = left + 'px';
    tb.style.top = top + 'px';
  }
  document.addEventListener('selectionchange', function () {
    clearTimeout(window.__selT);
    window.__selT = setTimeout(mostrarTb, 180);
  });
  P.$$('#sel-tb .col-btn').forEach(function (b) {
    b.addEventListener('mousedown', function (ev) {
      ev.preventDefault();
    });
    b.addEventListener('click', function () {
      P.crearSubrayado(b.getAttribute('data-c'), false);
    });
  });
  P.$('#sel-nota').addEventListener('mousedown', function (ev) {
    ev.preventDefault();
  });
  P.$('#sel-nota').addEventListener('click', function () {
    P.crearSubrayado('revisar', true);
  });
  P.$('#sel-proponer').addEventListener('mousedown', function (ev) {
    ev.preventDefault();
  });
  P.$('#sel-proponer').addEventListener('click', function () {
    P.crearSubrayado('revisar', false, true);
  });
  P.$('#sel-copiar').addEventListener('mousedown', function (ev) {
    ev.preventDefault();
  });
  P.$('#sel-copiar').addEventListener('click', function () {
    P.copiarSeleccion(this);
  });

  // ------------------------------------------------------------ pestañas y filtros del panel
  // Las pestañas siguen el patrón de WAI-ARIA: una sola en el orden de Tab, flechas para moverse entre ellas.
  P.VISTA.alCambiar(['tab'], function () {
    marcarTab();
  });
  function marcarTab() {
    P.$$('.tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === P.V.tab;
      t.classList.toggle('activa', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    P.$('#lista').setAttribute('aria-labelledby', 'tab-' + P.V.tab);
  }
  // El resumen junto a «Filtros» dice qué está escondiendo fichas aunque el desplegable esté cerrado.
  function marcarFiltro() {
    P.$$('.filtro').forEach(function (x) {
      var on = x.getAttribute('data-f') === P.V.filtro;
      x.classList.toggle('on', on);
      x.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var partes = [];
    if (P.V.filtro !== 'todas') {
      var b = P.$('.filtro[data-f="' + P.V.filtro + '"]');
      partes.push(b ? b.textContent : P.V.filtro);
    }
    if (P.V.filtroAutor) {
      var o = P.$('#f-autor').selectedOptions;
      partes.push(o && o[0] ? o[0].textContent : 'un lector');
    }
    if (P.V.filtroEtiqueta) partes.push('#' + P.V.filtroEtiqueta);
    P.$('#filtro-resumen').textContent = partes.length ? '· ' + partes.join(', ') : '';
  }
  function quitarFiltros() {
    P.VISTA.quitarFiltros();
  }
  P.$$('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      P.cambiarTab(t.getAttribute('data-tab'));
      if (P.V.tab === 'buscar') P.buscar(P.$('#buscar').value);
      else P.renderPanel();
    });
  });
  P.$('.tabs').addEventListener('keydown', function (ev) {
    var ts = P.$$('.tab'),
      i = ts.indexOf(document.activeElement);
    if (i < 0) return;
    var j =
      ev.key === 'ArrowRight'
        ? i + 1
        : ev.key === 'ArrowLeft'
          ? i - 1
          : ev.key === 'Home'
            ? 0
            : ev.key === 'End'
              ? ts.length - 1
              : null;
    if (j === null) return;
    ev.preventDefault();
    j = (j + ts.length) % ts.length;
    ts[j].focus();
    ts[j].click();
  });
  P.$$('.filtro').forEach(function (f) {
    f.addEventListener('click', function () {
      P.VISTA.cambiar({ filtro: f.getAttribute('data-f') });
      if (P.V.tab === 'buscar') {
        P.cambiarTab('todas');
      }
      P.renderPanel();
    });
  });

  // ------------------------------------------------------------ controles
  // el menú «+ Nota» se cierra al elegir (la nota nueva queda abierta con el cursor en ella)
  var cerrarNueva = function () {
    P.$('#nueva-det').open = false;
  };
  P.$('#b-nota-cap').addEventListener('click', function () {
    cerrarNueva();
    P.notaSeccion();
  });
  P.$('#b-nota-gen').addEventListener('click', function () {
    cerrarNueva();
    P.notaGeneral();
  });
  P.$('#b-nota-pg').addEventListener('click', function () {
    cerrarNueva();
    P.notaPagina(P.$('#pg-num').value, P.V.secActual);
  });
  P.$('#pg-num').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') {
      // el Enter no llega a la nota nueva, que recibe el foco: empezaría con un salto de línea
      ev.preventDefault();
      cerrarNueva();
      P.notaPagina(P.$('#pg-num').value, P.V.secActual);
    }
  });
  P.$('#anot-ant').addEventListener('click', function () {
    P.navegar(-1);
  });
  P.$('#anot-sig').addEventListener('click', function () {
    P.navegar(1);
  });
  P.$('#b-copiar').addEventListener('click', function () {
    P.copiar(P.exportarJSON(), this);
  });
  P.$('#b-copiar-md').addEventListener('click', function () {
    P.copiar(P.exportarMD(), this);
  });
  P.$('#b-diagnostico').addEventListener('click', function () {
    P.copiar(P.diagnostico(), this);
  });
  P.$('#buscar').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') P.buscar(this.value);
  });

  // ------------------------------------------------------------ índice y panel en pantalla estrecha
  // Son cajones que se deslizan sobre el texto. Cerrados quedan fuera de la vista e inertes (fuera del orden de Tab y
  // del árbol de accesibilidad). Abierto uno, el resto de la página queda detrás de un velo: tocar fuera lo cierra, el
  // teclado no se escapa a lo que no se ve, y al cerrarlo el foco vuelve a donde estaba.
  var mqMovil = /** @type {MediaQueryList} */ (
    window.matchMedia ? window.matchMedia('(max-width: 1000px)') : { matches: false }
  );
  P.mqMovil = mqMovil;
  E.volverA = /** @type {Element | null} */ (null); // a dónde vuelve el foco al cerrar un cajón
  // Un destino de foco que de verdad se puede enfocar: en el documento, visible (no en una sección oculta ni en un panel
  // escondido por la concentración) y fuera de lo inerte.
  function enfocable(n) {
    return !!n && document.contains(n) && n.getClientRects().length > 0 && !n.closest('[inert]');
  }
  function cerrarHerramientas() {
    P.$('#herramientas').classList.remove('abierta');
    P.$('#b-mas').setAttribute('aria-expanded', 'false');
  }
  function cajonAbierto() {
    if (!mqMovil.matches) return null;
    return (
      ['indice', 'panel'].filter(function (c) {
        return P.$('#' + c).classList.contains('abierta');
      })[0] || null
    );
  }
  function sincronizarLaterales() {
    var abierto = cajonAbierto();
    ['indice', 'panel'].forEach(function (cual) {
      var n = P.$('#' + cual);
      n.inert = !!mqMovil.matches && cual !== abierto;
      P.$('#b-' + cual).setAttribute('aria-expanded', cual === abierto ? 'true' : 'false');
    });
    P.$('#velo').hidden = !abierto;
    P.$('#velo').classList.toggle('claro', abierto === 'panel');
    P.$('#lectura').classList.toggle('con-hoja', abierto === 'panel');
    P.$('header.barra').inert = !!abierto;
    P.$('#lectura').inert = !!abierto;
    P.$('.saltar').inert = !!abierto;
  }
  // `origen`: a dónde vuelve el foco al cerrar, si no es el control que lo abrió (el pasaje de una nota recién creada).
  function lateral(cual, abierto, origen) {
    var n = P.$('#' + cual),
      antes = n.classList.contains('abierta');
    var ahora = abierto === 'alternar' ? !antes : !!abierto;
    if (ahora === antes) return;
    // en concentración índice y panel no se ven: abrir uno sale antes de la concentración
    if (ahora && P.$('#app').classList.contains('foco')) alternarFoco();
    var activo = document.activeElement;
    if (ahora && mqMovil.matches) {
      cerrarHerramientas();
      var otro = P.$('#' + (cual === 'indice' ? 'panel' : 'indice'));
      if (otro.classList.contains('abierta')) otro.classList.remove('abierta');
      else E.volverA = origen || (activo && activo !== document.body ? activo : null);
    }
    n.classList.toggle('abierta', ahora);
    sincronizarLaterales();
    if (!mqMovil.matches) return;
    if (ahora) {
      if (!n.contains(document.activeElement)) {
        var dentro = cual === 'indice' ? P.$('a.sec.activa', n) || P.$('a.sec', n) : P.$('.tab.activa', n);
        (dentro || P.$('.cerrar', n)).focus({ preventScroll: true });
      }
    } else if (n.contains(activo) || !activo || activo === document.body) {
      var v = E.volverA,
        destino = v && enfocable(v) && !v.closest('.cajon') ? v : null;
      if (!destino && cual === 'panel' && P.V.fichaFoco) {
        var mf = P.$('mark.hl[data-aids~="' + P.V.fichaFoco + '"]');
        if (enfocable(mf)) destino = mf;
      }
      (destino || P.$('#b-' + cual)).focus({ preventScroll: true });
      E.volverA = null;
    }
  }
  function cerrarCajones() {
    var c = cajonAbierto();
    if (c) lateral(c, false);
  }
  // Al pasar a pantalla ancha los cajones dejan de serlo (y no vuelven abiertos al estrecharla); al pasar a estrecha, si
  // el foco está en el índice o el panel, ese cajón queda abierto para no dejarlo en algo inerte (una nota a medias).
  function alCambiarAncho() {
    if (!mqMovil.matches) {
      ['indice', 'panel'].forEach(function (c) {
        P.$('#' + c).classList.remove('abierta');
      });
      E.volverA = null;
    } else {
      var act = document.activeElement,
        dentro = act && act.closest ? act.closest('#indice, #panel') : null;
      if (dentro)
        ['indice', 'panel'].forEach(function (c) {
          P.$('#' + c).classList.toggle('abierta', !!dentro && c === dentro.id);
        });
    }
    sincronizarLaterales();
    if (E.LIBRO && P.V.tab !== 'buscar') P.renderPanel(); // las notas al margen sólo van en pantalla ancha
  }
  if (mqMovil.addEventListener) mqMovil.addEventListener('change', alCambiarAncho);
  else if (mqMovil.addListener) mqMovil.addListener(alCambiarAncho);
  sincronizarLaterales();
  P.$('#b-indice').addEventListener('click', function () {
    lateral('indice', 'alternar');
  });
  P.$('#b-panel').addEventListener('click', function () {
    lateral('panel', 'alternar');
  });
  P.$$('[data-cerrar]').forEach(function (b) {
    b.addEventListener('click', function () {
      lateral(b.getAttribute('data-cerrar'), false);
    });
  });
  P.$('#velo').addEventListener('click', function () {
    cerrarCajones();
    salirDeFicha();
  });
  P.$('#b-mas').addEventListener('click', function () {
    var on = P.$('#herramientas').classList.toggle('abierta');
    this.setAttribute('aria-expanded', on ? 'true' : 'false');
  });

  // ------------------------------------------------------------ salir de una ficha
  // Deja de resaltar la ficha y su pasaje sin redibujar nada, para no mover el foco ni el desplazamiento; lo escrito en
  // la nota ya se guardó al perder el foco.
  function salirDeFicha() {
    if (!P.V.fichaFoco) return;
    var antes = P.V.fichaFoco;
    P.VISTA.cambiar({ fichaFoco: null });
    P.$$('.ficha.foco, mark.hl.foco').forEach(function (n) {
      n.classList.remove('foco');
      if (n.classList.contains('ficha')) P.ajustarTextareas(n);
    });
    P.vistaEnSitio(antes, { foco: false });
    P.colocarMargenPronto();
    P.actualizarNav();
  }
  // Esc o Ctrl+Enter dentro de una nota: se guarda (al perder el foco), se sale de la ficha y el foco vuelve al pasaje
  // subrayado, o a la ficha si no tiene pasaje; en pantalla estrecha se cierra además el panel.
  function volverAlTexto(id) {
    var m = P.$('mark.hl[data-aids~="' + id + '"]'),
      f = P.$('.ficha[data-id="' + id + '"]');
    if (m && !m.getClientRects().length) m = null; // el pasaje está en otra sección, oculta
    if (cajonAbierto() === 'panel') {
      E.volverA = m;
      lateral('panel', false);
    } else if (m) m.focus({ preventScroll: true });
    else if (f) f.focus({ preventScroll: true });
    salirDeFicha();
  }

  // ------------------------------------------------------------ diálogos (atajos, figura ampliada)
  // <dialog> modal: el navegador atrapa el foco, deja inerte el resto y cierra con Esc; un clic en el fondo también cierra.
  function abrirDialogo(d) {
    if (d.open) return;
    try {
      d.showModal();
    } catch (e) {
      d.setAttribute('open', '');
    }
  }
  function cerrarDialogo(d) {
    if (!d.open) return;
    try {
      d.close();
    } catch (e) {
      d.removeAttribute('open');
    }
  }
  function alternarAtajos() {
    var d = P.$('#atajos');
    if (d.open) cerrarDialogo(d);
    else abrirDialogo(d);
  }
  // «En el fondo» es fuera del recuadro del diálogo al apretar y al soltar: un clic en su relleno, o una selección que
  // empieza en un campo y termina en el borde, no lo cierran.
  function cierreEnElFondo(d) {
    var fuera = function (ev) {
      var r = d.getBoundingClientRect();
      return ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom;
    };
    var empezoFuera = false;
    d.addEventListener('pointerdown', function (ev) {
      empezoFuera = ev.target === d && fuera(ev);
    });
    d.addEventListener('click', function (ev) {
      if (ev.target.closest && ev.target.closest('.dialogo-cab .cerrar')) {
        cerrarDialogo(d);
        return;
      }
      if (ev.target === d && empezoFuera && fuera(ev)) cerrarDialogo(d);
      empezoFuera = false;
    });
  }
  cierreEnElFondo(P.$('#atajos'));
  P.$('#lightbox').addEventListener('click', function () {
    cerrarDialogo(this);
  });
  P.$('#b-atajos').addEventListener('click', alternarAtajos);
  P.$('#lectura').addEventListener('click', function (ev) {
    var img = ev.target.closest('figure img');
    if (!img) return;
    var lb = P.$('#lightbox'),
      cap = img.closest('figure').querySelector('figcaption');
    P.$('img', lb).src = img.src;
    P.$('img', lb).alt = cap ? cap.textContent : 'Figura';
    abrirDialogo(lb);
  });

  P.$('#f-autor').addEventListener('change', function () {
    P.VISTA.cambiar({ filtroAutor: this.value });
    P.renderPanel();
  });
  P.$('#f-etiqueta').addEventListener('change', function () {
    P.VISTA.cambiar({ filtroEtiqueta: this.value });
    P.renderPanel();
  });
  P.$('#b-foco').addEventListener('click', function () {
    alternarFoco();
  });
  // Antes de salir hacia algo que se oculta, el foco que estaba en el índice o el panel pasa a la lectura.
  function alternarFoco() {
    var act = document.activeElement;
    if (!P.$('#app').classList.contains('foco') && act && act.closest && act.closest('#indice, #panel'))
      P.$('#lectura').focus({ preventScroll: true });
    var on = P.$('#app').classList.toggle('foco');
    P.lsSet(E.LOCAL_KEY + ':foco', on ? '1' : '');
    P.$('#b-foco').textContent = on ? 'Salir de concentración' : 'Concentración';
    P.$('#b-foco').setAttribute('aria-pressed', on ? 'true' : 'false');
    // el panel vuelve a verse (o deja de verse): sus notas se miden de nuevo y el margen se activa o no
    if (!on && E.LIBRO && P.V.tab !== 'buscar') P.renderPanel();
  }
  var COLOR_TECLA = { '1': 'revisar', '2': 'cortar', '3': 'duda', '4': 'conservar' };
  // Esc cierra de a una capa por vez, la más reciente primero: menú de la barra, «⋯», la selección y su barra, la
  // lectura en voz alta, el cajón, la concentración y, al final, la ficha. Vale también con el foco en un campo de
  // texto (no en una nota, que atiende su propio Esc).
  function escapar() {
    var menu = P.$$('details.menu-det[open]');
    if (menu.length) {
      menu.forEach(function (d) {
        d.open = false;
        P.$('summary', d).focus({ preventScroll: true });
      });
      return;
    }
    if (mqMovil.matches && P.$('#herramientas').classList.contains('abierta')) {
      cerrarHerramientas();
      P.$('#b-mas').focus({ preventScroll: true });
      return;
    }
    var s = window.getSelection();
    if (
      tb.style.display === 'flex' ||
      (s && !s.isCollapsed && s.rangeCount && P.ancestroPid(s.getRangeAt(0).startContainer))
    ) {
      ocultarTb();
      if (s) s.removeAllRanges();
      return;
    }
    if (E.lectura) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        P.fallo('voz', e);
      }
      P.detenerLectura();
      return;
    }
    if (cajonAbierto()) {
      cerrarCajones();
      salirDeFicha();
      return;
    }
    if (P.$('#app').classList.contains('foco')) {
      alternarFoco();
      return;
    }
    salirDeFicha();
  }
  document.addEventListener('keydown', function (ev) {
    var tg = /** @type {any} */ (ev.target || {}),
      tagName = tg.tagName || '';
    if (P.$('dialog[open]')) return; // el diálogo abierto atiende su propio Esc
    if (ev.key === 'Escape') {
      escapar();
      return;
    }
    if (/TEXTAREA|SELECT/.test(tagName) || (tagName === 'INPUT' && !/checkbox|radio|button/.test(tg.type || '')))
      return;
    if (ev.metaKey || ev.ctrlKey) return;
    // hay selección que subrayar con la misma regla que la barra: que toque algún bloque (también si empieza en el título)
    var sel = window.getSelection(),
      haySel = selDeTexto(sel);
    if (ev.key === 'ArrowRight' && ev.altKey) P.mover(1);
    else if (ev.key === 'ArrowLeft' && ev.altKey) P.mover(-1);
    else if (COLOR_TECLA[ev.key] && haySel) {
      ev.preventDefault();
      P.crearSubrayado(COLOR_TECLA[ev.key], false);
    } else if ((ev.key === 'n' || ev.key === 'N') && haySel) {
      ev.preventDefault();
      P.crearSubrayado('revisar', true);
    } else if ((ev.key === 'p' || ev.key === 'P') && haySel) {
      ev.preventDefault();
      P.crearSubrayado('revisar', false, true);
    } else if ((ev.key === 'p' || ev.key === 'P') && P.V.fichaFoco && P.anots[P.V.fichaFoco] && !E.SOLO_LECTURA) {
      if (P.anots[P.V.fichaFoco].tipo !== 'subrayado' || !enfocable(P.$('.ficha[data-id="' + P.V.fichaFoco + '"]')))
        return;
      ev.preventDefault();
      P.abrirPropuesta(P.V.fichaFoco);
    } else if ((ev.key === 'c' || ev.key === 'C') && haySel) {
      ev.preventDefault();
      P.copiarSeleccion(P.$('#sel-copiar'));
    } else if (ev.key === '.') {
      ev.preventDefault();
      P.navegar(1);
    } else if (ev.key === ',') {
      ev.preventDefault();
      P.navegar(-1);
    } else if (
      P.V.tab === 'revisar' &&
      P.V.fichaFoco &&
      P.anots[P.V.fichaFoco] &&
      !E.SOLO_LECTURA &&
      /^[arvARV]$/.test(ev.key)
    ) {
      ev.preventDefault();
      // una tecla mantenida no resuelve varias de seguido, y nada se resuelve sin verse (concentración, panel cerrado)
      if (ev.repeat || !enfocable(P.$('.ficha[data-id="' + P.V.fichaFoco + '"]'))) return;
      var k = ev.key.toLowerCase();
      if (k === 'v') P.verCambio(P.V.fichaFoco);
      else if (P.porRevisar(P.anots[P.V.fichaFoco])) P.revisar(P.V.fichaFoco, k === 'a' ? 'atendida' : 'reabrir');
    } else if (ev.key === 'j' || ev.key === 'J') P.mover(1);
    else if (ev.key === 'k' || ev.key === 'K') P.mover(-1);
    else if (ev.key === 'l' || ev.key === 'L') P.alternarLeida(P.V.secActual);
    else if (ev.key === 'f' || ev.key === 'F') alternarFoco();
    else if (ev.key === '?') alternarAtajos();
  });
  // Un clic fuera cierra lo que flota: la barra de subrayado (si ya no hay selección), los menús de la barra y la ficha
  // en edición. Fuera de una ficha quiere decir en el texto o en el fondo, no en un control: el botón que crea otra
  // nota, por ejemplo, la enfoca él mismo.
  // Un clic que empezó en una ficha no es un clic fuera aunque se suelte fuera: al margen, la ficha que se activa al
  // pulsarla puede moverse bajo el puntero, y el clic llega entonces a la lista que la contiene.
  var pulsadoEn = null;
  document.addEventListener(
    'pointerdown',
    function (ev) {
      pulsadoEn = ev.target;
    },
    true
  );
  document.addEventListener('click', function (ev) {
    var t = /** @type {Element} */ (ev.target),
      origen = pulsadoEn;
    pulsadoEn = null;
    if (!tb.contains(t)) {
      var s = window.getSelection();
      if (!s || s.isCollapsed) ocultarTb();
    }
    P.$$('details.menu-det[open]').forEach(function (d) {
      if (!d.contains(t)) d.open = false;
    });
    var enFicha = origen && origen.closest && origen.closest('.ficha');
    if (
      P.V.fichaFoco &&
      !enFicha &&
      t &&
      t.closest &&
      !t.closest('.ficha, mark.hl, #sel-tb, dialog, #velo, button, a, input, select, textarea, label, summary, .res')
    )
      salirDeFicha();
  });
  // Al salir de la página (recargar, cerrar, pasar a otra pestaña), la nota en edición se guarda sin esperar la pausa.
  var soltarNota = function () {
    var a = /** @type {HTMLElement} */ (document.activeElement);
    if (a && a.tagName === 'TEXTAREA' && a.closest('.ficha')) a.blur();
  };
  window.addEventListener('pagehide', soltarNota);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') soltarNota();
  });
  // El enlace «Saltar al texto» lleva el foco a la lectura sin tocar el ancla (que guarda la sección abierta).
  P.$('.saltar').addEventListener('click', function (ev) {
    ev.preventDefault();
    P.$('#lectura').focus();
  });
  window.addEventListener('hashchange', function () {
    var h = (location.hash || '').replace('#', '');
    if (P.SEC_BY_ID[h] && h !== P.V.secActual) P.irA(h);
  });
})(LAPagina, LAEstado);
