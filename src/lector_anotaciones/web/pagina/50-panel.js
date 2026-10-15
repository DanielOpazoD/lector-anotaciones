  // ------------------------------------------------------------ panel
  // Pestañas: «Sección» (las de la sección abierta; en escritorio, al margen de su pasaje), «Todas», «Por revisar» (las
  // respuestas que el autor todavía no revisó) y «Búsqueda».
  var REVISADAS = {};  // ids revisados en esta visita a «Por revisar»: siguen a la vista, marcados, hasta salir de la pestaña
  // Todo cambio de pestaña pasa por aquí: al salir de «Por revisar», las revisadas en esta visita dejan la bandeja.
  function cambiarTab(t) { if (tab === 'revisar' && t !== 'revisar') REVISADAS = {}; tab = t; }
  function porRevisar(a) { return N.porRevisar(a, ME); }
  function cuantasPorRevisar() { return Object.keys(anots).filter(function (k) { return porRevisar(anots[k]); }).length; }
  // `todoElLibro`: sin la restricción de la pestaña «Sección» (para recorrer con . y , de una sección a otra).
  function lista(todoElLibro) {
    var L = Object.keys(anots).map(function (k) { return anots[k]; });
    if (tab === 'revisar') {
      L = L.filter(function (a) { return porRevisar(a) || REVISADAS[a.id]; });
      L.sort(function (x, y) { return ordenKey(x) < ordenKey(y) ? -1 : 1; });
      return L;
    }
    if (tab === 'capitulo' && !todoElLibro) {
      var s = SEC_BY_ID[secActual]; var pags = {}; if (s) s.bloques.forEach(function (b) { if (b.pagina) pags[b.pagina] = 1; });
      L = L.filter(function (a) { return a.sid === secActual || (a.tipo === 'pagina' && pags[a.pagina]); });
    }
    if (filtro === 'notas') L = L.filter(function (a) { return a.tipo !== 'subrayado'; });
    else if (filtro === 'abiertas') L = L.filter(function (a) { return a.estado !== 'resuelta'; });
    else if (filtro === 'respondidas') L = L.filter(function (a) { return !!(a.respuesta || a.cierre); });
    else if (filtro === 'preguntas') L = L.filter(function (a) { return a.cierre === 'pregunta'; });
    else if (filtro !== 'todas') L = L.filter(function (a) { return a.tipo === 'subrayado' && a.color === filtro; });
    if (filtroAutor) L = L.filter(function (a) { return (a.autor || '') === filtroAutor; });
    if (filtroEtiqueta) L = L.filter(function (a) { return etiquetasDe(a).indexOf(filtroEtiqueta) >= 0; });
    L.sort(function (x, y) { return ordenKey(x) < ordenKey(y) ? -1 : 1; });
    return L;
  }
  function listaNavegable() { return tab === 'revisar' ? lista() : lista(true); }
  function ordenKey(a) { var si = SECS.findIndex(function (s) { return s.id === a.sid; }); var bi = a.pid ? parseInt(a.pid.split('-b').pop(), 10) : -1; return (si < 0 ? 999 : si) * 100000 + (bi < 0 ? 0 : bi) * 10 + (a.inicio || 0) / 100000; }
  function renderPanel() {
    if (tab === 'buscar') return;
    // Si el autor está escribiendo una nota, el redibujo no debe quitarle el editor: se recuerda el
    // borrador, el foco y la selección, y se restauran sobre la ficha nueva.
    // Un botón se reconoce por su acción (y su color), no por su clase ni su texto, que cambian con el propio clic.
    var act = document.activeElement, foco = null, focoBoton = null;
    if (act && act.tagName === 'TEXTAREA' && act.id.indexOf('nota-') === 0) foco = { id: act.id, valor: act.value, ini: act.selectionStart, fin: act.selectionEnd, scroll: act.scrollTop };
    else if (act && act.tagName === 'BUTTON' && act.closest('.ficha')) focoBoton = { id: act.closest('.ficha').getAttribute('data-id'), accion: act.getAttribute('data-accion') || '', c: act.getAttribute('data-c') || '', texto: act.textContent };
    var box = $('#lista'), desplaz = box.scrollTop; box.innerHTML = '';
    renderSelectores(); marcarFiltro(); renderCuentaRevisar();
    var L = lista(), margen = margenActivo() && L.length > 0;
    box.classList.toggle('al-margen', margen); $('#panel').classList.toggle('margen', margen); if (!margen) soltarMargen();
    resolverPerfiles(L.map(function (a) { return a.autor; }).filter(Boolean));
    $('#n-panel').textContent = Object.keys(anots).length ? '(' + Object.keys(anots).length + ')' : '';
    if (tab === 'revisar') box.appendChild(cabezaBandeja(L));
    if (!L.length) {
      var filtrado = tab !== 'revisar' && (filtro !== 'todas' || !!filtroAutor || !!filtroEtiqueta);
      var vacio = el('div', { 'class': 'vacio', text: tab === 'revisar' ? 'No hay respuestas por revisar. Cuando quien edita las fuentes responda una anotación tuya, aparecerá aquí.' : filtrado ? 'Ninguna anotación con estos filtros. ' : tab === 'capitulo' ? 'Sin anotaciones en esta sección. Selecciona texto para subrayarlo; haz clic en un número de página para dejarle una nota.' : 'Aún no hay anotaciones.' });
      if (filtrado) { var qf = el('button', { 'class': 'enlace', type: 'button', text: 'Quitar filtros' }); qf.addEventListener('click', function () { quitarFiltros(); renderPanel(); var p = $('.ficha') || $('#filtros-det > summary'); if (p) p.focus({ preventScroll: true }); }); vacio.appendChild(qf); }
      box.appendChild(vacio); actualizarNav(); return;
    }
    var destino = box;
    if (margen) { destino = el('div', { 'class': 'capa-margen' }); box.appendChild(destino); }
    L.forEach(function (a) { destino.appendChild(ficha(a)); });
    ajustarTextareas(box);
    if (margen) colocarMargen(); else box.scrollTop = desplaz;
    if (foco) {
      var ta = document.getElementById(foco.id);
      if (ta) { if (ta.value !== foco.valor) { ta.value = foco.valor; ajustarAlto(ta); } ta.focus({ preventScroll: true }); try { ta.setSelectionRange(foco.ini, foco.fin); } catch (e) {} ta.scrollTop = foco.scroll; }
    } else if (focoBoton) {
      var fb = $('.ficha[data-id="' + focoBoton.id + '"]');
      var mismo = function (b) { return (b.getAttribute('data-accion') || '') === focoBoton.accion && (b.getAttribute('data-c') || '') === focoBoton.c; };
      var bt = fb ? $$('button', fb).filter(mismo)[0] || $$('button', fb).filter(function (b) { return b.textContent === focoBoton.texto; })[0] : null;
      if (bt) bt.focus({ preventScroll: true });
    }
    actualizarNav();
  }
  function cabezaBandeja(L) {
    var pend = L.filter(porRevisar).length, hechas = L.length - pend;
    var c = el('div', { 'class': 'bandeja-cab' }, [
      el('div', { text: pend ? pend + (pend === 1 ? ' respuesta por revisar' : ' respuestas por revisar') + (hechas ? ' · ' + hechas + (hechas === 1 ? ' revisada' : ' revisadas') + ' en esta visita' : '') : (hechas ? 'Revisaste todas las respuestas nuevas.' : '') })
    ]);
    if (pend && !SOLO_LECTURA) {
      c.appendChild(el('div', { 'class': 'bandeja-ayuda' }, [['A', 'atendida'], ['R', 'reabrir'], ['V', 'ver el cambio'], ['.', 'siguiente'], [',', 'anterior']].map(function (x) {
        return el('span', {}, [el('kbd', { text: x[0] }), ' ' + x[1]]);
      })));
      var ini = el('button', { 'class': 'btn peq primario', type: 'button', text: fichaFoco && L.some(function (a) { return a.id === fichaFoco; }) ? 'Siguiente ›' : 'Empezar la revisión ›' });
      ini.addEventListener('click', function () { navegar(1); });
      c.appendChild(ini);
    }
    return c;
  }
  function renderCuentaRevisar() {
    var n = cuantasPorRevisar();
    $('#n-revisar').textContent = n ? String(n) : '';
    // en el botón del teléfono el número va con su significado para quien usa lector de pantalla
    var bp = $('#n-panel-revisar'); bp.textContent = '';
    if (n) { bp.appendChild(el('span', { 'class': 'solo-lectores', text: ', ' })); bp.appendChild(document.createTextNode(String(n))); bp.appendChild(el('span', { 'class': 'solo-lectores', text: n === 1 ? ' respuesta por revisar' : ' respuestas por revisar' })); }
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
  var ALTO_REPOSO = 98;  // px de nota visibles en reposo (unas cinco líneas)
  function ajustarAlto(ta) {
    if (!ta || !ta.isConnected) return;
    ta.style.height = 'auto';
    fijarAlto(ta, ta.scrollHeight);
  }
  function fijarAlto(ta, h) {
    if (!h) { ta.style.height = ''; return; }  // el panel no se ve (concentración): se ajusta al mostrarse
    var activa = !!ta.closest('.ficha.foco') || document.activeElement === ta;
    var tope = activa ? Math.max(140, Math.round(window.innerHeight * 0.45)) : ALTO_REPOSO;
    ta.style.height = (Math.min(h, tope) + 2) + 'px';
    ta.classList.toggle('recortada', !activa && h > ALTO_REPOSO);
  }
  // Por lotes: primero todas las escrituras, luego todas las lecturas, luego todas las escrituras; así el navegador
  // calcula la maquetación una vez y no una por nota (con cientos de fichas, redibujar o cambiar el ancho no se traba).
  function ajustarTextareas(raiz) {
    var tas = $$('.ficha textarea', raiz || $('#lista'));
    tas.forEach(function (ta) { ta.style.height = 'auto'; });
    var hs = tas.map(function (ta) { return ta.scrollHeight; });
    tas.forEach(function (ta, i) { fijarAlto(ta, hs[i]); });
  }
  function activar(id) {
    if (fichaFoco === id) return;
    fichaFoco = id;
    $$('.ficha.foco').forEach(function (f) { f.classList.remove('foco'); ajustarTextareas(f); });
    $$('mark.hl.foco').forEach(function (m) { m.classList.remove('foco'); });
    var f = $('.ficha[data-id="' + id + '"]');
    if (f) { f.classList.add('foco'); ajustarTextareas(f); }
    $$('mark.hl[data-aids~="' + id + '"]').forEach(function (m) { m.classList.add('foco'); });
    if (margenActivo()) reacomodarPorActivar(id);
    actualizarNav();
  }
  function ficha(a) {
    // Las clausuras de la ficha leen la anotación viva, no la copia con que se dibujó: un guardado silencioso (nota,
    // réplica) sustituye el objeto en `anots` sin redibujar el panel, y copiar, cambiar el color o el estado después
    // deben llevar lo recién escrito.
    var actual = function () { return anots[a.id] || a; };
    var pendiente = porRevisar(a), cambio = cambioDe(a);
    var f = el('div', { 'class': 'ficha t-' + a.tipo + (a.color ? ' c-' + a.color : '') + (a.estado === 'resuelta' ? ' resuelta' : '') + (fichaFoco === a.id ? ' foco' : '') + (SIN_GUARDAR[a.id] ? ' sin-guardar' : '') + (pendiente ? ' por-revisar' : '') + (!pendiente && REVISADAS[a.id] ? ' revisada' : ''), 'data-id': a.id, tabindex: '-1', role: 'article', 'aria-label': (a.tipo === 'subrayado' && a.color ? a.color + ': ' : '') + etiqueta(a) + (pendiente ? ' · respuesta por revisar' : '') });
    var cab = el('div', { 'class': 'cab' }, [el('span', {}, [a.tipo === 'subrayado' && a.color ? el('span', { 'class': 'cat', text: a.color }) : null, etiqueta(a)])]);
    if (a.autor && (a.autor !== ME || variosAutores())) cab.firstChild.appendChild(chipAutor(a.autor));
    if (a.cierre) cab.firstChild.appendChild(el('span', { 'class': 'cierre ' + a.cierre, text: a.cierre === 'atendida' ? 'atendida' : a.cierre === 'descartada' ? 'descartada' : 'pregunta' }));
    if (pendiente) cab.firstChild.appendChild(el('span', { 'class': 'nueva', text: 'nueva respuesta' }));
    else if (REVISADAS[a.id]) cab.firstChild.appendChild(el('span', { 'class': 'nueva hecha', text: '✓ revisada' }));
    var u = UBIC[a.id];
    if ((a.pid && !(u && u.estado === 'perdido')) || cambio || (a.tipo === 'pagina' && a.pagina) || a.tipo === 'capitulo') {
      var ir = el('button', { 'class': 'enlace', type: 'button', text: 'ir al texto', 'data-accion': 'ir' });
      ir.addEventListener('click', function () { irAAnot(actual()); });
      cab.appendChild(ir);
    }
    f.appendChild(cab);
    if (SIN_GUARDAR[a.id]) {
      var ag = el('div', { 'class': 'aviso-guardar', text: 'Sin guardar en la base (' + SIN_GUARDAR[a.id] + '); se conserva en este navegador. ' });
      if (!SOLO_LECTURA) { var re = el('button', { 'class': 'enlace', type: 'button', text: 'Reintentar', 'data-accion': 'reintentar' }); re.addEventListener('click', function () { reintentar(a.id); }); ag.appendChild(re); }
      f.appendChild(ag);
    }
    if (u && u.estado === 'reubicado') f.appendChild(el('div', { 'class': 'aviso-ubic', text: 'Reubicado: el texto se movió desde que se hizo la anotación' + (u.pid !== a.pid ? ' (ahora en otro bloque)' : '') + '.' }));
    if (u && u.estado === 'perdido') f.appendChild(el('div', { 'class': 'aviso-ubic', text: cambio ? 'El pasaje se reescribió: la cita ya no está tal cual; «ver el cambio» muestra el antes y el después.' : 'No encontrado en esta versión del libro; la cita se conserva aquí.' }));
    var pe = pidEfectivo(a);
    if (a.tipo === 'subrayado' && a.bh && BLOQUES[pe] && BLOQUES[pe].h && BLOQUES[pe].h !== a.bh && !(u && u.estado === 'perdido')) f.appendChild(el('div', { 'class': 'aviso-cambio', text: 'El bloque cambió desde que anotaste' + (a.libro ? ' (fuentes del ' + a.libro + ')' : '') + '.' }));
    if (a.cierre === 'pregunta') f.classList.add('cierre-pregunta');
    if (a.tipo === 'subrayado') f.appendChild(el('div', { 'class': 'cita', text: a.cita.length > 220 ? a.cita.slice(0, 220) + '…' : a.cita }));
    if (SOLO_LECTURA) {
      f.appendChild(el('div', { 'class': 'nota-texto', text: a.nota || '' }));
      if (a.respuesta || a.cierre) { var rs = el('div', { 'class': 'respuesta' }); rs.appendChild(el('div', { 'class': 'quien', text: 'Respuesta' + (a.commit ? ' · ' + a.commit : '') })); rs.appendChild(document.createTextNode(a.respuesta || '')); f.appendChild(rs); }
      if (a.replica) f.appendChild(el('div', { 'class': 'nota-texto', text: a.replica }));
      var accSL = el('div', { 'class': 'acciones siempre' });
      var copSL = el('button', { 'class': 'btn peq copiar', type: 'button', text: 'Copiar', title: 'Copiar esta anotación como texto', 'data-accion': 'copiar' });
      copSL.addEventListener('click', function () { copiar(textoAnotacion(actual()), copSL); });
      accSL.appendChild(copSL); f.appendChild(accSL);
      return f;
    }
    // Esc o Ctrl/Cmd+Enter: guardar (al perder el foco) y volver al texto
    var salirConTecla = function (ev) {
      if (ev.key !== 'Escape' && !(ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) return;
      ev.preventDefault(); ev.stopPropagation(); ev.target.blur(); volverAlTexto(a.id);
    };
    var ta = el('textarea', { 'class': 'nota', placeholder: a.tipo === 'subrayado' ? 'Añadir una nota…' : 'Escribe la nota…', 'aria-label': 'Nota', id: 'nota-' + a.id, rows: '1' });
    ta.value = a.nota || '';
    var timer = null;
    var guardarNota = function () { if (anots[a.id] && ta.value !== anots[a.id].nota) { guardarSilencioso(a.id, { nota: ta.value }, ta.id); pintarEtiquetas(f, anots[a.id]); } };
    ta.addEventListener('input', function () { ajustarAlto(ta); colocarMargenPronto(); clearTimeout(timer); timer = setTimeout(guardarNota, 900); });
    ta.addEventListener('blur', function () { clearTimeout(timer); guardarNota(); ajustarAlto(ta); });
    ta.addEventListener('focus', function () { ajustarAlto(ta); });
    ta.addEventListener('keydown', salirConTecla);
    f.appendChild(ta);
    pintarEtiquetas(f, a);
    if (a.respuesta || a.cierre) {
      var r = el('div', { 'class': 'respuesta' });
      r.appendChild(el('div', { 'class': 'quien', text: 'Respuesta' + (a.commit ? ' · ' + a.commit : '') + (a.respondido ? ' · ' + a.respondido.slice(0, 10) : '') }));
      r.appendChild(document.createTextNode(a.respuesta || (a.cierre === 'atendida' ? 'Atendida.' : a.cierre === 'descartada' ? 'Descartada.' : '')));
      f.appendChild(r);
    }
    if (a.cierre === 'pregunta') {
      var rp = el('textarea', { 'class': 'replica', placeholder: 'Tu respuesta a la pregunta…', 'aria-label': 'Respuesta a la pregunta', id: 'nota-' + a.id + '-replica', rows: '1' });
      rp.value = a.replica || '';
      var tr = null;
      // contestar una pregunta por revisar es revisarla
      var guardarReplica = function () {
        var vivo = anots[a.id]; if (!vivo || rp.value === (vivo.replica || '')) return;
        var parche = { replica: rp.value };
        if (rp.value.trim() && porRevisar(vivo)) { parche.revisado = N.marcaRevision(vivo, ahora()); if (tab === 'revisar') REVISADAS[a.id] = 1; }
        guardarSilencioso(a.id, parche, rp.id);
        if (parche.revisado) renderCuentaRevisar();
      };
      rp.addEventListener('input', function () { ajustarAlto(rp); colocarMargenPronto(); clearTimeout(tr); tr = setTimeout(guardarReplica, 900); });
      rp.addEventListener('blur', function () { clearTimeout(tr); guardarReplica(); ajustarAlto(rp); });
      rp.addEventListener('focus', function () { ajustarAlto(rp); });
      rp.addEventListener('keydown', salirConTecla);
      f.appendChild(rp);
    }
    var acc = el('div', { 'class': 'acciones' });
    if (a.tipo === 'subrayado') {
      var cols = el('div', { 'class': 'colores' });
      ['revisar', 'cortar', 'duda', 'conservar'].forEach(function (c) {
        var b = el('button', { 'class': 'col-btn c-' + c + (a.color === c ? ' on' : ''), type: 'button', title: c, 'aria-label': 'Color: ' + c, 'aria-pressed': a.color === c ? 'true' : 'false', 'data-accion': 'color', 'data-c': c });
        // una copia con el cambio: `guardar` toma la versión previa del objeto todavía intacto
        b.addEventListener('click', function () { guardar(Object.assign({}, actual(), { color: c })); });
        cols.appendChild(b);
      });
      acc.appendChild(cols);
    }
    if (pendiente) {
      // por revisar: «Atendida» confirma lo hecho; «Reabrir» la devuelve con el cursor en la nota (o en la réplica)
      var at = el('button', { 'class': 'btn peq primario', type: 'button', text: '✓ Atendida', title: 'La respuesta te sirve: queda resuelta (A)', 'data-accion': 'atendida' });
      at.addEventListener('click', function () { revisar(a.id, 'atendida'); });
      var ra = el('button', { 'class': 'btn peq', type: 'button', text: 'Reabrir', title: 'No quedó bien: vuelve a abrirla y escribe por qué (R)', 'data-accion': 'reabrir' });
      ra.addEventListener('click', function () { revisar(a.id, 'reabrir'); });
      acc.appendChild(at); acc.appendChild(ra);
    } else {
      var res = el('button', { 'class': 'btn peq', type: 'button', text: a.estado === 'resuelta' ? 'Reabrir' : 'Resuelta', 'data-accion': 'estado' });
      res.addEventListener('click', function () { var ac = actual(); guardar(Object.assign({}, ac, { estado: ac.estado === 'resuelta' ? 'abierta' : 'resuelta' })); });
      acc.appendChild(res);
    }
    if (cambio) {
      var vc = el('button', { 'class': 'btn peq', type: 'button', text: 'Ver el cambio', title: 'Ir al pasaje y mostrar el antes y el después (V)', 'data-accion': 'cambio' });
      vc.addEventListener('click', function () { verCambio(a.id); });
      acc.appendChild(vc);
    }
    var cop = el('button', { 'class': 'btn peq copiar', type: 'button', text: 'Copiar', title: 'Copiar esta anotación como texto para pegarla en el chat', 'data-accion': 'copiar' });
    cop.addEventListener('click', function () { copiar(textoAnotacion(actual()), cop); });
    acc.appendChild(cop);
    var del = el('button', { 'class': 'btn peq', type: 'button', text: 'Borrar', 'data-accion': 'borrar' });
    del.addEventListener('click', function () {
      // el confirmador recibe el foco (que estaba en el botón que se retira) y «No» lo devuelve a «Borrar»
      var si = el('button', { 'class': 'btn peq', type: 'button', text: 'Sí', 'data-accion': 'si', onclick: function () {
        // el foco pasa a la ficha vecina (o a la pestaña activa), no al cuerpo del documento
        var vecina = f.nextElementSibling || f.previousElementSibling, idVecina = vecina && vecina.getAttribute('data-id');
        borrar(a.id);
        var destino = (idVecina && $('.ficha[data-id="' + idVecina + '"]')) || $('.tab.activa');
        if (destino) destino.focus({ preventScroll: true });
      } });
      var no = el('button', { 'class': 'btn peq', type: 'button', text: 'No', 'data-accion': 'no', onclick: function () { acc.replaceChild(del, c); del.focus({ preventScroll: true }); } });
      var c = el('span', { 'class': 'confirmar' }, [el('span', { text: '¿Borrar?' }), si, no]);
      acc.replaceChild(c, del); si.focus({ preventScroll: true });
    });
    acc.appendChild(del);
    f.appendChild(acc);
    // tocar la ficha (fuera de sus controles) la activa; llegar a ella con el teclado, también
    f.addEventListener('click', function (ev) {
      if (ev.target.closest('button, a, textarea, input, select, label, summary')) return;
      activar(a.id);
      if (!f.contains(document.activeElement)) f.focus({ preventScroll: true });
    });
    f.addEventListener('focusin', function () { activar(a.id); });
    return f;
  }
  function guardarSilencioso(id, parche) {
    // Ediciones de nota y réplica. Lo escrito es trabajo del lector y no se tira: si la base rechaza, el borrador
    // sigue en el cuadro y en memoria marcado «sin guardar», con copia en el navegador y reintento desde la ficha
    // (`rechazoEscritura` sin versión previa); un rechazo de permiso pasa además la página a sólo lectura. Al
    // recargar, una copia local más reciente que la de la base vuelve a cargarse y a subir (`cargarLocal`).
    var ant = anots[id]; if (!ant || SOLO_LECTURA) return;
    var a = Object.assign({}, ant, parche); a.editado = ahora(); marcarCampos(id, ant, a); anots[id] = a;
    if (col) escribirEnBase(id, null);
    else guardarLocal(modo === 'cargando' ? [id] : undefined);
  }

  // ------------------------------------------------------------ revisar respuestas y recorrer anotaciones
  // El bloque donde cambió el pasaje de una anotación: el suyo, si cambió desde que se anotó y la reconstrucción guarda
  // su texto anterior; si la cita ya no está (el pasaje se reescribió), el bloque cuyo texto anterior la contenía, en su
  // sección o, si no, en el libro.
  function cambioDe(a) {
    if (!a || a.tipo !== 'subrayado' || !a.cita) return null;
    var u = UBIC[a.id], pe = pidEfectivo(a), b = pe && BLOQUES[pe];
    if (u && u.estado !== 'perdido') return b && b.anterior && (!a.bh || b.h !== a.bh) ? pe : null;
    // de los bloques cuyo texto anterior contenía la cita: el suyo, si es uno; si no, el que la tenía con su contexto
    var elegir = function (bloques) {
      var mejor = null, puntos = -1;
      bloques.forEach(function (x) {
        if (!x.anterior) return;
        var m = N.buscarCita(x.anterior, a); if (!m) return;
        var p = m.puntos + (x.id === a.pid ? 3 : 0);
        if (p > puntos) { mejor = x; puntos = p; }
      });
      return mejor;
    };
    var x = SEC_BY_ID[a.sid] ? elegir(SEC_BY_ID[a.sid].bloques) : null;
    for (var i = 0; !x && i < SECS.length; i++) x = elegir(SECS[i].bloques);
    return x ? x.id : null;
  }
  function verCambio(id) {
    var a = anots[id], pid = cambioDe(a); if (!pid) return;
    irA(BLOQUE_SEC[pid], pid);
    alternarDiff(pid, true);
    activar(id);
  }
  // Atendida: queda resuelta y revisada, y se pasa a la siguiente por revisar. Reabrir: vuelve a abrirse, revisada, con
  // el cursor en la réplica (si era una pregunta) o en la nota, para escribir qué falta.
  function revisar(id, accion) {
    var a = anots[id]; if (!a || SOLO_LECTURA) return;
    var enBandeja = tab === 'revisar';
    if (enBandeja) REVISADAS[id] = 1;
    if (accion === 'atendida') {
      // en la bandeja se pasa a la siguiente por revisar, en el orden del libro y en cualquier sección; fuera de ella
      // (en «Sección» o «Todas») se queda en la ficha
      var pend = Object.keys(anots).map(function (k) { return anots[k]; }).filter(function (x) { return porRevisar(x) && x.id !== id; })
        .sort(function (x, y) { return ordenKey(x) < ordenKey(y) ? -1 : 1; });
      var sig = pend.filter(function (x) { return ordenKey(x) > ordenKey(a); })[0] || pend[0];
      guardar(Object.assign({}, a, { estado: 'resuelta', revisado: N.marcaRevision(a, ahora()) }));
      if (enBandeja && sig) { irARevisar(sig); return; }
      anunciar(pend.length ? 'Atendida' : 'Atendida. No quedan respuestas por revisar');
      var destino = enBandeja ? $('.bandeja-cab') : $('.ficha[data-id="' + id + '"]');
      if (destino) { destino.setAttribute('tabindex', '-1'); destino.focus({ preventScroll: true }); }
      return;
    }
    guardar(Object.assign({}, a, { estado: 'abierta', revisado: N.marcaRevision(a, ahora()) }));
    var f = $('.ficha[data-id="' + id + '"]'), ta = f && ($('textarea.replica', f) || $('textarea.nota', f));
    if (ta) { ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {} }
  }
  function irARevisar(a) {
    irAAnot(a, mqMovil.matches);
    var c = cambioDe(a); if (c) alternarDiff(c, true);
  }
  // . y , (o los botones ‹ ›): la anotación siguiente o anterior en el orden del libro, con los filtros puestos (en «Por
  // revisar», las de la bandeja), cambiando de sección cuando hace falta.
  function navegar(d) {
    var L = listaNavegable();
    if (!L.length) { anunciar('No hay anotaciones que recorrer'); return; }
    var j = N.vecina(L, fichaFoco, d, { de: ordenKey, clave: anots[fichaFoco] ? ordenKey(anots[fichaFoco]) : null });
    if (j < 0) { anunciar(d > 0 ? 'Es la última anotación' : 'Es la primera anotación'); return; }
    if (tab === 'revisar') irARevisar(L[j]); else irAAnot(L[j], mqMovil.matches);
  }
  function actualizarNav() {
    var L = listaNavegable(), i = -1;
    for (var k = 0; k < L.length; k++) if (L[k].id === fichaFoco) { i = k; break; }
    $('#anot-pos').textContent = !L.length ? '' : i >= 0 ? (i + 1) + ' de ' + L.length : L.length + (L.length === 1 ? ' anotación' : ' anotaciones');
    $('#anot-ant').setAttribute('aria-disabled', L.length && i !== 0 ? 'false' : 'true');
    $('#anot-sig').setAttribute('aria-disabled', L.length && i !== L.length - 1 ? 'false' : 'true');
  }
  // `mostrar`: en pantalla estrecha, dejar el panel abierto con la ficha (desde un resultado de búsqueda o al recorrer).
  function irAAnot(a, mostrar) {
    var pid = pidEfectivo(a), cambio = cambioDe(a);
    if (pid) { irA(BLOQUE_SEC[pid] || a.sid, pid); }
    else if (cambio) irA(BLOQUE_SEC[cambio], cambio);
    else if (a.pid) { if (a.sid) irA(a.sid); }
    else if (a.tipo === 'pagina') { var n = $('[data-pg="' + a.pagina + '"][data-pid]'); if (n) irA(BLOQUE_SEC[n.getAttribute('data-pid')], n.getAttribute('data-pid')); }
    else if (a.sid) irA(a.sid);
    if (mqMovil.matches && !mostrar) lateral('panel', false);
    enfocar(a.id, false, !!mostrar);
  }
  // Enfoca la ficha de una anotación (y su pasaje). `editar` lleva el cursor a la nota; `mostrar` abre el panel en
  // pantalla estrecha aunque no se vaya a escribir (al tocar un subrayado).
  function enfocar(id, editar, mostrar) {
    var previo = fichaFoco && fichaFoco !== id && anots[fichaFoco] ? pidEfectivo(anots[fichaFoco]) : null;
    fichaFoco = id;
    var a = anots[id]; if (!a) return;
    if (previo) pintarPid(previo);
    if (tab === 'buscar') cambiarTab('todas');
    if (tab === 'capitulo' && a.sid !== secActual && !(a.tipo === 'pagina')) cambiarTab('todas');
    // fuera de la lista: si es por la sección (una nota de página sin su página en el texto), a «Todas» con los mismos
    // filtros; si es por un filtro o por la bandeja, a «Todas» sin filtros
    if (lista().indexOf(a) < 0) {
      if (tab === 'revisar' || (tab === 'capitulo' && lista(true).indexOf(a) >= 0)) cambiarTab('todas');
      if (lista().indexOf(a) < 0) quitarFiltros();
    }
    marcarTab();
    renderPanel(); var pe = pidEfectivo(a); if (pe) pintarPid(pe);
    // en concentración el panel no se ve: para escribir o mostrar la ficha se sale de ella
    if ((editar || mostrar) && $('#app').classList.contains('foco')) alternarFoco();
    if (mqMovil.matches && (editar || mostrar)) {
      // en pantalla estrecha el panel sube desde abajo y el pasaje queda a la vista encima
      var mk = $('mark.hl[data-aids~="' + id + '"]');
      lateral('panel', true, mk);
      if (mk) mk.scrollIntoView({ block: 'start' });
    }
    var f = $('.ficha[data-id="' + id + '"]');
    if (f) {
      // al margen, la ficha sigue a su pasaje: lo que se desplaza es el texto, no la lista
      if (margenActivo()) asegurarVisibleMargen(id); else f.scrollIntoView({ block: 'nearest' });
      // Si la activación vino de una marca del texto o de un resultado de búsqueda, el elemento pulsado ya no existe
      // (se redibujó): el foco del teclado sigue en la ficha, no cae al cuerpo del documento. Con el panel cerrado
      // (pantalla estrecha) la ficha es inerte y el foco va al pasaje.
      if (enfocable(f)) {
        if (editar) { var ta = $('textarea', f); if (ta) ta.focus({ preventScroll: true }); }
        if (!f.contains(document.activeElement)) f.focus({ preventScroll: true });
      } else {
        var m = $('mark.hl[data-aids~="' + id + '"]');
        if (enfocable(m)) m.focus({ preventScroll: true });
      }
    }
    actualizarNav();
  }
  function renderCuentas() {
    var por = {}; Object.keys(anots).forEach(function (k) { var a = anots[k]; if (a.sid) por[a.sid] = (por[a.sid] || 0) + 1; });
    $$('nav a.sec').forEach(function (a) { var sid = a.getAttribute('data-sid'); var c = a.querySelector('.cuenta'); if (por[sid]) { if (!c) { c = el('span', { 'class': 'cuenta' }); a.appendChild(c); } c.textContent = por[sid]; } else if (c) c.remove(); });
    $('#n-panel').textContent = Object.keys(anots).length ? '(' + Object.keys(anots).length + ')' : '';
    renderCuentaRevisar();
  }
