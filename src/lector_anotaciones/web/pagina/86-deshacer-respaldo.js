  // ------------------------------------------------------------ deshacer y respaldo
  function ofrecerDeshacer(a, campos) {
    // El enlace vive en su propia zona, no en el texto de estado: el eco de la base que confirma el
    // borrado reescribe ese texto y se llevaría el enlace antes de los ocho segundos. Deshacer devuelve
    // también la lista de campos que el lector había cambiado y la base todavía no tiene.
    ultimoBorrado = a;
    estado('Anotación borrada', true);
    var z = $('#deshacer-zona'); z.innerHTML = '';
    z.appendChild(el('span', { text: 'Anotación borrada.' }));
    var u = el('button', { id: 'deshacer', 'class': 'enlace', type: 'button', text: 'Deshacer borrado', title: 'Recuperar la anotación borrada' });
    u.addEventListener('click', function () {
      if (ultimoBorrado) {
        if (ultimoBorrado === a && campos) CAMPOS_BORRADOR[a.id] = Object.assign({}, campos);
        guardar(ultimoBorrado); ultimoBorrado = null; estado('Anotación recuperada');
      }
      z.innerHTML = '';
    });
    z.appendChild(u);
    setTimeout(function () { if (ultimoBorrado === a) ultimoBorrado = null; if (z.contains(u)) z.innerHTML = ''; }, 8000);
  }
  function respaldar() {
    // Una copia diaria de todas las anotaciones en la colección «respaldos», escrita después de una escritura
    // propia confirmada (nunca desde el eco de la base). Se trocea para no pasar del tamaño por documento,
    // recuerda en memoria que ya se hizo hoy y no insiste cuando la base dijo que no puede.
    if (!db || !LIBRO || SOLO_LECTURA || respaldoBloqueado) return;
    var hoy = new Date().toLocaleDateString('sv-SE'), clave = LOCAL_KEY + ':respaldo';
    if (respaldoHoy === hoy || lsGet(clave) === hoy || !Object.keys(anots).length) return;
    respaldoHoy = hoy; lsSet(clave, hoy);
    // El tope se mide como lo mide la base: bytes del documento ya envuelto. Las anotaciones van serializadas dentro de
    // una cadena, así que su JSON se escapa otra vez (cada comilla y cada salto crecen), y un carácter no latino ocupa
    // de dos a cuatro bytes. Una anotación que no cabe ni sola queda fuera del respaldo (su documento sigue guardándola).
    var todas = Object.keys(anots).map(function (k) { return anots[k]; }), partes = [], actual = [], omitidas = 0;
    var sobre = bytesJSON({ fecha: hoy, parte: 99, partes: 99, n: 99999, anotaciones: '[]' }), tam = sobre;
    todas.forEach(function (a) {
      var t = bytesJSON(JSON.stringify(a)) - 2 + 1;  // escapada dentro de la cadena, sin sus comillas, más la coma
      if (sobre + t > RESPALDO_MAX) { omitidas++; return; }
      if (actual.length && tam + t > RESPALDO_MAX) { partes.push(actual); actual = []; tam = sobre; }
      actual.push(a); tam += t;
    });
    if (actual.length) partes.push(actual);
    var colR = db.collection('respaldos'), respaldadas = todas.length - omitidas;
    var escrituras = partes.map(function (parte, i) { return colR.doc(hoy + '-' + (i + 1)).set({ fecha: hoy, parte: i + 1, partes: partes.length, n: parte.length, anotaciones: JSON.stringify(parte) }); });
    Promise.all(escrituras).then(function () { return colR.doc(hoy).set({ fecha: hoy, libro: LIBRO.generado, n: respaldadas, partes: partes.length, omitidas: omitidas }); })
      .catch(function (e) {
        var codigo = (e && e.code) || 'error';
        respaldoHoy = null; lsSet(clave, '');
        if (codigo !== 'unavailable') respaldoBloqueado = true;
        estado('No se pudo escribir el respaldo diario (' + codigo + '); las anotaciones siguen guardadas una a una', true);
      });
  }

