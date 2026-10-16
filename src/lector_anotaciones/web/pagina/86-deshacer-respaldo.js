// ------------------------------------------------------------ deshacer y respaldo
// La zona de «Deshacer», abajo y durante ocho segundos, para un borrado o para un cambio de color o de estado. Vive en
// su propia zona, no en el texto de estado: el eco de la base que confirma la escritura reescribe ese texto y se
// llevaría el enlace antes de tiempo. La última acción manda: un aviso nuevo reemplaza al anterior. Al pulsarlo, la
// zona se vacía y luego se deshace (`alDeshacer` decide adónde va el foco). `deshacerDe` dice de qué anotación es el
// aviso que se ve y de qué tipo, para retirarlo cuando ya no hay qué deshacer.
var deshacerDe = null; // { id, tipo: 'borrado' | 'cambio' }
function mostrarDeshacer(id, tipo, texto, boton, titulo, alDeshacer) {
  var z = $('#deshacer-zona');
  z.innerHTML = '';
  z.appendChild(el('span', { text: texto }));
  var u = el('button', { id: 'deshacer', 'class': 'enlace', type: 'button', text: boton, title: titulo });
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
      var t = $('.tab.activa');
      (enfocable(t) ? t : $('#lectura')).focus({ preventScroll: true });
    }
  }, 8000);
}
// Retira el aviso de esa anotación (sin `id`, el que haya; con `soloCambios`, sólo si no es de un borrado): la base
// rechazó la escritura, la anotación se borró en otra sesión o la página pasó a sólo lectura.
function retirarDeshacer(id, soloCambios) {
  if (!deshacerDe || (id && deshacerDe.id !== id) || (soloCambios && deshacerDe.tipo !== 'cambio')) return;
  var z = $('#deshacer-zona'),
    tenia = z.contains(document.activeElement);
  z.innerHTML = '';
  if (deshacerDe.tipo === 'borrado') ultimoBorrado = null;
  deshacerDe = null;
  if (tenia) $('#lectura').focus({ preventScroll: true });
}
// El foco, tras deshacer, a la anotación; si no se pudo (el panel no se ve), a la lectura.
function enfocarTrasDeshacer(id) {
  enfocar(id);
  if (document.activeElement === document.body) $('#lectura').focus({ preventScroll: true });
}
function ofrecerDeshacer(a, campos) {
  // Deshacer devuelve también la lista de campos que el lector había cambiado y la base todavía no tiene.
  ultimoBorrado = a;
  estado('Anotación borrada', true);
  mostrarDeshacer(
    a.id,
    'borrado',
    'Anotación borrada.',
    'Deshacer borrado',
    'Recuperar la anotación borrada',
    function () {
      if (ultimoBorrado) {
        if (ultimoBorrado === a && campos) SINC.campos[a.id] = Object.assign({}, campos);
        guardar(ultimoBorrado);
        ultimoBorrado = null;
        estado('Anotación recuperada');
      }
      enfocarTrasDeshacer(a.id); // el foco pasa a la anotación recuperada
    }
  );
  setTimeout(function () {
    if (ultimoBorrado === a) ultimoBorrado = null;
  }, 8000);
}
// Un cambio de color o de estado (también «Atendida» y «Reabrir» al revisar) se puede deshacer: vuelven a lo de antes
// (`antes`) los campos que siguen como el cambio los dejó (`despues`); lo que se cambió después, aquí o en otra sesión,
// no se pisa. Un borrado que se estaba ofreciendo deshacer deja de ofrecerse.
function ofrecerDeshacerCambio(id, antes, despues, texto) {
  ultimoBorrado = null;
  anunciar(texto + ' Se puede deshacer.');
  mostrarDeshacer(id, 'cambio', texto, 'Deshacer', 'Volver a como estaba', function () {
    var a = anots[id];
    if (!a || SOLO_LECTURA) {
      estado(SOLO_LECTURA ? 'Sólo lectura: no se puede deshacer' : 'La anotación ya no está: nada que deshacer', true);
      $('#lectura').focus({ preventScroll: true });
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
      estado('No se deshizo: la anotación cambió después', true);
      enfocarTrasDeshacer(id);
      return;
    }
    guardar(Object.assign({}, a, parche));
    estado('Cambio deshecho');
    anunciar('Cambio deshecho');
    enfocarTrasDeshacer(id);
  });
}
function respaldar() {
  // Una copia diaria de todas las anotaciones en la colección «respaldos», escrita después de una escritura
  // propia confirmada (nunca desde el eco de la base). Se trocea para no pasar del tamaño por documento,
  // recuerda en memoria que ya se hizo hoy y no insiste cuando la base dijo que no puede.
  if (!db || !LIBRO || SOLO_LECTURA || respaldoBloqueado) return;
  var hoy = new Date().toLocaleDateString('sv-SE'),
    clave = LOCAL_KEY + ':respaldo';
  if (respaldoHoy === hoy || lsGet(clave) === hoy || !Object.keys(anots).length) return;
  respaldoHoy = hoy;
  lsSet(clave, hoy);
  // El tope se mide como lo mide la base: bytes del documento ya envuelto. Las anotaciones van serializadas dentro de
  // una cadena, así que su JSON se escapa otra vez (cada comilla y cada salto crecen), y un carácter no latino ocupa
  // de dos a cuatro bytes. Una anotación que no cabe ni sola queda fuera del respaldo (su documento sigue guardándola).
  var todas = Object.keys(anots).map(function (k) {
      return anots[k];
    }),
    partes = [],
    actual = [],
    omitidas = 0;
  var sobre = bytesJSON({ fecha: hoy, parte: 99, partes: 99, n: 99999, anotaciones: '[]' }),
    tam = sobre;
  todas.forEach(function (a) {
    var t = bytesJSON(JSON.stringify(a)) - 2 + 1; // escapada dentro de la cadena, sin sus comillas, más la coma
    if (sobre + t > RESPALDO_MAX) {
      omitidas++;
      return;
    }
    if (actual.length && tam + t > RESPALDO_MAX) {
      partes.push(actual);
      actual = [];
      tam = sobre;
    }
    actual.push(a);
    tam += t;
  });
  if (actual.length) partes.push(actual);
  var colR = db.collection(rutaBase('respaldos')),
    respaldadas = todas.length - omitidas;
  var escrituras = partes.map(function (parte, i) {
    return enCurso(
      colR
        .doc(hoy + '-' + (i + 1))
        .set({ fecha: hoy, parte: i + 1, partes: partes.length, n: parte.length, anotaciones: JSON.stringify(parte) })
    );
  });
  Promise.all(escrituras)
    .then(function () {
      return colR
        .doc(hoy)
        .set({ fecha: hoy, libro: LIBRO.generado, n: respaldadas, partes: partes.length, omitidas: omitidas });
    })
    .catch(function (e) {
      var codigo = (e && e.code) || 'error';
      respaldoHoy = null;
      lsSet(clave, '');
      if (codigo !== 'unavailable') respaldoBloqueado = true;
      estado(
        'No se pudo escribir el respaldo diario (' + codigo + '); las anotaciones siguen guardadas una a una',
        true
      );
    });
}
