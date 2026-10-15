  // ------------------------------------------------------------ anotaciones: persistencia
  function guardar(a) {
    if (SOLO_LECTURA) { estado('Sólo lectura: en este libro puedes leer y copiar, no anotar', true); return; }
    // `previa` es lo que la base tiene, para volver a ello si rechaza: se toma antes de tocar la memoria, y los
    // manejadores de la ficha pasan una copia con el cambio, nunca el objeto de `anots` ya mutado. Una anotación
    // que la base todavía no tiene (nueva, o rechazada y conservada) no tiene versión previa a la que volver.
    var nueva = !anots[a.id] || !!SIN_GUARDAR[a.id], previa = nueva ? null : JSON.parse(JSON.stringify(anots[a.id]));
    if (anots[a.id]) marcarCampos(a.id, anots[a.id], a);
    a.editado = ahora();
    anots[a.id] = a;
    var u = ubicar(a); if (u) UBIC[a.id] = u;
    pintar(a); renderPanel(); renderCuentas();
    if (col) {
      escribirEnBase(a.id, previa);
    } else if (modo === 'cargando') {
      // La base todavía conecta: la anotación se funde en la copia local sin pisar lo que quedó ahí de otras sesiones.
      if (pendientesBase.indexOf(a.id) < 0) pendientesBase.push(a.id);
      guardarLocal([a.id]);
    } else {
      guardarLocal();
    }
  }
  // Códigos de rechazo de la base (db.d.ts). Los transitorios se reintentan una vez; uno desconocido se trata como
  // `unavailable`, como manda el contrato. Los de permiso son definitivos para la visita: pasan a sólo lectura.
  var TRANSITORIOS = { unavailable: 1, resource_exhausted: 1 };
  var CONOCIDOS = { invalid_argument: 1, resource_exhausted: 1, quota_exceeded: 1, unavailable: 1, revoked: 1, not_granted: 1, capability_disabled: 1, capability_removed: 1, transform_error: 1 };
  function esTransitorio(e) { var c = e && e.code; return !c || !!TRANSITORIOS[c] || !CONOCIDOS[c]; }
  function esDePermiso(codigo, id, previa, verbo) {
    return codigo === 'not_granted' || codigo === 'revoked' || (codigo === 'invalid_argument' && verbo !== 'respaldo' && JSON.stringify(previa || anots[id] || {}).length < 200000);
  }
  function escribirEnBase(id, previa, alRechazar, reintento) {
    // Escribe lo que hay en memoria para esa id. Un rechazo transitorio se reintenta una sola vez tras un retardo corto
    // y aleatorio; el segundo rechazo (o uno definitivo) lo decide `rechazoEscritura`. Si entre tanto la anotación se
    // borró o la página pasó a sólo lectura, no hay nada que escribir.
    var a = anots[id]; if (!a) return;
    var rechazo = function (e) { rechazoEscritura(e, id, previa, 'guardar'); if (alRechazar) alRechazar(e); };
    col.doc(id).set(a).then(function () {
      limpiarCampos(id, a);
      // la copia local se suelta sólo si nada se editó después de esta escritura
      if (SIN_GUARDAR[id]) { delete SIN_GUARDAR[id]; if (anots[id] === a) podarLocal([id]); renderPanel(); }
      estado('Guardado ' + new Date().toLocaleTimeString()); respaldar();
    }).catch(function (e) {
      if (reintento || !esTransitorio(e)) { rechazo(e); return; }
      setTimeout(function () { if (SOLO_LECTURA) rechazo(e); else escribirEnBase(id, previa, alRechazar, true); }, 100 + Math.random() * 300);
    });
  }
  function reintentar(id) { if (col && anots[id] && !SOLO_LECTURA) { estado('Reintentando…'); escribirEnBase(id, null); } }
  function quitarDeMemoria(id) {
    var a = anots[id], u = UBIC[id]; delete anots[id]; delete UBIC[id]; delete SIN_GUARDAR[id];
    if (u && u.pid) pintarPid(u.pid); else if (a && a.pid) pintarPid(a.pid);
    marcasPagina();
  }
  function conservarSinGuardar(id, codigo) {
    // La base no la tiene: sigue en memoria marcada «sin guardar», con copia en el navegador y en la cola de
    // pendientes, y la ficha ofrece reintentar (o sólo copiar, en sólo lectura). Nada que la página mostró se pierde.
    SIN_GUARDAR[id] = codigo;
    if (pendientesBase.indexOf(id) < 0) pendientesBase.push(id);
    guardarLocal([id]);
  }
  function rechazoEscritura(e, id, previa, verbo) {
    // La base no aceptó la escritura: la memoria vuelve a lo que la base tiene, para que no queden anotaciones
    // fantasma que se pintan, se cuentan y se exportan. Una anotación que la base no tiene (nueva, o un «Deshacer
    // borrado» cuando el borrado ya se confirmó) nunca se retira: se conserva marcada «sin guardar», con copia en
    // el navegador, también ante un rechazo de permiso, que además pasa la página a sólo lectura; ahí la ficha ya
    // no ofrece reintentar, pero sí copiarla.
    var codigo = (e && e.code) || 'error', permiso = esDePermiso(codigo, id, previa, verbo), conservada = false;
    if (verbo === 'borrar') {
      if (previa) { anots[id] = previa; var ub = ubicar(previa); if (ub) UBIC[id] = ub; pintar(previa); }
      // el borrado no ocurrió: no hay nada que deshacer (salvo que el enlace ya sea de otro borrado posterior)
      if (ultimoBorrado && ultimoBorrado.id === id) { ultimoBorrado = null; var z = $('#deshacer-zona'); if (z) z.innerHTML = ''; }
    }
    else if (previa) { anots[id] = previa; var u2 = ubicar(previa); if (u2) UBIC[id] = u2; pintar(previa); limpiarCampos(id, previa); }
    else { conservarSinGuardar(id, codigo); conservada = true; }
    renderPanel(); renderCuentas();
    if (permiso) activarSoloLectura();
    if (conservada && permiso) estado('No se pudo guardar en la base (' + codigo + '): sin permiso para escribir; la anotación sigue aquí y en este navegador, copia tus anotaciones con el botón', true);
    else if (conservada) estado('No se pudo guardar en la base (' + codigo + '); la anotación sigue aquí y en este navegador: reintenta desde la ficha o copia tus anotaciones con el botón', true);
    else estado('No se pudo ' + verbo + ' (' + codigo + '); copia tus anotaciones con el botón', true);
  }
  function activarSoloLectura() {
    if (SOLO_LECTURA) return;
    SOLO_LECTURA = true; document.body.classList.add('solo-lectura'); ocultarTb();
    // El modo se señala en sitios que el eco de la base no pisa: el chip de la cabecera, el nombre de la barra de
    // selección (que sólo ofrece copiar), la ayuda sin los atajos de anotar, y los números de página sin acción.
    $('#sl-chip').hidden = false;
    $('#sel-tb').setAttribute('aria-label', 'Copiar la selección');
    $$('.pg').forEach(function (p) { p.disabled = true; p.title = 'Página ' + p.getAttribute('data-pg'); });
    renderPanel();
    estado('Sólo lectura: en este libro puedes leer y copiar, no anotar', true);
  }
  function borrar(id) {
    if (SOLO_LECTURA) return;
    var a = anots[id], marca = SIN_GUARDAR[id]; if (!a) return;
    var camposPrevios = CAMPOS_BORRADOR[id] ? Object.assign({}, CAMPOS_BORRADOR[id]) : null;
    quitarDeMemoria(id);
    renderPanel(); renderCuentas();
    // Un borrado confirmado sale también de la copia local, para que una pendiente que no subió no vuelva al recargar;
    // pero sólo cuando la base lo confirma (o no tenía nada que borrar): si lo rechaza, la anotación vuelve a la memoria
    // (con su marca de «sin guardar», si la tenía) y la copia local, si la tenía, la sigue teniendo.
    if (col) {
      col.doc(id).delete().then(function () { podarLocal([id]); limpiarCampos(id); respaldar(); })
        .catch(function (e) { if (e && e.code === 'not_found') { podarLocal([id]); limpiarCampos(id); return; } if (marca) SIN_GUARDAR[id] = marca; rechazoEscritura(e, id, a, 'borrar'); });
    }
    else if (modo === 'cargando') { var i = pendientesBase.indexOf(id); if (i >= 0) pendientesBase.splice(i, 1); podarLocal([id]); limpiarCampos(id); }
    else { guardarLocal(); limpiarCampos(id); }
    ofrecerDeshacer(a, camposPrevios);
  }
  var CAMPOS_LECTOR = ['nota', 'replica', 'color', 'estado'];  // lo que el lector edita en la página; el resto lo escribe quien edita las fuentes
  var CAMPOS_BORRADOR = {};  // id -> campos que el lector cambió en esta sesión y la base todavía no tiene (se guarda junto a la copia local)
  function marcarCampos(id, antes, despues) {
    var c = CAMPOS_BORRADOR[id] || (CAMPOS_BORRADOR[id] = {});
    CAMPOS_LECTOR.forEach(function (k) { if (antes[k] !== despues[k]) c[k] = true; });
  }
  function escribirCampos(ids) {
    // Actualiza en la lista guardada sólo esas anotaciones; las demás entradas (borradores de otra sesión aún no
    // cargados, o de otra cuenta) se conservan tal como estaban.
    var guardados = lsJSON(LOCAL_KEY + ':campos');
    ids.forEach(function (id) { var c = CAMPOS_BORRADOR[id]; if (c && Object.keys(c).length) guardados[id] = c; else delete guardados[id]; });
    if (Object.keys(guardados).length) lsSet(LOCAL_KEY + ':campos', JSON.stringify(guardados));
    else try { localStorage.removeItem(LOCAL_KEY + ':campos'); } catch (e) {}
  }
  function fundirBorrador(deBase, borrador, campos) {
    // Un borrador que no subió aporta sólo los campos que el lector cambió (si no se sabe cuáles, los que edita en
    // la página y difieren); respuesta, cierre y demás los manda la base, para que recuperar el borrador no borre lo
    // que otra sesión escribió entre tanto.
    var r = Object.assign({}, deBase), lista = campos && Object.keys(campos).length ? Object.keys(campos) : ['nota', 'replica'];
    lista.forEach(function (c) { if (borrador[c] !== undefined && borrador[c] !== deBase[c]) r[c] = borrador[c]; });
    r.editado = borrador.editado || r.editado;
    return r;
  }
  function leerLocal() { try { return JSON.parse(lsGet(LOCAL_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function escribirLocal(datos) {
    if (Object.keys(datos).length) return lsSet(LOCAL_KEY, JSON.stringify(datos));
    try { localStorage.removeItem(LOCAL_KEY); } catch (e) {}
    return true;
  }
  function guardarLocal(ids) {
    // Sin lista escribe toda la memoria (modo local, donde la copia es la única verdad). Con lista, funde esas
    // anotaciones en la copia que ya hay sin tocar lo demás: lo pendiente de otra sesión o de otra cuenta.
    var datos = anots;
    if (ids) { datos = leerLocal(); ids.forEach(function (id) { if (anots[id]) datos[id] = anots[id]; }); }
    escribirCampos(ids || Object.keys(anots));  // la lista de campos cambiados viaja siempre con la copia local
    if (escribirLocal(datos)) estado('Guardado sólo en este navegador', true);
    else estado('No se pudo guardar en este navegador (almacenamiento lleno o bloqueado): copia tus anotaciones con el botón antes de cerrar', true);
  }
  function podarLocal(ids) {
    // Retira de la copia local lo que ya no la necesita: subió a la base, la base ya lo tenía, o se borró.
    if (!ids.length) return;
    var datos = leerLocal(), habia = false;
    ids.forEach(function (id) { if (datos[id]) { delete datos[id]; habia = true; } });
    if (habia) escribirLocal(datos);
  }
  function limpiarCampos(id, enBase) {
    // Quita las marcas de los campos que la base ya tiene con el valor de la memoria (`enBase`: lo que se escribió,
    // o la versión de la base a la que se volvió); sin `enBase`, todas (la anotación se borró). Lo que se siguió
    // editando después conserva su marca.
    var c = CAMPOS_BORRADOR[id];
    if (c) {
      Object.keys(c).forEach(function (k) { if (!enBase || !anots[id] || anots[id][k] === enBase[k]) delete c[k]; });
      if (!Object.keys(c).length) delete CAMPOS_BORRADOR[id];
    }
    escribirCampos([id]);
  }
  function cargarLocal(filtro) {
    // Pasa a memoria lo guardado en el navegador. `filtro(id, anotación)` puede dejar algo fuera: se queda en la copia
    // local sin cargarse. Devuelve las ids cargadas (`nuevas`) y las que ya estaban en memoria (`existentes`).
    try {
      var j = leerLocal(), campos = lsJSON(LOCAL_KEY + ':campos');
      // Migración: anotaciones guardadas por versiones anteriores de la página bajo otra clave
      // (libro.json las declara en `claves_anteriores`). Se copian sin pisar las ya guardadas y la
      // clave vieja se retira para que un borrado posterior no las resucite.
      var anteriores = (LIBRO && LIBRO.claves_anteriores) || [], migradas = 0;
      anteriores.forEach(function (k) {
        if (k === LOCAL_KEY) return;
        try { var v = JSON.parse(lsGet(k) || '{}'); Object.keys(v).forEach(function (id) { if (!j[id]) { j[id] = v[id]; migradas++; } }); } catch (e) {}
      });
      var guardadas = true;
      if (migradas) {
        guardadas = lsSet(LOCAL_KEY, JSON.stringify(j));
        // la clave vieja sólo se retira cuando la copia nueva quedó escrita de verdad; si no, sigue siendo la única copia
        if (guardadas) anteriores.forEach(function (k) { if (k !== LOCAL_KEY) try { localStorage.removeItem(k); } catch (e) {} });
      }
      // Lo que ya está en memoria (recién anotado, o traído de la base) manda sobre la copia local.
      var nuevas = [], existentes = [];
      Object.keys(j).forEach(function (k) {
        var masNueva = anots[k] && j[k] && j[k].editado && anots[k].editado && j[k].editado > anots[k].editado;
        if (anots[k] && !masNueva) existentes.push(k);
        else if (!filtro || filtro(k, j[k])) {  // un borrador local más reciente vuelve a subir, fundido sobre lo que la base tiene
          if (campos[k]) CAMPOS_BORRADOR[k] = campos[k];
          anots[k] = masNueva ? fundirBorrador(anots[k], j[k], campos[k]) : j[k]; nuevas.push(k);
        }
      });
      return { migradas: migradas, guardadas: guardadas, nuevas: nuevas, existentes: existentes };
    } catch (e) { return { migradas: 0, guardadas: true, nuevas: [], existentes: [] }; }
  }

