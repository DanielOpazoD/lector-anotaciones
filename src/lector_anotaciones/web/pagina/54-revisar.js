// ------------------------------------------------------------ revisar respuestas y recorrer anotaciones
// El bloque donde cambió el pasaje de una anotación: el suyo, si cambió desde que se anotó y la reconstrucción guarda
// su texto anterior; si la cita ya no está (el pasaje se reescribió), el bloque cuyo texto anterior la contenía, en su
// sección o, si no, en el libro.
(function (P, E) {
  // lo que este fragmento ofrece a los demás (las funciones se elevan: están desde el principio)
  P.cambioDe = cambioDe;
  P.verCambio = verCambio;
  P.revisar = revisar;
  P.navegar = navegar;
  P.actualizarNav = actualizarNav;
  P.irAAnot = irAAnot;
  P.enfocar = enfocar;
  P.renderCuentas = renderCuentas;
  function cambioDe(a) {
    if (!a || a.tipo !== 'subrayado' || !a.cita) return null;
    var u = E.UBIC[a.id],
      pe = P.pidEfectivo(a),
      b = pe && P.BLOQUES[pe];
    if (u && u.estado !== 'perdido') return b && b.anterior && (!a.bh || b.h !== a.bh) ? pe : null;
    // de los bloques cuyo texto anterior contenía la cita: el suyo, si es uno; si no, el que la tenía con su contexto
    var elegir = function (bloques) {
      var mejor = /** @type {any} */ (null),
        puntos = -1;
      bloques.forEach(function (x) {
        if (!x.anterior) return;
        var m = P.N.buscarCita(x.anterior, a);
        if (!m) return;
        var p = m.puntos + (x.id === a.pid ? 3 : 0);
        if (p > puntos) {
          mejor = x;
          puntos = p;
        }
      });
      return mejor;
    };
    var x = P.SEC_BY_ID[a.sid] ? elegir(P.SEC_BY_ID[a.sid].bloques) : null;
    for (var i = 0; !x && i < E.SECS.length; i++) x = elegir(E.SECS[i].bloques);
    return x ? x.id : null;
  }
  function verCambio(id) {
    var a = P.anots[id],
      pid = cambioDe(a);
    if (!pid) return;
    P.irA(P.BLOQUE_SEC[pid], pid);
    P.alternarDiff(pid, true);
    P.activar(id);
  }
  // Atendida: queda resuelta y revisada, y se pasa a la siguiente por revisar. Reabrir: vuelve a abrirse, revisada, con
  // el cursor en la réplica (si era una pregunta) o en la nota, para escribir qué falta.
  function revisar(id, accion) {
    var a = P.anots[id];
    if (!a || E.SOLO_LECTURA) return;
    var enBandeja = P.V.tab === 'revisar';
    if (enBandeja) P.VISTA.revisada(id);
    // lo de antes, para deshacer: sin revisión previa, `revisado` vacío (la base no borra campos; vacío no cuenta)
    var antes = { estado: a.estado || 'abierta', revisado: a.revisado || '' },
      marca = P.N.marcaRevision(a, P.ahora());
    if (accion === 'atendida') {
      // en la bandeja se pasa a la siguiente por revisar, en el orden del libro y en cualquier sección; fuera de ella
      // (en «Sección» o «Todas») se queda en la ficha
      var pend = Object.keys(P.anots)
        .map(function (k) {
          return P.anots[k];
        })
        .filter(function (x) {
          return P.porRevisar(x) && x.id !== id;
        })
        .sort(function (x, y) {
          return P.ordenKey(x) < P.ordenKey(y) ? -1 : 1;
        });
      var sig =
        pend.filter(function (x) {
          return P.ordenKey(x) > P.ordenKey(a);
        })[0] || pend[0];
      P.guardar(Object.assign({}, a, { estado: 'resuelta', revisado: marca }));
      P.ofrecerDeshacerCambio(id, antes, { estado: 'resuelta', revisado: marca }, 'Atendida.');
      if (enBandeja && sig) {
        irARevisar(sig);
        return;
      }
      P.anunciar(pend.length ? 'Atendida' : 'Atendida. No quedan respuestas por revisar');
      var destino = enBandeja ? P.$('.bandeja-cab') : P.$('.ficha[data-id="' + id + '"]');
      if (destino) {
        destino.setAttribute('tabindex', '-1');
        destino.focus({ preventScroll: true });
      }
      return;
    }
    P.guardar(Object.assign({}, a, { estado: 'abierta', revisado: marca }));
    P.ofrecerDeshacerCambio(id, antes, { estado: 'abierta', revisado: marca }, 'Reabierta.');
    var f = P.$('.ficha[data-id="' + id + '"]'),
      ta = f && (P.$('textarea.replica', f) || P.$('textarea.nota', f));
    if (ta) {
      ta.focus();
      try {
        ta.setSelectionRange(ta.value.length, ta.value.length);
      } catch (e) {
        P.fallo('cursor', e);
      }
    }
  }
  function irARevisar(a) {
    irAAnot(a, P.mqMovil.matches);
    var c = cambioDe(a);
    if (c) P.alternarDiff(c, true);
  }
  // . y , (o los botones ‹ ›): la anotación siguiente o anterior en el orden del libro, con los filtros puestos (en «Por
  // revisar», las de la bandeja), cambiando de sección cuando hace falta.
  function navegar(d) {
    var L = P.listaNavegable();
    if (!L.length) {
      P.anunciar('No hay anotaciones que recorrer');
      return;
    }
    var j = P.N.vecina(L, P.V.fichaFoco, d, {
      de: P.ordenKey,
      clave: P.V.fichaFoco && P.anots[P.V.fichaFoco] ? P.ordenKey(P.anots[P.V.fichaFoco]) : null,
    });
    if (j < 0) {
      P.anunciar(d > 0 ? 'Es la última anotación' : 'Es la primera anotación');
      return;
    }
    if (P.V.tab === 'revisar') irARevisar(L[j]);
    else irAAnot(L[j], P.mqMovil.matches);
  }
  function actualizarNav() {
    var L = P.listaNavegable(),
      i = -1;
    for (var k = 0; k < L.length; k++)
      if (L[k].id === P.V.fichaFoco) {
        i = k;
        break;
      }
    P.$('#anot-pos').textContent = !L.length
      ? ''
      : i >= 0
        ? i + 1 + ' de ' + L.length
        : L.length + (L.length === 1 ? ' anotación' : ' anotaciones');
    P.$('#anot-ant').setAttribute('aria-disabled', L.length && i !== 0 ? 'false' : 'true');
    P.$('#anot-sig').setAttribute('aria-disabled', L.length && i !== L.length - 1 ? 'false' : 'true');
  }
  // `mostrar`: en pantalla estrecha, dejar el panel abierto con la ficha (desde un resultado de búsqueda o al recorrer).
  function irAAnot(a, mostrar) {
    var pid = P.pidEfectivo(a),
      cambio = cambioDe(a);
    if (pid) {
      P.irA(P.BLOQUE_SEC[pid] || a.sid, pid);
    } else if (cambio) P.irA(P.BLOQUE_SEC[cambio], cambio);
    else if (a.pid) {
      if (a.sid) P.irA(a.sid);
    } else if (a.tipo === 'pagina') {
      var n = P.$('[data-pg="' + a.pagina + '"][data-pid]');
      if (n) P.irA(P.BLOQUE_SEC[n.getAttribute('data-pid')], n.getAttribute('data-pid'));
    } else if (a.sid) P.irA(a.sid);
    if (P.mqMovil.matches && !mostrar) P.lateral('panel', false);
    enfocar(a.id, false, !!mostrar);
  }
  // Enfoca la ficha de una anotación (y su pasaje). `editar` lleva el cursor a la nota; `mostrar` abre el panel en
  // pantalla estrecha aunque no se vaya a escribir (al tocar un subrayado).
  function enfocar(id, editar, mostrar) {
    var previo =
      P.V.fichaFoco && P.V.fichaFoco !== id && P.anots[P.V.fichaFoco] ? P.pidEfectivo(P.anots[P.V.fichaFoco]) : null;
    P.VISTA.cambiar({ fichaFoco: id });
    var a = P.anots[id];
    if (!a) return;
    if (previo) P.pintarPid(previo);
    if (P.V.tab === 'buscar') P.cambiarTab('todas');
    if (P.V.tab === 'capitulo' && a.sid !== P.V.secActual && !(a.tipo === 'pagina')) P.cambiarTab('todas');
    // fuera de la lista: si es por la sección (una nota de página sin su página en el texto), a «Todas» con los mismos
    // filtros; si es por un filtro o por la bandeja, a «Todas» sin filtros
    if (P.lista().indexOf(a) < 0) {
      if (P.V.tab === 'revisar' || (P.V.tab === 'capitulo' && P.lista(true).indexOf(a) >= 0)) P.cambiarTab('todas');
      if (P.lista().indexOf(a) < 0) P.quitarFiltros();
    }
    P.renderPanel();
    var pe = P.pidEfectivo(a);
    if (pe) P.pintarPid(pe);
    // en concentración el panel no se ve: para escribir o mostrar la ficha se sale de ella
    if ((editar || mostrar) && P.$('#app').classList.contains('foco')) P.alternarFoco();
    if (P.mqMovil.matches && (editar || mostrar)) {
      // en pantalla estrecha el panel sube desde abajo y el pasaje queda a la vista encima
      var mk = P.$('mark.hl[data-aids~="' + id + '"]');
      P.lateral('panel', true, mk);
      if (mk) mk.scrollIntoView({ block: 'start' });
    }
    var f = P.$('.ficha[data-id="' + id + '"]');
    if (f) {
      // al margen, la ficha sigue a su pasaje: lo que se desplaza es el texto, no la lista
      if (P.margenActivo()) P.asegurarVisibleMargen(id);
      else f.scrollIntoView({ block: 'nearest' });
      // Si la activación vino de una marca del texto o de un resultado de búsqueda, el elemento pulsado ya no existe
      // (se redibujó): el foco del teclado sigue en la ficha, no cae al cuerpo del documento. Con el panel cerrado
      // (pantalla estrecha) la ficha es inerte y el foco va al pasaje.
      if (P.enfocable(f)) {
        if (editar) {
          var ta = P.$(typeof editar === 'string' ? editar : 'textarea', f);
          if (ta) ta.focus({ preventScroll: true });
        }
        if (!f.contains(document.activeElement)) f.focus({ preventScroll: true });
      } else {
        var m = P.$('mark.hl[data-aids~="' + id + '"]');
        if (P.enfocable(m)) m.focus({ preventScroll: true });
      }
    }
    actualizarNav();
  }
  function renderCuentas() {
    var por = {};
    Object.keys(P.anots).forEach(function (k) {
      var a = P.anots[k];
      if (a.sid) por[a.sid] = (por[a.sid] || 0) + 1;
    });
    P.$$('nav a.sec').forEach(function (a) {
      var sid = a.getAttribute('data-sid');
      var c = a.querySelector('.cuenta');
      if (por[sid]) {
        if (!c) {
          c = P.el('span', { 'class': 'cuenta' });
          a.appendChild(c);
        }
        c.textContent = por[sid];
      } else if (c) c.remove();
    });
    P.$('#n-panel').textContent = Object.keys(P.anots).length ? '(' + Object.keys(P.anots).length + ')' : '';
    P.renderCuentaRevisar();
  }
})(LAPagina, LAEstado);
