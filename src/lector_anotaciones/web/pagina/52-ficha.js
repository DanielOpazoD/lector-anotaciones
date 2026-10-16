// ------------------------------------------------------------ la ficha de una anotación, por partes
// `ctx`: la anotación con que se dibuja (`a`), el nodo (`f`), la anotación viva (`actual()`) y lo que se calcula una vez
// (`pendiente`, `cambio`, `u`). Las clausuras de la ficha leen la anotación viva, no la copia con que se dibujó: un
// guardado silencioso (nota, réplica) sustituye el objeto en `anots` sin redibujar el panel, y copiar, cambiar el color o
// el estado después deben llevar lo recién escrito.
(function (P, E) {
  // lo que este fragmento ofrece a los demás (las funciones se elevan: están desde el principio)
  P.ficha = ficha;
  P.abrirPropuesta = abrirPropuesta;
  function ficha(a) {
    var ctx = {
      a: a,
      actual: function () {
        return P.anots[a.id] || a;
      },
      pendiente: P.porRevisar(a),
      cambio: P.cambioDe(a),
      u: E.UBIC[a.id],
    };
    var pendiente = ctx.pendiente;
    var f = P.el('div', {
      'class':
        'ficha t-' +
        a.tipo +
        (a.color ? ' c-' + a.color : '') +
        (a.estado === 'resuelta' ? ' resuelta' : '') +
        (P.V.fichaFoco === a.id ? ' foco' : '') +
        (P.SINC.sinGuardar[a.id] ? ' sin-guardar' : '') +
        (pendiente ? ' por-revisar' : '') +
        (!pendiente && P.V.revisadas[a.id] ? ' revisada' : ''),
      'data-id': a.id,
      tabindex: '-1',
      role: 'article',
      'aria-label':
        (a.tipo === 'subrayado' && a.color ? a.color + ': ' : '') +
        P.etiqueta(a) +
        (pendiente ? ' · respuesta por revisar' : ''),
    });
    ctx.f = f;
    f.appendChild(fichaCabecera(ctx));
    fichaAvisos(ctx).forEach(function (n) {
      f.appendChild(n);
    });
    if (a.cierre === 'pregunta') f.classList.add('cierre-pregunta');
    if (a.tipo === 'subrayado')
      f.appendChild(P.el('div', { 'class': 'cita', text: a.cita.length > 220 ? a.cita.slice(0, 220) + '…' : a.cita }));
    if (E.SOLO_LECTURA) {
      fichaSoloLectura(ctx);
      return f;
    }
    fichaEdicion(ctx);
    f.appendChild(fichaAcciones(ctx));
    // tocar la ficha (fuera de sus controles) la activa; llegar a ella con el teclado, también
    f.addEventListener('click', function (ev) {
      if (ev.target.closest('button, a, textarea, input, select, label, summary')) return;
      P.activar(a.id);
      if (!f.contains(document.activeElement)) f.focus({ preventScroll: true });
    });
    f.addEventListener('focusin', function () {
      P.activar(a.id);
    });
    return f;
  }
  // Cabecera: categoría, sección y página, lector, cierre, «nueva respuesta» o «revisada», e «ir al texto».
  function fichaCabecera(ctx) {
    var a = ctx.a,
      u = ctx.u,
      cambio = ctx.cambio,
      pendiente = ctx.pendiente,
      actual = ctx.actual;
    var cab = P.el('div', { 'class': 'cab' }, [
      P.el('span', {}, [
        a.tipo === 'subrayado' && a.color ? P.el('span', { 'class': 'cat', text: a.color }) : null,
        P.etiqueta(a),
      ]),
    ]);
    if (a.autor && (a.autor !== E.ME || P.variosAutores())) cab.firstChild.appendChild(P.chipAutor(a.autor));
    if (a.cierre)
      cab.firstChild.appendChild(
        P.el('span', {
          'class': 'cierre ' + a.cierre,
          text: a.cierre === 'atendida' ? 'atendida' : a.cierre === 'descartada' ? 'descartada' : 'pregunta',
        })
      );
    if (pendiente) cab.firstChild.appendChild(P.el('span', { 'class': 'nueva', text: 'nueva respuesta' }));
    else if (P.V.revisadas[a.id])
      cab.firstChild.appendChild(P.el('span', { 'class': 'nueva hecha', text: '✓ revisada' }));
    if (
      (a.pid && !(u && u.estado === 'perdido')) ||
      cambio ||
      (a.tipo === 'pagina' && a.pagina) ||
      a.tipo === 'capitulo'
    ) {
      var ir = P.el('button', { 'class': 'enlace', type: 'button', text: 'ir al texto', 'data-accion': 'ir' });
      ir.addEventListener('click', function () {
        P.irAAnot(actual());
      });
      cab.appendChild(ir);
    }
    return cab;
  }
  // Avisos: sin guardar en la base, reubicada, perdida, bloque cambiado desde que se anotó.
  function fichaAvisos(ctx) {
    var a = ctx.a,
      u = ctx.u,
      cambio = ctx.cambio,
      out = [];
    if (P.SINC.sinGuardar[a.id]) {
      var ag = P.el('div', {
        'class': 'aviso-guardar',
        text: 'Sin guardar en la base (' + P.SINC.sinGuardar[a.id] + '); se conserva en este navegador. ',
      });
      if (!E.SOLO_LECTURA) {
        var re = P.el('button', { 'class': 'enlace', type: 'button', text: 'Reintentar', 'data-accion': 'reintentar' });
        re.addEventListener('click', function () {
          P.reintentar(a.id);
        });
        ag.appendChild(re);
      }
      out.push(ag);
    }
    if (u && u.estado === 'reubicado')
      out.push(
        P.el('div', {
          'class': 'aviso-ubic',
          text:
            'Reubicado: el texto se movió desde que se hizo la anotación' +
            (u.pid !== a.pid ? ' (ahora en otro bloque)' : '') +
            '.',
        })
      );
    if (u && u.estado === 'perdido')
      out.push(
        P.el('div', {
          'class': 'aviso-ubic',
          text: cambio
            ? 'El pasaje se reescribió: la cita ya no está tal cual; «ver el cambio» muestra el antes y el después.'
            : 'No encontrado en esta versión del libro; la cita se conserva aquí.',
        })
      );
    var pe = P.pidEfectivo(a);
    if (
      a.tipo === 'subrayado' &&
      a.bh &&
      P.BLOQUES[pe] &&
      P.BLOQUES[pe].h &&
      P.BLOQUES[pe].h !== a.bh &&
      !(u && u.estado === 'perdido')
    )
      out.push(
        P.el('div', {
          'class': 'aviso-cambio',
          text: 'El bloque cambió desde que anotaste' + (a.libro ? ' (fuentes del ' + a.libro + ')' : '') + '.',
        })
      );
    return out;
  }
  // La propuesta de texto de un subrayado (`sugerencia`): la diferencia palabra por palabra con la cita y, si se puede
  // editar, el cuadro para escribirla, que se ve con la ficha activa. Vacía o igual a la cita no propone nada.
  function fichaPropuesta(a, editable) {
    var caja = P.el('div', { 'class': 'propuesta' }, [P.el('div', { 'class': 'etq', text: 'Propuesta' })]),
      dif = P.el('div', { 'class': 'dif-propuesta' });
    caja.appendChild(dif);
    var mostrarDif = function (texto) {
      var s = P.N.propuesta({ id: a.id, tipo: 'subrayado', cita: a.cita, sugerencia: texto });
      caja.classList.toggle('vacia', !s);
      dif.textContent = '';
      dif.appendChild(s ? difRecortada(a.cita.trim(), s) : P.el('span', { 'class': 'sin', text: 'Igual a la cita' }));
    };
    mostrarDif(a.sugerencia);
    if (!editable) return caja;
    var ta = P.el('textarea', {
      'class': 'sugerencia',
      placeholder: 'El texto que propones en lugar de la cita…',
      'aria-label': 'Texto propuesto en lugar de la cita',
      id: 'nota-' + a.id + '-sugerencia',
      rows: '1',
    });
    ta.value = typeof a.sugerencia === 'string' ? a.sugerencia : a.cita;
    var t = null;
    // abrir el cuadro no propone nada: sólo se guarda lo que cambia respecto de lo que había (o de la cita)
    var guardarPropuesta = function () {
      var vivo = P.anots[a.id];
      if (!vivo || ta.value === (typeof vivo.sugerencia === 'string' ? vivo.sugerencia : vivo.cita)) return;
      guardarSilencioso(a.id, { sugerencia: ta.value });
    };
    ta.addEventListener('input', function () {
      mostrarDif(ta.value);
      P.ajustarAlto(ta);
      P.colocarMargenPronto();
      clearTimeout(t);
      t = setTimeout(guardarPropuesta, 900);
    });
    ta.addEventListener('blur', function () {
      clearTimeout(t);
      guardarPropuesta();
      P.ajustarAlto(ta);
    });
    ta.addEventListener('focus', function () {
      cursorAlFinal(ta);
      P.ajustarAlto(ta);
    });
    ta.addEventListener('keydown', teclaSalir(a.id));
    caja.appendChild(ta);
    return caja;
  }
  // La diferencia de una propuesta con lo que no cambia recortado: de un tramo igual largo quedan unas palabras a cada
  // lado del cambio y «…» en lugar del resto, para que en una cita larga se vea el cambio y no el párrafo.
  function difRecortada(antes, ahora) {
    var w = P.el('div'),
      tramos = P.diffPalabras(antes, ahora),
      MAX = 14,
      LADO = 6;
    tramos.forEach(function (p, i) {
      if (p[0] !== '=') {
        w.appendChild(P.el(p[0] === '-' ? 'del' : 'ins', { text: p[1] }));
        return;
      }
      var pal = p[1].split(/(\s+)/),
        palabras = pal.filter(function (x) {
          return /\S/.test(x);
        }).length,
        t = p[1];
      if (palabras > MAX) {
        var cabeza = pal.slice(0, LADO * 2).join(''),
          cola = pal.slice(-LADO * 2).join('');
        if (i === 0) t = '… ' + cola.replace(/^\s+/, '');
        else if (i === tramos.length - 1) t = cabeza.replace(/\s+$/, '') + ' …';
        else t = cabeza.replace(/\s+$/, '') + ' … ' + cola.replace(/^\s+/, '');
      }
      w.appendChild(document.createTextNode(t));
    });
    return w;
  }
  // Abre el cuadro de la propuesta en la ficha de un subrayado (lo crea con la cita si no lo tiene) y lo enfoca.
  function abrirPropuesta(id) {
    var a = P.anots[id],
      f = P.$('.ficha[data-id="' + id + '"]');
    if (!a || !f || a.tipo !== 'subrayado' || E.SOLO_LECTURA) return;
    P.PROPUESTA_ABIERTA[id] = 1; // un redibujo antes de guardar nada lo vuelve a dibujar
    P.activar(id);
    var ta = P.$('textarea.sugerencia', f);
    if (!ta) {
      var caja = fichaPropuesta(a, true);
      f.insertBefore(caja, P.$('details.hilo, .respuesta, textarea.replica, .acciones', f));
      var b = P.$('[data-accion="proponer"]', f);
      if (b) b.remove();
      ta = P.$('textarea.sugerencia', caja);
    }
    ta.focus({ preventScroll: true });
    P.ajustarAlto(ta);
    P.colocarMargenPronto();
  }
  // La conversación anterior (`hilo`), plegada: lo vigente sigue en la respuesta y la réplica que vienen después.
  function fichaHilo(a) {
    if (!a.hilo || !a.hilo.length) return null;
    var d = P.el('details', { 'class': 'hilo' }, [
      P.el('summary', { text: 'Conversación anterior (' + a.hilo.length + ')' }),
    ]);
    a.hilo.forEach(function (h) {
      var detalle = [h.cierre, h.commit, (h.cuando || '').slice(0, 10)].filter(Boolean).join(' · ');
      d.appendChild(
        P.el('div', { 'class': 'hilo-item ' + (h.de === 'autor' ? 'del-autor' : 'del-editor') }, [
          P.el('div', {
            'class': 'quien',
            text: (h.de === 'autor' ? 'Tú' : 'Quien edita') + (detalle ? ' · ' + detalle : ''),
          }),
          document.createTextNode(h.texto || ''),
        ])
      );
    });
    return d;
  }
  // Sólo lectura: la nota y la respuesta como texto, y «Copiar».
  function fichaSoloLectura(ctx) {
    var a = ctx.a,
      f = ctx.f,
      actual = ctx.actual;
    f.appendChild(P.el('div', { 'class': 'nota-texto', text: a.nota || '' }));
    if (P.N.propuesta(a)) f.appendChild(fichaPropuesta(a, false));
    var hiloSL = fichaHilo(a);
    if (hiloSL) f.appendChild(hiloSL);
    if (a.respuesta || a.cierre) {
      var rs = P.el('div', { 'class': 'respuesta' });
      rs.appendChild(P.el('div', { 'class': 'quien', text: 'Respuesta' + (a.commit ? ' · ' + a.commit : '') }));
      rs.appendChild(document.createTextNode(a.respuesta || ''));
      f.appendChild(rs);
    }
    if (a.replica) f.appendChild(P.el('div', { 'class': 'nota-texto', text: a.replica }));
    var accSL = P.el('div', { 'class': 'acciones siempre' });
    var copSL = P.el('button', {
      'class': 'btn peq copiar',
      type: 'button',
      text: 'Copiar',
      title: 'Copiar esta anotación como texto',
      'data-accion': 'copiar',
    });
    copSL.addEventListener('click', function () {
      P.copiar(P.textoAnotacion(actual()), copSL);
    });
    accSL.appendChild(copSL);
    f.appendChild(accSL);
  }
  // Al entrar en una nota con el teclado (o desde el código), el cursor va al final, para seguir escribiendo; con el
  // puntero queda donde se tocó, y una selección ya hecha (al principio, o de todo el texto) no se toca.
  function cursorAlFinal(ta) {
    if (E.punteroAbajo || ta.selectionStart !== 0 || ta.selectionEnd !== 0) return;
    try {
      ta.setSelectionRange(ta.value.length, ta.value.length);
    } catch (e) {}
  }
  // Esc o Ctrl/Cmd+Enter en un cuadro de la ficha guarda (al perder el foco) y vuelve al texto.
  function teclaSalir(id) {
    return function (ev) {
      if (ev.key !== 'Escape' && !(ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) return;
      ev.preventDefault();
      ev.stopPropagation();
      ev.target.blur();
      P.volverAlTexto(id);
    };
  }
  // Edición: la nota (y sus etiquetas), la propuesta de texto, la respuesta de quien edita y, si es una pregunta, el
  // cuadro de la réplica.
  function fichaEdicion(ctx) {
    var a = ctx.a,
      f = ctx.f;
    var salirConTecla = teclaSalir(a.id);
    var ta = P.el('textarea', {
      'class': 'nota',
      placeholder: a.tipo === 'subrayado' ? 'Añadir una nota…' : 'Escribe la nota…',
      'aria-label': 'Nota',
      id: 'nota-' + a.id,
      rows: '1',
    });
    ta.value = a.nota || '';
    var timer = null;
    var guardarNota = function () {
      if (P.anots[a.id] && ta.value !== P.anots[a.id].nota) {
        guardarSilencioso(a.id, { nota: ta.value });
        P.pintarEtiquetas(f, P.anots[a.id]);
      }
    };
    ta.addEventListener('input', function () {
      P.ajustarAlto(ta);
      P.colocarMargenPronto();
      clearTimeout(timer);
      timer = setTimeout(guardarNota, 900);
    });
    ta.addEventListener('blur', function () {
      clearTimeout(timer);
      guardarNota();
      P.ajustarAlto(ta);
    });
    ta.addEventListener('focus', function () {
      cursorAlFinal(ta);
      P.ajustarAlto(ta);
    });
    ta.addEventListener('keydown', salirConTecla);
    f.appendChild(ta);
    P.pintarEtiquetas(f, a);
    if (a.tipo === 'subrayado' && (typeof a.sugerencia === 'string' || P.PROPUESTA_ABIERTA[a.id]))
      f.appendChild(fichaPropuesta(a, true));
    var hilo = fichaHilo(a);
    if (hilo) f.appendChild(hilo);
    if (a.respuesta || a.cierre) {
      var r = P.el('div', { 'class': 'respuesta' });
      r.appendChild(
        P.el('div', {
          'class': 'quien',
          text:
            'Respuesta' + (a.commit ? ' · ' + a.commit : '') + (a.respondido ? ' · ' + a.respondido.slice(0, 10) : ''),
        })
      );
      r.appendChild(
        document.createTextNode(
          a.respuesta || (a.cierre === 'atendida' ? 'Atendida.' : a.cierre === 'descartada' ? 'Descartada.' : '')
        )
      );
      f.appendChild(r);
    }
    if (a.cierre === 'pregunta') {
      var rp = P.el('textarea', {
        'class': 'replica',
        placeholder: 'Tu respuesta a la pregunta…',
        'aria-label': 'Respuesta a la pregunta',
        id: 'nota-' + a.id + '-replica',
        rows: '1',
      });
      rp.value = a.replica || '';
      var tr = null;
      // contestar una pregunta por revisar es revisarla
      var guardarReplica = function () {
        var vivo = P.anots[a.id];
        if (!vivo || rp.value === (vivo.replica || '')) return;
        var parche = { replica: rp.value };
        if (rp.value.trim() && P.porRevisar(vivo)) {
          parche.revisado = P.N.marcaRevision(vivo, P.ahora());
          if (P.V.tab === 'revisar') P.VISTA.revisada(a.id);
        }
        guardarSilencioso(a.id, parche);
        if (parche.revisado) P.renderCuentaRevisar();
      };
      rp.addEventListener('input', function () {
        P.ajustarAlto(rp);
        P.colocarMargenPronto();
        clearTimeout(tr);
        tr = setTimeout(guardarReplica, 900);
      });
      rp.addEventListener('blur', function () {
        clearTimeout(tr);
        guardarReplica();
        P.ajustarAlto(rp);
      });
      rp.addEventListener('focus', function () {
        cursorAlFinal(rp);
        P.ajustarAlto(rp);
      });
      rp.addEventListener('keydown', salirConTecla);
      f.appendChild(rp);
    }
  }
  // Acciones: colores, «✓ Atendida» y «Reabrir» (por revisar) o «Resuelta», «Ver el cambio», «Copiar» y «Borrar».
  function fichaAcciones(ctx) {
    var a = ctx.a,
      f = ctx.f,
      actual = ctx.actual,
      pendiente = ctx.pendiente,
      cambio = ctx.cambio;
    var acc = P.el('div', { 'class': 'acciones' });
    if (a.tipo === 'subrayado') {
      var cols = P.el('div', { 'class': 'colores' });
      ['revisar', 'cortar', 'duda', 'conservar'].forEach(function (c) {
        var b = P.el('button', {
          'class': 'col-btn c-' + c + (a.color === c ? ' on' : ''),
          type: 'button',
          title: c,
          'aria-label': 'Color: ' + c,
          'aria-pressed': a.color === c ? 'true' : 'false',
          'data-accion': 'color',
          'data-c': c,
        });
        // una copia con el cambio: `guardar` toma la versión previa del objeto todavía intacto
        b.addEventListener('click', function () {
          var ac = actual();
          P.guardar(Object.assign({}, ac, { color: c }));
          if (ac.color !== c) P.ofrecerDeshacerCambio(a.id, { color: ac.color }, { color: c }, 'Color: ' + c + '.');
        });
        cols.appendChild(b);
      });
      acc.appendChild(cols);
    }
    if (pendiente) {
      // por revisar: «Atendida» confirma lo hecho; «Reabrir» la devuelve con el cursor en la nota (o en la réplica)
      var at = P.el('button', {
        'class': 'btn peq primario',
        type: 'button',
        text: '✓ Atendida',
        title: 'La respuesta te sirve: queda resuelta (A)',
        'data-accion': 'atendida',
      });
      at.addEventListener('click', function () {
        P.revisar(a.id, 'atendida');
      });
      var ra = P.el('button', {
        'class': 'btn peq',
        type: 'button',
        text: 'Reabrir',
        title: 'No quedó bien: vuelve a abrirla y escribe por qué (R)',
        'data-accion': 'reabrir',
      });
      ra.addEventListener('click', function () {
        P.revisar(a.id, 'reabrir');
      });
      acc.appendChild(at);
      acc.appendChild(ra);
    } else {
      var res = P.el('button', {
        'class': 'btn peq',
        type: 'button',
        text: a.estado === 'resuelta' ? 'Reabrir' : 'Resuelta',
        'data-accion': 'estado',
      });
      res.addEventListener('click', function () {
        var ac = actual(),
          nuevo = ac.estado === 'resuelta' ? 'abierta' : 'resuelta';
        P.guardar(Object.assign({}, ac, { estado: nuevo }));
        P.ofrecerDeshacerCambio(
          a.id,
          { estado: ac.estado || 'abierta' },
          { estado: nuevo },
          nuevo === 'resuelta' ? 'Marcada resuelta.' : 'Reabierta.'
        );
      });
      acc.appendChild(res);
    }
    if (a.tipo === 'subrayado' && typeof a.sugerencia !== 'string' && !P.PROPUESTA_ABIERTA[a.id]) {
      var pr = P.el('button', {
        'class': 'btn peq',
        type: 'button',
        text: 'Proponer texto',
        title: 'Escribir el texto que propones en lugar de la cita (P)',
        'data-accion': 'proponer',
      });
      pr.addEventListener('click', function () {
        abrirPropuesta(a.id);
      });
      acc.appendChild(pr);
    }
    if (cambio) {
      var vc = P.el('button', {
        'class': 'btn peq',
        type: 'button',
        text: 'Ver el cambio',
        title: 'Ir al pasaje y mostrar el antes y el después (V)',
        'data-accion': 'cambio',
      });
      vc.addEventListener('click', function () {
        P.verCambio(a.id);
      });
      acc.appendChild(vc);
    }
    var cop = P.el('button', {
      'class': 'btn peq copiar',
      type: 'button',
      text: 'Copiar',
      title: 'Copiar esta anotación como texto para pegarla en el chat',
      'data-accion': 'copiar',
    });
    cop.addEventListener('click', function () {
      P.copiar(P.textoAnotacion(actual()), cop);
    });
    acc.appendChild(cop);
    var del = P.el('button', { 'class': 'btn peq', type: 'button', text: 'Borrar', 'data-accion': 'borrar' });
    del.addEventListener('click', function () {
      // el confirmador recibe el foco (que estaba en el botón que se retira) y «No» lo devuelve a «Borrar»
      var si = P.el('button', {
        'class': 'btn peq',
        type: 'button',
        text: 'Sí',
        'data-accion': 'si',
        onclick: function () {
          // el foco pasa a la ficha vecina (o a la pestaña activa), no al cuerpo del documento
          var vecina = f.nextElementSibling || f.previousElementSibling,
            idVecina = vecina && vecina.getAttribute('data-id');
          P.borrar(a.id);
          var destino = (idVecina && P.$('.ficha[data-id="' + idVecina + '"]')) || P.$('.tab.activa');
          if (destino) destino.focus({ preventScroll: true });
        },
      });
      var no = P.el('button', {
        'class': 'btn peq',
        type: 'button',
        text: 'No',
        'data-accion': 'no',
        onclick: function () {
          acc.replaceChild(del, c);
          del.focus({ preventScroll: true });
        },
      });
      var c = P.el('span', { 'class': 'confirmar' }, [P.el('span', { text: '¿Borrar?' }), si, no]);
      acc.replaceChild(c, del);
      // la pregunta es pasajera: si la ficha se redibuja, vuelve con «Borrar»
      delete P.FICHAS[a.id];
      si.focus({ preventScroll: true });
    });
    acc.appendChild(del);
    return acc;
  }
  function guardarSilencioso(id, parche) {
    // Ediciones de nota y réplica. Lo escrito es trabajo del lector y no se tira: si la base rechaza, el borrador
    // sigue en el cuadro y en memoria marcado «sin guardar», con copia en el navegador y reintento desde la ficha
    // (`rechazoEscritura` sin versión previa); un rechazo de permiso pasa además la página a sólo lectura. Al
    // recargar, una copia local más reciente que la de la base vuelve a cargarse y a subir (`cargarLocal`).
    var ant = P.anots[id];
    if (!ant || E.SOLO_LECTURA) return;
    P.SINC.cambiar(Object.assign({}, ant, parche), P.ahora());
    // la ficha ya muestra lo escrito: no hace falta rehacerla (salvo que cambie lo que muestra, como «revisada»)
    P.avanzarFicha(id, ant);
    if (E.col) P.escribirEnBase(id, null);
    else P.guardarLocal(E.modo === 'cargando' ? [id] : undefined);
  }
})(LAPagina, LAEstado);
