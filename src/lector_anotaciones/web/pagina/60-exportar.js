// ------------------------------------------------------------ exportar
// en el núcleo (nucleo/45-revision.js), con su par en exportar.py
(function (P, E) {
  // lo que este fragmento ofrece a los demás (las funciones se elevan: están desde el principio)
  P.textoAnotacion = textoAnotacion;
  P.copiarSeleccion = copiarSeleccion;
  P.exportarJSON = exportarJSON;
  P.exportarMD = exportarMD;
  P.diagnostico = diagnostico;
  P.copiar = copiar;
  var reabierta = P.N.reabierta,
    lineaHilo = P.N.lineaHilo,
    propuesta = P.N.propuesta;
  // Una anotación como texto breve con todo lo que hace falta para ubicarla en las fuentes:
  // sección, página, archivo:línea, la cita exacta y la nota. Es lo que se pega en el chat.
  // Lo que la base no tiene sale de la página con una señal, para que quien lo reciba sepa que no lo verá en la base.
  function senalSinGuardar(a) {
    return P.SINC.sinGuardar[a.id] ? ' · sin guardar en la base (' + P.SINC.sinGuardar[a.id] + ')' : '';
  }
  function conSenal(a) {
    return P.SINC.sinGuardar[a.id] ? Object.assign({}, a, { sin_guardar: P.SINC.sinGuardar[a.id] }) : a;
  }
  function textoAnotacion(a) {
    var tipos = { pagina: 'nota de página', capitulo: 'nota de sección', general: 'nota general' };
    // La referencia que se copia es la del bloque donde la cita está HOY (ubicar puede haberla movido tras
    // una reconstrucción); si la cita ya no está, se copia la referencia de cuando se anotó y se dice.
    var src = a.src,
      pagina = a.pagina,
      secTitulo = a.sidTitulo,
      aviso = '',
      u = E.UBIC[a.id];
    if (a.tipo === 'subrayado' && u) {
      if (u.estado === 'perdido' || !u.pid)
        aviso = ' · no encontrado en esta versión del libro; referencia de cuando se anotó';
      else {
        var n = P.$('[data-pid="' + u.pid + '"]'),
          s = P.SEC_BY_ID[P.BLOQUE_SEC[u.pid]];
        if (n) {
          src = n.getAttribute('data-src') || src;
          pagina = parseInt(n.getAttribute('data-pg') || '0', 10) || null;
        }
        if (s) secTitulo = s.titulo;
        if (u.estado === 'reubicado')
          aviso = ' · reubicado en esta versión del libro' + (a.src && a.src !== src ? ' (antes ' + a.src + ')' : '');
      }
    }
    var cab =
      '[' +
      (a.tipo === 'subrayado' ? a.color : tipos[a.tipo] || a.tipo) +
      (a.estado === 'resuelta' ? ', resuelta' : '') +
      '] ' +
      (secTitulo || 'General') +
      (pagina ? ' · p. ' + pagina : '') +
      (src ? ' · ' + src : '') +
      aviso +
      senalSinGuardar(a);
    var out = [cab];
    if (a.tipo === 'subrayado') out.push('«' + a.cita + '»');
    if (a.nota) out.push('Nota: ' + a.nota);
    if (propuesta(a)) out.push('Propuesta: «' + propuesta(a) + '»');
    (a.hilo || []).forEach(function (h) {
      out.push(lineaHilo(h));
    });
    if (a.respuesta || a.cierre)
      out.push(
        'Respuesta' +
          (a.cierre ? ' (' + a.cierre + (a.commit ? ', ' + a.commit : '') + ')' : '') +
          ': ' +
          (a.respuesta || '')
      );
    if (a.replica) out.push('Réplica: ' + a.replica);
    if (reabierta(a)) out.push('Reabierta por el autor tras la respuesta.');
    return out.join('\n');
  }
  function copiarSeleccion(boton) {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    var r = sel.getRangeAt(0),
      ex = P.extremosDeRango(r),
      pA = ex.pA,
      pB = ex.pB;
    if (!pA) return;
    var s = P.SEC_BY_ID[P.BLOQUE_SEC[pA.getAttribute('data-pid')]] || {};
    var ref =
      (s.titulo || '') +
      (pA.getAttribute('data-pg') ? ' · p. ' + pA.getAttribute('data-pg') : '') +
      ' · ' +
      pA.getAttribute('data-src') +
      (pB && pB !== pA ? ' → ' + pB.getAttribute('data-src') : '');
    // El texto sale sólo de los bloques visibles que la selección abarca, de pA a pB: entre ellos y los botones de
    // navegación están las secciones ocultas, que un triple clic en el último párrafo deja dentro del rango.
    var iA = ex.paras.indexOf(pA),
      iB = pB ? ex.paras.indexOf(pB) : iA;
    if (iA > iB) {
      var ti = iA;
      iA = iB;
      iB = ti;
    }
    var trozos = [];
    for (var i = iA; i <= iB; i++) {
      var p = ex.paras[i],
        r2 = r.cloneRange();
      if (i > iA || ex.aFuera) r2.setStart(p, 0);
      if (i < iB || ex.bFuera) r2.setEnd(p, p.childNodes.length);
      // Los marcadores del margen (número de página, «cambió») son elementos, no texto del libro: se quitan
      // de una copia de la selección, para no tocar ninguna palabra del manuscrito.
      var frag = r2.cloneContents();
      Array.prototype.slice.call(frag.querySelectorAll('.pg, .marca-cambio, .marca-anot')).forEach(function (x) {
        x.remove();
      });
      // Las listas y tablas se construyen sin texto entre ítems ni celdas; al copiar se reponen los límites:
      // un salto de línea por ítem o fila y un separador entre celdas.
      Array.prototype.slice.call(frag.querySelectorAll('li, tr')).forEach(function (x) {
        x.appendChild(document.createTextNode('\n'));
      });
      Array.prototype.slice.call(frag.querySelectorAll('td, th')).forEach(function (x) {
        if (x.nextElementSibling) x.appendChild(document.createTextNode(' · '));
      });
      trozos.push(frag.textContent || '');
    }
    var texto = trozos
      .join('\n')
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim();
    copiar('[' + ref + ']\n«' + texto + '»', boton);
  }
  // Lo que hace falta para entender un problema sin ver la pantalla: la versión, el libro, el modo, lo pendiente de
  // guardar y los fallos que la página pasó por alto. Sin el texto de las anotaciones.
  function diagnostico() {
    var meta = /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[name="generator"]')),
      L = E.LIBRO,
      sinGuardar = Object.keys(P.SINC.sinGuardar).length;
    return [
      'Diagnóstico del lector de anotaciones (' + P.ahora() + ')',
      'Página: ' + (meta ? meta.content : 'versión desconocida'),
      'Libro: ' +
        (L
          ? (L.titulo || 'sin título') + ' (' + (L.id || 'sin id') + ', generado ' + (L.generado || '¿?') + ')'
          : 'ninguno') +
        ' · origen: ' +
        E.FUENTE.tipo,
      'Modo: ' + E.modo + (E.SOLO_LECTURA ? ' · sólo lectura' : '') + (E.ME ? ' · con identidad' : ' · sin identidad'),
      'Anotaciones: ' +
        Object.keys(P.anots).length +
        ' · sin guardar: ' +
        sinGuardar +
        ' · en vuelo: ' +
        Object.keys(P.SINC.enVuelo).length +
        ' · por subir: ' +
        P.SINC.pendientes.length,
      'Navegador: ' + navigator.userAgent,
      'Fallos pasados por alto (' + P.FALLOS.length + ', del más reciente al más viejo):',
    ]
      .concat(
        P.FALLOS.length
          ? P.FALLOS.map(function (f) {
              return '- ' + f.cuando + ' · ' + f.donde + ': ' + f.error;
            })
          : ['- ninguno']
      )
      .join('\n');
  }
  function exportarJSON() {
    return JSON.stringify(
      {
        formato: 2,
        libro: P.libro().titulo,
        generado: P.libro().generado,
        exportado: P.ahora(),
        anotaciones: Object.keys(P.anots)
          .map(function (k) {
            return conSenal(P.anots[k]);
          })
          .sort(function (x, y) {
            return P.ordenKey(x) < P.ordenKey(y) ? -1 : 1;
          }),
      },
      null,
      2
    );
  }
  function exportarMD() {
    var L = Object.keys(P.anots)
      .map(function (k) {
        return P.anots[k];
      })
      .sort(function (x, y) {
        return P.ordenKey(x) < P.ordenKey(y) ? -1 : 1;
      });
    var out = ['# Anotaciones · ' + P.libro().titulo, '', 'Exportado: ' + P.ahora(), ''];
    var sec = null;
    L.forEach(function (a) {
      var st = a.sidTitulo || 'General';
      if (st !== sec) {
        sec = st;
        out.push('', '## ' + st, '');
      }
      if (a.tipo === 'subrayado')
        out.push(
          '- [' +
            a.color +
            (a.estado === 'resuelta' ? ', resuelta' : '') +
            '] p. ' +
            (a.pagina || '?') +
            ' · ' +
            a.src +
            ' · «' +
            a.cita +
            '»' +
            senalSinGuardar(a) +
            (a.nota ? '\n  - Nota: ' + a.nota.replace(/\n/g, ' ') : '') +
            (propuesta(a) ? '\n  - Propuesta: «' + propuesta(a).replace(/\n/g, ' ') + '»' : '')
        );
      else
        out.push(
          '- [' +
            a.tipo +
            (a.pagina ? ' p. ' + a.pagina : '') +
            (a.estado === 'resuelta' ? ', resuelta' : '') +
            '] ' +
            (a.nota || '(sin texto)').replace(/\n/g, ' ') +
            senalSinGuardar(a)
        );
      (a.hilo || []).forEach(function (h) {
        out.push('  - ' + lineaHilo(h));
      });
      if (a.respuesta || a.cierre)
        out.push(
          '  - Respuesta' + (a.cierre ? ' (' + a.cierre + ')' : '') + ': ' + (a.respuesta || '').replace(/\n/g, ' ')
        );
      if (a.replica) out.push('  - Réplica: ' + a.replica.replace(/\n/g, ' '));
      if (reabierta(a)) out.push('  - Reabierta por el autor tras la respuesta.');
    });
    return out.join('\n');
  }
  // El texto del botón se recuerda la primera vez: una segunda pulsación antes de que vuelva no recuerda «Copiado».
  var TEXTO_BOTON = new WeakMap();
  function copiar(txt, boton) {
    var ok = function () {
      var antes = TEXTO_BOTON.get(boton);
      if (!antes) {
        antes = { texto: boton.textContent, t: 0 };
        TEXTO_BOTON.set(boton, antes);
      }
      clearTimeout(antes.t);
      boton.textContent = 'Copiado';
      antes.t = setTimeout(function () {
        boton.textContent = antes.texto;
        TEXTO_BOTON.delete(boton);
      }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard
        .writeText(txt)
        .then(ok)
        .catch(function () {
          fallback();
        });
    else fallback();
    function fallback() {
      var ta = P.el('textarea', { style: 'position:fixed;left:-9999px' });
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        ok();
      } catch (e) {
        P.estado('Selecciona y copia manualmente el texto del cuadro', true);
        ta.style.left = '16px';
        ta.style.bottom = '16px';
        ta.style.width = '60vw';
        ta.style.height = '30vh';
        return;
      }
      ta.remove();
    }
  }
})(LAPagina, LAEstado);
