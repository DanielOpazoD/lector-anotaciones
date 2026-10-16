// ------------------------------------------------------------ panel
// Pestañas: «Sección» (las de la sección abierta; en escritorio, al margen de su pasaje), «Todas», «Por revisar» (las
// respuestas que el autor todavía no revisó) y «Búsqueda».
// Todo cambio de pestaña pasa por aquí: al salir de «Por revisar», las revisadas en esta visita dejan la bandeja.
(function (P, E) {
  // lo que este fragmento ofrece a los demás (las funciones se elevan: están desde el principio)
  P.cambiarTab = cambiarTab;
  P.porRevisar = porRevisar;
  P.cuantasPorRevisar = cuantasPorRevisar;
  P.lista = lista;
  P.listaNavegable = listaNavegable;
  P.ordenKey = ordenKey;
  P.vistaEnSitio = vistaEnSitio;
  P.propuestaAbierta = propuestaAbierta;
  P.olvidarFicha = olvidarFicha;
  P.avanzarFicha = avanzarFicha;
  P.renderPanel = renderPanel;
  P.renderCuentaRevisar = renderCuentaRevisar;
  P.etiqueta = etiqueta;
  P.ajustarAlto = ajustarAlto;
  P.ajustarTextareas = ajustarTextareas;
  P.activar = activar;
  function cambiarTab(t) {
    P.VISTA.cambiar({ tab: t });
  }
  function porRevisar(a) {
    return P.N.porRevisar(a, E.ME);
  }
  function cuantasPorRevisar() {
    return Object.keys(P.anots).filter(function (k) {
      return porRevisar(P.anots[k]);
    }).length;
  }
  // `todoElLibro`: sin la restricción de la pestaña «Sección» (para recorrer con . y , de una sección a otra).
  function lista(todoElLibro) {
    var L = Object.keys(P.anots).map(function (k) {
      return P.anots[k];
    });
    if (P.V.tab === 'revisar') {
      L = L.filter(function (a) {
        return porRevisar(a) || P.V.revisadas[a.id];
      });
      L.sort(function (x, y) {
        return ordenKey(x) < ordenKey(y) ? -1 : 1;
      });
      return L;
    }
    if (P.V.tab === 'capitulo' && !todoElLibro) {
      var s = P.SEC_BY_ID[P.V.secActual || ''];
      var pags = {};
      if (s)
        s.bloques.forEach(function (b) {
          if (b.pagina) pags[b.pagina] = 1;
        });
      L = L.filter(function (a) {
        return a.sid === P.V.secActual || (a.tipo === 'pagina' && pags[a.pagina]);
      });
    }
    if (P.V.filtro === 'notas')
      L = L.filter(function (a) {
        return a.tipo !== 'subrayado';
      });
    else if (P.V.filtro === 'abiertas')
      L = L.filter(function (a) {
        return a.estado !== 'resuelta';
      });
    else if (P.V.filtro === 'respondidas')
      L = L.filter(function (a) {
        return !!(a.respuesta || a.cierre);
      });
    else if (P.V.filtro === 'preguntas')
      L = L.filter(function (a) {
        return a.cierre === 'pregunta';
      });
    else if (P.V.filtro !== 'todas')
      L = L.filter(function (a) {
        return a.tipo === 'subrayado' && a.color === P.V.filtro;
      });
    if (P.V.filtroAutor)
      L = L.filter(function (a) {
        return (a.autor || '') === P.V.filtroAutor;
      });
    if (P.V.filtroEtiqueta)
      L = L.filter(function (a) {
        return P.etiquetasDe(a).indexOf(P.V.filtroEtiqueta) >= 0;
      });
    L.sort(function (x, y) {
      return ordenKey(x) < ordenKey(y) ? -1 : 1;
    });
    return L;
  }
  function listaNavegable() {
    return P.V.tab === 'revisar' ? lista() : lista(true);
  }
  // El orden del libro: la sección y la posición del bloque donde la anotación está hoy (no el número de su id, que
  // cambia si se insertan bloques), y dentro del bloque, el desplazamiento.
  function ordenKey(a) {
    var pe = P.pidEfectivo(a),
      u = E.UBIC[a.id],
      sid = (pe && P.BLOQUE_SEC[pe]) || a.sid;
    var si = E.SECS.findIndex(function (s) {
      return s.id === sid;
    });
    var bi = pe && P.POS_BLOQUE[pe] !== undefined ? P.POS_BLOQUE[pe] : -1;
    var ini = u && u.pid ? u.inicio : a.inicio || 0;
    return (si < 0 ? 999 : si) * 100000 + (bi < 0 ? 0 : bi + 1) * 10 + ini / 100000;
  }
  // ------------------------------------------------------------ fichas por id
  // Una ficha es función de dos cosas: la anotación y su «vista», todo lo demás que decide lo que muestra (activa, por
  // revisar, revisada, sin guardar, dónde quedó, si su pasaje cambió, sólo lectura, el lector y su perfil, la propuesta
  // abierta). La vista se reúne aquí, y sólo aquí: `ficha(a, vista)` (52-ficha.js) no lee nada más al dibujar, y
  // `npm run modulos` lo comprueba. Cada ficha dibujada se guarda con la anotación, la vista y la firma (la vista en
  // JSON); un redibujo reutiliza el nodo si la anotación es la misma y la firma no cambió.
  var PROPUESTA_ABIERTA = {}; // ids con el cuadro de la propuesta abierto sin propuesta guardada todavía
  var FICHAS = {}; // id → { a, vista, firma, nodo }
  var MEDIDAS = new WeakMap(); // nodo de ficha → ancho de la lista y modo con que se midieron sus notas
  function vistaDeFicha(a, varios) {
    var u = E.UBIC[a.id],
      pe = P.pidEfectivo(a),
      b = pe ? P.BLOQUES[pe] : null,
      pendiente = porRevisar(a),
      perdido = !!u && u.estado === 'perdido';
    return Object.freeze({
      foco: P.V.fichaFoco === a.id,
      pendiente: pendiente,
      revisada: !pendiente && !!P.V.revisadas[a.id],
      sinGuardar: P.SINC.sinGuardar[a.id] || '',
      ubicacion: u ? u.estado : '',
      otroBloque: !!u && u.pid !== a.pid,
      cambio: !!P.cambioDe(a),
      bloqueCambio: a.tipo === 'subrayado' && !!a.bh && !!b && !!b.h && b.h !== a.bh && !perdido,
      soloLectura: !!E.SOLO_LECTURA,
      // el lector se muestra si no es quien lee, o si hay varios
      autor:
        a.autor && (a.autor !== E.ME || varios) ? { perfil: P.PERFILES[a.autor] || null, yo: a.autor === E.ME } : null,
      propuestaAbierta: !!PROPUESTA_ABIERTA[a.id],
    });
  }
  function fichaPara(a, varios) {
    var c = FICHAS[a.id],
      vista = vistaDeFicha(a, varios),
      firma = JSON.stringify(vista);
    if (c && c.a === a && c.firma === firma) return { nodo: c.nodo, nueva: false };
    var nodo = P.ficha(a, vista);
    FICHAS[a.id] = { a: a, vista: vista, firma: firma, nodo: nodo };
    return { nodo: nodo, nueva: true };
  }
  // El único camino para cambiar una ficha sin redibujarla: quien la toca en el sitio (la clase `foco`, el cuadro de la
  // propuesta) dice qué parte de la vista ya muestra, y el registro la anota para que el próximo redibujo no la rehaga
  // por eso. Lo demás que haya cambiado sin redibujarse (una pregunta que se contestó, un autor que se puso al subir)
  // sigue pendiente y el redibujo lo muestra.
  function vistaEnSitio(id, cambios) {
    var c = FICHAS[id];
    if (!c || !c.nodo.isConnected) return;
    c.vista = Object.freeze(Object.assign({}, c.vista, cambios));
    c.firma = JSON.stringify(c.vista);
  }
  // El cuadro de la propuesta queda abierto aunque no se haya guardado nada: un redibujo lo vuelve a dibujar.
  function propuestaAbierta(id) {
    PROPUESTA_ABIERTA[id] = 1;
    vistaEnSitio(id, { propuestaAbierta: true });
  }
  // Una ficha que no debe reutilizarse (lo pasajero que muestra, como «¿Borrar?», no está en su vista).
  function olvidarFicha(id) {
    delete FICHAS[id];
  }
  // Tras un guardado silencioso, el cuadro ya muestra lo escrito: el registro pasa a la anotación nueva si la ficha
  // mostraba la anterior (`ant`). La vista no se toca: si el cambio altera lo que la ficha muestra («revisada»), el
  // próximo redibujo la rehace.
  function avanzarFicha(id, ant) {
    var c = FICHAS[id];
    if (c && c.a === ant && P.anots[id]) c.a = P.anots[id];
  }
  // Deja en `cont` exactamente `nodos`, en ese orden, sin mover los que ya están en su lugar.
  function colocarHijos(cont, nodos) {
    for (var i = 0; i < nodos.length; i++)
      if (cont.children[i] !== nodos[i]) cont.insertBefore(nodos[i], cont.children[i] || null);
    while (cont.children.length > nodos.length) cont.removeChild(cont.lastElementChild);
  }
  function renderPanel() {
    if (P.V.tab === 'buscar') return;
    // Si el autor está escribiendo una nota, el redibujo no debe quitarle el editor: se recuerda el
    // borrador, el foco y la selección, y se restauran sobre la ficha nueva.
    // Un botón se reconoce por su acción (y su color), no por su clase ni su texto, que cambian con el propio clic.
    var act = /** @type {HTMLTextAreaElement} */ (document.activeElement),
      foco = null,
      focoBoton = null;
    if (act && act.tagName === 'TEXTAREA' && act.id.indexOf('nota-') === 0)
      foco = { id: act.id, valor: act.value, ini: act.selectionStart, fin: act.selectionEnd, scroll: act.scrollTop };
    else if (act && act.tagName === 'BUTTON' && act.closest('.ficha'))
      focoBoton = {
        id: /** @type {Element} */ (act.closest('.ficha')).getAttribute('data-id'),
        accion: act.getAttribute('data-accion') || '',
        c: act.getAttribute('data-c') || '',
        texto: act.textContent,
      };
    var box = P.$('#lista'),
      desplaz = box.scrollTop;
    P.renderSelectores();
    P.marcarFiltro();
    renderCuentaRevisar();
    var L = lista(),
      margen = P.margenActivo() && L.length > 0;
    box.classList.toggle('al-margen', margen);
    P.$('#panel').classList.toggle('margen', margen);
    if (!margen) P.soltarMargen();
    P.resolverPerfiles(
      L.map(function (a) {
        return a.autor;
      }).filter(Boolean)
    );
    P.$('#n-panel').textContent = Object.keys(P.anots).length ? '(' + Object.keys(P.anots).length + ')' : '';
    var cabeza = P.V.tab === 'revisar' ? [cabezaBandeja(L)] : [];
    // fuera del registro las fichas de anotaciones que ya no están (también si la lista queda vacía)
    Object.keys(FICHAS).forEach(function (id) {
      if (!P.anots[id]) delete FICHAS[id];
    });
    if (!L.length) {
      var filtrado = P.V.tab !== 'revisar' && (P.V.filtro !== 'todas' || !!P.V.filtroAutor || !!P.V.filtroEtiqueta);
      var vacio = P.el('div', {
        'class': 'vacio',
        text:
          P.V.tab === 'revisar'
            ? 'No hay respuestas por revisar. Cuando quien edita las fuentes responda una anotación tuya, aparecerá aquí.'
            : filtrado
              ? 'Ninguna anotación con estos filtros. '
              : P.V.tab === 'capitulo'
                ? 'Sin anotaciones en esta sección. Selecciona texto para subrayarlo; haz clic en un número de página para dejarle una nota.'
                : 'Aún no hay anotaciones.',
      });
      if (filtrado) {
        var qf = P.el('button', { 'class': 'enlace', type: 'button', text: 'Quitar filtros' });
        qf.addEventListener('click', function () {
          P.quitarFiltros();
          renderPanel();
          var p = P.$('.ficha') || P.$('#filtros-det > summary');
          if (p) p.focus({ preventScroll: true });
        });
        vacio.appendChild(qf);
      }
      colocarHijos(box, cabeza.concat([vacio]));
      P.actualizarNav();
      return;
    }
    // las fichas que no cambiaron se reutilizan (y no se mueven si ya están en su lugar); sólo se dibujan las nuevas.
    // Se miden las notas de las nuevas y de las reutilizadas que se midieron con otro ancho o modo, o sin verse (el
    // panel oculto en concentración o en el teléfono); fuera del margen, ninguna conserva la altura que tuvo ahí.
    var varios = P.variosAutores(),
      ancho = box.clientWidth,
      medida = ancho ? ancho + '|' + margen : null,
      porMedir = [],
      nodos = L.map(function (a) {
        var r = fichaPara(a, varios);
        if (r.nueva || !medida || MEDIDAS.get(r.nodo) !== medida) porMedir.push(r.nodo);
        if (!margen && r.nodo.style.top) r.nodo.style.top = '';
        return r.nodo;
      });
    if (margen) {
      var capa = P.$(':scope > .capa-margen', box) || P.el('div', { 'class': 'capa-margen' });
      colocarHijos(box, cabeza.concat([capa]));
      colocarHijos(capa, nodos);
    } else colocarHijos(box, cabeza.concat(nodos));
    if (porMedir.length) ajustarTextareasDe(porMedir);
    porMedir.forEach(function (n) {
      if (medida) MEDIDAS.set(n, medida);
      else MEDIDAS.delete(n);
    });
    if (margen) P.colocarMargen();
    else box.scrollTop = desplaz;
    // si el elemento enfocado sigue en la página (su ficha se reutilizó), no hay nada que restaurar
    if (act && act.isConnected && document.activeElement === act) foco = focoBoton = null;
    if (foco) {
      var ta = /** @type {HTMLTextAreaElement} */ (document.getElementById(foco.id));
      if (ta) {
        if (ta.value !== foco.valor) {
          ta.value = foco.valor;
          // como si se hubiera escrito: la diferencia de la propuesta, el alto, el margen y el guardado lo siguen
          ta.dispatchEvent(new Event('input'));
        }
        ta.focus({ preventScroll: true });
        try {
          ta.setSelectionRange(foco.ini, foco.fin);
        } catch (e) {}
        ta.scrollTop = foco.scroll;
      }
    } else if (focoBoton) {
      var fb = P.$('.ficha[data-id="' + focoBoton.id + '"]');
      var mismo = function (b) {
        return (
          (b.getAttribute('data-accion') || '') === focoBoton.accion && (b.getAttribute('data-c') || '') === focoBoton.c
        );
      };
      var bt = fb
        ? P.$$('button', fb).filter(mismo)[0] ||
          P.$$('button', fb).filter(function (b) {
            return b.textContent === focoBoton.texto;
          })[0]
        : null;
      if (bt) bt.focus({ preventScroll: true });
    }
    P.actualizarNav();
  }
  function cabezaBandeja(L) {
    var pend = L.filter(porRevisar).length,
      hechas = L.length - pend;
    var c = P.el('div', { 'class': 'bandeja-cab' }, [
      P.el('div', {
        text: pend
          ? pend +
            (pend === 1 ? ' respuesta por revisar' : ' respuestas por revisar') +
            (hechas ? ' · ' + hechas + (hechas === 1 ? ' revisada' : ' revisadas') + ' en esta visita' : '')
          : hechas
            ? 'Revisaste todas las respuestas nuevas.'
            : '',
      }),
    ]);
    if (pend && !E.SOLO_LECTURA) {
      c.appendChild(
        P.el(
          'div',
          { 'class': 'bandeja-ayuda' },
          [
            ['A', 'atendida'],
            ['R', 'reabrir'],
            ['V', 'ver el cambio'],
            ['.', 'siguiente'],
            [',', 'anterior'],
          ].map(function (x) {
            return P.el('span', {}, [P.el('kbd', { text: x[0] }), ' ' + x[1]]);
          })
        )
      );
      var ini = P.el('button', {
        'class': 'btn peq primario',
        type: 'button',
        text:
          P.V.fichaFoco &&
          L.some(function (a) {
            return a.id === P.V.fichaFoco;
          })
            ? 'Siguiente ›'
            : 'Empezar la revisión ›',
      });
      ini.addEventListener('click', function () {
        P.navegar(1);
      });
      c.appendChild(ini);
    }
    return c;
  }
  function renderCuentaRevisar() {
    P.refrescarMarcas();
    var n = cuantasPorRevisar();
    P.$('#n-revisar').textContent = n ? String(n) : '';
    // en el botón del teléfono el número va con su significado para quien usa lector de pantalla
    var bp = P.$('#n-panel-revisar');
    bp.textContent = '';
    if (n) {
      bp.appendChild(P.el('span', { 'class': 'solo-lectores', text: ', ' }));
      bp.appendChild(document.createTextNode(String(n)));
      bp.appendChild(
        P.el('span', { 'class': 'solo-lectores', text: n === 1 ? ' respuesta por revisar' : ' respuestas por revisar' })
      );
    }
    bp.title = n ? n + (n === 1 ? ' respuesta por revisar' : ' respuestas por revisar') : '';
  }
  function etiqueta(a) {
    if (a.tipo === 'subrayado') return (a.sidTitulo || '').replace(/\..*$/, '') + (a.pagina ? ' · p. ' + a.pagina : '');
    if (a.tipo === 'pagina') return 'Nota de la página ' + a.pagina;
    if (a.tipo === 'capitulo') return 'Nota de la sección: ' + (a.sidTitulo || '');
    return 'Nota general';
  }

  // ------------------------------------------------------------ fichas compactas
  // Una ficha en reposo se lee como texto: cita y respuesta recortadas, la nota en un cuadro sin marco y sin botones.
  // Al tocarla (o al llegar a ella con el teclado) se activa: se ve entera, el cuadro de la nota toma su marco y
  // aparecen las acciones; tocar la nota pone el cursor justo ahí. Activar no redibuja nada.
  var ALTO_REPOSO = 98; // px de nota visibles en reposo (unas cinco líneas)
  function ajustarAlto(ta) {
    if (!ta || !ta.isConnected) return;
    ta.style.height = 'auto';
    fijarAlto(ta, ta.scrollHeight);
  }
  function fijarAlto(ta, h) {
    if (!h) {
      ta.style.height = '';
      return;
    } // el panel no se ve (concentración): se ajusta al mostrarse
    var activa = !!ta.closest('.ficha.foco') || document.activeElement === ta;
    var tope = activa ? Math.max(140, Math.round(window.innerHeight * 0.45)) : ALTO_REPOSO;
    ta.style.height = Math.min(h, tope) + 2 + 'px';
    ta.classList.toggle('recortada', !activa && h > ALTO_REPOSO);
  }
  // Por lotes: primero todas las escrituras, luego todas las lecturas, luego todas las escrituras; así el navegador
  // calcula la maquetación una vez y no una por nota (con cientos de fichas, redibujar o cambiar el ancho no se traba).
  function ajustarTextareas(raiz) {
    ajustarLote(P.$$('.ficha textarea', raiz || P.$('#lista')));
  }
  function ajustarTextareasDe(nodos) {
    var tas = [];
    nodos.forEach(function (n) {
      tas.push.apply(tas, P.$$('textarea', n));
    });
    ajustarLote(tas);
  }
  function ajustarLote(tas) {
    tas.forEach(function (ta) {
      ta.style.height = 'auto';
    });
    var hs = tas.map(function (ta) {
      return ta.scrollHeight;
    });
    tas.forEach(function (ta, i) {
      fijarAlto(ta, hs[i]);
    });
  }
  function activar(id) {
    if (P.V.fichaFoco === id) return;
    var antes = P.V.fichaFoco;
    P.VISTA.cambiar({ fichaFoco: id });
    P.$$('.ficha.foco').forEach(function (f) {
      f.classList.remove('foco');
      ajustarTextareas(f);
    });
    P.$$('mark.hl.foco').forEach(function (m) {
      m.classList.remove('foco');
    });
    var f = P.$('.ficha[data-id="' + id + '"]');
    if (f) {
      f.classList.add('foco');
      ajustarTextareas(f);
    }
    P.$$('mark.hl[data-aids~="' + id + '"]').forEach(function (m) {
      m.classList.add('foco');
    });
    vistaEnSitio(antes, { foco: false });
    vistaEnSitio(id, { foco: true });
    if (P.margenActivo()) P.reacomodarPorActivar(id);
    P.actualizarNav();
  }
})(LAPagina, LAEstado);
