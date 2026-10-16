// ------------------------------------------------------------ arranque
(function (P, E) {
  function arrancar() {
    // Primero el libro; la base (o el respaldo local) se conecta cuando el libro ya está en pantalla,
    // porque la clave del respaldo y el pintado de los destacados dependen de él.
    // El libro de la página o el que se eligió en la biblioteca (ver obtenerLibro).
    var libroListo = P.obtenerLibro().then(function (r) {
      var L = r.libro;
      if (!L || !L.secciones || !L.secciones.length) throw new Error('el libro no tiene secciones');
      E.FUENTE = r.fuente;
      E.LIBRO = L;
      E.SECS = L.secciones;
      // el libro de la página conserva su clave de siempre ('lector-anotaciones:' + (L.id || 'libro')); uno importado
      // lleva su lugar en la clave (claveLocalDe)
      E.LOCAL_KEY = P.claveLocalDe(E.FUENTE.tipo, E.FUENTE.tipo === 'pagina' ? L.id : E.FUENTE.id);
      document.title = 'Lector · ' + L.titulo;
      E.VISTO = P.lsJSON(E.LOCAL_KEY + ':visto');
      E.LEIDAS = P.lsJSON(E.LOCAL_KEY + ':leidas');
      E.CAPAS_ON = P.lsJSON(E.LOCAL_KEY + ':capas');
      P.renderLibro();
      P.renderCapasMenu();
      P.renderProgreso();
      if (P.lsGet(E.LOCAL_KEY + ':foco')) P.alternarFoco();
      P.$('#sub').textContent = L.titulo + (L.generado ? ' · fuentes del ' + L.generado : '');
      var h = (location.hash || '').replace('#', ''),
        ultima = P.lsGet(E.LOCAL_KEY + ':ultima');
      P.irA(P.SEC_BY_ID[h] ? h : P.SEC_BY_ID[ultima || ''] ? ultima : P.SEC_BY_ID[L.inicio] ? L.inicio : E.SECS[0].id);
      P.pintarTodo();
      P.renderPanel();
      P.renderCuentas();
      // un aviso del arranque (el libro elegido no se pudo abrir) queda a la vista hasta que se cierre: la barra de estado
      // lo pisaría con «Conectado…»
      if (r.aviso) {
        P.$('span', P.$('#aviso-libro')).textContent = r.aviso;
        P.$('#aviso-libro').hidden = false;
        P.anunciar(r.aviso);
      }
      P.estado('Conectando con la base de anotaciones…');
    });
    libroListo.catch(function (e) {
      if (e && e.sinLibro) {
        P.mostrarSinLibro();
        return;
      }
      P.mostrarSinLibro(
        'No se pudo cargar el libro (' +
          String((e && e.message) || e) +
          '). Puedes abrir o importar otro desde la biblioteca.'
      );
    });
    Promise.all([libroListo, P.usoDb, P.usoUser])
      .then(function (r) {
        // un libro guardado sólo en este navegador guarda también aquí sus anotaciones
        var d = E.FUENTE.tipo === 'local' ? null : r[1];
        E.USER = r[2] || null;
        var listoUsuario = E.USER
          ? Promise.all([E.USER.id(), E.USER.can ? E.USER.can('data.write') : null])
              .then(function (u) {
                E.ME = u[0] || null;
                if (u[1] === false) P.activarSoloLectura();
              })
              .catch(function (e) {
                P.fallo('identidad', e);
              })
          : Promise.resolve();
        listoUsuario.then(function () {
          P.renderPanel();
        });
        function marcarSinSubir() {
          // Quien anotó antes de saber que es de sólo lectura (o cuya subida falló en otra sesión) no puede subir nada:
          // lo pendiente sigue a la vista marcado «sin guardar», con su copia en el navegador, se cuenta aparte y se
          // exporta con esa señal, para copiarlo antes de que se pierda.
          var ids = P.SINC.marcarSinSubir();
          if (!ids.length) return;
          P.guardarLocal(ids);
          P.renderPanel();
          P.estado(
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
            if (!E.col) return;
            var col = E.col;
            var rec = P.cargarLocal(function (id, a) {
              return !(a.autor && E.ME && a.autor !== E.ME);
            });
            // lo recuperado va a la cola de subida; lo que la base ya tenía sobra en la copia local
            var sobran = P.SINC.alRecuperar(rec);
            if (rec.nuevas.length) {
              P.pintarTodo();
              P.renderPanel();
              P.renderCuentas();
            }
            P.podarLocal(sobran);
            P.escribirCampos(sobran);
            if (E.SOLO_LECTURA) {
              marcarSinSubir();
              return;
            }
            var ids = P.SINC.tomarPendientes(E.ME);
            if (!ids.length) return;
            var escritas = /** @type {Record<string, Anotacion>} */ ({});
            Promise.all(
              ids.map(function (id) {
                escritas[id] = P.anots[id];
                return col
                  .doc(id)
                  .set(P.anots[id])
                  .then(function () {
                    return true;
                  })
                  .catch(function (e) {
                    return (e && e.code) || 'error';
                  });
              })
            ).then(function (ok) {
              var r = P.SINC.alSubir(ids, ok, escritas),
                fallidas = r.fallidas;
              P.escribirCampos(ids);
              P.podarLocal(r.soltar);
              if (!fallidas.length) {
                P.respaldar();
                return;
              }
              // la ficha de cada una lo dice y ofrece reintentar
              P.guardarLocal(fallidas);
              P.renderPanel();
              P.estado(
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
          E.modo = 'local';
          var mig = P.cargarLocal();
          P.pintarTodo();
          P.renderPanel();
          P.renderCuentas();
          var aviso =
            E.FUENTE.tipo === 'local'
              ? 'Libro guardado sólo en este navegador: sus anotaciones también se guardan aquí. Usa «Copiar todo» para enviarlas.'
              : 'Sin base compartida: las anotaciones se guardan sólo en este navegador. Usa «Copiar todo» para enviarlas.';
          if (mig.migradas && mig.guardadas)
            aviso = mig.migradas + ' anotaciones recuperadas de la versión anterior de la página. ' + aviso;
          if (mig.migradas && !mig.guardadas)
            aviso =
              'No se pudieron guardar ' +
              mig.migradas +
              ' anotaciones recuperadas de la versión anterior (almacenamiento lleno o bloqueado); se conservan en la clave anterior. Copia tus anotaciones con el botón.';
          P.estado(aviso, true);
          return;
        }
        var col = d.collection(P.rutaBase('anotaciones'));
        E.db = d;
        E.col = col;
        E.modo = 'db';
        var primeraFoto = true;
        col.onSnapshot(
          function (snap) {
            // lo que llega de la base entra en la memoria; un borrador sin guardar de esa anotación queda encima
            // lo que no tiene forma de anotación no entra (lo escribió cualquiera): queda en el diagnóstico
            var cambios = snap
              .docChanges()
              .map(function (ch) {
                return { tipo: ch.type, id: ch.doc.id, datos: ch.type === 'removed' ? null : ch.doc.data() };
              })
              .filter(function (ch) {
                var mal = ch.datos && P.N.problemaDeAnotacion(ch.datos);
                if (mal) P.fallo('base: ' + ch.id + ' no es una anotación válida', mal);
                return !mal;
              });
            var cambio = P.SINC.alFoto(cambios);
            // borrada en otra sesión: su cambio ya no se puede deshacer (el eco de un borrado propio no retira su aviso)
            cambios.forEach(function (ch) {
              if (ch.tipo === 'removed') P.retirarDeshacer(ch.id, true);
            });
            // qué es propio se sabe cuando se conoce al usuario: la cuenta y el aviso esperan a saberlo (y se registran antes
            // que la recuperación de lo que quedó en el navegador, para que su aviso, si lo hay, quede encima)
            if (!snap.metadata.fromCache)
              listoUsuario.then(function () {
                var nr = P.cuantasPorRevisar();
                P.estado(
                  'Conectado · ' +
                    Object.keys(P.anots).length +
                    ' anotaciones' +
                    (nr ? ' · ' + nr + (nr === 1 ? ' respuesta por revisar' : ' respuestas por revisar') : '')
                );
                // las respuestas nuevas se anuncian una vez por visita, al llegar
                if (nr && !E.avisoRevisar) {
                  E.avisoRevisar = true;
                  P.anunciar(
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
              P.pintarTodo();
              P.renderPanel();
              P.renderCuentas();
            }
          },
          function (e) {
            P.estado(
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
})(LAPagina, LAEstado);
