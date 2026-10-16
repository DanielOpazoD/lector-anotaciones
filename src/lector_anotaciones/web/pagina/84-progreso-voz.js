// ------------------------------------------------------------ progreso, leídas, lectura en voz alta
(function (P, E) {
  // lo que este fragmento ofrece a los demás (las funciones se elevan: están desde el principio)
  P.herramientasSeccion = herramientasSeccion;
  P.alternarLeida = alternarLeida;
  P.renderProgreso = renderProgreso;
  P.detenerLectura = detenerLectura;
  function herramientasSeccion(s) {
    var cb = P.el('input', { type: 'checkbox', 'data-leida': s.id });
    cb.checked = !!E.LEIDAS[s.id];
    cb.addEventListener('change', function () {
      E.LEIDAS[s.id] = cb.checked;
      if (!cb.checked) delete E.LEIDAS[s.id];
      P.lsSet(E.LOCAL_KEY + ':leidas', JSON.stringify(E.LEIDAS));
      renderProgreso();
    });
    var voz = P.el('button', {
      'class': 'btn peq',
      type: 'button',
      text: 'Escuchar',
      'data-escuchar': s.id,
      title: 'Leer la sección en voz alta',
    });
    voz.addEventListener('click', function () {
      leerSeccion(s.id, voz);
    });
    var cambiados = s.bloques.filter(function (b) {
      return b.anterior;
    }).length;
    return P.el('div', { 'class': 'sec-herr' }, [
      P.el('label', {}, [cb, P.el('span', { text: 'Leída' })]),
      voz,
      cambiados
        ? P.el('span', {
            'class': 'chip',
            text: cambiados + (cambiados === 1 ? ' bloque cambiado' : ' bloques cambiados'),
          })
        : null,
      P.el('span', { id: 'capas-' + s.id }),
    ]);
  }
  function alternarLeida(sid) {
    var cb = P.$('input[data-leida="' + sid + '"]');
    if (cb) {
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change'));
    }
  }
  function renderProgreso() {
    var grupo = null,
      cuentas = {};
    E.SECS.forEach(function (s) {
      if (s.nivel === 1) {
        grupo = s.id;
        cuentas[grupo] = { n: 0, l: 0 };
      } else if (grupo) {
        cuentas[grupo].n++;
        if (E.LEIDAS[s.id]) cuentas[grupo].l++;
      }
    });
    P.$$('nav .progreso').forEach(function (p) {
      var c = cuentas[p.getAttribute('data-grupo')];
      p.style.display = c && c.n ? '' : 'none';
      if (c && c.n) {
        p.firstChild.style.width = Math.round((100 * c.l) / c.n) + '%';
        p.title = c.l + ' de ' + c.n + ' secciones leídas';
      }
    });
    P.$$('nav a.sec').forEach(function (a) {
      a.classList.toggle('leida', !!E.LEIDAS[a.getAttribute('data-sid')]);
    });
    P.$$('input[data-leida]').forEach(function (cb) {
      cb.checked = !!E.LEIDAS[cb.getAttribute('data-leida')];
    });
  }
  function leerSeccion(sid, boton) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      P.estado('Este navegador no lee en voz alta', true);
      return;
    }
    if (E.lectura) {
      var misma = E.lectura.sid === sid;
      window.speechSynthesis.cancel();
      detenerLectura();
      if (misma) return;
    }
    var s = P.SEC_BY_ID[sid];
    if (!s) return;
    var cola = s.bloques.filter(function (b) {
      return b.t !== 'figure' && P.textoPlano(b.id).trim();
    });
    var mia = { sid: sid, boton: boton, i: 0 };
    E.lectura = mia;
    boton.textContent = 'Detener';
    var siguiente = function () {
      if (E.lectura !== mia) return; // una lectura cancelada no sigue hablando sobre la nueva
      if (mia.i >= cola.length) {
        detenerLectura();
        return;
      }
      var b = cola[mia.i++],
        n = P.$('[data-pid="' + b.id + '"]');
      var u = new SpeechSynthesisUtterance(P.textoPlano(b.id));
      u.lang = 'es';
      var voces = window.speechSynthesis.getVoices
        ? window.speechSynthesis.getVoices().filter(function (v) {
            return /^es/i.test(v.lang);
          })
        : [];
      if (voces.length) u.voice = voces[0];
      u.onstart = function () {
        if (E.lectura !== mia) return;
        P.$$('.bloque.leyendo').forEach(function (x) {
          x.classList.remove('leyendo');
        });
        if (n) {
          n.classList.add('leyendo');
          n.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      };
      u.onend = siguiente;
      u.onerror = function (ev) {
        if (E.lectura !== mia) return;
        var motivo = ev && ev.error;
        if (motivo === 'interrupted' || motivo === 'canceled') return; // lo canceló la propia página
        detenerLectura();
        P.estado('No se pudo leer en voz alta en este navegador', true);
      };
      window.speechSynthesis.speak(u);
    };
    siguiente();
  }
  function detenerLectura() {
    P.$$('.bloque.leyendo').forEach(function (x) {
      x.classList.remove('leyendo');
    });
    if (E.lectura && E.lectura.boton) E.lectura.boton.textContent = 'Escuchar';
    E.lectura = null;
  }
})(LAPagina, LAEstado);
