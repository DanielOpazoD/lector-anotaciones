  // ------------------------------------------------------------ panel
  function lista() {
    var L = Object.keys(anots).map(function (k) { return anots[k]; });
    if (tab === 'capitulo') {
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
    renderSelectores(); marcarFiltro();
    var L = lista();
    resolverPerfiles(L.map(function (a) { return a.autor; }).filter(Boolean));
    $('#n-panel').textContent = Object.keys(anots).length ? '(' + Object.keys(anots).length + ')' : '';
    if (!L.length) {
      var filtrado = filtro !== 'todas' || !!filtroAutor || !!filtroEtiqueta;
      var vacio = el('div', { 'class': 'vacio', text: filtrado ? 'Ninguna anotación con estos filtros. ' : tab === 'capitulo' ? 'Sin anotaciones en esta sección. Selecciona texto para subrayarlo; haz clic en un número de página para dejarle una nota.' : 'Aún no hay anotaciones.' });
      if (filtrado) { var qf = el('button', { 'class': 'enlace', type: 'button', text: 'Quitar filtros' }); qf.addEventListener('click', function () { quitarFiltros(); renderPanel(); var p = $('.ficha') || $('#filtros-det > summary'); if (p) p.focus({ preventScroll: true }); }); vacio.appendChild(qf); }
      box.appendChild(vacio); return;
    }
    L.forEach(function (a) { box.appendChild(ficha(a)); });
    box.scrollTop = desplaz;
    if (foco) {
      var ta = document.getElementById(foco.id);
      if (ta) { if (ta.value !== foco.valor) ta.value = foco.valor; ta.focus({ preventScroll: true }); try { ta.setSelectionRange(foco.ini, foco.fin); } catch (e) {} ta.scrollTop = foco.scroll; }
    } else if (focoBoton) {
      var fb = $('.ficha[data-id="' + focoBoton.id + '"]');
      var mismo = function (b) { return (b.getAttribute('data-accion') || '') === focoBoton.accion && (b.getAttribute('data-c') || '') === focoBoton.c; };
      var bt = fb ? $$('button', fb).filter(mismo)[0] || $$('button', fb).filter(function (b) { return b.textContent === focoBoton.texto; })[0] : null;
      if (bt) bt.focus({ preventScroll: true });
    }
  }
  function etiqueta(a) {
    if (a.tipo === 'subrayado') return (a.sidTitulo || '').replace(/\..*$/, '') + (a.pagina ? ' · p. ' + a.pagina : '');
    if (a.tipo === 'pagina') return 'Nota de la página ' + a.pagina;
    if (a.tipo === 'capitulo') return 'Nota de la sección: ' + (a.sidTitulo || '');
    return 'Nota general';
  }
  function ficha(a) {
    // Las clausuras de la ficha leen la anotación viva, no la copia con que se dibujó: un guardado silencioso (nota,
    // réplica) sustituye el objeto en `anots` sin redibujar el panel, y copiar, cambiar el color o el estado después
    // deben llevar lo recién escrito.
    var actual = function () { return anots[a.id] || a; };
    var f = el('div', { 'class': 'ficha t-' + a.tipo + (a.color ? ' c-' + a.color : '') + (a.estado === 'resuelta' ? ' resuelta' : '') + (fichaFoco === a.id ? ' foco' : '') + (SIN_GUARDAR[a.id] ? ' sin-guardar' : ''), 'data-id': a.id, tabindex: '-1' });
    var cab = el('div', { 'class': 'cab' }, [el('span', {}, [a.tipo === 'subrayado' && a.color ? el('span', { 'class': 'cat', text: a.color }) : null, etiqueta(a)])]);
    if (a.autor && (a.autor !== ME || variosAutores())) cab.firstChild.appendChild(chipAutor(a.autor));
    if (a.cierre) cab.firstChild.appendChild(el('span', { 'class': 'cierre ' + a.cierre, text: a.cierre === 'atendida' ? 'atendida' : a.cierre === 'descartada' ? 'descartada' : 'pregunta' }));
    var u = UBIC[a.id];
    if ((a.pid && !(u && u.estado === 'perdido')) || (a.tipo === 'pagina' && a.pagina) || a.tipo === 'capitulo') {
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
    if (u && u.estado === 'perdido') f.appendChild(el('div', { 'class': 'aviso-ubic', text: 'No encontrado en esta versión del libro; la cita se conserva aquí.' }));
    var pe = pidEfectivo(a);
    if (a.tipo === 'subrayado' && a.bh && BLOQUES[pe] && BLOQUES[pe].h && BLOQUES[pe].h !== a.bh && !(u && u.estado === 'perdido')) f.appendChild(el('div', { 'class': 'aviso-cambio', text: 'El bloque cambió desde que anotaste' + (a.libro ? ' (fuentes del ' + a.libro + ')' : '') + '.' }));
    if (a.cierre === 'pregunta') f.classList.add('cierre-pregunta');
    if (a.tipo === 'subrayado') f.appendChild(el('div', { 'class': 'cita', text: a.cita.length > 220 ? a.cita.slice(0, 220) + '…' : a.cita }));
    if (SOLO_LECTURA) {
      f.appendChild(el('div', { 'class': 'nota-texto', text: a.nota || '' }));
      if (a.respuesta || a.cierre) { var rs = el('div', { 'class': 'respuesta' }); rs.appendChild(el('div', { 'class': 'quien', text: 'Respuesta' + (a.commit ? ' · ' + a.commit : '') })); rs.appendChild(document.createTextNode(a.respuesta || '')); f.appendChild(rs); }
      if (a.replica) f.appendChild(el('div', { 'class': 'nota-texto', text: a.replica }));
      var accSL = el('div', { 'class': 'acciones' });
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
    var ta = el('textarea', { placeholder: a.tipo === 'subrayado' ? 'Nota sobre este subrayado…' : 'Escribe la nota…', 'aria-label': 'Nota', id: 'nota-' + a.id });
    ta.value = a.nota || '';
    var timer = null;
    var guardarNota = function () { if (anots[a.id] && ta.value !== anots[a.id].nota) { guardarSilencioso(a.id, { nota: ta.value }, ta.id); pintarEtiquetas(f, anots[a.id]); } };
    ta.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(guardarNota, 900); });
    ta.addEventListener('blur', function () { clearTimeout(timer); guardarNota(); });
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
      var rp = el('textarea', { 'class': 'replica', placeholder: 'Tu respuesta a la pregunta…', 'aria-label': 'Respuesta a la pregunta', id: 'nota-' + a.id + '-replica' });
      rp.value = a.replica || '';
      var tr = null;
      var guardarReplica = function () { if (anots[a.id] && rp.value !== (anots[a.id].replica || '')) guardarSilencioso(a.id, { replica: rp.value }, rp.id); };
      rp.addEventListener('input', function () { clearTimeout(tr); tr = setTimeout(guardarReplica, 900); });
      rp.addEventListener('blur', function () { clearTimeout(tr); guardarReplica(); });
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
    var res = el('button', { 'class': 'btn peq', type: 'button', text: a.estado === 'resuelta' ? 'Reabrir' : 'Resuelta', 'data-accion': 'estado' });
    res.addEventListener('click', function () { var ac = actual(); guardar(Object.assign({}, ac, { estado: ac.estado === 'resuelta' ? 'abierta' : 'resuelta' })); });
    acc.appendChild(res);
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
  // `mostrar`: en pantalla estrecha, dejar el panel abierto con la ficha (desde un resultado de búsqueda).
  function irAAnot(a, mostrar) {
    var pid = pidEfectivo(a);
    if (pid) { irA(BLOQUE_SEC[pid] || a.sid, pid); }
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
    if (tab === 'buscar') tab = 'todas';
    if (tab === 'capitulo' && a.sid !== secActual && !(a.tipo === 'pagina')) tab = 'todas';
    if (lista().indexOf(a) < 0) quitarFiltros();
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
      f.scrollIntoView({ block: 'nearest' });
      // Si la activación vino de una marca del texto o de un resultado de búsqueda, el elemento pulsado ya no existe
      // (se redibujó): el foco del teclado sigue en la ficha, no cae al cuerpo del documento. Con el panel cerrado
      // (pantalla estrecha) la ficha es inerte y el foco va al pasaje.
      if (enfocable(f)) {
        if (editar) { var ta = $('textarea', f); if (ta) ta.focus(); }
        if (!f.contains(document.activeElement)) f.focus({ preventScroll: true });
      } else {
        var m = $('mark.hl[data-aids~="' + id + '"]');
        if (enfocable(m)) m.focus({ preventScroll: true });
      }
    }
  }
  function renderCuentas() {
    var por = {}; Object.keys(anots).forEach(function (k) { var a = anots[k]; if (a.sid) por[a.sid] = (por[a.sid] || 0) + 1; });
    $$('nav a.sec').forEach(function (a) { var sid = a.getAttribute('data-sid'); var c = a.querySelector('.cuenta'); if (por[sid]) { if (!c) { c = el('span', { 'class': 'cuenta' }); a.appendChild(c); } c.textContent = por[sid]; } else if (c) c.remove(); });
    $('#n-panel').textContent = Object.keys(anots).length ? '(' + Object.keys(anots).length + ')' : '';
  }

