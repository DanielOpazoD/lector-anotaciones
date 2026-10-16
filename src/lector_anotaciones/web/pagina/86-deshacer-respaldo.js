// ------------------------------------------------------------ deshacer y respaldo
// La zona de «Deshacer», abajo y durante ocho segundos, para un borrado o para un cambio de color o de estado. Vive en
// su propia zona, no en el texto de estado: el eco de la base que confirma la escritura reescribe ese texto y se
// llevaría el enlace antes de tiempo. La última acción manda: un aviso nuevo reemplaza al anterior. Al pulsarlo, la
// zona se vacía y luego se deshace (`alDeshacer` decide adónde va el foco). `deshacerDe` dice de qué anotación es el
// aviso que se ve y de qué tipo, para retirarlo cuando ya no hay qué deshacer.
(function (P, E) {
  // lo que este fragmento ofrece a los demás (las funciones se elevan: están desde el principio)
  P.retirarDeshacer = retirarDeshacer;
  P.ofrecerDeshacer = ofrecerDeshacer;
  P.ofrecerDeshacerCambio = ofrecerDeshacerCambio;
  P.respaldar = respaldar;
  var deshacerDe = null; // { id, tipo: 'borrado' | 'cambio' }
  function mostrarDeshacer(id, tipo, texto, boton, titulo, alDeshacer) {
    var z = P.$('#deshacer-zona');
    z.innerHTML = '';
    z.appendChild(P.el('span', { text: texto }));
    var u = P.el('button', { id: 'deshacer', 'class': 'enlace', type: 'button', text: boton, title: titulo });
    var mio = { id: id, tipo: tipo };
    deshacerDe = mio;
    u.addEventListener('click', function () {
      if (!z.contains(u)) return;
      z.innerHTML = '';
      deshacerDe = null;
      alDeshacer();
    });
    z.appendChild(u);
    setTimeout(function () {
      if (!z.contains(u)) return;
      var tenia = z.contains(document.activeElement);
      z.innerHTML = '';
      if (deshacerDe === mio) deshacerDe = null;
      if (tenia) {
        var t = P.$('.tab.activa');
        (P.enfocable(t) ? t : P.$('#lectura')).focus({ preventScroll: true });
      }
    }, 8000);
  }
  // Retira el aviso de esa anotación (sin `id`, el que haya; con `soloCambios`, sólo si no es de un borrado): la base
  // rechazó la escritura, la anotación se borró en otra sesión o la página pasó a sólo lectura.
  function retirarDeshacer(id, soloCambios) {
    if (!deshacerDe || (id && deshacerDe.id !== id) || (soloCambios && deshacerDe.tipo !== 'cambio')) return;
    var z = P.$('#deshacer-zona'),
      tenia = z.contains(document.activeElement);
    z.innerHTML = '';
    if (deshacerDe.tipo === 'borrado') E.ultimoBorrado = null;
    deshacerDe = null;
    if (tenia) P.$('#lectura').focus({ preventScroll: true });
  }
  // El foco, tras deshacer, a la anotación; si no se pudo (el panel no se ve), a la lectura.
  function enfocarTrasDeshacer(id) {
    P.enfocar(id);
    if (document.activeElement === document.body) P.$('#lectura').focus({ preventScroll: true });
  }
  function ofrecerDeshacer(a, campos) {
    // Deshacer devuelve también la lista de campos que el lector había cambiado y la base todavía no tiene.
    E.ultimoBorrado = a;
    P.estado('Anotación borrada', true);
    mostrarDeshacer(
      a.id,
      'borrado',
      'Anotación borrada.',
      'Deshacer borrado',
      'Recuperar la anotación borrada',
      function () {
        if (E.ultimoBorrado) {
          if (E.ultimoBorrado === a && campos) P.SINC.campos[a.id] = Object.assign({}, campos);
          P.guardar(E.ultimoBorrado);
          E.ultimoBorrado = null;
          P.estado('Anotación recuperada');
        }
        enfocarTrasDeshacer(a.id); // el foco pasa a la anotación recuperada
      }
    );
    setTimeout(function () {
      if (E.ultimoBorrado === a) E.ultimoBorrado = null;
    }, 8000);
  }
  // Un cambio de color o de estado (también «Atendida» y «Reabrir» al revisar) se puede deshacer: vuelven a lo de antes
  // (`antes`) los campos que siguen como el cambio los dejó (`despues`); lo que se cambió después, aquí o en otra sesión,
  // no se pisa. Un borrado que se estaba ofreciendo deshacer deja de ofrecerse.
  function ofrecerDeshacerCambio(id, antes, despues, texto) {
    E.ultimoBorrado = null;
    P.anunciar(texto + ' Se puede deshacer.');
    mostrarDeshacer(id, 'cambio', texto, 'Deshacer', 'Volver a como estaba', function () {
      var a = P.anots[id];
      if (!a || E.SOLO_LECTURA) {
        P.estado(
          E.SOLO_LECTURA ? 'Sólo lectura: no se puede deshacer' : 'La anotación ya no está: nada que deshacer',
          true
        );
        P.$('#lectura').focus({ preventScroll: true });
        return;
      }
      var parche = {},
        n = 0;
      Object.keys(antes).forEach(function (k) {
        if (a[k] === despues[k]) {
          parche[k] = antes[k];
          n++;
        }
      });
      if (!n) {
        P.estado('No se deshizo: la anotación cambió después', true);
        enfocarTrasDeshacer(id);
        return;
      }
      P.guardar(Object.assign({}, a, parche));
      P.estado('Cambio deshecho');
      P.anunciar('Cambio deshecho');
      enfocarTrasDeshacer(id);
    });
  }
  function respaldar() {
    // Una copia diaria de todas las anotaciones en la colección «respaldos», escrita después de una escritura
    // propia confirmada (nunca desde el eco de la base). Se trocea para no pasar del tamaño por documento,
    // recuerda en memoria que ya se hizo hoy y no insiste cuando la base dijo que no puede.
    if (!E.db || !E.LIBRO || E.SOLO_LECTURA || E.respaldoBloqueado) return;
    var hoy = new Date().toLocaleDateString('sv-SE'),
      clave = E.LOCAL_KEY + ':respaldo';
    if (E.respaldoHoy === hoy || P.lsGet(clave) === hoy || !Object.keys(P.anots).length) return;
    E.respaldoHoy = hoy;
    P.lsSet(clave, hoy);
    // El tope se mide como lo mide la base: bytes del documento ya envuelto. Las anotaciones van serializadas dentro de
    // una cadena, así que su JSON se escapa otra vez (cada comilla y cada salto crecen), y un carácter no latino ocupa
    // de dos a cuatro bytes. Una anotación que no cabe ni sola queda fuera del respaldo (su documento sigue guardándola).
    var todas = Object.keys(P.anots).map(function (k) {
        return P.anots[k];
      }),
      partes = [],
      actual = [],
      omitidas = 0;
    var sobre = P.bytesJSON({ fecha: hoy, parte: 99, partes: 99, n: 99999, anotaciones: '[]' }),
      tam = sobre;
    todas.forEach(function (a) {
      var t = P.bytesJSON(JSON.stringify(a)) - 2 + 1; // escapada dentro de la cadena, sin sus comillas, más la coma
      if (sobre + t > P.RESPALDO_MAX) {
        omitidas++;
        return;
      }
      if (actual.length && tam + t > P.RESPALDO_MAX) {
        partes.push(actual);
        actual = [];
        tam = sobre;
      }
      actual.push(a);
      tam += t;
    });
    if (actual.length) partes.push(actual);
    var colR = E.db.collection(P.rutaBase('respaldos')),
      respaldadas = todas.length - omitidas;
    var escrituras = partes.map(function (parte, i) {
      return P.enCurso(
        colR
          .doc(hoy + '-' + (i + 1))
          .set({ fecha: hoy, parte: i + 1, partes: partes.length, n: parte.length, anotaciones: JSON.stringify(parte) })
      );
    });
    Promise.all(escrituras)
      .then(function () {
        return colR
          .doc(hoy)
          .set({ fecha: hoy, libro: P.libro().generado, n: respaldadas, partes: partes.length, omitidas: omitidas });
      })
      .catch(function (e) {
        var codigo = (e && e.code) || 'error';
        E.respaldoHoy = null;
        P.lsSet(clave, '');
        if (codigo !== 'unavailable') E.respaldoBloqueado = true;
        P.estado(
          'No se pudo escribir el respaldo diario (' + codigo + '); las anotaciones siguen guardadas una a una',
          true
        );
      });
  }
})(LAPagina, LAEstado);
