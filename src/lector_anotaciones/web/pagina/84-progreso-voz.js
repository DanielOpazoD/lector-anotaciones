  // ------------------------------------------------------------ progreso, leídas, lectura en voz alta
  function herramientasSeccion(s) {
    var cb = el('input', { type: 'checkbox', 'data-leida': s.id }); cb.checked = !!LEIDAS[s.id];
    cb.addEventListener('change', function () { LEIDAS[s.id] = cb.checked; if (!cb.checked) delete LEIDAS[s.id]; lsSet(LOCAL_KEY + ':leidas', JSON.stringify(LEIDAS)); renderProgreso(); });
    var voz = el('button', { 'class': 'btn peq', type: 'button', text: 'Escuchar', 'data-escuchar': s.id, title: 'Leer la sección en voz alta' });
    voz.addEventListener('click', function () { leerSeccion(s.id, voz); });
    var cambiados = s.bloques.filter(function (b) { return b.anterior; }).length;
    return el('div', { 'class': 'sec-herr' }, [
      el('label', {}, [cb, el('span', { text: 'Leída' })]),
      voz,
      cambiados ? el('span', { 'class': 'chip', text: cambiados + (cambiados === 1 ? ' bloque cambiado' : ' bloques cambiados') }) : null,
      el('span', { id: 'capas-' + s.id })
    ]);
  }
  function alternarLeida(sid) { var cb = $('input[data-leida="' + sid + '"]'); if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); } }
  function renderProgreso() {
    var grupo = null, cuentas = {};
    SECS.forEach(function (s) { if (s.nivel === 1) { grupo = s.id; cuentas[grupo] = { n: 0, l: 0 }; } else if (grupo) { cuentas[grupo].n++; if (LEIDAS[s.id]) cuentas[grupo].l++; } });
    $$('nav .progreso').forEach(function (p) { var c = cuentas[p.getAttribute('data-grupo')]; p.style.display = c && c.n ? '' : 'none'; if (c && c.n) { p.firstChild.style.width = Math.round(100 * c.l / c.n) + '%'; p.title = c.l + ' de ' + c.n + ' secciones leídas'; } });
    $$('nav a.sec').forEach(function (a) { a.classList.toggle('leida', !!LEIDAS[a.getAttribute('data-sid')]); });
    $$('input[data-leida]').forEach(function (cb) { cb.checked = !!LEIDAS[cb.getAttribute('data-leida')]; });
  }
  function leerSeccion(sid, boton) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { estado('Este navegador no lee en voz alta', true); return; }
    if (lectura) { var misma = lectura.sid === sid; window.speechSynthesis.cancel(); detenerLectura(); if (misma) return; }
    var s = SEC_BY_ID[sid]; if (!s) return;
    var cola = s.bloques.filter(function (b) { return b.t !== 'figure' && textoPlano(b.id).trim(); });
    var mia = { sid: sid, boton: boton, i: 0 };
    lectura = mia;
    boton.textContent = 'Detener';
    var siguiente = function () {
      if (lectura !== mia) return;  // una lectura cancelada no sigue hablando sobre la nueva
      if (mia.i >= cola.length) { detenerLectura(); return; }
      var b = cola[mia.i++], n = $('[data-pid="' + b.id + '"]');
      var u = new SpeechSynthesisUtterance(textoPlano(b.id)); u.lang = 'es';
      var voces = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices().filter(function (v) { return /^es/i.test(v.lang); }) : [];
      if (voces.length) u.voice = voces[0];
      u.onstart = function () { if (lectura !== mia) return; $$('.bloque.leyendo').forEach(function (x) { x.classList.remove('leyendo'); }); if (n) { n.classList.add('leyendo'); n.scrollIntoView({ block: 'center', behavior: 'smooth' }); } };
      u.onend = siguiente;
      u.onerror = function (ev) {
        if (lectura !== mia) return;
        var motivo = ev && ev.error;
        if (motivo === 'interrupted' || motivo === 'canceled') return;  // lo canceló la propia página
        detenerLectura(); estado('No se pudo leer en voz alta en este navegador', true);
      };
      window.speechSynthesis.speak(u);
    };
    siguiente();
  }
  function detenerLectura() {
    $$('.bloque.leyendo').forEach(function (x) { x.classList.remove('leyendo'); });
    if (lectura && lectura.boton) lectura.boton.textContent = 'Escuchar';
    lectura = null;
  }

