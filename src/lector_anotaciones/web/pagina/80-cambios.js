  // ------------------------------------------------------------ qué cambió entre versiones del libro
  var lsJSON = function (k) { try { return JSON.parse(lsGet(k) || '{}') || {}; } catch (e) { return {}; } };
  function registrarVisto(sid) {
    var s = SEC_BY_ID[sid]; if (!s) return;
    s.bloques.forEach(function (b) { if (b.h) VISTO[b.id] = b.h; });
    lsSet(LOCAL_KEY + ':visto', JSON.stringify(VISTO));
  }
  function tituloCambio(b) { return b.anterior ? 'Cambió en la última reconstrucción' + (LIBRO.anterior_generado ? ' (antes: fuentes del ' + LIBRO.anterior_generado + ')' : '') : 'Cambió desde tu última lectura'; }
  function marcarCambio(b, node) {
    var desdeUltima = VISTO[b.id] && b.h && VISTO[b.id] !== b.h;
    if (!b.anterior && !desdeUltima) return;
    node.classList.add('cambiado');
    var btn = el('button', { 'class': 'marca-cambio', type: 'button', text: 'cambió', title: tituloCambio(b) + (b.anterior ? '. Clic para ver la diferencia' : '') });
    btn.addEventListener('click', function () { alternarDiff(b.id); });
    node.insertBefore(btn, node.firstChild);
  }
  // La diferencia palabra por palabra bajo el bloque: se abre o se cierra (con `abrir`, sólo se abre).
  function alternarDiff(pid, abrir) {
    var node = $('[data-pid="' + pid + '"]'), b = BLOQUES[pid]; if (!node || !b) return;
    var ex = node.nextSibling, abierta = !!(ex && ex.classList && ex.classList.contains('diff'));
    if (abierta) { if (abrir !== true) { ex.remove(); colocarMargenPronto(); } return; }
    var d = el('div', { 'class': 'diff', 'data-de': pid }, [el('div', { 'class': 'etq', text: tituloCambio(b) })]);
    if (b.anterior) d.appendChild(renderDiff(b.anterior, textoPlano(b.id))); else d.appendChild(el('div', { text: 'No se conserva el texto anterior; vuelve a leer el bloque.' }));
    node.parentNode.insertBefore(d, node.nextSibling);
    colocarMargenPronto();
  }
  var diffPalabras = N.diffPalabras;
  function renderDiff(antes, ahora) {
    var w = el('div');
    diffPalabras(antes, ahora).forEach(function (p) { w.appendChild(p[0] === '=' ? document.createTextNode(p[1]) : el(p[0] === '-' ? 'del' : 'ins', { text: p[1] })); });
    return w;
  }

