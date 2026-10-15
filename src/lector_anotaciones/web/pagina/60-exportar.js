// ------------------------------------------------------------ exportar
// Respondida como atendida o descartada y devuelta por el autor desde «Por revisar» (como `reabierta` en exportar.py).
function reabierta(a) {
  return !!a.revisado && (a.cierre === 'atendida' || a.cierre === 'descartada') && a.estado !== 'resuelta';
}
// Una anotación como texto breve con todo lo que hace falta para ubicarla en las fuentes:
// sección, página, archivo:línea, la cita exacta y la nota. Es lo que se pega en el chat.
// Lo que la base no tiene sale de la página con una señal, para que quien lo reciba sepa que no lo verá en la base.
function senalSinGuardar(a) {
  return SINC.sinGuardar[a.id] ? ' · sin guardar en la base (' + SINC.sinGuardar[a.id] + ')' : '';
}
function conSenal(a) {
  return SINC.sinGuardar[a.id] ? Object.assign({}, a, { sin_guardar: SINC.sinGuardar[a.id] }) : a;
}
function textoAnotacion(a) {
  var tipos = { pagina: 'nota de página', capitulo: 'nota de sección', general: 'nota general' };
  // La referencia que se copia es la del bloque donde la cita está HOY (ubicar puede haberla movido tras
  // una reconstrucción); si la cita ya no está, se copia la referencia de cuando se anotó y se dice.
  var src = a.src,
    pagina = a.pagina,
    secTitulo = a.sidTitulo,
    aviso = '',
    u = UBIC[a.id];
  if (a.tipo === 'subrayado' && u) {
    if (u.estado === 'perdido' || !u.pid)
      aviso = ' · no encontrado en esta versión del libro; referencia de cuando se anotó';
    else {
      var n = $('[data-pid="' + u.pid + '"]'),
        s = SEC_BY_ID[BLOQUE_SEC[u.pid]];
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
    ex = extremosDeRango(r),
    pA = ex.pA,
    pB = ex.pB;
  if (!pA) return;
  var s = SEC_BY_ID[BLOQUE_SEC[pA.getAttribute('data-pid')]] || {};
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
    Array.prototype.slice.call(frag.querySelectorAll('.pg, .marca-cambio')).forEach(function (x) {
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
function exportarJSON() {
  return JSON.stringify(
    {
      libro: LIBRO.titulo,
      generado: LIBRO.generado,
      exportado: ahora(),
      anotaciones: Object.keys(anots)
        .map(function (k) {
          return conSenal(anots[k]);
        })
        .sort(function (x, y) {
          return ordenKey(x) < ordenKey(y) ? -1 : 1;
        }),
    },
    null,
    2
  );
}
function exportarMD() {
  var L = Object.keys(anots)
    .map(function (k) {
      return anots[k];
    })
    .sort(function (x, y) {
      return ordenKey(x) < ordenKey(y) ? -1 : 1;
    });
  var out = ['# Anotaciones · ' + LIBRO.titulo, '', 'Exportado: ' + ahora(), ''];
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
          (a.nota ? '\n  - Nota: ' + a.nota.replace(/\n/g, ' ') : '')
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
    if (a.respuesta || a.cierre)
      out.push(
        '  - Respuesta' + (a.cierre ? ' (' + a.cierre + ')' : '') + ': ' + (a.respuesta || '').replace(/\n/g, ' ')
      );
    if (a.replica) out.push('  - Réplica: ' + a.replica.replace(/\n/g, ' '));
    if (reabierta(a)) out.push('  - Reabierta por el autor tras la respuesta.');
  });
  return out.join('\n');
}
function copiar(txt, boton) {
  var ok = function () {
    var t = boton.textContent;
    boton.textContent = 'Copiado';
    setTimeout(function () {
      boton.textContent = t;
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
    var ta = el('textarea', { style: 'position:fixed;left:-9999px' });
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      ok();
    } catch (e) {
      estado('Selecciona y copia manualmente el texto del cuadro', true);
      ta.style.left = '16px';
      ta.style.bottom = '16px';
      ta.style.width = '60vw';
      ta.style.height = '30vh';
      return;
    }
    ta.remove();
  }
}
