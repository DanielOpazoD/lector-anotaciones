// ------------------------------------------------------------ anotaciones: persistencia
// Las decisiones (qué escribir, qué hacer ante una confirmación o un rechazo, cómo fundir lo que llega) son del núcleo
// (`SINC`, nucleo/65-sincronia.js, probado con node --test); aquí quedan las escrituras en la base y en el navegador,
// los reintentos y lo que se ve.
(function (P, E) {
  // lo que este fragmento ofrece a los demás (las funciones se elevan: están desde el principio)
  P.guardar = guardar;
  P.guardarSilencioso = guardarSilencioso;
  P.escribirEnBase = escribirEnBase;
  P.reintentar = reintentar;
  P.activarSoloLectura = activarSoloLectura;
  P.borrar = borrar;
  P.escribirCampos = escribirCampos;
  P.guardarLocal = guardarLocal;
  P.podarLocal = podarLocal;
  P.cargarLocal = cargarLocal;
  function guardar(a) {
    if (E.SOLO_LECTURA) {
      P.estado('Sólo lectura: en este libro puedes leer y copiar, no anotar', true);
      return;
    }
    // Los manejadores de la ficha pasan una copia con el cambio, nunca el objeto de `anots` ya mutado: la versión previa
    // (lo que la base tiene, para volver a ello si rechaza) se toma antes de tocar la memoria.
    var previa = P.SINC.cambiar(a, P.ahora()).previa;
    var u = P.ubicar(a);
    if (u) E.UBIC[a.id] = u;
    P.pintar(a);
    P.renderPanel();
    P.renderCuentas();
    if (E.col) {
      escribirEnBase(a.id, previa);
    } else if (E.modo === 'cargando') {
      // La base todavía conecta: la anotación se funde en la copia local sin pisar lo que quedó ahí de otras sesiones.
      if (P.SINC.pendientes.indexOf(a.id) < 0) P.SINC.pendientes.push(a.id);
      guardarLocal([a.id]);
    } else {
      guardarLocal();
    }
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
  function escribirEnBase(id, previa, alRechazar, reintento) {
    // Escribe lo que hay en memoria para esa id (`SINC.escritura`: los campos del lector con `update` si la base ya
    // tiene el documento; si no, entera). Si `update` no encuentra el documento (otra sesión lo borró), se crea entero.
    // Un rechazo transitorio se reintenta una sola vez tras un retardo corto y aleatorio; el segundo rechazo (o uno
    // definitivo) lo decide `rechazoEscritura`. Si entre tanto la anotación se borró, no hay nada que escribir.
    if (!E.col) return; // sin base no hay dónde escribir (quien llama ya lo comprobó)
    var col = E.col;
    var e0 = P.SINC.escritura(id);
    if (!e0) {
      delete P.SINC.enVuelo[id];
      return;
    }
    P.SINC.enVuelo[id] = 1;
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
    P.enCurso(escritura)
      .then(function () {
        var r = P.SINC.alConfirmar(id, a);
        escribirCampos([id]);
        if (r.estabaSinGuardar) {
          // la copia local se suelta sólo si nada se editó después de esta escritura
          if (r.soltarCopia) podarLocal([id]);
          P.renderPanel();
        }
        P.estado('Guardado ' + new Date().toLocaleTimeString());
        P.respaldar();
      })
      .catch(function (e) {
        if (reintento || !P.N.esTransitorio(e && e.code)) {
          rechazo(e);
          return;
        }
        setTimeout(
          function () {
            if (E.SOLO_LECTURA) rechazo(e);
            else escribirEnBase(id, previa, alRechazar, true);
          },
          100 + Math.random() * 300
        );
      });
  }
  function reintentar(id) {
    if (E.col && P.anots[id] && !E.SOLO_LECTURA) {
      P.estado('Reintentando…');
      escribirEnBase(id, null);
    }
  }
  function quitarDeMemoria(id) {
    var u = E.UBIC[id],
      q = P.SINC.quitar(id);
    delete E.UBIC[id];
    if (u && u.pid) P.pintarPid(u.pid);
    else if (q && q.anotacion.pid) P.pintarPid(q.anotacion.pid);
    P.marcasPagina();
    return q;
  }
  function rechazoEscritura(e, id, previa, verbo) {
    // La base no aceptó la escritura (`SINC.alRechazar`): la memoria vuelve a lo que la base tiene, para que no queden
    // anotaciones fantasma que se pintan, se cuentan y se exportan; una anotación que la base no tiene (nueva, o un
    // «Deshacer borrado» cuando el borrado ya se confirmó) nunca se retira: se conserva marcada «sin guardar», con copia
    // en el navegador, también ante un rechazo de permiso, que además pasa la página a sólo lectura; ahí la ficha ya no
    // ofrece reintentar, pero sí copiarla.
    var codigo = (e && e.code) || 'error',
      r = P.SINC.alRechazar(id, codigo, previa, verbo);
    if (r.restaurada) {
      var ub = P.ubicar(r.restaurada);
      if (ub) E.UBIC[id] = ub;
      P.pintar(r.restaurada);
    }
    // el borrado o el cambio no ocurrió: no hay nada que deshacer (salvo que el aviso ya sea de otra anotación)
    P.retirarDeshacer(id);
    if (verbo === 'borrar') {
      // nada más: la anotación volvió a la memoria
    } else if (r.restaurada) escribirCampos([id]);
    else if (r.conservada) guardarLocal([id]);
    P.renderPanel();
    P.renderCuentas();
    if (r.permiso) activarSoloLectura();
    if (r.conservada && r.permiso)
      P.estado(
        'No se pudo guardar en la base (' +
          codigo +
          '): sin permiso para escribir; la anotación sigue aquí y en este navegador, copia tus anotaciones con el botón',
        true
      );
    else if (r.conservada)
      P.estado(
        'No se pudo guardar en la base (' +
          codigo +
          '); la anotación sigue aquí y en este navegador: reintenta desde la ficha o copia tus anotaciones con el botón',
        true
      );
    else P.estado('No se pudo ' + verbo + ' (' + codigo + '); copia tus anotaciones con el botón', true);
  }
  function activarSoloLectura() {
    if (E.SOLO_LECTURA) return;
    E.SOLO_LECTURA = true;
    document.body.classList.add('solo-lectura');
    P.retirarDeshacer();
    P.ocultarTb();
    // El modo se señala en sitios que el eco de la base no pisa: el chip de la cabecera, el nombre de la barra de
    // selección (que sólo ofrece copiar), la ayuda sin los atajos de anotar, y los números de página sin acción.
    P.$('#sl-chip').hidden = false;
    P.$('#sel-tb').setAttribute('aria-label', 'Copiar la selección');
    P.$$('.pg').forEach(function (p) {
      p.disabled = true;
      p.title = 'Página ' + p.getAttribute('data-pg');
    });
    P.renderPanel();
    P.estado('Sólo lectura: en este libro puedes leer y copiar, no anotar', true);
  }
  function borrar(id) {
    if (E.SOLO_LECTURA) return;
    var q = quitarDeMemoria(id);
    if (!q) return;
    var a = q.anotacion,
      marca = q.marca;
    P.renderPanel();
    P.renderCuentas();
    // Un borrado confirmado sale también de la copia local, para que una pendiente que no subió no vuelva al recargar;
    // pero sólo cuando la base lo confirma (o no tenía nada que borrar): si lo rechaza, la anotación vuelve a la memoria
    // (con su marca de «sin guardar», si la tenía) y la copia local, si la tenía, la sigue teniendo.
    var borrada = function () {
      P.SINC.alBorrar(id);
      escribirCampos([id]);
      podarLocal([id]);
    };
    if (E.col) {
      P.enCurso(E.col.doc(id).delete())
        .then(function () {
          borrada();
          P.respaldar();
        })
        .catch(function (e) {
          if (e && e.code === 'not_found') {
            borrada();
            return;
          }
          if (marca) P.SINC.sinGuardar[id] = marca;
          rechazoEscritura(e, id, a, 'borrar');
        });
    } else if (E.modo === 'cargando') {
      borrada();
    } else {
      guardarLocal();
      P.SINC.alBorrar(id);
      escribirCampos([id]);
    }
    P.ofrecerDeshacer(a, q.campos);
  }
  function escribirCampos(ids) {
    // Actualiza en la lista guardada sólo esas anotaciones; las demás entradas (borradores de otra sesión aún no
    // cargados, o de otra cuenta) se conservan tal como estaban.
    var guardados = P.lsJSON(E.LOCAL_KEY + ':campos');
    ids.forEach(function (id) {
      var c = P.SINC.campos[id];
      if (c && Object.keys(c).length) guardados[id] = c;
      else delete guardados[id];
    });
    if (Object.keys(guardados).length) P.lsSet(E.LOCAL_KEY + ':campos', JSON.stringify(guardados));
    else
      try {
        localStorage.removeItem(E.LOCAL_KEY + ':campos');
      } catch (e) {
        P.fallo('almacenamiento', e);
      }
  }
  function leerLocal() {
    try {
      return JSON.parse(P.lsGet(E.LOCAL_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }
  function escribirLocal(datos) {
    if (Object.keys(datos).length) return P.lsSet(E.LOCAL_KEY, JSON.stringify(datos));
    try {
      localStorage.removeItem(E.LOCAL_KEY);
    } catch (e) {
      P.fallo('almacenamiento', e);
    }
    return true;
  }
  function guardarLocal(ids) {
    // Sin lista escribe toda la memoria (modo local, donde la copia es la única verdad). Con lista, funde esas
    // anotaciones en la copia que ya hay sin tocar lo demás: lo pendiente de otra sesión o de otra cuenta.
    var datos = P.anots;
    if (ids) {
      datos = leerLocal();
      ids.forEach(function (id) {
        if (P.anots[id]) datos[id] = P.anots[id];
      });
    }
    escribirCampos(ids || Object.keys(P.anots)); // la lista de campos cambiados viaja siempre con la copia local
    if (escribirLocal(datos)) P.estado('Guardado sólo en este navegador', true);
    else
      P.estado(
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
        campos = P.lsJSON(E.LOCAL_KEY + ':campos');
      // Migración: anotaciones guardadas por versiones anteriores de la página bajo otra clave
      // (libro.json las declara en `claves_anteriores`). Se copian sin pisar las ya guardadas y la
      // clave vieja se retira para que un borrado posterior no las resucite.
      var anteriores = ((E.LIBRO && E.LIBRO.claves_anteriores) || []).filter(function (k) {
          return k !== E.LOCAL_KEY;
        }),
        viejas = /** @type {Record<string, Record<string, Anotacion>>} */ ({});
      anteriores.forEach(function (k) {
        try {
          viejas[k] = JSON.parse(P.lsGet(k) || '{}');
        } catch (e) {
          P.fallo('claves anteriores: ' + k, e);
        }
      });
      var migradas = P.N.migrarClaves(j, viejas),
        guardadas = true;
      if (migradas) {
        guardadas = P.lsSet(E.LOCAL_KEY, JSON.stringify(j));
        // la clave vieja sólo se retira cuando la copia nueva quedó escrita de verdad; si no, sigue siendo la única copia
        if (guardadas)
          anteriores.forEach(function (k) {
            try {
              localStorage.removeItem(k);
            } catch (e) {
              P.fallo('almacenamiento', e);
            }
          });
      }
      var r = P.SINC.fusionarLocal(j, campos, filtro);
      return { migradas: migradas, guardadas: guardadas, nuevas: r.nuevas, existentes: r.existentes };
    } catch (e) {
      return { migradas: 0, guardadas: true, nuevas: [], existentes: [] };
    }
  }
})(LAPagina, LAEstado);
