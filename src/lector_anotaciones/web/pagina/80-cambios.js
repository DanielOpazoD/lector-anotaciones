// ------------------------------------------------------------ qué cambió entre versiones del libro
(function (P, E) {
  // lo que este fragmento ofrece a los demás (las funciones se elevan: están desde el principio)
  P.registrarVisto = registrarVisto;
  P.marcarCambio = marcarCambio;
  P.alternarDiff = alternarDiff;
  var lsJSON = function (k) {
    try {
      return JSON.parse(P.lsGet(k) || '{}') || {};
    } catch (e) {
      return {};
    }
  };
  P.lsJSON = lsJSON;
  function registrarVisto(sid) {
    var s = P.SEC_BY_ID[sid];
    if (!s) return;
    s.bloques.forEach(function (b) {
      if (b.h) E.VISTO[b.id] = b.h;
    });
    P.lsSet(E.LOCAL_KEY + ':visto', JSON.stringify(E.VISTO));
  }
  function tituloCambio(b) {
    return b.anterior
      ? 'Cambió en la última reconstrucción' +
          (P.libro().anterior_generado ? ' (antes: fuentes del ' + P.libro().anterior_generado + ')' : '')
      : 'Cambió desde tu última lectura';
  }
  function marcarCambio(b, node) {
    var desdeUltima = E.VISTO[b.id] && b.h && E.VISTO[b.id] !== b.h;
    if (!b.anterior && !desdeUltima) return;
    node.classList.add('cambiado');
    var btn = P.el('button', {
      'class': 'marca-cambio',
      type: 'button',
      text: 'cambió',
      title: tituloCambio(b) + (b.anterior ? '. Clic para ver la diferencia' : ''),
    });
    btn.addEventListener('click', function () {
      alternarDiff(b.id);
    });
    node.insertBefore(btn, node.firstChild);
  }
  // La diferencia palabra por palabra bajo el bloque: se abre o se cierra (con `abrir`, sólo se abre).
  function alternarDiff(pid, abrir) {
    var node = P.$('[data-pid="' + pid + '"]'),
      b = P.BLOQUES[pid];
    if (!node || !b) return;
    var ex = node.nextSibling,
      abierta = !!(ex && ex.classList && ex.classList.contains('diff'));
    if (abierta) {
      if (abrir !== true) {
        ex.remove();
        P.colocarMargenPronto();
      }
      return;
    }
    var d = P.el('div', { 'class': 'diff', 'data-de': pid }, [P.el('div', { 'class': 'etq', text: tituloCambio(b) })]);
    if (b.anterior) d.appendChild(renderDiff(b.anterior, P.textoPlano(b.id)));
    else d.appendChild(P.el('div', { text: 'No se conserva el texto anterior; vuelve a leer el bloque.' }));
    node.parentNode.insertBefore(d, node.nextSibling);
    P.colocarMargenPronto();
  }
  var diffPalabras = P.N.diffPalabras;
  P.diffPalabras = diffPalabras;
  function renderDiff(antes, ahora) {
    var w = P.el('div');
    diffPalabras(antes, ahora).forEach(function (p) {
      w.appendChild(p[0] === '=' ? document.createTextNode(p[1]) : P.el(p[0] === '-' ? 'del' : 'ins', { text: p[1] }));
    });
    return w;
  }
})(LAPagina, LAEstado);
