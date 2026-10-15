// ------------------------------------------------------------ anotaciones: persistencia
// Las decisiones (qué escribir, qué hacer ante una confirmación o un rechazo, cómo fundir lo que llega) son del núcleo
// (`SINC`, nucleo/65-sincronia.js, probado con node --test); aquí quedan las escrituras en la base y en el navegador,
// los reintentos y lo que se ve.
function guardar(a) {
  if (SOLO_LECTURA) {
    estado('Sólo lectura: en este libro puedes leer y copiar, no anotar', true);
    return;
  }
  // Los manejadores de la ficha pasan una copia con el cambio, nunca el objeto de `anots` ya mutado: la versión previa
  // (lo que la base tiene, para volver a ello si rechaza) se toma antes de tocar la memoria.
  var previa = SINC.cambiar(a, ahora()).previa;
  var u = ubicar(a);
  if (u) UBIC[a.id] = u;
  pintar(a);
  renderPanel();
  renderCuentas();
  if (col) {
    escribirEnBase(a.id, previa);
  } else if (modo === 'cargando') {
    // La base todavía conecta: la anotación se funde en la copia local sin pisar lo que quedó ahí de otras sesiones.
    if (SINC.pendientes.indexOf(a.id) < 0) SINC.pendientes.push(a.id);
    guardarLocal([a.id]);
  } else {
    guardarLocal();
  }
}
function escribirEnBase(id, previa, alRechazar, reintento) {
  // Escribe lo que hay en memoria para esa id (`SINC.escritura`: los campos del lector con `update` si la base ya
  // tiene el documento; si no, entera). Si `update` no encuentra el documento (otra sesión lo borró), se crea entero.
  // Un rechazo transitorio se reintenta una sola vez tras un retardo corto y aleatorio; el segundo rechazo (o uno
  // definitivo) lo decide `rechazoEscritura`. Si entre tanto la anotación se borró, no hay nada que escribir.
  var e0 = SINC.escritura(id);
  if (!e0) {
    delete SINC.enVuelo[id];
    return;
  }
  SINC.enVuelo[id] = 1;
  var a = e0.anotacion,
    doc = col.doc(id);
  var rechazo = function (e) {
    rechazoEscritura(e, id, previa, 'guardar');
    if (alRechazar) alRechazar(e);
  };
  var escritura =
    e0.modo === 'update'
      ? doc.update(e0.datos).catch(function (e) {
          if (e && e.code === 'invalid_argument') return doc.set(a);
          throw e;
        })
      : doc.set(a);
  enCurso(escritura)
    .then(function () {
      var r = SINC.alConfirmar(id, a);
      escribirCampos([id]);
      if (r.estabaSinGuardar) {
        // la copia local se suelta sólo si nada se editó después de esta escritura
        if (r.soltarCopia) podarLocal([id]);
        renderPanel();
      }
      estado('Guardado ' + new Date().toLocaleTimeString());
      respaldar();
    })
    .catch(function (e) {
      if (reintento || !N.esTransitorio(e && e.code)) {
        rechazo(e);
        return;
      }
      setTimeout(
        function () {
          if (SOLO_LECTURA) rechazo(e);
          else escribirEnBase(id, previa, alRechazar, true);
        },
        100 + Math.random() * 300
      );
    });
}
function reintentar(id) {
  if (col && anots[id] && !SOLO_LECTURA) {
    estado('Reintentando…');
    escribirEnBase(id, null);
  }
}
function quitarDeMemoria(id) {
  var u = UBIC[id],
    q = SINC.quitar(id);
  delete UBIC[id];
  if (u && u.pid) pintarPid(u.pid);
  else if (q && q.anotacion.pid) pintarPid(q.anotacion.pid);
  marcasPagina();
  return q;
}
function rechazoEscritura(e, id, previa, verbo) {
  // La base no aceptó la escritura (`SINC.alRechazar`): la memoria vuelve a lo que la base tiene, para que no queden
  // anotaciones fantasma que se pintan, se cuentan y se exportan; una anotación que la base no tiene (nueva, o un
  // «Deshacer borrado» cuando el borrado ya se confirmó) nunca se retira: se conserva marcada «sin guardar», con copia
  // en el navegador, también ante un rechazo de permiso, que además pasa la página a sólo lectura; ahí la ficha ya no
  // ofrece reintentar, pero sí copiarla.
  var codigo = (e && e.code) || 'error',
    r = SINC.alRechazar(id, codigo, previa, verbo);
  if (r.restaurada) {
    var ub = ubicar(r.restaurada);
    if (ub) UBIC[id] = ub;
    pintar(r.restaurada);
  }
  if (verbo === 'borrar') {
    // el borrado no ocurrió: no hay nada que deshacer (salvo que el enlace ya sea de otro borrado posterior)
    if (ultimoBorrado && ultimoBorrado.id === id) {
      ultimoBorrado = null;
      var z = $('#deshacer-zona');
      if (z) z.innerHTML = '';
    }
  } else if (r.restaurada) escribirCampos([id]);
  else if (r.conservada) guardarLocal([id]);
  renderPanel();
  renderCuentas();
  if (r.permiso) activarSoloLectura();
  if (r.conservada && r.permiso)
    estado(
      'No se pudo guardar en la base (' +
        codigo +
        '): sin permiso para escribir; la anotación sigue aquí y en este navegador, copia tus anotaciones con el botón',
      true
    );
  else if (r.conservada)
    estado(
      'No se pudo guardar en la base (' +
        codigo +
        '); la anotación sigue aquí y en este navegador: reintenta desde la ficha o copia tus anotaciones con el botón',
      true
    );
  else estado('No se pudo ' + verbo + ' (' + codigo + '); copia tus anotaciones con el botón', true);
}
function activarSoloLectura() {
  if (SOLO_LECTURA) return;
  SOLO_LECTURA = true;
  document.body.classList.add('solo-lectura');
  ocultarTb();
  // El modo se señala en sitios que el eco de la base no pisa: el chip de la cabecera, el nombre de la barra de
  // selección (que sólo ofrece copiar), la ayuda sin los atajos de anotar, y los números de página sin acción.
  $('#sl-chip').hidden = false;
  $('#sel-tb').setAttribute('aria-label', 'Copiar la selección');
  $$('.pg').forEach(function (p) {
    p.disabled = true;
    p.title = 'Página ' + p.getAttribute('data-pg');
  });
  renderPanel();
  estado('Sólo lectura: en este libro puedes leer y copiar, no anotar', true);
}
function borrar(id) {
  if (SOLO_LECTURA) return;
  var q = quitarDeMemoria(id);
  if (!q) return;
  var a = q.anotacion;
  renderPanel();
  renderCuentas();
  // Un borrado confirmado sale también de la copia local, para que una pendiente que no subió no vuelva al recargar;
  // pero sólo cuando la base lo confirma (o no tenía nada que borrar): si lo rechaza, la anotación vuelve a la memoria
  // (con su marca de «sin guardar», si la tenía) y la copia local, si la tenía, la sigue teniendo.
  var borrada = function () {
    SINC.alBorrar(id);
    escribirCampos([id]);
    podarLocal([id]);
  };
  if (col) {
    enCurso(col.doc(id).delete())
      .then(function () {
        borrada();
        respaldar();
      })
      .catch(function (e) {
        if (e && e.code === 'not_found') {
          borrada();
          return;
        }
        if (q.marca) SINC.sinGuardar[id] = q.marca;
        rechazoEscritura(e, id, a, 'borrar');
      });
  } else if (modo === 'cargando') {
    borrada();
  } else {
    guardarLocal();
    SINC.alBorrar(id);
    escribirCampos([id]);
  }
  ofrecerDeshacer(a, q.campos);
}
function escribirCampos(ids) {
  // Actualiza en la lista guardada sólo esas anotaciones; las demás entradas (borradores de otra sesión aún no
  // cargados, o de otra cuenta) se conservan tal como estaban.
  var guardados = lsJSON(LOCAL_KEY + ':campos');
  ids.forEach(function (id) {
    var c = SINC.campos[id];
    if (c && Object.keys(c).length) guardados[id] = c;
    else delete guardados[id];
  });
  if (Object.keys(guardados).length) lsSet(LOCAL_KEY + ':campos', JSON.stringify(guardados));
  else
    try {
      localStorage.removeItem(LOCAL_KEY + ':campos');
    } catch (e) {}
}
function leerLocal() {
  try {
    return JSON.parse(lsGet(LOCAL_KEY) || '{}') || {};
  } catch (e) {
    return {};
  }
}
function escribirLocal(datos) {
  if (Object.keys(datos).length) return lsSet(LOCAL_KEY, JSON.stringify(datos));
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch (e) {}
  return true;
}
function guardarLocal(ids) {
  // Sin lista escribe toda la memoria (modo local, donde la copia es la única verdad). Con lista, funde esas
  // anotaciones en la copia que ya hay sin tocar lo demás: lo pendiente de otra sesión o de otra cuenta.
  var datos = anots;
  if (ids) {
    datos = leerLocal();
    ids.forEach(function (id) {
      if (anots[id]) datos[id] = anots[id];
    });
  }
  escribirCampos(ids || Object.keys(anots)); // la lista de campos cambiados viaja siempre con la copia local
  if (escribirLocal(datos)) estado('Guardado sólo en este navegador', true);
  else
    estado(
      'No se pudo guardar en este navegador (almacenamiento lleno o bloqueado): copia tus anotaciones con el botón antes de cerrar',
      true
    );
}
function podarLocal(ids) {
  // Retira de la copia local lo que ya no la necesita: subió a la base, la base ya lo tenía, o se borró.
  if (!ids.length) return;
  var datos = leerLocal(),
    habia = false;
  ids.forEach(function (id) {
    if (datos[id]) {
      delete datos[id];
      habia = true;
    }
  });
  if (habia) escribirLocal(datos);
}
function cargarLocal(filtro) {
  // Pasa a memoria lo guardado en el navegador (`SINC.fusionarLocal`: manda la memoria, salvo un borrador local más
  // reciente). `filtro(id, anotación)` puede dejar algo fuera: se queda en la copia local sin cargarse. Devuelve las ids
  // cargadas (`nuevas`) y las que ya estaban en memoria (`existentes`).
  try {
    var j = leerLocal(),
      campos = lsJSON(LOCAL_KEY + ':campos');
    // Migración: anotaciones guardadas por versiones anteriores de la página bajo otra clave
    // (libro.json las declara en `claves_anteriores`). Se copian sin pisar las ya guardadas y la
    // clave vieja se retira para que un borrado posterior no las resucite.
    var anteriores = ((LIBRO && LIBRO.claves_anteriores) || []).filter(function (k) {
        return k !== LOCAL_KEY;
      }),
      viejas = {};
    anteriores.forEach(function (k) {
      try {
        viejas[k] = JSON.parse(lsGet(k) || '{}');
      } catch (e) {}
    });
    var migradas = N.migrarClaves(j, viejas),
      guardadas = true;
    if (migradas) {
      guardadas = lsSet(LOCAL_KEY, JSON.stringify(j));
      // la clave vieja sólo se retira cuando la copia nueva quedó escrita de verdad; si no, sigue siendo la única copia
      if (guardadas)
        anteriores.forEach(function (k) {
          try {
            localStorage.removeItem(k);
          } catch (e) {}
        });
    }
    var r = SINC.fusionarLocal(j, campos, filtro);
    return { migradas: migradas, guardadas: guardadas, nuevas: r.nuevas, existentes: r.existentes };
  } catch (e) {
    return { migradas: 0, guardadas: true, nuevas: [], existentes: [] };
  }
}
