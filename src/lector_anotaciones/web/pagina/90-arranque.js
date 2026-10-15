// ------------------------------------------------------------ arranque
function arrancar() {
  // Primero el libro; la base (o el respaldo local) se conecta cuando el libro ya está en pantalla,
  // porque la clave del respaldo y el pintado de los destacados dependen de él.
  // El libro de la página o el que se eligió en la biblioteca (ver obtenerLibro).
  var libroListo = obtenerLibro().then(function (r) {
    var L = r.libro;
    if (!L || !L.secciones || !L.secciones.length) throw new Error('el libro no tiene secciones');
    FUENTE = r.fuente;
    LIBRO = L;
    SECS = L.secciones;
    // el libro de la página conserva su clave de siempre ('lector-anotaciones:' + (L.id || 'libro')); uno importado
    // lleva su lugar en la clave (claveLocalDe)
    LOCAL_KEY = claveLocalDe(FUENTE.tipo, FUENTE.tipo === 'pagina' ? L.id : FUENTE.id);
    document.title = 'Lector · ' + L.titulo;
    VISTO = lsJSON(LOCAL_KEY + ':visto');
    LEIDAS = lsJSON(LOCAL_KEY + ':leidas');
    CAPAS_ON = lsJSON(LOCAL_KEY + ':capas');
    renderLibro();
    renderCapasMenu();
    renderProgreso();
    if (lsGet(LOCAL_KEY + ':foco')) alternarFoco();
    $('#sub').textContent = L.titulo + (L.generado ? ' · fuentes del ' + L.generado : '');
    var h = (location.hash || '').replace('#', ''),
      ultima = lsGet(LOCAL_KEY + ':ultima');
    irA(SEC_BY_ID[h] ? h : SEC_BY_ID[ultima] ? ultima : SEC_BY_ID[L.inicio] ? L.inicio : SECS[0].id);
    pintarTodo();
    renderPanel();
    renderCuentas();
    // un aviso del arranque (el libro elegido no se pudo abrir) queda a la vista hasta que se cierre: la barra de estado
    // lo pisaría con «Conectado…»
    if (r.aviso) {
      $('span', $('#aviso-libro')).textContent = r.aviso;
      $('#aviso-libro').hidden = false;
      anunciar(r.aviso);
    }
    estado('Conectando con la base de anotaciones…');
  });
  libroListo.catch(function (e) {
    if (e && e.sinLibro) {
      mostrarSinLibro();
      return;
    }
    mostrarSinLibro(
      'No se pudo cargar el libro (' +
        String((e && e.message) || e) +
        '). Puedes abrir o importar otro desde la biblioteca.'
    );
  });
  Promise.all([libroListo, usoDb, usoUser])
    .then(function (r) {
      // un libro guardado sólo en este navegador guarda también aquí sus anotaciones
      var d = FUENTE.tipo === 'local' ? null : r[1];
      USER = r[2] || null;
      var listoUsuario = USER
        ? Promise.all([USER.id(), USER.can('data.write')])
            .then(function (u) {
              ME = u[0] || null;
              if (u[1] === false) activarSoloLectura();
            })
            .catch(function () {})
        : Promise.resolve();
      listoUsuario.then(function () {
        renderPanel();
      });
      function marcarSinSubir() {
        // Quien anotó antes de saber que es de sólo lectura (o cuya subida falló en otra sesión) no puede subir nada:
        // lo pendiente sigue a la vista marcado «sin guardar», con su copia en el navegador, se cuenta aparte y se
        // exporta con esa señal, para copiarlo antes de que se pierda.
        var ids = pendientesBase.filter(function (id) {
          return !!anots[id];
        });
        if (!ids.length) return;
        ids.forEach(function (id) {
          SIN_GUARDAR[id] = 'sólo lectura';
        });
        guardarLocal(ids);
        renderPanel();
        estado(
          ids.length +
            (ids.length === 1
              ? ' anotación no está en la base y en sólo lectura no puede subir; se conserva en este navegador. Usa «Copiar todo» para enviarla.'
              : ' anotaciones no están en la base y en sólo lectura no pueden subir; se conservan en este navegador. Usa «Copiar todo» para enviarlas.'),
          true
        );
      }
      function recuperarYSubir() {
        // Con la primera foto de la base y el usuario ya conocido: lo que quedó en el navegador en otra sesión (anotado
        // sin conexión, o cuya subida falló) vuelve a la memoria y a la cola de subida; lo que la base ya tiene manda y
        // sale de la copia local; lo de otra cuenta se queda en la copia local, sin cargarse, hasta que vuelva su autor.
        // Luego sube lo pendiente con su autor. Lo que no logra subir sigue en memoria y en el navegador, se avisa y se
        // vuelve a intentar en la próxima carga; de la copia local sólo sale lo que subió.
        listoUsuario.then(function () {
          if (!col) return;
          var rec = cargarLocal(function (id, a) {
            return !(a.autor && ME && a.autor !== ME);
          });
          rec.nuevas.forEach(function (id) {
            if (pendientesBase.indexOf(id) < 0) pendientesBase.push(id);
          });
          if (rec.nuevas.length) {
            pintarTodo();
            renderPanel();
            renderCuentas();
          }
          var obsoletas = rec.existentes.filter(function (id) {
            return pendientesBase.indexOf(id) < 0;
          });
          podarLocal(obsoletas);
          obsoletas.forEach(function (id) {
            limpiarCampos(id, anots[id]);
          });
          if (SOLO_LECTURA) {
            marcarSinSubir();
            return;
          }
          var ids = pendientesBase.splice(0).filter(function (id) {
            var a = anots[id];
            if (!a) return false;
            if (!a.autor && ME) a.autor = ME;
            return true;
          });
          if (!ids.length) return;
          var escritas = {};
          Promise.all(
            ids.map(function (id) {
              escritas[id] = anots[id];
              return col
                .doc(id)
                .set(anots[id])
                .then(function () {
                  return true;
                })
                .catch(function (e) {
                  return (e && e.code) || 'error';
                });
            })
          ).then(function (ok) {
            var subieron = ids.filter(function (id, i) {
                return ok[i] === true;
              }),
              fallidas = ids.filter(function (id, i) {
                return ok[i] !== true;
              });
            subieron.forEach(function (id) {
              EN_BASE[id] = 1;
              limpiarCampos(id, escritas[id]);
            });
            podarLocal(
              subieron.filter(function (id) {
                return anots[id] === escritas[id];
              })
            );
            if (!fallidas.length) {
              respaldar();
              return;
            }
            // la ficha de cada una lo dice y ofrece reintentar
            fallidas.forEach(function (id) {
              SIN_GUARDAR[id] = ok[ids.indexOf(id)];
            });
            guardarLocal(fallidas);
            renderPanel();
            estado(
              fallidas.length +
                (fallidas.length === 1
                  ? ' anotación no pudo subir a la base; se conserva en este navegador y volverá a intentarlo al recargar. Usa «Copiar todo» para enviarla.'
                  : ' anotaciones no pudieron subir a la base; se conservan en este navegador y volverán a intentarlo al recargar. Usa «Copiar todo» para enviarlas.'),
              true
            );
          });
        });
      }
      if (!d) {
        modo = 'local';
        var mig = cargarLocal();
        pintarTodo();
        renderPanel();
        renderCuentas();
        var aviso =
          FUENTE.tipo === 'local'
            ? 'Libro guardado sólo en este navegador: sus anotaciones también se guardan aquí. Usa «Copiar todo» para enviarlas.'
            : 'Sin base compartida: las anotaciones se guardan sólo en este navegador. Usa «Copiar todo» para enviarlas.';
        if (mig.migradas && mig.guardadas)
          aviso = mig.migradas + ' anotaciones recuperadas de la versión anterior de la página. ' + aviso;
        if (mig.migradas && !mig.guardadas)
          aviso =
            'No se pudieron guardar ' +
            mig.migradas +
            ' anotaciones recuperadas de la versión anterior (almacenamiento lleno o bloqueado); se conservan en la clave anterior. Copia tus anotaciones con el botón.';
        estado(aviso, true);
        return;
      }
      db = d;
      col = db.collection(rutaBase('anotaciones'));
      modo = 'db';
      var primeraFoto = true;
      col.onSnapshot(
        function (snap) {
          var cambio = false;
          snap.docChanges().forEach(function (ch) {
            var d2 = ch.doc.data();
            if (ch.type === 'removed') {
              delete EN_BASE[ch.doc.id];
              if (anots[ch.doc.id]) {
                delete anots[ch.doc.id];
                cambio = true;
              }
            } else if (d2) {
              EN_BASE[ch.doc.id] = 1;
              var nuevo = Object.assign({}, d2, { id: ch.doc.id });
              // si aquí hay un borrador sin guardar de esa anotación, lo que llega de la base se funde debajo sin pisarlo
              if (SIN_GUARDAR[ch.doc.id] && anots[ch.doc.id])
                nuevo = fundirBorrador(nuevo, anots[ch.doc.id], CAMPOS_BORRADOR[ch.doc.id]);
              if (!igual(anots[ch.doc.id], nuevo)) {
                anots[ch.doc.id] = nuevo;
                cambio = true;
              }
            }
          });
          // qué es propio se sabe cuando se conoce al usuario: la cuenta y el aviso esperan a saberlo (y se registran antes
          // que la recuperación de lo que quedó en el navegador, para que su aviso, si lo hay, quede encima)
          if (!snap.metadata.fromCache)
            listoUsuario.then(function () {
              var nr = cuantasPorRevisar();
              estado(
                'Conectado · ' +
                  Object.keys(anots).length +
                  ' anotaciones' +
                  (nr ? ' · ' + nr + (nr === 1 ? ' respuesta por revisar' : ' respuestas por revisar') : '')
              );
              // las respuestas nuevas se anuncian una vez por visita, al llegar
              if (nr && !avisoRevisar) {
                avisoRevisar = true;
                anunciar(
                  nr +
                    (nr === 1 ? ' respuesta nueva por revisar' : ' respuestas nuevas por revisar') +
                    ': pestaña «Por revisar» del panel.'
                );
              }
            });
          if (primeraFoto) {
            primeraFoto = false;
            recuperarYSubir();
          }
          if (cambio) {
            pintarTodo();
            renderPanel();
            renderCuentas();
          }
        },
        function (e) {
          estado(
            'La base dejó de responder (' + ((e && e.code) || 'error') + '); copia tus anotaciones con el botón',
            true
          );
        }
      );
    })
    .catch(function () {
      /* el error del libro ya se mostró */
    });
}
arrancar();
